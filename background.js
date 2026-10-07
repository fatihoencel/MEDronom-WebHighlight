// WebMark & PDF Studio - Background Service Worker

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

// Interactive OAuth Flow via chrome.identity.launchWebAuthFlow
async function getAuthTokenViaWebFlow(interactive = true) {
  const stored = await chrome.storage.local.get(['gdrive_access_token', 'gdrive_user_email']);
  if (stored.gdrive_access_token) {
    return stored.gdrive_access_token;
  }

  if (!interactive) {
    throw new Error('Authentication required');
  }

  // Google OAuth configuration
  const redirectUri = chrome.identity.getRedirectURL();
  
  // Storage check for custom clientId if provided by user
  const cfg = await chrome.storage.local.get(['gdrive_client_id']);
  const clientId = cfg.gdrive_client_id ? cfg.gdrive_client_id.trim() : '';

  if (!clientId) {
    throw new Error('Lütfen önce eklenti menüsünden geçerli bir Google Client ID kaydedin.');
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `response_type=token&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email')}&` +
    `prompt=consent`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        reject(new Error(chrome.runtime.lastError?.message || 'Login cancelled'));
        return;
      }

      // Parse token from hash fragment
      const params = new URLSearchParams(new URL(responseUrl).hash.substring(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        cachedAuthToken = accessToken;
        chrome.storage.local.set({ gdrive_access_token: accessToken });
        
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
        reject(new Error('Access token missing in response'));
      }
    });
  });
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
  const createData = await createRes.json();
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
    throw new Error(`Upload failed: ${errText}`);
  }

  return await res.json();
}

// Process automatic Drive sync for highlighted note / PDF
async function handleDrivePdfSync({ siteName, title, pageUrl, pdfBase64, noteText, noteIndex, totalNotes }) {
  try {
    const token = await getAuthToken(true);
    
    // 1. Root Folder 1: "Uygulama verileri" in root (Drive'ım)
    const appDataFolderId = await getOrCreateFolder(token, 'Uygulama verileri');
    
    // 2. Sub Folder 2: "MEDronom Web Highlighter" inside "Uygulama verileri"
    const medronomFolderId = await getOrCreateFolder(token, 'MEDronom Web Highlighter', appDataFolderId);
    
    // 3. Sub Folder 3: Site URL / Hostname (e.g. "medium.com", "wikipedia.org") inside "MEDronom Web Highlighter"
    const cleanSiteName = siteName || 'Genel';
    const siteFolderId = await getOrCreateFolder(token, cleanSiteName, medronomFolderId);
    
    // 4. File Name formatting:
    // When multiple highlights are made on the same page, include highlight counter (#1, #2, etc.) & timestamp
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const cleanTitle = (title || 'Not').replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ\s_-]/g, '').trim().substring(0, 28) || 'Sayfa_Alintisi';
    const indexPart = noteIndex ? `_Not-${noteIndex}` : '';
    const fileName = `${cleanTitle}${indexPart}_${dateStr}_${timeStr}.pdf`;

    // 5. Upload PDF
    const result = await uploadPdfToDrive(token, siteFolderId, fileName, pdfBase64);
    return { success: true, fileId: result.id, folder: `Uygulama verileri/MEDronom Web Highlighter/${cleanSiteName}`, fileName };
  } catch (error) {
    console.error('Drive upload error:', error);
    // If token invalid, reset cache
    cachedAuthToken = null;
    chrome.storage.local.remove(['gdrive_access_token']);
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
    title: "WebMark & PDF Studio",
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

// Handle Runtime Messages (Drive Auth & Uploads)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'gdrive-upload-pdf') {
    handleDrivePdfSync(request.data).then(res => {
      sendResponse(res);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async
  } else if (request.action === 'gdrive-auth') {
    getAuthToken(true).then(token => {
      chrome.storage.local.get(['gdrive_user_email'], (d) => {
        sendResponse({ success: true, email: d.gdrive_user_email || 'Bağlandı' });
      });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  } else if (request.action === 'gdrive-status') {
    chrome.storage.local.get(['gdrive_access_token', 'gdrive_user_email', 'gdrive_auto_sync'], (res) => {
      sendResponse({
        connected: !!res.gdrive_access_token,
        email: res.gdrive_user_email || '',
        autoSync: !!res.gdrive_auto_sync
      });
    });
    return true;
  }
});

