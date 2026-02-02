/**
 * Telegram Notifications Module
 * 
 * Handles Telegram bot notifications with per-user settings.
 * Each user can configure their own Telegram bot/chat.
 * 
 * Features:
 * - Per-user notification settings
 * - Admin can view/manage all users' settings
 * - Test notifications
 * - Webhook handling from MeshCentral
 */

const https = require('https');
const path = require('path');
const fs = require('fs').promises;

class TelegramModule {
  constructor(configManager) {
    this.configManager = configManager;
    this.name = 'telegram';
    this.description = 'Telegram Notifications';
    this.icon = 'send';
  }

  /**
   * Get module schema for UI rendering
   */
  getSchema() {
    return {
      title: 'Telegram Notifications',
      description: 'Receive notifications via Telegram when devices connect/disconnect',
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          title: 'Enable Notifications',
          description: 'Turn on Telegram notifications',
          default: false
        },
        botToken: {
          type: 'string',
          title: 'Bot Token',
          description: 'Get this from @BotFather on Telegram',
          placeholder: '123456789:ABCdefGHIjklMNOpqrsTUVwxyz'
        },
        chatId: {
          type: 'string',
          title: 'Chat ID',
          description: 'Get this from @userinfobot on Telegram',
          placeholder: '-100123456789'
        },
        notifyConnect: {
          type: 'boolean',
          title: 'Notify on Device Connect',
          default: true
        },
        notifyDisconnect: {
          type: 'boolean',
          title: 'Notify on Device Disconnect',
          default: true
        },
        notifyLogin: {
          type: 'boolean',
          title: 'Notify on User Login',
          default: false
        },
        notifyLoginFailed: {
          type: 'boolean',
          title: 'Notify on Failed Login Attempts',
          default: false
        }
      },
      required: ['botToken', 'chatId'],
      actions: [
        {
          name: 'test',
          title: 'Send Test Message',
          icon: 'send',
          style: 'secondary'
        }
      ]
    };
  }

  /**
   * Get global settings (admin view - all users)
   */
  async getSettings() {
    const settings = await this.configManager.get('telegram') || {};
    return {
      global: settings.global || {},
      users: settings.users || {}
    };
  }

  /**
   * Get settings for a specific user
   */
  async getUserSettings(userId) {
    const settings = await this.configManager.get('telegram') || {};
    const userSettings = settings.users?.[userId] || {
      enabled: false,
      botToken: '',
      chatId: '',
      notifyConnect: true,
      notifyDisconnect: true,
      notifyLogin: false,
      notifyLoginFailed: false
    };
    return userSettings;
  }

  /**
   * Save global settings (admin only)
   */
  async saveSettings(data) {
    const current = await this.configManager.get('telegram') || {};
    current.global = {
      ...current.global,
      ...data,
      updatedAt: new Date().toISOString()
    };
    await this.configManager.set('telegram', current);
    return { success: true };
  }

  /**
   * Save settings for a specific user
   */
  async saveUserSettings(userId, data) {
    const current = await this.configManager.get('telegram') || {};
    
    if (!current.users) {
      current.users = {};
    }

    // Sanitize the data
    current.users[userId] = {
      enabled: !!data.enabled,
      botToken: (data.botToken || '').trim(),
      chatId: (data.chatId || '').trim(),
      notifyConnect: data.notifyConnect !== false,
      notifyDisconnect: data.notifyDisconnect !== false,
      notifyLogin: !!data.notifyLogin,
      notifyLoginFailed: !!data.notifyLoginFailed,
      updatedAt: new Date().toISOString()
    };

    await this.configManager.set('telegram', current);
    return { success: true };
  }

  /**
   * Delete settings for a specific user (admin only)
   */
  async deleteUserSettings(userId) {
    const current = await this.configManager.get('telegram') || {};
    
    if (current.users && current.users[userId]) {
      delete current.users[userId];
      await this.configManager.set('telegram', current);
    }

    return { success: true };
  }

  /**
   * Get all users with telegram settings (admin only)
   */
  async getAllUserSettings() {
    const settings = await this.configManager.get('telegram') || {};
    return settings.users || {};
  }

  /**
   * Execute module actions
   */
  async executeAction(action, data, user) {
    switch (action) {
      case 'test':
        if (user && !user.isAdmin) {
          return this.testUserNotification(user.id);
        }
        return this.testNotification(data.botToken, data.chatId);
      
      case 'testUser':
        return this.testUserNotification(data.userId);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Test notification with provided credentials
   */
  async testNotification(botToken, chatId) {
    if (!botToken || !chatId) {
      return { success: false, error: 'Bot token and chat ID are required' };
    }

    const message = `🔔 *Test Notification*\n\nYour Telegram notifications are configured correctly!\n\n_Sent at: ${new Date().toLocaleString()}_`;

    try {
      await this.sendMessage(botToken, chatId, message);
      return { success: true, message: 'Test message sent successfully!' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Test notification for a specific user
   */
  async testUserNotification(userId) {
    const userSettings = await this.getUserSettings(userId);

    if (!userSettings.botToken || !userSettings.chatId) {
      return { success: false, error: 'Please configure your Bot Token and Chat ID first' };
    }

    const message = `🔔 *Test Notification*\n\nYour Telegram notifications are configured correctly!\n\n_Sent at: ${new Date().toLocaleString()}_`;

    try {
      await this.sendMessage(userSettings.botToken, userSettings.chatId, message);
      return { success: true, message: 'Test message sent successfully!' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a message via Telegram Bot API
   */
  async sendMessage(botToken, chatId, message) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      });

      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(responseData);
            if (response.ok) {
              resolve(response);
            } else {
              reject(new Error(response.description || 'Telegram API error'));
            }
          } catch (e) {
            reject(new Error('Invalid response from Telegram'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  /**
   * Handle incoming webhook from MeshCentral
   */
  async handleWebhook(source, payload) {
    try {
      const eventType = this.parseEventType(payload);
      if (!eventType) {
        console.log('Unhandled webhook event type');
        return;
      }

      // Get all users with notifications enabled
      const settings = await this.configManager.get('telegram') || {};
      const users = settings.users || {};

      // Build the message
      const message = this.buildMessage(eventType, payload);
      if (!message) return;

      // Send to each user who has this notification type enabled
      for (const [userId, userSettings] of Object.entries(users)) {
        if (!userSettings.enabled) continue;
        if (!userSettings.botToken || !userSettings.chatId) continue;

        // Check if user wants this notification type
        const shouldNotify = this.shouldNotifyUser(userSettings, eventType);
        if (!shouldNotify) continue;

        try {
          await this.sendMessage(userSettings.botToken, userSettings.chatId, message);
          console.log(`Notification sent to user ${userId}`);
        } catch (error) {
          console.error(`Failed to send notification to user ${userId}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Webhook handling error:', error);
    }
  }

  /**
   * Parse event type from MeshCentral webhook payload
   */
  parseEventType(payload) {
    if (!payload) return null;

    // MeshCentral event types
    if (payload.action === 'nodeconnect' || payload.event === 'nodeconnect') {
      return 'connect';
    }
    if (payload.action === 'nodedisconnect' || payload.event === 'nodedisconnect') {
      return 'disconnect';
    }
    if (payload.action === 'userlogin' || payload.event === 'userlogin') {
      return 'login';
    }
    if (payload.action === 'userloginfail' || payload.event === 'userloginfail') {
      return 'loginFailed';
    }

    return null;
  }

  /**
   * Check if user should receive this notification type
   */
  shouldNotifyUser(userSettings, eventType) {
    switch (eventType) {
      case 'connect':
        return userSettings.notifyConnect !== false;
      case 'disconnect':
        return userSettings.notifyDisconnect !== false;
      case 'login':
        return userSettings.notifyLogin === true;
      case 'loginFailed':
        return userSettings.notifyLoginFailed === true;
      default:
        return false;
    }
  }

  /**
   * Build notification message based on event
   */
  buildMessage(eventType, payload) {
    const timestamp = new Date().toLocaleString();
    const deviceName = payload.nodename || payload.node?.name || 'Unknown Device';
    const userName = payload.username || payload.user || 'Unknown User';
    const ip = payload.ip || payload.addr || '';

    switch (eventType) {
      case 'connect':
        return `🟢 *Device Connected*\n\n` +
               `📱 *Device:* ${this.escapeMarkdown(deviceName)}\n` +
               (ip ? `🌐 *IP:* ${ip}\n` : '') +
               `🕐 *Time:* ${timestamp}`;

      case 'disconnect':
        return `🔴 *Device Disconnected*\n\n` +
               `📱 *Device:* ${this.escapeMarkdown(deviceName)}\n` +
               `🕐 *Time:* ${timestamp}`;

      case 'login':
        return `👤 *User Login*\n\n` +
               `👤 *User:* ${this.escapeMarkdown(userName)}\n` +
               (ip ? `🌐 *IP:* ${ip}\n` : '') +
               `🕐 *Time:* ${timestamp}`;

      case 'loginFailed':
        return `⚠️ *Failed Login Attempt*\n\n` +
               `👤 *User:* ${this.escapeMarkdown(userName)}\n` +
               (ip ? `🌐 *IP:* ${ip}\n` : '') +
               `🕐 *Time:* ${timestamp}`;

      default:
        return null;
    }
  }

  /**
   * Escape special characters for Telegram Markdown
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
}

module.exports = TelegramModule;
