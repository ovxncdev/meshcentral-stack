/**
 * Settings Dashboard Server
 * 
 * Express server for the unified settings dashboard.
 * Provides REST API for managing modules and settings.
 * 
 * Features:
 * - MeshCentral session authentication
 * - Role-based access (admin vs user)
 * - Dynamic settings based on user level
 * 
 * Endpoints:
 *   /api/auth/me          - Get current user info
 *   /api/modules          - List/manage modules
 *   /api/settings         - Global settings (admin only)
 *   /api/users            - User management (admin only)
 *   /api/files            - File hosting
 *   /api/webhook          - Incoming webhooks
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');

const ConfigManager = require('./config');
const ModuleLoader = require('./modules/loader');
const apiRoutes = require('./routes/api');

// ==============================================================================
// Configuration
// ==============================================================================

const PORT = process.env.PORT || 3001;
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data');
const NODE_ENV = process.env.NODE_ENV || 'development';
const MESHCENTRAL_URL = process.env.MESHCENTRAL_URL || 'http://meshcentral';

// ==============================================================================
// Initialize App
// ==============================================================================

const app = express();

// ==============================================================================
// Middleware
// ==============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for dashboard
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  validate: { xForwardedForHeader: false } // Fix for proxy warning
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
if (NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// ==============================================================================
// MeshCentral Authentication Middleware
// ==============================================================================

/**
 * Verify user session with MeshCentral
 * Extracts user info and role from MeshCentral session cookie
 */
async function verifyMeshCentralSession(req) {
  try {
    // Get cookies from request
    const cookies = req.headers.cookie || '';
    
    if (!cookies) {
      return null;
    }

    // Make request to MeshCentral to verify session
    // MeshCentral's /api/users endpoint returns current user if authenticated
    const meshResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'meshcentral',
        port: 80,
        path: '/api/users',
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'Accept': 'application/json'
        },
        timeout: 5000
      };

      const request = http.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve({ status: response.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: response.statusCode, data: null });
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

    if (meshResponse.status === 200 && meshResponse.data) {
      // MeshCentral returns user info
      // Check if user has admin rights (siteadmin)
      const userData = meshResponse.data;
      
      // If we got a valid response with user data
      if (userData && typeof userData === 'object') {
        // Try to get current user from the response
        // MeshCentral API varies, so we handle multiple formats
        let user = null;
        
        if (userData._id) {
          // Direct user object
          user = userData;
        } else if (userData.users && Array.isArray(userData.users)) {
          // List of users - find current one (usually first in personal context)
          user = userData.users[0];
        }

        if (user) {
          return {
            id: user._id || user.id,
            name: user.name || user._id,
            email: user.email || user.name,
            isAdmin: !!(user.siteadmin && (user.siteadmin === 0xFFFFFFFF || user.siteadmin > 0)),
            rights: user.siteadmin || 0
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('MeshCentral auth error:', error.message);
    return null;
  }
}

/**
 * Alternative: Check session via MeshCentral's websocket info endpoint
 */
async function verifyMeshCentralSessionAlt(req) {
  try {
    const cookies = req.headers.cookie || '';
    
    if (!cookies) {
      return null;
    }

    // Try the meshagent info endpoint which is more reliable
    const meshResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'meshcentral',
        port: 80,
        path: '/control.ashx',
        method: 'POST',
        headers: {
          'Cookie': cookies,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 5000
      };

      const request = http.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          resolve({ status: response.statusCode, data });
        });
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Timeout'));
      });
      
      request.write(JSON.stringify({ action: 'userinfo' }));
      request.end();
    });

    if (meshResponse.status === 200) {
      try {
        const data = JSON.parse(meshResponse.data);
        if (data.username) {
          return {
            id: data.userid || data.username,
            name: data.username,
            email: data.username,
            isAdmin: data.siteadmin === 0xFFFFFFFF || data.siteadmin > 0,
            rights: data.siteadmin || 0
          };
        }
      } catch (e) {
        // Not JSON, session invalid
      }
    }

    return null;
  } catch (error) {
    console.error('MeshCentral alt auth error:', error.message);
    return null;
  }
}

/**
 * Authentication middleware
 * Attaches user info to request if authenticated
 */
const authenticate = async (req, res, next) => {
  // Skip auth for public endpoints
  const publicPaths = ['/health', '/api/health', '/api/branding', '/webhook/'];
  if (publicPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  // Try to get user from MeshCentral session
  let user = await verifyMeshCentralSession(req);
  
  // Fallback to alternative method
  if (!user) {
    user = await verifyMeshCentralSessionAlt(req);
  }

  // For development/testing: Allow override with header
  if (!user && NODE_ENV === 'development') {
    const devUser = req.headers['x-dev-user'];
    const devAdmin = req.headers['x-dev-admin'];
    if (devUser) {
      user = {
        id: devUser,
        name: devUser,
        email: devUser,
        isAdmin: devAdmin === 'true',
        rights: devAdmin === 'true' ? 0xFFFFFFFF : 0
      };
    }
  }

  req.user = user;
  next();
};

/**
 * Require authentication middleware
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      loginUrl: '/'
    });
  }
  next();
};

/**
 * Require admin middleware
 */
const requireAdmin = (req, res, next) => {
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
};

// Apply authentication middleware
app.use(authenticate);

// Make auth helpers available to routes
app.locals.requireAuth = requireAuth;
app.locals.requireAdmin = requireAdmin;

// ==============================================================================
// Static Files
// ==============================================================================

// Serve frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// ==============================================================================
// Auth Routes
// ==============================================================================

/**
 * GET /api/auth/me
 * Get current user info and role
 */
app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      error: 'Not authenticated',
      loginUrl: '/'
    });
  }

  res.json({
    success: true,
    authenticated: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      isAdmin: req.user.isAdmin
    }
  });
});

// ==============================================================================
// File Downloads
// ==============================================================================

// Serve uploaded files for direct download
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

    // Check access: public files or owner or admin
    if (file.isPrivate && req.user) {
      if (file.ownerId !== req.user.id && !req.user.isAdmin) {
        return res.status(403).send('Access denied');
      }
    }
    
    const filepath = path.join(filesModule.getUploadsDir(), file.filename);
    
    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(filepath)) {
      return res.status(404).send('File not found on disk');
    }
    
    // Increment download count
    await filesModule.incrementDownloads(file.id);
    
    // Set headers for download
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

app.use('/api', apiRoutes);

// ==============================================================================
// SPA Fallback
// ==============================================================================

app.get('*', (req, res) => {
  // Don't fallback for API routes
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
    console.log('  Settings Dashboard Server');
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
    
    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log(`  Environment: ${NODE_ENV}`);
      console.log(`  Port:        ${PORT}`);
      console.log(`  Data Path:   ${DATA_PATH}`);
      console.log(`  Modules:     ${moduleLoader.getModuleList().map(m => m.name).join(', ')}`);
      console.log('');
      console.log('  Auth:        MeshCentral Session');
      console.log('  Status:      Running ✓');
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
