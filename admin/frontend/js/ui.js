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
    'folder': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
    'file': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>',
    'copy': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    
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
      
      case 'filelist':
        html += `
          <label class="form-label">${escapeHtml(label)}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <div class="file-list-container" id="fileListContainer">
            <div class="file-upload-area" id="fileUploadArea">
              <input type="file" id="fileInput" style="display: none;">
              <div class="upload-dropzone" id="uploadDropzone">
                <span class="upload-icon">${getIcon('upload')}</span>
                <p>Drag & drop files here or <button type="button" class="btn-link" onclick="document.getElementById('fileInput').click()">browse</button></p>
              </div>
              <div class="upload-options" style="margin-top: 10px;">
                <input type="text" id="customFileName" class="form-input" placeholder="Custom filename (optional)" style="flex: 1;">
                <button type="button" class="btn btn-primary btn-sm" id="uploadBtn" onclick="FileManager.uploadFile()">
                  ${getIcon('upload')} Upload
                </button>
              </div>
            </div>
            <div class="file-list" id="fileList">
              <p class="text-muted">Loading files...</p>
            </div>
          </div>
        `;
        // Initialize file list after DOM is ready
        setTimeout(() => FileManager.init(), 100);
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

// ==============================================================================
// File Manager
// ==============================================================================

const FileManager = (function() {
  let files = [];
  
  /**
   * Initialize file manager
   */
  async function init() {
    await loadFiles();
    setupDragDrop();
  }
  
  /**
   * Load files from API
   */
  async function loadFiles() {
    try {
      const response = await fetch(API.getBaseUrl() + '/files');
      const data = await response.json();
      
      if (data.success) {
        files = data.files || [];
        renderFileList();
      } else {
        showError('Failed to load files');
      }
    } catch (error) {
      console.error('Failed to load files:', error);
      const fileList = document.getElementById('fileList');
      if (fileList) {
        fileList.innerHTML = '<p class="text-muted">Failed to load files</p>';
      }
    }
  }
  
  /**
   * Render file list
   */
  function renderFileList() {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    
    if (files.length === 0) {
      fileList.innerHTML = '<p class="text-muted">No files uploaded yet</p>';
      return;
    }
    
    let html = '<table class="file-table"><thead><tr>';
    html += '<th>Filename</th>';
    html += '<th>Size</th>';
    html += '<th>Downloads</th>';
    html += '<th>Download Link</th>';
    html += '<th>Actions</th>';
    html += '</tr></thead><tbody>';
    
    for (const file of files) {
      const size = formatFileSize(file.size);
      const url = file.downloadUrl || '';
      const exists = file.exists !== false;
      
      html += `<tr class="${exists ? '' : 'file-missing'}">`;
      html += `<td><span class="file-icon">${UI.getIcon('file')}</span> ${UI.escapeHtml(file.filename)}</td>`;
      html += `<td>${size}</td>`;
      html += `<td>${file.downloads || 0}</td>`;
      html += `<td class="download-link-cell">`;
      if (exists && url) {
        html += `<input type="text" value="${UI.escapeHtml(url)}" readonly class="form-input download-url" onclick="this.select()">`;
        html += `<button type="button" class="btn btn-icon btn-sm" onclick="FileManager.copyUrl('${UI.escapeHtml(url)}')" title="Copy URL">${UI.getIcon('copy')}</button>`;
      } else {
        html += '<span class="text-muted">File missing</span>';
      }
      html += `</td>`;
      html += `<td>`;
      if (exists) {
        html += `<a href="${UI.escapeHtml(url)}" class="btn btn-icon btn-sm" title="Download" target="_blank">${UI.getIcon('download')}</a>`;
      }
      html += `<button type="button" class="btn btn-icon btn-sm btn-danger" onclick="FileManager.deleteFile('${file.id}')" title="Delete">${UI.getIcon('trash')}</button>`;
      html += `</td>`;
      html += `</tr>`;
    }
    
    html += '</tbody></table>';
    fileList.innerHTML = html;
  }
  
  /**
   * Setup drag and drop
   */
  function setupDragDrop() {
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('fileInput');
    
    if (!dropzone || !fileInput) return;
    
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      
      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        uploadFile();
      }
    });
    
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        uploadFile();
      }
    });
  }
  
  /**
   * Upload a file
   */
  async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const customName = document.getElementById('customFileName');
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      UI.showWarning('Please select a file to upload');
      return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    if (customName && customName.value.trim()) {
      formData.append('customName', customName.value.trim());
    }
    
    try {
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Uploading...';
      }
      
      const response = await fetch(API.getBaseUrl() + '/files/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        UI.showSuccess('File uploaded successfully');
        fileInput.value = '';
        if (customName) customName.value = '';
        await loadFiles();
      } else {
        UI.showError(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      UI.showError('Upload failed: ' + error.message);
    } finally {
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = UI.getIcon('upload') + ' Upload';
      }
    }
  }
  
  /**
   * Delete a file
   */
  async function deleteFile(fileId) {
    const confirmed = await UI.confirm('Are you sure you want to delete this file?', 'Delete File');
    if (!confirmed) return;
    
    try {
      const response = await fetch(API.getBaseUrl() + '/files/' + fileId, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        UI.showSuccess('File deleted');
        await loadFiles();
      } else {
        UI.showError(data.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Delete error:', error);
      UI.showError('Delete failed: ' + error.message);
    }
  }
  
  /**
   * Copy URL to clipboard
   */
  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      UI.showSuccess('URL copied to clipboard');
    } catch (error) {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      UI.showSuccess('URL copied to clipboard');
    }
  }
  
  /**
   * Format file size
   */
  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Show error helper
   */
  function showError(msg) {
    const fileList = document.getElementById('fileList');
    if (fileList) {
      fileList.innerHTML = `<p class="text-error">${UI.escapeHtml(msg)}</p>`;
    }
  }
  
  return {
    init,
    loadFiles,
    uploadFile,
    deleteFile,
    copyUrl
  };
})();
