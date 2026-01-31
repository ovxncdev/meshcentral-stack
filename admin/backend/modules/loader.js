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
  'general',
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
  }
  
  /**
   * Load all available modules
   */
  async loadAll() {
    for (const moduleName of AVAILABLE_MODULES) {
      try {
        await this.load(moduleName);
      } catch (error) {
        console.error(`Failed to load module '${moduleName}':`, error.message);
      }
    }
  }
  
  /**
   * Load a single module
   * @param {string} moduleName - Name of the module to load
   */
  async load(moduleName) {
    const modulePath = path.join(__dirname, `${moduleName}.js`);
    
    // Import the module
    const ModuleClass = require(modulePath);
    
    // Validate it extends BaseModule
    if (!(ModuleClass.prototype instanceof BaseModule)) {
      throw new Error(`Module '${moduleName}' does not extend BaseModule`);
    }
    
    // Create instance
    const moduleInstance = new ModuleClass();
    moduleInstance.configManager = this.configManager;
    
    // Register default settings
    const defaults = moduleInstance.getDefaultSettings();
    await this.configManager.registerModule(moduleName, defaults);
    
    // Initialize module
    if (typeof moduleInstance.init === 'function') {
      await moduleInstance.init();
    }
    
    // Store instance
    this.modules.set(moduleName, moduleInstance);
    
    console.log(`  ✓ Loaded module: ${moduleInstance.displayName || moduleName}`);
  }
  
  /**
   * Get a module by name
   * @param {string} name - Module name
   * @returns {BaseModule} Module instance
   */
  get(name) {
    return this.modules.get(name);
  }
  
  /**
   * Check if a module exists
   * @param {string} name - Module name
   * @returns {boolean}
   */
  has(name) {
    return this.modules.has(name);
  }
  
  /**
   * Get list of all loaded modules
   * @returns {Array} Module info array
   */
  getModuleList() {
    const list = [];
    
    for (const [name, module] of this.modules) {
      list.push({
        name: module.name,
        displayName: module.displayName,
        description: module.description,
        icon: module.icon,
        enabled: module.isEnabled()
      });
    }
    
    return list;
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
    
    if (!module) {
      throw new Error(`Module not found: ${moduleName}`);
    }
    
    return module.executeAction(actionName, params);
  }
  
  /**
   * Handle a webhook event
   * @param {string} eventType - Event type
   * @param {object} payload - Event payload
   * @returns {Promise<object>} Results from all handlers
   */
  async handleWebhook(eventType, payload) {
    const results = {};
    
    for (const [name, module] of this.modules) {
      const handledEvents = module.getHandledEvents();
      
      if (handledEvents.includes(eventType)) {
        try {
          results[name] = await module.handleEvent(eventType, payload);
        } catch (error) {
          results[name] = { error: error.message };
        }
      }
    }
    
    return results;
  }
}

module.exports = ModuleLoader;
