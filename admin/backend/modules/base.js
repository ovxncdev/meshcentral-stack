/**
 * Base Module
 * 
 * All feature modules must extend this class.
 * Provides a consistent interface for:
 *   - Settings management
 *   - Schema definition (for auto-generating UI)
 *   - Actions (test, execute, etc.)
 *   - Event handling (webhooks)
 * 
 * To create a new module:
 * 
 *   class MyModule extends BaseModule {
 *     name = 'mymodule';
 *     displayName = 'My Module';
 *     description = 'Does something cool';
 *     icon = 'star';
 *     
 *     getDefaultSettings() {
 *       return { enabled: false, setting1: '' };
 *     }
 *     
 *     getSchema() {
 *       return [
 *         { key: 'enabled', type: 'boolean', label: 'Enabled' },
 *         { key: 'setting1', type: 'text', label: 'Setting 1' }
 *       ];
 *     }
 *   }
 */

// ==============================================================================
// Schema Field Types
// ==============================================================================

/**
 * Supported field types for settings schema:
 * 
 * - text:      Single line text input
 * - textarea:  Multi-line text input
 * - password:  Password input (masked)
 * - number:    Numeric input
 * - boolean:   Toggle switch
 * - select:    Dropdown selection
 * - color:     Color picker
 * - file:      File upload
 * - group:     Group of fields (nested)
 * 
 * Field schema structure:
 * {
 *   key: 'fieldName',           // Required: Setting key
 *   type: 'text',               // Required: Field type
 *   label: 'Field Label',       // Required: Display label
 *   description: 'Help text',   // Optional: Description/help
 *   placeholder: 'Enter...',    // Optional: Placeholder text
 *   required: false,            // Optional: Is required
 *   default: '',                // Optional: Default value
 *   options: [],                // Required for 'select': { value, label }[]
 *   validation: {},             // Optional: Validation rules
 *   dependsOn: 'otherField',    // Optional: Only show if otherField is truthy
 * }
 */

// ==============================================================================
// BaseModule Class
// ==============================================================================

class BaseModule {
  // Override these in subclass
  name = 'base';
  displayName = 'Base Module';
  description = 'Base module description';
  icon = 'settings'; // Icon name for UI
  
  /**
   * Create a new module instance
   * @param {ConfigManager} configManager - Config manager instance
   */
  constructor(configManager) {
    this.configManager = configManager;
    this._initialized = false;
  }
  
  /**
   * Initialize the module
   * Override for custom initialization logic
   */
  async init() {
    this._initialized = true;
  }
  
  /**
   * Get default settings for this module
   * Override in subclass
   * @returns {object}
   */
  getDefaultSettings() {
    return {
      enabled: false
    };
  }
  
  /**
   * Get settings schema for UI generation
   * Override in subclass
   * @returns {Array<object>}
   */
  getSchema() {
    return [
      {
        key: 'enabled',
        type: 'boolean',
        label: 'Enabled',
        description: 'Enable or disable this module'
      }
    ];
  }
  
  /**
   * Get available actions for this module
   * Override in subclass
   * @returns {Array<object>}
   */
  getActions() {
    return [
      // Example:
      // {
      //   name: 'test',
      //   label: 'Test Connection',
      //   icon: 'play',
      //   description: 'Send a test message'
      // }
    ];
  }
  
  /**
   * Get events this module handles
   * Override in subclass
   * @returns {Array<string>}
   */
  getHandledEvents() {
    return [
      // Example:
      // 'device.connect',
      // 'device.disconnect',
      // 'support.request'
    ];
  }
  
  // ==============================================================================
  // Settings Methods
  // ==============================================================================
  
  /**
   * Get current settings for this module
   * @returns {object}
   */
  getSettings() {
    return this.configManager.getModuleSettings(this.name);
  }
  
  /**
   * Get a specific setting
   * @param {string} key - Setting key
   * @param {any} defaultValue - Default value
   * @returns {any}
   */
  getSetting(key, defaultValue = null) {
    const settings = this.getSettings();
    return settings[key] !== undefined ? settings[key] : defaultValue;
  }
  
  /**
   * Save settings for this module
   * @param {object} settings - Settings to save
   */
  async saveSettings(settings) {
    // Validate settings
    const errors = this.validateSettings(settings);
    if (errors.length > 0) {
      const error = new Error('Validation failed');
      error.validationErrors = errors;
      throw error;
    }
    
    // Merge with existing settings
    const current = this.getSettings();
    const merged = { ...current, ...settings };
    
    await this.configManager.saveModuleSettings(this.name, merged);
  }
  
  /**
   * Check if module is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return this.getSetting('enabled', false);
  }
  
  /**
   * Enable or disable the module
   * @param {boolean} enabled
   */
  async setEnabled(enabled) {
    await this.saveSettings({ enabled });
  }
  
  // ==============================================================================
  // Validation
  // ==============================================================================
  
  /**
   * Validate settings against schema
   * @param {object} settings - Settings to validate
   * @returns {Array<object>} Validation errors
   */
  validateSettings(settings) {
    const errors = [];
    const schema = this.getSchema();
    
    for (const field of schema) {
      const value = settings[field.key];
      
      // Check required
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: field.key,
          message: `${field.label} is required`
        });
        continue;
      }
      
      // Skip validation if empty and not required
      if (value === undefined || value === null || value === '') {
        continue;
      }
      
      // Type validation
      if (field.validation) {
        const typeError = this._validateType(value, field);
        if (typeError) {
          errors.push({
            field: field.key,
            message: typeError
          });
        }
      }
    }
    
    return errors;
  }
  
  /**
   * Validate field type and rules
   * @private
   */
  _validateType(value, field) {
    const { validation } = field;
    
    if (validation.minLength && value.length < validation.minLength) {
      return `${field.label} must be at least ${validation.minLength} characters`;
    }
    
    if (validation.maxLength && value.length > validation.maxLength) {
      return `${field.label} must be at most ${validation.maxLength} characters`;
    }
    
    if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
      return validation.patternMessage || `${field.label} format is invalid`;
    }
    
    if (validation.min !== undefined && Number(value) < validation.min) {
      return `${field.label} must be at least ${validation.min}`;
    }
    
    if (validation.max !== undefined && Number(value) > validation.max) {
      return `${field.label} must be at most ${validation.max}`;
    }
    
    return null;
  }
  
  // ==============================================================================
  // Actions
  // ==============================================================================
  
  /**
   * Execute an action
   * @param {string} actionName - Action name
   * @param {object} params - Action parameters
   * @returns {Promise<object>} Action result
   */
  async executeAction(actionName, params = {}) {
    const methodName = `action_${actionName}`;
    
    if (typeof this[methodName] !== 'function') {
      throw new Error(`Unknown action: ${actionName}`);
    }
    
    return await this[methodName](params);
  }
  
  // ==============================================================================
  // Event Handling
  // ==============================================================================
  
  /**
   * Check if this module handles an event type
   * @param {string} eventType - Event type
   * @returns {boolean}
   */
  handlesEvent(eventType) {
    return this.getHandledEvents().includes(eventType);
  }
  
  /**
   * Handle an event
   * Override in subclass
   * @param {string} eventType - Event type
   * @param {object} payload - Event payload
   * @returns {Promise<object>} Result
   */
  async handleEvent(eventType, payload) {
    // Override in subclass
    return { handled: false };
  }
}

module.exports = BaseModule;
