/**
 * Admin Routes
 * 
 * Admin-only API endpoints.
 * All routes require admin authentication.
 * 
 * Endpoints:
 *   GET  /api/admin/users           - List all users with settings
 *   GET  /api/admin/users/:id       - Get specific user
 *   PUT  /api/admin/users/:id       - Update user settings
 *   DELETE /api/admin/users/:id     - Delete user settings
 *   
 *   GET  /api/admin/devices         - Get all devices by user
 *   
 *   GET  /api/admin/files           - Get all files
 *   GET  /api/admin/files/stats     - Get storage statistics
 *   
 *   GET  /api/admin/export          - Export all settings
 *   POST /api/admin/import          - Import settings
 */

const express = require('express');
const router = express.Router();
const http = require('http');

// ==============================================================================
// Admin Auth Middleware
// ==============================================================================

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

// Apply to all routes
router.use(requireAdmin);

// ==============================================================================
// User Management
// ==============================================================================

/**
 * GET /api/admin/users
 * List all users with their settings
 */
router.get('/users', async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    
    // Get telegram settings (per-user)
    const telegram = await configManager.get('telegram') || {};
    const telegramUsers = telegram.users || {};
    
    // Get files (to count per user)
    const files = await configManager.get('files') || {};
    const fileItems = files.items || [];
    
    // Build user list
    const userMap = {};
    
    // Add users from telegram settings
    for (const [userId, settings] of Object.entries(telegramUsers)) {
      if (!userMap[userId]) {
        userMap[userId] = {
          id: userId,
          telegramEnabled: settings.enabled,
          telegramConfigured: !!(settings.botToken && settings.chatId),
          fileCount: 0,
          lastActivity: settings.updatedAt
        };
      }
    }
    
    // Add/update users from files
    for (const file of fileItems) {
      const userId = file.ownerId;
      if (!userMap[userId]) {
        userMap[userId] = {
          id: userId,
          name: file.ownerName,
          telegramEnabled: false,
          telegramConfigured: false,
          fileCount: 0,
          lastActivity: null
        };
      }
      userMap[userId].fileCount++;
      if (!userMap[userId].name && file.ownerName) {
        userMap[userId].name = file.ownerName;
      }
    }
    
    const users = Object.values(userMap);
    
    res.json({ 
      success: true, 
      users,
      count: users.length
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/users/:id
 * Get specific user's settings
 */
router.get('/users/:id', async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const userId = req.params.id;
    
    // Get telegram settings
    const telegram = await configManager.get('telegram') || {};
    const telegramSettings = telegram.users?.[userId] || null;
    
    // Get user's files
    const files = await configManager.get('files') || {};
    const userFiles = (files.items || []).filter(f => f.ownerId === userId);
    
    res.json({
      success: true,
      user: {
        id: userId,
        telegram: telegramSettings,
        files: userFiles,
        fileCount: userFiles.length
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update specific user's settings
 */
router.put('/users/:id', async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const userId = req.params.id;
    const updates = req.body;
    
    // Update telegram settings if provided
    if (updates.telegram !== undefined) {
      const telegram = await configManager.get('telegram') || {};
      if (!telegram.users) telegram.users = {};
      
      telegram.users[userId] = {
        ...telegram.users[userId],
        ...updates.telegram,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.id
      };
      
      await configManager.set('telegram', telegram);
    }
    
    res.json({
      success: true,
      message: 'User settings updated'
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete user's settings (not the MeshCentral user)
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const userId = req.params.id;
    
    // Remove telegram settings
    const telegram = await configManager.get('telegram') || {};
    if (telegram.users && telegram.users[userId]) {
      delete telegram.users[userId];
      await configManager.set('telegram', telegram);
    }
    
    // Note: We don't delete user's files automatically
    // Admin should delete files separately if needed
    
    res.json({
      success: true,
      message: 'User settings deleted'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// Device Management (from MeshCentral)
// ==============================================================================

/**
 * GET /api/admin/devices
 * Get all devices organized by user
 */
router.get('/devices', async (req, res) => {
  try {
    const cookies = req.headers.cookie || '';

    // Fetch all meshes (device groups) from MeshCentral
    const meshesResponse = await meshCentralRequest('/api/meshes', cookies);
    
    if (!meshesResponse.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch device groups from MeshCentral'
      });
    }

    // Fetch all nodes (devices) from MeshCentral
    const nodesResponse = await meshCentralRequest('/api/nodes', cookies);
    
    // Organize by user
    const devicesByUser = {};
    const meshes = meshesResponse.data || {};
    const nodes = nodesResponse.data || {};

    // Process meshes
    for (const [meshId, mesh] of Object.entries(meshes)) {
      // Get the user who created/owns this mesh
      let userId = 'unknown';
      let userName = 'Unknown User';
      
      if (mesh.links) {
        // Find the first user with full rights (likely owner)
        for (const [linkId, link] of Object.entries(mesh.links)) {
          if (linkId.startsWith('user/')) {
            userId = linkId;
            userName = linkId.replace('user/', '').split('/').pop();
            break;
          }
        }
      }

      if (!devicesByUser[userId]) {
        devicesByUser[userId] = {
          userId,
          userName,
          meshes: [],
          deviceCount: 0
        };
      }

      // Get devices in this mesh
      const meshDevices = [];
      for (const [nodeId, node] of Object.entries(nodes)) {
        if (node.meshid === meshId) {
          meshDevices.push({
            id: nodeId,
            name: node.name,
            host: node.host,
            ip: node.ip,
            agent: node.agent,
            conn: node.conn, // Connection state
            pwr: node.pwr,   // Power state
            lastSeen: node.lastseen
          });
        }
      }

      devicesByUser[userId].meshes.push({
        id: meshId,
        name: mesh.name,
        desc: mesh.desc,
        type: mesh.mtype,
        devices: meshDevices
      });
      
      devicesByUser[userId].deviceCount += meshDevices.length;
    }

    res.json({
      success: true,
      devicesByUser: Object.values(devicesByUser),
      totalUsers: Object.keys(devicesByUser).length,
      totalDevices: Object.values(devicesByUser).reduce((sum, u) => sum + u.deviceCount, 0)
    });
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper function to make requests to MeshCentral
 */
async function meshCentralRequest(path, cookies) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'meshcentral',
      port: 80,
      path: path,
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
          resolve({ success: true, data: JSON.parse(data) });
        } catch (e) {
          resolve({ success: false, error: 'Invalid JSON response' });
        }
      });
    });

    request.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    request.on('timeout', () => {
      request.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    request.end();
  });
}

// ==============================================================================
// File Management
// ==============================================================================

/**
 * GET /api/admin/files
 * Get all files from all users
 */
router.get('/files', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('files')) {
      return res.status(404).json({ success: false, error: 'Files module not available' });
    }

    const filesModule = moduleLoader.get('files');
    const files = await filesModule.getAllFiles();
    
    res.json({ success: true, files });
  } catch (error) {
    console.error('Error getting files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/files/stats
 * Get storage statistics
 */
router.get('/files/stats', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('files')) {
      return res.status(404).json({ success: false, error: 'Files module not available' });
    }

    const filesModule = moduleLoader.get('files');
    const stats = await filesModule.getStats();
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting file stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/files/cleanup
 * Clean up expired files
 */
router.post('/files/cleanup', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader.has('files')) {
      return res.status(404).json({ success: false, error: 'Files module not available' });
    }

    const filesModule = moduleLoader.get('files');
    const result = await filesModule.cleanupExpired();
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error cleaning up files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// Export/Import
// ==============================================================================

/**
 * GET /api/admin/export
 * Export all settings as JSON
 */
router.get('/export', async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    
    // Get all settings
    const telegram = await configManager.get('telegram') || {};
    const files = await configManager.get('files') || {};
    const branding = await configManager.get('branding') || {};
    const general = await configManager.get('general') || {};
    
    const exportData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.id,
      settings: {
        telegram,
        files: {
          ...files,
          items: undefined // Don't export file records, just settings
        },
        branding,
        general
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="settings-export-${Date.now()}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/import
 * Import settings from JSON
 */
router.post('/import', async (req, res) => {
  try {
    const configManager = req.app.locals.configManager;
    const importData = req.body;

    if (!importData.version || !importData.settings) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import file format'
      });
    }

    const settings = importData.settings;
    let imported = [];

    // Import each section
    if (settings.telegram) {
      await configManager.set('telegram', settings.telegram);
      imported.push('telegram');
    }
    
    if (settings.branding) {
      await configManager.set('branding', settings.branding);
      imported.push('branding');
    }
    
    if (settings.general) {
      await configManager.set('general', settings.general);
      imported.push('general');
    }
    
    if (settings.files) {
      // Only import file settings, not file records
      const currentFiles = await configManager.get('files') || {};
      await configManager.set('files', {
        ...currentFiles,
        enabled: settings.files.enabled,
        maxFileSize: settings.files.maxFileSize,
        allowedTypes: settings.files.allowedTypes,
        defaultExpiration: settings.files.defaultExpiration
      });
      imported.push('files (settings only)');
    }

    res.json({
      success: true,
      message: 'Settings imported successfully',
      imported
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// System Info
// ==============================================================================

/**
 * GET /api/admin/system
 * Get system information
 */
router.get('/system', async (req, res) => {
  try {
    const os = require('os');
    
    res.json({
      success: true,
      system: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptime: os.uptime(),
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem()
        },
        node: process.version,
        env: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// Admin Access Sync
// ==============================================================================

/**
 * POST /api/admin/sync-access
 * Sync admin access to all device groups
 * Ensures all site admins can see all devices
 */
router.post('/sync-access', async (req, res) => {
  try {
    const Datastore = require('@seald-io/nedb');
    const dbPath = process.env.MESHCENTRAL_DB_PATH || '/opt/meshcentral/meshcentral-data/meshcentral.db';
    
    const db = new Datastore({ filename: dbPath, autoload: true });
    
    // Helper to promisify db operations
    const dbFind = (query) => new Promise((resolve, reject) => {
      db.find(query, (err, docs) => err ? reject(err) : resolve(docs));
    });
    
    const dbFindOne = (query) => new Promise((resolve, reject) => {
      db.findOne(query, (err, doc) => err ? reject(err) : resolve(doc));
    });
    
    const dbUpdate = (query, update) => new Promise((resolve, reject) => {
      db.update(query, update, {}, (err, num) => err ? reject(err) : resolve(num));
    });
    
    // Find all site admins (siteadmin field with full rights = 4294967295)
    const admins = await dbFind({ type: 'user', siteadmin: 4294967295 });
    console.log(`Found ${admins.length} site admin(s)`);
    
    // Find all active device groups (meshes that are not deleted)
    const meshes = await dbFind({ type: 'mesh', deleted: { $exists: false } });
    console.log(`Found ${meshes.length} active device group(s)`);
    
    let updates = 0;
    
    for (const admin of admins) {
      const userEmail = admin.name;
      const userId = admin._id;
      // URL encode the email for the key (. becomes %2E)
      const userKey = 'user//' + userEmail.replace(/\./g, '%2E');
      
      for (const mesh of meshes) {
        const meshId = mesh._id;
        
        // Re-fetch admin to get current links (in case we just updated)
        const currentAdmin = await dbFindOne({ _id: userId });
        const currentMesh = await dbFindOne({ _id: meshId });
        
        // Check if admin already has access to this mesh (check both directions)
        const userHasMeshLink = currentAdmin?.links && currentAdmin.links[meshId];
        const meshHasUserLink = currentMesh?.links && currentMesh.links[userKey];
        
        if (!userHasMeshLink) {
          // Add mesh link to user record
          const userUpdate = {};
          userUpdate['links.' + meshId] = { rights: 4294967295 };
          await dbUpdate({ _id: userId }, { $set: userUpdate });
          updates++;
          console.log(`Added mesh ${mesh.name} to user ${userEmail}`);
        }
        
        if (!meshHasUserLink) {
          // Add user link to mesh record
          const meshUpdate = {};
          meshUpdate['links.' + userKey] = { name: userEmail, rights: 4294967295 };
          await dbUpdate({ _id: meshId }, { $set: meshUpdate });
          if (userHasMeshLink) updates++; // Only count if we didn't already count above
          console.log(`Added user ${userEmail} to mesh ${mesh.name}`);
        }
      }
    }
    
    res.json({
      success: true,
      message: `Synced ${admins.length} admin(s) with ${meshes.length} device group(s). ${updates} new access grants.`,
      admins: admins.length,
      deviceGroups: meshes.length,
      newGrants: updates
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/sync-status
 * Check current sync status - which admins have access to which groups
 */
router.get('/sync-status', async (req, res) => {
  try {
    const Datastore = require('@seald-io/nedb');
    const dbPath = process.env.MESHCENTRAL_DB_PATH || '/opt/meshcentral/meshcentral-data/meshcentral.db';
    
    const db = new Datastore({ filename: dbPath, autoload: true });
    
    const dbFind = (query) => new Promise((resolve, reject) => {
      db.find(query, (err, docs) => err ? reject(err) : resolve(docs));
    });
    
    const admins = await dbFind({ type: 'user', siteadmin: 4294967295 });
    const meshes = await dbFind({ type: 'mesh', deleted: { $exists: false } });
    
    const status = admins.map(admin => ({
      email: admin.name,
      accessCount: Object.keys(admin.links || {}).filter(k => k.startsWith('mesh//')).length,
      totalGroups: meshes.length,
      synced: Object.keys(admin.links || {}).filter(k => k.startsWith('mesh//')).length >= meshes.length
    }));
    
    res.json({
      success: true,
      admins: status,
      totalDeviceGroups: meshes.length,
      allSynced: status.every(s => s.synced)
    });
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
