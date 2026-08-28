const vscode = require('vscode');
const ConfigManager = require('./lib/config');
const GitOps = require('./lib/git');
const AIClient = require('./lib/ai');

/**
 * 扩展激活时调用
 */
async function activate(context) {
  console.log('Git AI Auto Commit 扩展已激活');

  const config = new ConfigManager();
  const gitOps = new GitOps();
  const aiClient = new AIClient(config);

  // ─── 状态栏 ───
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(git-commit) AI Commit';
  statusBarItem.tooltip = 'Git AI Auto Commit';
  statusBarItem.command = 'gitAiAutoCommit.generateAndCommit';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ─── 命令：AI 生成提交消息并提交 ───
  const generateAndCommitCmd = vscode.commands.registerCommand(
    'gitAiAutoCommit.generateAndCommit',
    async () => {
      await runGenerateAndCommit(gitOps, aiClient, config, { autoCommit: true });
    }
  );
  context.subscriptions.push(generateAndCommitCmd);

  // ─── 命令：仅 AI 生成提交消息（不提交） ───
  const generateOnlyCmd = vscode.commands.registerCommand(
    'gitAiAutoCommit.generateOnly',
    async () => {
      await runGenerateAndCommit(gitOps, aiClient, config, { autoCommit: false });
    }
  );
  context.subscriptions.push(generateOnlyCmd);

  // ─── 命令：打开配置 ───
  const openConfigCmd = vscode.commands.registerCommand(
    'gitAiAutoCommit.openConfig',
    () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'gitAiAutoCommit');
    }
  );
  context.subscriptions.push(openConfigCmd);
}

/**
 * 核心流程：获取 diff → AI 生成消息 → 可选提交
 */
async function runGenerateAndCommit(gitOps, aiClient, config, options) {
  const { autoCommit } = options;
  const showNotifications = config.get('showNotifications');

  try {
    // 1. 获取 git 根目录
    const root = await gitOps.getRoot();
    if (!root) {
      vscode.window.showErrorMessage('当前工作区不是 Git 仓库');
      return;
    }

    // 2. 确定变更
    const hasStaged = await gitOps.hasStagedChanges(root);
    const hasUnstaged = await gitOps.hasUnstagedChanges(root);
    const autoStageAll = config.get('autoStageAll');

    if (!hasStaged && !hasUnstaged) {
      vscode.window.showInformationMessage('没有检测到任何代码变更');
      return;
    }

    // 3. 如果没有暂存变更，询问是否暂存全部
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
        if (choice !== '暂存全部') {
          return;
        }
        const success = await gitOps.stageAll(root);
        if (!success) {
          vscode.window.showErrorMessage('git add -A 失败');
          return;
        }
      }
    }

    // 4. 获取 diff
    const maxDiffLines = config.get('maxDiffLines') || 500;
    const diff = await gitOps.getStagedDiff(root, maxDiffLines);
    if (!diff) {
      vscode.window.showInformationMessage('已暂存的内容为空');
      return;
    }

    // 5. 获取变更文件列表
    const files = await gitOps.getChangedFiles(root);

    // 6. 调用 AI 生成 commit message
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'AI 正在生成提交消息...',
        cancellable: false,
      },
      async () => {
        try {
          const message = await aiClient.generateCommitMessage(diff, files);
          console.log('AI 生成的 commit message:', message);

          if (autoCommit) {
            // 执行提交
            const success = await gitOps.commit(root, message);
            if (success) {
              if (showNotifications) {
                vscode.window.showInformationMessage(`提交成功: ${message}`);
              }
            } else {
              vscode.window.showErrorMessage('git commit 失败');
            }
          } else {
            // 仅生成，让用户编辑
            const edited = await vscode.window.showInputBox({
              prompt: 'AI 生成的提交消息（可编辑后确认）',
              value: message,
              placeHolder: '输入提交消息',
            });
            if (edited) {
              const success = await gitOps.commit(root, edited);
              if (success) {
                if (showNotifications) {
                  vscode.window.showInformationMessage(`提交成功: ${edited}`);
                }
              } else {
                vscode.window.showErrorMessage('git commit 失败');
              }
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
