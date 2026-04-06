/**
 * UDF to PDF Converter
 * Parses UYAP .udf files (ZIP containing content.xml) and generates PDF
 * with embedded Noto Serif font for full Turkish character support.
 */

(function () {
    'use strict';

    const { jsPDF } = window.jspdf;

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    // ── DOM Elements ──
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const selectBtn = document.getElementById('selectBtn');
    const fileList = document.getElementById('fileList');
    const fileItems = document.getElementById('fileItems');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const convertAllBtn = document.getElementById('convertAllBtn');
    const progressArea = document.getElementById('progressArea');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    let files = [];
    let fontsLoaded = false;
    let fontCache = {};

    // ── Font Loading ──
    async function loadFonts() {
        if (fontsLoaded) return;

        const fontFiles = [
            { file: 'NotoSerif-Regular.ttf', style: 'normal' },
            { file: 'NotoSerif-Bold.ttf', style: 'bold' },
            { file: 'NotoSerif-Italic.ttf', style: 'italic' },
            { file: 'NotoSerif-BoldItalic.ttf', style: 'bolditalic' },
        ];

        for (const f of fontFiles) {
            const response = await fetch('fonts/' + f.file);
            if (!response.ok) throw new Error('Font dosyası yüklenemedi: ' + f.file);
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            fontCache[f.style] = btoa(binary);
        }

        fontsLoaded = true;
    }

    function registerFonts(doc) {
        const fileNames = {
            normal: 'NotoSerif-Regular.ttf',
            bold: 'NotoSerif-Bold.ttf',
            italic: 'NotoSerif-Italic.ttf',
            bolditalic: 'NotoSerif-BoldItalic.ttf',
        };

        for (const [style, fileName] of Object.entries(fileNames)) {
            doc.addFileToVFS(fileName, fontCache[style]);
            doc.addFont(fileName, 'NotoSerif', style);
        }
    }

    // ── Event Listeners ──
    selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        addFiles(e.target.files);
        fileInput.value = '';
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.udf'));
        if (droppedFiles.length > 0) {
            addFiles(droppedFiles);
        }
    });

    clearAllBtn.addEventListener('click', () => {
        files = [];
        renderFileList();
    });

    convertAllBtn.addEventListener('click', convertAll);

    // ── File Management ──
    function addFiles(newFiles) {
        for (const f of newFiles) {
            if (!f.name.toLowerCase().endsWith('.udf')) continue;

            if (f.size > MAX_FILE_SIZE) {
                files.push({ file: f, status: 'error', result: null, errorMsg: 'Dosya boyutu 10MB limitini aşıyor.' });
            } else {
                files.push({ file: f, status: 'waiting', result: null, errorMsg: null });
            }
        }
        renderFileList();
    }

    function removeFile(index) {
        files.splice(index, 1);
        renderFileList();
    }

    function renderFileList() {
        if (files.length === 0) {
            fileList.hidden = true;
            progressArea.hidden = true;
            return;
        }

        fileList.hidden = false;
        fileItems.innerHTML = '';

        files.forEach((entry, i) => {
            const div = document.createElement('div');
            div.className = 'file-item';

            const statusBadge = getStatusBadge(entry.status);
            const downloadBtn = entry.status === 'done' && entry.result
                ? `<button class="btn btn-success btn-sm" data-download="${i}">İndir</button>`
                : '';
            const errorMsg = entry.errorMsg
                ? `<div class="file-item-error">${escapeHtml(entry.errorMsg)}</div>`
                : '';

            div.innerHTML = `
                <div class="file-item-icon">UDF</div>
                <div class="file-item-info">
                    <div class="file-item-name" title="${escapeHtml(entry.file.name)}">${escapeHtml(entry.file.name)}</div>
                    <div class="file-item-size">${formatSize(entry.file.size)}</div>
                    ${errorMsg}
                </div>
                <div class="file-item-status">
                    ${statusBadge}
                    ${downloadBtn}
                    <button class="btn-remove" data-remove="${i}" title="Kaldır">&times;</button>
                </div>
            `;
            fileItems.appendChild(div);
        });

        fileItems.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFile(parseInt(btn.dataset.remove));
            });
        });

        fileItems.querySelectorAll('[data-download]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const entry = files[parseInt(btn.dataset.download)];
                if (entry && entry.result) {
                    downloadPdf(entry.result, entry.file.name.replace(/\.udf$/i, '.pdf'));
                }
            });
        });
    }

    function getStatusBadge(status) {
        const map = {
            waiting: '<span class="badge badge-waiting">Bekliyor</span>',
            converting: '<span class="badge badge-converting">Dönüştürülüyor</span>',
            done: '<span class="badge badge-done">Tamamlandı</span>',
            error: '<span class="badge badge-error">Hata</span>',
        };
        return map[status] || '';
    }

    // ── Convert All ──
    async function convertAll() {
        const pending = files.filter(f => f.status === 'waiting');
        if (pending.length === 0) return;

        convertAllBtn.disabled = true;
        progressArea.hidden = false;
        progressText.textContent = 'Fontlar yükleniyor...';

        try {
            await loadFonts();
        } catch (err) {
            console.error('Font loading error:', err);
            progressText.textContent = 'Font yükleme hatası! Sayfa bir HTTP sunucu üzerinden açılmalıdır.';
            convertAllBtn.disabled = false;
            return;
        }

        let processed = 0;
        const total = files.filter(f => f.status !== 'done' && f.status !== 'error').length;

        for (let i = 0; i < files.length; i++) {
            if (files[i].status === 'done' || files[i].status === 'error') continue;

            files[i].status = 'converting';
            renderFileList();
            processed++;
            progressBar.style.width = `${((processed - 1) / Math.max(total, 1)) * 100}%`;
            progressText.textContent = `Dönüştürülüyor: ${files[i].file.name} (${processed}/${total})`;

            try {
                const pdfBlob = await convertUdfToPdf(files[i].file);
                files[i].status = 'done';
                files[i].result = pdfBlob;
                files[i].errorMsg = null;
            } catch (err) {
                console.error('Conversion error:', err);
                files[i].status = 'error';
                files[i].errorMsg = getErrorMessage(err);
            }

            renderFileList();
        }

        progressBar.style.width = '100%';
        const doneCount = files.filter(f => f.status === 'done').length;
        const errorCount = files.filter(f => f.status === 'error').length;

        if (errorCount > 0) {
            progressText.textContent = `${doneCount} dosya dönüştürüldü, ${errorCount} dosyada hata oluştu.`;
        } else {
            progressText.textContent = 'Tüm dosyalar dönüştürüldü!';
        }

        convertAllBtn.disabled = false;

        const doneFiles = files.filter(f => f.status === 'done');
        if (doneFiles.length === 1) {
            downloadPdf(doneFiles[0].result, doneFiles[0].file.name.replace(/\.udf$/i, '.pdf'));
        } else if (doneFiles.length > 1) {
            await downloadAllAsZip(doneFiles);
        }
    }

    function getErrorMessage(err) {
        const msg = err.message || '';
        if (msg.includes('content.xml')) return 'Geçerli bir UDF dosyası değil: content.xml bulunamadı.';
        if (msg.includes('Not a valid zip') || msg.includes('Corrupted') || msg.includes('invalid')) return 'Dosya bozuk veya geçerli bir UDF dosyası değil.';
        if (msg.includes('End of data')) return 'Dosya bozuk — eksik veya tamamlanmamış arşiv.';
        return 'Dönüştürme sırasında bir hata oluştu: ' + msg;
    }

    // ── UDF Parser ──
    async function parseUdf(file) {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);

        const contentFile = zip.file('content.xml');
        if (!contentFile) {
            throw new Error('content.xml bulunamadı');
        }

        const xmlText = await contentFile.async('string');
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'text/xml');

        const contentEl = doc.querySelector('template > content');
        const rawText = contentEl ? contentEl.textContent : '';

        const pageFormat = doc.querySelector('pageFormat');
        const page = {
            leftMargin: parseFloat(pageFormat?.getAttribute('leftMargin') || '56.7'),
            rightMargin: parseFloat(pageFormat?.getAttribute('rightMargin') || '42.5'),
            topMargin: parseFloat(pageFormat?.getAttribute('topMargin') || '42.5'),
            bottomMargin: parseFloat(pageFormat?.getAttribute('bottomMargin') || '28.3'),
        };

        const PT_TO_MM = 0.3528;
        page.leftMm = page.leftMargin * PT_TO_MM;
        page.rightMm = page.rightMargin * PT_TO_MM;
        page.topMm = page.topMargin * PT_TO_MM;
        page.bottomMm = page.bottomMargin * PT_TO_MM;

        const styles = {};
        doc.querySelectorAll('styles > style').forEach(s => {
            styles[s.getAttribute('name')] = {
                size: parseFloat(s.getAttribute('size') || '12'),
                family: s.getAttribute('family') || 'Times New Roman',
                bold: s.getAttribute('bold') === 'true',
                italic: s.getAttribute('italic') === 'true',
            };
        });

        const elements = doc.querySelector('elements');
        const paragraphs = [];

        if (elements) {
            for (const el of elements.children) {
                if (el.tagName === 'paragraph') {
                    paragraphs.push(parseParagraph(el, rawText, styles));
                } else if (el.tagName === 'header') {
                    for (const p of el.querySelectorAll('paragraph')) {
                        const para = parseParagraph(p, rawText, styles);
                        para.isHeader = true;
                        paragraphs.push(para);
                    }
                } else if (el.tagName === 'footer') {
                    for (const p of el.querySelectorAll('paragraph')) {
                        const para = parseParagraph(p, rawText, styles);
                        para.isFooter = true;
                        paragraphs.push(para);
                    }
                } else if (el.tagName === 'table') {
                    paragraphs.push({ type: 'table', table: parseTable(el, rawText, styles) });
                }
            }
        }

        if (paragraphs.length === 0 && rawText.trim()) {
            rawText.split('\n').forEach(line => {
                paragraphs.push({
                    alignment: 0,
                    spaceAbove: 0, spaceBelow: 0,
                    leftIndent: 0, rightIndent: 0,
                    tabStops: [],
                    runs: [{ text: line, bold: false, italic: false, underline: false, size: 12 }],
                });
            });
        }

        return { rawText, page, styles, paragraphs };
    }

    function parseTabStops(tabSetStr) {
        if (!tabSetStr) return [];
        // TabSet format: "pos:align:leader" or "pos:align:leader,pos2:align2:leader2"
        return tabSetStr.split(',').map(entry => {
            const parts = entry.split(':');
            return {
                position: parseFloat(parts[0] || '0') * 0.3528, // pt to mm
                alignment: parseInt(parts[1] || '0'),
            };
        });
    }

    function parseParagraph(el, rawText, styles) {
        const alignment = parseInt(el.getAttribute('Alignment') || '0');
        const spaceAbove = parseFloat(el.getAttribute('SpaceAbove') || '0');
        const spaceBelow = parseFloat(el.getAttribute('SpaceBelow') || '0');
        const leftIndent = parseFloat(el.getAttribute('LeftIndent') || '0');
        const rightIndent = parseFloat(el.getAttribute('RightIndent') || '0');
        const tabSetStr = el.getAttribute('TabSet') || '';
        const tabStops = parseTabStops(tabSetStr);
        const resolver = el.getAttribute('resolver') || 'default';
        const baseStyle = styles[resolver] || styles['hvl-default'] || styles['default'] || {};

        const runs = [];
        for (const child of el.children) {
            const startOffset = parseInt(child.getAttribute('startOffset') || '0');
            const length = parseInt(child.getAttribute('length') || '0');
            const text = rawText.substring(startOffset, startOffset + length);

            const bold = child.getAttribute('bold') === 'true' || (child.getAttribute('bold') == null && baseStyle.bold);
            const italic = child.getAttribute('italic') === 'true' || (child.getAttribute('italic') == null && baseStyle.italic);
            const underline = child.getAttribute('underline') === 'true';
            const size = parseFloat(child.getAttribute('size') || baseStyle.size || '12');

            if (child.tagName === 'tab') {
                runs.push({ text: '\t', bold, italic, underline, size });
            } else {
                runs.push({ text, bold, italic, underline, size });
            }
        }

        return { alignment, spaceAbove, spaceBelow, leftIndent, rightIndent, tabStops, runs };
    }

    function parseTable(tableEl, rawText, styles) {
        const rows = [];
        for (const rowEl of tableEl.querySelectorAll(':scope > row')) {
            const cells = [];
            for (const cellEl of rowEl.querySelectorAll(':scope > cell')) {
                const cellParagraphs = [];
                for (const pEl of cellEl.querySelectorAll(':scope > paragraph')) {
                    cellParagraphs.push(parseParagraph(pEl, rawText, styles));
                }
                cells.push({ paragraphs: cellParagraphs });
            }
            rows.push({ cells });
        }
        return rows;
    }

    // ── PDF Generation ──
    const PT_TO_MM = 0.3528;
    const PAGE_W = 210;
    const PAGE_H = 297;
    const DEFAULT_TAB_MM = 15;

    async function convertUdfToPdf(file) {
        const udf = await parseUdf(file);
        const pg = udf.page;

        const leftM = Math.max(pg.leftMm, 10);
        const rightM = Math.max(pg.rightMm, 10);
        const topM = Math.max(pg.topMm, 10);
        const bottomM = Math.max(pg.bottomMm, 10);
        const usableW = PAGE_W - leftM - rightM;

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        registerFonts(doc);

        let curY = topM;
        let tabIndex = 0; // Tracks which tab stop to use next in a line

        function newPage() {
            doc.addPage();
            curY = topM;
        }

        function setRunFont(run) {
            let style = 'normal';
            if (run.bold && run.italic) style = 'bolditalic';
            else if (run.bold) style = 'bold';
            else if (run.italic) style = 'italic';
            doc.setFont('NotoSerif', style);
            doc.setFontSize(run.size);
        }

        function getTextWidth(text, run) {
            setRunFont(run);
            return doc.getStringUnitWidth(text) * run.size * PT_TO_MM;
        }

        // Word-wrap runs into lines, handling tabs with tab stops
        function wrapParagraph(runs, maxWidth, tabStops, pLeftIndent) {
            const lines = [];
            let currentLine = { segments: [], width: 0, height: 0 };
            let currentTabIdx = 0;

            for (const run of runs) {
                const sizeMm = run.size * PT_TO_MM;

                if (run.text === '\t') {
                    // Calculate tab width based on tab stops
                    let tabW = DEFAULT_TAB_MM;
                    if (tabStops.length > 0 && currentTabIdx < tabStops.length) {
                        const targetPos = tabStops[currentTabIdx].position;
                        const currentPos = currentLine.width;
                        tabW = Math.max(targetPos - currentPos, 4); // At least 4mm
                        currentTabIdx++;
                    }
                    currentLine.segments.push({ text: '', width: tabW, ...run });
                    currentLine.width += tabW;
                    currentLine.height = Math.max(currentLine.height, sizeMm);
                    continue;
                }

                const parts = run.text.split(/(\s+)/);

                for (const part of parts) {
                    if (part === '') continue;

                    const partW = getTextWidth(part, run);

                    if (currentLine.width + partW > maxWidth && currentLine.segments.length > 0 && part.trim() !== '') {
                        lines.push(currentLine);
                        currentLine = { segments: [], width: 0, height: 0 };
                        currentTabIdx = 0;
                    }

                    currentLine.segments.push({
                        text: part, width: partW,
                        bold: run.bold, italic: run.italic,
                        underline: run.underline, size: run.size,
                    });
                    currentLine.width += partW;
                    currentLine.height = Math.max(currentLine.height, sizeMm);
                }
            }

            if (currentLine.segments.length > 0) {
                lines.push(currentLine);
            }

            if (lines.length === 0) {
                const defSize = (runs[0]?.size || 12) * PT_TO_MM;
                lines.push({ segments: [], width: 0, height: defSize });
            }

            return lines;
        }

        function renderParagraph(para) {
            const pLeftIndent = leftM + para.leftIndent * PT_TO_MM;
            const pRightIndent = rightM + para.rightIndent * PT_TO_MM;
            const paraW = PAGE_W - pLeftIndent - pRightIndent;

            curY += para.spaceAbove * PT_TO_MM;

            const lines = wrapParagraph(para.runs, paraW, para.tabStops || [], pLeftIndent);
            const isJustify = para.alignment === 3;

            for (let li = 0; li < lines.length; li++) {
                const line = lines[li];
                const lineH = line.height * 1.5;
                const isLastLine = (li === lines.length - 1);

                if (curY + lineH > PAGE_H - bottomM) {
                    newPage();
                }

                let xStart = pLeftIndent;

                if (para.alignment === 1) {
                    // Center
                    xStart = pLeftIndent + (paraW - line.width) / 2;
                } else if (para.alignment === 2) {
                    // Right
                    xStart = pLeftIndent + paraW - line.width;
                }

                // Justify: distribute extra space between words (not on last line)
                let extraSpacePerGap = 0;
                if (isJustify && !isLastLine && line.width < paraW) {
                    const gaps = line.segments.filter(s => s.text && /^\s+$/.test(s.text)).length;
                    if (gaps > 0) {
                        extraSpacePerGap = (paraW - line.width) / gaps;
                    }
                }

                let runX = xStart;
                for (const seg of line.segments) {
                    setRunFont(seg);

                    if (seg.text) {
                        doc.text(seg.text, runX, curY + lineH * 0.7);

                        if (seg.underline) {
                            const textW = getTextWidth(seg.text, seg);
                            doc.setDrawColor(0, 0, 0);
                            doc.setLineWidth(0.15);
                            doc.line(runX, curY + lineH * 0.75, runX + textW, curY + lineH * 0.75);
                        }
                    }

                    runX += seg.width;

                    // Add extra space after whitespace segments for justify
                    if (isJustify && !isLastLine && seg.text && /^\s+$/.test(seg.text)) {
                        runX += extraSpacePerGap;
                    }
                }

                curY += lineH;
            }

            curY += para.spaceBelow * PT_TO_MM;
        }

        function renderTable(tableRows) {
            if (!tableRows || tableRows.length === 0) return;

            const maxCols = Math.max(...tableRows.map(r => r.cells.length));
            const colW = usableW / maxCols;

            for (const row of tableRows) {
                let rowH = 6;
                for (const cell of row.cells) {
                    let cellH = 2;
                    for (const p of cell.paragraphs) {
                        const text = p.runs.map(r => r.text).join('');
                        const size = p.runs[0]?.size || 12;
                        const sizeMm = size * PT_TO_MM;
                        setRunFont(p.runs[0] || { bold: false, italic: false, size: 12 });
                        const splitLines = doc.splitTextToSize(text, colW - 4);
                        cellH += splitLines.length * sizeMm * 1.5;
                    }
                    rowH = Math.max(rowH, cellH + 2);
                }

                if (curY + rowH > PAGE_H - bottomM) {
                    newPage();
                }

                row.cells.forEach((cell, ci) => {
                    const cellX = leftM + ci * colW;

                    doc.setDrawColor(180, 180, 180);
                    doc.setLineWidth(0.3);
                    doc.rect(cellX, curY, colW, rowH);

                    let cellY = curY + 2;
                    for (const p of cell.paragraphs) {
                        const text = p.runs.map(r => r.text).join('');
                        const run = p.runs[0] || { bold: false, italic: false, size: 12 };
                        setRunFont(run);
                        const sizeMm = run.size * PT_TO_MM;

                        const splitLines = doc.splitTextToSize(text, colW - 4);
                        for (const ln of splitLines) {
                            doc.text(ln, cellX + 2, cellY + sizeMm);
                            cellY += sizeMm * 1.5;
                        }
                    }
                });

                curY += rowH;
            }

            curY += 2;
        }

        for (const para of udf.paragraphs) {
            if (para.isHeader || para.isFooter) continue;

            if (para.type === 'table') {
                renderTable(para.table);
                continue;
            }

            renderParagraph(para);
        }

        return doc.output('blob');
    }

    // ── Download Helpers ──
    function downloadPdf(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function downloadAllAsZip(doneFiles) {
        const zip = new JSZip();
        doneFiles.forEach(entry => {
            const pdfName = entry.file.name.replace(/\.udf$/i, '.pdf');
            zip.file(pdfName, entry.result);
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'udf-to-pdf.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ── Utilities ──
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
})();
