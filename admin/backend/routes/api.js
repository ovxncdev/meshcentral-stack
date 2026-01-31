/**
 * API Routes
 * 
 * RESTful API endpoints for the admin dashboard.
 * 
 * Endpoints:
 *   GET  /api/modules              - List all modules
 *   GET  /api/modules/:name        - Get module details
 *   GET  /api/modules/:name/settings - Get module settings
 *   PUT  /api/modules/:name/settings - Update module settings
 *   POST /api/modules/:name/actions/:action - Execute module action
 *   
 *   POST /api/webhook/meshcentral  - Incoming webhook from MeshCentral
 *   
 *   GET  /api/settings             - Get global settings
 *   PUT  /api/settings             - Update global settings
 *   
 *   GET  /api/health               - Health check
 */

const express = require('express');
const router = express.Router();

// ==============================================================================
// Middleware
// ==============================================================================

/**
 * Simple authentication middleware
 * In production, implement proper authentication (JWT, sessions, etc.)
 */
const authenticate = (req, res, next) => {
  // Skip auth for webhook endpoints
  if (req.path.startsWith('/webhook/')) {
    return next();
  }
  
  // Skip auth for health check
  if (req.path === '/health') {
    return next();
  }
  
  // Check for API key or session
  const apiKey = req.headers['x-api-key'];
  const authSecret = process.env.AUTH_SECRET;
  
  // If AUTH_SECRET is set, require authentication
  if (authSecret && apiKey !== authSecret) {
    // For now, allow all requests in development
    // In production, uncomment the following:
    // return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

router.use(authenticate);

// ==============================================================================
// Health Check
// ==============================================================================

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ==============================================================================
// Module Routes
// ==============================================================================

/**
 * GET /api/modules
 * List all loaded modules with their metadata
 */
router.get('/modules', (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const modules = moduleLoader.getModuleList();
    
    res.json({
      success: true,
      modules
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/modules/:name
 * Get details for a specific module
 */
router.get('/modules/:name', (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const { name } = req.params;
    
    if (!moduleLoader.has(name)) {
      return res.status(404).json({
        success: false,
        error: `Module not found: ${name}`
      });
    }
    
    const module = moduleLoader.get(name);
    
    res.json({
      success: true,
      module: {
        name: module.name,
        displayName: module.displayName,
        description: module.description,
        icon: module.icon,
        enabled: module.isEnabled(),
        schema: module.getSchema(),
        actions: module.getActions(),
        settings: module.getSettings()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/modules/:name/settings
 * Get settings for a specific module
 */
router.get('/modules/:name/settings', (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const { name } = req.params;
    
    if (!moduleLoader.has(name)) {
      return res.status(404).json({
        success: false,
        error: `Module not found: ${name}`
      });
    }
    
    const module = moduleLoader.get(name);
    
    res.json({
      success: true,
      settings: module.getSettings()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/modules/:name/settings
 * Update settings for a specific module
 */
router.put('/modules/:name/settings', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const { name } = req.params;
    const settings = req.body;
    
    if (!moduleLoader.has(name)) {
      return res.status(404).json({
        success: false,
        error: `Module not found: ${name}`
      });
    }
    
    const module = moduleLoader.get(name);
    
    // Validate and save settings
    await module.saveSettings(settings);
    
    res.json({
      success: true,
      message: 'Settings saved successfully',
      settings: module.getSettings()
    });
  } catch (error) {
    // Check for validation errors
    if (error.validationErrors) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        validationErrors: error.validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/modules/:name/actions/:action
 * Execute an action on a module
 */
router.post('/modules/:name/actions/:action', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const { name, action } = req.params;
    const params = req.body;
    
    if (!moduleLoader.has(name)) {
      return res.status(404).json({
        success: false,
        error: `Module not found: ${name}`
      });
    }
    
    const result = await moduleLoader.executeAction(name, action, params);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// Webhook Routes
// ==============================================================================

/**
 * POST /api/webhook/meshcentral
 * Incoming webhook from MeshCentral
 */
router.post('/webhook/meshcentral', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const payload = req.body;
    const signature = req.headers['x-webhook-signature'] || req.query.secret;
    
    // Process with webhook module
    if (!moduleLoader.has('webhook')) {
      return res.status(503).json({
        success: false,
        error: 'Webhook module not available'
      });
    }
    
    const webhookModule = moduleLoader.get('webhook');
    const { eventType, payload: normalizedPayload } = await webhookModule.processIncoming(payload, signature);
    
    // Trigger event handlers in all modules
    const results = await moduleLoader.handleWebhook(eventType, normalizedPayload);
    
    res.json({
      success: true,
      eventType,
      results
    });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/webhook/test
 * Test endpoint to simulate events
 */
router.post('/webhook/test', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const { eventType, payload } = req.body;
    
    if (!eventType) {
      return res.status(400).json({
        success: false,
        error: 'eventType is required'
      });
    }
    
    // Add default payload values
    const testPayload = {
      deviceName: 'Test-Device',
      userName: 'Test User',
      groupName: 'Test Group',
      ipAddress: '192.168.1.100',
      timestamp: new Date().toISOString(),
      ...payload
    };
    
    // Trigger event handlers
    const results = await moduleLoader.handleWebhook(eventType, testPayload);
    
    res.json({
      success: true,
      eventType,
      payload: testPayload,
      results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// Global Settings Routes
// ==============================================================================

/**
 * GET /api/settings
 * Get global settings
 */
router.get('/settings', (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const settings = configManager.getAll();
    
    // Remove internal fields
    const { _version, _lastModified, modules, ...globalSettings } = settings;
    
    res.json({
      success: true,
      settings: globalSettings,
      meta: {
        version: _version,
        lastModified: _lastModified
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/settings
 * Update global settings
 */
router.put('/settings', async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const settings = req.body;
    
    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      if (key !== 'modules' && !key.startsWith('_')) {
        await configManager.set(key, value);
      }
    }
    
    res.json({
      success: true,
      message: 'Settings saved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// Export/Import Routes
// ==============================================================================

/**
 * GET /api/export
 * Export all settings
 */
router.get('/export', (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const data = configManager.export();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="remote-support-settings-${Date.now()}.json"`);
    res.send(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/import
 * Import settings from JSON
 */
router.post('/import', async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const data = JSON.stringify(req.body);
    
    await configManager.import(data);
    
    res.json({
      success: true,
      message: 'Settings imported successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// Branding Routes
// ==============================================================================

/**
 * GET /api/branding
 * Get branding data for support page
 * (Public endpoint - no auth required)
 */
router.get('/branding', (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('branding')) {
      return res.json({
        success: true,
        branding: {}
      });
    }
    
    const brandingModule = moduleLoader.get('branding');
    const branding = brandingModule.getBrandingData();
    
    res.json({
      success: true,
      branding
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
