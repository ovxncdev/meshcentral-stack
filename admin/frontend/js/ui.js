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
  // SVG Icon Mapping
  // ==============================================================================
  
  const ICONS = {
    // Modules
    'send': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
    'mail': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
    'palette': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"></path></svg>',
    'link': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
    'settings': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
    'server': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>',
    
    // Actions
    'play': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
    'refresh': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
    'download': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
    'upload': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
    'trash': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
    'eye': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    'list': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
    'save': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>',
    'test': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
    'zap': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
    
    // Status
    'success': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
    'error': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
    'warning': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    'info': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    
    // Navigation
    'home': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
    'menu': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>',
    'x': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    'chevron-right': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>',
    'external-link': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',
    
    // Default
    'default': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>'
  };
  
  /**
   * Get icon for a given name
   * @param {string} name - Icon name
   * @returns {string} SVG icon
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
