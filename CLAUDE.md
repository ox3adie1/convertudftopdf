# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**UDF to PDF Converter** — A free, browser-based tool that converts Turkish UYAP court documents (.udf) to PDF. Runs 100% client-side with no server uploads. Hosted on GitHub Pages at `convertudftopdf.com`.

## Architecture

- **Static site** — No build step, no framework, no bundler. Pure HTML/CSS/JS served directly.
- **Client-side processing** — Files are parsed and converted entirely in the browser. No server uploads.
- **UDF format** — A ZIP archive containing XML metadata (`content.xml`) and embedded documents. The parser in `converter.js` extracts paragraphs, tables, headers/footers, styles, RTF content, and PKCS#7 digital signatures.
- **Turkish font support** — Noto Serif TTF files in `fonts/` are loaded and registered with jsPDF to render Turkish characters (ş, ç, ğ, ı, ö, ü).
- **PWA** — Service worker (`sw.js`, cache `udf-converter-v4`) with cache-first for fonts/CDN, network-first for pages. Skips analytics, ads, and file downloads from caching.

## Converter Pipeline (`converter.js` — ~2,400 lines, single IIFE)

Key conversion paths:

| Input | Output | Function | Notes |
|-------|--------|----------|-------|
| .udf | .pdf | `convertUdfToPdf()` | Full formatting: bold/italic/underline, tables, headers/footers, page breaks |
| .udf | .docx | `convertUdfToDocx()` | Word export via docx library, styles/headers/footers preserved |
| .tiff/.tif | .pdf | `convertTiffToPdf()` | Dual-path: UTIF.js for standard, custom CCITT G4 decoder for fax-compressed |
| .jpg/.png/etc | .pdf | `convertImageToPdf()` | Aspect ratio preservation |
| Multiple PDFs | Single PDF | `mergePdfsAndDownload()` | Post-conversion merge via pdf-lib |

Additional features: ZIP auto-extraction (`extractZipAndAdd()`), OCR via Tesseract.js (lazy-loaded), file preview/text copy, selective download with checkboxes.

### Internal structure

1. **Font loading** — `loadFonts()` fetches TTF, base64-encodes, caches in `fontCache`. `registerFonts(doc)` adds to jsPDF instance.
2. **File handling** — `addFiles()` validates extensions/size (10MB max), `renderFileList()` updates UI. Drag-drop and click-to-select both feed into `addFiles()`.
3. **UDF parsing** — `parseUdf()` unzips with JSZip → finds `content.xml` → DOMParser. Extracts via `parseParagraph`, `parseTable`, `parseTabStops`. Includes PKCS#7 signature extraction for court document metadata.
4. **Output** — Single files download directly. Multiple files zipped. Format toggle: `outputFormat` global ('pdf' or 'docx').

All code in a single IIFE — no modules, no exports. DOM element IDs hardcoded at the top.

## Key Files

| File | Purpose |
|------|---------|
| `converter.js` | Core engine: all conversion logic, drag-drop UI, batch processing |
| `index.html` | Main Turkish landing page with converter UI, FAQ, schema markup |
| `style.css` | Design system: Tailwind-inspired CSS variables (--blue-50..900, --gray-50..900), 1100px container, 64px sticky header |
| `sw.js` | Service worker (PWA), cache version `udf-converter-v4` |
| `manifest.json` | PWA manifest: standalone display, theme #2563eb |
| `en/` | English localization (index, what-is-udf, udf-to-pdf, uyap-guide) |
| `fonts/` | Noto Serif TTF (Regular, Bold, Italic, BoldItalic) |
| `content/` | Marketing content drafts (blog posts, platform submissions) |
| `sitemap.xml` | SEO sitemap with hreflang alternates |
| `ads.txt` | AdSense publisher verification |
| `robots.txt` | Allows all, disallows `/fonts/`, points to sitemap |

## SEO Content Pages

Multiple standalone HTML pages target specific Turkish search keywords. Each page includes its own JSON-LD structured data, canonical URL, and hreflang tags:

- `udf-nedir.html`, `udf-dosyasi-acma.html`, `udf-to-pdf.html` — informational/how-to pages
- `udf-dosyasi-telefonda-acma.html`, `udf-dosyasi-word-cevirme.html` — long-tail keyword pages
- `uyap-pdf-donusturucu.html`, `uyap-rehber.html`, `uyap-sozluk.html` — UYAP-branded content
- `karsilastirma.html` — comparison page
- `kullanim-sartlari.html`, `iletisim.html`, `hakkimizda.html` — trust/policy pages (AdSense compliance)
- `privacy.html`, `404.html` — utility pages

When adding new SEO pages: add to `sitemap.xml`, include JSON-LD schema, set canonical to `convertudftopdf.com`, add footer links (Kullanım Şartları, İletişim, Hakkımızda, Gizlilik Politikası), and add internal links from relevant existing pages.

## Development

```bash
# Serve locally (fonts require HTTP, won't work on file://)
python -m http.server 8000
# or
npx serve .

# No build, lint, or test commands — edit and reload
```

**Deploy:** Push to `main` branch → GitHub Pages auto-deploys.

## Constraints

- Max file size: 10MB (enforced in converter.js `addFiles()`)
- TIFF dimension/pixel limits enforced to prevent memory attacks
- CDN dependencies (all with SRI hashes):

| Library | Version | Purpose |
|---------|---------|---------|
| JSZip | 3.10.1 | ZIP extraction (UDF files are ZIPs) |
| jsPDF | 2.5.1 | PDF generation |
| UTIF.js | 3.1.0 | TIFF decoding |
| pdf-lib | unpkg | PDF merge/manipulation |
| docx | 8.5.0 | Word (.docx) generation |
| Tesseract.js | lazy-loaded | OCR (not in initial bundle) |

- CDN scriptlerinde SRI hash var — kütüphane güncellerken `curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A` ile yeni hash hesapla
- CSP policy defined in `index.html` `<meta>` tag — update when adding new CDN sources
- All SEO pages have structured data (JSON-LD: WebApplication, FAQPage, Organization, BreadcrumbList)
- Domain consolidated from `udfkit.com` → `convertudftopdf.com` via Cloudflare 301 redirects
- Some SEO pages use ASCII-only Turkish (e.g., "Donusturucu" instead of "Dönüştürücü") — maintain consistency within each file

## Supporting Scripts

- `indexnow-submit.py` — Submit URLs to IndexNow API
- `backlink_worker.py` — SEO backlink automation (gitignore'd)
- `run_batch.py` — Batch processing utility (gitignore'd)

## Conventions

- Primary language: Turkish. English pages under `en/`.
- Anchor texts for backlinks must always be in Turkish.
- Brand name: "UDF to PDF Converter" (site title), "UDF Kit" (project name).
- AdSense publisher ID: `ca-pub-4410660717929931`.
