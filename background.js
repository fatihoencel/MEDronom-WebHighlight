// MEDronom - WebHighlight - Background Service Worker

try {
  importScripts('config.js');
} catch (e) {
  console.warn('[WebMark] config.js yüklenemedi:', e);
}

// Kalıcı config.js ayarlarını storage'a senkronize et
function syncConfigToStorage() {
  if (typeof WEBMARK_CONFIG !== 'undefined') {
    chrome.storage.local.get(['gdrive_webhook_url', 'gdrive_target_folder', 'gdrive_auto_sync'], (res) => {
      const updates = {};
      if (!res.gdrive_webhook_url && WEBMARK_CONFIG.WEBHOOK_URL) {
        updates.gdrive_webhook_url = WEBMARK_CONFIG.WEBHOOK_URL;
      }
      if (!res.gdrive_target_folder && WEBMARK_CONFIG.TARGET_FOLDER) {
        updates.gdrive_target_folder = WEBMARK_CONFIG.TARGET_FOLDER;
      }
      if (res.gdrive_auto_sync === undefined && WEBMARK_CONFIG.AUTO_SYNC !== undefined) {
        updates.gdrive_auto_sync = WEBMARK_CONFIG.AUTO_SYNC;
      }
      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates);
      }
    });
  }
}
syncConfigToStorage();
chrome.runtime.onInstalled.addListener(() => {
  syncConfigToStorage();
});
chrome.runtime.onStartup.addListener(() => {
  syncConfigToStorage();
});

// Process automatic Drive sync for highlighted note / PDF
async function handleDrivePdfSync({ siteName, title, pageUrl, pdfBase64, noteText, noteIndex, totalNotes }) {
  try {
    const config = await chrome.storage.local.get(['gdrive_webhook_url', 'gdrive_target_folder', 'gdrive_access_token']);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const cleanTitle = (title || 'Not').replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ\s_-]/g, '').trim().substring(0, 30) || 'Sayfa_Alintisi';
    const indexPart = noteIndex ? `_Not-${noteIndex}` : '';
    const fileName = `${cleanTitle}${indexPart}_${dateStr}_${timeStr}.pdf`;
    const cleanSiteName = siteName || 'Genel';

    // 1. Preferred & Permanent: Google Apps Script Webhook
    const webhookUrl = (config.gdrive_webhook_url && config.gdrive_webhook_url.trim()) ||
                       (typeof WEBMARK_CONFIG !== 'undefined' ? WEBMARK_CONFIG.WEBHOOK_URL : '');
    const targetFolder = (config.gdrive_target_folder && config.gdrive_target_folder.trim()) ||
                         (typeof WEBMARK_CONFIG !== 'undefined' ? WEBMARK_CONFIG.TARGET_FOLDER : '');

    if (webhookUrl) {
      const postRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          folderId: targetFolder,
          siteName: cleanSiteName,
          fileName: fileName,
          pdfBase64: pdfBase64,
          pageUrl: pageUrl,
          title: title,
          noteText: noteText
        })
      });

      if (!postRes.ok) {
        throw new Error(`Webhook yanıt vermedi (HTTP ${postRes.status})`);
      }

      const resJson = await postRes.json();
      if (resJson && resJson.success) {
        return {
          success: true,
          fileId: resJson.fileId,
          folder: resJson.folder || `Drive / ${cleanSiteName}`,
          fileName: resJson.fileName || fileName
        };
      } else {
        throw new Error(resJson?.error || 'Webhook kaydı başarısız oldu');
      }
    }

    // Webhook tanımlı değilse Drive'a gönderilemez
    return { success: false, error: 'Drive bağlantısı ayarlanmamış. Ayarlar bölümünden Webhook adresini girin.' };

  } catch (error) {
    console.error('[WebMark] Drive upload error:', error);
    return { success: false, error: error.message };
  }
}

// =========================================================================
// Context Menu & Commands Setup
// =========================================================================

