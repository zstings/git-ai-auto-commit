const vscode = require('vscode');
const ConfigManager = require('./lib/config');
const ConfigProvider = require('./lib/configProvider');
const ConfigViewProvider = require('./lib/webviewProvider');
const GitOps = require('./lib/git');
const AIClient = require('./lib/ai');

/**
 * 扩展激活时调用
 */
async function activate(context) {
  console.log('Git AI Auto Commit 扩展已激活');

  // ─── 多配置管理器 ───
  const configProvider = new ConfigProvider(context);

  // ─── 配置管理器（从活跃配置读取） ───
  const config = new ConfigManager(configProvider);

  // ─── Git 操作 ───
  const gitOps = new GitOps();

  // ─── AI 客户端 ───
  const aiClient = new AIClient(config);

  // ─── 侧边栏 Webview 配置面板 ───
  const viewProvider = new ConfigViewProvider(context, configProvider);
  context.subscriptions.push(viewProvider.register());

  // ─── 状态栏 ───
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(git-commit) AI Commit';
  statusBarItem.tooltip = 'Git AI Auto Commit';
  statusBarItem.command = 'gitAiAutoCommit.generateToScm';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ─── 命令：AI 生成提交消息并直接提交 ───
  context.subscriptions.push(
    vscode.commands.registerCommand('gitAiAutoCommit.generateAndCommit', async () => {
      await runGenerateAndCommit(gitOps, aiClient, config, { autoCommit: true });
    })
  );

  // ─── 命令：AI 生成提交消息到 SCM 输入框 ───
  context.subscriptions.push(
    vscode.commands.registerCommand('gitAiAutoCommit.generateToScm', async () => {
      await runGenerateAndCommit(gitOps, aiClient, config, { autoCommit: false });
    })
  );

  // ─── 命令：打开 VS Code 设置页 ───
  context.subscriptions.push(
    vscode.commands.registerCommand('gitAiAutoCommit.openConfig', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'gitAiAutoCommit');
    })
  );

  // ─── 命令：打开配置页面（聚焦侧边栏视图） ───
  context.subscriptions.push(
    vscode.commands.registerCommand('gitAiAutoCommit.openConfigPage', () => {
      vscode.commands.executeCommand('gitAiAutoCommit.configView.focus');
    })
  );
}

/**
 * 获取 VS Code 内置 Git 扩展的 API
 * @returns {Promise<object|null>}
 */
async function getGitApi() {
  try {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) return null;
    if (!gitExtension.isActive) {
      await gitExtension.activate();
    }
    const gitExt = gitExtension.exports;
    if (!gitExt || !gitExt.getAPI) return null;
    const gitApi = gitExt.getAPI(1);
    if (!gitApi || !gitApi.repositories || gitApi.repositories.length === 0) {
      return null;
    }
    return gitApi;
  } catch (err) {
    console.error('获取 Git API 失败:', err);
    return null;
  }
}

/**
 * 写入 VS Code 内置 Git 扩展的 SCM 输入框
 * @param {string} message - 要写入的提交消息
 * @returns {Promise<boolean>} 是否成功
 */
async function writeToScmInputBox(message) {
  const gitApi = await getGitApi();
  if (!gitApi) return false;
  const repo = gitApi.repositories[0];
  if (repo && repo.inputBox) {
    repo.inputBox.value = message;
    return true;
  }
  return false;
}

/**
 * 核心流程：获取 diff → AI 生成消息 → 直接提交或写入 SCM 输入框
 * @param {boolean} options.autoCommit - true: 直接提交; false: 写入 SCM 输入框供用户编辑
 */
async function runGenerateAndCommit(gitOps, aiClient, config, options) {
  const { autoCommit } = options;
  const showNotifications = await config.get('showNotifications');

  try {
    const root = await gitOps.getRoot();
    if (!root) {
      vscode.window.showErrorMessage('当前工作区不是 Git 仓库');
      return;
    }

    const hasStaged = await gitOps.hasStagedChanges(root);
    const hasUnstaged = await gitOps.hasUnstagedChanges(root);
    const autoStageAll = await config.get('autoStageAll');

    if (!hasStaged && !hasUnstaged) {
      vscode.window.showInformationMessage('没有检测到任何代码变更');
      return;
    }

    if (!hasStaged && hasUnstaged) {
      if (autoStageAll) {
        const success = await gitOps.stageAll(root);
        if (!success) {
          vscode.window.showErrorMessage('git add -A 失败');
          return;
        }
      } else {
        const choice = await vscode.window.showWarningMessage(
          '没有已暂存的变更。是否暂存所有变更？',
          '暂存全部',
          '取消'
        );
        if (choice !== '暂存全部') return;
        const success = await gitOps.stageAll(root);
        if (!success) {
          vscode.window.showErrorMessage('git add -A 失败');
          return;
        }
      }
    }

    const maxDiffLines = (await config.get('maxDiffLines')) || 500;
    const diff = await gitOps.getStagedDiff(root, maxDiffLines);
    if (!diff) {
      vscode.window.showInformationMessage('已暂存的内容为空');
      return;
    }

    const files = await gitOps.getChangedFiles(root);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'AI 正在生成提交消息...',
        cancellable: false,
      },
      async () => {
        try {
          if (autoCommit) {
            // 直接提交（非流式）
            const message = await aiClient.generateCommitMessage(diff, files);
            console.log('AI 生成的 commit message:', message);
            const success = await gitOps.commit(root, message);
            if (success) {
              if (showNotifications) {
                vscode.window.showInformationMessage(`提交成功: ${message}`);
              }
            } else {
              vscode.window.showErrorMessage('git commit 失败');
            }
          } else {
            // 流式写入 SCM 输入框
            const gitApi = await getGitApi();
            if (!gitApi) {
              vscode.window.showWarningMessage('无法写入 SCM 输入框，请确保已打开源代码管理面板');
              return;
            }
            const repo = gitApi.repositories[0];
            if (!repo || !repo.inputBox) {
              vscode.window.showWarningMessage('无法写入 SCM 输入框，请确保已打开源代码管理面板');
              return;
            }

            // 先清空输入框
            repo.inputBox.value = '';
            let accumulated = '';
            let pendingFlush = false;

            const flushToInputBox = () => {
              pendingFlush = false;
              repo.inputBox.value = accumulated;
            };

            const message = await aiClient.generateCommitMessageStream(diff, files, (chunk) => {
              accumulated += chunk;
              // 异步节流写入，让 VS Code 有机会逐字渲染
              if (!pendingFlush) {
                pendingFlush = true;
                setTimeout(flushToInputBox, 16); // ~60fps
              }
            });

            // 流结束后用清理后的消息替换
            repo.inputBox.value = message;
            console.log('AI 生成的 commit message:', message);

            if (showNotifications) {
              vscode.window.showInformationMessage('已生成提交消息，请在源代码管理面板中检查并提交');
            }
          }
        } catch (err) {
          vscode.window.showErrorMessage(`AI 生成失败: ${err.message}`);
          console.error(err);
        }
      }
    );
  } catch (err) {
    vscode.window.showErrorMessage(`操作失败: ${err.message}`);
    console.error(err);
  }
}

/**
 * 扩展停用时调用
 */
function deactivate() {
  console.log('Git AI Auto Commit 扩展已停用');
}

module.exports = {
  activate,
  deactivate,
};
