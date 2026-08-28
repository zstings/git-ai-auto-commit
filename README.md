# Git AI Auto Commit

使用 AI 自动生成 Git 提交消息并提交的 VS Code 扩展。

支持 OpenAI、DeepSeek、Anthropic Claude 以及任意 OpenAI 兼容 API。

## 功能特性

- **AI 自动生成提交消息** — 分析 `git diff`，调用大语言模型生成语义准确的 commit message
- **Conventional Commits** — 默认遵循 `feat:` / `fix:` / `docs:` 等规范，也可切换为简洁风格
- **中英文切换** — 支持中文或英文提交消息
- **多 Provider 支持** — OpenAI、DeepSeek、Claude、自定义 OpenAI 兼容接口
- **一键提交** — 生成后直接 `git commit`，或仅生成消息供编辑后再提交
- **源代码管理面板集成** — 在 VS Code 内置 Git 管理面板标题栏添加 ✨ 按钮，点击后 AI 生成消息并填入原生的提交输入框
- **状态栏快捷入口** — 右下角一键触发

## 使用方法

### 命令面板

按 `Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（macOS）打开命令面板，输入：

- **Git AI Auto Commit: AI 生成提交消息并提交** — 生成消息并直接提交
- **Git AI Auto Commit: 仅 AI 生成提交消息（不提交）** — 生成消息后弹出编辑框，确认后再提交
- **Git AI Auto Commit: AI 生成提交消息到输入框** — 生成消息并填入源代码管理面板的提交输入框
- **Git AI Auto Commit: 打开配置** — 打开设置页面

### 源代码管理面板（推荐）

打开 VS Code 左侧的源代码管理面板（`Ctrl+Shift+G`），在标题栏会看到一个 ✨ 按钮。点击后：

1. AI 分析当前已暂存的 `git diff`
2. 生成 commit message
3. 自动填入面板顶部的提交消息输入框
4. 你可以检查、编辑后，点击原生的 ✅ 提交按钮提交

### 状态栏

点击右下角 `$(git-commit) AI Commit` 按钮可快速触发"生成并提交"。

## 配置选项

在 VS Code 设置中搜索 `gitAiAutoCommit` 可以找到以下配置：

### AI 服务配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `apiProvider` | `"deepseek"` | AI 服务提供商：`openai` / `deepseek` / `claude` / `custom` |
| `apiKey` | `""` | 对应 API 的 Key（必填） |
| `baseUrl` | `""` | 自定义 API 基础地址（留空则使用 provider 默认地址） |
| `model` | `""` | 模型名称（留空则使用 provider 默认模型） |

**各 Provider 默认值：**

| Provider | 默认 baseUrl | 默认 model |
|----------|-------------|------------|
| `openai` | `https://api.openai.com/v1` | `gpt-4o-mini` |
| `deepseek` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| `claude` | `https://api.anthropic.com/v1` | `claude-3-5-sonnet-20241022` |
| `custom` | 需填写 | 需填写 |

### 提交行为配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `language` | `"zh"` | 提交消息语言：`zh`（中文）/ `en`（英文） |
| `commitStyleRule` | Conventional Commits 规则 | 提交规则，AI 按此规则生成 commit message，可在配置页面自由编辑 |
| `maxDiffLines` | `500` | 发送给 AI 的最大 diff 行数（超出截断） |
| `autoStageAll` | `false` | 提交前自动执行 `git add -A` |
| `showNotifications` | `true` | 显示操作完成通知 |

### 配置示例

```json
{
  "gitAiAutoCommit.apiProvider": "deepseek",
  "gitAiAutoCommit.apiKey": "sk-xxxxxxxxxxxx",
  "gitAiAutoCommit.language": "zh"
}
```

使用自定义 OpenAI 兼容接口：

```json
{
  "gitAiAutoCommit.apiProvider": "custom",
  "gitAiAutoCommit.apiKey": "your-api-key",
  "gitAiAutoCommit.baseUrl": "https://your-api-endpoint.com/v1",
  "gitAiAutoCommit.model": "your-model-name"
}
```

## 工作原理

1. 获取当前工作区 Git 仓库的已暂存变更（`git diff --cached`）
2. 如无暂存变更，提示用户是否执行 `git add -A`
3. 将 diff 和文件列表发送给 AI，生成 commit message
4. 根据命令不同：
   - **生成并提交** — 直接执行 `git commit`
   - **仅生成** — 弹出编辑框，确认后提交
   - **生成到输入框** — 写入 VS Code 源代码管理面板的提交输入框，用户用原生方式提交

## 项目结构

```
git-ai-auto-commit/
├── lib/
│   ├── config.js     # 配置管理器
│   ├── git.js        # Git 操作封装
│   └── ai.js         # AI API 调用
├── extension.js      # 扩展主入口
├── package.json      # 扩展配置
└── README.md         # 本文档
```

## 开发

```bash
# 代码检查
pnpm run lint

# 开发模式（F5 启动扩展调试）
# 打包
pnpm run build
```

## 许可证

MIT License
