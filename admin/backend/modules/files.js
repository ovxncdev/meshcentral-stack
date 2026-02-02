/**
 * Files Module
 * 
 * Handles file hosting with per-user ownership.
 * Users can only see/manage their own files.
 * Admins can see/manage all files.
 * 
 * Features:
 * - Per-user file ownership
 * - Public/private file visibility
 * - Download tracking
 * - File expiration (optional)
 */

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');

class FilesModule {
  constructor(configManager) {
    this.configManager = configManager;
    this.name = 'files';
    this.description = 'File Hosting';
    this.icon = 'file';
    this.uploadsDir = process.env.UPLOADS_DIR || path.join(process.env.DATA_PATH || '/app/data', 'uploads');
    
    // Ensure uploads directory exists
    this.ensureUploadsDir();
  }

  /**
   * Ensure uploads directory exists
   */
  async ensureUploadsDir() {
    try {
      await fs.mkdir(this.uploadsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create uploads directory:', error);
    }
  }

  /**
   * Get uploads directory path
   */
  getUploadsDir() {
    return this.uploadsDir;
  }

  /**
   * Get module schema for UI rendering
   */
  getSchema() {
    return {
      title: 'File Hosting',
      description: 'Host and share files with download links',
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          title: 'Enable File Hosting',
          default: true
        },
        maxFileSize: {
          type: 'number',
          title: 'Max File Size (MB)',
          default: 100,
          minimum: 1,
          maximum: 1000
        },
        allowedTypes: {
          type: 'string',
          title: 'Allowed File Types',
          description: 'Comma-separated extensions (leave empty for all)',
          placeholder: 'exe,msi,zip,pdf'
        },
        defaultExpiration: {
          type: 'number',
          title: 'Default Expiration (days)',
          description: '0 = never expires',
          default: 0,
          minimum: 0
        }
      }
    };
  }

  /**
   * Get global settings
   */
  async getSettings() {
    const settings = await this.configManager.get('files') || {};
    return {
      enabled: settings.enabled !== false,
      maxFileSize: settings.maxFileSize || 100,
      allowedTypes: settings.allowedTypes || '',
      defaultExpiration: settings.defaultExpiration || 0
    };
  }

  /**
   * Save global settings (admin only)
   */
  async saveSettings(data) {
    const current = await this.configManager.get('files') || {};
    const updated = {
      ...current,
      enabled: data.enabled !== false,
      maxFileSize: parseInt(data.maxFileSize) || 100,
      allowedTypes: (data.allowedTypes || '').trim(),
      defaultExpiration: parseInt(data.defaultExpiration) || 0,
      updatedAt: new Date().toISOString()
    };
    await this.configManager.set('files', updated);
    return { success: true };
  }

  /**
   * Get all files (admin only)
   */
  async getAllFiles() {
    const data = await this.configManager.get('files') || {};
    const files = data.items || [];
    return files.map(f => ({
      ...f,
      downloadUrl: this.getDownloadUrl(f)
    }));
  }

  /**
   * Get files for a specific user
   */
  async getUserFiles(userId) {
    const data = await this.configManager.get('files') || {};
    const files = data.items || [];
    
    // Return files owned by user OR public files
    const userFiles = files.filter(f => 
      f.ownerId === userId || f.isPublic === true
    );
    
    return userFiles.map(f => ({
      ...f,
      downloadUrl: this.getDownloadUrl(f),
      isOwner: f.ownerId === userId
    }));
  }

  /**
   * Get file by ID
   */
  async getFileById(fileId) {
    const data = await this.configManager.get('files') || {};
    const files = data.items || [];
    return files.find(f => f.id === fileId);
  }

  /**
   * Get file by filename
   */
  getFileByName(filename) {
    const data = this.configManager.getSync('files') || {};
    const files = data.items || [];
    return files.find(f => f.filename === filename);
  }

  /**
   * Get download URL for a file
   */
  getDownloadUrl(file, baseUrl = '') {
    if (!file) return null;
    return `${baseUrl}/downloads/${encodeURIComponent(file.filename)}`;
  }

  /**
   * Handle file upload
   */
  async handleUpload(fileData, customName, user) {
    const settings = await this.getSettings();
    
    if (!settings.enabled) {
      throw new Error('File hosting is disabled');
    }

    // Check file size
    const maxBytes = settings.maxFileSize * 1024 * 1024;
    if (fileData.size > maxBytes) {
      throw new Error(`File too large. Maximum size is ${settings.maxFileSize}MB`);
    }

    // Check file type
    if (settings.allowedTypes) {
      const allowedExts = settings.allowedTypes.split(',').map(e => e.trim().toLowerCase());
      const fileExt = path.extname(fileData.originalname).toLowerCase().replace('.', '');
      if (!allowedExts.includes(fileExt)) {
        throw new Error(`File type not allowed. Allowed types: ${settings.allowedTypes}`);
      }
    }

    // Generate unique filename
    const fileId = crypto.randomUUID();
    const ext = path.extname(fileData.originalname);
    const safeName = customName 
      ? customName.replace(/[^a-zA-Z0-9.-]/g, '_') + ext
      : fileData.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const finalFilename = `${fileId}_${safeName}`;

    // Ensure uploads directory exists
    await this.ensureUploadsDir();

    // Move file to uploads directory (use copy+delete for cross-device support)
    const destPath = path.join(this.uploadsDir, finalFilename);
    await fs.copyFile(fileData.path, destPath);
    await fs.unlink(fileData.path).catch(() => {}); // Clean up temp file

    // Calculate expiration
    let expiresAt = null;
    if (settings.defaultExpiration > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + settings.defaultExpiration);
      expiresAt = expiresAt.toISOString();
    }

    // Create file record
    const fileRecord = {
      id: fileId,
      filename: finalFilename,
      originalName: customName || fileData.originalname,
      mimeType: fileData.mimetype,
      size: fileData.size,
      ownerId: user?.id || 'anonymous',
      ownerName: user?.name || 'Anonymous',
      isPublic: false,
      downloads: 0,
      uploadedAt: new Date().toISOString(),
      expiresAt
    };

    // Save to config
    const data = await this.configManager.get('files') || {};
    if (!data.items) data.items = [];
    data.items.push(fileRecord);
    await this.configManager.set('files', data);

    return fileRecord;
  }

  /**
   * Update file properties
   */
  async updateFile(fileId, updates, user) {
    const data = await this.configManager.get('files') || {};
    const files = data.items || [];
    const index = files.findIndex(f => f.id === fileId);

    if (index === -1) {
      throw new Error('File not found');
    }

    const file = files[index];

    // Check ownership (unless admin)
    if (!user?.isAdmin && file.ownerId !== user?.id) {
      throw new Error('Access denied');
    }

    // Update allowed fields
    const allowedUpdates = ['originalName', 'isPublic', 'expiresAt'];
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        files[index][key] = updates[key];
      }
    }
    files[index].updatedAt = new Date().toISOString();

    data.items = files;
    await this.configManager.set('files', data);

    return files[index];
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId, user) {
    const data = await this.configManager.get('files') || {};
    const files = data.items || [];
    const index = files.findIndex(f => f.id === fileId);

    if (index === -1) {
      return { success: false, error: 'File not found' };
    }

    const file = files[index];

    // Check ownership (unless admin)
    if (user && !user.isAdmin && file.ownerId !== user.id) {
      return { success: false, error: 'Access denied' };
    }

    // Delete physical file
    try {
      const filePath = path.join(this.uploadsDir, file.filename);
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Failed to delete physical file:', error.message);
    }

    // Remove from config
    data.items = files.filter(f => f.id !== fileId);
    await this.configManager.set('files', data);

    return { success: true };
  }

  /**
   * Increment download counter
   */
  async incrementDownloads(fileId) {
    const data = await this.configManager.get('files') || {};
    const files = data.items || [];
    const index = files.findIndex(f => f.id === fileId);

    if (index !== -1) {
      files[index].downloads = (files[index].downloads || 0) + 1;
      files[index].lastDownloadAt = new Date().toISOString();
      data.items = files;
      await this.configManager.set('files', data);
    }
  }

  /**
   * Clean up expired files
   */
  async cleanupExpired() {
    const data = await this.configManager.get('files') || {};
    const files = data.items || [];
    const now = new Date();
    let cleaned = 0;

    const remaining = [];
    for (const file of files) {
      if (file.expiresAt && new Date(file.expiresAt) < now) {
        // Delete physical file
        try {
          const filePath = path.join(this.uploadsDir, file.filename);
          await fs.unlink(filePath);
          cleaned++;
        } catch (error) {
          console.error('Failed to delete expired file:', error.message);
        }
      } else {
        remaining.push(file);
      }
    }

    if (cleaned > 0) {
      data.items = remaining;
      await this.configManager.set('files', data);
    }

    return { cleaned };
  }

  /**
   * Execute module actions
   */
  async executeAction(action, data, user) {
    switch (action) {
      case 'upload':
        return this.handleUpload(data.file, data.customName, user);
      
      case 'cleanup':
        if (!user?.isAdmin) {
          throw new Error('Admin access required');
        }
        return this.cleanupExpired();
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Get storage stats (admin only)
   */
  async getStats() {
    const data = await this.configManager.get('files') || {};
    const files = data.items || [];
    
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalDownloads = files.reduce((sum, f) => sum + (f.downloads || 0), 0);
    
    // Group by owner
    const byOwner = {};
    for (const file of files) {
      const ownerId = file.ownerId || 'anonymous';
      if (!byOwner[ownerId]) {
        byOwner[ownerId] = { count: 0, size: 0 };
      }
      byOwner[ownerId].count++;
      byOwner[ownerId].size += file.size || 0;
    }

    return {
      totalFiles: files.length,
      totalSize,
      totalDownloads,
      byOwner
    };
  }
}

module.exports = FilesModule;
