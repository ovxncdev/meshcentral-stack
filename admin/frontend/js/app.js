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
    
    console.log('My Settings initialized');
  }
  
  /**
   * Check authentication status
   */
  async function checkAuth() {
    try {
      const response = await API.getAuthStatus();
      
      if (response.authenticated && response.user) {
        user = response.user;
        isAdmin = response.user.isAdmin === true;
        
        // Update UI with user info
        updateUserInfo();
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Auth check failed:', error);
      return false;
    }
  }
  
  /**
   * Update user info in sidebar
   */
  function updateUserInfo() {
    if (!user) return;
    
    // Set user name
    elements.userName().textContent = user.name || user.email || 'User';
    elements.welcomeName().textContent = user.name || 'User';
    
    // Set role badge
    if (isAdmin) {
      elements.userRole().textContent = 'Admin';
      elements.userRole().className = 'user-role admin';
    } else {
      elements.userRole().textContent = 'User';
      elements.userRole().className = 'user-role';
    }
    
    // Show/hide admin sections
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
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
   * Setup all event listeners
   */
  function setupEventListeners() {
    // Menu toggle (mobile)
    elements.menuToggle()?.addEventListener('click', toggleSidebar);
    
    // Refresh button
    elements.refreshBtn()?.addEventListener('click', handleRefresh);
    
    // Export button (admin only)
    elements.exportBtn()?.addEventListener('click', handleExport);
    
    // Save button / Form submit
    elements.settingsForm()?.addEventListener('submit', handleSaveSettings);
    
    // Cancel button
    elements.cancelBtn()?.addEventListener('click', showDashboard);
    
    // Module card clicks (delegated)
    elements.moduleGrid()?.addEventListener('click', handleModuleCardClick);
    
    // Navigation clicks (delegated)
    elements.moduleNav()?.addEventListener('click', handleNavClick);
    
    // Action button clicks (delegated)
    elements.panelActions()?.addEventListener('click', handleActionClick);
    
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
    
    try {
      const response = await API.request('/admin/devices');
      const devicesByUser = response.devicesByUser || [];
      
      if (devicesByUser.length === 0) {
        elements.devicesList().innerHTML = '<p class="empty-state">No devices found.</p>';
        return;
      }
      
      let html = '';
      for (const userGroup of devicesByUser) {
        html += `
          <div class="user-devices-group">
            <h3 class="group-title">
              <span class="user-icon">👤</span>
              ${escapeHtml(userGroup.userName || userGroup.userId)}
              <span class="device-count">${userGroup.deviceCount} device(s)</span>
            </h3>
            <div class="meshes-list">
        `;
        
        for (const mesh of userGroup.meshes) {
          html += `
            <div class="mesh-group">
              <h4 class="mesh-title">${escapeHtml(mesh.name)}</h4>
              <div class="devices-grid">
          `;
          
          for (const device of mesh.devices || []) {
            const isOnline = device.conn && device.conn > 0;
            html += `
              <div class="device-card ${isOnline ? 'online' : 'offline'}">
                <div class="device-status">${isOnline ? '🟢' : '🔴'}</div>
                <div class="device-info">
                  <h5>${escapeHtml(device.name)}</h5>
                  <span class="device-ip">${escapeHtml(device.ip || 'N/A')}</span>
                </div>
              </div>
            `;
          }
          
          html += '</div></div>';
        }
        
        html += '</div></div>';
      }
      
      elements.devicesList().innerHTML = html;
    } catch (error) {
      console.error('Failed to load devices:', error);
      elements.devicesList().innerHTML = `<p class="error-state">Failed to load devices: ${error.message}</p>`;
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
            <span class="stat-number">${stats.totalDownloads || 0}</span>
            <span class="stat-label">Total Downloads</span>
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
            <td>${escapeHtml(file.originalName || file.filename)}</td>
            <td>${escapeHtml(file.ownerName || file.ownerId)}</td>
            <td>${formatFileSize(file.size)}</td>
            <td>${file.downloads || 0}</td>
            <td>${formatDate(file.uploadedAt)}</td>
            <td>
              <a href="${file.downloadUrl}" class="btn btn-sm" target="_blank">Download</a>
              <button class="btn btn-sm btn-danger" onclick="App.deleteFile('${file.id}')">Delete</button>
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
  // Rendering
  // ==============================================================================
  
  /**
   * Hide all content panels
   */
  function hideAllPanels() {
    elements.dashboardHome().style.display = 'none';
    elements.modulePanel().style.display = 'none';
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
    const navItems = document.querySelectorAll('.nav-item[data-module]');
    
    navItems.forEach(item => {
      if (item.dataset.module === moduleName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
  
  // ==============================================================================
  // Event Handlers
  // ==============================================================================
  
  /**
   * Handle module card click
   * @param {Event} e - Click event
   */
  function handleModuleCardClick(e) {
    const card = e.target.closest('.module-card');
    if (card && card.dataset.module) {
      loadModule(card.dataset.module);
    }
  }
  
  /**
   * Handle navigation click
   * @param {Event} e - Click event
   */
  function handleNavClick(e) {
    const navItem = e.target.closest('.nav-item[data-module]');
    if (navItem && navItem.dataset.module) {
      e.preventDefault();
      loadModule(navItem.dataset.module);
    }
  }
  
  /**
   * Handle action button click
   * @param {Event} e - Click event
   */
  async function handleActionClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    
    const { module: moduleName, action: actionName, confirm: confirmMsg } = button.dataset;
    
    // Confirm if needed
    if (confirmMsg) {
      const confirmed = await UI.confirm(confirmMsg, 'Confirm Action');
      if (!confirmed) return;
    }
    
    // Execute action
    try {
      UI.setLoading(button, true);
      
      const result = await API.executeAction(moduleName, actionName);
      
      UI.showSuccess(result.message || 'Action completed successfully');
      
      // Reload module to get updated data
      if (currentModule) {
        await loadModule(currentModule.name);
      }
      
    } catch (error) {
      console.error('Action failed:', error);
      UI.showError(error.message || 'Action failed');
    } finally {
      UI.setLoading(button, false);
    }
  }
  
  /**
   * Handle save settings
   * @param {Event} e - Submit event
   */
  async function handleSaveSettings(e) {
    e.preventDefault();
    
    if (!currentModule) return;
    
    const form = elements.settingsForm();
    const saveBtn = elements.saveBtn();
    const values = UI.getFormValues(form, currentSchema);
    
    try {
      UI.setLoading(saveBtn, true);
      
      await API.saveModuleSettings(currentModule.name, values);
      
      UI.showSuccess('Settings saved successfully');
      
      // Reload module to get updated data
      await loadModule(currentModule.name);
      
    } catch (error) {
      console.error('Save failed:', error);
      
      if (error.data?.validationErrors) {
        const errors = error.data.validationErrors;
        const messages = errors.map(e => `${e.field}: ${e.message}`).join('\n');
        UI.showError('Validation errors:\n' + messages);
      } else {
        UI.showError(error.message || 'Failed to save settings');
      }
    } finally {
      UI.setLoading(saveBtn, false);
    }
  }
  
  /**
   * Handle refresh
   */
  async function handleRefresh() {
    const btn = elements.refreshBtn();
    
    try {
      UI.setLoading(btn, true);
      
      await loadModules();
      
      if (currentModule) {
        await loadModule(currentModule.name);
      }
      
      UI.showSuccess('Refreshed');
    } catch (error) {
      UI.showError('Refresh failed: ' + error.message);
    } finally {
      UI.setLoading(btn, false);
    }
  }
  
  /**
   * Handle export (admin only)
   */
  async function handleExport() {
    if (!isAdmin) {
      UI.showError('Admin access required');
      return;
    }
    
    try {
      const response = await fetch(API.getBaseUrl() + '/admin/export', {
        credentials: 'include'
      });
      const blob = await response.blob();
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `settings-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      UI.showSuccess('Settings exported');
    } catch (error) {
      UI.showError('Export failed: ' + error.message);
    }
  }
  
  /**
   * Toggle sidebar (mobile)
   */
  function toggleSidebar() {
    elements.sidebar()?.classList.toggle('open');
  }
  
  /**
   * View a specific user's settings (admin)
   */
  async function viewUserSettings(userId) {
    // TODO: Implement user settings modal
    UI.showInfo(`Viewing settings for ${userId} - Coming soon`);
  }
  
  /**
   * Delete a file (admin)
   */
  async function deleteFile(fileId) {
    const confirmed = await UI.confirm('Are you sure you want to delete this file?', 'Delete File');
    if (!confirmed) return;
    
    try {
      await API.request(`/files/${fileId}`, { method: 'DELETE' });
      UI.showSuccess('File deleted');
      await loadAdminFiles();
    } catch (error) {
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
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
  }
  
  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
  
  // ==============================================================================
  // Public API
  // ==============================================================================
  
  return {
    init,
    loadModules,
    loadModule,
    showDashboard,
    viewUserSettings,
    deleteFile,
    
    // Expose for debugging
    getState: () => ({ user, isAdmin, modules, currentModule, currentSchema })
  };
})();

// ==============================================================================
// Initialize on DOM ready
// ==============================================================================

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
