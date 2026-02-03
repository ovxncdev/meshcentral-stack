/**
 * UI Utilities
 * 
 * Helper functions for building the dashboard UI:
 * - Form generation from schema (supports both old array and new object formats)
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
    'check': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    
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
   */
  function getIcon(name) {
    return ICONS[name] || ICONS['default'];
  }
  
  // ==============================================================================
  // Toast Notifications
  // ==============================================================================
  
  function toast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toastEl = document.createElement('div');
    toastEl.className = `toast ${type}`;
    toastEl.innerHTML = `
      <span class="toast-icon">${getIcon(type)}</span>
      <div class="toast-content">
        <span class="toast-message">${escapeHtml(message)}</span>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toastEl);
    
    if (duration > 0) {
      setTimeout(() => {
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateX(20px)';
        setTimeout(() => toastEl.remove(), 300);
      }, duration);
    }
    
    return toastEl;
  }
  
  const showSuccess = (msg) => toast(msg, 'success');
  const showError = (msg) => toast(msg, 'error', 6000);
  const showWarning = (msg) => toast(msg, 'warning');
  const showInfo = (msg) => toast(msg, 'info');
  
  // ==============================================================================
  // Modal Dialogs
  // ==============================================================================
  
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
  // Form Generation - Supports BOTH old array AND new object schema formats
  // ==============================================================================
  
  /**
   * Generate form HTML from schema
   * @param {Array|object} schema - Field schema (array for old, object with properties for new)
   * @param {object} values - Current values
   * @returns {string} Form HTML
   */
  function generateForm(schema, values = {}) {
    if (!schema) return '<p class="text-muted">No configuration available</p>';
    
    // Detect schema format
    if (Array.isArray(schema)) {
      // Old array-based format
      return generateFormFromArray(schema, values);
    } else if (schema.properties) {
      // New object-based format
      return generateFormFromObject(schema, values);
    } else {
      return '<p class="text-muted">Invalid schema format</p>';
    }
  }
  
  /**
   * Generate form from array-based schema (old format)
   */
  function generateFormFromArray(schema, values) {
    let html = '';
    let currentSection = null;
    
    for (const field of schema) {
      if (field.type === 'section') {
        if (currentSection) html += '</div>';
        html += `<div class="form-section"><h3 class="form-section-title">${escapeHtml(field.label)}</h3>`;
        currentSection = field.key;
        continue;
      }
      
      if (field.type === 'divider') {
        html += `<hr class="form-divider">`;
        if (field.label) {
          html += `<h4 class="form-subsection-title">${escapeHtml(field.label)}</h4>`;
        }
        continue;
      }
      
      html += generateField(field, values[field.key]);
    }
    
    if (currentSection) html += '</div>';
    return html;
  }
  
  /**
   * Generate form from object-based schema (new format)
   */
  function generateFormFromObject(schema, values) {
    let html = '';
    const properties = schema.properties || {};
    const sections = schema.sections || [];
    
    // If sections are defined, group by sections
    if (sections.length > 0) {
      for (const section of sections) {
        html += `<div class="form-section"><h3 class="form-section-title">${escapeHtml(section.title)}</h3>`;
        
        for (const fieldKey of section.fields || []) {
          const fieldSchema = properties[fieldKey];
          if (fieldSchema) {
            const field = { key: fieldKey, ...normalizeFieldSchema(fieldSchema) };
            html += generateField(field, values[fieldKey]);
          }
        }
        
        html += '</div>';
      }
      
      // Render any remaining fields not in sections
      const sectionFields = new Set(sections.flatMap(s => s.fields || []));
      for (const [key, fieldSchema] of Object.entries(properties)) {
        if (!sectionFields.has(key)) {
          const field = { key, ...normalizeFieldSchema(fieldSchema) };
          html += generateField(field, values[key]);
        }
      }
    } else {
      // No sections, render all fields
      for (const [key, fieldSchema] of Object.entries(properties)) {
        const field = { key, ...normalizeFieldSchema(fieldSchema) };
        html += generateField(field, values[key]);
      }
    }
    
    return html;
  }
  
  /**
   * Normalize new schema field format to old format for generateField
   */
  function normalizeFieldSchema(fieldSchema) {
    return {
      type: fieldSchema.type === 'string' ? 'text' : fieldSchema.type,
      label: fieldSchema.title || fieldSchema.label,
      description: fieldSchema.description,
      placeholder: fieldSchema.placeholder,
      required: fieldSchema.required,
      default: fieldSchema.default,
      options: fieldSchema.options,
      dependsOn: fieldSchema.dependsOn,
      format: fieldSchema.format,
      minimum: fieldSchema.minimum,
      maximum: fieldSchema.maximum,
      validation: {
        min: fieldSchema.minimum,
        max: fieldSchema.maximum
      }
    };
  }
  
  /**
   * Generate a single form field
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
      dependsOn,
      format
    } = field;
    
    if (value === undefined || value === null) {
      value = field.default !== undefined ? field.default : '';
    }
    
    const dataAttrs = dependsOn ? `data-depends-on="${dependsOn}"` : '';
    let html = `<div class="form-group" ${dataAttrs}>`;
    
    // Handle color format for string type
    const effectiveType = format === 'color' ? 'color' : 
                          format === 'textarea' ? 'textarea' : type;
    
    switch (effectiveType) {
      case 'boolean':
        html += `
          <div class="form-toggle">
            <label class="toggle-switch">
              <input type="checkbox" name="${key}" ${value ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
            <div>
              <span class="toggle-label">${escapeHtml(label || key)}</span>
              ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
            </div>
          </div>
        `;
        break;
        
      case 'select':
        html += `
          <label class="form-label">${escapeHtml(label || key)}${required ? ' *' : ''}</label>
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
          <label class="form-label">${escapeHtml(label || key)}${required ? ' *' : ''}</label>
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
          <label class="form-label">${escapeHtml(label || key)}${required ? ' *' : ''}</label>
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
          <label class="form-label">${escapeHtml(label || key)}${required ? ' *' : ''}</label>
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
          <label class="form-label">${escapeHtml(label || key)}${required ? ' *' : ''}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <input 
            type="color" 
            class="form-input form-color" 
            name="${key}" 
            value="${escapeHtml(value || '#000000')}"
          >
        `;
        break;
        
      case 'array':
        // For arrays, show as JSON for now (could be enhanced)
        const arrayValue = Array.isArray(value) ? JSON.stringify(value, null, 2) : '';
        html += `
          <label class="form-label">${escapeHtml(label || key)}${required ? ' *' : ''}</label>
          ${description ? `<p class="form-description">${escapeHtml(description)}</p>` : ''}
          <textarea 
            class="form-textarea" 
            name="${key}" 
            placeholder="JSON array"
            data-type="array"
          >${escapeHtml(arrayValue)}</textarea>
        `;
        break;
        
      case 'text':
      case 'string':
      default:
        html += `
          <label class="form-label">${escapeHtml(label || key)}${required ? ' *' : ''}</label>
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
   */
  function getFormValues(form, schema) {
    const formData = new FormData(form);
    const values = {};
    
    // Build field types map
    const fieldTypes = {};
    if (Array.isArray(schema)) {
      for (const field of schema) {
        if (field.key && field.type) fieldTypes[field.key] = field.type;
      }
    } else if (schema?.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        fieldTypes[key] = prop.type;
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
    
    // Handle checkboxes (boolean)
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      if (cb.name) values[cb.name] = cb.checked;
    });
    
    // Handle array fields
    const arrayFields = form.querySelectorAll('[data-type="array"]');
    arrayFields.forEach(field => {
      if (field.name) {
        try {
          values[field.name] = JSON.parse(field.value || '[]');
        } catch (e) {
          values[field.name] = [];
        }
      }
    });
    
    return values;
  }
  
  /**
   * Setup form field dependencies
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
    
    updateVisibility();
    form.addEventListener('change', updateVisibility);
  }
  
  // ==============================================================================
  // Action Buttons
  // ==============================================================================
  
  /**
   * Generate action buttons HTML
   * @param {Array} actions - Action definitions (supports both old and new format)
   * @param {string} moduleName - Module name
   */
  function generateActionButtons(actions, moduleName) {
    if (!actions || actions.length === 0) {
      return '';
    }
    
    return actions.map(action => {
      const name = action.name;
      const label = action.label || action.title || name;
      const icon = action.icon || 'play';
      const confirmMsg = action.confirm || '';
      const description = action.description || '';
      
      return `
        <button 
          type="button" 
          class="btn btn-secondary" 
          data-module="${moduleName}"
          data-action="${name}"
          ${confirmMsg ? `data-confirm="${escapeHtml(confirmMsg)}"` : ''}
          title="${escapeHtml(description)}"
        >
          ${getIcon(icon)} ${escapeHtml(label)}
        </button>
      `;
    }).join('');
  }
  
  // ==============================================================================
  // Loading States
  // ==============================================================================
  
  function setLoading(element, loading) {
    if (loading) {
      element.classList.add('loading');
      element.disabled = true;
      element.dataset.originalHtml = element.innerHTML;
      element.textContent = 'Loading...';
    } else {
      element.classList.remove('loading');
      element.disabled = false;
      if (element.dataset.originalHtml) {
        element.innerHTML = element.dataset.originalHtml;
      }
    }
  }
  
  // ==============================================================================
  // Utilities
  // ==============================================================================
  
  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
  
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
    getIcon,
    toast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    confirm,
    generateForm,
    generateField,
    getFormValues,
    setupDependencies,
    generateActionButtons,
    setLoading,
    escapeHtml,
    debounce
  };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UI;
}
