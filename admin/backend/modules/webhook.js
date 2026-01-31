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
const BaseModule = require('./base');

// ==============================================================================
// WebhookModule Class
// ==============================================================================

class WebhookModule extends BaseModule {
  name = 'webhook';
  displayName = 'Webhooks';
  description = 'Configure incoming and outgoing webhooks';
  icon = 'link';
  
  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      enabled: true,
      
      // Incoming webhook (from MeshCentral)
      incomingEnabled: true,
      incomingSecret: this._generateSecret(),
      
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
    return [
      {
        key: 'enabled',
        type: 'boolean',
        label: 'Enable Webhooks',
        description: 'Enable webhook functionality'
      },
      
      // Incoming Webhooks Section
      {
        key: 'section_incoming',
        type: 'section',
        label: 'Incoming Webhooks (from MeshCentral)'
      },
      {
        key: 'incomingEnabled',
        type: 'boolean',
        label: 'Enable Incoming Webhooks',
        description: 'Accept webhooks from MeshCentral',
        dependsOn: 'enabled'
      },
      {
        key: 'incomingSecret',
        type: 'password',
        label: 'Webhook Secret',
        description: 'Secret key to verify webhook requests (auto-generated)',
        dependsOn: 'incomingEnabled'
      },
      {
        key: 'section_endpoint',
        type: 'section',
        label: 'Webhook Endpoint Configuration'
      },
      {
        key: 'webhookProtocol',
        type: 'select',
        label: 'Protocol',
        description: 'Protocol for webhook URL',
        options: [
          { value: 'http', label: 'HTTP' },
          { value: 'https', label: 'HTTPS' }
        ],
        dependsOn: 'incomingEnabled'
      },
      {
        key: 'webhookHost',
        type: 'text',
        label: 'Webhook Host',
        description: 'Hostname or IP for webhook URL (use "admin" for Docker internal, or your server IP for external)',
        placeholder: 'admin or 192.168.1.100',
        dependsOn: 'incomingEnabled'
      },
      {
        key: 'webhookPort',
        type: 'text',
        label: 'Webhook Port',
        description: 'Port number for webhook URL (leave empty to use default)',
        placeholder: '3001',
        dependsOn: 'incomingEnabled'
      },
      {
        key: 'webhookUrl',
        type: 'readonly',
        label: 'Webhook URL',
        description: 'Configure this URL in MeshCentral',
        value: '/api/webhook/meshcentral',
        dependsOn: 'incomingEnabled'
      },
      
      // Outgoing Webhooks Section
      {
        key: 'section_outgoing',
        type: 'section',
        label: 'Outgoing Webhooks (to External Services)'
      },
      {
        key: 'outgoingEnabled',
        type: 'boolean',
        label: 'Enable Outgoing Webhooks',
        description: 'Send events to external URLs',
        dependsOn: 'enabled'
      },
      {
        key: 'outgoingWebhooks',
        type: 'array',
        label: 'Webhook Endpoints',
        description: 'External URLs to receive events',
        dependsOn: 'outgoingEnabled',
        itemSchema: [
          {
            key: 'name',
            type: 'text',
            label: 'Name',
            placeholder: 'My Webhook'
          },
          {
            key: 'url',
            type: 'text',
            label: 'URL',
            placeholder: 'https://example.com/webhook'
          },
          {
            key: 'events',
            type: 'multiselect',
            label: 'Events',
            options: [
              { value: 'device.connect', label: 'Device Connect' },
              { value: 'device.disconnect', label: 'Device Disconnect' },
              { value: 'user.login', label: 'User Login' },
              { value: 'support.request', label: 'Support Request' }
            ]
          },
          {
            key: 'secret',
            type: 'text',
            label: 'Secret (optional)',
            placeholder: 'Shared secret for HMAC'
          },
          {
            key: 'enabled',
            type: 'boolean',
            label: 'Enabled'
          }
        ]
      },
      
      // Logging Section
      {
        key: 'section_logging',
        type: 'section',
        label: 'Logging'
      },
      {
        key: 'logEvents',
        type: 'boolean',
        label: 'Log Webhook Events',
        description: 'Keep a log of received webhook events',
        dependsOn: 'enabled'
      },
      {
        key: 'maxLogEntries',
        type: 'number',
        label: 'Max Log Entries',
        description: 'Maximum number of log entries to keep',
        dependsOn: 'logEvents',
        validation: {
          min: 10,
          max: 1000
        }
      }
    ];
  }
  
  /**
   * Get available actions
   */
  getActions() {
    return [
      {
        name: 'regenerateSecret',
        label: 'Regenerate Secret',
        icon: 'refresh',
        description: 'Generate a new webhook secret',
        confirm: 'This will invalidate the current secret. Continue?'
      },
      {
        name: 'testOutgoing',
        label: 'Test Outgoing Webhook',
        icon: 'send',
        description: 'Send a test event to all enabled outgoing webhooks'
      },
      {
        name: 'clearLogs',
        label: 'Clear Logs',
        icon: 'trash',
        description: 'Clear webhook event logs',
        confirm: 'Clear all webhook logs?'
      },
      {
        name: 'viewLogs',
        label: 'View Logs',
        icon: 'list',
        description: 'View recent webhook events'
      }
    ];
  }
  
  /**
   * Get handled events
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
  // Actions
  // ==============================================================================
  
  /**
   * Regenerate webhook secret
   */
  async action_regenerateSecret(params) {
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
  async action_testOutgoing(params) {
    const settings = this.getSettings();
    
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
  async action_clearLogs(params) {
    await this.saveSettings({ _eventLog: [] });
    
    return {
      success: true,
      message: 'Webhook logs cleared'
    };
  }
  
  /**
   * View webhook logs
   */
  async action_viewLogs(params) {
    const settings = this.getSettings();
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
    const settings = this.getSettings();
    
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
    const settings = this.getSettings();
    
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
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
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
    
    // User info
    if (payload.user) {
      normalized.userName = payload.user.name || payload.user;
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
        headers['X-Webhook-Signature'] = signature;
      }
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers
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
      
      req.setTimeout(10000, () => {
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
    const settings = this.getSettings();
    const logs = settings._eventLog || [];
    
    logs.push({
      timestamp: new Date().toISOString(),
      eventType,
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
   * Get MeshCentral webhook configuration
   * Returns the config to add to MeshCentral's config.json
   */
  getMeshCentralConfig() {
    const settings = this.getSettings();
    const webhookHost = settings.webhookHost || 'admin';
    const webhookPort = settings.webhookPort || process.env.PORT || 3001;
    const webhookProtocol = settings.webhookProtocol || 'http';
    
    const baseUrl = `${webhookProtocol}://${webhookHost}:${webhookPort}/api/webhook/meshcentral`;
    const secretParam = settings.incomingSecret ? `?secret=${settings.incomingSecret}` : '';
    
    return {
      webhooks: {
        serverConnect: `${baseUrl}${secretParam}`,
        serverDisconnect: `${baseUrl}${secretParam}`
      }
    };
  }
}

module.exports = WebhookModule;
