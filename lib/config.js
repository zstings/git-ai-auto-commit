const vscode = require('vscode');

/**
 * 配置管理器：优先从 ConfigProvider 的活跃配置读取，回退到 VS Code settings
 */
class ConfigManager {
  constructor(configProvider) {
    this.prefix = 'gitAiAutoCommit';
    this.configProvider = configProvider || null;
  }

  /**
   * 获取单个配置项
   * 优先从活跃 AI 配置读取，回退到 settings.json
   * @param {string} key - 配置键名（不含前缀）
   * @returns {*} 配置值
   */
  async get(key) {
    // 偏好类配置从 configProvider 读取
    if (this.configProvider) {
      const prefs = await this.configProvider.getPreferences();
      if (key in prefs) return prefs[key];
    }
    // 回退到 settings.json
    const config = vscode.workspace.getConfiguration(this.prefix);
    return config.get(key);
  }

  /**
   * 同步获取（仅从 settings.json，用于不需要等待异步的场景）
   */
  getSync(key) {
    const config = vscode.workspace.getConfiguration(this.prefix);
    return config.get(key);
  }

  /**
   * 获取活跃的 AI 配置对象（含 apiKey / baseUrl / model）
   * @returns {Promise<object|null>}
   */
  async getActiveAiConfig() {
    if (this.configProvider) {
      return await this.configProvider.getActiveConfig();
    }
    // 回退：从 settings.json 构造一个配置对象
    const config = vscode.workspace.getConfiguration(this.prefix);
    return {
      id: 'legacy',
      name: 'Default',
      apiKey: config.get('apiKey') || '',
      baseUrl: config.get('baseUrl') || '',
      model: config.get('model') || '',
    };
  }

  /**
   * 获取所有配置
   * @returns {Promise<object>} 配置对象
   */
  async getAll() {
    if (this.configProvider) {
      const prefs = await this.configProvider.getPreferences();
      const activeConfig = await this.configProvider.getActiveConfig();
      return {
      apiKey: activeConfig?.apiKey || '',
      baseUrl: activeConfig?.baseUrl || '',
      model: activeConfig?.model || '',
      apiMode: activeConfig?.apiMode || 'chat',
        commitStyle: prefs.commitStyle,
        language: prefs.language,
        maxDiffLines: prefs.maxDiffLines,
        autoStageAll: prefs.autoStageAll,
        showNotifications: prefs.showNotifications,
      };
    }
    // 回退到 settings.json
    const config = vscode.workspace.getConfiguration(this.prefix);
    return {
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
   * 获取最终生效的 baseUrl（用户必填）
   * @param {object} [config] - 可选的配置对象，不传则用活跃配置
   * @returns {Promise<string>} API 基础地址
   */
  async getEffectiveBaseUrl(config) {
    const cfg = config || (await this.getActiveAiConfig());
    if (cfg && cfg.baseUrl && cfg.baseUrl.trim()) {
      return cfg.baseUrl.trim().replace(/\/+$/, '');
    }
    return '';
  }

  /**
   * 获取最终生效的模型名称（用户必填）
   * @param {object} [config] - 可选的配置对象
   * @returns {Promise<string>} 模型名称
   */
  async getEffectiveModel(config) {
    const cfg = config || (await this.getActiveAiConfig());
    if (cfg && cfg.model && cfg.model.trim()) {
      return cfg.model.trim();
    }
    return '';
  }

  /**
   * 获取 API 模式（chat 或 responses，默认 chat）
   * @param {object} [config] - 可选的配置对象
   * @returns {Promise<string>} API 模式
   */
  async getEffectiveApiMode(config) {
    const cfg = config || (await this.getActiveAiConfig());
    if (cfg && cfg.apiMode === 'responses') return 'responses';
    return 'chat';
  }
}

module.exports = ConfigManager;
