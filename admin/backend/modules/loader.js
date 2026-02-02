/**
 * Module Loader
 * 
 * Dynamically loads and manages all modules.
 * Provides a unified interface for accessing module functionality.
 */

const path = require('path');
const fs = require('fs');

// Available modules - add new modules here
const AVAILABLE_MODULES = [
  'telegram',
  'files',
  'branding',
  'webhook'
];

class ModuleLoader {
  constructor(configManager) {
    this.configManager = configManager;
    this.modules = new Map();
    this.modulesDir = __dirname;
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
    
    console.log(`  Loaded ${this.modules.size}/${AVAILABLE_MODULES.length} modules`);
  }

  /**
   * Load a single module
   */
  async load(name) {
    const modulePath = path.join(this.modulesDir, `${name}.js`);
    
    // Check if module file exists
    if (!fs.existsSync(modulePath)) {
      throw new Error(`Module file not found: ${modulePath}`);
    }

    // Load the module
    const ModuleClass = require(modulePath);
    const moduleInstance = new ModuleClass(this.configManager);
    
    // Initialize if the module has an init method
    if (typeof moduleInstance.init === 'function') {
      await moduleInstance.init();
    }

    this.modules.set(name, moduleInstance);
    return moduleInstance;
  }

  /**
   * Check if a module is loaded
   */
  has(name) {
    return this.modules.has(name);
  }

  /**
   * Get a loaded module
   */
  get(name) {
    if (!this.modules.has(name)) {
      throw new Error(`Module not loaded: ${name}`);
    }
    return this.modules.get(name);
  }

  /**
   * Get list of all modules with metadata
   */
  getModuleList() {
    const list = [];
    
    for (const [name, module] of this.modules) {
      list.push({
        name,
        displayName: module.displayName || module.name || name,
        description: module.description || '',
        icon: module.icon || 'settings',
        enabled: typeof module.isEnabled === 'function' ? module.isEnabled() : true,
        hasSchema: typeof module.getSchema === 'function',
        hasActions: typeof module.executeAction === 'function'
      });
    }
    
    return list;
  }

  /**
   * Execute an action on a module
   */
  async executeAction(moduleName, action, params, user) {
    const module = this.get(moduleName);
    
    if (typeof module.executeAction !== 'function') {
      throw new Error(`Module '${moduleName}' does not support actions`);
    }
    
    return module.executeAction(action, params, user);
  }

  /**
   * Handle webhook events across all modules
   */
  async handleWebhook(eventType, payload) {
    const results = {};
    
    for (const [name, module] of this.modules) {
      if (typeof module.handleWebhook === 'function') {
        try {
          results[name] = await module.handleWebhook(eventType, payload);
        } catch (error) {
          console.error(`Webhook error in module '${name}':`, error.message);
          results[name] = { error: error.message };
        }
      }
    }
    
    return results;
  }

  /**
   * Get all modules
   */
  getAll() {
    return this.modules;
  }

  /**
   * Reload a module
   */
  async reload(name) {
    // Remove from cache
    const modulePath = path.join(this.modulesDir, `${name}.js`);
    delete require.cache[require.resolve(modulePath)];
    
    // Remove from loaded modules
    this.modules.delete(name);
    
    // Reload
    return this.load(name);
  }

  /**
   * Reload all modules
   */
  async reloadAll() {
    // Clear all
    for (const name of this.modules.keys()) {
      const modulePath = path.join(this.modulesDir, `${name}.js`);
      delete require.cache[require.resolve(modulePath)];
    }
    this.modules.clear();
    
    // Reload all
    await this.loadAll();
  }
}

module.exports = ModuleLoader;
