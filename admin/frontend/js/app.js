/**
 * Admin Dashboard Application
 * 
 * Main application logic that ties together:
 * - API communication
 * - UI rendering
 * - User interactions
 * - State management
 */

const App = (function() {
  // ==============================================================================
  // State
  // ==============================================================================
  
  let modules = [];
  let currentModule = null;
  let currentSchema = [];
  
  // ==============================================================================
  // DOM Elements
  // ==============================================================================
  
  const elements = {
    sidebar: () => document.getElementById('sidebar'),
    moduleNav: () => document.getElementById('moduleNav'),
    content: () => document.getElementById('content'),
    dashboardHome: () => document.getElementById('dashboardHome'),
    modulePanel: () => document.getElementById('modulePanel'),
    moduleGrid: () => document.getElementById('moduleGrid'),
    settingsForm: () => document.getElementById('settingsForm'),
    panelActions: () => document.getElementById('panelActions'),
    pageTitle: () => document.getElementById('pageTitle'),
    modulePanelTitle: () => document.getElementById('modulePanelTitle'),
    modulePanelDescription: () => document.getElementById('modulePanelDescription'),
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
    console.log('Initializing Admin Dashboard...');
    
    // Setup event listeners
    setupEventListeners();
    
    // Load modules
    await loadModules();
    
    // Show dashboard home
    showDashboard();
    
    console.log('Admin Dashboard initialized');
  }
  
  /**
   * Setup all event listeners
   */
  function setupEventListeners() {
    // Menu toggle (mobile)
    elements.menuToggle()?.addEventListener('click', toggleSidebar);
    
    // Refresh button
    elements.refreshBtn()?.addEventListener('click', handleRefresh);
    
    // Export button
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
      modules = await API.getModules();
      renderNavigation();
      renderModuleGrid();
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
      const module = await API.getModule(moduleName);
      currentModule = module;
      currentSchema = module.schema || [];
      renderModulePanel(module);
    } catch (error) {
      console.error('Failed to load module:', error);
      UI.showError('Failed to load module: ' + error.message);
    }
  }
  
  // ==============================================================================
  // Rendering
  // ==============================================================================
  
  /**
   * Render navigation sidebar
   */
  function renderNavigation() {
    const nav = elements.moduleNav();
    if (!nav) return;
    
    let html = `
      <div class="nav-section">
        <div class="nav-section-title">Modules</div>
    `;
    
    for (const module of modules) {
      html += UI.generateNavItem(module);
    }
    
    html += '</div>';
    nav.innerHTML = html;
  }
  
  /**
   * Render module grid on dashboard
   */
  function renderModuleGrid() {
    const grid = elements.moduleGrid();
    if (!grid) return;
    
    let html = '';
    for (const module of modules) {
      html += UI.generateModuleCard(module);
    }
    
    grid.innerHTML = html;
  }
  
  /**
   * Render module settings panel
   * @param {object} module - Module data
   */
  function renderModulePanel(module) {
    // Update titles
    elements.modulePanelTitle().textContent = module.displayName;
    elements.modulePanelDescription().textContent = module.description;
    elements.pageTitle().textContent = module.displayName;
    
    // Render form
    const form = elements.settingsForm();
    form.innerHTML = UI.generateForm(module.schema, module.settings);
    UI.setupDependencies(form);
    
    // Render action buttons
    const actionsContainer = elements.panelActions();
    actionsContainer.innerHTML = UI.generateActionButtons(module.actions, module.name);
    
    // Show panel, hide dashboard
    elements.dashboardHome().style.display = 'none';
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
    currentSchema = [];
    
    elements.pageTitle().textContent = 'Dashboard';
    elements.dashboardHome().style.display = 'block';
    elements.modulePanel().style.display = 'none';
    
    updateActiveNav(null);
  }
  
  /**
   * Update active state in navigation
   * @param {string|null} moduleName - Active module name
   */
  function updateActiveNav(moduleName) {
    const navItems = elements.moduleNav()?.querySelectorAll('.nav-item');
    
    navItems?.forEach(item => {
      if (item.dataset.module === moduleName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Also update module cards
    const cards = elements.moduleGrid()?.querySelectorAll('.module-card');
    cards?.forEach(card => {
      if (card.dataset.module === moduleName) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
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
    const navItem = e.target.closest('.nav-item');
    if (navItem && navItem.dataset.module) {
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
      
      // Handle special action results
      if (result.url) {
        window.open(result.url, '_blank');
      }
      
      if (result.settings) {
        // Action returned updated settings, reload module
        await loadModule(moduleName);
      }
      
      // Refresh modules list if needed
      await loadModules();
      
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
      
      // Refresh modules list to update status badges
      await loadModules();
      
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
   * Handle export
   */
  async function handleExport() {
    try {
      const response = await fetch(API.getBaseUrl() + '/export');
      const blob = await response.blob();
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remote-support-settings-${Date.now()}.json`;
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
  
  // ==============================================================================
  // Public API
  // ==============================================================================
  
  return {
    init,
    loadModules,
    loadModule,
    showDashboard,
    
    // Expose for debugging
    getState: () => ({ modules, currentModule, currentSchema })
  };
})();

// ==============================================================================
// Initialize on DOM ready
// ==============================================================================

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