chrome.runtime.onInstalled.addListener(() => {
  // Create Context Menus
  chrome.contextMenus.create({
    id: "webmark-parent",
    title: "MEDronom - WebHighlight",
    contexts: ["selection", "page"]
  });

  chrome.contextMenus.create({
    id: "webmark-highlight-yellow",
    parentId: "webmark-parent",
    title: "🖍️ Sarı ile Vurgula",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "webmark-highlight-green",
    parentId: "webmark-parent",
    title: "🖍️ Yeşil ile Vurgula",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "webmark-highlight-pink",
    parentId: "webmark-parent",
    title: "🖍️ Pembe ile Vurgula",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "webmark-separator-1",
    parentId: "webmark-parent",
    type: "separator",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "webmark-underline-solid",
    parentId: "webmark-parent",
    title: "➖ Düz Altı Çizili Yap",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "webmark-underline-wavy",
    parentId: "webmark-parent",
    title: "〰️ Dalgalı Altı Çizili Yap",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "webmark-separator-2",
    parentId: "webmark-parent",
    type: "separator",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "webmark-export-selection-pdf",
    parentId: "webmark-parent",
    title: "📄 Seçimi PDF Olarak İndir",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "webmark-toggle-picker",
    parentId: "webmark-parent",
    title: "🎯 PDF için Bölge Seçici Modunu Başlat",
    contexts: ["page", "selection"]
  });
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === "webmark-highlight-yellow") {
    chrome.tabs.sendMessage(tab.id, { action: "apply-style", styleType: "highlight", color: "#fef08a" });
  } else if (info.menuItemId === "webmark-highlight-green") {
    chrome.tabs.sendMessage(tab.id, { action: "apply-style", styleType: "highlight", color: "#bbf7d0" });
  } else if (info.menuItemId === "webmark-highlight-pink") {
    chrome.tabs.sendMessage(tab.id, { action: "apply-style", styleType: "highlight", color: "#fbcfe8" });
  } else if (info.menuItemId === "webmark-underline-solid") {
    chrome.tabs.sendMessage(tab.id, { action: "apply-style", styleType: "underline-solid", color: "#3b82f6" });
  } else if (info.menuItemId === "webmark-underline-wavy") {
    chrome.tabs.sendMessage(tab.id, { action: "apply-style", styleType: "underline-wavy", color: "#ef4444" });
  } else if (info.menuItemId === "webmark-export-selection-pdf") {
    chrome.tabs.sendMessage(tab.id, { action: "export-selection-pdf" });
  } else if (info.menuItemId === "webmark-toggle-picker") {
    chrome.tabs.sendMessage(tab.id, { action: "toggle-area-picker" });
  }
});

// Handle Keyboard Shortcuts
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0] || !tabs[0].id) return;
    const tabId = tabs[0].id;

    if (command === "toggle-highlight") {
      chrome.tabs.sendMessage(tabId, { action: "apply-style", styleType: "highlight", color: "#fef08a" });
    } else if (command === "toggle-wavy") {
      chrome.tabs.sendMessage(tabId, { action: "apply-style", styleType: "underline-wavy", color: "#ef4444" });
    } else if (command === "toggle-area-picker") {
      chrome.tabs.sendMessage(tabId, { action: "toggle-area-picker" });
    }
  });
});

// PDF'i sayfadan bağımsız, temiz bir offscreen belgede üret (site CSS'i / içerik script ortamı PDF'i boş bırakıyordu)
let offscreenCreating = null;
async function ensureOffscreen() {
  const url = chrome.runtime.getURL('offscreen.html');
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (existing.length) return;
  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Vurgulanan metinden PDF üretmek için DOM ve canvas gerekir.'
    }).finally(() => { offscreenCreating = null; });
  }
  await offscreenCreating;
}

async function renderAndUpload({ html, ...meta }) {
  await ensureOffscreen();
  const rendered = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'render-pdf', html });
  if (!rendered || !rendered.success) {
    return { success: false, error: (rendered && rendered.error) || 'PDF üretilemedi' };
  }
  return handleDrivePdfSync({ ...meta, pdfBase64: rendered.pdfBase64 });
}

// Handle Runtime Messages (Drive Auth & Uploads)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'gdrive-render-upload') {
    renderAndUpload(request.data).then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async
  } else if (request.action === 'gdrive-upload-pdf') {
    handleDrivePdfSync(request.data).then(res => {
      sendResponse(res);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async
  } else if (request.action === 'gdrive-status') {
    chrome.storage.local.get(['gdrive_auto_sync', 'gdrive_webhook_url', 'gdrive_target_folder'], (res) => {
      const webhookUrl = (res.gdrive_webhook_url && res.gdrive_webhook_url.trim()) ||
                         (typeof WEBMARK_CONFIG !== 'undefined' ? WEBMARK_CONFIG.WEBHOOK_URL : '');
      const targetFolder = (res.gdrive_target_folder && res.gdrive_target_folder.trim()) ||
                           (typeof WEBMARK_CONFIG !== 'undefined' ? WEBMARK_CONFIG.TARGET_FOLDER : '');
      const isWebhookActive = !!webhookUrl;
      const isConnected = isWebhookActive;
      sendResponse({
        connected: isConnected,
        isWebhook: isWebhookActive,
        webhookUrl: webhookUrl,
        targetFolder: targetFolder,
        autoSync: res.gdrive_auto_sync !== false && isConnected
      });
    });
    return true;
  } else if (request.action === 'gdrive-test-connection') {
    (async () => {
      try {
        const config = await chrome.storage.local.get(['gdrive_webhook_url', 'gdrive_target_folder']);
        const webhookUrl = (config.gdrive_webhook_url && config.gdrive_webhook_url.trim()) ||
                           (typeof WEBMARK_CONFIG !== 'undefined' ? WEBMARK_CONFIG.WEBHOOK_URL : '');
        if (webhookUrl) {
          const testRes = await fetch(webhookUrl, { method: 'GET' });
          if (!testRes.ok) {
            throw new Error(`Webhook HTTP ${testRes.status} hatası döndürdü.`);
          }
          const testData = await testRes.json();
          sendResponse({
            success: true,
            message: `Webhook bağlantısı başarılı! ${testData.message || 'Kalıcı kayıt sistemi aktif.'}`
          });
          return;
        }

        throw new Error('Webhook adresi ayarlanmamış. Önce Webhook URL girin.');
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

