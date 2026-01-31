/**
 * Branding Module
 * 
 * Customize the look and feel of the support portal:
 *   - Company name and logo
 *   - Colors and theme
 *   - Support page text
 *   - Contact information
 * 
 * Branding is applied to:
 *   - Support portal (customer-facing)
 *   - Login page
 *   - Email templates
 */

const fs = require('fs').promises;
const path = require('path');
const BaseModule = require('./base');

// ==============================================================================
// BrandingModule Class
// ==============================================================================

class BrandingModule extends BaseModule {
  name = 'branding';
  displayName = 'Branding & Customization';
  description = 'Customize the look and feel of your support portal';
  icon = 'palette';
  
  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      enabled: true,
      
      // Company Info
      companyName: 'Remote Support',
      companyTagline: 'Secure Remote Access Portal',
      companyWebsite: '',
      
      // Logo
      logoUrl: '',
      logoWidth: 200,
      faviconUrl: '',
      
      // Colors
      primaryColor: '#3182ce',
      secondaryColor: '#2c5282',
      accentColor: '#38a169',
      backgroundColor: '#1a365d',
      textColor: '#ffffff',
      
      // Support Page
      supportTitle: 'Get Remote Support',
      supportDescription: 'Our technician is ready to help you. Download the support package below to get started.',
      supportButtonText: 'Download Support Package',
      
      // Contact Info
      supportEmail: '',
      supportPhone: '',
      supportHours: 'Monday - Friday, 9 AM - 6 PM',
      
      // Footer
      footerText: '',
      showPoweredBy: true,
      
