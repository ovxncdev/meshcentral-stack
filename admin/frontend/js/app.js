/**
 * My Settings Application
 * 
 * Main application logic with authentication and role-based access:
 * - Checks MeshCentral session on load
 * - Shows login screen if not authenticated
 * - Shows admin sections only for admins
 * - Handles both user and admin module views
 */

const App = (function() {
  // ==============================================================================
  // State
  // ==============================================================================
  
  let user = null;           // Current user info
  let isAdmin = false;       // Is current user an admin
  let modules = [];          // Available modules
  let currentModule = null;  // Currently selected module
  let currentSchema = null;  // Current module schema
  
  // ==============================================================================
  // DOM Elements
  // ==============================================================================
  
  const elements = {
    // Screens
    loadingScreen: () => document.getElementById('loadingScreen'),
    loginRequired: () => document.getElementById('loginRequired'),
    app: () => document.getElementById('app'),
    
    // Sidebar
    sidebar: () => document.getElementById('sidebar'),
    moduleNav: () => document.getElementById('moduleNav'),
    adminSection: () => document.getElementById('adminSection'),
    userInfo: () => document.getElementById('userInfo'),
    userName: () => document.getElementById('userName'),
    userRole: () => document.getElementById('userRole'),
    
    // Content
    content: () => document.getElementById('content'),
    dashboardHome: () => document.getElementById('dashboardHome'),
    modulePanel: () => document.getElementById('modulePanel'),
    moduleGrid: () => document.getElementById('moduleGrid'),
    quickStats: () => document.getElementById('quickStats'),
    welcomeName: () => document.getElementById('welcomeName'),
    
    // Module panel
    settingsForm: () => document.getElementById('settingsForm'),
    panelActions: () => document.getElementById('panelActions'),
    pageTitle: () => document.getElementById('pageTitle'),
    modulePanelTitle: () => document.getElementById('modulePanelTitle'),
    modulePanelDescription: () => document.getElementById('modulePanelDescription'),
    
    // My Files panel
    myFilesPanel: () => document.getElementById('myFilesPanel'),
    myFilesList: () => document.getElementById('myFilesList'),
    uploadDropzone: () => document.getElementById('uploadDropzone'),
    fileInput: () => document.getElementById('fileInput'),
    uploadPublic: () => document.getElementById('uploadPublic'),
    uploadProgress: () => document.getElementById('uploadProgress'),
    progressFill: () => document.getElementById('progressFill'),
    progressText: () => document.getElementById('progressText'),
    
    // Admin panels
    adminUsersPanel: () => document.getElementById('adminUsersPanel'),
    adminDevicesPanel: () => document.getElementById('adminDevicesPanel'),
    adminFilesPanel: () => document.getElementById('adminFilesPanel'),
    usersList: () => document.getElementById('usersList'),
    devicesList: () => document.getElementById('devicesList'),
    allFilesList: () => document.getElementById('allFilesList'),
    filesStats: () => document.getElementById('filesStats'),
    
    // Buttons
    menuToggle: () => document.getElementById('menuToggle'),
    refreshBtn: () => document.getElementById('refreshBtn'),
    exportBtn: () => document.getElementById('exportBtn'),
    saveBtn: () => document.getElementById('saveBtn'),
    cancelBtn: () => document.getElementById('cancelBtn')
  };
  
  // ==============================================================================
  // Initialization
  // ==============================================================================
  
  /**
   * Initialize the application
   */
  async function init() {
    console.log('Initializing My Settings...');
    
    // Check authentication first
    const authenticated = await checkAuth();
    
    if (!authenticated) {
      showLoginRequired();
      return;
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Load modules
    await loadModules();
    
    // Show dashboard
    showDashboard();
    
    // Hide loading, show app
    elements.loadingScreen().style.display = 'none';
    elements.app().style.display = 'flex';
    
    // Handle hash navigation
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    
    console.log('My Settings initialized successfully');
  }
  
  /**
   * Check authentication status
   */
  async function checkAuth() {
    try {
      const response = await API.getAuthStatus();
      
      if (response.authenticated && response.user) {
        user = response.user;
        isAdmin = user.isAdmin;
        
        // Update UI
        elements.userName().textContent = user.name || user.email || 'User';
        elements.welcomeName().textContent = user.name || user.email || 'User';
        
        const roleEl = elements.userRole();
        if (roleEl) {
          roleEl.textContent = isAdmin ? 'Admin' : 'User';
          roleEl.className = 'user-role' + (isAdmin ? ' admin' : '');
        }
        
        // Show admin sections if admin
        if (isAdmin) {
          document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = '';
          });
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Auth check failed:', error);
      return false;
    }
  }
  
  /**
   * Show login required screen
   */
  function showLoginRequired() {
    elements.loadingScreen().style.display = 'none';
    elements.loginRequired().style.display = 'flex';
    elements.app().style.display = 'none';
  }
  
  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    // Menu toggle (mobile)
    elements.menuToggle()?.addEventListener('click', () => {
      elements.sidebar()?.classList.toggle('open');
    });
    
    // Refresh button
    elements.refreshBtn()?.addEventListener('click', () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        loadModule(hash);
      } else {
        showDashboard();
      }
    });
    
    // Form submit
    elements.settingsForm()?.addEventListener('submit', handleFormSubmit);
    
    // Cancel button
    elements.cancelBtn()?.addEventListener('click', showDashboard);
    
    // Module card clicks (delegated)
    elements.moduleGrid()?.addEventListener('click', handleModuleCardClick);
    
    // Navigation clicks (delegated)
    elements.moduleNav()?.addEventListener('click', handleNavClick);
    
    // Action button clicks (delegated)
    elements.panelActions()?.addEventListener('click', handleActionClick);
    
    // File upload drag & drop
    setupFileUpload();
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      const sidebar = elements.sidebar();
      const menuToggle = elements.menuToggle();
      
      if (sidebar?.classList.contains('open') && 
          !sidebar.contains(e.target) && 
          !menuToggle?.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }
  
  /**
   * Setup file upload drag & drop
   */
  function setupFileUpload() {
    const dropzone = elements.uploadDropzone();
    const fileInput = elements.fileInput();
    
    if (!dropzone || !fileInput) return;
    
    // Click to browse
    dropzone.addEventListener('click', () => fileInput.click());
    
    // File input change
    fileInput.addEventListener('change', (e) => {
      if (e.target.files?.length > 0) {
        handleFileUpload(e.target.files);
      }
    });
    
    // Drag & drop events
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      
      if (e.dataTransfer?.files?.length > 0) {
        handleFileUpload(e.dataTransfer.files);
      }
    });
  }
  
  // ==============================================================================
  // Data Loading
  // ==============================================================================
  
  /**
   * Load all modules from API
   */
  async function loadModules() {
    try {
      const response = await API.getModules();
      modules = response.modules || [];
      // Note: Navigation is static in HTML, no need to render
    } catch (error) {
      console.error('Failed to load modules:', error);
      UI.showError('Failed to load modules: ' + error.message);
    }
  }
  
  /**
   * Load a specific module's details
   * @param {string} moduleName - Module name
   */
  async function loadModule(moduleName) {
    try {
      // Handle My Files specially
      if (moduleName === 'files') {
        await loadMyFiles();
        return;
      }
      
      // Handle admin-specific modules
      if (moduleName.startsWith('admin-')) {
        await loadAdminPanel(moduleName);
        return;
      }
      
      // Regular module
      const module = await API.getModule(moduleName);
      currentModule = module;
      currentSchema = module.schema;
      renderModulePanel(module);
    } catch (error) {
      console.error('Failed to load module:', error);
      UI.showError('Failed to load module: ' + error.message);
    }
  }
  
  /**
   * Load admin-specific panels
   * @param {string} panelName - Admin panel name
   */
  async function loadAdminPanel(panelName) {
    // Hide all panels first
    hideAllPanels();
    
    switch (panelName) {
      case 'admin-users':
        await loadAdminUsers();
        break;
      case 'admin-devices':
        await loadAdminDevices();
        break;
      case 'admin-files':
        await loadAdminFiles();
        break;
    }
    
    updateActiveNav(panelName);
    elements.sidebar()?.classList.remove('open');
  }
  
  /**
   * Load My Files panel (user's own files)
   */
  async function loadMyFiles() {
    hideAllPanels();
    
    elements.pageTitle().textContent = 'My Files';
    elements.myFilesPanel().style.display = 'block';
    
    try {
      const response = await API.getMyFiles();
      const files = response.files || [];
      
      renderMyFilesList(files);
    } catch (error) {
      console.error('Failed to load files:', error);
      elements.myFilesList().innerHTML = `<p class="error-state">Failed to load files: ${error.message}</p>`;
    }
    
    updateActiveNav('files');
    elements.sidebar()?.classList.remove('open');
  }
  
  /**
   * Render user's files list
   */
  function renderMyFilesList(files) {
    const container = elements.myFilesList();
    
    if (!files || files.length === 0) {
      container.innerHTML = '<p class="empty-state">No files uploaded yet. Drag & drop files above to upload.</p>';
      return;
    }
    
    let html = '<table class="files-table"><thead><tr>';
    html += '<th>Name</th><th>Size</th><th>Downloads</th><th>Visibility</th><th>Uploaded</th><th>Actions</th>';
    html += '</tr></thead><tbody>';
    
    for (const file of files) {
      const isPublic = file.isPublic ? 'Public' : 'Private';
      const publicClass = file.isPublic ? 'enabled' : 'disabled';
      
      html += `
        <tr>
          <td>
            <a href="${escapeHtml(file.downloadUrl || '#')}" target="_blank" title="Download">
              ${escapeHtml(file.originalName || file.filename)}
            </a>
          </td>
          <td>${formatFileSize(file.size)}</td>
          <td>${file.downloads || 0}</td>
          <td><span class="stat-value ${publicClass}">${isPublic}</span></td>
          <td>${formatDate(file.uploadedAt)}</td>
          <td>
            <button class="btn btn-sm" onclick="App.copyFileLink('${escapeHtml(file.downloadUrl || '')}')">📋 Copy</button>
            <button class="btn btn-sm" onclick="App.toggleFileVisibility('${escapeHtml(file.id)}', ${!file.isPublic})">${file.isPublic ? '🔒' : '🌐'}</button>
            <button class="btn btn-sm btn-danger" onclick="App.deleteMyFile('${escapeHtml(file.id)}')">🗑️</button>
          </td>
        </tr>
      `;
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
  }
  
  /**
   * Handle file upload
   */
  async function handleFileUpload(files) {
    const progressEl = elements.uploadProgress();
    const progressFill = elements.progressFill();
    const progressText = elements.progressText();
    const isPublic = elements.uploadPublic()?.checked || false;
    
    progressEl.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Uploading...';
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      progressText.textContent = `Uploading ${file.name}... (${i + 1}/${files.length})`;
      
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('isPublic', isPublic.toString());
        
        await API.uploadFile(formData);
        
        progressFill.style.width = `${((i + 1) / files.length) * 100}%`;
      } catch (error) {
        console.error('Upload failed:', error);
        UI.showError(`Failed to upload ${file.name}: ${error.message}`);
      }
    }
    
    progressText.textContent = 'Upload complete!';
    setTimeout(() => {
      progressEl.style.display = 'none';
      // Refresh files list
      loadMyFiles();
    }, 1000);
    
    // Clear file input
    elements.fileInput().value = '';
  }
  
  /**
   * Load all users (admin)
   */
  async function loadAdminUsers() {
    elements.pageTitle().textContent = 'All Users';
    elements.adminUsersPanel().style.display = 'block';
    
    try {
      const response = await API.request('/admin/users');
      const users = response.users || [];
      
      if (users.length === 0) {
        elements.usersList().innerHTML = '<p class="empty-state">No users with settings found.</p>';
        return;
      }
      
      let html = '<div class="users-grid">';
      for (const user of users) {
        html += `
          <div class="user-card">
            <div class="user-card-header">
              <span class="user-avatar">${(user.name || user.id).charAt(0).toUpperCase()}</span>
              <div class="user-info">
                <h4>${escapeHtml(user.name || user.id)}</h4>
                <span class="user-id">${escapeHtml(user.id)}</span>
              </div>
            </div>
            <div class="user-card-body">
              <div class="user-stat">
                <span class="stat-label">Telegram</span>
                <span class="stat-value ${user.telegramEnabled ? 'enabled' : 'disabled'}">
                  ${user.telegramEnabled ? '✓ Enabled' : '✗ Disabled'}
                </span>
              </div>
              <div class="user-stat">
                <span class="stat-label">Files</span>
                <span class="stat-value">${user.fileCount || 0}</span>
              </div>
            </div>
            <div class="user-card-footer">
              <button class="btn btn-sm" onclick="App.viewUserSettings('${escapeHtml(user.id)}')">
                View Settings
              </button>
            </div>
          </div>
        `;
      }
      html += '</div>';
      
      elements.usersList().innerHTML = html;
    } catch (error) {
      console.error('Failed to load users:', error);
      elements.usersList().innerHTML = `<p class="error-state">Failed to load users: ${error.message}</p>`;
    }
  }
  
  /**
   * Load all devices (admin)
   */
  async function loadAdminDevices() {
    elements.pageTitle().textContent = 'All Devices';
    elements.adminDevicesPanel().style.display = 'block';
    
    // Show loading state
    elements.devicesList().innerHTML = '<p class="loading-state">Loading devices...</p>';
    
    try {
      // First check sync status
      let syncStatus = null;
      try {
        syncStatus = await API.getSyncStatus();
      } catch (e) {
        console.log('Could not get sync status:', e);
      }
      
      // Build header with sync button
      let html = `
        <div class="devices-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px;">
          <div>
            <h3 style="margin: 0 0 5px 0;">Device Groups Overview</h3>
            <p style="margin: 0; color: #64748b; font-size: 14px;">
              ${syncStatus ? `${syncStatus.totalDeviceGroups} device group(s) across all users` : 'Manage access to all device groups'}
            </p>
          </div>
          <div style="display: flex; gap: 10px; align-items: center;">
            ${syncStatus && !syncStatus.allSynced ? '<span style="color: #f59e0b; font-size: 13px;">⚠️ Some admins missing access</span>' : ''}
            <button id="syncAccessBtn" class="btn" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
              🔄 Sync Admin Access
            </button>
          </div>
        </div>
      `;
      
      // Try to get devices
      const response = await API.getDevices();
      const devicesByUser = response.devicesByUser || [];
      
      if (devicesByUser.length === 0) {
        html += `
          <div style="text-align: center; padding: 40px; background: #f0f9ff; border-radius: 12px; border: 1px solid #bae6fd;">
            <div style="font-size: 48px; margin-bottom: 16px;">🖥️</div>
            <h3 style="margin: 0 0 8px 0; color: #0c4a6e;">No Device Groups Found</h3>
            <p style="margin: 0 0 20px 0; color: #475569;">
              Click "Sync Admin Access" to grant yourself access to all existing device groups,<br>
              or visit the MeshCentral dashboard to view devices directly.
            </p>
            <a href="/" class="btn" style="display: inline-block; margin-top: 10px;">
              Open MeshCentral Dashboard →
            </a>
          </div>
        `;
      } else {
        // Show devices by user
        for (const userDevices of devicesByUser) {
          html += `<div class="user-devices-group">`;
          html += `<div class="group-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            ${escapeHtml(userDevices.userName || userDevices.userId)}
            <span class="device-count">${userDevices.meshes?.length || 0} device group(s), ${userDevices.deviceCount || 0} device(s)</span>
          </div>`;
          
          html += '<div class="meshes-list">';
          for (const mesh of (userDevices.meshes || [])) {
            const deviceCount = mesh.devices?.length || 0;
            const onlineCount = (mesh.devices || []).filter(d => d.conn && d.conn > 0).length;
            
            html += `
              <div class="mesh-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 8px; margin-bottom: 8px; border: 1px solid #e2e8f0;">
                <div>
                  <div class="mesh-title" style="font-weight: 600; color: #1e293b;">${escapeHtml(mesh.name)}</div>
                  <div class="mesh-info" style="font-size: 13px; color: #64748b;">${deviceCount} device(s)</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: inline-flex; align-items: center; padding: 4px 10px; background: ${onlineCount > 0 ? '#dcfce7' : '#f1f5f9'}; color: ${onlineCount > 0 ? '#166534' : '#64748b'}; border-radius: 20px; font-size: 12px; font-weight: 500;">
                    ${onlineCount > 0 ? '🟢' : '⚪'} ${onlineCount} online
                  </span>
                </div>
              </div>
            `;
          }
          html += '</div></div>';
        }
      }
      
      elements.devicesList().innerHTML = html;
      
      // Attach sync button handler
      document.getElementById('syncAccessBtn')?.addEventListener('click', handleSyncAdminAccess);
      
    } catch (error) {
      console.error('Failed to load devices:', error);
      elements.devicesList().innerHTML = `
        <div style="text-align: center; padding: 40px; background: #fef2f2; border-radius: 12px; border: 1px solid #fecaca;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h3 style="margin: 0 0 8px 0; color: #991b1b;">Failed to Load Devices</h3>
          <p style="margin: 0 0 20px 0; color: #dc2626;">${escapeHtml(error.message)}</p>
          <p style="margin: 0 0 20px 0; color: #475569;">
            This may happen if admin access hasn't been synced yet.<br>
            Click the button below to grant admin access to all device groups.
          </p>
          <button id="syncAccessBtn" class="btn" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
            🔄 Sync Admin Access
          </button>
          <a href="/" class="btn" style="display: inline-block; margin-left: 10px;">
            Open MeshCentral Dashboard
          </a>
        </div>
      `;
      
      // Attach sync button handler for error state too
      document.getElementById('syncAccessBtn')?.addEventListener('click', handleSyncAdminAccess);
    }
  }
  
  /**
   * Handle sync admin access button click
   */
  async function handleSyncAdminAccess() {
    const btn = document.getElementById('syncAccessBtn');
    if (!btn) return;
    
    const confirmed = await UI.confirm(
      'Sync Admin Access',
      'This will grant all site administrators access to all device groups. This allows admins to view and manage all devices across all users. Continue?'
    );
    
    if (!confirmed) return;
    
    try {
      btn.disabled = true;
      btn.innerHTML = '⏳ Syncing...';
      
      const result = await API.syncAdminAccess();
      
      if (result.success) {
        UI.showSuccess(result.message);
        
        // Reload the devices panel after a brief delay
        // (MeshCentral may need a moment to pick up the changes)
        setTimeout(() => {
          loadAdminDevices();
        }, 1000);
      } else {
        UI.showError('Sync failed: ' + (result.error || 'Unknown error'));
        btn.disabled = false;
        btn.innerHTML = '🔄 Sync Admin Access';
      }
    } catch (error) {
      console.error('Sync failed:', error);
      UI.showError('Sync failed: ' + error.message);
      btn.disabled = false;
      btn.innerHTML = '🔄 Sync Admin Access';
    }
  }
  
  /**
   * Load all files (admin)
   */
  async function loadAdminFiles() {
    elements.pageTitle().textContent = 'All Files';
    elements.adminFilesPanel().style.display = 'block';
    
    try {
      // Load stats
      const statsResponse = await API.request('/admin/files/stats');
      const stats = statsResponse.stats || {};
      
      elements.filesStats().innerHTML = `
        <div class="stats-row">
          <div class="stat-box">
            <span class="stat-number">${stats.totalFiles || 0}</span>
            <span class="stat-label">Total Files</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">${formatFileSize(stats.totalSize || 0)}</span>
            <span class="stat-label">Total Size</span>
          </div>
          <div class="stat-box">
            <span class="stat-number">${stats.publicFiles || 0}</span>
            <span class="stat-label">Public</span>
          </div>
        </div>
      `;
      
      // Load files
      const filesResponse = await API.request('/admin/files');
      const files = filesResponse.files || [];
      
      if (files.length === 0) {
        elements.allFilesList().innerHTML = '<p class="empty-state">No files uploaded yet.</p>';
        return;
      }
      
      let html = '<table class="files-table"><thead><tr>';
      html += '<th>Name</th><th>Owner</th><th>Size</th><th>Downloads</th><th>Uploaded</th><th>Actions</th>';
      html += '</tr></thead><tbody>';
      
      for (const file of files) {
        html += `
          <tr>
            <td><a href="${escapeHtml(file.downloadUrl || '#')}" target="_blank">${escapeHtml(file.originalName || file.filename)}</a></td>
            <td>${escapeHtml(file.ownerName || file.ownerId || 'Unknown')}</td>
            <td>${formatFileSize(file.size)}</td>
            <td>${file.downloads || 0}</td>
            <td>${formatDate(file.uploadedAt)}</td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="App.deleteFile('${escapeHtml(file.id)}')">Delete</button>
            </td>
          </tr>
        `;
      }
      
      html += '</tbody></table>';
      elements.allFilesList().innerHTML = html;
      
    } catch (error) {
      console.error('Failed to load files:', error);
      elements.allFilesList().innerHTML = `<p class="error-state">Failed to load files: ${error.message}</p>`;
    }
  }
  
  // ==============================================================================
  // UI Helpers
  // ==============================================================================
  
  /**
   * Hide all panels
   */
  function hideAllPanels() {
    elements.dashboardHome().style.display = 'none';
    elements.modulePanel().style.display = 'none';
    elements.myFilesPanel()?.style && (elements.myFilesPanel().style.display = 'none');
    elements.adminUsersPanel().style.display = 'none';
    elements.adminDevicesPanel().style.display = 'none';
    elements.adminFilesPanel().style.display = 'none';
  }
  
  /**
   * Render module settings panel
   * @param {object} module - Module data
   */
  function renderModulePanel(module) {
    hideAllPanels();
    
    // Update titles
    const title = module.schema?.title || module.displayName || module.name;
    const description = module.schema?.description || module.description || '';
    
    elements.modulePanelTitle().textContent = title;
    elements.modulePanelDescription().textContent = description;
    elements.pageTitle().textContent = title;
    
    // Render form
    const form = elements.settingsForm();
    form.innerHTML = UI.generateForm(module.schema, module.settings);
    UI.setupDependencies(form);
    
    // Render action buttons
    const actions = module.schema?.actions || [];
    const actionsContainer = elements.panelActions();
    actionsContainer.innerHTML = UI.generateActionButtons(actions, module.name);
    
    // Show panel
    elements.modulePanel().style.display = 'block';
    
    // Update active state in nav
    updateActiveNav(module.name);
    
    // Close sidebar on mobile
    elements.sidebar()?.classList.remove('open');
  }
  
  /**
   * Show dashboard home
   */
  function showDashboard() {
    currentModule = null;
    currentSchema = null;
    
    hideAllPanels();
    
    elements.pageTitle().textContent = 'My Settings';
    elements.dashboardHome().style.display = 'block';
    
    updateActiveNav(null);
  }
  
  /**
   * Update active state in navigation
   * @param {string|null} moduleName - Active module name
   */
  function updateActiveNav(moduleName) {
    // Remove all active states
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    
    // Add active state to current
    if (moduleName) {
      const activeItem = document.querySelector(`.nav-item[data-module="${moduleName}"]`);
      activeItem?.classList.add('active');
    }
  }
  
  // ==============================================================================
  // Event Handlers
  // ==============================================================================
  
  /**
   * Handle module card clicks
   */
  function handleModuleCardClick(e) {
    const card = e.target.closest('.module-card');
    if (!card) return;
    
    const moduleName = card.dataset.module;
    if (moduleName) {
      window.location.hash = moduleName;
    }
  }
  
  /**
   * Handle navigation clicks
   */
  function handleNavClick(e) {
    const navItem = e.target.closest('.nav-item');
    if (!navItem) return;
    
    // Don't prevent default for external links
    if (navItem.href && !navItem.href.includes('#')) {
      return;
    }
    
    e.preventDefault();
    
    const moduleName = navItem.dataset.module;
    if (moduleName) {
      window.location.hash = moduleName;
    } else {
      window.location.hash = '';
      showDashboard();
    }
  }
  
  /**
   * Handle hash changes
   */
  function handleHashChange() {
    const hash = window.location.hash.slice(1);
    
    if (hash) {
      loadModule(hash);
    } else {
      showDashboard();
    }
  }
  
  /**
   * Handle form submission
   */
  async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!currentModule) return;
    
    const form = elements.settingsForm();
    const formData = new FormData(form);
    const settings = {};
    
    // Convert FormData to object, handling checkboxes
    for (const [key, value] of formData.entries()) {
      settings[key] = value;
    }
    
    // Handle unchecked checkboxes (they're not in FormData)
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (!formData.has(cb.name)) {
        settings[cb.name] = false;
      } else {
        settings[cb.name] = true;
      }
    });
    
    // Parse numeric values
    form.querySelectorAll('input[type="number"]').forEach(input => {
      if (settings[input.name] !== undefined) {
        settings[input.name] = parseFloat(settings[input.name]) || 0;
      }
    });
    
    try {
      UI.setLoading(elements.saveBtn(), true);
      
      await API.saveModuleSettings(currentModule.name, settings);
      
      UI.showSuccess('Settings saved successfully');
      
      // Reload module to get updated data
      await loadModule(currentModule.name);
    } catch (error) {
      console.error('Failed to save settings:', error);
      UI.showError('Failed to save settings: ' + error.message);
    } finally {
      UI.setLoading(elements.saveBtn(), false);
    }
  }
  
  /**
   * Handle action button clicks
   */
  async function handleActionClick(e) {
    const btn = e.target.closest('.action-btn');
    if (!btn) return;
    
    const action = btn.dataset.action;
    const moduleName = btn.dataset.module;
    
    if (!action || !moduleName) return;
    
    try {
      UI.setLoading(btn, true);
      
      const result = await API.executeAction(moduleName, action);
      
      if (result.message) {
        UI.showSuccess(result.message);
      } else {
        UI.showSuccess(`Action '${action}' completed successfully`);
      }
    } catch (error) {
      console.error('Action failed:', error);
      UI.showError('Action failed: ' + error.message);
    } finally {
      UI.setLoading(btn, false);
    }
  }
  
  // ==============================================================================
  // File Actions
  // ==============================================================================
  
  /**
   * Copy file link to clipboard
   */
  function copyFileLink(url) {
    if (!url) {
      UI.showError('No URL to copy');
      return;
    }
    
    navigator.clipboard.writeText(url).then(() => {
      UI.showSuccess('Link copied to clipboard');
    }).catch(err => {
      console.error('Copy failed:', err);
      UI.showError('Failed to copy link');
    });
  }
  
  /**
   * Toggle file visibility
   */
  async function toggleFileVisibility(fileId, makePublic) {
    try {
      await API.updateFile(fileId, { isPublic: makePublic });
      UI.showSuccess(makePublic ? 'File is now public' : 'File is now private');
      loadMyFiles();
    } catch (error) {
      console.error('Failed to update file:', error);
      UI.showError('Failed to update file: ' + error.message);
    }
  }
  
  /**
   * Delete user's own file
   */
  async function deleteMyFile(fileId) {
    const confirmed = await UI.confirm('Delete File', 'Are you sure you want to delete this file?');
    if (!confirmed) return;
    
    try {
      await API.deleteFile(fileId);
      UI.showSuccess('File deleted');
      loadMyFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
      UI.showError('Failed to delete file: ' + error.message);
    }
  }
  
  /**
   * Delete file (admin)
   */
  async function deleteFile(fileId) {
    const confirmed = await UI.confirm('Delete File', 'Are you sure you want to delete this file?');
    if (!confirmed) return;
    
    try {
      await API.request(`/files/${fileId}`, { method: 'DELETE' });
      UI.showSuccess('File deleted');
      loadAdminFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
      UI.showError('Failed to delete file: ' + error.message);
    }
  }
  
  // ==============================================================================
  // Utility Functions
  // ==============================================================================
  
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  }
  
  function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  }
  
  // ==============================================================================
  // Public API
  // ==============================================================================
  
  return {
    init,
    loadModule,
    showDashboard,
    deleteFile,
    deleteMyFile,
    copyFileLink,
    toggleFileVisibility,
    syncAdminAccess: handleSyncAdminAccess,
    viewUserSettings: (userId) => {
      console.log('View user settings:', userId);
      // Could open a modal or navigate to user detail view
    }
  };
})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
