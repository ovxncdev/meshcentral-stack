/**
 * My Settings Server
 * 
 * Express server with MeshCentral session authentication.
 * Provides REST API for user and admin settings.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

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
const MESHCENTRAL_URL = process.env.MESHCENTRAL_URL || 'http://meshcentral:80';

// ==============================================================================
// Initialize App
// ==============================================================================

const app = express();

// Trust proxy (required when behind nginx)
app.set('trust proxy', 1);

// ==============================================================================
// MeshCentral Session Authentication
// ==============================================================================

/**
 * Parse cookies from request header
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  try {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key && value) {
          cookies[key] = value;
        }
      }
    });
  } catch (e) {
    console.error('Cookie parse error:', e.message);
  }
  
  return cookies;
}

/**
 * Verify MeshCentral session by decoding xid cookie
 * MeshCentral stores user info in base64 encoded xid cookie:
 * {"userid":"user//email@domain.com","ip":"x.x.x.x","x":"token","t":timestamp}
 */
function verifyMeshCentralSession(req) {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    const cookies = parseCookies(cookieHeader);
    const xid = cookies['xid'];
    
    if (!xid) {
      return null;
    }

    // Decode base64 xid cookie
    let decoded;
    try {
      decoded = Buffer.from(xid, 'base64').toString('utf8');
    } catch (e) {
      console.error('Failed to decode xid cookie:', e.message);
      return null;
    }

    // Parse JSON
    let data;
    try {
      data = JSON.parse(decoded);
    } catch (e) {
      console.error('Failed to parse xid JSON:', e.message);
      return null;
    }

    // Extract user info
    if (data && data.userid) {
      // userid format: "user//email@domain.com" or "user//domain/username"
      const parts = data.userid.split('//');
      const identifier = parts[1] || parts[0] || 'unknown';
      
      // Extract email/name
      let email = identifier;
      let name = identifier;
      
      if (identifier.includes('@')) {
        email = identifier;
        name = identifier.split('@')[0];
      } else if (identifier.includes('/')) {
        const subParts = identifier.split('/');
        name = subParts[subParts.length - 1];
        email = name;
      }

      return {
        id: data.userid,
        name: name,
        email: email,
        isAdmin: true, // MeshCentral handles admin check, we trust the session
        domain: '',
        ip: data.ip || ''
      };
    }

    return null;
  } catch (error) {
    console.error('Auth verification error:', error.message);
    return null;
  }
}

/**
 * Authentication middleware
 */
function authenticate(req, res, next) {
  try {
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

    // Verify MeshCentral session from xid cookie
    req.user = verifyMeshCentralSession(req);
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error.message);
    req.user = null;
    next();
  }
}

/**
 * Require authentication middleware
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Authentication required',
      loginUrl: '/'
    });
  }
  next();
}

/**
 * Require admin middleware
 */
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
// Middleware
// ==============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS - allow credentials
app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting (with trust proxy validation disabled)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Authentication - run on all requests
app.use(authenticate);

// Request logging (only in non-production)
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
    
    let file;
    try {
      file = filesModule.getFileByName(filename);
    } catch (e) {
      return res.status(404).send('File not found');
    }
    
    if (!file) {
      return res.status(404).send('File not found');
    }
    
    // Access control
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
    
    // Increment download count (non-blocking)
    filesModule.incrementDownloads(file.id).catch(() => {});
    
    // Set headers
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName || file.filename}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    
    // Stream the file
    const fileStream = fs.createReadStream(filepath);
    fileStream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) {
        res.status(500).send('Download failed');
      }
    });
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).send('Download failed');
    }
  }
});

// ==============================================================================
// API Routes
// ==============================================================================

// Core API routes
app.use('/api', apiRoutes);

// File routes (requires auth)
app.use('/api/files', requireAuth, filesRoutes);

// Admin routes (requires admin)
app.use('/api/admin', requireAdmin, adminRoutes);

// ==============================================================================
// Branding endpoint (public)
// ==============================================================================

app.get('/api/branding', (req, res) => {
  try {
    const moduleLoader = app.locals.moduleLoader;
    if (moduleLoader && moduleLoader.has('branding')) {
      const brandingModule = moduleLoader.get('branding');
      if (typeof brandingModule.getBrandingData === 'function') {
        res.json({ branding: brandingModule.getBrandingData() });
      } else {
        res.json({ branding: {} });
      }
    } else {
      res.json({ branding: {} });
    }
  } catch (error) {
    console.error('Branding error:', error.message);
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
    success: false,
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

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the server
start();

module.exports = { app, requireAuth, requireAdmin };
