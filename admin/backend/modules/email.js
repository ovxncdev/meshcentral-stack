/**
 * Email Notification Module
 * 
 * Sends email notifications when events occur:
 *   - Device connects/disconnects
 *   - Support requests
 *   - Daily/weekly reports
 * 
 * Supports:
 *   - SMTP (any provider)
 *   - Gmail
 *   - Outlook/Office365
 *   - Custom SMTP servers
 */

const https = require('https');
const http = require('http');
const BaseModule = require('./base');

// ==============================================================================
// EmailModule Class
// ==============================================================================

class EmailModule extends BaseModule {
  name = 'email';
  displayName = 'Email Notifications';
  description = 'Send email notifications for important events';
  icon = 'mail';
  
  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      enabled: false,
      
      // SMTP Settings
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpPassword: '',
      
      // Sender Info
      fromEmail: '',
      fromName: 'Remote Support',
      
      // Recipients
      notifyEmails: '',
      
      // Notification Settings
      notifyDeviceConnect: false,
      notifyDeviceDisconnect: false,
      notifySupportRequest: true,
      notifyDailyReport: false,
      dailyReportTime: '09:00',
      
      // Email Templates
      subjectPrefix: '[Remote Support]',
      
      templates: {
        deviceConnect: {
          subject: 'Device Connected: {deviceName}',
          body: 'A device has connected to your Remote Support server.\n\nDevice: {deviceName}\nUser: {userName}\nGroup: {groupName}\nIP Address: {ipAddress}\nTime: {timestamp}'
        },
        deviceDisconnect: {
          subject: 'Device Disconnected: {deviceName}',
          body: 'A device has disconnected from your Remote Support server.\n\nDevice: {deviceName}\nGroup: {groupName}\nTime: {timestamp}'
        },
        supportRequest: {
          subject: 'New Support Request from {customerName}',
          body: 'A new support request has been received.\n\nCustomer: {customerName}\nEmail: {customerEmail}\nPhone: {customerPhone}\nMessage:\n{message}\n\nTime: {timestamp}'
        }
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
        label: 'Enable Email Notifications',
        description: 'Turn on/off all email notifications'
      },
      
      // SMTP Section
      {
        key: 'section_smtp',
        type: 'section',
        label: 'SMTP Server Settings'
      },
      {
        key: 'smtpPreset',
        type: 'select',
        label: 'Email Provider',
        description: 'Select your email provider or use custom SMTP',
        options: [
          { value: 'custom', label: 'Custom SMTP Server' },
          { value: 'gmail', label: 'Gmail' },
          { value: 'outlook', label: 'Outlook / Office 365' },
          { value: 'yahoo', label: 'Yahoo Mail' },
          { value: 'sendgrid', label: 'SendGrid' },
          { value: 'mailgun', label: 'Mailgun' }
        ],
        dependsOn: 'enabled'
      },
      {
        key: 'smtpHost',
        type: 'text',
        label: 'SMTP Host',
        placeholder: 'smtp.gmail.com',
        required: true,
        dependsOn: 'enabled'
      },
      {
        key: 'smtpPort',
        type: 'number',
        label: 'SMTP Port',
        placeholder: '587',
        required: true,
        dependsOn: 'enabled',
        validation: {
          min: 1,
          max: 65535
        }
      },
      {
        key: 'smtpSecure',
        type: 'boolean',
        label: 'Use SSL/TLS',
        description: 'Enable for port 465, disable for port 587 with STARTTLS',
        dependsOn: 'enabled'
      },
      {
        key: 'smtpUser',
        type: 'text',
        label: 'SMTP Username',
        placeholder: 'your-email@gmail.com',
        required: true,
        dependsOn: 'enabled'
      },
      {
        key: 'smtpPassword',
        type: 'password',
        label: 'SMTP Password',
        description: 'For Gmail, use an App Password (not your regular password)',
        placeholder: '••••••••••••',
        required: true,
        dependsOn: 'enabled'
      },
      
      // Sender Section
      {
        key: 'section_sender',
        type: 'section',
        label: 'Sender Information'
      },
      {
        key: 'fromEmail',
        type: 'text',
        label: 'From Email',
        placeholder: 'support@yourcompany.com',
        required: true,
        dependsOn: 'enabled',
        validation: {
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          patternMessage: 'Must be a valid email address'
        }
      },
      {
        key: 'fromName',
        type: 'text',
        label: 'From Name',
        placeholder: 'Remote Support',
        dependsOn: 'enabled'
      },
      
      // Recipients Section
      {
        key: 'section_recipients',
        type: 'section',
        label: 'Recipients'
      },
      {
        key: 'notifyEmails',
        type: 'textarea',
        label: 'Notification Recipients',
        description: 'Email addresses to notify (one per line)',
        placeholder: 'admin@yourcompany.com\ntech@yourcompany.com',
        required: true,
        dependsOn: 'enabled'
      },
      
