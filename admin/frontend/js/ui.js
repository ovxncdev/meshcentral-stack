/**
 * UI Utilities
 * 
 * Helper functions for building the dashboard UI:
 * - Form generation from schema
 * - Toast notifications
 * - Modal dialogs
 * - Loading states
 */

const UI = (function() {
  // ==============================================================================
  // Icon Mapping
  // ==============================================================================
  
  const ICONS = {
    // Modules
    'send': '📤',
    'mail': '📧',
    'palette': '🎨',
    'link': '🔗',
    'settings': '⚙️',
    'server': '🖥️',
    
    // Actions
    'play': '▶️',
    'refresh': '🔄',
    'download': '📥',
    'upload': '📤',
    'trash': '🗑️',
    'eye': '👁️',
    'list': '📋',
    'save': '💾',
    
    // Status
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'info': 'ℹ️',
    
    // Default
    'default': '📦'
  };
  
  /**
   * Get icon for a given name
   * @param {string} name - Icon name
   * @returns {string} Emoji icon
   */
  function getIcon(name) {
    return ICONS[name] || ICONS['default'];
  }
  
  // ==============================================================================
  // Toast Notifications
  // ==============================================================================
  
  /**
   * Show a toast notification
   * @param {string} message - Message to display
   * @param {string} type - Type: success, error, warning, info
   * @param {number} duration - Duration in ms (0 = permanent)
   */
  function toast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${getIcon(type)}</span>
      <div class="toast-content">
        <span class="toast-message">${escapeHtml(message)}</span>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    if (duration > 0) {
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
    
    return toast;
  }
  
  /**
   * Toast shortcuts
   */
  const showSuccess = (msg) => toast(msg, 'success');
  const showError = (msg) => toast(msg, 'error', 6000);
  const showWarning = (msg) => toast(msg, 'warning');
  const showInfo = (msg) => toast(msg, 'info');
  
  // ==============================================================================
  // Modal Dialogs
  // ==============================================================================
  
  /**
   * Show confirmation dialog
   * @param {string} message - Message to display
   * @param {string} title - Dialog title
   * @returns {Promise<boolean>} User's choice
   */
  function confirm(message, title = 'Confirm') {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const titleEl = document.getElementById('confirmTitle');
      const messageEl = document.getElementById('confirmMessage');
      const okBtn = document.getElementById('confirmOk');
      const cancelBtn = document.getElementById('confirmCancel');
      
      if (!modal) {
        resolve(window.confirm(message));
        return;
      }
      
      titleEl.textContent = title;
      messageEl.textContent = message;
      modal.style.display = 'flex';
      
      const cleanup = () => {
        modal.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
      };
      
      const onOk = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }
  
  // ==============================================================================
  // Form Generation
  // ==============================================================================
  
  /**
   * Generate form HTML from schema
   * @param {Array} schema - Field schema array
   * @param {object} values - Current values
   * @returns {string} Form HTML
   */
  function generateForm(schema, values = {}) {
    let html = '';
    let currentSection = null;
    
    for (const field of schema) {
      // Handle sections
      if (field.type === 'section') {
        if (currentSection) {
          html += '</div>'; // Close previous section
        }
        html += `
          <div class="form-section">
            <h3 class="form-section-title">${escapeHtml(field.label)}</h3>
        `;
        currentSection = field.key;
        continue;
      }
      
      // Handle dividers
      if (field.type === 'divider') {
        html += `<hr class="form-divider">`;
        if (field.label) {
          html += `<h4 class="form-section-title" style="font-size: 14px; margin-top: 8px;">${escapeHtml(field.label)}</h4>`;
        }
        continue;
      }
      
      // Generate field
      html += generateField(field, values[field.key]);
    }
    
    // Close last section
    if (currentSection) {
      html += '</div>';
    }
    
    return html;
  }
  
  /**
   * Generate a single form field
   * @param {object} field - Field schema
   * @param {any} value - Current value
   * @returns {string} Field HTML
   */
  function generateField(field, value) {
    const {
      key,
      type,
      label,
      description,
      placeholder,
      required,
      options,
      dependsOn
    } = field;
    
    // Set default value
    if (value === undefined || value === null) {
      value = field.default !== undefined ? field.default : '';
    }
    
    // Data attributes for dependencies
    const dataAttrs = dependsOn ? `data-depends-on="${dependsOn}"` : '';
    
    let html = `<div class="form-group" ${dataAttrs}>`;
    
    switch (type) {
      case 'boolean':
        html += `
          <div class="form-toggle">
            <label class="toggle-switch">
              <input type="checkbox" name="${key}" ${value ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <div>
              <span class="toggle-label">${escapeHtml(label)}</span>
              ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
            </div>
          </div>
        `;
        break;
        
      case 'select':
        html += `
          <label class="form-label">${escapeHtml(label)}${required ? ' *' : ''}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <select class="form-select" name="${key}" ${required ? 'required' : ''}>
            ${(options || []).map(opt => `
              <option value="${escapeHtml(opt.value)}" ${value === opt.value ? 'selected' : ''}>
                ${escapeHtml(opt.label)}
              </option>
            `).join('')}
          </select>
        `;
        break;
        
      case 'textarea':
        html += `
          <label class="form-label">${escapeHtml(label)}${required ? ' *' : ''}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <textarea 
            class="form-textarea" 
            name="${key}" 
            placeholder="${escapeHtml(placeholder || '')}"
            ${required ? 'required' : ''}
          >${escapeHtml(value)}</textarea>
        `;
        break;
        
      case 'password':
        html += `
          <label class="form-label">${escapeHtml(label)}${required ? ' *' : ''}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <input 
            type="password" 
            class="form-input" 
            name="${key}" 
            value="${escapeHtml(value)}"
            placeholder="${escapeHtml(placeholder || '')}"
            ${required ? 'required' : ''}
            autocomplete="off"
          >
        `;
        break;
        
      case 'number':
        html += `
          <label class="form-label">${escapeHtml(label)}${required ? ' *' : ''}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <input 
            type="number" 
            class="form-input" 
            name="${key}" 
            value="${escapeHtml(value)}"
            placeholder="${escapeHtml(placeholder || '')}"
            ${required ? 'required' : ''}
            ${field.validation?.min !== undefined ? `min="${field.validation.min}"` : ''}
            ${field.validation?.max !== undefined ? `max="${field.validation.max}"` : ''}
          >
        `;
        break;
        
      case 'color':
        html += `
          <label class="form-label">${escapeHtml(label)}${required ? ' *' : ''}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <input 
            type="color" 
            class="form-input" 
            name="${key}" 
            value="${escapeHtml(value || '#000000')}"
          >
        `;
        break;
        
      case 'time':
        html += `
          <label class="form-label">${escapeHtml(label)}${required ? ' *' : ''}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <input 
            type="time" 
            class="form-input" 
            name="${key}" 
            value="${escapeHtml(value)}"
            ${required ? 'required' : ''}
          >
        `;
        break;
        
      case 'readonly':
        html += `
          <label class="form-label">${escapeHtml(label)}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <input 
            type="text" 
            class="form-input" 
            value="${escapeHtml(field.value || value)}"
            readonly
            style="background: var(--color-bg); cursor: not-allowed;"
          >
        `;
        break;
        
      case 'text':
      default:
        html += `
          <label class="form-label">${escapeHtml(label)}${required ? ' *' : ''}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <input 
            type="text" 
            class="form-input" 
            name="${key}" 
            value="${escapeHtml(value)}"
            placeholder="${escapeHtml(placeholder || '')}"
            ${required ? 'required' : ''}
          >
        `;
        break;
    }
    
    html += '</div>';
    return html;
  }
  
  /**
   * Get form values as object
   * @param {HTMLFormElement} form - Form element
   * @param {Array} schema - Field schema for type conversion
   * @returns {object} Form values
   */
  function getFormValues(form, schema = []) {
    const formData = new FormData(form);
    const values = {};
    
    // Create a map of field types from schema
    const fieldTypes = {};
    for (const field of schema) {
      if (field.key && field.type) {
        fieldTypes[field.key] = field.type;
      }
    }
    
    // Process form data
    for (const [key, value] of formData.entries()) {
      const type = fieldTypes[key];
      
      if (type === 'number') {
        values[key] = value === '' ? null : Number(value);
      } else {
        values[key] = value;
      }
    }
    
    // Handle checkboxes (not included in FormData when unchecked)
    for (const field of schema) {
      if (field.type === 'boolean') {
        const checkbox = form.querySelector(`[name="${field.key}"]`);
        if (checkbox) {
          values[field.key] = checkbox.checked;
        }
      }
    }
    
    return values;
  }
  
  /**
   * Setup form field dependencies
   * @param {HTMLFormElement} form - Form element
   */
  function setupDependencies(form) {
    const updateVisibility = () => {
      const groups = form.querySelectorAll('[data-depends-on]');
      
      for (const group of groups) {
        const dependsOn = group.dataset.dependsOn;
        const input = form.querySelector(`[name="${dependsOn}"]`);
        
        if (input) {
          const isVisible = input.type === 'checkbox' ? input.checked : !!input.value;
          group.style.display = isVisible ? '' : 'none';
        }
      }
    };
    
    // Initial update
    updateVisibility();
    
    // Listen for changes
    form.addEventListener('change', updateVisibility);
  }
  
  // ==============================================================================
  // Action Buttons
  // ==============================================================================
  
  /**
   * Generate action buttons HTML
   * @param {Array} actions - Action definitions
   * @param {string} moduleName - Module name
   * @returns {string} Buttons HTML
   */
  function generateActionButtons(actions, moduleName) {
    if (!actions || actions.length === 0) {
      return '<p class="text-muted">No actions available</p>';
    }
    
    return actions.map(action => `
      <button 
        type="button" 
        class="btn btn-secondary" 
        data-module="${moduleName}"
        data-action="${action.name}"
        ${action.confirm ? `data-confirm="${escapeHtml(action.confirm)}"` : ''}
        title="${escapeHtml(action.description || '')}"
      >
        ${getIcon(action.icon)} ${escapeHtml(action.label)}
      </button>
    `).join('');
  }
  
  // ==============================================================================
  // Module Cards
  // ==============================================================================
  
  /**
   * Generate module card HTML
   * @param {object} module - Module data
   * @returns {string} Card HTML
   */
  function generateModuleCard(module) {
    return `
      <div class="module-card" data-module="${module.name}">
        <div class="module-card-header">
          <span class="module-card-icon">${getIcon(module.icon)}</span>
          <span class="module-card-title">${escapeHtml(module.displayName)}</span>
        </div>
        <p class="module-card-description">${escapeHtml(module.description)}</p>
        <div class="module-card-status">
          <span class="status-dot ${module.enabled ? 'enabled' : ''}"></span>
          <span>${module.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>
    `;
  }
  
  /**
   * Generate navigation item HTML
   * @param {object} module - Module data
   * @returns {string} Nav item HTML
   */
  function generateNavItem(module) {
    return `
      <div class="nav-item" data-module="${module.name}">
        <span class="nav-icon">${getIcon(module.icon)}</span>
        <span class="nav-label">${escapeHtml(module.displayName)}</span>
        ${module.enabled ? '<span class="nav-badge">ON</span>' : ''}
      </div>
    `;
  }
  
  // ==============================================================================
  // Loading States
  // ==============================================================================
  
  /**
   * Show loading state on element
   * @param {HTMLElement} element - Element to show loading on
   * @param {boolean} loading - Loading state
   */
  function setLoading(element, loading) {
    if (loading) {
      element.classList.add('loading');
      element.disabled = true;
      element.dataset.originalText = element.textContent;
      element.textContent = 'Loading...';
    } else {
      element.classList.remove('loading');
      element.disabled = false;
      if (element.dataset.originalText) {
        element.textContent = element.dataset.originalText;
      }
    }
  }
  
  // ==============================================================================
  // Utilities
  // ==============================================================================
  
  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
  
  /**
   * Debounce function
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in ms
   * @returns {Function} Debounced function
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  // ==============================================================================
  // Public API
  // ==============================================================================
  
  return {
    // Icons
    getIcon,
    
    // Toasts
    toast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    
    // Modal
    confirm,
    
    // Forms
    generateForm,
    generateField,
    getFormValues,
    setupDependencies,
    
    // Actions
    generateActionButtons,
    
    // Modules
    generateModuleCard,
    generateNavItem,
    
    // Loading
    setLoading,
    
    // Utilities
    escapeHtml,
    debounce
  };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UI;
}
