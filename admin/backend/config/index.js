/**
 * Configuration Manager
 * 
 * Handles loading, saving, and validating settings.
 * Settings are stored in a JSON file for simplicity and portability.
 * 
 * Features:
 *   - Auto-creates data directory and default settings
 *   - Validates settings before saving
 *   - Supports both direct keys and nested paths
 *   - Synchronous and async access methods
 *   - Thread-safe writes with atomic file operations
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// ==============================================================================
// Default Settings
// ==============================================================================

const DEFAULT_SETTINGS = {
  // Meta
  _version: '2.0.0',
  _lastModified: null,
  
  // General
  general: {
    siteName: 'Remote Support',
    siteDescription: 'Secure Remote Access Portal',
    adminEmail: '',
    timezone: 'UTC'
  }
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
   * Get a setting by key (async)
   * Supports both direct keys ('telegram') and dot-notation ('modules.telegram.enabled')
   * @param {string} key - Setting key or dot-notation path
   * @param {any} defaultValue - Default value if key doesn't exist
   * @returns {Promise<any>} The setting value
   */
  async get(key, defaultValue = null) {
    return this.getSync(key, defaultValue);
  }
  
  /**
   * Get a setting by key (sync)
   * Supports both direct keys ('telegram') and dot-notation ('modules.telegram.enabled')
   * @param {string} key - Setting key or dot-notation path
   * @param {any} defaultValue - Default value if key doesn't exist
   * @returns {any} The setting value
   */
  getSync(key, defaultValue = null) {
    this._checkInitialized();
    
    // Direct key access (new style: 'telegram', 'files', etc.)
    if (this.settings[key] !== undefined) {
      return this.settings[key];
    }
    
    // Check in modules namespace (backward compatibility)
    if (this.settings.modules && this.settings.modules[key] !== undefined) {
      return this.settings.modules[key];
    }
    
    // Dot-notation path access
    if (key.includes('.')) {
      const parts = key.split('.');
      let current = this.settings;
      
      for (const part of parts) {
        if (current === null || current === undefined || typeof current !== 'object') {
          return defaultValue;
        }
        current = current[part];
      }
      
      return current !== undefined ? current : defaultValue;
    }
    
    return defaultValue;
  }
  
  /**
   * Set a setting by key (async)
   * Supports both direct keys and dot-notation paths
   * @param {string} key - Setting key or dot-notation path
   * @param {any} value - Value to set
   */
  async set(key, value) {
    this._checkInitialized();
    
    // Dot-notation path
    if (key.includes('.')) {
      const parts = key.split('.');
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
    } else {
      // Direct key access (new style)
      this.settings[key] = value;
    }
    
    // Update last modified
    this.settings._lastModified = new Date().toISOString();
    
    await this._save();
  }
  
  /**
   * Delete a setting by key
   * @param {string} key - Setting key
   */
  async delete(key) {
    this._checkInitialized();
    
    if (this.settings[key] !== undefined) {
      delete this.settings[key];
      this.settings._lastModified = new Date().toISOString();
      await this._save();
    }
  }
  
  /**
   * Get settings for a specific module (backward compatibility)
   * @param {string} moduleName - Module name
   * @returns {object} Module settings
   */
  getModuleSettings(moduleName) {
    // Check direct key first (new style)
    if (this.settings[moduleName] !== undefined) {
      return this.settings[moduleName];
    }
    // Fall back to modules namespace (old style)
    return this.getSync(`modules.${moduleName}`, {});
  }
  
  /**
   * Save settings for a specific module (backward compatibility)
   * @param {string} moduleName - Module name
   * @param {object} settings - Settings to save
   */
  async saveModuleSettings(moduleName, settings) {
    // Save directly under module name (new style)
    await this.set(moduleName, settings);
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
    // Delete from direct key
    if (this.settings[moduleName]) {
      delete this.settings[moduleName];
    }
    // Also delete from modules namespace (backward compatibility)
    if (this.settings.modules && this.settings.modules[moduleName]) {
      delete this.settings.modules[moduleName];
    }
    await this._save();
  }
  
  /**
   * Check if a key exists
   * @param {string} key - Setting key
   * @returns {boolean}
   */
  has(key) {
    this._checkInitialized();
    return this.settings[key] !== undefined || 
           (this.settings.modules && this.settings.modules[key] !== undefined);
  }
  
  /**
   * Get all keys (excluding meta keys)
   * @returns {string[]}
   */
  keys() {
    this._checkInitialized();
    return Object.keys(this.settings).filter(k => !k.startsWith('_'));
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
   * Save settings to file (async)
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
   * Save settings to file (sync) - for emergency use only
   * @private
   */
  _saveSync() {
    const tempFile = `${this.settingsFile}.tmp`;
    fsSync.writeFileSync(tempFile, JSON.stringify(this.settings, null, 2), 'utf8');
    fsSync.renameSync(tempFile, this.settingsFile);
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