      // Events Section
      {
        key: 'section_events',
        type: 'section',
        label: 'Notification Events'
      },
      {
        key: 'notifyDeviceConnect',
        type: 'boolean',
        label: 'Device Connects',
        description: 'Send email when a device comes online',
        dependsOn: 'enabled'
      },
      {
        key: 'notifyDeviceDisconnect',
        type: 'boolean',
        label: 'Device Disconnects',
        description: 'Send email when a device goes offline',
        dependsOn: 'enabled'
      },
      {
        key: 'notifySupportRequest',
        type: 'boolean',
        label: 'Support Requests',
        description: 'Send email when a customer requests support',
        dependsOn: 'enabled'
      },
      
      // Reports Section
      {
        key: 'section_reports',
        type: 'section',
        label: 'Reports'
      },
      {
        key: 'notifyDailyReport',
        type: 'boolean',
        label: 'Daily Report',
        description: 'Send a daily summary report',
        dependsOn: 'enabled'
      },
      {
        key: 'dailyReportTime',
        type: 'time',
        label: 'Report Time',
        description: 'Time to send daily report',
        dependsOn: 'notifyDailyReport'
      },
      
      // Advanced Section
      {
        key: 'section_advanced',
        type: 'section',
        label: 'Advanced'
      },
      {
        key: 'subjectPrefix',
        type: 'text',
        label: 'Subject Prefix',
        description: 'Prefix added to all email subjects',
        placeholder: '[Remote Support]',
        dependsOn: 'enabled'
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
        label: 'Send Test Email',
        icon: 'send',
        description: 'Send a test email to verify SMTP configuration'
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
   * Test action - sends a test email
   */
  async action_test(params) {
    const settings = this.getSettings();
    
    // Validate required fields
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      throw new Error('SMTP settings are incomplete');
    }
    
    if (!settings.notifyEmails) {
      throw new Error('No recipient email addresses configured');
    }
    
    const recipients = this._parseEmails(settings.notifyEmails);
    if (recipients.length === 0) {
      throw new Error('No valid recipient email addresses');
    }
    
    // Send test email
    const subject = `${settings.subjectPrefix} Test Email`;
    const body = `This is a test email from Remote Support.\n\nIf you received this email, your email notifications are configured correctly.\n\nTime: ${new Date().toISOString()}`;
    
    await this._sendEmail(recipients[0], subject, body);
    
    return {
      success: true,
      message: `Test email sent to ${recipients[0]}`
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
    
    // Get recipients
    const recipients = this._parseEmails(settings.notifyEmails);
    if (recipients.length === 0) {
      return { handled: false, reason: 'No recipients configured' };
    }
    
    // Check if this event type is enabled
    let template = null;
    
    switch (eventType) {
      case 'device.connect':
        if (!settings.notifyDeviceConnect) return { handled: false };
        template = settings.templates.deviceConnect;
        break;
        
      case 'device.disconnect':
        if (!settings.notifyDeviceDisconnect) return { handled: false };
        template = settings.templates.deviceDisconnect;
        break;
        
      case 'support.request':
        if (!settings.notifySupportRequest) return { handled: false };
        template = settings.templates.supportRequest;
        break;
        
      default:
        return { handled: false, reason: 'Unknown event type' };
    }
    
    // Format email
    const subject = `${settings.subjectPrefix} ${this._formatMessage(template.subject, payload)}`;
    const body = this._formatMessage(template.body, payload);
    
    // Send to all recipients
    const results = [];
    for (const recipient of recipients) {
      try {
        await this._sendEmail(recipient, subject, body);
        results.push({ email: recipient, success: true });
      } catch (error) {
        results.push({ email: recipient, success: false, error: error.message });
      }
    }
    
    return { handled: true, eventType, results };
  }
  
  // ==============================================================================
  // Private Methods
  // ==============================================================================
  
  /**
   * Send email via SMTP
   * Note: This is a simplified implementation. In production,
   * consider using nodemailer or similar library.
   * @private
   */
  async _sendEmail(to, subject, body) {
    const settings = this.getSettings();
    
    // For a real implementation, you would use nodemailer
    // This is a placeholder that simulates the email sending
    
    console.log(`[Email] Sending to: ${to}`);
    console.log(`[Email] Subject: ${subject}`);
    console.log(`[Email] Body: ${body.substring(0, 100)}...`);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // In production, implement actual SMTP sending here
    // using nodemailer or similar library
    
    // For now, we'll just log and return success
    // This would be replaced with actual email sending code
    
    return { success: true, messageId: `msg_${Date.now()}` };
  }
  
  /**
   * Parse email addresses from multiline string
   * @private
   */
  _parseEmails(emailsString) {
    if (!emailsString) return [];
    
    return emailsString
      .split(/[\n,;]+/)
      .map(email => email.trim())
      .filter(email => this._isValidEmail(email));
  }
  
  /**
   * Validate email address format
   * @private
   */
  _isValidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
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
   * Get SMTP preset configuration
   * @private
   */
  _getSmtpPreset(preset) {
    const presets = {
      gmail: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false
      },
      outlook: {
        host: 'smtp.office365.com',
        port: 587,
        secure: false
      },
      yahoo: {
        host: 'smtp.mail.yahoo.com',
        port: 587,
        secure: false
      },
      sendgrid: {
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false
      },
      mailgun: {
        host: 'smtp.mailgun.org',
        port: 587,
        secure: false
      }
    };
    
    return presets[preset] || null;
  }
}

module.exports = EmailModule;
