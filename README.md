# UDF to PDF Converter

[![Website](https://img.shields.io/badge/Website-convertudftopdf.com-blue?style=flat-square)](https://convertudftopdf.com)
[![UDF Kit](https://img.shields.io/badge/UDF%20Kit-udfkit.com-green?style=flat-square)](https://udfkit.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/avemrik/udfpdf?style=flat-square)](https://github.com/avemrik/udfpdf/stargazers)

**Convert UDF to PDF** instantly in your browser. A free, fast, and secure tool to convert UYAP `.udf` files to `.pdf` format — no server upload required.

## What is UDF?

UDF (UYAP Document Format) is a proprietary file format used by Turkey's UYAP (National Judiciary Informatics System). Legal professionals — lawyers, judges, and court staff — work with `.udf` files daily but often struggle to open or share them outside the UYAP ecosystem.

**UDF to PDF Converter** solves this by converting `.udf` files to standard `.pdf` format entirely in the browser.

## Features

- **100% Client-Side** — Files never leave your browser. No server upload, complete privacy.
- **Batch Conversion** — Convert multiple `.udf` files to PDF at once.
- **Full Turkish Character Support** — Embedded Noto Serif font renders ş, ç, ğ, ı, ö, ü correctly.
- **RTF Parsing** — Handles RTF content inside UDF (ZIP) archives with proper formatting.
- **Drag & Drop** — Simply drag your `.udf` files onto the page.
- **Cross-Browser** — Works on Chrome, Firefox, Edge, and Safari.

## How to Use

1. **Open** [convertudftopdf.com](https://convertudftopdf.com) in your browser.
2. **Upload** your `.udf` file(s) by dragging them onto the page or clicking "Select Files".
3. **Download** the converted PDF file(s) instantly.

That's it — no installation, no registration, no file size worries.

## Screenshot

![UDF to PDF Converter](https://convertudftopdf.com/og-image.png)

## How It Works

UDF files are ZIP archives containing a `content.xml` file with RTF-formatted document content. The converter:

1. Extracts the ZIP archive using [JSZip](https://stuk.github.io/jszip/)
2. Parses the XML structure and extracts RTF content
3. Renders the document with proper formatting (bold, italic, tables, etc.)
4. Generates a PDF with embedded Turkish fonts using [jsPDF](https://github.com/parallax/jsPDF)

Everything runs in JavaScript — your files are processed locally and never sent to any server.

## Technology

- **JavaScript** — Pure client-side processing
- **[jsPDF](https://github.com/parallax/jsPDF)** — PDF generation
- **[JSZip](https://stuk.github.io/jszip/)** — ZIP extraction
- **Noto Serif** — Embedded font for Turkish character support
- **GitHub Pages** — Static hosting

## Related Pages

- [UDF Nedir?](https://udfkit.com/udf-nedir) — UDF dosya formatı hakkında detaylı bilgi
- [UDF to PDF Guide](https://convertudftopdf.com/udf-to-pdf) — Step-by-step conversion guide
- [UDF Dosyası Açma](https://udfkit.com/udf-dosyasi-acma) — UDF dosyalarını açma yöntemleri
- [UYAP PDF Dönüştürücü](https://convertudftopdf.com/uyap-pdf-donusturucu) — UYAP belgeleri için PDF araçları
- [Tool Comparison](https://convertudftopdf.com/karsilastirma) — UDF conversion tools compared

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

This project is open source. See [LICENSE](LICENSE) for details.

---

**Try it now:** [convertudftopdf.com](https://convertudftopdf.com) | **Learn more:** [udfkit.com](https://udfkit.com)
