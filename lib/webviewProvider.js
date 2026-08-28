const vscode = require('vscode');

/**
 * Webview 配置面板提供器
 * 在侧边栏显示配置页面，支持管理多个 AI 配置和提交偏好
 */
class ConfigViewProvider {
  constructor(context, configProvider) {
    this.context = context;
    this.configProvider = configProvider;
    this.view = null;
    this._disposables = [];
  }

  /**
   * 注册为 WebviewViewProvider
   */
  register() {
    const provider = this;
    const disposable = vscode.window.registerWebviewViewProvider(
      'gitAiAutoCommit.configView',
      {
        resolveWebviewView(webviewView) {
          provider.view = webviewView;
          webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [],
          };
          webviewView.webview.html = provider.getHtml();
          provider._setupMessageHandler(webviewView.webview);
          // 初始加载数据
          provider._refresh();
        },
      },
      {
        webviewOptions: { retainContextWhenHidden: true },
      }
    );
    return disposable;
  }

  /**
   * 刷新面板数据（发送当前配置和偏好到前端）
   */
  async _refresh() {
    if (!this.view) return;
    const configs = await this.configProvider.getAll();
    const activeId = await this.configProvider.getActiveId();
    const prefs = await this.configProvider.getPreferences();

    this.view.webview.postMessage({
      type: 'refresh',
      data: { configs, activeId, prefs },
    });
  }

  /**
   * 处理来自 Webview 的消息
   */
  _setupMessageHandler(webview) {
    const disposable = webview.onDidReceiveMessage(async (message) => {
      try {
        switch (message.type) {
          case 'getInitialData': {
            await this._refresh();
            break;
          }
          case 'addConfig': {
            await this.configProvider.add(message.data);
            await this._refresh();
            break;
          }
          case 'updateConfig': {
            await this.configProvider.update(message.data.id, message.data);
            await this._refresh();
            break;
          }
          case 'deleteConfig': {
            await this.configProvider.remove(message.data.id);
            await this._refresh();
            break;
          }
          case 'setActive': {
            await this.configProvider.setActive(message.data.id);
            await this._refresh();
            break;
          }
          case 'updatePrefs': {
            await this.configProvider.updatePreferences(message.data);
            await this._refresh();
            break;
          }
          case 'testConfig': {
            await this._testConfig(message.data);
            break;
          }
        }
      } catch (err) {
        webview.postMessage({ type: 'error', message: err.message });
      }
    });
    this._disposables.push(disposable);
  }

  /**
   * 测试 AI 配置连通性
   */
  async _testConfig(config) {
    if (!this.view) return;

    const https = require('https');
    const http = require('http');
    const { URL } = require('url');

    const baseUrl = this.configProvider.getEffectiveBaseUrl(config);
    const model = this.configProvider.getEffectiveModel(config);
    const apiMode = config.apiMode || 'chat';

    let urlPath, body, headers;
    if (apiMode === 'responses') {
      urlPath = '/responses';
      body = JSON.stringify({
        model,
        instructions: 'You are a test assistant.',
        input: 'Say "OK" in one word.',
      });
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}`, 'Accept-Encoding': 'identity' };
    } else if (apiMode === 'anthropic') {
      urlPath = baseUrl.endsWith('/v1') || baseUrl.includes('/v1/') ? '/messages' : '/v1/messages';
      body = JSON.stringify({
        model,
        system: 'You are a test assistant.',
        messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
        max_tokens: 10,
      });
      headers = { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, Authorization: `Bearer ${config.apiKey}`, 'anthropic-version': '2023-06-01', 'Accept-Encoding': 'identity' };
    } else {
      urlPath = '/chat/completions';
      body = JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a test assistant.' },
          { role: 'user', content: 'Say "OK" in one word.' },
        ],
      });
      headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}`, 'Accept-Encoding': 'identity' };
    }

    const url = new URL(`${baseUrl}${urlPath}`);

    // 确保 Content-Length 被正确设置，避免 Transfer-Encoding: chunked
    headers['Content-Length'] = Buffer.byteLength(body);

    try {
      const transport = url.protocol === 'https:' ? https : http;
      const responseData = await new Promise((resolve, reject) => {
        const req = transport.request(
          {
            method: 'POST',
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            headers,
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              if (res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
                return;
              }
              resolve(data);
            });
          }
        );
        req.on('error', (err) => reject(new Error(err.message)));
        req.write(body);
        req.end();
      });

      this.view.webview.postMessage({ type: 'testResult', success: true, message: '连接成功！' });
    } catch (err) {
      this.view.webview.postMessage({ type: 'testResult', success: false, message: err.message });
    }
  }

  /**
   * 生成 HTML 页面
   */
  getHtml() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --list-hover: var(--vscode-list-hoverBackground);
    --accent: var(--vscode-foreground);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: 13px;
    color: var(--fg);
    background: var(--bg);
    padding: 8px;
  }
  .section { margin-bottom: 16px; }
  .section-title {
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 600;
    opacity: 0.8;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--border);
  }
  .config-item {
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .config-item:hover { background: var(--list-hover); }
  .config-item.active { border-color: var(--btn-bg); }
  .config-item .radio {
    width: 14px; height: 14px;
    border: 2px solid var(--fg);
    border-radius: 50%;
    flex-shrink: 0;
    position: relative;
  }
  .config-item.active .radio::after {
    content: '';
    position: absolute;
    top: 2px; left: 2px;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--btn-bg);
  }
  .config-item .name { flex: 1; font-weight: 500; }
  .config-item .meta { font-size: 11px; opacity: 0.6; }
  .config-item .actions { display: flex; gap: 4px; }
  .config-item .actions button {
    background: none; border: none; color: var(--fg);
    cursor: pointer; padding: 2px 4px; opacity: 0.6;
    font-size: 13px;
  }
  .config-item .actions button:hover { opacity: 1; }
  .btn {
    background: var(--btn-bg); color: var(--btn-fg);
    border: none; padding: 5px 12px; border-radius: 3px;
    cursor: pointer; font-size: 12px;
  }
  .btn:hover { background: var(--btn-hover); }
  .btn-secondary {
    background: none; color: var(--fg);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover { background: var(--list-hover); }
  .form-group { margin-bottom: 10px; }
  .form-group label { display: block; margin-bottom: 4px; font-size: 12px; opacity: 0.8; }
  input, select {
    width: 100%; padding: 4px 8px;
    background: var(--input-bg); color: var(--input-fg);
    border: 1px solid var(--border); border-radius: 2px;
    font-size: 12px; font-family: inherit;
  }
  input:focus, select:focus { outline: 1px solid var(--btn-bg); }
  .form-row { display: flex; gap: 8px; }
  .form-row > * { flex: 1; }
  .modal-overlay {
    display: none;
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4);
    z-index: 100;
    align-items: center; justify-content: center;
  }
  .modal-overlay.show { display: flex; }
  .modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
    width: 90%; max-width: 420px;
  }
  .modal h3 { margin-bottom: 12px; font-size: 14px; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
  .hint { font-size: 11px; opacity: 0.5; margin-top: 2px; }
  .empty { text-align: center; padding: 20px; opacity: 0.5; }
  .test-result {
    font-size: 12px; padding: 6px 8px; border-radius: 3px;
    margin-top: 8px; display: none;
  }
  .test-result.show { display: block; }
  .test-result.success { background: rgba(76,175,80,0.15); color: #4caf50; }
  .test-result.error { background: rgba(244,67,54,0.15); color: #f44336; }
  .confirm-overlay {
    display: none;
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4);
    z-index: 200;
    align-items: center; justify-content: center;
  }
  .confirm-overlay.show { display: flex; }
  .confirm-box {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
    width: 90%; max-width: 320px;
    text-align: center;
  }
  .confirm-box p { margin-bottom: 12px; font-size: 13px; }
  .confirm-box .confirm-actions {
    display: flex; gap: 8px; justify-content: center;
  }
</style>
</head>
<body>
  <div class="section">
    <div class="section-title">AI 配置</div>
    <div id="configList"></div>
    <button class="btn btn-secondary" style="width:100%;margin-top:6px" onclick="openAddModal()">+ 添加配置</button>
  </div>

  <div class="section">
    <div class="section-title">提交偏好</div>
    <div class="form-group">
      <label>提交消息语言</label>
      <select id="language">
        <option value="zh">中文</option>
        <option value="en">英文</option>
      </select>
    </div>
    <div class="form-group">
      <label>提交规则</label>
      <textarea id="commitStyleRule" rows="5" style="width:100%;font-family:inherit;font-size:12px;resize:vertical;background:var(--input-bg);color:var(--input-fg);border:1px solid var(--border);border-radius:2px;padding:4px 8px;"></textarea>
      <div class="hint">AI 将按照此规则生成 commit message，可自由编辑</div>
    </div>
    <div class="form-group">
      <label>最大 diff 行数</label>
      <input type="number" id="maxDiffLines" value="500" min="50" max="5000" />
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="autoStageAll" style="width:auto" /> 提交前自动 git add -A
      </label>
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="showNotifications" style="width:auto" /> 显示操作通知
      </label>
    </div>
    <button class="btn" style="width:100%" onclick="savePrefs()">保存偏好</button>
  </div>

  <!-- 删除确认弹窗 -->
  <div class="confirm-overlay" id="confirmOverlay">
    <div class="confirm-box">
      <p id="confirmText">确定删除这个配置吗？</p>
      <div class="confirm-actions">
        <button class="btn btn-secondary" onclick="closeConfirm()">取消</button>
        <button class="btn" id="confirmOkBtn">确定</button>
      </div>
    </div>
  </div>

  <!-- 添加/编辑配置 Modal -->
  <div class="modal-overlay" id="configModal">
    <div class="modal">
      <h3 id="modalTitle">添加配置</h3>
      <input type="hidden" id="editId" />
      <div class="form-group">
        <label>名称</label>
        <input type="text" id="configName" placeholder="如：我的 DeepSeek" />
      </div>
      <div class="form-group">
        <label>API Key *</label>
        <input type="password" id="configApiKey" placeholder="sk-xxxxxxxxxxxx" />
      </div>
      <div class="form-group">
        <label>API 地址 * <span class="hint">如 https://api.deepseek.com/v1</span></label>
        <input type="text" id="configBaseUrl" placeholder="https://api.example.com/v1" />
      </div>
      <div class="form-group">
        <label>模型名称 *</label>
        <input type="text" id="configModel" placeholder="如 deepseek-chat" />
      </div>
      <div class="form-group">
        <label>API 模式</label>
        <select id="configApiMode">
          <option value="chat">Chat Completions（/chat/completions）</option>
          <option value="responses">Responses（/responses）</option>
          <option value="anthropic">Anthropic（/messages）</option>
        </select>
        <div class="hint">OpenAI 兼容用 Chat Completions，OpenAI 新模型用 Responses，Claude 用 Anthropic</div>
      </div>
      <div class="test-result" id="testResult"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">取消</button>
        <button class="btn btn-secondary" onclick="testConfig()">测试连接</button>
        <button class="btn" onclick="saveConfig()">保存</button>
      </div>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  let configs = [];
  let activeId = null;

  // ─── 接收消息 ───
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'refresh': {
        configs = msg.data.configs;
        activeId = msg.data.activeId;
        renderConfigList();
        renderPrefs(msg.data.prefs);
        break;
      }
      case 'testResult': {
        const el = document.getElementById('testResult');
        el.textContent = msg.success ? '✓ ' + msg.message : '✗ ' + msg.message;
        el.className = 'test-result show ' + (msg.success ? 'success' : 'error');
        break;
      }
      case 'error': {
        vscode.postMessage({ type: 'showError', message: msg.message });
        break;
      }
    }
  });

  // ─── 渲染配置列表 ───
  function renderConfigList() {
    const list = document.getElementById('configList');
    if (configs.length === 0) {
      list.innerHTML = '<div class="empty">还没有配置，点击下方按钮添加</div>';
      return;
    }
    list.innerHTML = configs.map(c => {
      const isActive = c.id === activeId;
      return '<div class="config-item ' + (isActive ? 'active' : '') + '" onclick="setActive(\\''+c.id+'\\')">'
        + '<div class="radio"></div>'
        + '<div class="name">' + escapeHtml(c.name) + '</div>'
        + '<div class="meta">' + escapeHtml(c.model || '') + (c.apiMode === 'responses' ? ' · Responses' : c.apiMode === 'anthropic' ? ' · Anthropic' : '') + '</div>'
        + '<div class="actions">'
        + '<button title="编辑" onclick="event.stopPropagation();editConfig(\\''+c.id+'\\')">&#9998;</button>'
        + '<button title="删除" onclick="event.stopPropagation();deleteConfig(\\''+c.id+'\\')">&#10006;</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  // ─── 渲染偏好 ───
  function renderPrefs(prefs) {
    document.getElementById('language').value = prefs.language || 'zh';
    document.getElementById('commitStyleRule').value = prefs.commitStyleRule || '';
    document.getElementById('maxDiffLines').value = prefs.maxDiffLines || 500;
    document.getElementById('autoStageAll').checked = prefs.autoStageAll || false;
    document.getElementById('showNotifications').checked = prefs.showNotifications !== false;
  }

  // ─── 设置活跃配置 ───
  function setActive(id) {
    vscode.postMessage({ type: 'setActive', data: { id } });
  }

  // ─── 添加配置 Modal ───
  function openAddModal() {
    document.getElementById('modalTitle').textContent = '添加配置';
    document.getElementById('editId').value = '';
    document.getElementById('configName').value = '';
    document.getElementById('configApiKey').value = '';
    document.getElementById('configBaseUrl').value = '';
    document.getElementById('configModel').value = '';
    document.getElementById('configApiMode').value = 'chat';
    document.getElementById('testResult').className = 'test-result';
    document.getElementById('configModal').classList.add('show');
    document.getElementById('configName').focus();
  }

  // ─── 编辑配置 ───
  function editConfig(id) {
    const c = configs.find(x => x.id === id);
    if (!c) return;
    document.getElementById('modalTitle').textContent = '编辑配置';
    document.getElementById('editId').value = c.id;
    document.getElementById('configName').value = c.name;
    document.getElementById('configApiKey').value = c.apiKey;
    document.getElementById('configBaseUrl').value = c.baseUrl;
    document.getElementById('configModel').value = c.model;
    document.getElementById('configApiMode').value = c.apiMode || 'chat';
    document.getElementById('testResult').className = 'test-result';
    document.getElementById('configModal').classList.add('show');
  }

  // ─── 关闭 Modal ───
  function closeModal() {
    document.getElementById('configModal').classList.remove('show');
  }

  // ─── 删除配置（自定义确认弹窗） ───
  let pendingDeleteId = null;
  function deleteConfig(id) {
    pendingDeleteId = id;
    document.getElementById('confirmOverlay').classList.add('show');
  }
  function closeConfirm() {
    pendingDeleteId = null;
    document.getElementById('confirmOverlay').classList.remove('show');
  }
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    if (pendingDeleteId) {
      vscode.postMessage({ type: 'deleteConfig', data: { id: pendingDeleteId } });
    }
    closeConfirm();
  });

  // ─── 保存配置（添加或编辑） ───
  function saveConfig() {
    const id = document.getElementById('editId').value;
    const data = {
      name: document.getElementById('configName').value.trim() || '未命名',
      apiKey: document.getElementById('configApiKey').value.trim(),
      baseUrl: document.getElementById('configBaseUrl').value.trim(),
      model: document.getElementById('configModel').value.trim(),
      apiMode: document.getElementById('configApiMode').value,
    };
    if (!data.apiKey) { alert('请填写 API Key'); return; }
    if (!data.baseUrl) { alert('请填写 API 地址'); return; }
    if (!data.model) { alert('请填写模型名称'); return; }
    if (id) {
      data.id = id;
      vscode.postMessage({ type: 'updateConfig', data });
    } else {
      vscode.postMessage({ type: 'addConfig', data });
    }
    closeModal();
  }

  // ─── 测试连接 ───
  function testConfig() {
    const data = {
      name: document.getElementById('configName').value.trim(),
      apiKey: document.getElementById('configApiKey').value.trim(),
      baseUrl: document.getElementById('configBaseUrl').value.trim(),
      model: document.getElementById('configModel').value.trim(),
      apiMode: document.getElementById('configApiMode').value,
    };
    if (!data.apiKey) { alert('请填写 API Key'); return; }
    if (!data.baseUrl) { alert('请填写 API 地址'); return; }
    if (!data.model) { alert('请填写模型名称'); return; }
    const el = document.getElementById('testResult');
    el.textContent = '测试中...';
    el.className = 'test-result show';
    vscode.postMessage({ type: 'testConfig', data });
  }

  // ─── 保存偏好 ───
  function savePrefs() {
    const data = {
      language: document.getElementById('language').value,
      commitStyleRule: document.getElementById('commitStyleRule').value,
      maxDiffLines: parseInt(document.getElementById('maxDiffLines').value, 10) || 500,
      autoStageAll: document.getElementById('autoStageAll').checked,
      showNotifications: document.getElementById('showNotifications').checked,
    };
    vscode.postMessage({ type: 'updatePrefs', data });
  }

  // ─── HTML 转义 ───
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── 初始加载 ───
  vscode.postMessage({ type: 'getInitialData' });
</script>
</body>
</html>`;
  }

  dispose() {
    this._disposables.forEach((d) => d.dispose());
  }
}

module.exports = ConfigViewProvider;
