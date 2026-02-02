/**
 * Admin Dashboard Server
 * 
 * Express server for the admin dashboard.
 * Provides REST API for managing modules and settings.
 * 
 * Endpoints:
 *   /api/modules         - List/manage modules
 *   /api/settings        - Global settings
 *   /api/webhook         - Incoming webhooks
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const ConfigManager = require('./config');
const ModuleLoader = require('./modules/loader');
const apiRoutes = require('./routes/api');

// ==============================================================================
// Configuration
// ==============================================================================

const PORT = process.env.PORT || 3001;
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data');
const NODE_ENV = process.env.NODE_ENV || 'development';

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
  message: { error: 'Too many requests, please try again later.' }
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
// Static Files
// ==============================================================================

// Serve frontend
app.use(express.static(path.join(__dirname, 'frontend')));

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
    console.log('  Admin Dashboard Server');
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
