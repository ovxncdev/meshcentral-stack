/**
 * My Settings Server
 * 
 * Express server with MeshCentral session authentication.
 * Provides REST API for user and admin settings.
 * 
 * Endpoints:
 *   /api/auth/me        - Get current user
 *   /api/modules        - List/manage modules
 *   /api/telegram/*     - User telegram settings
 *   /api/files/*        - User file management
 *   /api/admin/*        - Admin-only endpoints
 *   /api/webhook        - Incoming webhooks
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const https = require('https');

const ConfigManager = require('./config');
const ModuleLoader = require('./modules/loader');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const filesRoutes = require('./routes/files');

// ==============================================================================
// Configuration
// ==============================================================================

const PORT = process.env.PORT || 3001;
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data');
const NODE_ENV = process.env.NODE_ENV || 'development';
const MESHCENTRAL_URL = process.env.MESHCENTRAL_URL || 'http://meshcentral:443';

// ==============================================================================
// Initialize App
// ==============================================================================

const app = express();

// ==============================================================================
// MeshCentral Session Authentication
// ==============================================================================

/**
 * Verify MeshCentral session by calling MeshCentral's user API
 * @param {object} req - Express request with cookies
 * @returns {object|null} User info or null if not authenticated
 */
async function verifyMeshCentralSession(req) {
  try {
    // Get cookies from request
    const cookies = req.headers.cookie;
    if (!cookies) return null;

    // Parse MeshCentral URL
    const meshUrl = new URL(MESHCENTRAL_URL);
    const isHttps = meshUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise((resolve) => {
      const options = {
        hostname: meshUrl.hostname,
        port: meshUrl.port || (isHttps ? 443 : 80),
        path: '/api/users',
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'Accept': 'application/json'
        },
        rejectUnauthorized: false, // Allow self-signed certs in Docker
        timeout: 5000
      };

      const apiReq = client.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          try {
            if (apiRes.statusCode === 200) {
              const users = JSON.parse(data);
              // MeshCentral returns array with current user's info
              if (users && users.length > 0) {
                const user = users[0];
                resolve({
                  id: user._id,
                  name: user.name,
                  email: user.email,
                  isAdmin: user.siteadmin === true || user.siteadmin === 0xFFFFFFFF,
                  domain: user.domain || ''
                });
                return;
              }
            }
            resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      });

      apiReq.on('error', () => resolve(null));
      apiReq.on('timeout', () => {
        apiReq.destroy();
        resolve(null);
      });
      apiReq.end();
    });
  } catch (error) {
    console.error('MeshCentral auth error:', error.message);
    return null;
  }
}

/**
 * Alternative auth method using control.ashx
 */
async function verifyMeshCentralSessionAlt(req) {
  try {
    const cookies = req.headers.cookie;
    if (!cookies) return null;

    const meshUrl = new URL(MESHCENTRAL_URL);
    const isHttps = meshUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise((resolve) => {
      const postData = JSON.stringify({ action: 'userinfo' });
      
      const options = {
        hostname: meshUrl.hostname,
        port: meshUrl.port || (isHttps ? 443 : 80),
        path: '/control.ashx',
        method: 'POST',
        headers: {
          'Cookie': cookies,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        rejectUnauthorized: false,
        timeout: 5000
      };

      const apiReq = client.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.action === 'userinfo' && result._id) {
              resolve({
                id: result._id,
                name: result.name,
                email: result.email,
                isAdmin: result.siteadmin === true || result.siteadmin === 0xFFFFFFFF,
                domain: result.domain || ''
              });
              return;
            }
            resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      });

      apiReq.on('error', () => resolve(null));
      apiReq.on('timeout', () => {
        apiReq.destroy();
        resolve(null);
      });
      apiReq.write(postData);
      apiReq.end();
    });
  } catch (error) {
    return null;
  }
}

/**
 * Authentication middleware
 * Attaches user to req.user if authenticated
 */
async function authenticate(req, res, next) {
  // Development mode: allow header-based auth for testing
  if (NODE_ENV === 'development') {
    const devUser = req.headers['x-dev-user'];
    const devAdmin = req.headers['x-dev-admin'];
    if (devUser) {
      req.user = {
        id: `user//dev/${devUser}`,
        name: devUser,
        email: `${devUser}@dev.local`,
        isAdmin: devAdmin === 'true',
        domain: ''
      };
      return next();
    }
  }

  // Try primary auth method
  let user = await verifyMeshCentralSession(req);
  
  // Try alternative method if primary fails
  if (!user) {
    user = await verifyMeshCentralSessionAlt(req);
  }

  req.user = user;
  next();
}

