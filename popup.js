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

  // Ana görünüm <-> Ayarlar görünümü
  const mainView = document.getElementById('mainView');
  const settingsView = document.getElementById('settingsView');
  function showSettings(on) {
    settingsView.hidden = !on;
    mainView.hidden = on;
  }
  document.getElementById('btnSettings').addEventListener('click', () => showSettings(settingsView.hidden));
  document.getElementById('btnBack').addEventListener('click', () => showSettings(false));

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
          // İçerik script'i bu sekmede yok (eklenti yeni yüklendi/güncellendi ya da özel bir sayfa): sayfayı yenilemek gerekir
          const badge = document.getElementById('statusBadge');
          if (badge) badge.textContent = 'Sayfayı yenileyin';
          if (callback) callback(null);
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
        const pickerLabel = btnTogglePicker.querySelector('.btn-label');
        if (response.isPickerActive) {
          pickerLabel.textContent = "Bölge Seçiciyi Durdur";
          btnTogglePicker.classList.add('active');
        } else {
          pickerLabel.textContent = "Bölge Seçiciyi Başlat";
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

      const iconId = { 'underline-solid': 'i-underline', 'underline-wavy': 'i-wavy', font: 'i-font' }[item.type] || 'i-marker';

      itemEl.innerHTML = `
        <div class="annotation-item-left">
          <span class="annotation-type-badge"><svg class="sk"><use href="#${iconId}"/></svg></span>
          <span class="annotation-text" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</span>
        </div>
        <button class="annotation-del-btn" data-id="${item.id}" title="Vurgulamayı Sil"><svg class="sk"><use href="#i-close"/></svg></button>
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

  // Aç/kapat düğmeleri (aynı anda yalnızca biri açık): açıkken seçilen tüm metinlere otomatik uygulanır
  const AUTO_MODES = [
    { btn: btnQuickHighlight, mode: 'highlight' },
    { btn: btnQuickWavy, mode: 'underline-wavy' },
    { btn: btnQuickSolid, mode: 'underline-solid' }
  ];

  function renderAutoMode(active) {
    AUTO_MODES.forEach(({ btn, mode }) => {
      const on = mode === active;
      btn.setAttribute('aria-pressed', String(on));
      btn.querySelector('.tool-state').textContent = on ? 'Açık' : 'Kapalı';
    });
  }

  chrome.storage.local.get(['auto_mode'], (res) => renderAutoMode(res && res.auto_mode));

  AUTO_MODES.forEach(({ btn, mode }) => {
    btn.addEventListener('click', () => {
      const turnOn = btn.getAttribute('aria-pressed') !== 'true';
      const next = turnOn ? mode : null;
      chrome.storage.local.set({ auto_mode: next }, () => renderAutoMode(next));
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
  const driveStatusText = document.getElementById('driveStatusText');

  // =========================================================================
  // Google Drive & Webhook Setup
  // =========================================================================

  const inputWebhookUrl = document.getElementById('inputWebhookUrl');
  const btnSaveWebhook = document.getElementById('btnSaveWebhook');
  const inputTargetFolder = document.getElementById('inputTargetFolder');
  const btnSaveTargetFolder = document.getElementById('btnSaveTargetFolder');
  const btnTestWebhook = document.getElementById('btnTestWebhook');
  const btnToggleGuide = document.getElementById('btnToggleGuide');
  const webhookGuideBox = document.getElementById('webhookGuideBox');
  const btnCopyScriptCode = document.getElementById('btnCopyScriptCode');


  const APPS_SCRIPT_CODE = `// WebMark PDF Studio - Google Drive Kalıcı Webhook
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // 1. Hedef Klasörü Belirle (Özel Klasör Linki/ID'si veya varsayılan WebMark)
    let targetFolder;
    let customFolderId = (data.folderId || "").trim();
    
    // Link formatından ID ayıkla (örn: https://drive.google.com/drive/folders/1leiiBdzii...)
    const folderMatch = customFolderId.match(/folders\\/([a-zA-Z0-9_-]+)/);
    if (folderMatch) {
      customFolderId = folderMatch[1];
    }
    
    if (customFolderId) {
      targetFolder = DriveApp.getFolderById(customFolderId);
    } else {
      const defaultFolders = DriveApp.getFoldersByName("WebMark");
      if (defaultFolders.hasNext()) {
        targetFolder = defaultFolders.next();
      } else {
        targetFolder = DriveApp.createFolder("WebMark");
      }
    }

    // 2. Site adına göre alt klasör oluştur/bul
    let saveFolder = targetFolder;
    const siteName = (data.siteName || "Genel").trim();
    if (siteName) {
      const subFolders = saveFolder.getFoldersByName(siteName);
      if (subFolders.hasNext()) {
        saveFolder = subFolders.next();
      } else {
        saveFolder = saveFolder.createFolder(siteName);
      }
    }

    // 3. Base64 PDF'i çöz ve dosyayı oluştur
    const decodedBytes = Utilities.base64Decode(data.pdfBase64);
    const fileName = data.fileName || ("Not_" + new Date().getTime() + ".pdf");
    const blob = Utilities.newBlob(decodedBytes, "application/pdf", fileName);
    const file = saveFolder.createFile(blob);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileId: file.getId(),
      fileName: file.getName(),
      folder: targetFolder.getName() + "/" + siteName,
      fileUrl: file.getUrl()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "WebMark PDF Webhook Hazır ve Çalışıyor!"
  })).setMimeType(ContentService.MimeType.JSON);
}`;

  function initDriveStatus() {
    chrome.storage.local.get(['gdrive_webhook_url', 'gdrive_target_folder', 'gdrive_auto_sync'], (res) => {
      const webhook = (res && res.gdrive_webhook_url) || (typeof WEBMARK_CONFIG !== 'undefined' ? WEBMARK_CONFIG.WEBHOOK_URL : '');
      const folder = (res && res.gdrive_target_folder) || (typeof WEBMARK_CONFIG !== 'undefined' ? WEBMARK_CONFIG.TARGET_FOLDER : '');

      if (inputWebhookUrl && webhook) inputWebhookUrl.value = webhook;
      if (inputTargetFolder && folder) inputTargetFolder.value = folder;

      const driveFolderLink = document.getElementById('driveFolderLink');
      if (driveFolderLink && folder) {
        let folderUrl = folder.trim();
        if (!folderUrl.startsWith('http')) {
          folderUrl = `https://drive.google.com/drive/folders/${folderUrl}`;
        }
        driveFolderLink.href = folderUrl;
      }
    });

    chrome.runtime.sendMessage({ action: 'gdrive-status' }, (res) => {
      if (!res) return;
      const connected = !!res.connected;

      if (toggleDriveSync) {
        toggleDriveSync.checked = !!res.autoSync;
        // Bağlı değilken alanlar düzenlenebilir kalır (webhook adresi girilebilsin)
        if (driveDetails) driveDetails.classList.toggle('is-disabled', connected && !res.autoSync);
      }

      // Bağlantı durumu: gerçeği göster
      const dot = document.querySelector('.status-indicator-dot');
      const stateText = document.querySelector('.status-badge-text');
      const folderLink = document.getElementById('driveFolderLink');
      const testBtn = document.getElementById('btnTestWebhook');
      if (dot) dot.style.background = connected ? '' : '#D9534F';
      if (stateText) {
        stateText.textContent = connected ? 'Bağlı' : 'Bağlı değil';
        stateText.style.color = connected ? '' : '#B9473F';
      }
      if (folderLink) folderLink.style.display = connected && res.targetFolder ? '' : 'none';
      if (testBtn) testBtn.style.display = connected ? '' : 'none';
      const settingsBox = document.querySelector('.drive-settings-dropdown');
      if (settingsBox && !connected) settingsBox.open = true;

      if (driveStatusText) {
        driveStatusText.textContent = connected
          ? 'Notlar otomatik olarak klasörünüze aktarılır.'
          : 'Henüz ayarlanmadı. Aşağıya Google Apps Script web adresinizi girin.';
      }
    });
  }

  // Save Webhook URL
  if (btnSaveWebhook && inputWebhookUrl) {
    btnSaveWebhook.addEventListener('click', () => {
      const url = inputWebhookUrl.value.trim();
      if (!url) {
        alert('Lütfen geçerli bir Google Apps Script Webhook URL girin (https://script.google.com/macros/s/.../exec)');
        return;
      }
      chrome.storage.local.set({ gdrive_webhook_url: url, gdrive_auto_sync: true }, () => {
        btnSaveWebhook.textContent = 'Kaydedildi ✓';
        if (toggleDriveSync) toggleDriveSync.checked = true;
        setTimeout(() => { btnSaveWebhook.textContent = 'Kaydet'; }, 2000);
        initDriveStatus();
      });
    });
  }

  // Save Target Folder
  if (btnSaveTargetFolder && inputTargetFolder) {
    btnSaveTargetFolder.addEventListener('click', () => {
      const folderVal = inputTargetFolder.value.trim();
      chrome.storage.local.set({ gdrive_target_folder: folderVal }, () => {
        btnSaveTargetFolder.textContent = 'Kaydedildi ✓';
        setTimeout(() => { btnSaveTargetFolder.textContent = 'Kaydet'; }, 2000);
      });
    });
  }

  // Test Webhook Connection
  if (btnTestWebhook) {
    btnTestWebhook.addEventListener('click', () => {
      const testLabel = btnTestWebhook.querySelector('.btn-label');
      testLabel.textContent = 'Test ediliyor...';
      chrome.runtime.sendMessage({ action: 'gdrive-test-connection' }, (res) => {
        testLabel.textContent = 'Test Et';
        if (res && res.success) {
          alert('✅ ' + res.message);
        } else {
          alert('❌ Bağlantı Testi Başarısız: ' + (res?.error || 'Lütfen Webhook URL adresinizi kontrol edin.'));
        }
      });
    });
  }

  // Toggle Setup Guide Box
  if (btnToggleGuide && webhookGuideBox) {
    btnToggleGuide.addEventListener('click', () => {
      const isHidden = webhookGuideBox.style.display === 'none';
      webhookGuideBox.style.display = isHidden ? 'block' : 'none';
    });
  }

  // Copy Script Code
  if (btnCopyScriptCode) {
    btnCopyScriptCode.addEventListener('click', () => {
      navigator.clipboard.writeText(APPS_SCRIPT_CODE).then(() => {
        btnCopyScriptCode.textContent = 'Kopyalandı ✓ (Şimdi script.google.com içine yapıştırın)';
        setTimeout(() => {
          btnCopyScriptCode.textContent = '📋 Google Apps Script Kodunu Kopyala';
        }, 3000);
      });
    });
  }

  // Auto Sync Toggle
  if (toggleDriveSync) {
    toggleDriveSync.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      chrome.storage.local.set({ gdrive_auto_sync: isEnabled });
      if (driveStatusText) {
        driveStatusText.textContent = isEnabled
          ? 'Notlar otomatik olarak klasörünüze aktarılır.'
          : 'Otomatik Drive kaydı duraklatıldı.';
      }
      if (driveDetails) {
        driveDetails.classList.toggle('is-disabled', !isEnabled);
      }
    });
  }

  // Open Drive Folder Link directly
  const driveFolderLink = document.getElementById('driveFolderLink');
  if (driveFolderLink) {
    driveFolderLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (driveFolderLink.href && !driveFolderLink.href.endsWith('#')) {
        chrome.tabs.create({ url: driveFolderLink.href });
      }
    });
  }

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
