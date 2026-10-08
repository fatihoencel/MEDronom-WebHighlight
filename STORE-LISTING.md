# Chrome Web Mağazası – MEDronom - WebHighlight (v1.1)

Bu dosya, mağaza formuna yapıştırılacak metinleri içerir. Metinler bilerek kısa ve sadedir:
anahtar kelime listesi, marka/yazı tipi sıralaması ve tekrar yoktur (önceki ret: "Anahtar Kelime Spam'i").

## Gönderim kontrol listesi
1. Paket: `MEDronom-WebHighlight-v1.1.zip` (içinde `config.js` boş şablondur, kişisel adres yok).
2. Ad, kısa açıklama ve ayrıntılı açıklamayı yukarıdaki metinlerle değiştirin; **yazı tipi/marka listesi eklemeyin**.
3. Ekran görüntüleri ve tanıtım görselleri `v1.1` klasöründen yüklenmeli (gerçek arayüz, ad tutarlı).
4. Gizlilik sekmesi: tek amaç, izin gerekçeleri ve veri kullanımı yukarıdaki gibi; gizlilik politikası bağlantısını girin.
5. Gönderirken "Yayınla"yı otomatik bırakın; inceleme notuna: *Drive kaydı isteğe bağlıdır, kullanıcının kendi Apps Script adresine PDF gönderir; uzak kod yoktur.*

## Ad
MEDronom - WebHighlight

## Kısa açıklama (manifest `description`, en fazla 132 karakter)
Web sayfalarında metni vurgulayın, altını çizin; seçtiğiniz bölümleri PDF olarak kaydedin ve isterseniz Google Drive'a gönderin.

## Ayrıntılı açıklama (Türkçe)

MEDronom - WebHighlight, okuduğunuz web sayfalarında önemli yerleri işaretlemenizi ve bunları PDF olarak saklamanızı sağlar.

NE YAPAR
• Metin seçince açılan araç çubuğuyla seçimi vurgular, düz veya dalgalı altını çizer.
• "Vurgula", "Dalgalı Çiz" ve "Altını Çiz" düğmeleri açıkken, seçtiğiniz her metin otomatik olarak işaretlenir.
• Bölge Seçici ile sayfadaki istediğiniz bölümleri tek tıkla seçip PDF olarak indirirsiniz.
• Vurgularınız sayfayı yeniden açtığınızda yerinde durur.

GOOGLE DRIVE'A KAYIT (İSTEĞE BAĞLI)
Ayarlar bölümünden açarsanız, her vurgu; vurguladığınız metin, öncesindeki birkaç satır ve sonrasındaki cümleyle birlikte PDF olarak kendi Google Drive klasörünüze kaydedilir. Seçilen metin PDF içinde vurgulu görünür. Bu özellik kapalıyken hiçbir veri Drive'a gönderilmez.

KISAYOLLAR
• Alt+Shift+H: seçili metni vurgula
• Alt+Shift+W: seçili metnin altını dalgalı çiz
• Alt+Shift+P: Bölge Seçici'yi aç/kapat

GİZLİLİK
Vurgularınız tarayıcınızda saklanır. Eklenti reklam, analiz veya izleme içermez ve verilerinizi üçüncü kişilerle paylaşmaz. Drive kaydı yalnızca sizin açtığınız hesapla, sizin klasörünüze yapılır.

## Kısa açıklama / ayrıntılı açıklama (English)

Highlight text, underline it, and save the parts of a page you choose as a PDF, optionally straight to your own Google Drive.

MEDronom - WebHighlight helps you mark important passages on the pages you read and keep them as PDFs.
• Select text to highlight it or draw a straight or wavy underline.
• Turn on the Highlight, Wavy or Underline switch and every selection is marked automatically.
• Use the Area Picker to select parts of a page and download them as a PDF.
• Optional Google Drive saving: each highlight is saved to your own Drive folder as a PDF with a few lines of context before and the sentence after it. Nothing is sent to Drive unless you turn this on.
• Highlights stay in your browser. No ads, analytics or tracking; no data is shared with third parties.

## Tek amaç (Single purpose)
Web sayfalarında metni vurgulamak/altını çizmek ve seçilen içeriği PDF olarak kaydetmek.

## İzin gerekçeleri (Gizlilik uygulamaları sekmesi)
- **storage**: Vurguları, ayarları ve vurgu düğmelerinin açık/kapalı durumunu tarayıcıda saklamak.
- **activeTab**: Kullanıcı eklenti penceresini açtığında veya kısayol kullandığında etkin sekmeye komut göndermek.
- **contextMenus**: Sağ tık menüsünde vurgula / altını çiz / PDF seçeneklerini sunmak.
- **offscreen**: PDF üretimi DOM ve canvas gerektirdiğinden, PDF'i arka planda temiz bir belgede oluşturmak.
- **İçerik betiği (tüm sayfalar)**: Vurgu araçları kullanıcının açtığı herhangi bir sayfada çalışmalıdır; yalnızca kullanıcının seçtiği metin ve çevresindeki birkaç satır okunur.
- **script.google.com / script.googleusercontent.com**: Yalnızca kullanıcı isterse, kendi Google Apps Script adresine PDF göndermek için (isteğe bağlı Drive kaydı).

## Veri kullanımı bildirimi
- Toplanan veri: kullanıcının seçip vurguladığı web sayfası metni ve sayfa adresi.
- Kullanım: yalnızca vurgu/PDF işlevi ve kullanıcı açtıysa kendi Google Drive'ına kayıt.
- Satılmaz, reklam/kredi/alakasız amaçla kullanılmaz, üçüncü kişilerle paylaşılmaz.
- Uzaktan kod çalıştırılmaz.
- Gizlilik politikası bağlantısı: https://github.com/fatihoencel/MEDronom-WebHighlight/blob/main/PRIVACY.md

## Mağaza görselleri
`WebMark-Store-Assets/v1.1/` klasörü: gerçek eklenti ekran görüntüleri (1280x800), küçük tanıtım (440x280), büyük tanıtım (1400x560).
