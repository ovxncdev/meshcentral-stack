/**
 * Telegram Notification Module
 * 
 * Sends notifications to Telegram when events occur:
 *   - Device connects
 *   - Device disconnects
 *   - Support request received
 *   - Custom alerts
 * 
 * Configuration:
 *   - Bot Token: Get from @BotFather on Telegram
 *   - Chat ID: Get from @userinfobot on Telegram
 */

const https = require('https');
const BaseModule = require('./base');

// ==============================================================================
// TelegramModule Class
// ==============================================================================

class TelegramModule extends BaseModule {
  name = 'telegram';
  displayName = 'Telegram Notifications';
  description = 'Send notifications to Telegram when events occur';
  icon = 'send';
  
  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      enabled: false,
      botToken: '',
      chatId: '',
      notifyDeviceConnect: true,
      notifyDeviceDisconnect: true,
      notifySupportRequest: true,
      notifyOfflineAlert: false,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      messageTemplate: {
        deviceConnect: '🟢 *Device Connected*\n\nName: {deviceName}\nUser: {userName}\nGroup: {groupName}\nIP: {ipAddress}\nTime: {timestamp}',
        deviceDisconnect: '🔴 *Device Disconnected*\n\nName: {deviceName}\nGroup: {groupName}\nTime: {timestamp}',
        supportRequest: '🆘 *Support Request*\n\nFrom: {customerName}\nEmail: {customerEmail}\nMessage: {message}\nTime: {timestamp}'
      }
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
        label: 'Enable Telegram Notifications',
        description: 'Turn on/off all Telegram notifications'
      },
      {
        key: 'botToken',
        type: 'password',
        label: 'Bot Token',
        description: 'Get this from @BotFather on Telegram',
        placeholder: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz',
        required: true,
        dependsOn: 'enabled',
        validation: {
          pattern: '^[0-9]+:[A-Za-z0-9_-]+$',
          patternMessage: 'Invalid bot token format'
        }
      },
      {
        key: 'chatId',
        type: 'text',
        label: 'Chat ID',
        description: 'Get this from @userinfobot on Telegram. Can be user ID or group ID (with -)',
        placeholder: '123456789 or -987654321',
        required: true,
        dependsOn: 'enabled',
        validation: {
          pattern: '^-?[0-9]+$',
          patternMessage: 'Chat ID must be a number'
        }
      },
      {
        key: 'divider1',
        type: 'divider',
        label: 'Notification Events'
      },
      {
        key: 'notifyDeviceConnect',
        type: 'boolean',
        label: 'Device Connects',
        description: 'Notify when a device comes online',
        dependsOn: 'enabled'
      },
      {
        key: 'notifyDeviceDisconnect',
        type: 'boolean',
        label: 'Device Disconnects',
        description: 'Notify when a device goes offline',
        dependsOn: 'enabled'
      },
      {
        key: 'notifySupportRequest',
        type: 'boolean',
        label: 'Support Requests',
        description: 'Notify when a customer requests support',
        dependsOn: 'enabled'
      },
      {
        key: 'divider2',
        type: 'divider',
        label: 'Quiet Hours'
      },
      {
        key: 'quietHoursEnabled',
        type: 'boolean',
        label: 'Enable Quiet Hours',
        description: 'Suppress notifications during specified hours',
        dependsOn: 'enabled'
      },
      {
        key: 'quietHoursStart',
        type: 'time',
        label: 'Quiet Hours Start',
        description: 'Start suppressing notifications',
        dependsOn: 'quietHoursEnabled'
      },
      {
        key: 'quietHoursEnd',
        type: 'time',
        label: 'Quiet Hours End',
        description: 'Resume notifications',
        dependsOn: 'quietHoursEnabled'
      }
    ];
  }
  
  /**
   * Get available actions
   */
  getActions() {
    return [
      {
        name: 'test',
        label: 'Send Test Message',
        icon: 'send',
        description: 'Send a test notification to verify configuration'
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
      'support.request'
    ];
  }
  
  // ==============================================================================
  // Actions
  // ==============================================================================
  
  /**
   * Test action - sends a test message
   */
  async action_test(params) {
    const settings = this.getSettings();
    
    if (!settings.botToken || !settings.chatId) {
      throw new Error('Bot Token and Chat ID are required');
    }
    
    const message = `✅ *Test Notification*\n\nYour Telegram notifications are configured correctly!\n\nTime: ${new Date().toISOString()}`;
    
    await this._sendMessage(settings.botToken, settings.chatId, message);
    
    return {
      success: true,
      message: 'Test message sent successfully'
    };
  }
  
  // ==============================================================================
  // Event Handling
  // ==============================================================================
  
  /**
   * Handle incoming events
   */
  async handleEvent(eventType, payload) {
    const settings = this.getSettings();
    
    // Check if enabled
    if (!settings.enabled) {
      return { handled: false, reason: 'Module disabled' };
    }
    
    // Check quiet hours
    if (this._isQuietHours(settings)) {
      return { handled: false, reason: 'Quiet hours active' };
    }
    
    // Check if this event type is enabled
    let message = null;
    
    switch (eventType) {
      case 'device.connect':
        if (!settings.notifyDeviceConnect) return { handled: false };
        message = this._formatMessage(settings.messageTemplate.deviceConnect, payload);
        break;
        
      case 'device.disconnect':
        if (!settings.notifyDeviceDisconnect) return { handled: false };
        message = this._formatMessage(settings.messageTemplate.deviceDisconnect, payload);
        break;
        
      case 'support.request':
        if (!settings.notifySupportRequest) return { handled: false };
        message = this._formatMessage(settings.messageTemplate.supportRequest, payload);
        break;
        
      default:
        return { handled: false, reason: 'Unknown event type' };
    }
    
    // Send notification
    await this._sendMessage(settings.botToken, settings.chatId, message);
    
    return { handled: true, eventType };
  }
  
  // ==============================================================================
  // Private Methods
  // ==============================================================================
  
  /**
   * Send message via Telegram Bot API
   * @private
   */
  async _sendMessage(botToken, chatId, text) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
      
      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };
      
      const req = https.request(options, (res) => {
        let body = '';
        
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            
            if (response.ok) {
              resolve(response.result);
            } else {
              reject(new Error(response.description || 'Telegram API error'));
            }
          } catch (error) {
            reject(new Error('Invalid response from Telegram'));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Failed to connect to Telegram: ${error.message}`));
      });
      
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Telegram request timed out'));
      });
      
      req.write(data);
      req.end();
    });
  }
  
  /**
   * Format message template with payload data
   * @private
   */
  _formatMessage(template, payload) {
    let message = template;
    
    // Add timestamp if not in payload
    if (!payload.timestamp) {
      payload.timestamp = new Date().toLocaleString();
    }
    
    // Replace placeholders
    for (const [key, value] of Object.entries(payload)) {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      message = message.replace(placeholder, value || 'N/A');
    }
    
    // Remove any remaining placeholders
    message = message.replace(/\{[^}]+\}/g, 'N/A');
    
    return message;
  }
  
  /**
   * Check if current time is within quiet hours
   * @private
   */
  _isQuietHours(settings) {
    if (!settings.quietHoursEnabled) {
      return false;
    }
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startHour, startMin] = settings.quietHoursStart.split(':').map(Number);
    const [endHour, endMin] = settings.quietHoursEnd.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}

module.exports = TelegramModule;
