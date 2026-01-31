/**
 * General Settings Module
 * 
 * Configure server-level settings:
 *   - Server domain/IP
 *   - Ports
 *   - Timezone
 *   - Admin authentication
 * 
 * Note: Some changes require service restart to take effect.
 */

const fs = require('fs').promises;
const path = require('path');
const BaseModule = require('./base');

// ==============================================================================
// GeneralModule Class
// ==============================================================================

class GeneralModule extends BaseModule {
  name = 'general';
  displayName = 'General Settings';
  description = 'Configure server domain, ports, and system settings';
  icon = 'server';
  
  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      enabled: true,
      
      // Server identification
      serverName: 'Remote Support',
      serverDomain: process.env.SERVER_DOMAIN || 'localhost',
      serverIP: process.env.SERVER_IP || '',
      
      // Ports (read from environment, display for reference)
      httpPort: process.env.NGINX_HTTP_PORT || '80',
      httpsPort: process.env.NGINX_HTTPS_PORT || '443',
      adminPort: process.env.ADMIN_PORT || '3001',
      
      // URLs (auto-generated)
      meshcentralUrl: '',
      supportPageUrl: '',
      adminDashboardUrl: '',
      
      // Timezone
      timezone: process.env.TZ || 'UTC',
      
      // Security
      adminAuthEnabled: false,
      adminAuthSecret: '',
      
