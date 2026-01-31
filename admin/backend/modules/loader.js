/**
 * Module Loader
 * 
 * Dynamically loads and manages feature modules.
 * Modules are self-contained units that provide:
 *   - Settings schema (what can be configured)
 *   - Actions (test, execute, etc.)
 *   - Webhooks (event handlers)
 * 
 * To add a new module:
 *   1. Create a file in modules/ extending BaseModule
 *   2. Add it to AVAILABLE_MODULES below
 *   3. Done - it auto-registers with the dashboard
 */

const path = require('path');
const BaseModule = require('./base');

// ==============================================================================
// Available Modules
// ==============================================================================

// Add new modules here
const AVAILABLE_MODULES = [
  'telegram',
  'branding',
  'email',
  'webhook'
];

// ==============================================================================
// ModuleLoader Class
// ==============================================================================

class ModuleLoader {
  /**
   * Create a new ModuleLoader
   * @param {ConfigManager} configManager - Config manager instance
   */
  constructor(configManager) {
    this.configManager = configManager;
    this.modules = new Map();
    this.loaded = false;
  }
  
  /**
   * Load all available modules
   */
  async loadAll() {
    for (const moduleName of AVAILABLE_MODULES) {
      try {
        await this.load(moduleName);
      } catch (error) {
        console.warn(`Warning: Failed to load module '${moduleName}':`, error.message);
      }
    }
    this.loaded = true;
  }
  
  /**
   * Load a specific module
   * @param {string} moduleName - Module name
   */
  async load(moduleName) {
    const modulePath = path.join(__dirname, `${moduleName}.js`);
    
    // Check if module file exists
    try {
      require.resolve(modulePath);
    } catch (error) {
      throw new Error(`Module file not found: ${moduleName}.js`);
    }
    
    // Load module class
    const ModuleClass = require(modulePath);
    
    // Validate module extends BaseModule
    if (!(ModuleClass.prototype instanceof BaseModule)) {
      throw new Error(`Module '${moduleName}' must extend BaseModule`);
    }
    
    // Create instance
    const moduleInstance = new ModuleClass(this.configManager);
    
    // Initialize module
    await moduleInstance.init();
    
    // Register with config manager
    await this.configManager.registerModule(
      moduleInstance.name,
      moduleInstance.getDefaultSettings()
    );
    
    // Store module
    this.modules.set(moduleInstance.name, moduleInstance);
    
    console.log(`  ✓ Module loaded: ${moduleInstance.displayName}`);
  }
  
  /**
   * Get a loaded module by name
   * @param {string} moduleName - Module name
   * @returns {BaseModule} Module instance
   */
  get(moduleName) {
    const module = this.modules.get(moduleName);
    if (!module) {
      throw new Error(`Module not found: ${moduleName}`);
    }
    return module;
  }
  
  /**
   * Check if a module is loaded
   * @param {string} moduleName - Module name
   * @returns {boolean}
   */
  has(moduleName) {
    return this.modules.has(moduleName);
  }
  
  /**
   * Get all loaded modules
   * @returns {Map<string, BaseModule>}
   */
  getAll() {
    return this.modules;
  }
  
  /**
   * Get count of loaded modules
   * @returns {number}
   */
  getModuleCount() {
    return this.modules.size;
  }
  
  /**
   * Get module metadata for frontend
   * @returns {Array<object>}
   */
  getModuleList() {
    const list = [];
    
    for (const [name, module] of this.modules) {
      list.push({
        name: module.name,
        displayName: module.displayName,
        description: module.description,
        icon: module.icon,
        enabled: module.isEnabled(),
        schema: module.getSchema(),
        actions: module.getActions()
      });
    }
    
    return list;
  }
  
  /**
   * Get settings for all modules
   * @returns {object}
   */
  getAllSettings() {
    const settings = {};
    
    for (const [name, module] of this.modules) {
      settings[name] = module.getSettings();
    }
    
    return settings;
  }
  
  /**
   * Execute an action on a module
   * @param {string} moduleName - Module name
   * @param {string} actionName - Action name
   * @param {object} params - Action parameters
   * @returns {Promise<object>} Action result
   */
  async executeAction(moduleName, actionName, params = {}) {
    const module = this.get(moduleName);
    return await module.executeAction(actionName, params);
  }
  
  /**
   * Handle a webhook event
   * @param {string} eventType - Event type
   * @param {object} payload - Event payload
   */
  async handleWebhook(eventType, payload) {
    const results = [];
    
    for (const [name, module] of this.modules) {
      if (module.isEnabled() && module.handlesEvent(eventType)) {
        try {
          const result = await module.handleEvent(eventType, payload);
          results.push({ module: name, success: true, result });
        } catch (error) {
          results.push({ module: name, success: false, error: error.message });
        }
      }
    }
    
    return results;
  }
}

module.exports = ModuleLoader;
