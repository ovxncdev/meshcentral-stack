/**
 * API Routes
 * 
 * Main router for all API endpoints.
 * Handles module operations with role-based access control.
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

/**
 * GET /api/modules
 * List all available modules with their status
 * Filters based on user role
 */
router.get('/modules', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const allModules = moduleLoader.getModuleList();
    
    // Define which modules are admin-only
    const adminOnlyModules = ['branding', 'email', 'general'];
    
    // Filter modules based on user role
    const modules = allModules.filter(mod => {
      if (adminOnlyModules.includes(mod.name)) {
        return req.user.isAdmin;
      }
      return true;
    });

    // Add role info to response
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
    
    // Check admin-only modules
    const adminOnlyModules = ['branding', 'email', 'general'];
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
    const schema = module.getSchema ? module.getSchema() : null;
    const settings = await module.getSettings();

    // For user-specific modules, filter to user's own data
    if (!req.user.isAdmin && module.getUserSettings) {
      const userSettings = await module.getUserSettings(req.user.id);
      res.json({
        success: true,
        name,
        schema,
        settings: userSettings,
        isAdmin: false
      });
    } else {
      res.json({
        success: true,
        name,
        schema,
        settings,
        isAdmin: req.user.isAdmin
      });
    }
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
    
    // Check admin-only modules
    const adminOnlyModules = ['branding', 'email', 'general'];
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
    if (!req.user.isAdmin && module.saveUserSettings) {
      const result = await module.saveUserSettings(req.user.id, req.body);
      res.json({ success: true, result });
    } else {
      const result = await module.saveSettings(req.body);
      res.json({ success: true, result });
    }
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
    
    // Check admin-only modules
    const adminOnlyModules = ['branding', 'email', 'general'];
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

    if (!module.executeAction) {
      return res.status(400).json({ success: false, error: 'Module does not support actions' });
    }

    // Pass user info to action
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
 * Get current user's telegram settings
 */
router.get('/telegram/my-settings', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('telegram')) {
      return res.status(404).json({ success: false, error: 'Telegram module not available' });
    }

    const telegram = moduleLoader.get('telegram');
    const settings = await telegram.getUserSettings(req.user.id);
    
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error getting telegram settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram/my-settings
 * Save current user's telegram settings
 */
router.post('/telegram/my-settings', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('telegram')) {
      return res.status(404).json({ success: false, error: 'Telegram module not available' });
    }

    const telegram = moduleLoader.get('telegram');
    const result = await telegram.saveUserSettings(req.user.id, req.body);
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error saving telegram settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/telegram/my-settings/test
 * Test current user's telegram configuration
 */
router.post('/telegram/my-settings/test', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('telegram')) {
      return res.status(404).json({ success: false, error: 'Telegram module not available' });
    }

    const telegram = moduleLoader.get('telegram');
    const result = await telegram.testUserNotification(req.user.id);
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error testing telegram:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// Files Routes (User-Specific with Admin Override)
// ==============================================================================

/**
 * GET /api/files/my-files
 * Get current user's files
 */
router.get('/files/my-files', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('files')) {
      return res.status(404).json({ success: false, error: 'Files module not available' });
    }

    const files = moduleLoader.get('files');
    const userFiles = await files.getUserFiles(req.user.id);
    
    res.json({ success: true, files: userFiles });
  } catch (error) {
    console.error('Error getting user files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/files/all
 * Get all files (admin only)
 */
router.get('/files/all', requireAdmin, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('files')) {
      return res.status(404).json({ success: false, error: 'Files module not available' });
    }

    const files = moduleLoader.get('files');
    const allFiles = await files.getAllFiles();
    
    res.json({ success: true, files: allFiles });
  } catch (error) {
    console.error('Error getting all files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/files/upload
 * Upload a file (associated with current user)
 */
router.post('/files/upload', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('files')) {
      return res.status(404).json({ success: false, error: 'Files module not available' });
    }

    const files = moduleLoader.get('files');
    
    // Pass user info for ownership
    const result = await files.executeAction('upload', req.body, req.user);
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/files/:id
 * Delete a file (owner or admin only)
 */
router.delete('/files/:id', requireAuth, async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('files')) {
      return res.status(404).json({ success: false, error: 'Files module not available' });
    }

    const files = moduleLoader.get('files');
    const file = await files.getFileById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    // Check ownership or admin
    if (file.ownerId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const result = await files.deleteFile(req.params.id);
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// Admin Routes - User Management
// ==============================================================================

/**
 * GET /api/admin/users
 * List all users with their settings (admin only)
 */
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const users = await configManager.get('users') || {};
    
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/users/:id
 * Get specific user's settings (admin only)
 */
router.get('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const users = await configManager.get('users') || {};
    const user = users[req.params.id];
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update specific user's settings (admin only)
 */
router.put('/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const users = await configManager.get('users') || {};
    
    users[req.params.id] = {
      ...users[req.params.id],
      ...req.body,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    };
    
    await configManager.set('users', users);
    
    res.json({ success: true, user: users[req.params.id] });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// Admin Routes - All Devices by User
// ==============================================================================

/**
 * GET /api/admin/devices
 * Get all devices organized by user (admin only)
 * Fetches from MeshCentral API
 */
router.get('/admin/devices', requireAdmin, async (req, res) => {
  try {
    const http = require('http');
    const cookies = req.headers.cookie || '';

    // Fetch devices from MeshCentral
    const meshResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'meshcentral',
        port: 80,
        path: '/api/meshes',
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'Accept': 'application/json'
        },
        timeout: 10000
      };

      const request = http.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve({ status: response.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: response.statusCode, data: null, error: e.message });
          }
        });
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Timeout'));
      });

      request.end();
    });

    if (meshResponse.status !== 200 || !meshResponse.data) {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch devices from MeshCentral' 
      });
    }

    // Organize devices by user
    const devicesByUser = {};
    const meshes = meshResponse.data.meshes || meshResponse.data || [];

    for (const mesh of Object.values(meshes)) {
      const userId = mesh.creation?.userid || mesh.links?.[0]?.userid || 'unknown';
      
      if (!devicesByUser[userId]) {
        devicesByUser[userId] = {
          userId,
          meshes: []
        };
      }
      
      devicesByUser[userId].meshes.push({
        id: mesh._id,
        name: mesh.name,
        desc: mesh.desc,
        type: mesh.mtype,
        deviceCount: mesh.nodes?.length || 0
      });
    }

    res.json({ 
      success: true, 
      devicesByUser: Object.values(devicesByUser)
    });
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// Branding (Public Read, Admin Write)
// ==============================================================================

/**
 * GET /api/branding
 * Get branding settings (public - for MeshCentral UI)
 */
router.get('/branding', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('branding')) {
      return res.json({ success: true, settings: {} });
    }

    const branding = moduleLoader.get('branding');
    const settings = await branding.getSettings();
    
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error getting branding:', error);
    res.json({ success: true, settings: {} });
  }
});

// ==============================================================================
// Webhook Endpoint (Public)
// ==============================================================================

/**
 * POST /api/webhook/:source
 * Receive webhooks from external sources (e.g., MeshCentral)
 */
router.post('/webhook/:source', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    const { source } = req.params;

    console.log(`Webhook received from ${source}:`, JSON.stringify(req.body).substring(0, 200));

    // Process through telegram module if available
    if (moduleLoader.has('telegram')) {
      const telegram = moduleLoader.get('telegram');
      await telegram.handleWebhook(source, req.body);
    }

    res.json({ success: true, received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
