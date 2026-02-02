/**
 * Webhook Module
 * 
 * Handles incoming webhooks from MeshCentral and triggers
 * notifications to other modules (Telegram, Email, etc.)
 * 
 * MeshCentral webhook events:
 *   - device.connect
 *   - device.disconnect
 *   - user.login
 *   - user.logout
 *   - session.start
 *   - session.end
 * 
 * Also provides outgoing webhooks to external services.
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ==============================================================================
// WebhookModule Class
// ==============================================================================

class WebhookModule {
  constructor(configManager) {
    this.configManager = configManager;
    this.name = 'webhook';
    this.displayName = 'Webhooks';
    this.description = 'Configure incoming and outgoing webhooks';
    this.icon = 'link';
    this._initialized = false;
  }

  /**
   * Initialize the module
   */
  async init() {
    // Ensure default settings exist
    const settings = await this.getSettings();
    if (!settings.incomingSecret) {
      await this.saveSettings({ incomingSecret: this._generateSecret() });
    }
    this._initialized = true;
  }

  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      enabled: true,
      
      // Incoming webhook (from MeshCentral)
      incomingEnabled: true,
      incomingSecret: '',
      
      // Webhook endpoint configuration
      webhookProtocol: 'http',
      webhookHost: 'admin',
      webhookPort: '',
      
      // Outgoing webhooks (to external services)
      outgoingEnabled: false,
      outgoingWebhooks: [],
      
      // Event mapping
      eventMapping: {
        'serverConnect': 'device.connect',
        'serverDisconnect': 'device.disconnect',
        'userLogin': 'user.login',
        'userLogout': 'user.logout'
      },
      
      // Logging
      logEvents: true,
      maxLogEntries: 100
    };
  }

  /**
   * Get settings schema for UI
   */
  getSchema() {
    return {
      title: 'Webhook Settings',
      description: 'Configure incoming and outgoing webhooks',
      type: 'object',
      sections: [
        {
          title: 'Incoming Webhooks (from MeshCentral)',
          fields: ['enabled', 'incomingEnabled', 'incomingSecret', 'webhookProtocol', 'webhookHost', 'webhookPort']
        },
        {
          title: 'Outgoing Webhooks (to External Services)',
          fields: ['outgoingEnabled', 'outgoingWebhooks']
        },
        {
          title: 'Logging',
          fields: ['logEvents', 'maxLogEntries']
        }
      ],
      properties: {
        enabled: {
          type: 'boolean',
          title: 'Enable Webhooks',
          description: 'Enable webhook functionality',
          default: true
        },
        incomingEnabled: {
          type: 'boolean',
          title: 'Enable Incoming Webhooks',
          description: 'Accept webhooks from MeshCentral',
          dependsOn: 'enabled'
        },
        incomingSecret: {
          type: 'password',
          title: 'Webhook Secret',
          description: 'Secret key to verify webhook requests (auto-generated)',
          dependsOn: 'incomingEnabled'
        },
        webhookProtocol: {
          type: 'select',
          title: 'Protocol',
          description: 'Protocol for webhook URL',
          options: [
            { value: 'http', label: 'HTTP' },
            { value: 'https', label: 'HTTPS' }
          ],
          dependsOn: 'incomingEnabled'
        },
        webhookHost: {
          type: 'string',
          title: 'Webhook Host',
          description: 'Hostname or IP for webhook URL (use "admin" for Docker internal)',
          placeholder: 'admin or 192.168.1.100',
          dependsOn: 'incomingEnabled'
        },
        webhookPort: {
          type: 'string',
          title: 'Webhook Port',
          description: 'Port number for webhook URL (leave empty for default)',
          placeholder: '3001',
          dependsOn: 'incomingEnabled'
        },
        outgoingEnabled: {
          type: 'boolean',
          title: 'Enable Outgoing Webhooks',
          description: 'Send events to external URLs',
          dependsOn: 'enabled'
        },
        outgoingWebhooks: {
          type: 'array',
          title: 'Webhook Endpoints',
          description: 'External URLs to receive events',
          dependsOn: 'outgoingEnabled',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', title: 'Name', placeholder: 'My Webhook' },
              url: { type: 'string', title: 'URL', placeholder: 'https://example.com/webhook' },
              events: {
                type: 'array',
                title: 'Events',
                items: { type: 'string' },
                options: [
                  { value: 'device.connect', label: 'Device Connect' },
                  { value: 'device.disconnect', label: 'Device Disconnect' },
                  { value: 'user.login', label: 'User Login' },
                  { value: 'support.request', label: 'Support Request' }
                ]
              },
              secret: { type: 'string', title: 'Secret (optional)', placeholder: 'Shared secret for HMAC' },
              enabled: { type: 'boolean', title: 'Enabled', default: true }
            }
          }
        },
        logEvents: {
          type: 'boolean',
          title: 'Log Webhook Events',
          description: 'Keep a log of received webhook events',
          default: true,
          dependsOn: 'enabled'
        },
        maxLogEntries: {
          type: 'number',
          title: 'Max Log Entries',
          description: 'Maximum number of log entries to keep',
          default: 100,
          minimum: 10,
          maximum: 1000,
          dependsOn: 'logEvents'
        }
      },
      actions: [
        {
          name: 'regenerateSecret',
          title: 'Regenerate Secret',
          icon: 'refresh',
          description: 'Generate a new webhook secret',
          confirm: 'This will invalidate the current secret. Continue?'
        },
        {
          name: 'testOutgoing',
          title: 'Test Outgoing Webhook',
          icon: 'send',
          description: 'Send a test event to all enabled outgoing webhooks'
        },
        {
          name: 'viewLogs',
          title: 'View Logs',
          icon: 'list',
          description: 'View recent webhook events'
        },
        {
          name: 'clearLogs',
          title: 'Clear Logs',
          icon: 'trash',
          description: 'Clear webhook event logs',
          confirm: 'Clear all webhook logs?'
        }
      ]
    };
  }

  /**
   * Get available actions
   */
  getActions() {
    return this.getSchema().actions || [];
  }

  /**
   * Get events this module handles
   */
  getHandledEvents() {
    return [
      'device.connect',
      'device.disconnect',
      'user.login',
      'user.logout',
      'support.request'
    ];
  }

  // ==============================================================================
  // Settings Methods
  // ==============================================================================

  /**
   * Get current settings
   */
  async getSettings() {
    const saved = await this.configManager.get('webhook');
    return { ...this.getDefaultSettings(), ...saved };
  }

  /**
   * Get settings synchronously (for compatibility)
   */
  getSettingsSync() {
    const saved = this.configManager.getSync('webhook') || {};
    return { ...this.getDefaultSettings(), ...saved };
  }

  /**
   * Save settings
   */
  async saveSettings(newSettings) {
    const current = await this.getSettings();
    const merged = { ...current, ...newSettings, updatedAt: new Date().toISOString() };
    await this.configManager.set('webhook', merged);
    return { success: true };
  }

  /**
   * Check if module is enabled
   */
  isEnabled() {
    const settings = this.getSettingsSync();
    return settings.enabled !== false;
  }

  // ==============================================================================
  // Actions
  // ==============================================================================

  /**
   * Execute an action
   */
  async executeAction(action, params = {}, user = null) {
    // Check admin for sensitive actions
    const adminActions = ['regenerateSecret', 'clearLogs'];
    if (adminActions.includes(action) && user && !user.isAdmin) {
      throw new Error('Admin access required');
    }

    switch (action) {
      case 'regenerateSecret':
        return this._actionRegenerateSecret(params);
      case 'testOutgoing':
        return this._actionTestOutgoing(params);
      case 'viewLogs':
        return this._actionViewLogs(params);
      case 'clearLogs':
        return this._actionClearLogs(params);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Regenerate webhook secret
   */
  async _actionRegenerateSecret(params) {
    const newSecret = this._generateSecret();
    await this.saveSettings({ incomingSecret: newSecret });
    
    return {
      success: true,
      message: 'Webhook secret regenerated',
      secret: newSecret
    };
  }

  /**
   * Test outgoing webhooks
   */
  async _actionTestOutgoing(params) {
    const settings = await this.getSettings();
    
    if (!settings.outgoingEnabled) {
      throw new Error('Outgoing webhooks are not enabled');
    }
    
    const webhooks = settings.outgoingWebhooks || [];
    const enabledWebhooks = webhooks.filter(w => w.enabled);
    
    if (enabledWebhooks.length === 0) {
      throw new Error('No enabled outgoing webhooks configured');
    }
    
    const testPayload = {
      event: 'test',
      message: 'This is a test webhook from Remote Support',
      timestamp: new Date().toISOString()
    };
    
    const results = [];
    for (const webhook of enabledWebhooks) {
      try {
        await this._sendOutgoingWebhook(webhook, testPayload);
        results.push({ name: webhook.name, success: true });
      } catch (error) {
        results.push({ name: webhook.name, success: false, error: error.message });
      }
    }
    
    return {
      success: true,
      message: `Tested ${enabledWebhooks.length} webhook(s)`,
      results
    };
  }

  /**
   * Clear webhook logs
   */
  async _actionClearLogs(params) {
    await this.saveSettings({ _eventLog: [] });
    
    return {
      success: true,
      message: 'Webhook logs cleared'
    };
  }

  /**
   * View webhook logs
   */
  async _actionViewLogs(params) {
    const settings = await this.getSettings();
    const logs = settings._eventLog || [];
    
    return {
      success: true,
      logs: logs.slice(-50) // Return last 50 entries
    };
  }

  // ==============================================================================
  // Incoming Webhook Processing
  // ==============================================================================

  /**
   * Process incoming webhook from MeshCentral
   * @param {object} payload - Webhook payload
   * @param {string} signature - Request signature for verification
   * @returns {object} Processing result
   */
  async processIncoming(payload, signature) {
    const settings = await this.getSettings();
    
    if (!settings.enabled || !settings.incomingEnabled) {
      throw new Error('Incoming webhooks are disabled');
    }
    
    // Verify signature if provided
    if (signature && settings.incomingSecret) {
      const isValid = this._verifySignature(payload, signature, settings.incomingSecret);
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }
    }
    
    // Map MeshCentral event to our event type
    const eventType = this._mapEventType(payload.action || payload.event, settings.eventMapping);
    
    // Log event
    if (settings.logEvents) {
      await this._logEvent(eventType, payload);
    }
    
    // Normalize payload
    const normalizedPayload = this._normalizePayload(eventType, payload);
    
    return {
      eventType,
      payload: normalizedPayload
    };
  }

  // ==============================================================================
  // Event Handling
  // ==============================================================================

  /**
   * Handle events (sends to outgoing webhooks)
   */
  async handleEvent(eventType, payload) {
    const settings = await this.getSettings();
    
    if (!settings.enabled || !settings.outgoingEnabled) {
      return { handled: false, reason: 'Outgoing webhooks disabled' };
    }
    
    const webhooks = settings.outgoingWebhooks || [];
    const targetWebhooks = webhooks.filter(w => 
      w.enabled && 
      w.events && 
      w.events.includes(eventType)
    );
    
    if (targetWebhooks.length === 0) {
      return { handled: false, reason: 'No webhooks configured for this event' };
    }
    
    const results = [];
    for (const webhook of targetWebhooks) {
      try {
        await this._sendOutgoingWebhook(webhook, {
          event: eventType,
          data: payload,
          timestamp: new Date().toISOString()
        });
        results.push({ name: webhook.name, success: true });
      } catch (error) {
        results.push({ name: webhook.name, success: false, error: error.message });
      }
    }
    
    return { handled: true, results };
  }

  /**
   * Handle webhook from external source (called by telegram module, etc.)
   */
  async handleWebhook(source, payload) {
    // Log it
    const settings = await this.getSettings();
    if (settings.logEvents) {
      await this._logEvent(`incoming.${source}`, payload);
    }
    
    return { received: true, source };
  }

  // ==============================================================================
  // Private Methods
  // ==============================================================================

  /**
   * Generate random secret
   * @private
   */
  _generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify webhook signature
   * @private
   */
  _verifySignature(payload, signature, secret) {
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
    
    // Handle both raw signature and prefixed signature
    const cleanSignature = signature.replace(/^sha256=/, '');
    
    try {
      return crypto.timingSafeEqual(
        Buffer.from(cleanSignature),
        Buffer.from(expectedSignature)
      );
    } catch (e) {
      // If buffers are different lengths, timingSafeEqual throws
      return false;
    }
  }

  /**
   * Map MeshCentral event type to our event type
   * @private
   */
  _mapEventType(meshcentralEvent, mapping) {
    return mapping[meshcentralEvent] || meshcentralEvent;
  }

  /**
   * Normalize payload from MeshCentral format
   * @private
   */
  _normalizePayload(eventType, payload) {
    // Extract common fields from MeshCentral payload
    const normalized = {
      timestamp: new Date().toISOString()
    };
    
    // Device info
    if (payload.node || payload.device) {
      const device = payload.node || payload.device;
      normalized.deviceName = device.name || 'Unknown';
      normalized.deviceId = device._id || device.id;
      normalized.ipAddress = device.ip || 'Unknown';
    }
    
    // Direct fields (some MeshCentral events)
    if (payload.nodename) {
      normalized.deviceName = payload.nodename;
    }
    if (payload.ip || payload.addr) {
      normalized.ipAddress = payload.ip || payload.addr;
    }
    
    // User info
    if (payload.user) {
      normalized.userName = typeof payload.user === 'string' ? payload.user : payload.user.name;
    }
    if (payload.username) {
      normalized.userName = payload.username;
    }
    
    // Group info
    if (payload.mesh || payload.group) {
      const group = payload.mesh || payload.group;
      normalized.groupName = group.name || 'Unknown';
      normalized.groupId = group._id || group.id;
    }
    
    // Include original payload
    normalized._original = payload;
    
    return normalized;
  }

  /**
   * Send outgoing webhook
   * @private
   */
  async _sendOutgoingWebhook(webhook, payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(webhook.url);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const data = JSON.stringify(payload);
      
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'RemoteSupport-Webhook/1.0'
      };
      
      // Add HMAC signature if secret is configured
      if (webhook.secret) {
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(data)
          .digest('hex');
        headers['X-Webhook-Signature'] = `sha256=${signature}`;
      }
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers,
        timeout: 10000
      };
      
      const req = client.request(options, (res) => {
        let body = '';
        
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
      
      req.write(data);
      req.end();
    });
  }

  /**
   * Log webhook event
   * @private
   */
  async _logEvent(eventType, payload) {
    const settings = await this.getSettings();
    const logs = settings._eventLog || [];
    
    logs.push({
      timestamp: new Date().toISOString(),
      eventType,
      summary: this._getEventSummary(eventType, payload),
      payload: JSON.stringify(payload).substring(0, 500) // Truncate large payloads
    });
    
    // Trim to max entries
    const maxEntries = settings.maxLogEntries || 100;
    while (logs.length > maxEntries) {
      logs.shift();
    }
    
    await this.saveSettings({ _eventLog: logs });
  }

  /**
   * Get a short summary of an event for logs
   * @private
   */
  _getEventSummary(eventType, payload) {
    const deviceName = payload.nodename || payload.node?.name || payload.device?.name || '';
    const userName = payload.username || payload.user?.name || payload.user || '';
    const ip = payload.ip || payload.addr || '';
    
    if (deviceName) {
      return `${deviceName}${ip ? ` (${ip})` : ''}`;
    }
    if (userName) {
      return `${userName}${ip ? ` from ${ip}` : ''}`;
    }
    return ip || 'Unknown';
  }

  /**
   * Get MeshCentral webhook configuration
   * Returns the config to add to MeshCentral's config.json
   */
  getMeshCentralConfig() {
    const settings = this.getSettingsSync();
    const webhookHost = settings.webhookHost || 'admin';
    const webhookPort = settings.webhookPort || process.env.PORT || 3001;
    const webhookProtocol = settings.webhookProtocol || 'http';
    
    const baseUrl = `${webhookProtocol}://${webhookHost}${webhookPort ? ':' + webhookPort : ''}/api/webhook/meshcentral`;
    const secretParam = settings.incomingSecret ? `?secret=${settings.incomingSecret}` : '';
    
    return {
      webhookUrl: `${baseUrl}${secretParam}`,
      config: {
        settings: {
          plugins: {
            webhooks: {
              serverConnect: `${baseUrl}${secretParam}`,
              serverDisconnect: `${baseUrl}${secretParam}`,
              userLogin: `${baseUrl}${secretParam}`,
              userLogout: `${baseUrl}${secretParam}`
            }
          }
        }
      }
    };
  }
}

module.exports = WebhookModule;
