/**
 * API Routes
 * 
 * Main router for all API endpoints.
 * Admin routes are in admin.js, mounted separately.
 */

const express = require('express');
const router = express.Router();

// ==============================================================================
// Health Check
// ==============================================================================

router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    authenticated: !!req.user,
    user: req.user ? req.user.name : null
  });
});

// ==============================================================================
// Auth Middleware Helpers
// ==============================================================================

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in to MeshCentral first.',
      loginUrl: '/'
    });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      loginUrl: '/'
    });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
}

// ==============================================================================
// Module Routes
// ==============================================================================

const adminOnlyModules = ['branding', 'email', 'general', 'webhook'];

/**
 * GET /api/modules
 * List all available modules
 */
router.get('/modules', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader) {
      return res.status(503).json({ success: false, error: 'Module loader not available' });
    }
    
    const allModules = moduleLoader.getModuleList();
    
    // Filter based on user role
    const modules = allModules.filter(mod => {
      if (adminOnlyModules.includes(mod.name)) {
        return req.user.isAdmin;
      }
      return true;
    });

    res.json({
      success: true,
      isAdmin: req.user.isAdmin,
      modules: modules
    });
  } catch (error) {
    console.error('Error listing modules:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/modules/:name
 * Get specific module info and settings
 */
router.get('/modules/:name', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const { name } = req.params;
    
    if (!moduleLoader) {
      return res.status(503).json({ success: false, error: 'Module loader not available' });
    }
    
    // Check admin-only modules
    if (adminOnlyModules.includes(name) && !req.user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required for this module' 
      });
    }

    if (!moduleLoader.has(name)) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    const module = moduleLoader.get(name);
    const schema = typeof module.getSchema === 'function' ? module.getSchema() : null;
    
    let settings = {};
    try {
      settings = await module.getSettings();
    } catch (e) {
      console.error(`Error getting settings for ${name}:`, e.message);
    }

    // For user-specific modules, get user's own data
    if (!req.user.isAdmin && typeof module.getUserSettings === 'function') {
      try {
        const userSettings = await module.getUserSettings(req.user.id);
        return res.json({
          success: true,
          name,
          schema,
          settings: userSettings,
          isAdmin: false
        });
      } catch (e) {
        console.error(`Error getting user settings for ${name}:`, e.message);
      }
    }
    
    res.json({
      success: true,
      name,
      schema,
      settings,
      isAdmin: req.user.isAdmin
    });
  } catch (error) {
    console.error(`Error getting module ${req.params.name}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/modules/:name
 * Update module settings
 */
router.post('/modules/:name', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const { name } = req.params;
    
    if (!moduleLoader) {
      return res.status(503).json({ success: false, error: 'Module loader not available' });
    }
    
    // Check admin-only modules
    if (adminOnlyModules.includes(name) && !req.user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required for this module' 
      });
    }

    if (!moduleLoader.has(name)) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    const module = moduleLoader.get(name);
    
    // For user-specific modules, save under user's ID
    if (!req.user.isAdmin && typeof module.saveUserSettings === 'function') {
      const result = await module.saveUserSettings(req.user.id, req.body);
      return res.json({ success: true, result });
    }
    
    const result = await module.saveSettings(req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error(`Error saving module ${req.params.name}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/modules/:name/action/:action
 * Execute a module action
 */
router.post('/modules/:name/action/:action', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const { name, action } = req.params;
    
    if (!moduleLoader) {
      return res.status(503).json({ success: false, error: 'Module loader not available' });
    }
    
    // Check admin-only modules
    if (adminOnlyModules.includes(name) && !req.user.isAdmin) {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required for this module' 
      });
    }

    if (!moduleLoader.has(name)) {
      return res.status(404).json({ success: false, error: 'Module not found' });
    }

    const module = moduleLoader.get(name);

    if (typeof module.executeAction !== 'function') {
      return res.status(400).json({ success: false, error: 'Module does not support actions' });
    }

    const result = await module.executeAction(action, req.body, req.user);
    res.json({ success: true, result });
  } catch (error) {
    console.error(`Error executing action ${req.params.action} on ${req.params.name}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// Telegram Routes (User-Specific)
// ==============================================================================

/**
 * GET /api/telegram/my-settings
 */
router.get('/telegram/my-settings', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('telegram')) {
      return res.json({ success: true, settings: {} });
    }

    const telegram = moduleLoader.get('telegram');
    
    if (typeof telegram.getUserSettings !== 'function') {
      return res.json({ success: true, settings: {} });
    }
    
    const settings = await telegram.getUserSettings(req.user.id);
    res.json({ success: true, settings: settings || {} });
  } catch (error) {
    console.error('Error getting telegram settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram/my-settings
 */
router.post('/telegram/my-settings', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('telegram')) {
      return res.status(404).json({ success: false, error: 'Telegram module not available' });
    }

    const telegram = moduleLoader.get('telegram');
    
    if (typeof telegram.saveUserSettings !== 'function') {
      return res.status(400).json({ success: false, error: 'Module does not support user settings' });
    }
    
    const result = await telegram.saveUserSettings(req.user.id, req.body);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error saving telegram settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram/my-settings/test
 */
router.post('/telegram/my-settings/test', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('telegram')) {
      return res.status(404).json({ success: false, error: 'Telegram module not available' });
    }

    const telegram = moduleLoader.get('telegram');
    
    if (typeof telegram.testUserNotification !== 'function') {
      return res.status(400).json({ success: false, error: 'Test not available' });
    }
    
    const result = await telegram.testUserNotification(req.user.id);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error testing telegram:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// Branding (Public Read)
// ==============================================================================

router.get('/branding', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('branding')) {
      return res.json({ success: true, settings: {} });
    }

    const branding = moduleLoader.get('branding');
    
    let settings = {};
    try {
      settings = await branding.getSettings();
    } catch (e) {
      // Ignore errors, return empty
    }
    
    // Only return public-safe fields
    res.json({ 
      success: true, 
      settings: {
        enabled: settings.enabled || false,
        companyName: settings.companyName || '',
        pageTitle: settings.pageTitle || '',
        logoUrl: settings.logoUrl || '',
        faviconUrl: settings.faviconUrl || '',
        primaryColor: settings.primaryColor || '',
        headerColor: settings.headerColor || '',
        headerTextColor: settings.headerTextColor || '',
        welcomeMessage: settings.welcomeMessage || '',
        footerText: settings.footerText || ''
      }
    });
  } catch (error) {
    console.error('Error getting branding:', error);
    res.json({ success: true, settings: {} });
  }
});

// ==============================================================================
// Webhook Endpoint (Public)
// ==============================================================================

router.post('/webhook/:source', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const { source } = req.params;

    console.log(`Webhook received from ${source}:`, JSON.stringify(req.body).substring(0, 200));

    if (moduleLoader && moduleLoader.has('webhook')) {
      try {
        const webhook = moduleLoader.get('webhook');
        const result = await webhook.processIncoming(req.body, req.query.secret);
        
        // Forward to telegram if available
        if (moduleLoader.has('telegram') && result && result.eventType) {
          const telegram = moduleLoader.get('telegram');
          if (typeof telegram.handleWebhook === 'function') {
            await telegram.handleWebhook(result.eventType, result.payload);
          }
        }
      } catch (e) {
        console.error('Webhook processing error:', e.message);
      }
    }

    res.json({ success: true, received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
