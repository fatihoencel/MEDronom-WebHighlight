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
  const rawPath = location.pathname;
  const cleanPath = rawPath.replace(/\/+$/, '') || '/';
  const STORAGE_KEY = `webmark_${location.origin}${cleanPath}`;
  const LEGACY_STORAGE_KEY = `webmark_${location.origin}${rawPath}`;

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

  // PDF bağlamı: vurgudan önceki birkaç satır + vurguyu tamamlayan cümle ve bir sonraki cümle.
  // Paragraf sınırlarını aşar; paragraflar '\n' ile ayrılır.
  const CTX_BEFORE_CHARS = 320;  // ~3 satır
  const CTX_AFTER_MAX = 450;
  const CTX_BLOCK_SEL = 'p,div,li,tr,td,th,h1,h2,h3,h4,h5,h6,section,article,blockquote,pre,dt,dd,figcaption';

  function collectNeighborText(startNode, dir, limit) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const el = n.parentElement;
        if (!el || el.closest('script,style,noscript,textarea,#webmark-floating-toolbar,#webmark-picker-panel,#webmark-toast-container')) return NodeFilter.FILTER_REJECT;
        const cs = getComputedStyle(el);
        return cs.display === 'none' || cs.visibility === 'hidden' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    walker.currentNode = startNode;
    const step = () => (dir < 0 ? walker.previousNode() : walker.nextNode());
    const parts = [];
    let total = 0;
    let lastBlock = startNode.parentElement && startNode.parentElement.closest(CTX_BLOCK_SEL);
    for (let n = step(), i = 0; n && total < limit && i < 600; n = step(), i++) {
      const text = n.nodeValue.replace(/\s+/g, ' ');
      if (!text) continue;
      const block = n.parentElement.closest(CTX_BLOCK_SEL);
      if (block !== lastBlock) { parts.push('\n'); lastBlock = block; }
      parts.push(text);
      total += text.length;
    }
    if (dir < 0) parts.reverse();
    return parts.join('');
  }

  function tidyContext(s) {
    return s.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n').replace(/ {2,}/g, ' ');
  }

  // Nokta sonrası cümle bitmiş sayılmayan kısaltmalar (mevzuat/akademik metinlerde sık geçer)
  const ABBREVIATIONS = new Set(['md', 'mad', 'm', 'no', 'nr', 'sk', 's', 'sy', 'bkz', 'krş', 'vb', 'vs', 'vd', 'örn', 'dr', 'prof', 'doç', 'yrd', 'öğr', 'gör', 'uzm', 'av', 'sn', 'fık', 'bnd', 'par', 'ek', 'gen', 'yön', 'tebl', 'krs', 'tbmm', 'rg', 'ltd', 'şti', 'a.ş', 'bk', 'cd', 'cad', 'sok', 'mah', 'apt', 'ed', 'çev', 'ank', 'ist', 'yay', 'bs', 'c', 'cilt', 'böl', 'kıs', 'fr', 'art', 'cf', 'ibid', 'et', 'al', 'inc', 'co', 'st', 'mr', 'mrs', 'ms']);

  // Cümle sonlarının metindeki konumlarını döndürür (noktalama sonrası ya da paragraf '\n' konumu).
  // "Md. 5", "5. maddeye", "a. Bu" gibi kısaltma/numaralandırmalar cümle sonu sayılmaz.
  function sentenceEnds(text) {
    const ends = [];
    const re = /[.!?…]+(?=\s+[A-ZÇĞİÖŞÜ0-9("'“‘])|\n/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[0] === '\n') { ends.push(m.index); continue; }
      if (m[0] === '.') { // yalnızca tek nokta kısaltma olabilir
        const word = (/([\p{L}\p{N}.]+)$/u.exec(text.slice(0, m.index)) || [])[1] || '';
        const w = word.toLowerCase();
        if (ABBREVIATIONS.has(w) || /^\d{1,3}$/.test(w) || /^\p{L}$/u.test(w) || /^(\p{L}\.)+\p{L}$/u.test(w)) continue;
      }
      ends.push(m.index + m[0].length);
    }
    return ends;
  }

  function buildPdfContext(wrappers, fullText) {
    const textNodesOf = (el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const all = [];
      for (let n = w.nextNode(); n; n = w.nextNode()) all.push(n);
      return all;
    };
    const firstText = textNodesOf(wrappers[0])[0];
    const lastTexts = textNodesOf(wrappers[wrappers.length - 1]);
    const lastText = lastTexts[lastTexts.length - 1];
    let before = '';
    let after = '';

    if (firstText) {
      before = tidyContext(collectNeighborText(firstText, -1, CTX_BEFORE_CHARS + 200)).trimStart();
      if (before.length > CTX_BEFORE_CHARS) {
        // ~3 satır geri git, cümle/paragraf başına hizala
        const cut = before.slice(-CTX_BEFORE_CHARS);
        const e = sentenceEnds(cut).find((i) => i < cut.length - 40);
        before = e !== undefined ? cut.slice(e).trimStart() : '… ' + cut.trimStart();
      }
    }

    if (lastText) {
      after = tidyContext(collectNeighborText(lastText, 1, CTX_AFTER_MAX + 200));
      const startsNewBlock = after.startsWith('\n');
      after = after.trimStart();
      const endsWithSentence = /[!?…]$/.test(fullText.trim()) || (/\.$/.test(fullText.trim()) && sentenceEnds(fullText.trim() + ' A').includes(fullText.trim().length));
      const midSentence = !startsNewBlock && !endsWithSentence;
      const need = midSentence ? 2 : 1; // yarım kalan cümleyi tamamla + bir sonraki cümle
      const ends = sentenceEnds(after);
      if (ends.length >= need) after = after.slice(0, ends[need - 1]);
      if (after.length > CTX_AFTER_MAX) after = after.slice(0, CTX_AFTER_MAX).trimEnd() + '…';
      after = (startsNewBlock ? '\n' : '') + after.trimEnd();
    }
    return { pdfBefore: before, pdfAfter: after };
  }

  function applyStyleToRange(range, { type, color, fontClass, id = generateUniqueId() }, isRestoring = false) {
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

    if (isRestoring) {
      return { id, text: fullText, type, color, fontClass };
    }

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

    let pdfCtx = { pdfBefore: '', pdfAfter: '' };
    try {
      pdfCtx = buildPdfContext(wrappedElements, fullText);
    } catch (e) {
      console.warn('PDF context error:', e);
    }

    const annotation = {
      id,
      text: fullText,
      beforeContext,
      afterContext,
      ...pdfCtx,
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
      chrome.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY], (res) => {
        if (!isRuntimeValid()) return;
        const stored = (res && res[STORAGE_KEY]) || (res && res[LEGACY_STORAGE_KEY]);
        if (stored && Array.isArray(stored)) {
          pageAnnotations = stored;
          // Sync to standard key if loaded from legacy
          if (res && !res[STORAGE_KEY] && res[LEGACY_STORAGE_KEY]) {
            const data = {};
            data[STORAGE_KEY] = pageAnnotations;
            chrome.storage.local.set(data);
          }
          restoreAnnotations();

          // Staggered retries for late-hydrating/dynamic sites (e.g. mevzuat.wiki, React, Vue, Next.js)
          setTimeout(restoreAnnotations, 300);
          setTimeout(restoreAnnotations, 800);
          setTimeout(restoreAnnotations, 1600);
          setTimeout(restoreAnnotations, 3000);

          initDynamicContentObserver();
        }
      });
    } catch (e) {
      console.warn('Storage load bypassed:', e);
    }
  }

  // Create an exact DOM Range from character offsets in a container element
  function createRangeFromText(containerEl, targetText, startOffsetInContainer) {
    if (!containerEl) return null;
    const range = document.createRange();
    let currentOffset = 0;
    let startFound = false;

    const walker = document.createTreeWalker(
      containerEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          if (node.parentElement && node.parentElement.closest('#webmark-floating-toolbar, #webmark-picker-panel, #webmark-toast-container')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    const targetEndOffset = startOffsetInContainer + targetText.length;

    while ((node = walker.nextNode())) {
      const nodeLength = node.nodeValue.length;
      const nodeEnd = currentOffset + nodeLength;

      if (!startFound && startOffsetInContainer >= currentOffset && startOffsetInContainer < nodeEnd) {
        const offsetInNode = startOffsetInContainer - currentOffset;
        range.setStart(node, offsetInNode);
        startFound = true;
      }

      if (startFound && targetEndOffset > currentOffset && targetEndOffset <= nodeEnd) {
        const offsetInNode = targetEndOffset - currentOffset;
        range.setEnd(node, offsetInNode);
        return range;
      }

      currentOffset = nodeEnd;
    }

    return null;
  }

  // Find the exact matching Range for an annotation using text + surrounding context
  function findRangeForAnnotation(item) {
    if (!item || !item.text) return null;
    const trimmedTarget = item.text.trim();
    if (!trimmedTarget) return null;

    // Search across candidate block elements for optimal accuracy
    const blockCandidates = Array.from(document.querySelectorAll(
      'p, article, section, div, li, td, th, blockquote, h1, h2, h3, h4, h5, h6, pre, main'
    ));

    let bestMatch = null;
    let highestScore = -1;

    for (const block of blockCandidates) {
      if (block.closest('#webmark-floating-toolbar, #webmark-picker-panel, #webmark-toast-container')) continue;
      
      const blockText = block.innerText || block.textContent || '';
      const textIndex = blockText.indexOf(trimmedTarget);
      if (textIndex === -1) continue;

      let score = 10;
      if (item.beforeContext && blockText.includes(item.beforeContext.slice(-30))) {
        score += 50;
      }
      if (item.afterContext && blockText.includes(item.afterContext.slice(0, 30))) {
        score += 50;
      }

      // Specificity: prefer tighter elements (paragraphs/headings) over huge outer containers
      score += Math.max(0, 100 - Math.floor(blockText.length / 50));

      if (score > highestScore) {
        highestScore = score;
        bestMatch = { block, textIndex };
      }
    }

    if (bestMatch) {
      const range = createRangeFromText(bestMatch.block, trimmedTarget, bestMatch.textIndex);
      if (range) return range;
    }

    // Direct fallback: check document.body text
    if (document.body) {
      const bodyText = document.body.innerText || document.body.textContent || '';
      const fallbackIdx = bodyText.indexOf(trimmedTarget);
      if (fallbackIdx !== -1) {
        return createRangeFromText(document.body, trimmedTarget, fallbackIdx);
      }
    }

    return null;
  }

  function restoreAnnotations() {
    if (!pageAnnotations || pageAnnotations.length === 0) return;

    pageAnnotations.forEach(item => {
      if (!item.text) return;
      // If already active in DOM with its ID, skip
      if (document.querySelector(`[data-webmark-id="${item.id}"]`)) return;

      const range = findRangeForAnnotation(item);
      if (range) {
        applyStyleToRange(range, item, true);
      }
    });
  }

  let restoreDebounceTimer = null;
  function triggerRestoreWithDebounce() {
    clearTimeout(restoreDebounceTimer);
    restoreDebounceTimer = setTimeout(() => {
      restoreAnnotations();
    }, 200);
  }

  let pageObserver = null;
  function initDynamicContentObserver() {
    if (pageObserver || !window.MutationObserver) return;

    pageObserver = new MutationObserver(() => {
      if (!pageAnnotations || pageAnnotations.length === 0) return;
      const hasUnrestored = pageAnnotations.some(item => !document.querySelector(`[data-webmark-id="${item.id}"]`));
      if (hasUnrestored) {
        triggerRestoreWithDebounce();
      }
    });

    if (document.body) {
      pageObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  // SPA route & hash change listeners
  window.addEventListener('popstate', () => {
    loadAnnotations();
  });
  window.addEventListener('hashchange', () => {
    setTimeout(restoreAnnotations, 150);
  });

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
          <span style="color:#A8701A;display:inline-flex;margin-right:2px"><svg viewBox="0 0 32 32" width="16" height="16" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M22.2 3.9a2.6 2.6 0 0 1 3.7 0l2.2 2.2a2.6 2.6 0 0 1 0 3.7L14.6 23.3 8.7 17.4zM7.6 18.5l5.9 5.9-3.2 1.1H5.2l-.5-.5 1.1-3.4z"/><rect x="4" y="27.4" width="14" height="2.6" rx="1.3" fill="currentColor"/></svg></span>
          <div class="webmark-color-dot" data-color="#fef08a" style="background:#fef08a;" title="Sarı"></div>
          <div class="webmark-color-dot" data-color="#bbf7d0" style="background:#bbf7d0;" title="Yeşil"></div>
          <div class="webmark-color-dot" data-color="#bae6fd" style="background:#bae6fd;" title="Mavi"></div>
          <div class="webmark-color-dot" data-color="#fbcfe8" style="background:#fbcfe8;" title="Pembe"></div>
          <div class="webmark-color-dot" data-color="#fed7aa" style="background:#fed7aa;" title="Turuncu"></div>
          <div class="webmark-color-dot" data-color="#e9d5ff" style="background:#e9d5ff;" title="Mor"></div>
          <div class="webmark-color-rainbow" id="webmark-btn-rainbow" title="Gökkuşağı Renk Seçici (Özel Renk)"></div>
          <input type="color" id="webmark-custom-highlight" value="#fde047" style="display: none !important; width: 0; height: 0; opacity: 0; pointer-events: none; position: absolute;">
        </div>

        <div class="webmark-tb-divider"></div>

        <!-- Çizgiler & Renk -->
        <div class="webmark-tb-group">
          <button class="webmark-tb-btn" id="webmark-btn-solid" title="Düz Alt Çizgi">
            <span style="text-decoration: underline; font-weight: bold;">U</span> Düz
          </button>
          <button class="webmark-tb-btn" id="webmark-btn-wavy" title="Dalgalı Alt Çizgi">
            <span id="webmark-wavy-indicator" style="text-decoration: underline wavy #ef4444; font-weight: bold;">U</span> Dalgalı
          </button>
          <div class="webmark-underline-dot" id="webmark-btn-underline-color" style="background: #ef4444;" title="Çizgi Rengini Değiştir"></div>
          <input type="color" id="webmark-custom-underline" value="#ef4444" style="display: none !important; width: 0; height: 0; opacity: 0; pointer-events: none; position: absolute;">
        </div>

        <button class="webmark-tb-btn btn-icon" id="webmark-btn-close" title="Kapat"><svg viewBox="0 0 32 32" width="13" height="13" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.4" d="M8 8l16 16M24 8L8 24"/></svg></button>
      </div>

      <!-- Satır 2: Yazı Tipi, PDF & Temizleme -->
      <div class="webmark-tb-row">
        <!-- Font Seçici -->
        <div class="webmark-tb-group" style="flex: 1; min-width: 0;" title="Yazı Tipini Değiştir">
          <span style="color:#2F7F75;display:inline-flex;margin-right:2px"><svg viewBox="0 0 32 32" width="15" height="15" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M14.3 4h3.4l8 20h-3.5l-1.7-4.4h-6.9L10 24H6.3zM15.4 10L13.1 16h5.7z"/></svg></span>
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
            <svg viewBox="0 0 32 32" width="15" height="15" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M9 3h9.6a2 2 0 0 1 1.4.6l5.4 5.4a2 2 0 0 1 .6 1.4V26a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM11 16.5h10v2.2H11zM11 21.5h7v2.2h-7z"/></svg> Seçimi PDF Yap
          </button>
          <button class="webmark-tb-btn btn-icon" id="webmark-btn-remove" title="Stili Kaldır"><svg viewBox="0 0 32 32" width="15" height="15" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 4h8l1 2h6v3H5V6h6zM7 11h18l-1.3 15a3 3 0 0 1-3 2.7H11.3a3 3 0 0 1-3-2.7zM13 14.5h2v10h-2zM17 14.5h2v10h-2z"/></svg></button>
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

    // Custom Highlight Rainbow Button
    const btnRainbow = floatingToolbar.querySelector('#webmark-btn-rainbow');
    const customHighlight = floatingToolbar.querySelector('#webmark-custom-highlight');

    btnRainbow.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof customHighlight.showPicker === 'function') {
        try {
          customHighlight.showPicker();
          return;
        } catch (err) {}
      }
      customHighlight.click();
    });

    customHighlight.addEventListener('input', (e) => {
      if (currentSelectionRange) {
        applyStyleToRange(currentSelectionRange, { type: 'highlight', color: e.target.value });
        hideFloatingToolbar();
        showToast('Özel renk vurgulandı', 'success');
      }
    });

    // Underline Controls
    const btnSolid = floatingToolbar.querySelector('#webmark-btn-solid');
    const btnWavy = floatingToolbar.querySelector('#webmark-btn-wavy');
    const customUnderline = floatingToolbar.querySelector('#webmark-custom-underline');
    const btnUnderlineColor = floatingToolbar.querySelector('#webmark-btn-underline-color');
    const wavyIndicator = floatingToolbar.querySelector('#webmark-wavy-indicator');

    // Click color circle to open color picker
    btnUnderlineColor.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof customUnderline.showPicker === 'function') {
        try {
          customUnderline.showPicker();
          return;
        } catch (err) {}
      }
      customUnderline.click();
    });

    // Live update of color circle & wavy indicator
    customUnderline.addEventListener('input', (e) => {
      const chosenColor = e.target.value;
      btnUnderlineColor.style.background = chosenColor;
      if (wavyIndicator) {
        wavyIndicator.style.textDecoration = `underline wavy ${chosenColor}`;
      }
    });

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

  const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function createPdfContainer(contentElements, titleText = document.title) {
    const container = document.createElement('div');
    container.className = 'webmark-pdf-render-root';
    container.style.cssText = `
      width: 794px; /* A4 standard web width */
      background: #ffffff;
      color: #1e293b;
      padding: 36px 44px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      font-size: 14px;
      line-height: 1.6;
      opacity: 1;
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
        <h1 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">${escHtml(titleText)}</h1>
        <div style="font-size: 11px; color: #64748b; word-break: break-all;">
          <a href="${escHtml(location.href)}" style="color: #3b82f6; text-decoration: none;">${escHtml(location.href)}</a>
        </div>
      </div>
      <div style="text-align: right; min-width: 140px;">
        <span style="display: inline-block; background: #fee2e2; color: #dc2626; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; margin-bottom: 4px;">
          MEDRONOM WEBHIGHLIGHT
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
      <div>MEDronom - WebHighlight ile oluşturuldu</div>
      <div>Sayfa 1 / 1</div>
    `;
    container.appendChild(footer);

    return container;
  }

  // Generate PDF Base64 String without showing download prompt
  async function generatePdfBase64(contentElements, titleText) {
    if (!window.html2pdf) return null;
    const pdfContainer = createPdfContainer(contentElements, titleText);

    const opt = {
      margin: [10, 10, 10, 10],
      filename: 'document.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        scrollY: 0,
        scrollX: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
      const pdf = await window.html2pdf().set(opt).from(pdfContainer).outputPdf('datauristring');
      if (pdfContainer && pdfContainer.parentNode) {
        pdfContainer.remove();
      }
      if (!pdf || typeof pdf !== 'string' || !pdf.includes(',')) {
        console.warn('[WebMark] PDF generation returned invalid output:', pdf);
        return null;
      }
      // Extract base64 part
      const base64 = pdf.split(',')[1];
      return base64;
    } catch (err) {
      console.warn('[WebMark] PDF base64 generation error:', err);
      if (pdfContainer && pdfContainer.parentNode) {
        pdfContainer.remove();
      }
      return null;
    }
  }

  // Automatic Google Drive Sync for Highlight / Annotation
  async function triggerAutoDriveSync(annotation) {
    if (!isRuntimeValid()) return;
    if (annotation.type === 'font') return; // yazı tipi değişikliği PDF'e gönderilmez

    const safeColor = (c, d) => (/^#[0-9a-f]{3,8}$/i.test(c || '') || /^rgba?\([\d\s.,%]+\)$/i.test(c || '')) ? c : d;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const para = (s) => esc(s).replace(/\n/g, '<br>');

    try {
      chrome.storage.local.get(['gdrive_auto_sync', 'gdrive_webhook_url', 'gdrive_access_token', 'gdrive_user_email', 'gdrive_client_id'], async (settings) => {
        if (!isRuntimeValid()) return;
        if (chrome.runtime.lastError) {
          console.warn('[WebMark] Storage read error in triggerAutoDriveSync:', chrome.runtime.lastError.message);
          return;
        }

        // Do not sync if explicitly toggled off
        if (settings && settings.gdrive_auto_sync === false) {
          return;
        }

        // Only sync if user has set up Google Drive (webhook, config.js, client id or login recorded)
        const hasConfig = typeof WEBMARK_CONFIG !== 'undefined' && !!WEBMARK_CONFIG.WEBHOOK_URL;
        const isDriveConfigured = hasConfig || !!(settings && (settings.gdrive_webhook_url || settings.gdrive_access_token || settings.gdrive_user_email || settings.gdrive_client_id));
        if (!isDriveConfigured) {
          return;
        }

        const hostname = window.location.hostname.replace(/^www\./, '') || 'web-sayfasi';
        showToast('Drive\'a otomatik PDF kaydediliyor... ☁️', 'info', 2500);

        try {
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

          let typeLabel = 'Vurgulanan Alıntı';
          let highlightStyle = 'background-color: #fef08a; padding: 2px 5px; border-radius: 4px; font-weight: 600; color: #0f172a;';

          if (annotation.type === 'underline-solid') {
            typeLabel = 'Düz Altı Çizili Not';
            highlightStyle = `text-decoration: underline; text-decoration-color: ${safeColor(annotation.color, '#2563eb')}; border-bottom: 2px solid ${safeColor(annotation.color, '#2563eb')}; padding-bottom: 1px; font-weight: 600; color: #0f172a; background: transparent;`;
          } else if (annotation.type === 'underline-wavy') {
            typeLabel = 'Dalgalı Altı Çizili Önemli Not';
            highlightStyle = `text-decoration: underline wavy ${safeColor(annotation.color, '#dc2626')}; border-bottom: 2px dashed ${safeColor(annotation.color, '#dc2626')}; padding-bottom: 1px; font-weight: 600; color: #0f172a; background: transparent;`;
          } else if (annotation.type === 'highlight' && annotation.color) {
            highlightStyle = `background-color: ${safeColor(annotation.color, '#fef08a')}; padding: 2px 5px; border-radius: 4px; font-weight: 600; color: #0f172a;`;
          }

          // Geniş bağlam (birkaç satır önce / sonraki cümle); eski kayıtlarda dar bağlama düşer
          const ctxBefore = annotation.pdfBefore || annotation.beforeContext || '';
          const ctxAfter = annotation.pdfAfter || annotation.afterContext || '';
          const ctxStyle = 'color: #64748b; font-size: 13.5px;';
          const beforeHtml = `<span style="${ctxStyle}">${ctxBefore ? para(ctxBefore) + ' ' : ''}</span>`;
          const afterHtml = `<span style="${ctxStyle}">${ctxAfter && !ctxAfter.startsWith('\n') ? ' ' : ''}${para(ctxAfter)}</span>`;
          const hlHtml = `<span class="pdf-highlight" style="${highlightStyle} -webkit-box-decoration-break: clone; box-decoration-break: clone;">${para(annotation.text)}</span>`;

          quoteEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 16px;">
              <span style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">
                ${typeLabel}
              </span>
              <span style="font-size: 11px; color: #94a3b8;">
                ${new Date().toLocaleDateString('tr-TR')} &bull; ${new Date().toLocaleTimeString('tr-TR')}
              </span>
            </div>
            <div style="font-size: 15px; line-height: 1.8; color: #1e293b;">
              ${beforeHtml}${hlHtml}${afterHtml}
            </div>
          `;

          if (!isRuntimeValid()) return;

          // Calculate current page note sequence number
          const noteIndex = pageAnnotations.length;

          // PDF, sayfadan bağımsız offscreen belgede üretilip Drive'a yüklenir (sayfa içi üretim boş PDF veriyordu)
          const pdfHtml = createPdfContainer([quoteEl], `${document.title} - ${hostname}`).outerHTML;
          chrome.runtime.sendMessage({
            action: 'gdrive-render-upload',
            data: {
              html: pdfHtml,
              siteName: hostname,
              title: document.title,
              pageUrl: location.href,
              noteText: annotation.text,
              noteIndex: noteIndex,
              totalNotes: pageAnnotations.length
            }
          }, (res) => {
            if (!isRuntimeValid()) return;
            if (chrome.runtime.lastError) {
              console.warn('[WebMark] Drive sync message error:', chrome.runtime.lastError.message);
              return;
            }

            if (res && res.success) {
              showToast(`Drive'a kaydedildi (#${noteIndex}): 📁 ${res.folder}/${res.fileName} ☁️`, 'success', 4500);
            } else {
              console.warn('[WebMark] Drive sync failed:', res?.error);
              showToast(`Drive yükleme hatası: ${res?.error || 'Lütfen bağlantıyı kontrol edin.'}`, 'warning', 4500);
            }
          });
        } catch (innerErr) {
          console.error('[WebMark] Auto Drive sync inner error:', innerErr);
          showToast('Drive PDF oluşturulurken hata meydana geldi.', 'warning');
        }
      });
    } catch (err) {
      console.warn('[WebMark] Storage access bypassed:', err);
    }
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
      html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, scrollX: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    if (window.html2pdf) {
      window.html2pdf().set(opt).from(pdfContainer).save().then(() => {
        if (pdfContainer && pdfContainer.parentNode) pdfContainer.remove();
        showToast('PDF başarıyla indirildi! 🎉', 'success', 4000);
      }).catch(err => {
        console.error('PDF error:', err);
        if (pdfContainer && pdfContainer.parentNode) pdfContainer.remove();
        showToast('PDF oluşturulurken hata oluştu. Yazdırma penceresi açılıyor...', 'warning');
        triggerPrintWindow([tempDiv]);
      });
    } else {
      triggerPrintWindow([tempDiv]);
      if (pdfContainer && pdfContainer.parentNode) pdfContainer.remove();
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
      html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, scrollX: 0 },
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
        <span style="color:#A8701A;display:inline-flex"><svg viewBox="0 0 32 32" width="17" height="17" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4.5 11V8.5A4 4 0 0 1 8.5 4.5H11M21 4.5h2.5a4 4 0 0 1 4 4V11M27.5 21v2.5a4 4 0 0 1-4 4H21M11 27.5H8.5a4 4 0 0 1-4-4V21"/><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 11.5l11 4.8-4.8 1.8-1.8 4.8z"/></svg></span>
        <span id="webmark-count-label">0 Bölge Seçildi</span>
      </div>
      <button class="webmark-picker-btn btn-export" id="webmark-picker-download">
        <svg viewBox="0 0 32 32" width="15" height="15" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.2" d="M16 5v15M9.5 14l6.5 6.5L22.5 14M6 27h20"/></svg> PDF Olarak İndir
      </button>
      <button class="webmark-picker-btn btn-print" id="webmark-picker-print">
        <svg viewBox="0 0 32 32" width="15" height="15" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M9 3h14v7H9zM6 12h20a3 3 0 0 1 3 3v8h-5v-4H8v4H3v-8a3 3 0 0 1 3-3zM10 21h12v8H10z"/></svg> Vektör Yazdır
      </button>
      <button class="webmark-picker-btn btn-clear" id="webmark-picker-clear">
        Temizle
      </button>
      <button class="webmark-picker-btn btn-cancel" id="webmark-picker-exit">
        <svg viewBox="0 0 32 32" width="13" height="13" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.4" d="M8 8l16 16M24 8L8 24"/></svg> Çık (ESC)
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

    let icon = '<svg viewBox="0 0 32 32" width="15" height="15" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M16 3a13 13 0 1 0 0 26 13 13 0 0 0 0-26zM14.8 14h2.4v8h-2.4zM14.8 9.6h2.4V12h-2.4z"/></svg>';
    if (type === 'success') icon = '<svg viewBox="0 0 32 32" width="15" height="15" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.4" d="M6 17l7 7L26 9"/></svg>';
    if (type === 'warning') icon = '<svg viewBox="0 0 32 32" width="15" height="15" fill="none" style="vertical-align:-3px;flex-shrink:0"><path fill="currentColor" stroke="none" fill-rule="evenodd" d="M16 4a2 2 0 0 1 1.7 1l11 19a2 2 0 0 1-1.7 3H5a2 2 0 0 1-1.7-3l11-19A2 2 0 0 1 16 4zM14.8 12h2.4v8h-2.4zM14.8 21.8h2.4v2.4h-2.4z"/></svg>';
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
