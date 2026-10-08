# Privacy Policy for MEDronom - WebHighlight

**Last Updated:** October 7, 2026

**MEDronom - WebHighlight** ("the Extension", "we", "our", or "us") is committed to protecting your privacy. This Privacy Policy outlines how our Google Chrome Extension handles and protects your data.

---

## 1. Overview and Core Philosophy

MEDronom - WebHighlight is designed with a **privacy-first, client-side** architecture. We do not operate remote tracking servers, databases, or analytics engines. All highlighting, PDF generation, and styling operations are processed locally inside your browser.

---

## 2. Information We Handle and How It Is Used

### A. Local Annotations & Highlighting
- **What is processed:** The text you select, highlights (colors), underlines, and custom font preferences.
- **Where it is stored:** Stored strictly locally on your device using `chrome.storage.local`.
- **Who has access:** Only you. We do not transmit your highlighted notes, web history, or reading lists to any third party.

### B. Google Drive Integration (OAuth 2.0)
- **What is accessed:** The extension requests permission to upload generated PDF documents directly to your own Google Drive folder (`Drive'ım -> WebMark -> [Site-URL]`).
- **Authorization:** Authentication is handled securely via official Google OAuth 2.0 (`https://www.googleapis.com/auth/drive.file`).
- **Scope limitation:** The extension only has access to files and folders created by itself. It **cannot** read, modify, or delete any other files in your personal Google Drive.
- **Data flow:** PDF files created from your highlighted quotes are sent directly from your browser to Google Drive API endpoints (`googleapis.com`). No intermediary servers are involved.

---

## 3. Permissions Justification

| Permission | Purpose |
| :--- | :--- |
| `storage` | To save your highlights, notes, and preferences locally in your browser. |
| `activeTab` / `<all_urls>` | To allow text selection, highlighting, and PDF capture on the active web page you choose. |
| `contextMenus` | To provide quick right-click options for highlighting and PDF export. |
| `identity` | To facilitate direct, secure authentication with your Google Drive account. |
| `scripting` | To render the floating highlighter toolbar and interactive area picker on web pages. |

---

## 4. Third-Party Sharing and Data Selling

- We **DO NOT** sell, rent, monetize, or trade any user data.
- We **DO NOT** collect personal identifiable information (PII) such as your name, email address, IP address, or passwords.
- We **DO NOT** inject advertisements or use tracking pixels/cookies.

---

## 5. Security of Your Data

All data communication between the extension and Google Drive occurs exclusively over encrypted HTTPS connections directly to Google Cloud services. Your OAuth tokens are stored securely within Chrome's identity subsystem.

---

## 6. Open Source and Transparency

MEDronom - WebHighlight is built transparently. Users can inspect the open-source codebase to verify that our permissions and storage strictly adhere to this Privacy Policy.

---

## 7. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. Any modifications will be posted to this repository with an updated revision date.

---

## 8. Contact

If you have questions or feedback regarding this Privacy Policy, you can open an issue on the GitHub repository or contact the developer directly:
- **Developer:** Fatih Öncel
- **Email:** fatihoencel@gmail.com
- **Repository:** https://github.com/fatihoncel/WebMark-PDF-Studio
