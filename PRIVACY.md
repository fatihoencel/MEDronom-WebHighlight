# Privacy Policy for MEDronom - WebHighlight

**Last Updated:** October 9, 2026

MEDronom - WebHighlight ("the Extension") lets you highlight and underline text on web pages and save the parts you choose as PDF files. This policy explains what data the Extension handles. The developer does not operate any server and **receives no data from you**.

## 1. Data the Extension handles

**Highlights (stored locally).** When you highlight or underline text, the Extension stores the selected text, its color and style, a short piece of surrounding text, and the page address in `chrome.storage.local` on your device. This lets your highlights reappear when you reopen the page. You can delete them at any time from the extension popup ("Hepsini Temizle"); uninstalling the Extension removes all local data.

**Optional Google Drive saving (off unless you set it up).** If you enter your own Google Apps Script web app address and turn on Drive saving in Settings, then for each highlight the Extension creates a PDF in your browser (the highlighted text, a few lines before it and the sentence after it, page title and address) and sends it to **your own** Apps Script address. That script, which you own, saves the PDF into **your** Google Drive folder. The data travels only between your browser and your own Google account (script.google.com) over HTTPS. Nothing is sent to the developer or any third party. If you do not set this up, no data leaves your browser.

## 2. What we do not do

- We do not sell, rent or share user data, and do not use it for advertising, credit or any unrelated purpose.
- We do not collect your name, email, IP address, browsing history or passwords, and include no analytics, tracking or advertising code.
- We do not load or run remote code. The PDF library is bundled inside the Extension.

## 3. Permissions and why they are needed

| Permission | Purpose |
| :--- | :--- |
| `storage` | Save your highlights, settings and the on/off state of the highlight switches locally. |
| `activeTab` | Act on the page you are using when you open the popup or use a shortcut. |
| `contextMenus` | Offer highlight, underline and PDF options in the right-click menu. |
| `offscreen` | Create PDF files in a clean background document (a DOM and canvas are required). |
| Content script on all pages | Highlight tools must work on any page you open. The Extension only reads the text you select and a few surrounding lines. |
| Host access to `script.google.com` and `script.googleusercontent.com` | Only for the optional Google Drive saving described above. |

## 4. Security

All communication with Google happens over encrypted HTTPS connections. The Extension stores no passwords and requests no Google account permissions.

## 5. Changes to this policy

Updates are published in this repository with a new revision date.

## 6. Contact

- **Developer:** Fatih Öncel
- **Email:** fatihoencel@gmail.com
- **Repository:** https://github.com/fatihoencel/MEDronom-WebHighlight

---

## Gizlilik Özeti (Türkçe)

MEDronom - WebHighlight, vurgularınızı yalnızca tarayıcınızda (`chrome.storage.local`) saklar. Geliştiriciye veri gönderilmez; reklam, analiz veya izleme yoktur; uzaktan kod çalıştırılmaz. İsteğe bağlı Google Drive kaydını **siz** kendi Apps Script adresinizi girerek açarsınız: bu durumda PDF yalnızca sizin Google hesabınızdaki klasöre gider. Kapalıyken hiçbir veri tarayıcınızdan çıkmaz. Vurguları popup'tan silebilir, eklentiyi kaldırarak tüm yerel verileri silebilirsiniz.
