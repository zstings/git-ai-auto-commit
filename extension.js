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
  statusBarItem.command = 'gitAiAutoCommit.generateAndCommit';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ─── 命令：AI 生成提交消息并提交 ───
  context.subscriptions.push(
    vscode.commands.registerCommand('gitAiAutoCommit.generateAndCommit', async () => {
      await runGenerateAndCommit(gitOps, aiClient, config, { autoCommit: true });
    })
  );

  // ─── 命令：仅 AI 生成提交消息（不提交） ───
  context.subscriptions.push(
    vscode.commands.registerCommand('gitAiAutoCommit.generateOnly', async () => {
      await runGenerateAndCommit(gitOps, aiClient, config, { autoCommit: false });
    })
  );

  // ─── 命令：AI 生成提交消息写入 SCM 输入框 ───
  context.subscriptions.push(
    vscode.commands.registerCommand('gitAiAutoCommit.generateToScm', async () => {
      await runGenerateToScm(gitOps, aiClient, config);
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
 * 核心流程：获取 diff → AI 生成消息 → 可选提交
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
          const message = await aiClient.generateCommitMessage(diff, files);
          console.log('AI 生成的 commit message:', message);

          if (autoCommit) {
            const success = await gitOps.commit(root, message);
            if (success) {
              if (showNotifications) {
                vscode.window.showInformationMessage(`提交成功: ${message}`);
              }
            } else {
              vscode.window.showErrorMessage('git commit 失败');
            }
          } else {
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
 * 核心流程：获取 diff → AI 生成消息 → 写入 VS Code SCM 输入框
 */
async function runGenerateToScm(gitOps, aiClient, config) {
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
          const message = await aiClient.generateCommitMessage(diff, files);
          console.log('AI 生成的 commit message:', message);

          if (vscode.scm && vscode.scm.inputBox) {
            vscode.scm.inputBox.value = message;
            if (showNotifications) {
              vscode.window.showInformationMessage('已生成提交消息，请在源代码管理面板中检查并提交');
            }
          } else {
            const edited = await vscode.window.showInputBox({
              prompt: 'AI 生成的提交消息（可编辑后确认提交）',
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
