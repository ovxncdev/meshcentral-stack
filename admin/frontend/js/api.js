/**
 * API Client
 * 
 * Handles all communication with the admin backend API.
 * Provides a clean interface for modules to interact with settings.
 * 
 * Usage:
 *   const modules = await API.getModules();
 *   await API.saveModuleSettings('telegram', { enabled: true });
 *   await API.executeAction('telegram', 'test');
 */

const API = (function() {
  // ==============================================================================
  // Configuration
  // ==============================================================================
  
  // Base URL - automatically detect from current location
  const getBaseUrl = () => {
    // If running on same server, use relative path
    // If running separately, configure via environment
    return window.API_BASE_URL || '/api';
  };
  
  // Default request options
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  // ==============================================================================
  // Helper Functions
  // ==============================================================================
  
  /**
   * Make an API request
   * @param {string} endpoint - API endpoint
   * @param {object} options - Fetch options
   * @returns {Promise<object>} Response data
   */
  async function request(endpoint, options = {}) {
    const url = `${getBaseUrl()}${endpoint}`;
    
    const fetchOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };
    
    // Add API key if configured
    const apiKey = window.API_KEY || localStorage.getItem('apiKey');
    if (apiKey) {
      fetchOptions.headers['X-API-Key'] = apiKey;
    }
    
    try {
      const response = await fetch(url, fetchOptions);
      const data = await response.json();
      
      if (!response.ok) {
        const error = new Error(data.error || `HTTP ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }
      
      return data;
    } catch (error) {
      if (error.status) {
        throw error;
      }
      // Network error
      throw new Error(`Network error: ${error.message}`);
    }
  }
  
  /**
   * GET request
   */
  async function get(endpoint) {
    return request(endpoint, { method: 'GET' });
  }
  
  /**
   * POST request
   */
  async function post(endpoint, data) {
    return request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  /**
   * PUT request
   */
  async function put(endpoint, data) {
    return request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
  
  /**
   * DELETE request
   */
  async function del(endpoint) {
    return request(endpoint, { method: 'DELETE' });
  }
  
  // ==============================================================================
  // Public API
  // ==============================================================================
  
  return {
    // ==========================================================================
    // Health
    // ==========================================================================
    
    /**
     * Check API health
     * @returns {Promise<object>} Health status
     */
    async health() {
      return get('/health');
    },
    
    // ==========================================================================
    // Modules
    // ==========================================================================
    
    /**
     * Get all modules
     * @returns {Promise<Array>} List of modules
     */
    async getModules() {
      const response = await get('/modules');
      return response.modules || [];
    },
    
    /**
     * Get a specific module
     * @param {string} name - Module name
     * @returns {Promise<object>} Module details
     */
    async getModule(name) {
      const response = await get(`/modules/${name}`);
      return response.module;
    },
    
    /**
     * Get module settings
     * @param {string} name - Module name
     * @returns {Promise<object>} Module settings
     */
    async getModuleSettings(name) {
      const response = await get(`/modules/${name}/settings`);
      return response.settings;
    },
    
    /**
     * Save module settings
     * @param {string} name - Module name
     * @param {object} settings - Settings to save
     * @returns {Promise<object>} Updated settings
     */
    async saveModuleSettings(name, settings) {
      const response = await put(`/modules/${name}/settings`, settings);
      return response.settings;
    },
    
    /**
     * Execute a module action
     * @param {string} moduleName - Module name
     * @param {string} actionName - Action name
     * @param {object} params - Action parameters
     * @returns {Promise<object>} Action result
     */
    async executeAction(moduleName, actionName, params = {}) {
      const response = await post(`/modules/${moduleName}/actions/${actionName}`, params);
      return response.result;
    },
    
    // ==========================================================================
    // Global Settings
    // ==========================================================================
    
    /**
     * Get global settings
     * @returns {Promise<object>} Global settings
     */
    async getSettings() {
      const response = await get('/settings');
      return response.settings;
    },
    
    /**
     * Save global settings
     * @param {object} settings - Settings to save
     * @returns {Promise<void>}
     */
    async saveSettings(settings) {
      await put('/settings', settings);
    },
    
    // ==========================================================================
    // Import/Export
    // ==========================================================================
    
    /**
     * Export all settings
     * @returns {Promise<object>} All settings
     */
    async exportSettings() {
      const response = await get('/export');
      return response;
    },
    
    /**
     * Import settings
     * @param {object} settings - Settings to import
     * @returns {Promise<void>}
     */
    async importSettings(settings) {
      await post('/import', settings);
    },
    
    // ==========================================================================
    // Branding
    // ==========================================================================
    
    /**
     * Get branding data
     * @returns {Promise<object>} Branding settings
     */
    async getBranding() {
      const response = await get('/branding');
      return response.branding;
    },
    
    // ==========================================================================
    // Webhooks
    // ==========================================================================
    
    /**
     * Test webhook event
     * @param {string} eventType - Event type to simulate
     * @param {object} payload - Event payload
     * @returns {Promise<object>} Test results
     */
    async testWebhook(eventType, payload = {}) {
      const response = await post('/webhook/test', { eventType, payload });
      return response;
    },
    
    // ==========================================================================
    // Utilities
    // ==========================================================================
    
    /**
     * Set API key for authentication
     * @param {string} key - API key
     */
    setApiKey(key) {
      if (key) {
        localStorage.setItem('apiKey', key);
      } else {
        localStorage.removeItem('apiKey');
      }
    },
    
    /**
     * Set custom base URL
     * @param {string} url - Base URL
     */
    setBaseUrl(url) {
      window.API_BASE_URL = url;
    },
    
    /**
     * Get current base URL
     * @returns {string} Base URL
     */
    getBaseUrl() {
      return getBaseUrl();
    }
  };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