      // Custom CSS
      customCss: ''
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
        label: 'Enable Custom Branding',
        description: 'Apply custom branding to support portal'
      },
      
      // Company Info Section
      {
        key: 'section_company',
        type: 'section',
        label: 'Company Information'
      },
      {
        key: 'companyName',
        type: 'text',
        label: 'Company Name',
        placeholder: 'Your Company Name',
        required: true,
        dependsOn: 'enabled'
      },
      {
        key: 'companyTagline',
        type: 'text',
        label: 'Tagline',
        placeholder: 'Your company tagline',
        dependsOn: 'enabled'
      },
      {
        key: 'companyWebsite',
        type: 'text',
        label: 'Website URL',
        placeholder: 'https://yourcompany.com',
        dependsOn: 'enabled',
        validation: {
          pattern: '^(https?://.*)?$',
          patternMessage: 'Must be a valid URL starting with http:// or https://'
        }
      },
      
      // Logo Section
      {
        key: 'section_logo',
        type: 'section',
        label: 'Logo & Icons'
      },
      {
        key: 'logoUrl',
        type: 'text',
        label: 'Logo URL',
        description: 'URL to your logo image (PNG, SVG recommended). Leave empty for text-only.',
        placeholder: 'https://yourcompany.com/logo.png',
        dependsOn: 'enabled'
      },
      {
        key: 'logoWidth',
        type: 'number',
        label: 'Logo Width (px)',
        description: 'Width of the logo in pixels',
        placeholder: '200',
        dependsOn: 'enabled',
        validation: {
          min: 50,
          max: 500
        }
      },
      {
        key: 'faviconUrl',
        type: 'text',
        label: 'Favicon URL',
        description: 'URL to favicon (ICO or PNG)',
        placeholder: 'https://yourcompany.com/favicon.ico',
        dependsOn: 'enabled'
      },
      
      // Colors Section
      {
        key: 'section_colors',
        type: 'section',
        label: 'Colors & Theme'
      },
      {
        key: 'primaryColor',
        type: 'color',
        label: 'Primary Color',
        description: 'Main brand color (buttons, links)',
        dependsOn: 'enabled'
      },
      {
        key: 'secondaryColor',
        type: 'color',
        label: 'Secondary Color',
        description: 'Secondary brand color',
        dependsOn: 'enabled'
      },
      {
        key: 'accentColor',
        type: 'color',
        label: 'Accent Color',
        description: 'Accent color (success states, highlights)',
        dependsOn: 'enabled'
      },
      {
        key: 'backgroundColor',
        type: 'color',
        label: 'Background Color',
        description: 'Page background color',
        dependsOn: 'enabled'
      },
      {
        key: 'textColor',
        type: 'color',
        label: 'Text Color',
        description: 'Main text color on background',
        dependsOn: 'enabled'
      },
      
      // Support Page Section
      {
        key: 'section_support',
        type: 'section',
        label: 'Support Page Text'
      },
      {
        key: 'supportTitle',
        type: 'text',
        label: 'Page Title',
        placeholder: 'Get Remote Support',
        dependsOn: 'enabled'
      },
      {
        key: 'supportDescription',
        type: 'textarea',
        label: 'Page Description',
        placeholder: 'Instructions for your customers...',
        dependsOn: 'enabled'
      },
      {
        key: 'supportButtonText',
        type: 'text',
        label: 'Download Button Text',
        placeholder: 'Download Support Package',
        dependsOn: 'enabled'
      },
      
      // Contact Section
      {
        key: 'section_contact',
        type: 'section',
        label: 'Contact Information'
      },
      {
        key: 'supportEmail',
        type: 'text',
        label: 'Support Email',
        placeholder: 'support@yourcompany.com',
        dependsOn: 'enabled',
        validation: {
          pattern: '^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})?$',
          patternMessage: 'Must be a valid email address'
        }
      },
      {
        key: 'supportPhone',
        type: 'text',
        label: 'Support Phone',
        placeholder: '+1 (555) 123-4567',
        dependsOn: 'enabled'
      },
      {
        key: 'supportHours',
        type: 'text',
        label: 'Support Hours',
        placeholder: 'Monday - Friday, 9 AM - 6 PM',
        dependsOn: 'enabled'
      },
      
      // Footer Section
      {
        key: 'section_footer',
        type: 'section',
        label: 'Footer'
      },
      {
        key: 'footerText',
        type: 'text',
        label: 'Custom Footer Text',
        placeholder: '© 2024 Your Company. All rights reserved.',
        dependsOn: 'enabled'
      },
      {
        key: 'showPoweredBy',
        type: 'boolean',
        label: 'Show "Powered By" Badge',
        description: 'Display "Powered by Remote Support" in footer',
        dependsOn: 'enabled'
      },
      
      // Advanced Section
      {
        key: 'section_advanced',
        type: 'section',
        label: 'Advanced'
      },
      {
        key: 'customCss',
        type: 'textarea',
        label: 'Custom CSS',
        description: 'Additional CSS to inject into support pages (advanced users)',
        placeholder: '/* Custom styles */\n.my-class { color: red; }',
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
        name: 'preview',
        label: 'Preview Support Page',
        icon: 'eye',
        description: 'Open support page in new tab to preview branding'
      },
      {
        name: 'reset',
        label: 'Reset to Defaults',
        icon: 'refresh',
        description: 'Reset all branding settings to defaults',
        confirm: 'Are you sure you want to reset all branding settings?'
      },
      {
        name: 'export',
        label: 'Export Theme',
        icon: 'download',
        description: 'Export branding settings as JSON'
      }
    ];
  }
  
  // ==============================================================================
  // Actions
  // ==============================================================================
  
  /**
   * Preview action - returns preview URL
   */
  async action_preview(params) {
    return {
      success: true,
      url: '/support',
      message: 'Opening support page preview'
    };
  }
  
  /**
   * Reset action - resets to default settings
   */
  async action_reset(params) {
    const defaults = this.getDefaultSettings();
    await this.saveSettings(defaults);
    
    return {
      success: true,
      message: 'Branding settings reset to defaults',
      settings: defaults
    };
  }
  
  /**
   * Export action - returns settings as JSON
   */
  async action_export(params) {
    const settings = this.getSettings();
    
    return {
      success: true,
      data: settings,
      filename: `branding-${Date.now()}.json`
    };
  }
  
  // ==============================================================================
  // Public Methods
  // ==============================================================================
  
  /**
   * Get CSS variables for theming
   * @returns {string} CSS variable declarations
   */
  getCssVariables() {
    const settings = this.getSettings();
    
    if (!settings.enabled) {
      return '';
    }
    
    return `
      :root {
        --brand-primary: ${settings.primaryColor};
        --brand-secondary: ${settings.secondaryColor};
        --brand-accent: ${settings.accentColor};
        --brand-background: ${settings.backgroundColor};
        --brand-text: ${settings.textColor};
        --logo-width: ${settings.logoWidth}px;
      }
    `.trim();
  }
  
  /**
   * Get branding data for templates
   * @returns {object} Branding data
   */
  getBrandingData() {
    const settings = this.getSettings();
    
    return {
      companyName: settings.companyName,
      companyTagline: settings.companyTagline,
      companyWebsite: settings.companyWebsite,
      logoUrl: settings.logoUrl,
      logoWidth: settings.logoWidth,
      faviconUrl: settings.faviconUrl,
      supportTitle: settings.supportTitle,
      supportDescription: settings.supportDescription,
      supportButtonText: settings.supportButtonText,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone,
      supportHours: settings.supportHours,
      footerText: settings.footerText,
      showPoweredBy: settings.showPoweredBy,
      cssVariables: this.getCssVariables(),
      customCss: settings.customCss
    };
  }
  
  /**
   * Generate support page HTML with branding
   * @returns {string} HTML content
   */
  async generateSupportPage() {
    const data = this.getBrandingData();
    
    // This would typically use a template engine
    // For now, return data that can be used by frontend
    return data;
  }
}

module.exports = BrandingModule;
