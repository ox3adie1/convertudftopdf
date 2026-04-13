# Show HN: UDF to PDF – Browser-based converter for Turkish legal documents

**Title:** Show HN: UDF to PDF – Browser-based converter for Turkish legal documents

**URL:** https://convertudftopdf.com

**Text:**

Turkey's judiciary system (UYAP) uses a proprietary document format called UDF. Lawyers receive court documents, rulings, and petitions as .udf files — but there's no easy way to open or share them outside the system.

I built a converter that runs entirely in the browser: drag a .udf file, get a PDF. No server upload, no registration.

Technical details:

- UDF files are ZIP archives containing RTF content wrapped in XML
- Uses JSZip for extraction, custom RTF parser for formatting, jsPDF for PDF generation
- Embeds Noto Serif font for Turkish character support (the dotless ı is always fun)
- Zero network requests during conversion — everything runs client-side
- No framework, no build step — vanilla JS, hosted on GitHub Pages

Source: https://github.com/avemrik/udfpdf

The hardest part was RTF parsing — court documents use deeply nested tables and mixed encodings. Turkish Unicode handling (especially ı/İ vs i/I) added another layer of complexity.

Would love feedback on the approach, especially from anyone who's dealt with parsing proprietary document formats.
