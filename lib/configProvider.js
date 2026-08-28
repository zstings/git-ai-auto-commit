const vscode = require('vscode');

/**
 * 多配置管理器：使用 globalState 存储多个 AI 配置，支持增删改查和切换活跃配置
 */
class ConfigProvider {
  constructor(context) {
    this.context = context;
    this.configsKey = 'gitAiAutoCommit.configs';
    this.activeIdKey = 'gitAiAutoCommit.activeConfigId';
    this.prefsKey = 'gitAiAutoCommit.preferences';
  }

  /**
   * 获取所有 AI 配置
   * @returns {Promise<object[]>} 配置数组
   */
  async getAll() {
    const configs = this.context.globalState.get(this.configsKey, []);
    return configs;
  }

  /**
   * 获取当前活跃的配置 ID
   * @returns {Promise<string|null>}
   */
  async getActiveId() {
    return this.context.globalState.get(this.activeIdKey, null);
  }

  /**
   * 获取当前活跃的配置对象
   * @returns {Promise<object|null>}
   */
  async getActiveConfig() {
    const configs = await this.getAll();
    const activeId = await this.getActiveId();
    if (!activeId) {
      // 没有设置活跃配置，返回第一个
      return configs.length > 0 ? configs[0] : null;
    }
    return configs.find((c) => c.id === activeId) || (configs.length > 0 ? configs[0] : null);
  }

  /**
   * 设置活跃配置
   * @param {string} id - 配置 ID
   */
  async setActive(id) {
    await this.context.globalState.update(this.activeIdKey, id);
  }

  /**
   * 新增配置
   * @param {object} config - { name, provider, apiKey, baseUrl, model }
   * @returns {Promise<object>} 创建的配置（含 id）
   */
  async add(config) {
    const configs = await this.getAll();
    const newConfig = {
      id: this._genId(),
      name: config.name || '未命名',
      provider: config.provider || 'deepseek',
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || '',
      model: config.model || '',
    };
    configs.push(newConfig);
    await this.context.globalState.update(this.configsKey, configs);

    // 如果是第一个配置，自动设为活跃
    if (configs.length === 1) {
      await this.setActive(newConfig.id);
    }
    return newConfig;
  }

  /**
   * 更新配置
   * @param {string} id - 配置 ID
   * @param {object} updates - 要更新的字段
   * @returns {Promise<boolean>} 是否成功
   */
  async update(id, updates) {
    const configs = await this.getAll();
    const index = configs.findIndex((c) => c.id === id);
    if (index === -1) return false;

    configs[index] = { ...configs[index], ...updates, id };
    await this.context.globalState.update(this.configsKey, configs);
    return true;
  }

  /**
   * 删除配置
   * @param {string} id - 配置 ID
   * @returns {Promise<boolean>} 是否成功
   */
  async remove(id) {
    const configs = await this.getAll();
    const filtered = configs.filter((c) => c.id !== id);
    if (filtered.length === configs.length) return false;

    await this.context.globalState.update(this.configsKey, filtered);

    // 如果删除的是活跃配置，自动切换到第一个
    const activeId = await this.getActiveId();
    if (activeId === id) {
      await this.context.globalState.update(this.activeIdKey, filtered.length > 0 ? filtered[0].id : null);
    }
    return true;
  }

  /**
   * 获取通用偏好设置（提交风格、语言等）
   * @returns {Promise<object>}
   */
  async getPreferences() {
    return this.context.globalState.get(this.prefsKey, {
      commitStyle: 'conventional',
      language: 'zh',
      maxDiffLines: 500,
      autoStageAll: false,
      showNotifications: true,
    });
  }

  /**
   * 更新通用偏好设置
   * @param {object} updates - 要更新的字段
   */
  async updatePreferences(updates) {
    const prefs = await this.getPreferences();
    const newPrefs = { ...prefs, ...updates };
    await this.context.globalState.update(this.prefsKey, newPrefs);
    return newPrefs;
  }

  /**
   * 获取 provider 对应的默认 baseUrl
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
   */
  getEffectiveBaseUrl(config) {
    if (!config) return '';
    if (config.baseUrl && config.baseUrl.trim()) {
      return config.baseUrl.trim().replace(/\/+$/, '');
    }
    return this.getDefaultBaseUrl(config.provider);
  }

  /**
   * 获取最终生效的模型名称（用户自定义 > 默认）
   */
  getEffectiveModel(config) {
    if (!config) return '';
    if (config.model && config.model.trim()) {
      return config.model.trim();
    }
    return this.getDefaultModel(config.provider);
  }

  /**
   * 生成唯一 ID
   * @private
   */
  _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}

module.exports = ConfigProvider;
