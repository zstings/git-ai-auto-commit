const vscode = require('vscode');

/**
 * 配置管理器：负责读取和管理扩展配置
 */
class ConfigManager {
  constructor() {
    this.prefix = 'gitAiAutoCommit';
  }

  /**
   * 获取单个配置项
   * @param {string} key - 配置键名（不含前缀）
   * @returns {*} 配置值
   */
  get(key) {
    const config = vscode.workspace.getConfiguration(this.prefix);
    return config.get(key);
  }

  /**
   * 设置配置项
   * @param {string} key - 配置键名
   * @param {*} value - 配置值
   * @param {boolean} [global=true] - 是否写入全局配置
   */
  async set(key, value, global = true) {
    const config = vscode.workspace.getConfiguration(this.prefix);
    await config.update(
      key,
      value,
      global ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace
    );
  }

  /**
   * 获取所有配置（含默认值回退）
   * @returns {object} 配置对象
   */
  getAll() {
    const config = vscode.workspace.getConfiguration(this.prefix);
    return {
      apiProvider: config.get('apiProvider'),
      apiKey: config.get('apiKey'),
      baseUrl: config.get('baseUrl'),
      model: config.get('model'),
      commitStyle: config.get('commitStyle'),
      language: config.get('language'),
      maxDiffLines: config.get('maxDiffLines'),
      autoStageAll: config.get('autoStageAll'),
      showNotifications: config.get('showNotifications'),
    };
  }

  /**
   * 监听配置变化
   * @param {function} callback - 回调函数
   * @returns {vscode.Disposable} 订阅
   */
  onDidChange(callback) {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(this.prefix)) {
        callback(this.getAll());
      }
    });
  }

  /**
   * 获取 provider 对应的默认 baseUrl
   * @param {string} provider - 服务提供商
   * @returns {string} 默认 API 基础地址
   */
  getDefaultBaseUrl(provider) {
    const defaults = {
      openai: 'https://api.openai.com/v1',
      deepseek: 'https://api.deepseek.com/v1',
      claude: 'https://api.anthropic.com/v1',
      custom: '',
    };
    return defaults[provider] || '';
  }

  /**
   * 获取 provider 对应的默认模型
   * @param {string} provider - 服务提供商
   * @returns {string} 默认模型名称
   */
  getDefaultModel(provider) {
    const defaults = {
      openai: 'gpt-4o-mini',
      deepseek: 'deepseek-chat',
      claude: 'claude-3-5-sonnet-20241022',
      custom: '',
    };
    return defaults[provider] || '';
  }

  /**
   * 获取最终生效的 baseUrl（用户自定义 > 默认）
   * @returns {string} API 基础地址
   */
  getEffectiveBaseUrl() {
    const userBaseUrl = this.get('baseUrl');
    if (userBaseUrl && userBaseUrl.trim()) {
      return userBaseUrl.trim().replace(/\/+$/, '');
    }
    return this.getDefaultBaseUrl(this.get('apiProvider'));
  }

  /**
   * 获取最终生效的模型名称（用户自定义 > 默认）
   * @returns {string} 模型名称
   */
  getEffectiveModel() {
    const userModel = this.get('model');
    if (userModel && userModel.trim()) {
      return userModel.trim();
    }
    return this.getDefaultModel(this.get('apiProvider'));
  }
}

module.exports = ConfigManager;
