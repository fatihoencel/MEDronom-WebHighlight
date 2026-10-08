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

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file'
];

let cachedAuthToken = null;

// =========================================================================
// Google Drive API Helpers
// =========================================================================

// Get OAuth Token using chrome.identity
async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    // If token exists and works
    if (cachedAuthToken) {
      resolve(cachedAuthToken);
      return;
    }

    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        // Fallback for unpacked extension or when manifest oauth2 is not pre-registered:
        // Use launchWebAuthFlow with standard Google OAuth2
        getAuthTokenViaWebFlow(interactive).then(resolve).catch(reject);
      } else {
        cachedAuthToken = token;
        resolve(token);
      }
    });
  });
}

// OAuth Flow via chrome.identity.launchWebAuthFlow with silent renewal
async function getAuthTokenViaWebFlow(interactive = true) {
  const stored = await chrome.storage.local.get(['gdrive_access_token', 'gdrive_user_email', 'gdrive_client_id']);
  
  if (stored.gdrive_access_token) {
    // Validate stored token with Google tokeninfo
    try {
      const checkRes = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${stored.gdrive_access_token}`);
      if (checkRes.ok) {
        cachedAuthToken = stored.gdrive_access_token;
        return stored.gdrive_access_token;
      }
    } catch (e) {
      // Network issue or offline - assume token is temporarily usable
      cachedAuthToken = stored.gdrive_access_token;
      return stored.gdrive_access_token;
    }
    // Token is expired. Don't immediately wipe settings; try silent renewal below
    cachedAuthToken = null;
  }

  // Check if client ID is configured
  const clientId = stored.gdrive_client_id ? stored.gdrive_client_id.trim() : '';
  if (!clientId) {
    throw new Error('Lütfen önce eklenti menüsünden geçerli bir Google Client ID kaydedin.');
  }

  const redirectUri = chrome.identity.getRedirectURL();

  // Helper to execute launchWebAuthFlow
  const runAuthFlow = (isInteractive) => {
    const promptVal = isInteractive ? 'consent' : 'none';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `response_type=token&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email')}&` +
      `prompt=${promptVal}`;

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: isInteractive }, (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          reject(new Error(chrome.runtime.lastError?.message || 'Yetkilendirme yapılamadı'));
          return;
        }

        try {
          const urlObj = new URL(responseUrl);
          const hashStr = urlObj.hash.startsWith('#') ? urlObj.hash.substring(1) : urlObj.hash;
          const params = new URLSearchParams(hashStr);
          const accessToken = params.get('access_token');
          if (accessToken) {
            cachedAuthToken = accessToken;
            chrome.storage.local.set({ gdrive_access_token: accessToken, gdrive_auto_sync: true });
            
            // Fetch user email
            fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            }).then(r => r.json()).then(u => {
              if (u.email) {
                chrome.storage.local.set({ gdrive_user_email: u.email });
              }
            }).catch(() => {});

            resolve(accessToken);
          } else {
            const err = params.get('error') || 'Access token bulunamadı';
            reject(new Error(`OAuth Hatası: ${err}`));
          }
        } catch (parseErr) {
          reject(new Error('Yönlendirme ayrıştırma hatası: ' + parseErr.message));
        }
      });
    });
  };

  // If interactive is requested, open dialog directly
  if (interactive) {
    return await runAuthFlow(true);
  }

  // Background non-interactive: try silent renewal first
  try {
    return await runAuthFlow(false);
  } catch (silentErr) {
    console.warn('[WebMark] Silent token renewal failed:', silentErr.message);
    throw new Error('Google Drive oturum süresi dolmuş. Lütfen eklenti simgesinden tekrar bağlanın.');
  }
}

// Find or Create Folder in Google Drive
async function getOrCreateFolder(token, folderName, parentId = null) {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`Klasör sorgulama hatası (${searchRes.status}): ${errText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder'
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Klasör oluşturma hatası (${createRes.status}): ${errText}`);
  }

  const createData = await createRes.json();
  if (!createData.id) {
    throw new Error('Klasör oluşturuldu ancak klasör ID alınamadı');
  }
  return createData.id;
}

// Upload PDF binary / base64 directly to Drive folder
async function uploadPdfToDrive(token, folderId, fileName, pdfBase64) {
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/pdf'
  };

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  // Decode Base64 to Uint8Array
  const byteChars = atob(pdfBase64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);

  const multipartRequestBody = new Blob([
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delimiter,
    'Content-Type: application/pdf\r\n',
    'Content-Transfer-Encoding: binary\r\n\r\n',
    byteArray,
    closeDelim
  ], { type: 'multipart/related; boundary=' + boundary });

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: multipartRequestBody
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`PDF yükleme hatası (${res.status}): ${errText}`);
  }

  return await res.json();
}

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

    // 2. Fallback: Google OAuth API
    const token = await getAuthToken(false);
    const rootFolderId = await getOrCreateFolder(token, 'WebMark');
    const siteFolderId = await getOrCreateFolder(token, cleanSiteName, rootFolderId);
    const result = await uploadPdfToDrive(token, siteFolderId, fileName, pdfBase64);
    return { success: true, fileId: result.id, folder: `WebMark/${cleanSiteName}`, fileName };

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
  } else if (request.action === 'gdrive-auth') {
    getAuthToken(true).then(token => {
      chrome.storage.local.set({ gdrive_auto_sync: true }, () => {
        chrome.storage.local.get(['gdrive_user_email'], (d) => {
          sendResponse({ success: true, email: d.gdrive_user_email || 'Bağlandı' });
        });
      });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  } else if (request.action === 'gdrive-status') {
    chrome.storage.local.get(['gdrive_access_token', 'gdrive_user_email', 'gdrive_auto_sync', 'gdrive_webhook_url', 'gdrive_target_folder', 'gdrive_client_id'], (res) => {
      const webhookUrl = (res.gdrive_webhook_url && res.gdrive_webhook_url.trim()) ||
                         (typeof WEBMARK_CONFIG !== 'undefined' ? WEBMARK_CONFIG.WEBHOOK_URL : '');
      const targetFolder = (res.gdrive_target_folder && res.gdrive_target_folder.trim()) ||
                           (typeof WEBMARK_CONFIG !== 'undefined' ? WEBMARK_CONFIG.TARGET_FOLDER : '');
      const isWebhookActive = !!webhookUrl;
      const isOAuthActive = !!(res.gdrive_access_token || res.gdrive_user_email);
      const isConnected = isWebhookActive || isOAuthActive;
      sendResponse({
        connected: isConnected,
        isWebhook: isWebhookActive,
        webhookUrl: webhookUrl,
        targetFolder: targetFolder,
        email: isWebhookActive ? 'Webhook Aktif' : (res.gdrive_user_email || ''),
        autoSync: res.gdrive_auto_sync !== false && isConnected,
        hasClientId: !!(res.gdrive_client_id && res.gdrive_client_id.trim())
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

        // Fallback to OAuth test
        const token = await getAuthToken(false);
        const folderId = await getOrCreateFolder(token, 'WebMark');
        sendResponse({ success: true, message: `OAuth bağlantısı başarılı! "WebMark" klasörüne erişildi.` });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  } else if (request.action === 'gdrive-disconnect') {
    cachedAuthToken = null;
    chrome.storage.local.remove(['gdrive_access_token', 'gdrive_user_email', 'gdrive_auto_sync'], () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

