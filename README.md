# Git AI Auto Commit

使用 AI 自动生成 Git 提交消息，写入 VS Code 原生 SCM 输入框，由你检查后手动提交。

支持 OpenAI、DeepSeek、Anthropic Claude 以及任意 OpenAI 兼容 API，支持本地代理。

## 功能特性

- **AI 生成提交消息** — 分析 `git diff`，调用大语言模型生成语义准确的 commit message
- **流式逐字写入** — AI 生成内容实时写入 VS Code 原生 SCM 提交输入框，打字机效果
- **不自动提交** — 消息只写入输入框，由你检查、编辑后手动点击提交
- **可自定义提交规则** — 内置 Conventional Commits 规则，支持在配置面板自由编辑
- **多 API 协议支持** — Chat Completions、Responses、Anthropic Messages 三种模式
- **多配置管理** — 可保存多套 AI 配置，一键切换
- **中英文切换** — 支持中文或英文提交消息
- **源代码管理面板集成** — 在 VS Code 内置 Git 面板标题栏添加 ✨ 按钮
- **侧边栏配置面板** — 活动栏图标打开配置页面，可视化管理

## 使用方法

### 源代码管理面板（推荐）

1. 打开 VS Code 左侧的源代码管理面板（`Ctrl+Shift+G`）
2. 暂存你的变更（`git add`）
3. 点击面板标题栏的 ✨ 按钮
4. AI 分析 `git diff`，逐字写入提交消息输入框
5. 检查、编辑后，点击原生的 ✅ 提交按钮提交

### 命令面板

按 `Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（macOS）打开命令面板，输入：

| 命令 | 说明 |
|------|------|
| AI 生成提交消息到输入框 | 生成消息并写入 SCM 输入框（推荐） |
| AI 生成提交消息并直接提交 | 生成消息后直接 `git commit` |
| 打开配置页面 | 打开侧边栏配置面板 |

### 侧边栏配置面板

点击活动栏中的 Git AI Auto Commit 图标，打开配置页面：

- **AI 配置管理** — 添加、编辑、删除多套 AI 配置，一键切换活跃配置
- **提交规则** — 可编辑的文本框，内置 Conventional Commits 规则，自由修改
- **提交偏好** — 语言、最大 diff 行数、自动暂存等选项

## 配置

所有配置通过侧边栏配置面板管理，存储在 VS Code globalState 中，无需手动编辑 `settings.json`。

### AI 配置

每套 AI 配置包含以下字段：

| 字段 | 说明 |
|------|------|
| 名称 | 配置标识，如"我的 DeepSeek" |
| API Key | AI 服务的密钥 |
| API 地址 | API 基础地址，如 `https://api.deepseek.com/v1` |
| 模型名称 | 模型标识，如 `deepseek-chat` |
| API 模式 | Chat Completions / Responses / Anthropic |

### API 模式说明

| 模式 | 端点 | 适用场景 |
|------|------|---------|
| Chat Completions | `/chat/completions` | OpenAI 兼容服务（DeepSeek、中转等），默认推荐 |
| Responses | `/responses` | OpenAI 新模型 |
| Anthropic | `/v1/messages` | Anthropic Claude 原生协议，兼容本地代理 |

### 提交偏好

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `language` | `"zh"` | 提交消息语言：`zh`（中文）/ `en`（英文） |
| `commitStyleRule` | Conventional Commits 规则 | 提交规则，AI 按此规则生成 commit message，可在配置面板自由编辑 |
| `maxDiffLines` | `1000` | 发送给 AI 的最大 diff 行数（超出截断） |
| `autoStageAll` | `false` | 提交前自动执行 `git add -A` |
| `showNotifications` | `true` | 显示操作完成通知 |

## 工作原理

1. 获取当前工作区 Git 仓库的已暂存变更（`git diff --cached`）
2. 如无暂存变更，提示用户是否执行 `git add -A`
3. 将 diff 和文件列表发送给 AI，流式生成 commit message
4. 逐字写入 VS Code 原生 SCM 提交输入框
5. 你检查、编辑后，用原生方式提交

## 项目结构

```
git-ai-auto-commit/
├── extension.js           # 扩展主入口，命令注册、流程编排
├── lib/
│   ├── ai.js              # AI API 调用（流式 + 非流式回退）
│   ├── config.js          # 配置管理器
│   ├── configProvider.js  # 多配置存储管理
│   ├── git.js             # Git 操作封装
│   └── webviewProvider.js # 侧边栏配置面板
├── package.json           # 扩展配置
└── README.md              # 本文档
```

## 开发

```bash
# 代码检查
pnpm run lint

# 运行测试
pnpm run test

# 开发模式（F5 启动扩展调试）
# 打包 VS Code 扩展
pnpm run build
```

## 许可证

MIT License
