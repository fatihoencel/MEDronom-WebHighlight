# MEDronom - WebHighlight - Chrome Extension (Manifest V3)

Modern and powerful Chrome extension to highlight web text with custom colors, underline with straight or squiggly/wavy lines, modify typography, and export selected webpage sections to downloadable PDF.

## Features
- 🖍️ **Multi-color Highlighting**: 6 vibrant pastel swatches + full RGB/HEX color picker.
- ➖ **Solid Underlines**: Clean, customizable straight underlines with custom color support.
- 〰️ **Wavy Underlines**: Squiggly, attention-grabbing underlines for notes, edits, or emphasis.
- 🔤 **Dynamic Typography**: Switch selected text fonts to Inter, Merriweather, Georgia, Roboto, JetBrains Mono, OpenDyslexic, Playfair Display, and Comic Neue.
- 📄 **Export Selection to PDF**: Immediate client-side formatted PDF generation with source URL, date, and preserved annotations via `html2pdf.js`.
- 🎯 **Interactive Element Picker**: Click any section, table, blockquote, or card on the page to bundle and download as a single unified PDF.
- 💾 **Local Persistence**: Automatically stores and restores annotations per URL using `chrome.storage.local`.
- ⚡ **Manifest V3 Compliant**: Completely offline-capable with bundled dependencies, fast service worker, and no external API dependencies.

## Architecture
- `manifest.json`: Manifest V3 extension configuration.
- `background.js`: Background service worker managing context menus and keyboard shortcuts.
- `content.js`: Selection listener, DOM Range splitter, floating toolbar, element picker, and PDF export bridge.
- `content.css`: Modern glassmorphic styles for toolbar, picker overlay, toasts, and custom typography.
- `popup.html`, `popup.css`, `popup.js`: Dashboard to manage page annotations, trigger picker mode, or export data.
- `libs/html2pdf.bundle.min.js`: Open-source client-side PDF renderer (jsPDF + html2canvas).
- `test-page.html`: Interactive local sandbox page to immediately test all features.