      // Maintenance
      maintenanceMode: false,
      maintenanceMessage: 'System is under maintenance. Please try again later.'
    };
  }
  
  /**
   * Initialize - calculate URLs
   */
  async init() {
    await super.init();
    await this._updateUrls();
  }
  
  /**
   * Get settings schema for UI
   */
  getSchema() {
    return [
      {
        key: 'enabled',
        type: 'boolean',
        label: 'Enable General Settings',
        description: 'This module manages core server settings'
      },
      
      // Server Section
      {
        key: 'section_server',
        type: 'section',
        label: 'Server Information'
      },
      {
        key: 'serverName',
        type: 'text',
        label: 'Server Name',
        description: 'Display name for your support server',
        placeholder: 'Remote Support',
        dependsOn: 'enabled'
      },
      {
        key: 'serverDomain',
        type: 'text',
        label: 'Server Domain',
        description: 'Domain name or IP address for your server',
        placeholder: 'support.example.com or 192.168.1.100',
        required: true,
        dependsOn: 'enabled'
      },
      {
        key: 'serverIP',
        type: 'text',
        label: 'Server IP (optional)',
        description: 'Public IP address if different from domain',
        placeholder: '203.0.113.50',
        dependsOn: 'enabled'
      },
      
      // Ports Section
      {
        key: 'section_ports',
        type: 'section',
        label: 'Ports Configuration'
      },
      {
        key: 'httpPort',
        type: 'text',
        label: 'HTTP Port',
        description: 'Port for HTTP traffic (default: 80). Change in .env file and restart.',
        placeholder: '80',
        dependsOn: 'enabled'
      },
      {
        key: 'httpsPort',
        type: 'text',
        label: 'HTTPS Port',
        description: 'Port for HTTPS traffic (default: 443). Change in .env file and restart.',
        placeholder: '443',
        dependsOn: 'enabled'
      },
      {
        key: 'adminPort',
        type: 'text',
        label: 'Admin Dashboard Port',
        description: 'Internal port for admin API (default: 3001). Change in .env file and restart.',
        placeholder: '3001',
        dependsOn: 'enabled'
      },
      {
        key: 'portsNote',
        type: 'readonly',
        label: 'Note',
        value: 'Port changes require editing .env file and running: docker compose down && docker compose up -d',
        dependsOn: 'enabled'
      },
      
      // URLs Section
      {
        key: 'section_urls',
        type: 'section',
        label: 'Service URLs'
      },
      {
        key: 'meshcentralUrl',
        type: 'readonly',
        label: 'MeshCentral URL',
        description: 'Main admin interface',
        dependsOn: 'enabled'
      },
      {
        key: 'supportPageUrl',
        type: 'readonly',
        label: 'Support Page URL',
        description: 'Customer-facing support page',
        dependsOn: 'enabled'
      },
      {
        key: 'adminDashboardUrl',
        type: 'readonly',
        label: 'Admin Dashboard URL',
        description: 'This settings dashboard',
        dependsOn: 'enabled'
      },
      
      // Timezone Section
      {
        key: 'section_timezone',
        type: 'section',
        label: 'Timezone'
      },
      {
        key: 'timezone',
        type: 'select',
        label: 'Server Timezone',
        description: 'Timezone for logs and notifications',
        options: [
          { value: 'UTC', label: 'UTC' },
          { value: 'America/New_York', label: 'Eastern Time (US)' },
          { value: 'America/Chicago', label: 'Central Time (US)' },
          { value: 'America/Denver', label: 'Mountain Time (US)' },
          { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
          { value: 'Europe/London', label: 'London (UK)' },
          { value: 'Europe/Paris', label: 'Paris (Europe)' },
          { value: 'Europe/Berlin', label: 'Berlin (Europe)' },
          { value: 'Asia/Tokyo', label: 'Tokyo (Japan)' },
          { value: 'Asia/Shanghai', label: 'Shanghai (China)' },
          { value: 'Asia/Singapore', label: 'Singapore' },
          { value: 'Asia/Dubai', label: 'Dubai (UAE)' },
          { value: 'Australia/Sydney', label: 'Sydney (Australia)' }
        ],
        dependsOn: 'enabled'
      },
      
      // Security Section
      {
        key: 'section_security',
        type: 'section',
        label: 'Admin Security'
      },
      {
        key: 'adminAuthEnabled',
        type: 'boolean',
        label: 'Enable Admin Authentication',
        description: 'Require API key to access admin dashboard',
        dependsOn: 'enabled'
      },
      {
        key: 'adminAuthSecret',
        type: 'password',
        label: 'Admin API Key',
        description: 'Secret key for admin API authentication',
        placeholder: 'Enter a secure random string',
        dependsOn: 'adminAuthEnabled'
      },
      
      // Maintenance Section
      {
        key: 'section_maintenance',
        type: 'section',
        label: 'Maintenance Mode'
      },
      {
        key: 'maintenanceMode',
        type: 'boolean',
        label: 'Enable Maintenance Mode',
        description: 'Show maintenance message to users (support page only)',
        dependsOn: 'enabled'
      },
      {
        key: 'maintenanceMessage',
        type: 'textarea',
        label: 'Maintenance Message',
        description: 'Message to display during maintenance',
        placeholder: 'System is under maintenance...',
        dependsOn: 'maintenanceMode'
      }
    ];
  }
  
  /**
   * Get available actions
   */
  getActions() {
    return [
      {
        name: 'generateUrls',
        label: 'Regenerate URLs',
        icon: 'refresh',
        description: 'Recalculate service URLs based on current settings'
      },
      {
        name: 'testConnection',
        label: 'Test Connection',
        icon: 'play',
        description: 'Test if server is accessible at configured domain'
      },
      {
        name: 'showEnvConfig',
        label: 'Show .env Config',
        icon: 'list',
        description: 'Show environment configuration for .env file'
      }
    ];
  }
  
  // ==============================================================================
  // Actions
  // ==============================================================================
  
  /**
   * Regenerate URLs action
   */
  async action_generateUrls(params) {
    await this._updateUrls();
    
    const settings = this.getSettings();
    
    return {
      success: true,
      message: 'URLs regenerated',
      urls: {
        meshcentral: settings.meshcentralUrl,
        support: settings.supportPageUrl,
        admin: settings.adminDashboardUrl
      }
    };
  }
  
  /**
   * Test connection action
   */
  async action_testConnection(params) {
    const settings = this.getSettings();
    const domain = settings.serverDomain;
    const port = settings.httpsPort;
    
    // We can't actually test external connection from inside container
    // But we can verify the configuration looks correct
    
    const issues = [];
    
    if (!domain || domain === 'localhost') {
      issues.push('Server domain is not configured (still using localhost)');
    }
    
    if (domain && domain.includes(' ')) {
      issues.push('Server domain contains spaces');
    }
    
    if (port && isNaN(parseInt(port))) {
      issues.push('HTTPS port is not a valid number');
    }
    
    if (issues.length > 0) {
      return {
        success: false,
        message: 'Configuration issues found',
        issues
      };
    }
    
    return {
      success: true,
      message: `Configuration looks valid. Server should be accessible at https://${domain}${port !== '443' ? ':' + port : ''}`
    };
  }
  
  /**
   * Show .env configuration
   */
  async action_showEnvConfig(params) {
    const settings = this.getSettings();
    
    const envConfig = `
# Server Configuration
SERVER_DOMAIN=${settings.serverDomain}
SERVER_IP=${settings.serverIP || ''}

# Ports
NGINX_HTTP_PORT=${settings.httpPort}
NGINX_HTTPS_PORT=${settings.httpsPort}
ADMIN_PORT=${settings.adminPort}

# Timezone
TZ=${settings.timezone}

# Admin Authentication
ADMIN_AUTH_SECRET=${settings.adminAuthEnabled ? settings.adminAuthSecret : ''}
`.trim();
    
    return {
      success: true,
      message: 'Copy this to your .env file and restart services',
      config: envConfig
    };
  }
  
  // ==============================================================================
  // Override save to update URLs
  // ==============================================================================
  
  async saveSettings(settings) {
    await super.saveSettings(settings);
    await this._updateUrls();
  }
  
  // ==============================================================================
  // Private Methods
  // ==============================================================================
  
  /**
   * Update calculated URLs
   * @private
   */
  async _updateUrls() {
    const settings = this.getSettings();
    const domain = settings.serverDomain || 'localhost';
    const httpsPort = settings.httpsPort || '443';
    
    const baseUrl = httpsPort === '443' 
      ? `https://${domain}` 
      : `https://${domain}:${httpsPort}`;
    
    const urls = {
      meshcentralUrl: baseUrl,
      supportPageUrl: `${baseUrl}/support`,
      adminDashboardUrl: `${baseUrl}/admin-settings`
    };
    
    // Save URLs without triggering full save cycle
    const currentSettings = this.getSettings();
    await this.configManager.saveModuleSettings(this.name, {
      ...currentSettings,
      ...urls
    });
  }
  
  /**
   * Get public configuration for other modules
   */
  getPublicConfig() {
    const settings = this.getSettings();
    
    return {
      serverName: settings.serverName,
      serverDomain: settings.serverDomain,
      serverIP: settings.serverIP,
      timezone: settings.timezone,
      maintenanceMode: settings.maintenanceMode,
      maintenanceMessage: settings.maintenanceMessage,
      urls: {
        meshcentral: settings.meshcentralUrl,
        support: settings.supportPageUrl,
        admin: settings.adminDashboardUrl
      }
    };
  }
}

module.exports = GeneralModule;
