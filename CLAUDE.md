# CLAUDE.md

## 项目概述

这是一个 **VS Code 扩展**，使用 AI 自动生成 Git 提交消息并提交。通过分析 `git diff`，调用大语言模型（OpenAI / DeepSeek / Claude / 自定义）生成语义准确的 commit message，然后执行 `git commit`。

## 常用命令

```bash
# 代码检查（ESLint）
pnpm run lint

# 运行测试
pnpm run test

# 开发模式构建（F5 启动扩展调试）
# 打包 VS Code 扩展
pnpm run build
```

## 高层架构

### 核心模块

- `extension.js` — VS Code 扩展入口，注册命令、状态栏、核心流程编排
- `lib/config.js` — 配置管理器，读取 VS Code 设置（provider / apiKey / model 等），含默认值回退逻辑
- `lib/git.js` — Git 操作封装，执行 git 命令（获取 diff、暂存、提交）
- `lib/ai.js` — AI API 调用，构建 prompt，调用 OpenAI 兼容接口或 Claude 接口

### 配置前缀

所有 VS Code 配置项使用前缀 `gitAiAutoCommit`。

### 核心流程

1. 获取工作区 Git 根目录
2. 检查已暂存/未暂存变更
3. 如无暂存变更，提示用户是否执行 `git add -A`
4. 获取 `git diff --cached`，截断到 `maxDiffLines` 行
5. 构建 system prompt（含 commit 风格、语言指令）+ user prompt（含 diff）
6. 调用 AI API 生成 commit message
7. 直接提交，或弹出 InputBox 供用户编辑后提交

### AI Provider 支持

| Provider | API 格式 | 默认 baseUrl | 默认 model |
|----------|----------|-------------|------------|
| `openai` | OpenAI 兼容 | `https://api.openai.com/v1` | `gpt-4o-mini` |
| `deepseek` | OpenAI 兼容 | `https://api.deepseek.com/v1` | `deepseek-chat` |
| `claude` | Anthropic 原生 | `https://api.anthropic.com/v1` | `claude-3-5-sonnet-20241022` |
| `custom` | OpenAI 兼容 | 需填写 | 需填写 |

## 技术栈

- **Node.js** — 运行环境
- **pnpm** — 包管理器
- **VS Code Extension API** — 类型定义（@types/vscode）
- **ESLint** — 代码检查

## 项目文件说明

| 文件 | 说明 |
|------|------|
| `extension.js` | 扩展入口 |
| `package.json` | 项目配置和依赖定义 |
| `lib/config.js` | 配置管理器 |
| `lib/git.js` | Git 操作封装 |
| `lib/ai.js` | AI API 调用 |
| `README.md` | 项目说明 |

## 开发注意事项

- 修改配置项时，`package.json` 的 `contributes.configuration` 和 `lib/config.js` 的 `getAll()` 要同步更新
- AI 调用使用 Node.js 原生 `https` 模块，不依赖第三方 HTTP 库
- `lib/git.js` 使用 `child_process.exec` 执行 git 命令，commit message 做了 shell 转义
- commit message 风格分 `conventional`（Conventional Commits）和 `simple`（简洁）两种
- 支持 `zh`（中文）和 `en`（英文）两种提交消息语言
