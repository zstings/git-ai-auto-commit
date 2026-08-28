const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * AI 引擎：调用 AI API 生成 commit message
 */
class AIClient {
  constructor(config) {
    this.config = config;
  }

  /**
   * 构建 system prompt
   * @param {string} style - 提交风格
   * @param {string} lang - 语言
   * @returns {string} system prompt
   */
  buildSystemPrompt(style, lang) {

    const styleGuide =
      style === 'conventional'
        ? `遵循 Conventional Commits 规范，格式为：type(scope): description
可选 type: feat（新功能）、fix（修复）、docs（文档）、style（格式）、refactor（重构）、test（测试）、chore（构建/工具）、perf（性能）、ci（CI）、build（构建）
description 简洁明了，不超过 72 字符。如果变更涉及多个方面，可在 body 中列出要点。`
        : `直接描述变更内容，简洁明了，第一行不超过 72 字符。如果变更涉及多个方面，可在 body 中列出要点。`;

    const langGuide =
      lang === 'zh'
        ? '提交消息使用中文。'
        : 'Commit message in English.';

    return `你是一个专业的 Git 提交消息生成助手。根据提供的 git diff，生成一条准确的 commit message。

规则：
1. ${styleGuide}
2. ${langGuide}
3. 只返回 commit message 本身，不要包含任何解释、前后缀或 markdown 代码块标记。
4. 如果 diff 为空或无法分析，返回 "chore: 更新"。`;
  }

  /**
   * 构建 user prompt（含 diff）
   * @param {string} diff - git diff 文本
   * @param {string[]} files - 变更文件列表
   * @returns {string} user prompt
   */
  buildUserPrompt(diff, files) {
    const fileList = files.length > 0 ? `\n\n变更文件列表：\n${files.join('\n')}` : '';
    return `请分析以下 git diff，生成一条 commit message：${fileList}\n\n\`\`\`diff\n${diff}\n\`\`\``;
  }

  /**
   * 调用 AI API 生成 commit message（非流式）
   * @param {string} diff - git diff 文本
   * @param {string[]} files - 变更文件列表
   * @returns {Promise<string>} 生成的 commit message
   */
  async generateCommitMessage(diff, files) {
    return this.generateCommitMessageStream(diff, files);
  }

  /**
   * 调用 AI API 生成 commit message（流式）
   * @param {string} diff - git diff 文本
   * @param {string[]} files - 变更文件列表
   * @param {function} [onChunk] - 流式回调，每收到一段文本时调用
   * @returns {Promise<string>} 生成的 commit message
   */
  async generateCommitMessageStream(diff, files, onChunk) {
    const aiConfig = await this.config.getActiveAiConfig();
    const apiKey = aiConfig?.apiKey || '';
    const baseUrl = await this.config.getEffectiveBaseUrl(aiConfig);
    const model = await this.config.getEffectiveModel(aiConfig);
    const apiMode = await this.config.getEffectiveApiMode(aiConfig);
    const style = await this.config.get('commitStyle');
    const lang = await this.config.get('language');

    if (!apiKey) {
      throw new Error('未配置 API Key，请在配置页面中添加 AI 配置');
    }
    if (!baseUrl) {
      throw new Error('未配置 API 地址，请在配置页面中填写');
    }
    if (!model) {
      throw new Error('未配置模型名称，请在配置页面中填写');
    }

    const systemPrompt = this.buildSystemPrompt(style, lang);
    const userPrompt = this.buildUserPrompt(diff, files);

    if (apiMode === 'responses') {
      return this.callResponsesApiStream(baseUrl, apiKey, model, systemPrompt, userPrompt, onChunk);
    }
    return this.callChatCompletionsStream(baseUrl, apiKey, model, systemPrompt, userPrompt, onChunk);
  }

