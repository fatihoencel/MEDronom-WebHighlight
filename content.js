// WebMark & PDF Studio - Content Script
(() => {
  if (window.__webmarkInitialized) return;
  window.__webmarkInitialized = true;

  // Global State
  let currentSelectionRange = null;
  let isPickerActive = false;
  let hoveredPickerElement = null;
  let selectedPickerElements = [];
  let pageAnnotations = [];
  const STORAGE_KEY = `webmark_${location.origin}${location.pathname}`;

  // Preload Google Fonts for typography switches
  const fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@400;600&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300&family=Open+Sans:wght@400;600&family=Playfair+Display:ital,wght@0,600;1,400&family=Roboto:wght@400;500;700&display=swap";
  document.head.appendChild(fontLink);

  // =========================================================================
  // DOM Range Highlighting & Wrapping Logic
  // =========================================================================

  function generateUniqueId() {
    return 'wm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5);
  }

  function getTextNodesInRange(range) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          // Ignore our extension UI elements
          if (node.parentElement && node.parentElement.closest('#webmark-floating-toolbar, #webmark-picker-panel, #webmark-toast-container')) {
            return NodeFilter.FILTER_REJECT;
          }
          return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let currentNode = walker.currentNode;
    if (currentNode.nodeType === Node.TEXT_NODE && range.intersectsNode(currentNode)) {
      if (currentNode.nodeValue.trim()) textNodes.push(currentNode);
    }
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    return textNodes;
  }

  function attachMarkClickHandler(element, id) {
    if (!element || element.__wmClickAttached) return;
    element.__wmClickAttached = true;
    element.title = 'Vurguyu kaldırmak için tıklayın';

    element.addEventListener('click', (e) => {
      if (isPickerActive) return;

      e.stopPropagation();
      e.preventDefault();

      removeStyleById(id);
      hideFloatingToolbar();
      try {
        window.getSelection()?.removeAllRanges();
      } catch (err) {}
      showToast('Vurgu kaldırıldı ✕', 'info', 2000);
    }, { capture: true });
  }

  function applyStyleToRange(range, { type, color, fontClass, id = generateUniqueId() }) {
    if (!range || range.collapsed) return null;

    const textNodes = getTextNodesInRange(range);
    if (textNodes.length === 0) return null;

    const wrappedElements = [];
    const fullText = range.toString().trim();

    textNodes.forEach((node, index) => {
      let startOffset = 0;
      let endOffset = node.length;

      if (node === range.startContainer) {
        startOffset = range.startOffset;
      }
      if (node === range.endContainer) {
        endOffset = range.endOffset;
      }

      if (startOffset >= endOffset) return;

      // Extract text chunk
      let targetTextNode = node;
      if (endOffset < node.length) {
        targetTextNode.splitText(endOffset);
      }
      if (startOffset > 0) {
        targetTextNode = targetTextNode.splitText(startOffset);
      }

      // Create Wrapper Tag
      let wrapper;
      if (type === 'highlight') {
        wrapper = document.createElement('mark');
        wrapper.className = 'webmark-highlight';
        wrapper.style.setProperty('--wm-bg', color || '#fef08a');
        wrapper.setAttribute('data-color', color || '#fef08a');
      } else if (type === 'underline-solid') {
        wrapper = document.createElement('span');
        wrapper.className = 'webmark-underline-solid';
        wrapper.style.setProperty('--wm-underline-color', color || '#2563eb');
        wrapper.setAttribute('data-color', color || '#2563eb');
      } else if (type === 'underline-wavy') {
        wrapper = document.createElement('span');
        wrapper.className = 'webmark-underline-wavy';
        wrapper.style.setProperty('--wm-underline-color', color || '#dc2626');
        wrapper.setAttribute('data-color', color || '#dc2626');
      } else if (type === 'font') {
        wrapper = document.createElement('span');
        wrapper.className = fontClass || 'webmark-font-inter';
        wrapper.setAttribute('data-font', fontClass || 'webmark-font-inter');
      } else {
        wrapper = document.createElement('span');
      }

      wrapper.setAttribute('data-webmark-id', id);
      wrapper.setAttribute('data-webmark-type', type);

      targetTextNode.parentNode.insertBefore(wrapper, targetTextNode);
      wrapper.appendChild(targetTextNode);
      attachMarkClickHandler(wrapper, id);
      wrappedElements.push(wrapper);
    });

    // Extract surrounding context (sentences before and after)
    let beforeContext = '';
    let afterContext = '';
    try {
      const containerEl = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;
      
      const blockEl = containerEl.closest('p, article, section, div, blockquote, li, td') || containerEl;
      const fullBlockText = blockEl.innerText || blockEl.textContent || '';
      const textIndex = fullBlockText.indexOf(fullText);
      
      if (textIndex !== -1) {
        // Grab up to ~180 chars before and after
        const rawBefore = fullBlockText.substring(0, textIndex).trim();
        const rawAfter = fullBlockText.substring(textIndex + fullText.length).trim();
        
        beforeContext = rawBefore.length > 200 ? '...' + rawBefore.slice(-180) : rawBefore;
        afterContext = rawAfter.length > 200 ? rawAfter.slice(0, 180) + '...' : rawAfter;
      }
    } catch (e) {
      console.warn('Context extraction error:', e);
    }

    const annotation = {
      id,
      text: fullText,
      beforeContext,
      afterContext,
      type,
      color: color || '',
      fontClass: fontClass || '',
      timestamp: Date.now()
    };

    pageAnnotations.push(annotation);
    saveAnnotations();
    triggerAutoDriveSync(annotation);
    return annotation;
  }

  function removeStyleById(id) {
    const elements = document.querySelectorAll(`[data-webmark-id="${id}"]`);
    elements.forEach(el => {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
      parent.normalize();
    });

    pageAnnotations = pageAnnotations.filter(a => a.id !== id);
    saveAnnotations();
  }

  function removeStylesInSelection(range) {
    if (!range) return;
    const elements = document.querySelectorAll('[data-webmark-id]');
    let removedAny = false;
    elements.forEach(el => {
      if (range.intersectsNode(el)) {
        const id = el.getAttribute('data-webmark-id');
        removeStyleById(id);
        removedAny = true;
      }
    });
    if (removedAny) {
      showToast('Stil başarıyla kaldırıldı', 'info');
    }
  }

  // =========================================================================
  // Persistence (chrome.storage.local with Safety Guards)
  // =========================================================================

  function isRuntimeValid() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function saveAnnotations() {
    if (!isRuntimeValid()) return;
    try {
      const data = {};
      data[STORAGE_KEY] = pageAnnotations;
      chrome.storage.local.set(data, () => {
        if (!isRuntimeValid()) return;
        try {
          chrome.runtime.sendMessage({ action: 'annotations-updated', count: pageAnnotations.length });
        } catch (e) {}
      });
    } catch (e) {
      console.warn('Storage save bypassed (extension updated):', e);
    }
  }

  function loadAnnotations() {
    if (!isRuntimeValid()) return;
    try {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        if (res && res[STORAGE_KEY] && Array.isArray(res[STORAGE_KEY])) {
          pageAnnotations = res[STORAGE_KEY];
          restoreAnnotations();
        }
      });
    } catch (e) {
      console.warn('Storage load bypassed:', e);
    }
  }

  function restoreAnnotations() {
    if (!pageAnnotations || pageAnnotations.length === 0) return;

    pageAnnotations.forEach(item => {
      if (!item.text || document.querySelector(`[data-webmark-id="${item.id}"]`)) return;

      // Search text in document
      findAndApplyText(item.text, item);
    });
  }

  function findAndApplyText(text, item) {
    // Search text node by text content
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.nodeValue.includes(text)) return NodeFilter.FILTER_REJECT;
          if (node.parentElement && node.parentElement.closest('#webmark-floating-toolbar, #webmark-picker-panel')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const targetNode = walker.nextNode();
    if (targetNode) {
      const startIdx = targetNode.nodeValue.indexOf(text);
      if (startIdx !== -1) {
        const range = document.createRange();
        range.setStart(targetNode, startIdx);
        range.setEnd(targetNode, startIdx + text.length);

        // Apply without creating new annotation object
        const textNodes = getTextNodesInRange(range);
        textNodes.forEach(node => {
          let targetTextNode = node;
          if (startIdx + text.length < node.length) {
            targetTextNode.splitText(startIdx + text.length);
          }
          if (startIdx > 0) {
            targetTextNode = targetTextNode.splitText(startIdx);
          }

          let wrapper;
          if (item.type === 'highlight') {
            wrapper = document.createElement('mark');
            wrapper.className = 'webmark-highlight';
            wrapper.style.setProperty('--wm-bg', item.color || '#fef08a');
          } else if (item.type === 'underline-solid') {
            wrapper = document.createElement('span');
            wrapper.className = 'webmark-underline-solid';
            wrapper.style.setProperty('--wm-underline-color', item.color || '#2563eb');
          } else if (item.type === 'underline-wavy') {
            wrapper = document.createElement('span');
            wrapper.className = 'webmark-underline-wavy';
            wrapper.style.setProperty('--wm-underline-color', item.color || '#dc2626');
          } else if (item.type === 'font') {
            wrapper = document.createElement('span');
            wrapper.className = item.fontClass || 'webmark-font-inter';
          } else {
            wrapper = document.createElement('span');
          }

          wrapper.setAttribute('data-webmark-id', item.id);
          wrapper.setAttribute('data-webmark-type', item.type);
          wrapper.title = 'Vurguyu kaldırmak için tıklayın';
          targetTextNode.parentNode.insertBefore(wrapper, targetTextNode);
          wrapper.appendChild(targetTextNode);
          attachMarkClickHandler(wrapper, item.id);
        });
      }
    }
  }

  // =========================================================================
  // Floating Selection Toolbar
  // =========================================================================

  let floatingToolbar = null;

  function createFloatingToolbar() {
    if (document.getElementById('webmark-floating-toolbar')) return;

    floatingToolbar = document.createElement('div');
    floatingToolbar.id = 'webmark-floating-toolbar';
    floatingToolbar.innerHTML = `
      <!-- Satır 1: Vurgulama & Çizgi Araçları -->
      <div class="webmark-tb-row">
        <!-- Vurgulama Renkleri -->
        <div class="webmark-tb-group" title="Vurgula">
          <span style="font-size: 13px; margin-right: 1px;">🖍️</span>
          <div class="webmark-color-dot" data-color="#fef08a" style="background:#fef08a;" title="Sarı"></div>
          <div class="webmark-color-dot" data-color="#bbf7d0" style="background:#bbf7d0;" title="Yeşil"></div>
          <div class="webmark-color-dot" data-color="#bae6fd" style="background:#bae6fd;" title="Mavi"></div>
          <div class="webmark-color-dot" data-color="#fbcfe8" style="background:#fbcfe8;" title="Pembe"></div>
          <div class="webmark-color-dot" data-color="#fed7aa" style="background:#fed7aa;" title="Turuncu"></div>
          <div class="webmark-color-dot" data-color="#e9d5ff" style="background:#e9d5ff;" title="Mor"></div>
          <div class="webmark-color-picker-wrapper" title="Özel Renk Seç">
            <input type="color" id="webmark-custom-highlight" value="#fde047">
          </div>
        </div>

        <div class="webmark-tb-divider"></div>

        <!-- Çizgiler & Renk -->
        <div class="webmark-tb-group">
          <button class="webmark-tb-btn" id="webmark-btn-solid" title="Düz Alt Çizgi">
            <span style="text-decoration: underline; font-weight: bold;">U</span> Düz
          </button>
          <button class="webmark-tb-btn" id="webmark-btn-wavy" title="Dalgalı Alt Çizgi">
            <span style="text-decoration: underline wavy #ef4444; font-weight: bold;">U</span> Dalgalı
          </button>
          <div class="webmark-color-picker-wrapper" title="Çizgi Rengi Seç">
            <input type="color" id="webmark-custom-underline" value="#ef4444">
          </div>
        </div>

        <button class="webmark-tb-btn btn-icon" id="webmark-btn-close" title="Kapat">✕</button>
      </div>

      <!-- Satır 2: Yazı Tipi, PDF & Temizleme -->
      <div class="webmark-tb-row">
        <!-- Font Seçici -->
        <div class="webmark-tb-group" style="flex: 1; min-width: 0;" title="Yazı Tipini Değiştir">
          <span style="font-size: 12px; margin-right: 2px;">🔤</span>
          <select class="webmark-tb-select" id="webmark-font-select">
            <option value="">Yazı Tipi Değiştir...</option>
            <option value="webmark-font-inter">Inter (Modern Sans)</option>
            <option value="webmark-font-merriweather">Merriweather (Serif)</option>
            <option value="webmark-font-georgia">Georgia (Klasik)</option>
            <option value="webmark-font-roboto">Roboto (Net)</option>
            <option value="webmark-font-mono">JetBrains Mono (Kod)</option>
            <option value="webmark-font-dyslexic">OpenDyslexic (Okuma)</option>
            <option value="webmark-font-playfair">Playfair Display (Zarif)</option>
            <option value="webmark-font-comic">Comic Neue (Rahat)</option>
          </select>
        </div>

        <!-- PDF & Temizle -->
        <div class="webmark-tb-group">
          <button class="webmark-tb-btn primary-pdf" id="webmark-btn-pdf" title="Seçili Alanı PDF Olarak İndir">
            📄 Seçimi PDF Yap
          </button>
          <button class="webmark-tb-btn btn-icon" id="webmark-btn-remove" title="Stili Kaldır">🗑️</button>
        </div>
      </div>
    `;

    document.body.appendChild(floatingToolbar);

    // Event Listeners for Toolbar
    // Highlight Swatches
    floatingToolbar.querySelectorAll('.webmark-color-dot').forEach(dot => {
      dot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const color = dot.getAttribute('data-color');
        if (currentSelectionRange) {
          applyStyleToRange(currentSelectionRange, { type: 'highlight', color });
          hideFloatingToolbar();
          showToast('Vurgulama uygulandı', 'success');
        }
      });
    });

    // Custom Highlight Color Picker
    const customHighlight = floatingToolbar.querySelector('#webmark-custom-highlight');
    customHighlight.addEventListener('input', (e) => {
      if (currentSelectionRange) {
        applyStyleToRange(currentSelectionRange, { type: 'highlight', color: e.target.value });
        hideFloatingToolbar();
        showToast('Özel renk vurgulandı', 'success');
      }
    });

    // Solid Underline
    const btnSolid = floatingToolbar.querySelector('#webmark-btn-solid');
    const customUnderline = floatingToolbar.querySelector('#webmark-custom-underline');
    btnSolid.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentSelectionRange) {
        const color = customUnderline.value || '#2563eb';
        applyStyleToRange(currentSelectionRange, { type: 'underline-solid', color });
        hideFloatingToolbar();
        showToast('Düz alt çizgi çizildi', 'success');
      }
    });

    // Wavy Underline
    const btnWavy = floatingToolbar.querySelector('#webmark-btn-wavy');
    btnWavy.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentSelectionRange) {
        const color = customUnderline.value || '#dc2626';
        applyStyleToRange(currentSelectionRange, { type: 'underline-wavy', color });
        hideFloatingToolbar();
        showToast('Dalgalı alt çizgi çizildi 〰️', 'success');
      }
    });

    // Font Select
    const fontSelect = floatingToolbar.querySelector('#webmark-font-select');
    fontSelect.addEventListener('change', (e) => {
      const fontClass = e.target.value;
      if (fontClass && currentSelectionRange) {
        applyStyleToRange(currentSelectionRange, { type: 'font', fontClass });
        hideFloatingToolbar();
        showToast('Yazı tipi değiştirildi', 'success');
        fontSelect.value = '';
      }
    });

    // PDF Export
    const btnPdf = floatingToolbar.querySelector('#webmark-btn-pdf');
    btnPdf.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentSelectionRange) {
        exportSelectionToPdf(currentSelectionRange);
        hideFloatingToolbar();
      }
    });

    // Remove
    const btnRemove = floatingToolbar.querySelector('#webmark-btn-remove');
    btnRemove.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (currentSelectionRange) {
        removeStylesInSelection(currentSelectionRange);
        hideFloatingToolbar();
      }
    });

    // Close
    const btnClose = floatingToolbar.querySelector('#webmark-btn-close');
    btnClose.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideFloatingToolbar();
    });
  }

  function showFloatingToolbar(rect) {
    if (!floatingToolbar) createFloatingToolbar();

    floatingToolbar.style.display = 'flex';
    const toolbarWidth = 350;
    const toolbarHeight = 78;

    // Horizontal centering relative to selection
    let left = rect.left + (rect.width / 2) - (toolbarWidth / 2) + window.scrollX;

    // Keep securely within viewport horizontally
    const padding = 12;
    const minLeft = window.scrollX + padding;
    const maxLeft = window.scrollX + window.innerWidth - toolbarWidth - padding;

    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    // Vertical positioning: default 10px above the selection
    let top = rect.top + window.scrollY - toolbarHeight - 10;

    // If near the top edge of viewport, position below selection instead
    if (rect.top - toolbarHeight - 10 < 10) {
      top = rect.bottom + window.scrollY + 10;
    }

    floatingToolbar.style.left = `${Math.round(left)}px`;
    floatingToolbar.style.top = `${Math.round(top)}px`;
  }

  function hideFloatingToolbar() {
    if (floatingToolbar) {
      floatingToolbar.style.display = 'none';
    }
  }

  // Click on existing highlight/underline to remove it (Delegated & Capture)
  let lastMouseDownCoords = { x: 0, y: 0, time: 0 };
  document.addEventListener('mousedown', (e) => {
    lastMouseDownCoords = { x: e.clientX, y: e.clientY, time: Date.now() };
  }, { capture: true });

  document.addEventListener('click', (e) => {
    if (isPickerActive) return;

    // Ignore clicks inside our UI
    const targetEl = e.target && e.target.nodeType === Node.TEXT_NODE ? e.target.parentElement : (e.target instanceof Element ? e.target : null);
    if (!targetEl || targetEl.closest('#webmark-floating-toolbar, #webmark-picker-panel, #webmark-toast-container')) {
      return;
    }

    // Distinguish click from text drag
    const dist = Math.hypot(e.clientX - lastMouseDownCoords.x, e.clientY - lastMouseDownCoords.y);
    if (dist > 8) return; // User was dragging to select text

    const markEl = targetEl.closest('[data-webmark-id]');
    if (markEl) {
      const id = markEl.getAttribute('data-webmark-id');
      if (id) {
        e.stopPropagation();
        e.preventDefault();
        removeStyleById(id);
        hideFloatingToolbar();
        try {
          window.getSelection()?.removeAllRanges();
        } catch (err) {}
        showToast('Vurgu kaldırıldı ✕', 'info', 2000);
      }
    }
  }, { capture: true });

  // Handle Selection Changes
  document.addEventListener('mouseup', (e) => {
    if (isPickerActive) return;

    // If clicking inside toolbar or toast, ignore
    if (e.target.closest('#webmark-floating-toolbar, #webmark-picker-panel, #webmark-toast-container')) {
      return;
    }

    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        hideFloatingToolbar();
        currentSelectionRange = null;
        return;
      }

      currentSelectionRange = selection.getRangeAt(0).cloneRange();
      const rect = currentSelectionRange.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        showFloatingToolbar(rect);
      }
    }, 10);
  });

  // =========================================================================
  // PDF Export Engine (Selection & Multi-Element Mode)
  // =========================================================================

  function createPdfContainer(contentElements, titleText = document.title) {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: -9999px;
      width: 794px; /* A4 standard web width */
      background: #ffffff;
      color: #1e293b;
      padding: 36px 44px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      font-size: 14px;
      line-height: 1.6;
    `;

    // Header with metadata
    const header = document.createElement('div');
    header.style.cssText = `
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    `;

    const now = new Date();
    const dateFormatted = now.toLocaleDateString('tr-TR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    header.innerHTML = `
      <div>
        <h1 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">${titleText}</h1>
        <div style="font-size: 11px; color: #64748b; word-break: break-all;">
          🔗 <a href="${location.href}" style="color: #3b82f6; text-decoration: none;">${location.href}</a>
        </div>
      </div>
      <div style="text-align: right; min-width: 140px;">
        <span style="display: inline-block; background: #fee2e2; color: #dc2626; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; margin-bottom: 4px;">
          WEBMARK PDF
        </span>
        <div style="font-size: 11px; color: #94a3b8;">${dateFormatted}</div>
      </div>
    `;
    container.appendChild(header);

    // Body content
    const body = document.createElement('div');
    body.className = 'webmark-pdf-content';

    contentElements.forEach(item => {
      const clone = item.cloneNode(true);
      // Remove any picker badges or UI outlines
      clone.classList.remove('webmark-selected-for-pdf', 'webmark-picker-hover');
      clone.querySelectorAll('.webmark-selected-badge').forEach(b => b.remove());
      clone.style.outline = 'none';
      clone.style.margin = '14px 0';
      body.appendChild(clone);
    });

    container.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      border-top: 1px solid #e2e8f0;
      margin-top: 32px;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #94a3b8;
    `;
    footer.innerHTML = `
      <div>WebMark & PDF Studio ile oluşturuldu</div>
      <div>Sayfa 1 / 1</div>
    `;
    container.appendChild(footer);

    document.body.appendChild(container);
    return container;
  }

  // Generate PDF Base64 String without showing download prompt
  async function generatePdfBase64(contentElements, titleText) {
    if (!window.html2pdf) return null;
    const pdfContainer = createPdfContainer(contentElements, titleText);

    const opt = {
      margin: [10, 10, 10, 10],
      filename: 'document.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 1.5, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      const pdf = await window.html2pdf().set(opt).from(pdfContainer).outputPdf('datauristring');
      pdfContainer.remove();
      // Extract base64 part
      const base64 = pdf.split(',')[1];
      return base64;
    } catch (err) {
      console.warn('PDF base64 generation error:', err);
      pdfContainer.remove();
      return null;
    }
  }

  // Automatic Google Drive Sync for Highlight / Annotation
  async function triggerAutoDriveSync(annotation) {
    chrome.storage.local.get(['gdrive_auto_sync', 'gdrive_access_token'], async (settings) => {
      if (!settings.gdrive_auto_sync) return;

      const hostname = window.location.hostname.replace(/^www\./, '') || 'web-sayfasi';
      showToast('Drive\'a otomatik PDF kaydediliyor... ☁️', 'info', 2500);

      // Create a nice styled quote card for the PDF with context
      const quoteEl = document.createElement('div');
      quoteEl.style.cssText = `
        padding: 24px 28px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-left: 6px solid #3b82f6;
        border-radius: 8px;
        font-size: 14.5px;
        line-height: 1.8;
        color: #334155;
      `;

      let badgeIcon = '🖍️';
      let typeLabel = 'Vurgulanan Alıntı';
      let highlightStyle = 'background-color: #fef08a; padding: 2px 5px; border-radius: 4px; font-weight: 600; color: #0f172a;';

      if (annotation.type === 'underline-solid') {
        badgeIcon = '➖';
        typeLabel = 'Düz Altı Çizili Not';
        highlightStyle = `text-decoration: underline solid ${annotation.color || '#2563eb'}; text-underline-offset: 4px; font-weight: 600; color: #0f172a;`;
      } else if (annotation.type === 'underline-wavy') {
        badgeIcon = '〰️';
        typeLabel = 'Dalgalı Altı Çizili Önemli Not';
        highlightStyle = `text-decoration: underline wavy ${annotation.color || '#dc2626'}; text-underline-offset: 4px; font-weight: 600; color: #0f172a;`;
      } else if (annotation.type === 'highlight' && annotation.color) {
        highlightStyle = `background-color: ${annotation.color}; padding: 2px 5px; border-radius: 4px; font-weight: 600; color: #0f172a;`;
      }

      const beforeHtml = annotation.beforeContext ? `<span style="color: #64748b; font-size: 13.5px;">... ${annotation.beforeContext} </span>` : '<span style="color: #64748b;">... </span>';
      const afterHtml = annotation.afterContext ? `<span style="color: #64748b; font-size: 13.5px;"> ${annotation.afterContext} ...</span>` : '<span style="color: #64748b;"> ...</span>';

      quoteEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 16px;">
          <span style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">
            ${badgeIcon} ${typeLabel}
          </span>
          <span style="font-size: 11px; color: #94a3b8;">
            📅 ${new Date().toLocaleDateString('tr-TR')} &bull; ⏰ ${new Date().toLocaleTimeString('tr-TR')}
          </span>
        </div>
        <div style="font-size: 15px; line-height: 1.8; color: #1e293b;">
          ${beforeHtml}<mark class="pdf-highlight" style="${highlightStyle}">${annotation.text}</mark>${afterHtml}
        </div>
      `;

      const base64Pdf = await generatePdfBase64([quoteEl], `${document.title} - ${hostname}`);
      if (!base64Pdf) {
        showToast('PDF oluşturulamadı ❌', 'warning');
        return;
      }

      // Calculate current page note sequence number
      const noteIndex = pageAnnotations.length;

      // Send to background service worker for Drive API upload
      chrome.runtime.sendMessage({
        action: 'gdrive-upload-pdf',
        data: {
          siteName: hostname,
          title: document.title,
          pageUrl: location.href,
          pdfBase64: base64Pdf,
          noteText: annotation.text,
          noteIndex: noteIndex,
          totalNotes: pageAnnotations.length
        }
      }, (res) => {
        if (res && res.success) {
          showToast(`Drive'a kaydedildi (#${noteIndex}): 📁 ${hostname}/${res.fileName} ☁️`, 'success', 4000);
        } else {
          console.warn('Drive sync failed:', res?.error);
          showToast('Drive yükleme hatası. Lütfen eklenti simgesinden Google Drive bağlantısını kontrol edin.', 'warning', 4500);
        }
      });
    });
  }

  function exportSelectionToPdf(range) {
    if (!range) return;
    showToast('PDF hazırlanıyor, lütfen bekleyin...', 'info', 3000);

    const fragment = range.cloneContents();
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);

    const pdfContainer = createPdfContainer([tempDiv], document.title + ' (Seçim)');

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `${document.title.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ\s_-]/g, '').trim().substring(0, 40) || 'Belge'}_WebMark.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    if (window.html2pdf) {
      window.html2pdf().set(opt).from(pdfContainer).save().then(() => {
        pdfContainer.remove();
        showToast('PDF başarıyla indirildi! 🎉', 'success', 4000);
      }).catch(err => {
        console.error('PDF error:', err);
        pdfContainer.remove();
        showToast('PDF oluşturulurken hata oluştu. Yazdırma penceresi açılıyor...', 'warning');
        triggerPrintWindow([tempDiv]);
      });
    } else {
      triggerPrintWindow([tempDiv]);
      pdfContainer.remove();
    }
  }

  function exportElementsToPdf(elements) {
    if (!elements || elements.length === 0) {
      showToast('Lütfen önce sayfadan en az bir bölge seçin', 'warning');
      return;
    }

    showToast(`${elements.length} bölge PDF'e dönüştürülüyor...`, 'info', 4000);

    const pdfContainer = createPdfContainer(elements, document.title + ' (Özel Seçim)');

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `${document.title.replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ\s_-]/g, '').trim().substring(0, 40) || 'Belge'}_Bolgeler.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    if (window.html2pdf) {
      window.html2pdf().set(opt).from(pdfContainer).save().then(() => {
        pdfContainer.remove();
        showToast('Bölümler PDF olarak başarıyla indirildi! 🎉', 'success', 4000);
      }).catch(err => {
        console.error('PDF error:', err);
        pdfContainer.remove();
        showToast('Doğrudan indirme desteklenmedi, yazdırma açılıyor...', 'warning');
        triggerPrintWindow(elements);
      });
    } else {
      triggerPrintWindow(elements);
      pdfContainer.remove();
    }
  }

  function triggerPrintWindow(elements) {
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${document.title} - WebMark PDF</title>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Comic+Neue&family=Inter:wght@400;600&family=JetBrains+Mono&family=Merriweather&family=Playfair+Display&family=Roboto&display=swap">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; line-height: 1.6; }
          .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px; }
          .header h1 { font-size: 18px; margin: 0 0 6px 0; color: #0f172a; }
          .meta { font-size: 11px; color: #64748b; }
          mark.webmark-highlight { background-color: #fef08a; padding: 1px 3px; border-radius: 3px; }
          .webmark-underline-solid { text-decoration: underline solid #2563eb !important; text-underline-offset: 3px; }
          .webmark-underline-wavy { text-decoration: underline wavy #dc2626 !important; text-underline-offset: 4px; }
          .webmark-font-inter { font-family: 'Inter', sans-serif !important; }
          .webmark-font-merriweather { font-family: 'Merriweather', serif !important; }
          .webmark-font-mono { font-family: 'JetBrains Mono', monospace !important; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${document.title}</h1>
          <div class="meta">${location.href} &bull; ${new Date().toLocaleString('tr-TR')}</div>
        </div>
        <div class="content">
          ${elements.map(el => el.outerHTML).join('<hr style="border:none;border-top:1px dashed #cbd5e1;margin:20px 0;">')}
        </div>
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
      setTimeout(() => printFrame.remove(), 1000);
    }, 500);
  }

  // =========================================================================
  // PDF Bölge Seçici (Interactive Element Picker Mode)
  // =========================================================================

  let pickerPanel = null;

  function togglePickerMode() {
    isPickerActive = !isPickerActive;

    if (isPickerActive) {
      document.body.classList.add('webmark-picker-active');
      createPickerPanel();
      hideFloatingToolbar();
      showToast('Bölge Seçici Aktif: Sayfada istediğiniz yerlere tıklayın', 'info', 4000);
    } else {
      exitPickerMode();
    }
  }

  function exitPickerMode() {
    isPickerActive = false;
    document.body.classList.remove('webmark-picker-active');

    if (hoveredPickerElement) {
      hoveredPickerElement.classList.remove('webmark-picker-hover');
      hoveredPickerElement = null;
    }

    // Clean up outlines and badges
    selectedPickerElements.forEach(el => {
      el.classList.remove('webmark-selected-for-pdf');
      const badge = el.querySelector('.webmark-selected-badge');
      if (badge) badge.remove();
    });
    selectedPickerElements = [];

    if (pickerPanel) {
      pickerPanel.remove();
      pickerPanel = null;
    }
  }

  function createPickerPanel() {
    if (document.getElementById('webmark-picker-panel')) return;

    pickerPanel = document.createElement('div');
    pickerPanel.id = 'webmark-picker-panel';
    pickerPanel.innerHTML = `
      <div class="webmark-picker-count">
        <span>🎯</span>
        <span id="webmark-count-label">0 Bölge Seçildi</span>
      </div>
      <button class="webmark-picker-btn btn-export" id="webmark-picker-download">
        📥 PDF Olarak İndir
      </button>
      <button class="webmark-picker-btn btn-print" id="webmark-picker-print">
        🖨️ Vektör Yazdır
      </button>
      <button class="webmark-picker-btn btn-clear" id="webmark-picker-clear">
        Temizle
      </button>
      <button class="webmark-picker-btn btn-cancel" id="webmark-picker-exit">
        ✕ Çık (ESC)
      </button>
    `;

    document.body.appendChild(pickerPanel);

    pickerPanel.querySelector('#webmark-picker-download').addEventListener('click', () => {
      if (selectedPickerElements.length === 0) {
        showToast('Lütfen önce sayfada tıklayarak bölge seçin!', 'warning');
        return;
      }
      exportElementsToPdf(selectedPickerElements);
    });

    pickerPanel.querySelector('#webmark-picker-print').addEventListener('click', () => {
      if (selectedPickerElements.length === 0) {
        showToast('Lütfen önce sayfada tıklayarak bölge seçin!', 'warning');
        return;
      }
      triggerPrintWindow(selectedPickerElements);
    });

    pickerPanel.querySelector('#webmark-picker-clear').addEventListener('click', () => {
      selectedPickerElements.forEach(el => {
        el.classList.remove('webmark-selected-for-pdf');
        const badge = el.querySelector('.webmark-selected-badge');
        if (badge) badge.remove();
      });
      selectedPickerElements = [];
      updatePickerCount();
      showToast('Seçimler sıfırlandı', 'info');
    });

    pickerPanel.querySelector('#webmark-picker-exit').addEventListener('click', () => {
      exitPickerMode();
      showToast('Bölge seçici kapatıldı', 'info');
    });
  }

  function updatePickerCount() {
    const label = document.getElementById('webmark-count-label');
    if (label) {
      label.textContent = `${selectedPickerElements.length} Bölge Seçildi`;
    }
  }

  // Hover over elements in picker mode
  document.addEventListener('mouseover', (e) => {
    if (!isPickerActive) return;
    if (e.target.closest('#webmark-picker-panel, #webmark-toast-container, #webmark-floating-toolbar')) return;

    // Pick meaningful block/content element
    const target = e.target.closest('article, section, main, div, p, blockquote, table, figure, header, footer, aside, h1, h2, h3, h4, h5, h6') || e.target;

    if (target === document.body || target === document.documentElement) return;

    if (hoveredPickerElement && hoveredPickerElement !== target) {
      hoveredPickerElement.classList.remove('webmark-picker-hover');
    }

    hoveredPickerElement = target;
    hoveredPickerElement.classList.add('webmark-picker-hover');
  });

  document.addEventListener('mouseout', (e) => {
    if (!isPickerActive) return;
    if (hoveredPickerElement && e.target === hoveredPickerElement) {
      hoveredPickerElement.classList.remove('webmark-picker-hover');
      hoveredPickerElement = null;
    }
  });

  // Click on element to select/unselect for PDF
  document.addEventListener('click', (e) => {
    if (!isPickerActive) return;
    if (e.target.closest('#webmark-picker-panel, #webmark-toast-container, #webmark-floating-toolbar')) return;

    e.preventDefault();
    e.stopPropagation();

    const target = hoveredPickerElement || e.target;
    if (!target || target === document.body || target === document.documentElement) return;

    const existingIndex = selectedPickerElements.indexOf(target);
    if (existingIndex !== -1) {
      // Deselect
      selectedPickerElements.splice(existingIndex, 1);
      target.classList.remove('webmark-selected-for-pdf');
      const badge = target.querySelector('.webmark-selected-badge');
      if (badge) badge.remove();
      // Re-number badges
      selectedPickerElements.forEach((el, idx) => {
        const b = el.querySelector('.webmark-selected-badge');
        if (b) b.textContent = `#${idx + 1}`;
      });
    } else {
      // Select
      selectedPickerElements.push(target);
      target.classList.add('webmark-selected-for-pdf');
      const badge = document.createElement('div');
      badge.className = 'webmark-selected-badge';
      badge.textContent = `#${selectedPickerElements.length}`;
      target.appendChild(badge);
    }

    updatePickerCount();
  }, true);

  // Press ESC to exit picker mode
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPickerActive) {
      exitPickerMode();
      showToast('Bölge seçiciden çıkıldı', 'info');
    }
  });

  // =========================================================================
  // Toast Notifications
  // =========================================================================

  let toastContainer = null;

  function showToast(message, type = 'info', duration = 3000) {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'webmark-toast-container';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `webmark-toast ${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'info') icon = '<div class="webmark-spinner"></div>';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  // =========================================================================
  // Message Handling (from background / popup)
  // =========================================================================

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'apply-style') {
      const selection = window.getSelection();
      const range = (selection && !selection.isCollapsed) ? selection.getRangeAt(0) : currentSelectionRange;
      if (range) {
        applyStyleToRange(range, { type: req.styleType, color: req.color });
        showToast('Stil başarıyla uygulandı', 'success');
        sendResponse({ success: true });
      } else {
        showToast('Lütfen önce bir metin seçin', 'warning');
        sendResponse({ success: false, reason: 'No selection' });
      }
    } else if (req.action === 'apply-font') {
      const selection = window.getSelection();
      const range = (selection && !selection.isCollapsed) ? selection.getRangeAt(0) : currentSelectionRange;
      if (range) {
        applyStyleToRange(range, { type: 'font', fontClass: req.fontClass });
        showToast('Yazı tipi uygulandı', 'success');
        sendResponse({ success: true });
      } else {
        showToast('Lütfen önce bir metin seçin', 'warning');
        sendResponse({ success: false });
      }
    } else if (req.action === 'export-selection-pdf') {
      const selection = window.getSelection();
      const range = (selection && !selection.isCollapsed) ? selection.getRangeAt(0) : currentSelectionRange;
      if (range) {
        exportSelectionToPdf(range);
        sendResponse({ success: true });
      } else {
        showToast('Lütfen önce PDF yapmak istediğiniz metni seçin', 'warning');
        sendResponse({ success: false });
      }
    } else if (req.action === 'toggle-area-picker') {
      togglePickerMode();
      sendResponse({ success: true, active: isPickerActive });
    } else if (req.action === 'get-page-annotations') {
      sendResponse({ annotations: pageAnnotations, isPickerActive });
    } else if (req.action === 'delete-annotation') {
      removeStyleById(req.id);
      sendResponse({ success: true });
    } else if (req.action === 'clear-all-annotations') {
      pageAnnotations.forEach(a => removeStyleById(a.id));
      pageAnnotations = [];
      saveAnnotations();
      sendResponse({ success: true });
    } else if (req.action === 'export-full-page-pdf') {
      // Export whole page or main article
      const target = document.querySelector('article, main, #content, .content') || document.body;
      exportElementsToPdf([target]);
      sendResponse({ success: true });
    }
    return true; // Keep message channel open for async response
  });

  // Load any previously saved annotations on this page
  loadAnnotations();
})();
