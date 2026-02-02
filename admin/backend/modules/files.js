/**
 * File Hosting Module
 * 
 * Host files and generate direct download links:
 *   - Upload files via admin dashboard
 *   - Generate direct download URLs
 *   - Manage hosted files
 *   - Track download statistics
 * 
 * Files are served at:
 *   /downloads/{filename}
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const BaseModule = require('./base');

// ==============================================================================
// FilesModule Class
// ==============================================================================

class FilesModule extends BaseModule {
  name = 'files';
  displayName = 'File Hosting';
  description = 'Host files and generate direct download links';
  icon = 'folder';
  
  /**
   * Get default settings
   */
  getDefaultSettings() {
    return {
      enabled: true,
      
      // Storage settings
      maxFileSize: 100, // MB
      allowedExtensions: '.exe,.msi,.zip,.dmg,.pkg,.sh,.bat,.ps1,.pdf,.doc,.docx',
      
      // Files list (stored as JSON)
      files: []
    };
  }
  
  /**
   * Get settings schema for UI
   */
  getSchema() {
    return [
      {
        key: 'enabled',
        type: 'boolean',
        label: 'Enable File Hosting',
        description: 'Allow hosting files for direct download'
      },
      
      // Settings Section
      {
        key: 'section_settings',
        type: 'section',
        label: 'Upload Settings'
      },
      {
        key: 'maxFileSize',
        type: 'number',
        label: 'Max File Size (MB)',
        description: 'Maximum file size allowed for upload',
        placeholder: '100',
        dependsOn: 'enabled',
        validation: {
          min: 1,
          max: 1000
        }
      },
      {
        key: 'allowedExtensions',
        type: 'text',
        label: 'Allowed Extensions',
        description: 'Comma-separated list of allowed file extensions',
        placeholder: '.exe,.msi,.zip,.dmg,.pkg',
        dependsOn: 'enabled'
      },
      
      // Files Section
      {
        key: 'section_files',
        type: 'section',
        label: 'Hosted Files'
      },
      {
        key: 'files',
        type: 'filelist',
        label: 'Uploaded Files',
        description: 'Files available for download',
        dependsOn: 'enabled'
      }
    ];
  }
  
  /**
   * Get available actions
   */
  getActions() {
    return [
      {
        name: 'upload',
        label: 'Upload File',
        icon: 'upload',
        description: 'Upload a new file',
        type: 'upload'
      },
      {
        name: 'refresh',
        label: 'Refresh File List',
        icon: 'refresh',
        description: 'Scan directory and refresh file list'
      },
      {
        name: 'cleanup',
        label: 'Clean Up Orphans',
        icon: 'trash',
        description: 'Remove database entries for deleted files',
        confirm: 'Remove entries for files that no longer exist on disk?'
      }
    ];
  }
  
  /**
   * Initialize module
   */
  async initialize() {
    await super.initialize();
    
    // Ensure uploads directory exists
    const uploadsDir = this.getUploadsDir();
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    
    // Sync file list with actual files
    await this.syncFileList();
  }
  
  /**
   * Get uploads directory path
   */
  getUploadsDir() {
    const dataPath = process.env.DATA_PATH || path.join(__dirname, '..', 'data');
    return path.join(dataPath, 'uploads');
  }
  
  /**
   * Sync file list with actual files on disk
   */
  async syncFileList() {
    const uploadsDir = this.getUploadsDir();
    const settings = this.getSettings();
    let files = settings.files || [];
    
    try {
      const actualFiles = await fs.readdir(uploadsDir);
      
      // Add any files found on disk but not in database
      for (const filename of actualFiles) {
        if (filename.startsWith('.')) continue; // Skip hidden files
        
        const exists = files.some(f => f.filename === filename);
        if (!exists) {
          const filepath = path.join(uploadsDir, filename);
          const stats = await fs.stat(filepath);
          
          files.push({
            id: crypto.randomUUID(),
            filename: filename,
            originalName: filename,
            size: stats.size,
            uploadedAt: stats.mtime.toISOString(),
            downloads: 0
          });
        }
      }
      
      // Mark files that no longer exist
      for (const file of files) {
        const filepath = path.join(uploadsDir, file.filename);
        try {
          await fs.access(filepath);
          file.exists = true;
        } catch {
          file.exists = false;
        }
      }
      
      // Save updated list
      await this.saveSettings({ ...settings, files });
      
    } catch (err) {
      console.error('Error syncing file list:', err);
    }
  }
  
  // ==============================================================================
  // Actions
  // ==============================================================================
  
  /**
   * Upload action - handled specially by API route
   * This just returns upload configuration
   */
  async action_upload(params) {
    const settings = this.getSettings();
    
    return {
      success: true,
      config: {
        maxFileSize: settings.maxFileSize * 1024 * 1024, // Convert to bytes
        allowedExtensions: settings.allowedExtensions.split(',').map(e => e.trim())
      }
    };
  }
  
  /**
   * Refresh action - rescan directory
   */
  async action_refresh(params) {
    await this.syncFileList();
    
    return {
      success: true,
      message: 'File list refreshed',
      settings: this.getSettings()
    };
  }
  
  /**
   * Cleanup action - remove orphan entries
   */
  async action_cleanup(params) {
    const settings = this.getSettings();
    const files = settings.files || [];
    
    const validFiles = files.filter(f => f.exists !== false);
    const removed = files.length - validFiles.length;
    
    await this.saveSettings({ ...settings, files: validFiles });
    
    return {
      success: true,
      message: `Removed ${removed} orphan entries`,
      settings: this.getSettings()
    };
  }
  
  // ==============================================================================
  // File Operations
  // ==============================================================================
  
  /**
   * Handle file upload
   * @param {object} fileData - File data from multer
   * @param {string} customName - Optional custom filename
   * @returns {object} File info
   */
  async handleUpload(fileData, customName) {
    const settings = this.getSettings();
    
    if (!settings.enabled) {
      throw new Error('File hosting is disabled');
    }
    
    // Validate file size
    const maxSize = settings.maxFileSize * 1024 * 1024;
    if (fileData.size > maxSize) {
      throw new Error(`File too large. Maximum size is ${settings.maxFileSize}MB`);
    }
    
    // Validate extension
    const ext = path.extname(fileData.originalname).toLowerCase();
    const allowedExts = settings.allowedExtensions.split(',').map(e => e.trim().toLowerCase());
    if (allowedExts.length > 0 && allowedExts[0] !== '' && !allowedExts.includes(ext)) {
      throw new Error(`File type not allowed. Allowed: ${settings.allowedExtensions}`);
    }
    
    // Generate safe filename
    const safeOriginal = fileData.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = customName ? 
      customName.replace(/[^a-zA-Z0-9._-]/g, '_') : 
      safeOriginal;
    
    // Ensure unique filename
    const uploadsDir = this.getUploadsDir();
    let finalFilename = filename;
    let counter = 1;
    
    while (fsSync.existsSync(path.join(uploadsDir, finalFilename))) {
      const namePart = path.basename(filename, ext);
      finalFilename = `${namePart}_${counter}${ext}`;
      counter++;
    }
    
    // Move file to uploads directory
    const destPath = path.join(uploadsDir, finalFilename);
    await fs.rename(fileData.path, destPath);
    
    // Create file record
    const fileRecord = {
      id: crypto.randomUUID(),
      filename: finalFilename,
      originalName: fileData.originalname,
      size: fileData.size,
      mimeType: fileData.mimetype,
      uploadedAt: new Date().toISOString(),
      downloads: 0,
      exists: true
    };
    
    // Add to files list
    const files = settings.files || [];
    files.push(fileRecord);
    await this.saveSettings({ ...settings, files });
    
    return fileRecord;
  }
  
  /**
   * Delete a file
   * @param {string} fileId - File ID
   */
  async deleteFile(fileId) {
    const settings = this.getSettings();
    const files = settings.files || [];
    
    const fileIndex = files.findIndex(f => f.id === fileId);
    if (fileIndex === -1) {
      throw new Error('File not found');
    }
    
    const file = files[fileIndex];
    
    // Delete from disk
    const filepath = path.join(this.getUploadsDir(), file.filename);
    try {
      await fs.unlink(filepath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    
    // Remove from list
    files.splice(fileIndex, 1);
    await this.saveSettings({ ...settings, files });
    
    return { success: true, message: 'File deleted' };
  }
  
  /**
   * Get file by ID
   * @param {string} fileId - File ID
   */
  getFile(fileId) {
    const settings = this.getSettings();
    const files = settings.files || [];
    return files.find(f => f.id === fileId);
  }
  
  /**
   * Get file by filename
   * @param {string} filename - Filename
   */
  getFileByName(filename) {
    const settings = this.getSettings();
    const files = settings.files || [];
    return files.find(f => f.filename === filename);
  }
  
  /**
   * Increment download count
   * @param {string} fileId - File ID
   */
  async incrementDownloads(fileId) {
    const settings = this.getSettings();
    const files = settings.files || [];
    
    const file = files.find(f => f.id === fileId);
    if (file) {
      file.downloads = (file.downloads || 0) + 1;
      file.lastDownload = new Date().toISOString();
      await this.saveSettings({ ...settings, files });
    }
  }
  
  /**
   * Get all files
   */
  getFiles() {
    const settings = this.getSettings();
    return settings.files || [];
  }
  
  /**
   * Get download URL for a file
   * @param {object} file - File record
   * @param {string} baseUrl - Base URL of the server
   */
  getDownloadUrl(file, baseUrl = '') {
    return `${baseUrl}/downloads/${encodeURIComponent(file.filename)}`;
  }
}

module.exports = FilesModule;
