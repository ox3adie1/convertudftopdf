---
title: How I Built a Browser-Based UDF to PDF Converter for Turkish Legal Documents
published: false
description: A deep dive into building a client-side document converter for Turkey's legal system — parsing ZIP archives, rendering RTF, and generating PDFs entirely in the browser.
tags: javascript, webdev, opensource, pdf
cover_image:
---

## The Problem: A Proprietary Format Locked in a Government System

Turkey's judiciary runs on **UYAP** (Ulusal Yargı Ağı Platformu) — the National Judiciary Informatics System. Every court document, petition, and ruling passes through it. And every one of those documents is stored in a proprietary format called **UDF** (UYAP Document Format).

Here's the catch: **you can't open UDF files outside UYAP.** There's no standard viewer, no export button, no simple way to share these documents as PDFs. Lawyers receive `.udf` files and have to jump through hoops to convert them.

I decided to fix that.

## Meet UDF to PDF Converter

[**convertudftopdf.com**](https://convertudftopdf.com) is a free, open-source tool that converts `.udf` files to `.pdf` format — entirely in the browser.

No server uploads. No registration. No file size limits. Just drag, drop, and download.

## What's Inside a UDF File?

This was the first mystery to solve. After some reverse engineering, I found that UDF files are actually **ZIP archives** containing:

```
document.udf (ZIP)
├── content.xml      ← The actual document content (RTF inside XML)
├── metadata.xml     ← Document metadata
└── [attachments]    ← Optional embedded files
```

The `content.xml` file wraps RTF-formatted text inside XML nodes. So the conversion pipeline looks like:

```
.udf → ZIP extraction → XML parsing → RTF extraction → PDF generation
```

## The Technical Challenges

### 1. Client-Side ZIP Extraction

Using [JSZip](https://stuk.github.io/jszip/), extracting the ZIP is straightforward:

```javascript
const zip = await JSZip.loadAsync(file);
const contentXml = await zip.file('content.xml').async('string');
```

### 2. RTF Parsing

RTF is a surprisingly complex format. I needed to handle:

- **Character encoding** — Turkish characters (ş, ç, ğ, ı, ö, ü) have special Unicode handling
- **Formatting** — Bold, italic, underline, font sizes
- **Tables** — Court documents are full of tables
- **Page breaks** — Multi-page documents need proper pagination

I built a custom RTF parser that walks through control words and groups, extracting text with formatting metadata.

### 3. Turkish Font Support

This was the trickiest part. Default PDF fonts don't support Turkish characters properly. The `ı` (dotless i) and `İ` (capital I with dot) are particularly problematic.

The solution: embedding **Noto Serif** font directly into the generated PDF using jsPDF's font embedding API. This adds some file size but guarantees correct rendering.

```javascript
doc.addFont('NotoSerif-Regular.ttf', 'NotoSerif', 'normal');
doc.setFont('NotoSerif');
```

### 4. Privacy by Design

Legal documents are sensitive. Lawyers can't upload court files to random servers. That's why everything runs client-side:

- File reading: `FileReader` API
- ZIP extraction: JSZip (in-browser)
- PDF generation: jsPDF (in-browser)
- **Zero network requests** during conversion

## Architecture

The entire app is static HTML + CSS + JavaScript, hosted on GitHub Pages:

```
├── index.html          ← Main converter page
├── converter.js        ← Core conversion logic
├── style.css           ← UI styles
├── fonts/              ← Embedded Noto Serif font files
├── en/                 ← English version
├── udf-to-pdf.html     ← SEO landing page
├── udf-nedir.html       ← "What is UDF?" guide
└── karsilastirma.html   ← Tool comparison page
```

No framework. No build step. No backend. It just works.

## Results

Since launching, the tool has been used by lawyers across Turkey to convert thousands of documents. The feedback has been overwhelmingly positive — turns out, solving a real pain point with a simple tool goes a long way.

## Try It Out

- **Converter:** [convertudftopdf.com](https://convertudftopdf.com)
- **UDF Knowledge Base:** [udfkit.com](https://udfkit.com)
- **Source Code:** [GitHub](https://github.com/avemrik/udfpdf)

If you work in legal tech or deal with proprietary document formats, I'd love to hear about your experience. And if you find the tool useful, a ⭐ on GitHub would be appreciated!

---

*Have you dealt with proprietary document formats in your projects? How did you approach the conversion? Let me know in the comments!*
