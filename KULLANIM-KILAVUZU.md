# 🌟 WebMark & PDF Studio - Kullanım Kılavuzu

Masaüstünüzde oluşturulan **`WebMark-PDF-Studio`** klasörü, Google Chrome için hazırlanmış modern ve tam donanımlı bir **Manifest V3** tarayıcı uzantısıdır.

---

## 🚀 1. Uzantıyı Google Chrome'a Yükleme (1 Dakika)

1. **Google Chrome** tarayıcınızı açın.
2. Adres çubuğuna `chrome://extensions` yazıp **Enter**'a basın (veya sağ üstteki üç nokta menüsünden **Uzantılar > Uzantıları Yönet** yolunu izleyin).
3. Sağ üst köşede bulunan **"Geliştirici modu" (Developer mode)** anahtarını açık konuma getirin.
4. Sol üstte beliren **"Paketlenmemiş öğe yükle" (Load unpacked)** butonuna tıklayın.
5. Açılan dosya seçim penceresinde Masaüstünüzdeki **`WebMark-PDF-Studio`** klasörünü seçip **"Seç" / "Aç"** deyin.
6. Uzantınız anında aktifleşecektir! Chrome sağ üst uzantı simgesinden (yapboz parçası) **WebMark**'ı sabitleyerek (pin) kolayca erişebilirsiniz.

---

## 🎯 2. Temel Özellikler ve Kullanım

### 🖍️ A. Metin Vurgulama (Highlighting)
1. Herhangi bir web sayfasında dilediğiniz bir metni farenizle seçin.
2. Seçimin hemen üzerinde **WebMark Yüzen Araç Çubuğu** otomatik olarak belirecektir.
3. **Sarı, Yeşil, Mavi, Pembe, Turuncu, Mor** pastel renk butonlarından birine tıklayın veya **gökkuşağı renk seçiciye** tıklayarak istediğiniz özel HEX rengini seçin.
4. Metniniz anında vurgulanır ve sayfa yenilendiğinde kaybolmaması için tarayıcınızın yerel hafızasına kaydedilir.

---

### 〰️ B. Düz ve Dalgalı Alt Çizgi (Straight & Wavy Underlines)
1. Altını çizmek istediğiniz kelime veya cümleyi seçin.
2. Açılan araç çubuğunda:
   - **➖ Düz**: Metnin altını düz ve belirgin bir çizgiyle çizer.
   - **〰️ Dalgalı**: Metnin altını dikkat çekici kıvrımlı/dalgalı (wavy) bir çizgiyle çizer.
3. Çizgi rengini değiştirmek için hemen yanındaki dairesel renk seçiciden dilediğiniz rengi (örn: Kırmızı, Mavi, Turuncu) belirleyebilirsiniz.

---

### 🔤 C. Yazı Tipi Değiştirme (Typography)
1. Fontunu değiştirmek istediğiniz paragrafı veya metni seçin.
2. Araç çubuğundaki **"Yazı Tipi..."** açılır kutusundan dilediğiniz fontu seçin:
   - **Inter**: Modern, temiz ekran yazı tipi.
   - **Merriweather / Georgia**: Uzun okumalar için konforlu tırnaklı (serif) fontlar.
   - **Roboto**: Standart, okunabilir sans-serif font.
   - **JetBrains Mono**: Kod blokları ve teknik terimler için sabit aralıklı (monospace) font.
   - **OpenDyslexic**: Disleksi ve okuma güçlüğü çekenler için optimize edilmiş harf yapısı.
   - **Playfair Display**: Zarif ve klasik başlık tasarımı.
   - **Comic Neue**: Rahat ve samimi el yazısı hissi.

---

### 📄 D. Sayfadan İstediğiniz Yerleri Seçip PDF Yapma (2 Farklı Yöntem)

#### Yöntem 1: Seçili Metni Doğrudan PDF Yapma
- Metni seçin, yüzen araç çubuğundaki kırmızı **"📄 Seçimi PDF Yap"** butonuna tıklayın.
- Seçtiğiniz bölüm; vurguları, alt çizgileri, yazı tipleri, sayfa başlığı ve kaynak linkiyle birlikte saniyeler içinde formatlanmış bir PDF olarak bilgisayarınıza iner!