/**
 * Require authentication middleware
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * Require admin middleware
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ==============================================================================
// Middleware
// ==============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS - allow MeshCentral origin
app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Authentication - run on all requests
app.use(authenticate);

// Request logging
if (NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const user = req.user ? `[${req.user.name}${req.user.isAdmin ? '*' : ''}]` : '[anon]';
    console.log(`${new Date().toISOString()} ${user} ${req.method} ${req.path}`);
    next();
  });
}

// ==============================================================================
// Static Files
// ==============================================================================

app.use(express.static(path.join(__dirname, 'frontend')));

// ==============================================================================
// Auth Endpoint
// ==============================================================================

app.get('/api/auth/me', (req, res) => {
  if (req.user) {
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        isAdmin: req.user.isAdmin
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// ==============================================================================
// File Downloads (Public with access control)
// ==============================================================================

app.get('/downloads/:filename', async (req, res) => {
  try {
    const moduleLoader = app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('files')) {
      return res.status(503).send('File hosting not available');
    }
    
    const filesModule = moduleLoader.get('files');
    const filename = decodeURIComponent(req.params.filename);
    const file = filesModule.getFileByName(filename);
    
    if (!file) {
      return res.status(404).send('File not found');
    }
    
    // Access control: public files are accessible to all,
    // private files require owner or admin
    if (!file.isPublic) {
      if (!req.user) {
        return res.status(401).send('Authentication required');
      }
      if (file.ownerId !== req.user.id && !req.user.isAdmin) {
        return res.status(403).send('Access denied');
      }
    }
    
    const filepath = path.join(filesModule.getUploadsDir(), file.filename);
    
    const fs = require('fs');
    if (!fs.existsSync(filepath)) {
      return res.status(404).send('File not found on disk');
    }
    
    // Increment download count
    await filesModule.incrementDownloads(file.id);
    
    // Set headers
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName || file.filename}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    
    // Stream the file
    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('Download failed');
  }
});

// ==============================================================================
// API Routes
// ==============================================================================

// Core API routes (modules, settings, webhooks)
app.use('/api', apiRoutes);

// File routes (user's own files)
app.use('/api/files', requireAuth, filesRoutes);

// Admin routes (admin only)
app.use('/api/admin', requireAdmin, adminRoutes);

// ==============================================================================
// Branding endpoint (public)
// ==============================================================================

app.get('/api/branding', (req, res) => {
  try {
    const moduleLoader = app.locals.moduleLoader;
    if (moduleLoader && moduleLoader.has('branding')) {
      const brandingModule = moduleLoader.get('branding');
      res.json({ branding: brandingModule.getBrandingData() });
    } else {
      res.json({ branding: {} });
    }
  } catch (error) {
    res.json({ branding: {} });
  }
});

// ==============================================================================
// SPA Fallback
// ==============================================================================

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ==============================================================================
// Error Handler
// ==============================================================================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ==============================================================================
// Initialize and Start
// ==============================================================================

async function start() {
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  My Settings Server');
    console.log('═══════════════════════════════════════════════════════════════');
    
    // Initialize ConfigManager
    console.log('  Initializing configuration manager...');
    const configManager = new ConfigManager(DATA_PATH);
    await configManager.init();
    
    // Initialize ModuleLoader
    console.log('  Loading modules...');
    const moduleLoader = new ModuleLoader(configManager);
    await moduleLoader.loadAll();
    
    // Make available to routes
    app.locals.configManager = configManager;
    app.locals.moduleLoader = moduleLoader;
    
    // Export auth helpers for routes
    app.locals.requireAuth = requireAuth;
    app.locals.requireAdmin = requireAdmin;
    
    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log(`  Environment:    ${NODE_ENV}`);
      console.log(`  Port:           ${PORT}`);
      console.log(`  Data Path:      ${DATA_PATH}`);
      console.log(`  MeshCentral:    ${MESHCENTRAL_URL}`);
      console.log(`  Modules:        ${moduleLoader.getModuleList().map(m => m.name).join(', ')}`);
      console.log('');
      console.log('  Status: Running ✓');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ==============================================================================
// Graceful Shutdown
// ==============================================================================

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start the server
start();

// Export for testing
module.exports = { app, requireAuth, requireAdmin };
