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
   * @param {object} config - { name, apiKey, baseUrl, model }
   * @returns {Promise<object>} 创建的配置（含 id）
   */
  async add(config) {
    const configs = await this.getAll();
    const newConfig = {
      id: this._genId(),
      name: config.name || '未命名',
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || '',
      model: config.model || '',
      apiMode: config.apiMode || 'chat',
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
   * 获取通用偏好设置（语言、提交规则等）
   * @returns {Promise<object>}
   */
  async getPreferences() {
    return this.context.globalState.get(this.prefsKey, {
      language: 'zh',
      commitStyleRule: '你是一个严谨的 Git 提交信息生成助手。请严格遵守以下规则：\n\n## 格式\n\n`<type>(<scope>): <subject>`\n\n## Type 选择规则\n\n- **feat**: 新增用户可感知的功能、页面、组件\n- **fix**: 修复已有功能的 Bug（原来能用但出了问题，或行为不符合预期）\n- **perf**: 性能优化（减少请求、减少渲染、加快响应，功能不变）\n- **refactor**: 重构代码结构（提取函数、调整逻辑组织，功能不变）\n- **style**: 文案、代码格式化（不涉及逻辑变更）\n- **docs**: 文档、注释变更\n- **chore**: 依赖升级、构建配置、工具配置\n\n### 关键区分\n\n- 代码有 Bug 导致功能异常 → fix\n- 功能正常但换了更优的实现方式 → perf 或 refactor\n- 只改了显示文案/格式 → style\n- 新增了之前没有的能力 → feat\n\n## Subject 规则\n\n- 使用中文\n- 以动词开头（增加、修复、优化、调整、移除）\n- 不超过 50 个字\n- 不加句号\n\n## 示例\n\n- `feat(auth): 增加登录功能`\n- `fix(order): 修复金额计算精度丢失问题`\n- `perf(userOrderList): 备注更新后直接修改本地数据避免重新请求`\n- `refactor(utils): 提取公共校验逻辑为独立函数`\n- `style(rebate): 保存按钮文案从"全部保存"改为"保存"`',
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
   * 获取最终生效的 baseUrl（用户必填）
   */
  getEffectiveBaseUrl(config) {
    if (!config || !config.baseUrl) return '';
    return config.baseUrl.trim().replace(/\/+$/, '');
  }

  /**
   * 获取最终生效的模型名称（用户必填）
   */
  getEffectiveModel(config) {
    if (!config || !config.model) return '';
    return config.model.trim();
  }

  /**
   * 获取 API 模式（chat 或 responses，默认 chat）
   */
  getEffectiveApiMode(config) {
    if (!config || !config.apiMode) return 'chat';
    return config.apiMode === 'responses' ? 'responses' : 'chat';
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
