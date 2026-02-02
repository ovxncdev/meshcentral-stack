/**
 * Branding Module
 * 
 * Handles customization of the MeshCentral UI.
 * Applies branding to login page, dashboard, and all pages.
 * 
 * Features:
 * - Logo customization
 * - Color theming
 * - Title/favicon
 * - Custom CSS injection
 */

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

class BrandingModule {
  constructor(configManager) {
    this.configManager = configManager;
    this.name = 'branding';
    this.description = 'Branding & Customization';
    this.icon = 'palette';
    
    // MeshCentral web directory (where we inject customizations)
    this.meshWebDir = process.env.MESHCENTRAL_WEB_DIR || '/opt/meshcentral/meshcentral-web';
    this.customDir = process.env.CUSTOM_DIR || '/app/data/branding';
  }

  /**
   * Initialize module
   */
  async init() {
    // Ensure custom directory exists
    try {
      await fs.mkdir(this.customDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create branding directory:', error);
    }
  }

  /**
   * Get module schema for UI rendering
   */
  getSchema() {
    return {
      title: 'Branding & Customization',
      description: 'Customize the look and feel of MeshCentral',
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          title: 'Enable Custom Branding',
          default: false
        },
        companyName: {
          type: 'string',
          title: 'Company Name',
          placeholder: 'My Company'
        },
        pageTitle: {
          type: 'string',
          title: 'Page Title',
          placeholder: 'Remote Support Portal'
        },
        logoUrl: {
          type: 'string',
          title: 'Logo URL',
          description: 'URL to your logo image (recommended: 200x50px)',
          placeholder: 'https://example.com/logo.png'
        },
        faviconUrl: {
          type: 'string',
          title: 'Favicon URL',
          description: 'URL to favicon (32x32 or 16x16 ICO/PNG)',
          placeholder: 'https://example.com/favicon.ico'
        },
        primaryColor: {
          type: 'string',
          title: 'Primary Color',
          description: 'Main theme color',
          default: '#007bff',
          format: 'color'
        },
        headerColor: {
          type: 'string',
          title: 'Header Background Color',
          default: '#2c3e50',
          format: 'color'
        },
        headerTextColor: {
          type: 'string',
          title: 'Header Text Color',
          default: '#ffffff',
          format: 'color'
        },
        loginBackground: {
          type: 'string',
          title: 'Login Page Background',
          description: 'URL to background image or CSS color',
          placeholder: '#f5f5f5 or https://example.com/bg.jpg'
        },
        welcomeMessage: {
          type: 'string',
          title: 'Welcome Message',
          description: 'Shown on login page',
          placeholder: 'Welcome to our support portal'
        },
        footerText: {
          type: 'string',
          title: 'Footer Text',
          placeholder: '© 2024 My Company'
        },
        customCss: {
          type: 'string',
          title: 'Custom CSS',
          description: 'Additional CSS to inject',
          format: 'textarea',
          placeholder: '/* Custom styles */'
        },
        hideBuiltInLogo: {
          type: 'boolean',
          title: 'Hide MeshCentral Logo',
          default: true
        }
      },
      actions: [
        {
          name: 'apply',
          title: 'Apply Branding',
          icon: 'check',
          style: 'primary'
        },
        {
          name: 'reset',
          title: 'Reset to Default',
          icon: 'refresh',
          style: 'secondary'
        },
        {
          name: 'preview',
          title: 'Preview CSS',
          icon: 'eye',
          style: 'secondary'
        }
      ]
    };
  }

  /**
   * Get current settings
   */
  async getSettings() {
    const settings = await this.configManager.get('branding') || {};
    return {
      enabled: settings.enabled || false,
      companyName: settings.companyName || '',
      pageTitle: settings.pageTitle || '',
      logoUrl: settings.logoUrl || '',
      faviconUrl: settings.faviconUrl || '',
      primaryColor: settings.primaryColor || '#007bff',
      headerColor: settings.headerColor || '#2c3e50',
      headerTextColor: settings.headerTextColor || '#ffffff',
      loginBackground: settings.loginBackground || '',
      welcomeMessage: settings.welcomeMessage || '',
      footerText: settings.footerText || '',
      customCss: settings.customCss || '',
      hideBuiltInLogo: settings.hideBuiltInLogo !== false
    };
  }

  /**
   * Save settings
   */
  async saveSettings(data) {
    const updated = {
      enabled: !!data.enabled,
      companyName: (data.companyName || '').trim(),
      pageTitle: (data.pageTitle || '').trim(),
      logoUrl: (data.logoUrl || '').trim(),
      faviconUrl: (data.faviconUrl || '').trim(),
      primaryColor: data.primaryColor || '#007bff',
      headerColor: data.headerColor || '#2c3e50',
      headerTextColor: data.headerTextColor || '#ffffff',
      loginBackground: (data.loginBackground || '').trim(),
      welcomeMessage: (data.welcomeMessage || '').trim(),
      footerText: (data.footerText || '').trim(),
      customCss: (data.customCss || '').trim(),
      hideBuiltInLogo: data.hideBuiltInLogo !== false,
      updatedAt: new Date().toISOString()
    };
    
    await this.configManager.set('branding', updated);
    
    // Auto-apply if enabled
    if (updated.enabled) {
      await this.applyBranding();
    }
    
    return { success: true };
  }

  /**
   * Get branding data for external use (public endpoint)
   */
  getBrandingData() {
    const settings = this.configManager.getSync('branding') || {};
    
    if (!settings.enabled) {
      return {};
    }
    
    return {
      companyName: settings.companyName,
      pageTitle: settings.pageTitle,
      logoUrl: settings.logoUrl,
      faviconUrl: settings.faviconUrl,
      primaryColor: settings.primaryColor,
      headerColor: settings.headerColor,
      headerTextColor: settings.headerTextColor,
      welcomeMessage: settings.welcomeMessage,
      footerText: settings.footerText
    };
  }

  /**
   * Generate CSS from settings
   */
  generateCss(settings) {
    const css = [];
    
    // Root variables
    css.push(':root {');
    css.push(`  --brand-primary: ${settings.primaryColor || '#007bff'};`);
    css.push(`  --brand-header-bg: ${settings.headerColor || '#2c3e50'};`);
    css.push(`  --brand-header-text: ${settings.headerTextColor || '#ffffff'};`);
    css.push('}');
    css.push('');
    
    // Header styling
    css.push('#MainHeader, #mainHeader, .header, header {');
    css.push('  background-color: var(--brand-header-bg) !important;');
    css.push('  color: var(--brand-header-text) !important;');
    css.push('}');
    css.push('');
    
    css.push('#MainHeader *, #mainHeader *, .header *, header * {');
    css.push('  color: var(--brand-header-text) !important;');
    css.push('}');
    css.push('');
    
    // Primary color for buttons and links
    css.push('a, .btn-primary, button.primary {');
    css.push('  color: var(--brand-primary);');
    css.push('}');
    css.push('');
    
    css.push('.btn-primary, button.primary, input[type="submit"] {');
    css.push('  background-color: var(--brand-primary) !important;');
    css.push('  border-color: var(--brand-primary) !important;');
    css.push('}');
    css.push('');
    
    // Logo replacement
    if (settings.logoUrl) {
      css.push('/* Custom Logo */');
      css.push('#MainHeaderLogo, #mainHeaderLogo, .logo img, header img.logo {');
      css.push(`  content: url("${settings.logoUrl}") !important;`);
      css.push('  max-height: 40px !important;');
      css.push('  width: auto !important;');
      css.push('}');
      css.push('');
    }
    
    // Hide built-in logo
    if (settings.hideBuiltInLogo) {
      css.push('/* Hide default MeshCentral branding */');
      css.push('.meshcentralLogo, #MeshCentralLogo, img[src*="meshcentral"] {');
      css.push('  display: none !important;');
      css.push('}');
      css.push('');
    }
    
    // Login page background
    if (settings.loginBackground) {
      const isUrl = settings.loginBackground.startsWith('http') || settings.loginBackground.startsWith('/');
      css.push('/* Login page background */');
      css.push('#loginPanel, .loginPanel, body.login, #loginpanel {');
      if (isUrl) {
        css.push(`  background-image: url("${settings.loginBackground}") !important;`);
        css.push('  background-size: cover !important;');
        css.push('  background-position: center !important;');
      } else {
        css.push(`  background: ${settings.loginBackground} !important;`);
      }
      css.push('}');
      css.push('');
    }
    
    // Footer text
    if (settings.footerText) {
      css.push('/* Footer */');
      css.push('#footer::after, .footer::after {');
      css.push(`  content: "${settings.footerText.replace(/"/g, '\\"')}";`);
      css.push('  display: block;');
      css.push('  text-align: center;');
      css.push('  padding: 10px;');
      css.push('  color: #666;');
      css.push('}');
      css.push('');
    }
    
    // Custom CSS
    if (settings.customCss) {
      css.push('/* Custom CSS */');
      css.push(settings.customCss);
      css.push('');
    }
    
    return css.join('\n');
  }

  /**
   * Generate JavaScript for dynamic branding
   */
  generateJs(settings) {
    const js = [];
    
    js.push('// Custom Branding Script');
    js.push('(function() {');
    js.push('  "use strict";');
    js.push('');
    js.push('  function applyBranding() {');
    
    // Page title
    if (settings.pageTitle) {
      js.push(`    document.title = "${settings.pageTitle.replace(/"/g, '\\"')}";`);
    }
    
    // Favicon
    if (settings.faviconUrl) {
      js.push('    var favicon = document.querySelector("link[rel*=\\"icon\\"]") || document.createElement("link");');
      js.push('    favicon.type = "image/x-icon";');
      js.push('    favicon.rel = "shortcut icon";');
      js.push(`    favicon.href = "${settings.faviconUrl}";`);
      js.push('    document.head.appendChild(favicon);');
    }
    
    // Welcome message on login page
    if (settings.welcomeMessage) {
      js.push('    var loginTitle = document.querySelector("#loginpanel h1, #loginPanel h1, .login-title");');
      js.push('    if (loginTitle) {');
      js.push(`      loginTitle.textContent = "${settings.welcomeMessage.replace(/"/g, '\\"')}";`);
      js.push('    }');
    }
    
    // Company name in header
    if (settings.companyName) {
      js.push('    var headerTitle = document.querySelector("#MainHeaderTitle, #mainHeaderTitle, .header-title");');
      js.push('    if (headerTitle) {');
      js.push(`      headerTitle.textContent = "${settings.companyName.replace(/"/g, '\\"')}";`);
      js.push('    }');
    }
    
    js.push('  }');
    js.push('');
    js.push('  // Apply on load');
    js.push('  if (document.readyState === "loading") {');
    js.push('    document.addEventListener("DOMContentLoaded", applyBranding);');
    js.push('  } else {');
    js.push('    applyBranding();');
    js.push('  }');
    js.push('');
    js.push('  // Also apply after short delay (for SPA navigation)');
    js.push('  setTimeout(applyBranding, 500);');
    js.push('  setTimeout(applyBranding, 1500);');
    js.push('})();');
    
    return js.join('\n');
  }

  /**
   * Apply branding to MeshCentral
   */
  async applyBranding() {
    const settings = await this.getSettings();
    
    if (!settings.enabled) {
      // Remove custom files if disabled
      await this.removeBranding();
      return { success: true, message: 'Branding disabled' };
    }
    
    try {
      // Ensure custom directory exists
      await fs.mkdir(this.customDir, { recursive: true });
      
      // Generate and save CSS
      const css = this.generateCss(settings);
      const cssPath = path.join(this.customDir, 'custom.css');
      await fs.writeFile(cssPath, css, 'utf8');
      
      // Generate and save JS
      const js = this.generateJs(settings);
      const jsPath = path.join(this.customDir, 'custom.js');
      await fs.writeFile(jsPath, js, 'utf8');
      
      // Create injection snippet for MeshCentral
      const injection = this.generateInjectionSnippet();
      const injectionPath = path.join(this.customDir, 'inject.html');
      await fs.writeFile(injectionPath, injection, 'utf8');
      
      console.log('Branding files generated:', cssPath, jsPath);
      
      return { 
        success: true, 
        message: 'Branding applied successfully',
        files: ['custom.css', 'custom.js', 'inject.html']
      };
    } catch (error) {
      console.error('Failed to apply branding:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove branding files
   */
  async removeBranding() {
    try {
      const files = ['custom.css', 'custom.js', 'inject.html'];
      for (const file of files) {
        const filePath = path.join(this.customDir, file);
        await fs.unlink(filePath).catch(() => {});
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate HTML snippet to inject into MeshCentral pages
   */
  generateInjectionSnippet() {
    return `<!-- Custom Branding -->
<link rel="stylesheet" href="/custom/custom.css">
<script src="/custom/custom.js"></script>
`;
  }

  /**
   * Execute module actions
   */
  async executeAction(action, data, user) {
    if (!user?.isAdmin) {
      throw new Error('Admin access required');
    }
    
    switch (action) {
      case 'apply':
        return this.applyBranding();
      
      case 'reset':
        await this.configManager.set('branding', {});
        await this.removeBranding();
        return { success: true, message: 'Branding reset to defaults' };
      
      case 'preview':
        const settings = await this.getSettings();
        return {
          success: true,
          css: this.generateCss(settings),
          js: this.generateJs(settings)
        };
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
}

module.exports = BrandingModule;
