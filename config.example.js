// MEDronom - WebHighlight - Yapılandırma şablonu
// Bu dosyayı `config.js` adıyla kopyalayın. `config.js` .gitignore'dadır, gizli bilgiler repoya girmez.
// Boş bırakırsanız eklenti yine çalışır; Drive ayarları Ayarlar bölümünden de girilebilir.

const WEBMARK_CONFIG = {
  // Google Apps Script Web Uygulaması URL'si (exec ile biten adres)
  WEBHOOK_URL: '',

  // Notların kaydedileceği Google Drive klasör bağlantısı veya kimliği
  TARGET_FOLDER: '',

  // Otomatik Drive kaydının varsayılan durumu
  AUTO_SYNC: false
};

if (typeof self !== 'undefined') {
  self.WEBMARK_CONFIG = WEBMARK_CONFIG;
}
if (typeof window !== 'undefined') {
  window.WEBMARK_CONFIG = WEBMARK_CONFIG;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WEBMARK_CONFIG;
}
