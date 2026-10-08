// MEDronom - WebHighlight - PDF üretici (offscreen belge)
// Site CSS'inden / içerik script ortamından bağımsız, temiz bir DOM'da PDF üretir.

async function renderPdf(html) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:0;top:0;width:700px;background:#fff;';
  host.innerHTML = html;
  document.body.appendChild(host);
  const el = host.firstElementChild;

  try {
    const pdf = await window.html2pdf().set({
      margin: [10, 10, 10, 10],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: 760 },
      pagebreak: { mode: ['css', 'legacy'] },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).outputPdf('datauristring');

    const base64 = typeof pdf === 'string' && pdf.includes(',') ? pdf.split(',')[1] : '';
    // Boş sayfa koruması: içerik görüntüsü yoksa Drive'a yüklemeyelim
    if (!base64 || !atob(base64).includes('/Subtype /Image')) {
      throw new Error('PDF boş üretildi (içerik görüntüsü yok)');
    }
    return base64;
  } finally {
    host.remove();
  }
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.target !== 'offscreen' || req.action !== 'render-pdf') return;
  renderPdf(req.html)
    .then((pdfBase64) => sendResponse({ success: true, pdfBase64 }))
    .catch((err) => sendResponse({ success: false, error: String((err && err.message) || err) }));
  return true; // async
});