#### Yöntem 2: Bölge Seçici (Element Picker) ile Birden Fazla Alanı Birleştirip PDF Yapma
1. Uzantı simgesine tıklayıp **"Bölge Seçiciyi Başlat"** butonuna basın (veya klavyeden **`Alt + Shift + P`** tuşlayın).
2. Sayfa üzerinde farenizi gezdirdiğinizde paragraflar, makaleler, tablolar veya görseller mavi kesikli çizgiyle parlar.
3. PDF'e dahil etmek istediğiniz bölümlere sırayla tıklayın (Seçtiğiniz her bölüme `#1`, `#2`, `#3` numaralı rozetler eklenir).
4. Ekranın altında beliren kontrol panelinde:
   - **📥 PDF Olarak İndir**: Seçilen tüm bölümleri tek bir A4 PDF dosyasında birleştirip doğrudan indirir.
   - **🖨️ Vektör Yazdır**: Seçili bölümleri Chrome'un yerel PDF yazıcısına göndererek aranabilir, yüksek çözünürlüklü vektör PDF kaydetmenizi sağlar.
5. Moddan çıkmak için klavyeden **`ESC`** tuşuna basabilir veya paneldeki **"✕ Çık"** butonuna tıklayabilirsiniz.

---

### ☁️ E. Otomatik Google Drive PDF Senkronizasyonu (Yeni!)
Altını çizdiğiniz veya vurguladığınız her içerik anında site adına göre Google Drive'da klasörlenir ve PDF formatında buluta kaydedilir:

#### 1 Dakikalık Kurulum (Client ID):
Google, yerel olarak geliştirilen eklentilerde güvenlik gereği ücretsiz bir **OAuth Client ID** istemektedir:
1. [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials) sayfasına gidin (Google hesabınızla giriş yapın).
2. **"Kimlik Bilgisi Oluştur" (Create Credentials)** > **"OAuth İstemci Kimliği" (OAuth client ID)** seçeneğine tıklayın.
3. Uygulama türünü **"Web Uygulaması" (Web application)** seçin.
4. **"Yetkilendirilmiş yönlendirme URI'leri"** kısmına `https://` ile başlayan yönlendirme adresinizi veya `https://chromiumapp.org` ekleyin.
5. Oluşturulan **Client ID** metnini (örneğin: `123456789-abc.apps.googleusercontent.com`) kopyalayın.
6. WebMark eklentisi popup penceresinde **Google Cloud Client ID** alanına yapıştırıp **"Kaydet"** butonuna basın.
7. **"Google ile Bağlan"** diyerek tek tıkla hesabınızı yetkilendirin!

---

#### 🌟 Otomatik Kayıt Akışı:
* Artık herhangi bir web sayfasında bir metni vurguladığınızda veya altını çizdiğinizde:
  - Hiçbir indirme penceresi açılmaz.
  - Google Drive'ınızda `WebMark / [Site-İsmi]` klasörü altında (örneğin: `WebMark / medium.com / Makale_Notu.pdf`) otomatik oluşturulup sessizce buluta yüklenir.
  - Sayfanın sağ üstünde anında **"Drive'a kaydedildi ☁️"** bildirimi görüntülenir.

---

## ⌨️ 3. Klavye Kısayolları

| Kısayol | İşlev |
| :--- | :--- |
| **`Alt + Shift + H`** | Seçili metni hızlıca sarı renkle vurgular |
| **`Alt + Shift + W`** | Seçili metnin altını kırmızı dalgalı çizgiyle çizer |
| **`Alt + Shift + P`** | Akıllı PDF Bölge Seçici modunu açar / kapatır |
| **`ESC`** | Bölge seçici modundan çıkar |

---

## 🧪 4. Hemen Denemek İçin Test Sayfası

Klasör içinde sizin için hazırladığımız **`test-page.html`** dosyasını Chrome'da açarak uzantının tüm özelliklerini saniyeler içinde test edebilirsiniz:
1. Chrome'da yeni bir sekme açın.
2. Klavyeden `Cmd + O` tuşlayarak Masaüstündeki `WebMark-PDF-Studio/test-page.html` dosyasını seçip açın.
3. Metinleri seçip vurgulamayı, dalgalı alt çizmeyi ve PDF indirmeyi hemen deneyimleyin!
