/**
 * API Client
 * 
 * Handles all communication with the backend API.
 * Includes authentication and role-based endpoints.
 * 
 * Usage:
 *   const auth = await API.getAuthStatus();
 *   const modules = await API.getModules();
 *   await API.saveModuleSettings('telegram', { enabled: true });
 */

const API = (function() {
  // ==============================================================================
  // Configuration
  // ==============================================================================
  
  /**
   * Get base URL - automatically detect from current location
   */
  const getBaseUrl = () => {
    // Check if custom URL is set
    if (window.API_BASE_URL) {
      return window.API_BASE_URL;
    }
    
    // Auto-detect based on current path
    const path = window.location.pathname;
    
    // Handle /my-settings path
    if (path.startsWith('/my-settings')) {
      return '/my-settings/api';
    }
    
    // Handle /admin-settings path (backward compatibility)
    if (path.startsWith('/admin-settings')) {
      return '/admin-settings/api';
    }
    
    return '/api';
  };
  
  // Default request options
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include' // Important: Include cookies for MeshCentral session
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
    
    try {
      const response = await fetch(url, fetchOptions);
      
      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        
        if (!response.ok) {
          const error = new Error(data.error || `HTTP ${response.status}`);
          error.status = response.status;
          error.data = data;
          throw error;
        }
        
        return data;
      } else {
        // Non-JSON response (e.g., file download)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response;
      }
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
    // Authentication
    // ==========================================================================
    
    /**
     * Get current authentication status
     * @returns {Promise<object>} Auth status with user info
     */
    async getAuthStatus() {
      return get('/auth/me');
    },
    
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
     * Get all available modules
     * @returns {Promise<object>} Modules list with admin flag
     */
    async getModules() {
      return get('/modules');
    },
    
    /**
     * Get a specific module's details and settings
     * @param {string} name - Module name
     * @returns {Promise<object>} Module details
     */
    async getModule(name) {
      return get(`/modules/${name}`);
    },
    
    /**
     * Save module settings
     * @param {string} name - Module name
     * @param {object} settings - Settings to save
     * @returns {Promise<object>} Result
     */
    async saveModuleSettings(name, settings) {
      return post(`/modules/${name}`, settings);
    },
    
    /**
     * Execute a module action
     * @param {string} moduleName - Module name
     * @param {string} actionName - Action name
     * @param {object} params - Action parameters
     * @returns {Promise<object>} Action result
     */
    async executeAction(moduleName, actionName, params = {}) {
      const response = await post(`/modules/${moduleName}/action/${actionName}`, params);
      return response.result || response;
    },
    
    // ==========================================================================
    // User's Own Settings (Telegram)
    // ==========================================================================
    
    /**
     * Get current user's telegram settings
     * @returns {Promise<object>} Telegram settings
     */
    async getMyTelegramSettings() {
      return get('/telegram/my-settings');
    },
    
    /**
     * Save current user's telegram settings
     * @param {object} settings - Settings to save
     * @returns {Promise<object>} Result
     */
    async saveMyTelegramSettings(settings) {
      return post('/telegram/my-settings', settings);
    },
    
    /**
     * Test current user's telegram configuration
     * @returns {Promise<object>} Test result
     */
    async testMyTelegram() {
      return post('/telegram/my-settings/test', {});
    },
    
    // ==========================================================================
    // User's Own Files
    // ==========================================================================
    
    /**
     * Get current user's files
     * @returns {Promise<object>} Files list
     */
    async getMyFiles() {
      return get('/files/my');
    },
    
    /**
     * Upload a file
     * @param {FormData} formData - Form data with file
     * @returns {Promise<object>} Upload result
     */
    async uploadFile(formData) {
      const url = `${getBaseUrl()}/files/upload`;
      
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        credentials: 'include'
        // Note: Don't set Content-Type, let browser set it with boundary
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        const error = new Error(data.error || 'Upload failed');
        error.status = response.status;
        error.data = data;
        throw error;
      }
      
      return data;
    },
    
    /**
     * Delete a file
     * @param {string} fileId - File ID
     * @returns {Promise<object>} Result
     */
    async deleteFile(fileId) {
      return del(`/files/${fileId}`);
    },
    
    /**
     * Update a file's properties
     * @param {string} fileId - File ID
     * @param {object} updates - Properties to update
     * @returns {Promise<object>} Updated file
     */
    async updateFile(fileId, updates) {
      return put(`/files/${fileId}`, updates);
    },
    
    // ==========================================================================
    // Admin - Users
    // ==========================================================================
    
    /**
     * Get all users (admin only)
     * @returns {Promise<object>} Users list
     */
    async getUsers() {
      return get('/admin/users');
    },
    
    /**
     * Get specific user's settings (admin only)
     * @param {string} userId - User ID
     * @returns {Promise<object>} User details
     */
    async getUser(userId) {
      return get(`/admin/users/${encodeURIComponent(userId)}`);
    },
    
    /**
     * Update a user's settings (admin only)
     * @param {string} userId - User ID
     * @param {object} updates - Settings to update
     * @returns {Promise<object>} Result
     */
    async updateUser(userId, updates) {
      return put(`/admin/users/${encodeURIComponent(userId)}`, updates);
    },
    
    // ==========================================================================
    // Admin - Devices
    // ==========================================================================
    
    /**
     * Get all devices organized by user (admin only)
     * @returns {Promise<object>} Devices by user
     */
    async getDevices() {
      return get('/admin/devices');
    },
    
    // ==========================================================================
    // Admin - Files
    // ==========================================================================
    
    /**
     * Get all files from all users (admin only)
     * @returns {Promise<object>} All files
     */
    async getAllFiles() {
      return get('/admin/files');
    },
    
    /**
     * Get file storage statistics (admin only)
     * @returns {Promise<object>} Storage stats
     */
    async getFileStats() {
      return get('/admin/files/stats');
    },
    
    /**
     * Clean up expired files (admin only)
     * @returns {Promise<object>} Cleanup result
     */
    async cleanupFiles() {
      return post('/admin/files/cleanup', {});
    },
    
    // ==========================================================================
    // Admin - Export/Import
    // ==========================================================================
    
    /**
     * Export all settings (admin only)
     * @returns {Promise<Response>} File download response
     */
    async exportSettings() {
      return get('/admin/export');
    },
    
    /**
     * Import settings (admin only)
     * @param {object} data - Settings data to import
     * @returns {Promise<object>} Import result
     */
    async importSettings(data) {
      return post('/admin/import', data);
    },
    
    // ==========================================================================
    // Branding (Public)
    // ==========================================================================
    
    /**
     * Get branding data (public)
     * @returns {Promise<object>} Branding settings
     */
    async getBranding() {
      return get('/branding');
    },
    
    // ==========================================================================
    // Webhooks
    // ==========================================================================
    
    /**
     * Get webhook logs (admin only)
     * @returns {Promise<object>} Recent webhook events
     */
    async getWebhookLogs() {
      return this.executeAction('webhook', 'viewLogs');
    },
    
    /**
     * Clear webhook logs (admin only)
     * @returns {Promise<object>} Result
     */
    async clearWebhookLogs() {
      return this.executeAction('webhook', 'clearLogs');
    },
    
    // ==========================================================================
    // Utilities
    // ==========================================================================
    
    /**
     * Make a generic request (for custom endpoints)
     * @param {string} endpoint - API endpoint
     * @param {object} options - Fetch options
     * @returns {Promise<object>} Response data
     */
    request,
    
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