  /**
   * 调用 Chat Completions API（流式，兼容非流式回退）
   */
  async callChatCompletionsStream(baseUrl, apiKey, model, systemPrompt, userPrompt, onChunk) {
    const url = new URL(`${baseUrl}/chat/completions`);
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      stream: true,
    });

    const fullText = await this.httpRequestStream(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    }, (line) => {
      // 解析 Chat Completions SSE: data: {json}
      if (!line.startsWith('data: ')) return '';
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') return '';
      try {
        const data = JSON.parse(jsonStr);
        const content = data.choices?.[0]?.delta?.content || '';
        if (content && onChunk) onChunk(content);
        return content;
      } catch { return ''; }
    });

    if (!fullText) {
      throw new Error('AI 返回为空（流式）');
    }
    return this.cleanMessage(fullText);
  }

  /**
   * 调用 Responses API（流式，兼容非流式回退）
   */
  async callResponsesApiStream(baseUrl, apiKey, model, systemPrompt, userPrompt, onChunk) {
    const url = new URL(`${baseUrl}/responses`);
    const body = JSON.stringify({
      model,
      instructions: systemPrompt,
      input: userPrompt,
      temperature: 0.3,
      stream: true,
    });

    const fullText = await this.httpRequestStream(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    }, (line) => {
      // 解析 Responses API SSE
      if (!line.startsWith('data: ')) return '';
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') return '';
      try {
        const data = JSON.parse(jsonStr);
        let text = '';
        // Responses API 流式增量
        if (data.type === 'response.output_text.delta' && data.delta) {
          text = data.delta;
          if (onChunk) onChunk(text);
        }
        // 兼容 Chat Completions 格式
        const chatContent = data.choices?.[0]?.delta?.content || '';
        if (chatContent && onChunk) onChunk(chatContent);
        return text || chatContent;
      } catch { return ''; }
    });

    if (!fullText) {
      throw new Error('AI 返回为空（流式）');
    }
    return this.cleanMessage(fullText);
  }

  /**
   * 发送 HTTP 请求（Promise 封装，非流式）
   */
  httpRequest(url, options) {
    return new Promise((resolve, reject) => {
      const transport = url.protocol === 'https:' ? https : http;

      // 确保 Content-Length 被正确设置，避免 Transfer-Encoding: chunked
      const headers = { ...options.headers };
      if (options.body && !headers['Content-Length'] && !headers['content-length']) {
        headers['Content-Length'] = Buffer.byteLength(options.body);
      }

      const reqOptions = {
        method: options.method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        headers,
      };

      const req = transport.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
            return;
          }
          resolve(data);
        });
      });

      req.on('error', (err) => {
        reject(new Error(`请求失败: ${err.message}`));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  /**
   * 发送流式 HTTP 请求，逐行解析 SSE 数据
   * @param {URL} url - 请求 URL
   * @param {object} options - 请求选项 { method, headers, body }
   * @param {function} onLine - 每收到一行 SSE 数据时的回调，返回值会被累加到 fullText
   * @returns {Promise<string>} 拼接后的完整文本
   */
  httpRequestStream(url, options, onLine) {
    return new Promise((resolve, reject) => {
      const transport = url.protocol === 'https:' ? https : http;

      const headers = { ...options.headers };
      if (options.body && !headers['Content-Length'] && !headers['content-length']) {
        headers['Content-Length'] = Buffer.byteLength(options.body);
      }

      const reqOptions = {
        method: options.method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        headers,
      };

      let fullText = '';
      let buffer = '';

      const req = transport.request(reqOptions, (res) => {
        if (res.statusCode >= 400) {
          let errData = '';
          res.on('data', (chunk) => (errData += chunk));
          res.on('end', () => {
            reject(new Error(`HTTP ${res.statusCode}: ${errData.slice(0, 500)}`));
          });
          return;
        }

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (onLine) {
              const text = onLine(trimmed);
              if (text) fullText += text;
            }
          }
        });
        res.on('end', () => {
          // 处理缓冲区剩余数据
          if (buffer.trim() && onLine) {
            const text = onLine(buffer.trim());
            if (text) fullText += text;
          }
          resolve(fullText);
        });
      });

      req.on('error', (err) => {
        reject(new Error(`请求失败: ${err.message}`));
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  /**
   * 清理 AI 返回的消息（去除 markdown 代码块标记、多余空白等）
   */
  cleanMessage(content) {
    let msg = content.trim();

    // 去除 markdown 代码块标记
    msg = msg.replace(/^```[\w]*\n?/m, '').replace(/\n?```$/m, '');

    // 去除首尾引号
    msg = msg.replace(/^["'`]+|["'`]+$/g, '');

    return msg.trim();
  }
}

module.exports = AIClient;
