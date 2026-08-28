const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');

/**
 * Git 操作封装：执行 git 命令、获取 diff、暂存、提交
 */
class GitOps {
  /**
   * 执行 shell 命令（Promise 封装）
   * @param {string} cmd - 命令
   * @param {string} cwd - 工作目录
   * @returns {Promise<{stdout: string, stderr: string}>}
   */
  exec(cmd, cwd) {
    return new Promise((resolve, reject) => {
      exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`${err.message}\n${stderr}`));
          return;
        }
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      });
    });
  }

  /**
   * 获取当前工作区的 git 根目录
   * @returns {Promise<string|null>} git 根目录路径，未找到则返回 null
   */
  async getRoot() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    const cwd = workspaceFolders[0].uri.fsPath;
    try {
      const { stdout } = await this.exec('git rev-parse --show-toplevel', cwd);
      return stdout || cwd;
    } catch {
      // 不是 git 仓库
      return null;
    }
  }

  /**
   * 检查是否有未暂存的变更（git diff）
   * @param {string} root - git 根目录
   * @returns {Promise<boolean>}
   */
  async hasUnstagedChanges(root) {
    try {
      const { stdout } = await this.exec('git diff --name-only', root);
      return stdout.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 检查是否有已暂存但未提交的变更（git diff --cached）
   * @param {string} root - git 根目录
   * @returns {Promise<boolean>}
   */
  async hasStagedChanges(root) {
    try {
      const { stdout } = await this.exec('git diff --cached --name-only', root);
      return stdout.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 获取已暂存变更的 diff
   * @param {string} root - git 根目录
   * @param {number} maxLines - 最大行数（超出截断）
   * @returns {Promise<string>} diff 文本
   */
  async getStagedDiff(root, maxLines = 500) {
    try {
      const { stdout } = await this.exec('git diff --cached', root);
      return this.truncateDiff(stdout, maxLines);
    } catch {
      return '';
    }
  }

  /**
   * 获取所有变更的 diff（含未暂存）
   * @param {string} root - git 根目录
   * @param {number} maxLines - 最大行数（超出截断）
   * @returns {Promise<string>} diff 文本
   */
  async getAllDiff(root, maxLines = 500) {
    try {
      const { stdout } = await this.exec('git diff HEAD', root);
      return this.truncateDiff(stdout, maxLines);
    } catch {
      return '';
    }
  }

  /**
   * 获取变更的文件列表（已暂存 + 未暂存）
   * @param {string} root - git 根目录
   * @returns {Promise<string[]>} 文件路径数组
   */
  async getChangedFiles(root) {
    try {
      const { stdout } = await this.exec('git status --porcelain', root);
      if (!stdout) return [];

      return stdout
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.slice(3).trim());
    } catch {
      return [];
    }
  }

  /**
   * 暂存所有变更（git add -A）
   * @param {string} root - git 根目录
   * @returns {Promise<boolean>} 是否成功
   */
  async stageAll(root) {
    try {
      await this.exec('git add -A', root);
      return true;
    } catch (err) {
      console.error('git add -A 失败:', err.message);
      return false;
    }
  }

  /**
   * 执行 git commit
   * @param {string} root - git 根目录
   * @param {string} message - 提交消息
   * @returns {Promise<boolean>} 是否成功
   */
  async commit(root, message) {
    // 对 commit message 进行 shell 安全转义
    const escapedMessage = message.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    try {
      await this.exec(`git commit -m "${escapedMessage}"`, root);
      return true;
    } catch (err) {
      console.error('git commit 失败:', err.message);
      return false;
    }
  }

  /**
   * 截断 diff 到最大行数
   * @param {string} diff - diff 文本
   * @param {number} maxLines - 最大行数
   * @returns {string} 截断后的 diff
   */
  truncateDiff(diff, maxLines) {
    if (!diff) return '';
    const lines = diff.split('\n');
    if (lines.length <= maxLines) return diff;

    const truncated = lines.slice(0, maxLines).join('\n');
    const remaining = lines.length - maxLines;
    return `${truncated}\n\n... (省略 ${remaining} 行)`;
  }
}

module.exports = GitOps;
