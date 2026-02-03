/**
 * File Routes
 * 
 * Handles file upload and download operations.
 * Users can manage their own files, admins can manage all.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// ==============================================================================
// Get User's Files
// ==============================================================================

/**
 * GET /api/files/my
 */
router.get('/my', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('files')) {
      return res.json({ success: true, files: [] });
    }

    const filesModule = moduleLoader.get('files');
    
    if (typeof filesModule.getUserFiles !== 'function') {
      return res.json({ success: true, files: [] });
    }
    
    const files = await filesModule.getUserFiles(req.user.id);
    res.json({ success: true, files: files || [] });
  } catch (error) {
    console.error('Error getting user files:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================================================================
// File Upload
// ==============================================================================

/**
 * POST /api/files/upload
 */
router.post('/upload', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('files')) {
      return res.status(503).json({
        success: false,
        error: 'File hosting module not available'
      });
    }
    
    const filesModule = moduleLoader.get('files');
    
    let settings = {};
    try {
      settings = await filesModule.getSettings();
    } catch (e) {
      // Continue with defaults
    }
    
    if (settings.enabled === false) {
      return res.status(403).json({
        success: false,
        error: 'File hosting is disabled'
      });
    }
    
    // Parse multipart form data
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type must be multipart/form-data'
      });
    }
    
    // Get boundary
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
      return res.status(400).json({
        success: false,
        error: 'No boundary found in Content-Type'
      });
    }
    
    const boundary = boundaryMatch[1];
    const chunks = [];
    
    req.on('data', chunk => chunks.push(chunk));
    req.on('error', (err) => {
      console.error('Upload stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Upload failed' });
      }
    });
    
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const data = buffer.toString('binary');
        
        // Parse multipart data
        const parts = data.split(`--${boundary}`);
        let fileData = null;
        let customName = '';
        let isPublic = false;
        
        for (const part of parts) {
          if (part.includes('Content-Disposition')) {
            const nameMatch = part.match(/name="([^"]+)"/);
            const filenameMatch = part.match(/filename="([^"]+)"/);
            
            if (nameMatch) {
              const fieldName = nameMatch[1];
              
              if (fieldName === 'customName') {
                const valueStart = part.indexOf('\r\n\r\n') + 4;
                const valueEnd = part.lastIndexOf('\r\n');
                customName = part.substring(valueStart, valueEnd).trim();
              }
              
              if (fieldName === 'isPublic') {
                const valueStart = part.indexOf('\r\n\r\n') + 4;
                const valueEnd = part.lastIndexOf('\r\n');
                const value = part.substring(valueStart, valueEnd).trim();
                isPublic = value === 'true' || value === '1';
              }
            }
            
            if (filenameMatch) {
              const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/);
              const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
              
              const contentStart = part.indexOf('\r\n\r\n') + 4;
              const contentEnd = part.lastIndexOf('\r\n');
              const content = Buffer.from(part.substring(contentStart, contentEnd), 'binary');
              
              fileData = {
                originalname: filenameMatch[1],
                mimetype: mimeType,
                size: content.length,
                buffer: content
              };
            }
          }
        }
        
        if (!fileData) {
          return res.status(400).json({
            success: false,
            error: 'No file found in request'
          });
        }
        
        // Save to temp location
        const tempPath = path.join(os.tmpdir(), `upload_${crypto.randomUUID()}`);
        fs.writeFileSync(tempPath, fileData.buffer);
        fileData.path = tempPath;
        
        // Handle upload through module
        if (typeof filesModule.handleUpload !== 'function') {
          fs.unlinkSync(tempPath);
          return res.status(500).json({ success: false, error: 'Upload not supported' });
        }
        
        const file = await filesModule.handleUpload(fileData, customName, req.user);
        
        // Set public flag if requested
        if (isPublic && typeof filesModule.updateFile === 'function') {
          await filesModule.updateFile(file.id, { isPublic: true }, req.user);
          file.isPublic = true;
        }
        
        // Add download URL
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        if (typeof filesModule.getDownloadUrl === 'function') {
          file.downloadUrl = filesModule.getDownloadUrl(file, baseUrl);
        }
        
        res.json({
          success: true,
          message: 'File uploaded successfully',
          file
        });
        
      } catch (error) {
        console.error('Upload processing error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// Update File
// ==============================================================================

/**
 * PUT /api/files/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('files')) {
      return res.status(503).json({
        success: false,
        error: 'File hosting module not available'
      });
    }
    
    const filesModule = moduleLoader.get('files');
    
    if (typeof filesModule.updateFile !== 'function') {
      return res.status(400).json({ success: false, error: 'Update not supported' });
    }
    
    const file = await filesModule.updateFile(req.params.id, req.body, req.user);
    
    res.json({
      success: true,
      file
    });
  } catch (error) {
    console.error('Update file error:', error);
    const status = error.message === 'Access denied' ? 403 : 
                   error.message === 'File not found' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// Delete File
// ==============================================================================

/**
 * DELETE /api/files/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('files')) {
      return res.status(503).json({
        success: false,
        error: 'File hosting module not available'
      });
    }
    
    const filesModule = moduleLoader.get('files');
    
    if (typeof filesModule.deleteFile !== 'function') {
      return res.status(400).json({ success: false, error: 'Delete not supported' });
    }
    
    const result = await filesModule.deleteFile(req.params.id, req.user);
    
    if (result && !result.success) {
      const status = result.error === 'Access denied' ? 403 : 404;
      return res.status(status).json(result);
    }
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// Get Single File Info
// ==============================================================================

/**
 * GET /api/files/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const moduleLoader = req.app.locals.moduleLoader;
    
    if (!moduleLoader || !moduleLoader.has('files')) {
      return res.status(503).json({
        success: false,
        error: 'File hosting module not available'
      });
    }
    
    const filesModule = moduleLoader.get('files');
    
    if (typeof filesModule.getFileById !== 'function') {
      return res.status(400).json({ success: false, error: 'Not supported' });
    }
    
    const file = await filesModule.getFileById(req.params.id);
    
    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }
    
    // Check access
    if (file.ownerId !== req.user.id && !req.user.isAdmin && !file.isPublic) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Add download URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    if (typeof filesModule.getDownloadUrl === 'function') {
      file.downloadUrl = filesModule.getDownloadUrl(file, baseUrl);
    }
    
    res.json({
      success: true,
      file
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
