// WebMark & PDF Studio - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const btnTogglePicker = document.getElementById('btnTogglePicker');
  const btnExportFullPage = document.getElementById('btnExportFullPage');
  const btnQuickHighlight = document.getElementById('btnQuickHighlight');
  const btnQuickWavy = document.getElementById('btnQuickWavy');
  const btnQuickSolid = document.getElementById('btnQuickSolid');
  const btnClearAll = document.getElementById('btnClearAll');
  const btnExportJson = document.getElementById('btnExportJson');
  const annotationCount = document.getElementById('annotationCount');
  const annotationsList = document.getElementById('annotationsList');
  const emptyState = document.getElementById('emptyState');

  // Helper to send messages to active tab with auto-injection fallback
  function sendTabMessage(message, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0] || !tabs[0].id) return;
      currentTabId = tabs[0].id;
      const tabUrl = tabs[0].url || '';

      // Skip chrome:// or edge:// internal pages
      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://') || tabUrl.startsWith('chrome-extension://')) {
        if (callback) callback(null);
        return;
      }

      chrome.tabs.sendMessage(currentTabId, message, (response) => {
        if (chrome.runtime.lastError) {
          // If receiving end does not exist, inject content script on the fly
          chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            files: ['libs/html2pdf.bundle.min.js', 'content.js']
          }).then(() => {
            chrome.scripting.insertCSS({
              target: { tabId: currentTabId },
              files: ['content.css']
            }).then(() => {
              // Retry message after injection
              chrome.tabs.sendMessage(currentTabId, message, (res) => {
                if (callback) callback(res);
              });
            }).catch(() => { if (callback) callback(null); });
          }).catch(() => {
            if (callback) callback(null);
          });
          return;
        }
        if (callback) callback(response);
      });
    });
  }

  // Load annotations from page
  function refreshAnnotations() {
    sendTabMessage({ action: 'get-page-annotations' }, (response) => {
      if (response && Array.isArray(response.annotations)) {
        currentAnnotations = response.annotations;
        renderAnnotations(currentAnnotations);
        if (response.isPickerActive) {
          btnTogglePicker.textContent = "Bölge Seçiciyi Durdur";
          btnTogglePicker.classList.add('active');
        } else {
          btnTogglePicker.textContent = "Bölge Seçiciyi Başlat";
          btnTogglePicker.classList.remove('active');
        }
      }
    });
  }

  function renderAnnotations(list) {
    annotationCount.textContent = list.length;

    if (list.length === 0) {
      emptyState.style.display = 'block';
      annotationsList.innerHTML = '';
      annotationsList.appendChild(emptyState);
      return;
    }

    emptyState.style.display = 'none';
    annotationsList.innerHTML = '';

    list.slice().reverse().forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'annotation-item';

      let icon = '🖍️';
      if (item.type === 'underline-solid') icon = '➖';
      if (item.type === 'underline-wavy') icon = '〰️';
      if (item.type === 'font') icon = '🔤';

      itemEl.innerHTML = `
        <div class="annotation-item-left">
          <span class="annotation-type-badge">${icon}</span>
          <span class="annotation-text" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</span>
        </div>
        <button class="annotation-del-btn" data-id="${item.id}" title="Vurgulamayı Sil">✕</button>
      `;

      itemEl.querySelector('.annotation-del-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.getAttribute('data-id');
        sendTabMessage({ action: 'delete-annotation', id }, () => {
          refreshAnnotations();
        });
      });

      annotationsList.appendChild(itemEl);
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // Toggle Area Picker Mode
  btnTogglePicker.addEventListener('click', () => {
    sendTabMessage({ action: 'toggle-area-picker' }, (res) => {
      window.close(); // Close popup so user sees the page and can select areas immediately
    });
  });

  // Export Full Page
  btnExportFullPage.addEventListener('click', () => {
    sendTabMessage({ action: 'export-full-page-pdf' });
    window.close();
  });

  // Quick Highlight
  btnQuickHighlight.addEventListener('click', () => {
    sendTabMessage({ action: 'apply-style', styleType: 'highlight', color: '#fef08a' }, () => {
      refreshAnnotations();
    });
  });

  // Quick Wavy Underline
  btnQuickWavy.addEventListener('click', () => {
    sendTabMessage({ action: 'apply-style', styleType: 'underline-wavy', color: '#dc2626' }, () => {
      refreshAnnotations();
    });
  });

  // Quick Solid Underline
  btnQuickSolid.addEventListener('click', () => {
    sendTabMessage({ action: 'apply-style', styleType: 'underline-solid', color: '#2563eb' }, () => {
      refreshAnnotations();
    });
  });

  // Clear All
  btnClearAll.addEventListener('click', () => {
    if (confirm('Bu sayfadaki tüm vurguları ve çizimleri silmek istediğinize emin misiniz?')) {
      sendTabMessage({ action: 'clear-all-annotations' }, () => {
        refreshAnnotations();
      });
    }
  });

  // Export JSON
  btnExportJson.addEventListener('click', () => {
    if (currentAnnotations.length === 0) {
      alert('Dışa aktarılacak vurgu bulunamadı.');
      return;
    }
    const blob = new Blob([JSON.stringify(currentAnnotations, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webmark_annotations_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Google Drive Settings & UI Elements
  const toggleDriveSync = document.getElementById('toggleDriveSync');
  const driveDetails = document.getElementById('driveDetails');
  const btnDriveAuth = document.getElementById('btnDriveAuth');
  const driveUserEmail = document.getElementById('driveUserEmail');
  const driveStatusText = document.getElementById('driveStatusText');
  const inputClientId = document.getElementById('inputClientId');
  const btnSaveClientId = document.getElementById('btnSaveClientId');
  const linkClientIdHelp = document.getElementById('linkClientIdHelp');
  const inputRedirectUri = document.getElementById('inputRedirectUri');
  const btnCopyUri = document.getElementById('btnCopyUri');

  // Set the exact redirect URI generated by Chrome for this extension
  try {
    const redirectUrl = chrome.identity.getRedirectURL();
    if (inputRedirectUri) {
      inputRedirectUri.value = redirectUrl;
    }
  } catch (e) {}

  if (btnCopyUri) {
    btnCopyUri.addEventListener('click', () => {
      if (inputRedirectUri) {
        inputRedirectUri.select();
        navigator.clipboard.writeText(inputRedirectUri.value).then(() => {
          btnCopyUri.textContent = 'Kopyalandı ✓';
          setTimeout(() => { btnCopyUri.textContent = 'Kopyala'; }, 2000);
        });
      }
    });
  }

  function initDriveStatus() {
    chrome.storage.local.get(['gdrive_client_id'], (res) => {
      if (res && res.gdrive_client_id) {
        inputClientId.value = res.gdrive_client_id;
      }
    });

    chrome.runtime.sendMessage({ action: 'gdrive-status' }, (res) => {
      if (res) {
        toggleDriveSync.checked = res.autoSync;
        driveDetails.style.display = res.autoSync ? 'flex' : 'none';

        if (res.connected && res.email) {
          btnDriveAuth.textContent = 'Bağlandı ✓';
          btnDriveAuth.classList.add('connected');
          driveUserEmail.textContent = res.email;
          driveStatusText.textContent = `Otomatik senkronizasyon açık (${res.email})`;
        } else {
          btnDriveAuth.textContent = 'Google ile Bağlan';
          btnDriveAuth.classList.remove('connected');
          driveUserEmail.textContent = 'Bağlı değil';
          driveStatusText.textContent = 'Altını çizdiğiniz her şey PDF olarak Drive\'a yüklenir.';
        }
      }
    });
  }

  btnSaveClientId.addEventListener('click', () => {
    const val = inputClientId.value.trim();
    if (!val) {
      alert('Lütfen geçerli bir Google Client ID girin.');
      return;
    }
    chrome.storage.local.set({ gdrive_client_id: val }, () => {
      btnSaveClientId.textContent = 'Kaydedildi ✓';
      setTimeout(() => { btnSaveClientId.textContent = 'Kaydet'; }, 2000);
    });
  });

  linkClientIdHelp.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({
      url: 'https://console.cloud.google.com/apis/credentials'
    });
  });

  toggleDriveSync.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    driveDetails.style.display = isEnabled ? 'flex' : 'none';
    chrome.storage.local.set({ gdrive_auto_sync: isEnabled });

    if (isEnabled) {
      // Check if user is logged in
      chrome.runtime.sendMessage({ action: 'gdrive-status' }, (res) => {
        if (!res || !res.connected) {
          // Trigger connect
          btnDriveAuth.click();
        }
      });
    }
  });

  btnDriveAuth.addEventListener('click', () => {
    btnDriveAuth.textContent = 'Bağlanıyor...';
    chrome.runtime.sendMessage({ action: 'gdrive-auth' }, (res) => {
      if (res && res.success) {
        btnDriveAuth.textContent = 'Bağlandı ✓';
        btnDriveAuth.classList.add('connected');
        driveUserEmail.textContent = res.email || 'Hesap Bağlandı';
        chrome.storage.local.set({ gdrive_auto_sync: true });
        toggleDriveSync.checked = true;
        driveDetails.style.display = 'flex';
      } else {
        btnDriveAuth.textContent = 'Tekrar Dene';
        btnDriveAuth.classList.remove('connected');
        alert('Google Drive bağlantı hatası: ' + (res?.error || 'Yetkilendirme yapılamadı'));
      }
    });
  });

  // Listen for background updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'annotations-updated') {
      refreshAnnotations();
    }
  });

  // Initial load
  refreshAnnotations();
  initDriveStatus();
});
