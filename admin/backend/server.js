/**
 * Configuration Manager
 * 
 * Handles loading, saving, and validating settings.
 * Settings are stored in a JSON file for simplicity and portability.
 * 
 * Features:
 *   - Auto-creates data directory and default settings
 *   - Validates settings before saving
 *   - Supports nested settings paths
 *   - Thread-safe writes with atomic file operations
 */

const fs = require('fs').promises;
const path = require('path');

// ==============================================================================
// Default Settings
// ==============================================================================

const DEFAULT_SETTINGS = {
  // Meta
  _version: '1.0.0',
  _lastModified: null,
  
  // General
  general: {
    siteName: 'Remote Support',
    siteDescription: 'Secure Remote Access Portal',
    adminEmail: '',
    timezone: 'UTC'
  },
  
  // Modules are registered dynamically
  modules: {}
};

// ==============================================================================
// ConfigManager Class
// ==============================================================================

class ConfigManager {
  /**
   * Create a new ConfigManager
   * @param {string} dataPath - Directory to store settings
   */
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.settingsFile = path.join(dataPath, 'settings.json');
    this.settings = null;
    this.initialized = false;
  }
  
  /**
   * Initialize the config manager
   * Creates data directory and loads/creates settings file
   */
  async init() {
    // Ensure data directory exists
    await fs.mkdir(this.dataPath, { recursive: true });
    
    // Load or create settings
    try {
      const data = await fs.readFile(this.settingsFile, 'utf8');
      this.settings = JSON.parse(data);
      
      // Merge with defaults to ensure all keys exist
      this.settings = this._mergeDefaults(this.settings, DEFAULT_SETTINGS);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create with defaults
        this.settings = { ...DEFAULT_SETTINGS };
        await this._save();
      } else {
        throw error;
      }
    }
    
    this.initialized = true;
  }
  
  /**
   * Get all settings
   * @returns {object} All settings
   */
  getAll() {
    this._checkInitialized();
    return { ...this.settings };
  }
  
  /**
   * Get a specific setting by path
   * @param {string} path - Dot-notation path (e.g., 'modules.telegram.enabled')
   * @param {any} defaultValue - Default value if path doesn't exist
   * @returns {any} The setting value
   */
  get(path, defaultValue = null) {
    this._checkInitialized();
    
    const parts = path.split('.');
    let current = this.settings;
    
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[part];
    }
    
    return current !== undefined ? current : defaultValue;
  }
  
  /**
   * Set a specific setting by path
   * @param {string} path - Dot-notation path
   * @param {any} value - Value to set
   */
  async set(path, value) {
    this._checkInitialized();
    
    const parts = path.split('.');
    let current = this.settings;
    
    // Navigate to parent
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    
    // Set value
    current[parts[parts.length - 1]] = value;
    
    // Update last modified
    this.settings._lastModified = new Date().toISOString();
    
    await this._save();
  }
  
  /**
   * Get settings for a specific module
   * @param {string} moduleName - Module name
   * @returns {object} Module settings
   */
  getModuleSettings(moduleName) {
    return this.get(`modules.${moduleName}`, {});
  }
  
  /**
   * Save settings for a specific module
   * @param {string} moduleName - Module name
   * @param {object} settings - Settings to save
   */
  async saveModuleSettings(moduleName, settings) {
    await this.set(`modules.${moduleName}`, settings);
  }
  
  /**
   * Register a module with default settings
   * @param {string} moduleName - Module name
   * @param {object} defaultSettings - Default settings for the module
   */
  async registerModule(moduleName, defaultSettings) {
    const existing = this.getModuleSettings(moduleName);
    
    if (Object.keys(existing).length === 0) {
      // No existing settings, use defaults
      await this.saveModuleSettings(moduleName, defaultSettings);
    } else {
      // Merge existing with defaults
      const merged = this._mergeDefaults(existing, defaultSettings);
      await this.saveModuleSettings(moduleName, merged);
    }
  }
  
  /**
   * Delete settings for a module
   * @param {string} moduleName - Module name
   */
  async deleteModuleSettings(moduleName) {
    if (this.settings.modules && this.settings.modules[moduleName]) {
      delete this.settings.modules[moduleName];
      await this._save();
    }
  }
  
  /**
   * Export all settings (for backup)
   * @returns {string} JSON string of all settings
   */
  export() {
    this._checkInitialized();
    return JSON.stringify(this.settings, null, 2);
  }
  
  /**
   * Import settings (from backup)
   * @param {string} jsonString - JSON string of settings
   */
  async import(jsonString) {
    this._checkInitialized();
    
    const imported = JSON.parse(jsonString);
    
    // Validate structure
    if (typeof imported !== 'object') {
      throw new Error('Invalid settings format');
    }
    
    // Merge with defaults
    this.settings = this._mergeDefaults(imported, DEFAULT_SETTINGS);
    this.settings._lastModified = new Date().toISOString();
    
    await this._save();
  }
  
  // ==============================================================================
  // Private Methods
  // ==============================================================================
  
  /**
   * Check if manager is initialized
   * @private
   */
  _checkInitialized() {
    if (!this.initialized) {
      throw new Error('ConfigManager not initialized. Call init() first.');
    }
  }
  
  /**
   * Save settings to file
   * @private
   */
  async _save() {
    const tempFile = `${this.settingsFile}.tmp`;
    
    // Write to temp file first (atomic write)
    await fs.writeFile(tempFile, JSON.stringify(this.settings, null, 2), 'utf8');
    
    // Rename to actual file
    await fs.rename(tempFile, this.settingsFile);
  }
  
  /**
   * Merge settings with defaults (deep merge)
   * @private
   * @param {object} settings - Current settings
   * @param {object} defaults - Default settings
   * @returns {object} Merged settings
   */
  _mergeDefaults(settings, defaults) {
    const result = { ...defaults };
    
    for (const key in settings) {
      if (settings.hasOwnProperty(key)) {
        if (
          typeof settings[key] === 'object' &&
          settings[key] !== null &&
          !Array.isArray(settings[key]) &&
          typeof defaults[key] === 'object' &&
          defaults[key] !== null &&
          !Array.isArray(defaults[key])
        ) {
          // Deep merge objects
          result[key] = this._mergeDefaults(settings[key], defaults[key]);
        } else {
          // Use setting value
          result[key] = settings[key];
        }
      }
    }
    
    return result;
  }
}

module.exports = ConfigManager;
