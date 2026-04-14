/**
 * UDF to PDF/DOCX Converter
 * Parses UYAP .udf files (ZIP containing content.xml) and generates PDF/DOCX
 * with embedded Noto Serif font for full Turkish character support.
 * Features: header/footer, color, landscape, lists, colspan/rowspan,
 * preview, copy text, Word export, OCR, embedded images, signature info.
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
    const previewModal = document.getElementById('previewModal');
    const previewContent = document.getElementById('previewContent');
    const previewClose = document.getElementById('previewClose');
    const formatSelect = document.getElementById('formatSelect');
    const ocrCheckbox = document.getElementById('ocrCheckbox');

    let files = [];
    let fontsLoaded = false;
    let fontCache = {};
    let outputFormat = 'pdf';
    const toastContainer = document.getElementById('toastContainer');
    const progressDetail = document.getElementById('progressDetail');
    const downloadBar = document.getElementById('downloadBar');
    const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const selectedCountEl = document.getElementById('selectedCount');

    // ── Toast Notification System ──
    function showToast(message, type = 'error', duration = 5000) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${escapeHtml(message)}</span><button class="toast-close" aria-label="Kapat">&times;</button>`;
        toastContainer.appendChild(toast);
        const closeBtn = toast.querySelector('.toast-close');
        const remove = () => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            toast.addEventListener('animationend', () => toast.remove());
        };
        closeBtn.addEventListener('click', remove);
        if (duration > 0) setTimeout(remove, duration);
    }

    // ── GA4 Event Tracking ──
    function trackEvent(eventName, params) {
        if (typeof gtag === 'function') {
            gtag('event', eventName, params);
        }
    }

    // ── File Type Helpers ──
    const CONVERTIBLE_EXTENSIONS = ['.udf', '.tiff', '.tif'];
    function getFileExtension(name) { return name.toLowerCase().substring(name.lastIndexOf('.')); }
    function isConvertibleFile(name) { return CONVERTIBLE_EXTENSIONS.includes(getFileExtension(name)); }
    function isZipFile(name) { return getFileExtension(name) === '.zip'; }
    function isAcceptedFile(name) { return isConvertibleFile(name) || isZipFile(name); }
    function isTiffFile(name) { const ext = getFileExtension(name); return ext === '.tiff' || ext === '.tif'; }
    function isUdfFile(name) { return getFileExtension(name) === '.udf'; }
    function toPdfFilename(name) { return name.replace(/\.(udf|tiff|tif)$/i, '.pdf'); }
    function toDocxFilename(name) { return name.replace(/\.(udf)$/i, '.docx'); }
    function toOutputFilename(name) {
        if (outputFormat === 'docx' && isUdfFile(name)) return toDocxFilename(name);
        return toPdfFilename(name);
    }

    // ── Color Parsing ──
    function parseColor(colorStr) {
        if (!colorStr) return null;
        colorStr = colorStr.trim();
        if (/^#?[0-9a-fA-F]{6}$/.test(colorStr)) {
            const hex = colorStr.replace('#', '');
            return { r: parseInt(hex.substring(0, 2), 16), g: parseInt(hex.substring(2, 4), 16), b: parseInt(hex.substring(4, 6), 16) };
        }
        if (/^\d+,\s*\d+,\s*\d+$/.test(colorStr)) {
            const parts = colorStr.split(',').map(s => parseInt(s.trim()));
            return { r: parts[0], g: parts[1], b: parts[2] };
        }
        if (/^-?\d+$/.test(colorStr)) {
            let val = parseInt(colorStr);
            // Java negative packed integer: extract RGB via bitmasking (works for both positive and negative)
            const r = (val >> 16) & 0xFF;
            const g = (val >> 8) & 0xFF;
            const b = val & 0xFF;
            if (r === 0 && g === 0 && b === 0) return null; // black is default
            return { r, g, b };
        }
        return null;
    }

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

    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', async (e) => {
        await addFiles(e.target.files);
        fileInput.value = '';
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => isAcceptedFile(f.name));
        if (droppedFiles.length > 0) {
            await addFiles(droppedFiles);
        }
    });

    clearAllBtn.addEventListener('click', () => {
        files = [];
        if (downloadBar) downloadBar.hidden = true;
        renderFileList();
    });

    convertAllBtn.addEventListener('click', convertAll);

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', () => {
            const checked = selectAllCheckbox.checked;
            files.forEach(f => {
                if ((f.status === 'done' || f.status === 'passthrough') && f.result) {
                    f.selected = checked;
                }
            });
            renderFileList();
        });
    }

    if (downloadSelectedBtn) {
        downloadSelectedBtn.addEventListener('click', async () => {
            const selected = files.filter(f => (f.status === 'done' || f.status === 'passthrough') && f.result && f.selected !== false);
            if (selected.length === 0) return;
            if (selected.length === 1) {
                const entry = selected[0];
                const name = entry.status === 'passthrough' ? entry.file.name : toOutputFilename(entry.file.name);
                downloadBlob(entry.result, name);
                trackEvent('file_download', { file_count: 1, download_type: 'selected_single' });
            } else {
                await downloadAllAsZip(selected);
                trackEvent('file_download', { file_count: selected.length, download_type: 'selected_zip' });
            }
        });
    }

    if (formatSelect) {
        formatSelect.addEventListener('change', (e) => {
            outputFormat = e.target.value;
            trackEvent('format_select', { format: outputFormat });
        });
    }

    if (previewClose) {
        previewClose.addEventListener('click', () => {
            previewModal.hidden = true;
            previewModal.classList.remove('active');
        });
    }

    if (previewModal) {
        previewModal.addEventListener('click', (e) => {
            if (e.target === previewModal) {
                previewModal.hidden = true;
                previewModal.classList.remove('active');
            }
        });
    }

    // ── File Management ──
    async function addFiles(newFiles) {
        let addedCount = 0;
        for (const f of newFiles) {
            if (isZipFile(f.name)) {
                await extractZipAndAdd(f);
                addedCount++;
                continue;
            }
            if (!isConvertibleFile(f.name)) {
                showToast(`"${f.name}" desteklenmeyen dosya formatı. Yalnızca .udf, .tiff ve .zip dosyaları kabul edilir.`, 'warning');
                continue;
            }

            if (f.size > MAX_FILE_SIZE) {
                files.push({ file: f, status: 'error', result: null, errorMsg: 'Dosya boyutu 10MB limitini aşıyor.' });
                showToast(`"${f.name}" dosya boyutu 10MB limitini aşıyor.`, 'error');
            } else {
                files.push({ file: f, status: 'waiting', result: null, errorMsg: null });
                addedCount++;
            }
        }
        if (addedCount > 0) {
            trackEvent('file_upload', { file_count: addedCount, file_types: [...new Set(Array.from(newFiles).map(f => getFileExtension(f.name)))].join(',') });
        }
        renderFileList();
    }

    async function extractZipAndAdd(zipFile) {
        const MAX_ZIP_TOTAL = 50 * 1024 * 1024;
        let zip;
        try {
            const buf = await zipFile.arrayBuffer();
            zip = await JSZip.loadAsync(buf);
        } catch (e) {
            files.push({ file: zipFile, status: 'error', result: null, errorMsg: 'ZIP dosyası açılamadı: dosya bozuk veya geçersiz.' });
            return;
        }

        let found = 0;
        let totalExtracted = 0;
        const zipName = zipFile.name.replace(/\.zip$/i, '');

        for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            if (path.includes('..')) continue;
            const fileName = path.split('/').pop();
            if (!fileName) continue;

            try {
                const blob = await entry.async('blob');

                totalExtracted += blob.size;
                if (totalExtracted > MAX_ZIP_TOTAL) {
                    files.push({ file: zipFile, status: 'error', result: null, errorMsg: 'ZIP içeriği 50MB toplam limiti aşıyor.' });
                    return;
                }

                const file = new File([blob], fileName, { type: blob.type });

                if (isConvertibleFile(fileName)) {
                    if (file.size > MAX_FILE_SIZE) {
                        files.push({ file, status: 'error', result: null, errorMsg: 'Dosya boyutu 10MB limitini aşıyor.', fromZip: zipName });
                    } else {
                        files.push({ file, status: 'waiting', result: null, errorMsg: null, fromZip: zipName });
                    }
                } else {
                    files.push({ file, status: 'passthrough', result: blob, errorMsg: null, fromZip: zipName });
                }
                found++;
            } catch (e) {
                files.push({
                    file: { name: fileName, size: 0 },
                    status: 'error', result: null,
                    errorMsg: 'ZIP içinden çıkarılamadı: ' + fileName,
                    fromZip: zipName
                });
            }
        }

        if (found === 0) {
            files.push({ file: zipFile, status: 'error', result: null, errorMsg: 'ZIP dosyası boş.' });
        }
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
            const isDownloadable = (entry.status === 'done' || entry.status === 'passthrough') && entry.result;
            const downloadBtn = isDownloadable
                ? `<button class="btn btn-success btn-sm" data-download="${i}">İndir</button>`
                : '';
            const errorMsg = entry.errorMsg
                ? `<div class="file-item-error">${escapeHtml(entry.errorMsg)}</div>`
                : '';

            const isUdf = isUdfFile(entry.file.name);
            const canPreviewOrCopy = isUdf && (entry.status === 'waiting' || entry.status === 'done');
            const previewBtn = canPreviewOrCopy
                ? `<button class="btn btn-outline btn-sm" data-preview="${i}" title="Önizle">Önizle</button>`
                : '';
            const copyBtn = canPreviewOrCopy
                ? `<button class="btn btn-outline btn-sm" data-copy="${i}" title="Metni Kopyala">Kopyala</button>`
                : '';

            const iconLabel = entry.status === 'passthrough'
                ? getFileExtension(entry.file.name).replace('.', '').toUpperCase()
                : (isTiffFile(entry.file.name) ? 'TIFF' : 'UDF');
            const fromZipLabel = entry.fromZip ? `<span class="file-item-zip">${escapeHtml(entry.fromZip)}.zip</span>` : '';

            const sigInfo = entry.signatureInfo
                ? `<div class="file-item-sig" title="İmza Bilgisi">${escapeHtml(entry.signatureInfo)}</div>`
                : '';

            const selectCheckbox = isDownloadable
                ? `<input type="checkbox" class="file-select-checkbox" data-select="${i}" ${entry.selected !== false ? 'checked' : ''} aria-label="${escapeHtml(entry.file.name)} seç">`
                : '';

            div.innerHTML = `
                ${selectCheckbox}
                <div class="file-item-icon">${iconLabel}</div>
                <div class="file-item-info">
                    <div class="file-item-name" title="${escapeHtml(entry.file.name)}">${escapeHtml(entry.file.name)} ${fromZipLabel}</div>
                    <div class="file-item-size">${formatSize(entry.file.size)}</div>
                    ${errorMsg}
                    ${sigInfo}
                </div>
                <div class="file-item-status">
                    ${statusBadge}
                    ${previewBtn}
                    ${copyBtn}
                    ${downloadBtn}
                    <button class="btn-remove" data-remove="${i}" title="Kaldır">&times;</button>
                </div>
            `;
            fileItems.appendChild(div);
        });

        // Remove button handlers
        fileItems.querySelectorAll('[data-remove]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFile(parseInt(btn.dataset.remove));
            });
        });

        // Download button handlers
        fileItems.querySelectorAll('[data-download]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const entry = files[parseInt(btn.dataset.download)];
                if (entry && entry.result) {
                    const name = entry.status === 'passthrough' ? entry.file.name : toOutputFilename(entry.file.name);
                    downloadBlob(entry.result, name);
                }
            });
        });

        // Preview button handlers
        fileItems.querySelectorAll('[data-preview]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const entry = files[parseInt(btn.dataset.preview)];
                if (entry) await previewFile(entry.file);
            });
        });

        // Copy text button handlers
        fileItems.querySelectorAll('[data-copy]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const entry = files[parseInt(btn.dataset.copy)];
                if (entry) await copyFileText(entry.file, btn);
            });
        });

        // File select checkbox handlers
        fileItems.querySelectorAll('.file-select-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const idx = parseInt(cb.dataset.select);
                files[idx].selected = cb.checked;
                updateDownloadBar();
            });
        });

        updateDownloadBar();
    }

    function updateDownloadBar() {
        const downloadable = files.filter(f => (f.status === 'done' || f.status === 'passthrough') && f.result);
        if (downloadable.length <= 1) {
            if (downloadBar) downloadBar.hidden = true;
            return;
        }
        if (downloadBar) downloadBar.hidden = false;

        const selectedFiles = downloadable.filter(f => f.selected !== false);
        const count = selectedFiles.length;
        const total = downloadable.length;

        if (selectedCountEl) {
            selectedCountEl.textContent = `${count}/${total} dosya seçili`;
        }
        if (downloadSelectedBtn) {
            downloadSelectedBtn.disabled = count === 0;
        }
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = count === total;
            selectAllCheckbox.indeterminate = count > 0 && count < total;
        }
    }

    function getStatusBadge(status) {
        const map = {
            waiting: '<span class="badge badge-waiting">Bekliyor</span>',
            converting: '<span class="badge badge-converting">Dönüştürülüyor</span>',
            done: '<span class="badge badge-done">Tamamlandı</span>',
            error: '<span class="badge badge-error">Hata</span>',
            passthrough: '<span class="badge badge-done">Hazır</span>',
        };
        return map[status] || '';
    }

    // ── Convert All ──
    async function convertAll() {
        const pending = files.filter(f => f.status === 'waiting');
        if (pending.length === 0) return;

        convertAllBtn.disabled = true;
        progressArea.hidden = false;
        if (progressDetail) progressDetail.textContent = '';

        const hasUdfFiles = pending.some(f => isUdfFile(f.file.name));
        if (hasUdfFiles) {
            progressText.textContent = 'Fontlar yükleniyor...';
            if (progressDetail) progressDetail.textContent = 'Türkçe karakter desteği için font dosyaları indiriliyor...';
            try {
                await loadFonts();
            } catch (err) {
                console.error('Font loading error:', err);
                progressText.textContent = 'Font yükleme hatası!';
                showToast('Font dosyaları yüklenemedi. Sayfa bir HTTP sunucu üzerinden açılmalıdır (file:// desteklenmez).', 'error', 0);
                trackEvent('conversion_error', { error_type: 'font_load', error_message: err.message });
                convertAllBtn.disabled = false;
                return;
            }
        }

        const startTime = Date.now();
        let processed = 0;
        const total = files.filter(f => f.status === 'waiting').length;

        trackEvent('conversion_start', { file_count: total, output_format: outputFormat });

        for (let i = 0; i < files.length; i++) {
            if (files[i].status !== 'waiting') continue;

            files[i].status = 'converting';
            renderFileList();
            processed++;
            const pct = Math.round(((processed - 1) / Math.max(total, 1)) * 100);
            progressBar.style.width = `${pct}%`;
            progressText.textContent = `Dosya ${processed}/${total} dönüştürülüyor...`;
            if (progressDetail) {
                const fileType = isTiffFile(files[i].file.name) ? 'TIFF' : 'UDF';
                progressDetail.textContent = `${files[i].file.name} — ${fileType} ayrıştırılıyor...`;
            }

            try {
                let result;
                if (isTiffFile(files[i].file.name)) {
                    if (progressDetail) progressDetail.textContent = `${files[i].file.name} — TIFF → PDF oluşturuluyor...`;
                    const useOcr = ocrCheckbox && ocrCheckbox.checked;
                    result = await convertTiffToPdf(files[i].file, useOcr);
                } else if (outputFormat === 'docx') {
                    if (progressDetail) progressDetail.textContent = `${files[i].file.name} — Word belgesi oluşturuluyor...`;
                    result = await convertUdfToDocx(files[i].file);
                } else {
                    if (progressDetail) progressDetail.textContent = `${files[i].file.name} — PDF oluşturuluyor...`;
                    result = await convertUdfToPdf(files[i].file);
                }
                files[i].status = 'done';
                files[i].result = result.blob || result;
                files[i].signatureInfo = result.signatureInfo || null;
                files[i].errorMsg = null;
            } catch (err) {
                console.error('Conversion error:', err);
                files[i].status = 'error';
                files[i].errorMsg = getErrorMessage(err);
                showToast(`"${files[i].file.name}" dönüştürülemedi: ${files[i].errorMsg}`, 'error');
                trackEvent('conversion_error', { error_type: 'file_convert', file_name: files[i].file.name, error_message: err.message });
            }

            renderFileList();
        }

        progressBar.style.width = '100%';
        const doneCount = files.filter(f => f.status === 'done').length;
        const passthroughCount = files.filter(f => f.status === 'passthrough').length;
        const errorCount = files.filter(f => f.status === 'error').length;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (errorCount > 0) {
            progressText.textContent = `${doneCount} dosya dönüştürüldü, ${errorCount} dosyada hata oluştu.`;
        } else {
            progressText.textContent = `Tüm dosyalar hazır! (${elapsed} saniye)`;
        }
        if (progressDetail) progressDetail.textContent = '';

        trackEvent('conversion_complete', { total: total, success: doneCount, errors: errorCount, duration_sec: elapsed, output_format: outputFormat });

        convertAllBtn.disabled = false;

        const outputFiles = files.filter(f => f.status === 'done' || f.status === 'passthrough');
        // Mark all converted files as selected by default
        outputFiles.forEach(f => { if (f.selected === undefined) f.selected = true; });

        if (outputFiles.length === 1) {
            const entry = outputFiles[0];
            const name = entry.status === 'passthrough' ? entry.file.name : toOutputFilename(entry.file.name);
            downloadBlob(entry.result, name);
            trackEvent('file_download', { file_count: 1, download_type: 'single' });
        } else if (outputFiles.length > 1) {
            // Show download bar for user to select which files to download
            updateDownloadBar();
            showToast(`${outputFiles.length} dosya hazır — indirmek istediklerinizi seçin.`, 'success', 5000);
        }
    }

    function getErrorMessage(err) {
        const msg = err.message || '';
        if (msg.includes('content.xml')) return 'Geçerli bir UDF dosyası değil: content.xml bulunamadı.';
        if (msg.includes('Not a valid zip') || msg.includes('Corrupted') || msg.includes('invalid')) return 'Dosya bozuk veya geçerli bir UDF/TIFF dosyası değil.';
        if (msg.includes('End of data')) return 'Dosya bozuk — eksik veya tamamlanmamış arşiv.';
        if (msg.includes('TIFF')) return 'Geçerli bir TIFF dosyası değil veya dosya bozuk.';
        if (msg.includes('UTIF')) return 'TIFF dosyası işlenirken hata oluştu. Dosya formatını kontrol edin.';
        if (msg.includes('docx')) return 'Word dönüştürme hatası: ' + msg;
        if (msg.includes('Tesseract') || msg.includes('OCR')) return 'OCR işlemi başarısız: ' + msg;
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

        // Page format with dimensions
        const pageFormat = doc.querySelector('pageFormat');
        const page = {
            leftMargin: parseFloat(pageFormat?.getAttribute('leftMargin') || '56.7'),
            rightMargin: parseFloat(pageFormat?.getAttribute('rightMargin') || '42.5'),
            topMargin: parseFloat(pageFormat?.getAttribute('topMargin') || '42.5'),
            bottomMargin: parseFloat(pageFormat?.getAttribute('bottomMargin') || '28.3'),
            pageWidth: parseFloat(pageFormat?.getAttribute('pageWidth') || '0'),
            pageHeight: parseFloat(pageFormat?.getAttribute('pageHeight') || '0'),
        };

        const PT_TO_MM = 0.3528;
        page.leftMm = page.leftMargin * PT_TO_MM;
        page.rightMm = page.rightMargin * PT_TO_MM;
        page.topMm = page.topMargin * PT_TO_MM;
        page.bottomMm = page.bottomMargin * PT_TO_MM;
        page.widthMm = page.pageWidth > 0 ? page.pageWidth * PT_TO_MM : 210;
        page.heightMm = page.pageHeight > 0 ? page.pageHeight * PT_TO_MM : 297;

        // Detect orientation
        if (page.widthMm > 0 && page.heightMm > 0 && page.widthMm > page.heightMm) {
            page.orientation = 'landscape';
        } else {
            page.orientation = 'portrait';
        }

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
        const headerParagraphs = [];
        const footerParagraphs = [];
        let headerStartPage = 1;
        let footerStartPage = 1;
        let footerPageNumber = null;

        if (elements) {
            for (const el of elements.children) {
                if (el.tagName === 'paragraph') {
                    paragraphs.push(parseParagraph(el, rawText, styles));
                } else if (el.tagName === 'header') {
                    headerStartPage = parseInt(el.getAttribute('startPage') || '1');
                    for (const p of el.querySelectorAll('paragraph')) {
                        headerParagraphs.push(parseParagraph(p, rawText, styles));
                    }
                } else if (el.tagName === 'footer') {
                    footerStartPage = parseInt(el.getAttribute('startPage') || '1');
                    // Extract page number spec from footer element attributes
                    const pageNumSpec = el.getAttribute('pageNumber-spec') || '';
                    const pageNumSep = el.getAttribute('pageNumber-seperator') || el.getAttribute('pageNumber-separator') || '/';
                    const pageNumSize = parseFloat(el.getAttribute('pageNumber-fontSize') || '0');
                    const pageNumFont = el.getAttribute('pageNumber-fontFace') || '';
                    if (pageNumSpec) {
                        footerPageNumber = { spec: pageNumSpec, separator: pageNumSep, fontSize: pageNumSize, fontFace: pageNumFont };
                    }
                    for (const p of el.querySelectorAll('paragraph')) {
                        footerParagraphs.push(parseParagraph(p, rawText, styles));
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
                    listType: null, listLevel: 0,
                    runs: [{ text: line, bold: false, italic: false, underline: false, size: 12, color: null }],
                });
            });
        }

        // Extract embedded images
        const images = {};
        for (const [path, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const lowerPath = path.toLowerCase();
            if (lowerPath.match(/\.(png|jpg|jpeg|gif|bmp)$/)) {
                try {
                    const imgData = await entry.async('base64');
                    const ext = lowerPath.substring(lowerPath.lastIndexOf('.') + 1).replace('jpg', 'jpeg');
                    images[path] = { data: imgData, format: ext.toUpperCase() };
                } catch (e) { /* skip unreadable images */ }
            }
        }

        // Parse image references from XML
        const imageRefs = [];
        doc.querySelectorAll('image, object, picture').forEach(imgEl => {
            const src = imgEl.getAttribute('src') || imgEl.getAttribute('href') || imgEl.getAttribute('name') || '';
            const width = parseFloat(imgEl.getAttribute('width') || '0') * PT_TO_MM;
            const height = parseFloat(imgEl.getAttribute('height') || '0') * PT_TO_MM;
            if (src && images[src]) {
                imageRefs.push({ src, width, height, imageData: images[src] });
            }
        });

        // Parse signature info
        const signatureInfo = await parseSignatures(zip);

        return { rawText, page, styles, paragraphs, headerParagraphs, footerParagraphs, headerStartPage, footerStartPage, footerPageNumber, images, imageRefs, signatureInfo };
    }

    async function parseSignatures(zip) {
        // Try sign.sgn first (PKCS#7/CMS binary format — real UDF files use this)
        const signFile = zip.file('sign.sgn');
        if (signFile) {
            try {
                const buf = await signFile.async('arraybuffer');
                const sigInfo = parsePkcs7Signature(new Uint8Array(buf));
                if (sigInfo) return sigInfo;
            } catch (e) { /* fall through to XML */ }
        }

        // Fallback: try XML signature files
        const sigPaths = ['signatures.xml', 'META-INF/signatures.xml', 'meta-inf/signatures.xml'];
        let sigXml = null;

        for (const path of sigPaths) {
            const f = zip.file(path);
            if (f) {
                try {
                    sigXml = await f.async('string');
                    break;
                } catch (e) { /* skip */ }
            }
        }

        if (!sigXml) {
            for (const [path, entry] of Object.entries(zip.files)) {
                if (!entry.dir && path.toLowerCase().includes('signature') && path.toLowerCase().endsWith('.xml')) {
                    try {
                        sigXml = await entry.async('string');
                        break;
                    } catch (e) { /* skip */ }
                }
            }
        }

        if (!sigXml) return null;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(sigXml, 'text/xml');
            const signatures = [];

            const sigNodes = doc.querySelectorAll('Signature, signature, SignatureInfo, signatureInfo');
            for (const node of sigNodes) {
                const name = node.getAttribute('signerName') || node.getAttribute('name') ||
                    node.querySelector('SignerName, signerName, Name, name')?.textContent || '';
                const institution = node.getAttribute('institution') || node.getAttribute('organization') ||
                    node.querySelector('Institution, institution, Organization, organization')?.textContent || '';
                const date = node.getAttribute('signDate') || node.getAttribute('date') ||
                    node.querySelector('SignDate, signDate, Date, date')?.textContent || '';
                const title = node.getAttribute('title') ||
                    node.querySelector('Title, title')?.textContent || '';

                if (name || institution || date) {
                    signatures.push({ name, institution, date, title });
                }
            }

            if (signatures.length === 0) return null;

            return signatures.map(s => {
                const parts = [];
                if (s.name) parts.push(s.name);
                if (s.title) parts.push(`(${s.title})`);
                if (s.institution) parts.push(`- ${s.institution}`);
                if (s.date) parts.push(`[${s.date}]`);
                return parts.join(' ');
            }).join(' | ');
        } catch (e) {
            return null;
        }
    }

    // Extract signer info from PKCS#7/CMS binary by finding X.509 certificate fields
    function parsePkcs7Signature(bytes) {
        // Extract readable UTF-8/ASCII strings from the binary
        // Look for common X.509 Distinguished Name OID patterns
        const text = extractReadableStrings(bytes);

        // Parse CN (Common Name), OU (Organizational Unit), O (Organization), L (Locality)
        const fields = {};

        // Try to find OID-prefixed fields in DER encoding
        // OID 2.5.4.3 = CN (55 04 03), OID 2.5.4.10 = O (55 04 0A), OID 2.5.4.11 = OU (55 04 0B)
        // OID 2.5.4.7 = L (55 04 07), OID 2.5.4.5 = serialNumber (55 04 05)
        const oidMap = {
            cn: [0x55, 0x04, 0x03],
            serialNumber: [0x55, 0x04, 0x05],
            l: [0x55, 0x04, 0x07],
            o: [0x55, 0x04, 0x0A],
            ou: [0x55, 0x04, 0x0B],
        };

        for (const [fieldName, oid] of Object.entries(oidMap)) {
            fields[fieldName] = findOidValues(bytes, oid);
        }

        // Filter out CA certificate entries — signer CN is the one that doesn't contain CA keywords
        const caKeywords = ['TÜRKTRUST', 'TURKTRUST', 'TBB-', 'Bilgi İletişim', 'Elektronik Sertifika',
            'Dayanak', 'e-Guven', 'E-GUVEN', 'Kamu SM', 'Kamu Sertifikasyon', 'E-Tugra', 'E-TUGRA',
            'HAVELSAN', 'Sertifika Hizmet', 'Nitelikli Elektronik'];
        const isCA = (str) => caKeywords.some(kw => str.includes(kw));

        const signerCN = (fields.cn || []).find(v => !isCA(v)) || '';
        const signerOU = (fields.ou || []).find(v => !isCA(v)) || '';
        // Signer's location — prefer values that aren't the CA's typical location
        const signerLoc = (fields.l || []).length > 1
            ? ((fields.l || []).find(v => v !== 'Ankara') || (fields.l || [])[0])
            : (fields.l || [])[0] || '';

        if (!signerCN) return null;

        const parts = [];
        parts.push(signerCN);
        if (signerOU) parts.push(`(${signerOU})`);
        if (signerLoc) parts.push(`[${signerLoc}]`);
        return parts.join(' ');
    }

    // Find string values following an OID in DER-encoded ASN.1
    function findOidValues(bytes, oid) {
        const results = [];
        for (let i = 0; i < bytes.length - oid.length - 4; i++) {
            let match = true;
            for (let j = 0; j < oid.length; j++) {
                if (bytes[i + j] !== oid[j]) { match = false; break; }
            }
            if (!match) continue;

            // After OID, expect a string type tag (UTF8String=0x0C, PrintableString=0x13, IA5String=0x16)
            // with a length byte, then the string data
            let pos = i + oid.length;
            // Skip possible NULL or wrapper bytes
            while (pos < bytes.length && pos < i + oid.length + 4) {
                const tag = bytes[pos];
                if (tag === 0x0C || tag === 0x13 || tag === 0x16) {
                    const len = bytes[pos + 1];
                    if (len > 0 && len < 200 && pos + 2 + len <= bytes.length) {
                        try {
                            const strBytes = bytes.slice(pos + 2, pos + 2 + len);
                            const str = tag === 0x0C
                                ? new TextDecoder('utf-8').decode(strBytes)
                                : String.fromCharCode(...strBytes);
                            if (str.trim()) results.push(str.trim());
                        } catch (e) { /* skip */ }
                    }
                    break;
                }
                pos++;
            }
        }
        return results;
    }

    // Extract readable ASCII/UTF-8 strings from binary data
    function extractReadableStrings(bytes) {
        const strings = [];
        let current = '';
        for (let i = 0; i < bytes.length; i++) {
            const b = bytes[i];
            if (b >= 32 && b < 127) {
                current += String.fromCharCode(b);
            } else {
                if (current.length >= 4) strings.push(current);
                current = '';
            }
        }
        if (current.length >= 4) strings.push(current);
        return strings.join(' ');
    }

    function parseTabStops(tabSetStr) {
        if (!tabSetStr) return [];
        return tabSetStr.split(',').map(entry => {
            const parts = entry.split(':');
            return {
                position: parseFloat(parts[0] || '0') * 0.3528,
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

        // List support — UDF uses Numbered="true", ListLevel, ListId, SecListTypeLevel1
        const numbered = el.getAttribute('Numbered') === 'true';
        const listLevel = parseInt(el.getAttribute('ListLevel') || el.getAttribute('listLevel') || '0');
        const listIndex = parseInt(el.getAttribute('ListId') || el.getAttribute('listId') || el.getAttribute('listIndex') || el.getAttribute('ListIndex') || '0');
        const secListType = el.getAttribute('SecListTypeLevel1') || '';
        const numberType = el.getAttribute('NumberType') || '';
        const listType = numbered
            ? ((secListType.includes('NUMBER') || numberType) ? 'number' : 'bullet')
            : (el.getAttribute('listType') || el.getAttribute('ListType') || null);

        const runs = [];
        for (const child of el.children) {
            const startOffset = parseInt(child.getAttribute('startOffset') || '0');
            const length = parseInt(child.getAttribute('length') || '0');
            const text = rawText.substring(startOffset, startOffset + length);

            const bold = child.getAttribute('bold') === 'true' || (child.getAttribute('bold') == null && baseStyle.bold);
            const italic = child.getAttribute('italic') === 'true' || (child.getAttribute('italic') == null && baseStyle.italic);
            const underline = child.getAttribute('underline') === 'true';
            const size = parseFloat(child.getAttribute('size') || baseStyle.size || '12');

            // Color support
            const colorStr = child.getAttribute('foreground') || child.getAttribute('color') || child.getAttribute('Foreground') || child.getAttribute('Color') || '';
            const color = parseColor(colorStr);

            if (child.tagName === 'tab') {
                runs.push({ text: '\t', bold, italic, underline, size, color });
            } else if (child.tagName === 'content' || child.tagName === 'field' || child.tagName === 'space') {
                runs.push({ text, bold, italic, underline, size, color });
            } else {
                // Unknown element — still try to extract text
                runs.push({ text, bold, italic, underline, size, color });
            }
        }

        return { alignment, spaceAbove, spaceBelow, leftIndent, rightIndent, tabStops, runs, listType, listLevel, listIndex };
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
                const colspan = parseInt(cellEl.getAttribute('colspan') || cellEl.getAttribute('colSpan') || cellEl.getAttribute('ColumnSpan') || '1');
                const rowspan = parseInt(cellEl.getAttribute('rowspan') || cellEl.getAttribute('rowSpan') || cellEl.getAttribute('RowSpan') || '1');
                cells.push({ paragraphs: cellParagraphs, colspan, rowspan });
            }
            rows.push({ cells });
        }
        return rows;
    }

    // ── PDF Generation ──
    const PT_TO_MM = 0.3528;
    const DEFAULT_TAB_MM = 15;

    async function convertUdfToPdf(file) {
        const udf = await parseUdf(file);
        const pg = udf.page;

        // Landscape support
        const isLandscape = pg.orientation === 'landscape';
        const PAGE_W = isLandscape ? 297 : 210;
        const PAGE_H = isLandscape ? 210 : 297;

        const leftM = Math.max(pg.leftMm, 10);
        const rightM = Math.max(pg.rightMm, 10);
        const topM = Math.max(pg.topMm, 10);
        const bottomM = Math.max(pg.bottomMm, 10);
        const usableW = PAGE_W - leftM - rightM;

        const orientation = isLandscape ? 'landscape' : 'portrait';
        const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
        registerFonts(doc);

        let curY = topM;

        // Header/Footer rendering helpers
        function renderHeaderContent() {
            if (udf.headerParagraphs.length === 0) return;
            if (pageCount < udf.headerStartPage) return; // startPage desteği
            const savedY = curY;
            curY = 6; // Start headers at 6mm from top
            for (const para of udf.headerParagraphs) {
                renderParagraphInArea(para, leftM, rightM, PAGE_W, 4, topM - 2);
            }
            curY = savedY;
        }

        function renderFooterContent(pageNum, totalPages) {
            if (pageNum < udf.footerStartPage) return; // startPage desteği
            const savedY = curY;
            curY = PAGE_H - bottomM + 2;

            // Render footer paragraphs with page number placeholders
            if (udf.footerParagraphs.length > 0) {
                for (const para of udf.footerParagraphs) {
                    const processedPara = {
                        ...para,
                        runs: para.runs.map(r => ({
                            ...r,
                            text: r.text
                                .replace(/\{PAGE\}/gi, String(pageNum))
                                .replace(/\{PAGES\}/gi, String(totalPages))
                                .replace(/\{page\}/g, String(pageNum))
                                .replace(/\{pages\}/g, String(totalPages))
                        }))
                    };
                    renderParagraphInArea(processedPara, leftM, rightM, PAGE_W, PAGE_H - bottomM + 2, PAGE_H - 4);
                }
            }

            // Render page number from footer element attributes (pageNumber-spec)
            if (udf.footerPageNumber) {
                const sep = udf.footerPageNumber.separator;
                const pageText = pageNum + sep + totalPages;
                const fontSize = udf.footerPageNumber.fontSize || 9;
                doc.setFont('NotoSerif', 'normal');
                doc.setFontSize(fontSize);
                doc.setTextColor(0, 0, 0);
                const textW = doc.getStringUnitWidth(pageText) * fontSize * PT_TO_MM;
                doc.text(pageText, PAGE_W / 2 - textW / 2, PAGE_H - 4);
            }

            curY = savedY;
        }

        let pageCount = 1;

        // Render header on first page
        renderHeaderContent();

        function newPage() {
            doc.addPage();
            pageCount++;
            curY = topM;
            renderHeaderContent();
        }

        function setRunFont(run) {
            let style = 'normal';
            if (run.bold && run.italic) style = 'bolditalic';
            else if (run.bold) style = 'bold';
            else if (run.italic) style = 'italic';
            doc.setFont('NotoSerif', style);
            doc.setFontSize(run.size);
        }

        function setRunColor(run) {
            if (run.color) {
                doc.setTextColor(run.color.r, run.color.g, run.color.b);
            } else {
                doc.setTextColor(0, 0, 0);
            }
        }

        function getTextWidth(text, run) {
            setRunFont(run);
            return doc.getStringUnitWidth(text) * run.size * PT_TO_MM;
        }

        function wrapParagraph(runs, maxWidth, tabStops, pLeftIndent) {
            const lines = [];
            let currentLine = { segments: [], width: 0, height: 0 };
            let currentTabIdx = 0;

            for (const run of runs) {
                const sizeMm = run.size * PT_TO_MM;

                if (run.text === '\t') {
                    let tabW = DEFAULT_TAB_MM;
                    if (tabStops.length > 0 && currentTabIdx < tabStops.length) {
                        const targetPos = tabStops[currentTabIdx].position;
                        const currentPos = currentLine.width;
                        tabW = Math.max(targetPos - currentPos, 4);
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
                        color: run.color,
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
            const listIndent = para.listType ? (para.listLevel + 1) * 5 : 0;
            const pLeftIndent = leftM + para.leftIndent * PT_TO_MM + listIndent;
            const pRightIndent = rightM + para.rightIndent * PT_TO_MM;
            const paraW = PAGE_W - pLeftIndent - pRightIndent;

            curY += para.spaceAbove * PT_TO_MM;

            // Add list marker to runs if it's a list item
            let runs = para.runs;
            if (para.listType) {
                const marker = getListMarker(para.listType, para.listLevel, para.listIndex);
                if (marker) {
                    const markerRun = {
                        text: marker,
                        bold: false,
                        italic: false,
                        underline: false,
                        size: runs[0]?.size || 12,
                        color: null,
                    };
                    runs = [markerRun, ...runs];
                }
            }

            const lines = wrapParagraph(runs, paraW, para.tabStops || [], pLeftIndent);
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
                    xStart = pLeftIndent + (paraW - line.width) / 2;
                } else if (para.alignment === 2) {
                    xStart = pLeftIndent + paraW - line.width;
                }

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
                    setRunColor(seg);

                    if (seg.text) {
                        doc.text(seg.text, runX, curY + lineH * 0.7);

                        if (seg.underline) {
                            const textW = getTextWidth(seg.text, seg);
                            const c = seg.color || { r: 0, g: 0, b: 0 };
                            doc.setDrawColor(c.r, c.g, c.b);
                            doc.setLineWidth(0.15);
                            doc.line(runX, curY + lineH * 0.75, runX + textW, curY + lineH * 0.75);
                        }
                    }

                    runX += seg.width;

                    if (isJustify && !isLastLine && seg.text && /^\s+$/.test(seg.text)) {
                        runX += extraSpacePerGap;
                    }
                }

                // Reset to black
                doc.setTextColor(0, 0, 0);
                curY += lineH;
            }

            curY += para.spaceBelow * PT_TO_MM;
        }

        // Simplified paragraph rendering for header/footer areas
        function renderParagraphInArea(para, lMargin, rMargin, pageW, minY, maxY) {
            const pLeftIndent = lMargin + para.leftIndent * PT_TO_MM;
            const pRightIndent = rMargin + para.rightIndent * PT_TO_MM;
            const paraW = pageW - pLeftIndent - pRightIndent;
            const runs = para.runs;

            const text = runs.map(r => r.text).join('');
            if (!text.trim()) return;

            const firstRun = runs[0] || { bold: false, italic: false, size: 9, color: null };
            const fontSize = Math.min(firstRun.size, 10); // Cap header/footer font size
            setRunFont({ ...firstRun, size: fontSize });
            setRunColor(firstRun);

            const sizeMm = fontSize * PT_TO_MM;
            const lineH = sizeMm * 1.4;

            if (curY + lineH > maxY) return;

            let xStart = pLeftIndent;
            const textW = doc.getStringUnitWidth(text) * fontSize * PT_TO_MM;

            if (para.alignment === 1) {
                xStart = pLeftIndent + (paraW - textW) / 2;
            } else if (para.alignment === 2) {
                xStart = pLeftIndent + paraW - textW;
            }

            doc.setFontSize(fontSize);
            doc.text(text, xStart, curY + lineH * 0.7);
            curY += lineH;

            doc.setTextColor(0, 0, 0);
        }

        function renderTable(tableRows) {
            if (!tableRows || tableRows.length === 0) return;

            // Calculate effective column count considering colspan
            const maxCols = Math.max(...tableRows.map(r => {
                let cols = 0;
                for (const cell of r.cells) cols += (cell.colspan || 1);
                return cols;
            }));
            const colW = usableW / maxCols;

            // Track rowspan occupancy
            const spanMap = []; // spanMap[rowIdx][colIdx] = true if occupied by rowspan

            for (let ri = 0; ri < tableRows.length; ri++) {
                const row = tableRows[ri];
                if (!spanMap[ri]) spanMap[ri] = {};

                let rowH = 6;
                let colIdx = 0;

                // Calculate row height
                for (const cell of row.cells) {
                    while (spanMap[ri][colIdx]) colIdx++;
                    const cellSpan = cell.colspan || 1;

                    let cellH = 2;
                    for (const p of cell.paragraphs) {
                        const text = p.runs.map(r => r.text).join('');
                        const size = p.runs[0]?.size || 12;
                        const sizeMm = size * PT_TO_MM;
                        setRunFont(p.runs[0] || { bold: false, italic: false, size: 12 });
                        const splitLines = doc.splitTextToSize(text, colW * cellSpan - 4);
                        cellH += splitLines.length * sizeMm * 1.5;
                    }
                    rowH = Math.max(rowH, cellH + 2);

                    // Mark rowspan cells
                    const rs = cell.rowspan || 1;
                    for (let dr = 0; dr < rs; dr++) {
                        if (!spanMap[ri + dr]) spanMap[ri + dr] = {};
                        for (let dc = 0; dc < cellSpan; dc++) {
                            if (dr > 0) spanMap[ri + dr][colIdx + dc] = true;
                        }
                    }

                    colIdx += cellSpan;
                }

                if (curY + rowH > PAGE_H - bottomM) {
                    newPage();
                }

                colIdx = 0;
                row.cells.forEach((cell) => {
                    while (spanMap[ri][colIdx]) colIdx++;

                    const cellSpan = cell.colspan || 1;
                    const cellWidth = colW * cellSpan;
                    const cellX = leftM + colIdx * colW;

                    doc.setDrawColor(180, 180, 180);
                    doc.setLineWidth(0.3);
                    doc.rect(cellX, curY, cellWidth, rowH);

                    let cellY = curY + 2;
                    for (const p of cell.paragraphs) {
                        const text = p.runs.map(r => r.text).join('');
                        const run = p.runs[0] || { bold: false, italic: false, size: 12, color: null };
                        setRunFont(run);
                        setRunColor(run);
                        const sizeMm = run.size * PT_TO_MM;

                        const splitLines = doc.splitTextToSize(text, cellWidth - 4);
                        for (const ln of splitLines) {
                            doc.text(ln, cellX + 2, cellY + sizeMm);
                            cellY += sizeMm * 1.5;
                        }
                    }
                    doc.setTextColor(0, 0, 0);

                    colIdx += cellSpan;
                });

                curY += rowH;
            }

            curY += 2;
        }

        // Render embedded images inline
        function renderImageRef(imgRef) {
            if (!imgRef.imageData) return;
            const w = imgRef.width || 60;
            const h = imgRef.height || 40;

            if (curY + h > PAGE_H - bottomM) {
                newPage();
            }

            try {
                doc.addImage(
                    'data:image/' + imgRef.imageData.format.toLowerCase() + ';base64,' + imgRef.imageData.data,
                    imgRef.imageData.format,
                    leftM, curY, w, h
                );
                curY += h + 2;
            } catch (e) {
                console.warn('Image render failed:', e);
            }
        }

        // Main rendering loop
        let imageRefIdx = 0;
        for (const para of udf.paragraphs) {
            if (para.type === 'table') {
                renderTable(para.table);
                continue;
            }

            renderParagraph(para);
        }

        // Render any remaining image refs
        for (const imgRef of udf.imageRefs) {
            renderImageRef(imgRef);
        }

        // Render footers on all pages
        const totalPages = pageCount;
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            renderFooterContent(p, totalPages);
        }

        const blob = doc.output('blob');
        return { blob, signatureInfo: udf.signatureInfo };
    }

    // ── Word (.docx) Export ──
    async function convertUdfToDocx(file) {
        if (!window.docx) {
            throw new Error('docx kütüphanesi yüklenemedi. Sayfa yeniden yüklenmelidir.');
        }

        const udf = await parseUdf(file);
        const { Document, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, Packer, WidthType, BorderStyle, Header, Footer, PageNumber } = window.docx;

        // Map alignment
        function mapAlignment(a) {
            if (a === 1) return AlignmentType.CENTER;
            if (a === 2) return AlignmentType.RIGHT;
            if (a === 3) return AlignmentType.JUSTIFIED;
            return AlignmentType.LEFT;
        }

        // Convert color to hex
        function colorToHex(c) {
            if (!c) return undefined;
            return ((1 << 24) + (c.r << 16) + (c.g << 8) + c.b).toString(16).slice(1).toUpperCase();
        }

        // Build header paragraphs for docx
        const headerChildren = udf.headerParagraphs.map(para => {
            const runs = para.runs.map(r => new TextRun({
                text: r.text === '\t' ? '\t' : r.text,
                bold: r.bold,
                italics: r.italic,
                underline: r.underline ? {} : undefined,
                size: r.size * 2,
                color: colorToHex(r.color),
                font: 'Noto Serif',
            }));
            return new Paragraph({ children: runs, alignment: mapAlignment(para.alignment) });
        });

        // Build footer paragraphs for docx
        const footerChildren = udf.footerParagraphs.map(para => {
            const runs = para.runs.map(r => {
                if (r.text.match(/\{PAGE\}/i)) {
                    return new TextRun({ children: [PageNumber.CURRENT], font: 'Noto Serif', size: r.size * 2 });
                }
                return new TextRun({
                    text: r.text === '\t' ? '\t' : r.text,
                    bold: r.bold,
                    italics: r.italic,
                    size: r.size * 2,
                    font: 'Noto Serif',
                });
            });
            return new Paragraph({ children: runs, alignment: mapAlignment(para.alignment) });
        });

        // Build body content
        const children = [];

        for (const para of udf.paragraphs) {
            if (para.type === 'table') {
                // Build table
                try {
                    const tableRows = para.table.map(row => {
                        const cells = row.cells.map(cell => {
                            const cellParas = cell.paragraphs.map(cp => {
                                const runs = cp.runs.map(r => new TextRun({
                                    text: r.text === '\t' ? '\t' : r.text,
                                    bold: r.bold,
                                    italics: r.italic,
                                    underline: r.underline ? {} : undefined,
                                    size: r.size * 2,
                                    color: colorToHex(r.color),
                                    font: 'Noto Serif',
                                }));
                                return new Paragraph({ children: runs, alignment: mapAlignment(cp.alignment) });
                            });
                            return new TableCell({
                                children: cellParas.length > 0 ? cellParas : [new Paragraph('')],
                                columnSpan: cell.colspan || 1,
                                rowSpan: cell.rowspan || 1,
                            });
                        });
                        return new TableRow({ children: cells });
                    });

                    if (tableRows.length > 0) {
                        children.push(new Table({ rows: tableRows }));
                    }
                } catch (e) {
                    console.warn('Table conversion failed:', e);
                }
                continue;
            }

            // Build paragraph
            const listMarker = para.listType ? getListMarker(para.listType, para.listLevel, para.listIndex) : '';
            const runs = [];

            if (listMarker) {
                runs.push(new TextRun({ text: listMarker, font: 'Noto Serif', size: (para.runs[0]?.size || 12) * 2 }));
            }

            for (const r of para.runs) {
                runs.push(new TextRun({
                    text: r.text === '\t' ? '\t' : r.text,
                    bold: r.bold,
                    italics: r.italic,
                    underline: r.underline ? {} : undefined,
                    size: r.size * 2,
                    color: colorToHex(r.color),
                    font: 'Noto Serif',
                }));
            }

            children.push(new Paragraph({
                children: runs,
                alignment: mapAlignment(para.alignment),
                spacing: {
                    before: Math.round(para.spaceAbove * 20),
                    after: Math.round(para.spaceBelow * 20),
                },
                indent: {
                    left: Math.round(para.leftIndent * 20 + (para.listType ? (para.listLevel + 1) * 200 : 0)),
                    right: Math.round(para.rightIndent * 20),
                },
            }));
        }

        // Determine page orientation
        const isLandscape = udf.page.orientation === 'landscape';

        const docConfig = {
            sections: [{
                properties: {
                    page: {
                        size: isLandscape
                            ? { width: 16838, height: 11906, orientation: 'landscape' }
                            : { width: 11906, height: 16838 },
                        margin: {
                            top: Math.round(udf.page.topMm / 25.4 * 1440),
                            bottom: Math.round(udf.page.bottomMm / 25.4 * 1440),
                            left: Math.round(udf.page.leftMm / 25.4 * 1440),
                            right: Math.round(udf.page.rightMm / 25.4 * 1440),
                        },
                    },
                },
                headers: headerChildren.length > 0 ? {
                    default: new Header({ children: headerChildren }),
                } : undefined,
                footers: footerChildren.length > 0 ? {
                    default: new Footer({ children: footerChildren }),
                } : undefined,
                children,
            }],
        };

        const document = new Document(docConfig);
        const blob = await Packer.toBlob(document);
        return { blob, signatureInfo: udf.signatureInfo };
    }

    // List marker helper (shared between PDF and DOCX)
    function getListMarker(listType, listLevel, listIndex) {
        if (!listType) return '';
        const bullets = ['\u2022', '\u25E6', '\u25AA', '\u2013'];
        if (listType === 'bullet' || listType === 'unordered') {
            return bullets[Math.min(listLevel, bullets.length - 1)] + ' ';
        }
        if (listType === 'number' || listType === 'ordered' || listType === 'decimal') {
            return (listIndex || 1) + '. ';
        }
        if (listType === 'letter') {
            return String.fromCharCode(97 + ((listIndex || 1) - 1) % 26) + ') ';
        }
        if (listType === 'roman') {
            const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
            return (romans[(listIndex || 1) - 1] || listIndex) + ') ';
        }
        return '\u2022 ';
    }

    // ── TIFF to PDF Conversion ──
    const MAX_TIFF_DIMENSION = 10000;
    const MAX_TIFF_PIXELS = 100_000_000;

    // ── CCITT Group 4 (T.6) Fax Decoder for 1-bit TIFF ──
    function decodeCCITTG4(data, width, height, fillOrder) {
        const out = new Uint8Array(width * height);
        const reader = { data, pos: 0, bit: 0 };

        function readBit() {
            if (reader.pos >= reader.data.length) return 0;
            const byte = reader.data[reader.pos];
            let b;
            if (fillOrder === 2) {
                b = (byte >> reader.bit) & 1;
            } else {
                b = (byte >> (7 - reader.bit)) & 1;
            }
            reader.bit++;
            if (reader.bit >= 8) { reader.bit = 0; reader.pos++; }
            return b;
        }

        // Huffman code tables for CCITT G4
        // White run-length codes
        const WHITE_TERMINAL = [
            [0b00110101, 8], [0b000111, 6], [0b0111, 4], [0b1000, 4],
            [0b1011, 4], [0b1100, 4], [0b1110, 4], [0b1111, 4],
            [0b10011, 5], [0b10100, 5], [0b00111, 5], [0b01000, 5],
            [0b001000, 6], [0b000011, 6], [0b110100, 6], [0b110101, 6],
            [0b101010, 6], [0b101011, 6], [0b0100111, 7], [0b0001100, 7],
            [0b0001000, 7], [0b0010111, 7], [0b0000011, 7], [0b0000100, 7],
            [0b0101000, 7], [0b0101011, 7], [0b0010011, 7], [0b0100100, 7],
            [0b0011000, 7], [0b00000010, 8], [0b00000011, 8], [0b00011010, 8],
            [0b00011011, 8], [0b00010010, 8], [0b00010011, 8], [0b00010100, 8],
            [0b00010101, 8], [0b00010110, 8], [0b00010111, 8], [0b00101000, 8],
            [0b00101001, 8], [0b00101010, 8], [0b00101011, 8], [0b00101100, 8],
            [0b00101101, 8], [0b00000100, 8], [0b00000101, 8], [0b00001010, 8],
            [0b00001011, 8], [0b01010010, 8], [0b01010011, 8], [0b01010100, 8],
            [0b01010101, 8], [0b00100100, 8], [0b00100101, 8], [0b01011000, 8],
            [0b01011001, 8], [0b01011010, 8], [0b01011011, 8], [0b01001010, 8],
            [0b01001011, 8], [0b00110010, 8], [0b00110011, 8], [0b00110100, 8],
        ];
        const WHITE_MAKEUP = [
            [0b11011, 5, 64], [0b10010, 5, 128], [0b010111, 6, 192], [0b0110111, 7, 256],
            [0b00110110, 8, 320], [0b00110111, 8, 384], [0b01100100, 8, 448], [0b01100101, 8, 512],
            [0b01101000, 8, 576], [0b01100111, 8, 640], [0b011001100, 9, 704], [0b011001101, 9, 768],
            [0b011010010, 9, 832], [0b011010011, 9, 896], [0b011010100, 9, 960], [0b011010101, 9, 1024],
            [0b011010110, 9, 1088], [0b011010111, 9, 1152], [0b011011000, 9, 1216], [0b011011001, 9, 1280],
            [0b011011010, 9, 1344], [0b011011011, 9, 1408], [0b010011000, 9, 1472], [0b010011001, 9, 1536],
            [0b010011010, 9, 1600], [0b011000, 6, 1664], [0b010011011, 9, 1728],
        ];
        const BLACK_TERMINAL = [
            [0b0000110111, 10], [0b010, 3], [0b11, 2], [0b10, 2],
            [0b011, 3], [0b0011, 4], [0b0010, 4], [0b00011, 5],
            [0b000101, 6], [0b000100, 6], [0b0000100, 7], [0b0000101, 7],
            [0b0000111, 7], [0b00000100, 8], [0b00000111, 8], [0b000011000, 9],
            [0b0000010111, 10], [0b0000011000, 10], [0b0000001000, 10], [0b00001100111, 11],
            [0b00001101000, 11], [0b00001101100, 11], [0b00000110111, 11], [0b00000101000, 11],
            [0b00000010111, 11], [0b00000011000, 11], [0b000011001010, 12], [0b000011001011, 12],
            [0b000011001100, 12], [0b000011001101, 12], [0b000001101000, 12], [0b000001101001, 12],
            [0b000011010010, 12], [0b000011010011, 12], [0b000011010100, 12], [0b000011010101, 12],
            [0b000011010110, 12], [0b000011010111, 12], [0b000001101010, 12], [0b000001101011, 12],
            [0b000011011000, 12], [0b000011011001, 12], [0b000011011010, 12], [0b000011011011, 12],
            [0b000001010010, 12], [0b000001010011, 12], [0b000000100100, 12], [0b000000110111, 12],
            [0b000000111000, 12], [0b000000100111, 12], [0b000000101000, 12], [0b000001011000, 12],
            [0b000001011001, 12], [0b000000101011, 12], [0b000000101100, 12], [0b000001011010, 12],
            [0b000001100110, 12], [0b000001100111, 12], [0b000001010100, 12], [0b000001010101, 12],
            [0b000001010110, 12], [0b000001010111, 12], [0b000001100100, 12], [0b000001100101, 12],
        ];
        const BLACK_MAKEUP = [
            [0b0000001111, 10, 64], [0b000011001000, 12, 128], [0b000011001001, 12, 192],
            [0b000001011011, 12, 256], [0b000000110011, 12, 320], [0b000000110100, 12, 384],
            [0b000000110101, 12, 448], [0b0000001101100, 13, 512], [0b0000001101101, 13, 576],
            [0b0000001001010, 13, 640], [0b0000001001011, 13, 704], [0b0000001001100, 13, 768],
            [0b0000001001101, 13, 832], [0b0000001110010, 13, 896], [0b0000001110011, 13, 960],
            [0b0000001110100, 13, 1024], [0b0000001110101, 13, 1088], [0b0000001110110, 13, 1152],
            [0b0000001110111, 13, 1216], [0b0000001010010, 13, 1280], [0b0000001010011, 13, 1344],
            [0b0000001010100, 13, 1408], [0b0000001010101, 13, 1472], [0b0000001011010, 13, 1536],
            [0b0000001011011, 13, 1600], [0b0000001100100, 13, 1664], [0b0000001100101, 13, 1728],
        ];

        // Extended makeup codes shared by both white and black (1792-2560)
        const EXTENDED_MAKEUP = [
            [0b00000001000, 11, 1792], [0b00000001100, 11, 1856], [0b00000001101, 11, 1920],
            [0b000000010010, 12, 1984], [0b000000010011, 12, 2048], [0b000000010100, 12, 2112],
            [0b000000010101, 12, 2176], [0b000000010110, 12, 2240], [0b000000010111, 12, 2304],
            [0b000000011100, 12, 2368], [0b000000011101, 12, 2432], [0b000000011110, 12, 2496],
            [0b000000011111, 12, 2560],
        ];

        // Build lookup trees for fast decoding
        function buildTree(terminal, makeup) {
            const tree = {};
            terminal.forEach((entry, runLen) => {
                tree[entry[1] + '_' + entry[0]] = { run: runLen, type: 'T' };
            });
            if (makeup) {
                makeup.forEach(entry => {
                    tree[entry[1] + '_' + entry[0]] = { run: entry[2], type: 'M' };
                });
            }
            // Add extended makeup codes (shared by white and black)
            EXTENDED_MAKEUP.forEach(entry => {
                tree[entry[1] + '_' + entry[0]] = { run: entry[2], type: 'M' };
            });
            return tree;
        }
        const whiteTree = buildTree(WHITE_TERMINAL, WHITE_MAKEUP);
        const blackTree = buildTree(BLACK_TERMINAL, BLACK_MAKEUP);

        function decodeRunLength(isWhite) {
            const tree = isWhite ? whiteTree : blackTree;
            let code = 0;
            let bits = 0;
            let totalRun = 0;

            while (bits < 14) {
                code = (code << 1) | readBit();
                bits++;
                const key = bits + '_' + code;
                const entry = tree[key];
                if (entry) {
                    totalRun += entry.run;
                    if (entry.type === 'T') return totalRun;
                    // Makeup code — continue reading terminal
                    code = 0;
                    bits = 0;
                }
            }
            return -1; // decode error
        }

        // G4 2D decoding with reference line
        const MODE_PASS = 'P';
        const MODE_HORIZ = 'H';
        const MODE_VERT = 'V';

        function decodeMode2() {
            const b1 = readBit();
            if (b1 === 1) return { mode: MODE_VERT, offset: 0 };

            const b2 = readBit();
            const b3 = readBit();

            if (b2 === 0 && b3 === 1) return { mode: MODE_HORIZ };

            if (b2 === 1) {
                // 01x
                if (b3 === 1) return { mode: MODE_VERT, offset: 1 };  // VR(1) = 011
                return { mode: MODE_VERT, offset: -1 };  // VL(1) = 010
            }

            // 00x where b3 already read
            const b4 = readBit();
            if (b3 === 0 && b4 === 1) return { mode: MODE_PASS }; // P = 0001

            // 000x
            const b5 = readBit();
            if (b4 === 0) {
                const b6 = readBit();
                if (b5 === 1) {
                    if (b6 === 1) return { mode: MODE_VERT, offset: 2 };  // VR(2) = 000011
                    return { mode: MODE_VERT, offset: -2 }; // VL(2) = 000010
                }
                // 0000xx
                const b7 = readBit();
                if (b6 === 1) {
                    if (b7 === 1) return { mode: MODE_VERT, offset: 3 };  // VR(3) = 0000011
                    return { mode: MODE_VERT, offset: -3 }; // VL(3) = 0000010
                }
            }
            return null; // EOFB or error
        }

        // Find b1 and b2 on reference line
        function findB1B2(refLine, a0, curColor) {
            // b1 = first changing element on ref line to the right of a0 with opposite color
            const searchColor = curColor === 0 ? 1 : 0;
            let b1 = width;
            let start = Math.max(a0 + 1, 0);
            // Find the first pixel of opposite color after a0
            let pos = start;
            while (pos < width && refLine[pos] !== searchColor) pos++;
            // Now find the next changing element (transition to curColor)
            b1 = pos;
            // b2 = next changing element after b1
            let b2 = b1;
            while (b2 < width && refLine[b2] === searchColor) b2++;
            return [b1, b2];
        }

        // Initialize reference line to all white
        let refLine = new Uint8Array(width);
        const curLine = new Uint8Array(width);

        for (let y = 0; y < height; y++) {
            curLine.fill(0);
            let a0 = -1;
            let curColor = 0; // 0=white, 1=black

            while (a0 < width) {
                const m = decodeMode2();
                if (!m) break; // EOFB or error

                if (m.mode === MODE_PASS) {
                    const [b1, b2] = findB1B2(refLine, a0, curColor);
                    a0 = b2;
                } else if (m.mode === MODE_HORIZ) {
                    const run1 = decodeRunLength(curColor === 0);
                    const run2 = decodeRunLength(curColor !== 0);
                    if (run1 < 0 || run2 < 0) break;

                    const start1 = Math.max(a0, 0);
                    for (let x = start1; x < Math.min(start1 + run1, width); x++) {
                        curLine[x] = curColor;
                    }
                    const start2 = start1 + run1;
                    const nextColor = curColor === 0 ? 1 : 0;
                    for (let x = start2; x < Math.min(start2 + run2, width); x++) {
                        curLine[x] = nextColor;
                    }
                    a0 = start2 + run2;
                } else if (m.mode === MODE_VERT) {
                    const [b1] = findB1B2(refLine, a0, curColor);
                    const a1 = b1 + m.offset;
                    const start = Math.max(a0, 0);
                    for (let x = start; x < Math.min(a1, width); x++) {
                        curLine[x] = curColor;
                    }
                    a0 = a1;
                    curColor = curColor === 0 ? 1 : 0;
                }
            }

            // Copy current line to output
            const rowOff = y * width;
            for (let x = 0; x < width; x++) {
                out[rowOff + x] = curLine[x];
            }

            // Current becomes reference
            refLine = new Uint8Array(curLine);
        }

        return out;
    }

    // Parse TIFF manually for CCITT G4 support
    function parseTiffManual(buf) {
        const bytes = new Uint8Array(buf);
        const le = bytes[0] === 0x49;

        function u16(o) {
            return le ? (bytes[o] | (bytes[o+1] << 8)) : ((bytes[o] << 8) | bytes[o+1]);
        }
        function u32(o) {
            return le
                ? ((bytes[o] | (bytes[o+1] << 8) | (bytes[o+2] << 16) | (bytes[o+3] << 24)) >>> 0)
                : (((bytes[o] << 24) | (bytes[o+1] << 16) | (bytes[o+2] << 8) | bytes[o+3]) >>> 0);
        }

        const pages = [];
        let ifdOff = u32(4);

        while (ifdOff > 0 && ifdOff < bytes.length - 2) {
            const n = u16(ifdOff);
            const tags = {};
            for (let i = 0; i < n; i++) {
                const e = ifdOff + 2 + i * 12;
                const tag = u16(e);
                const type = u16(e + 2);
                const count = u32(e + 4);
                const valOff = e + 8;

                if (count === 1) {
                    tags[tag] = (type === 3) ? u16(valOff) : u32(valOff);
                } else {
                    // Check if values fit inline (≤4 bytes) or need pointer dereference
                    const typeSize = (type === 3) ? 2 : (type === 4) ? 4 : (type === 1) ? 1 : 4;
                    const totalSize = count * typeSize;
                    const dataOff = (totalSize <= 4) ? valOff : u32(valOff);
                    const vals = [];
                    for (let j = 0; j < count; j++) {
                        if (type === 1) vals.push(bytes[dataOff + j]);
                        else if (type === 3) vals.push(u16(dataOff + j * 2));
                        else vals.push(u32(dataOff + j * 4));
                    }
                    tags[tag] = vals;
                }
            }
            pages.push(tags);
            // Next IFD
            const nextOff = u32(ifdOff + 2 + n * 12);
            if (nextOff === 0 || nextOff === ifdOff) break;
            ifdOff = nextOff;
        }

        return pages;
    }

    // Decode a CCITT G4 TIFF page to RGBA
    function decodeCCITTPage(buf, tags) {
        const w = tags[256]; // ImageWidth
        const h = tags[257]; // ImageLength
        const compression = tags[259];
        const photometric = tags[262] || 0;
        const fillOrder = tags[266] || 1;
        const rowsPerStrip = tags[278] || h;

        if (compression !== 4) return null; // Not CCITT G4

        // Collect strip data
        const stripOffsets = Array.isArray(tags[273]) ? tags[273] : [tags[273]];
        const stripByteCounts = Array.isArray(tags[279]) ? tags[279] : [tags[279]];
        const bytes = new Uint8Array(buf);

        // Concatenate all strips into one buffer — most CCITT G4 encoders write
        // strips as a continuous bitstream (reference line carries across strips),
        // even though the TIFF spec says each strip should be independent.
        let totalBytes = 0;
        for (const c of stripByteCounts) totalBytes += c;
        const compData = new Uint8Array(totalBytes);
        let pos = 0;
        for (let s = 0; s < stripOffsets.length; s++) {
            const off = stripOffsets[s];
            const len = stripByteCounts[s];
            compData.set(bytes.subarray(off, off + len), pos);
            pos += len;
        }

        // Decode CCITT G4
        const pixels = decodeCCITTG4(compData, w, h, fillOrder);

        // Convert 1-bit to RGBA
        const rgba = new Uint8Array(w * h * 4);
        for (let i = 0; i < w * h; i++) {
            let val = pixels[i];
            // Apply photometric interpretation
            if (photometric === 0) val = 1 - val; // WhiteIsZero: 0=white, 1=black
            // photometric=1: BlackIsZero/MinIsBlack: 0=white, 1=black (already correct)
            const color = val === 0 ? 255 : 0; // white=255, black=0
            rgba[i * 4] = color;
            rgba[i * 4 + 1] = color;
            rgba[i * 4 + 2] = color;
            rgba[i * 4 + 3] = 255;
        }

        return { rgba, width: w, height: h };
    }

    async function convertTiffToPdf(file, useOcr) {
        const buf = await file.arrayBuffer();

        const header = new Uint8Array(buf, 0, 4);
        const isTiff = (header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2A && header[3] === 0x00)
                     || (header[0] === 0x4D && header[1] === 0x4D && header[2] === 0x00 && header[3] === 0x2A);
        if (!isTiff) throw new Error('Geçerli bir TIFF dosyası değil.');

        // Try UTIF first, fall back to manual CCITT G4 decoder
        let ifds;
        let useCCITT = false;
        try {
            ifds = UTIF.decode(buf);
            // Check if UTIF actually decoded width/height
            if (ifds.length > 0) {
                UTIF.decodeImage(buf, ifds[0]);
                const testRgba = UTIF.toRGBA8(ifds[0]);
                if (!ifds[0].width || !ifds[0].height || !testRgba || testRgba.length === 0) {
                    useCCITT = true;
                }
            }
        } catch (e) {
            useCCITT = true;
        }

        let tiffPages;
        if (useCCITT) {
            tiffPages = parseTiffManual(buf);
            if (!tiffPages || tiffPages.length === 0) {
                throw new Error('TIFF dosyası okunamadı.');
            }
            // Verify it's actually CCITT G4
            if (tiffPages[0][259] !== 4) {
                throw new Error('Desteklenmeyen TIFF sıkıştırma formatı: ' + (tiffPages[0][259] || 'bilinmiyor'));
            }
        } else if (!ifds || ifds.length === 0) {
            throw new Error('TIFF dosyasında sayfa bulunamadı.');
        }

        const pageCount = useCCITT ? tiffPages.length : ifds.length;

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const MARGIN = 5;
        const pageW = 210;
        const pageH = 297;
        const usableW = pageW - 2 * MARGIN;
        const usableH = pageH - 2 * MARGIN;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Lazy-load Tesseract if OCR requested
        let ocrWorker = null;
        if (useOcr && window.Tesseract) {
            try {
                ocrWorker = await Tesseract.createWorker('tur');
            } catch (e) {
                console.warn('OCR worker oluşturulamadı:', e);
            }
        }

        for (let i = 0; i < pageCount; i++) {
            if (i > 0) doc.addPage();

            let w, h, rgbaData;

            if (useCCITT) {
                const decoded = decodeCCITTPage(buf, tiffPages[i]);
                if (!decoded) throw new Error('TIFF sayfası ' + (i+1) + ' decode edilemedi.');
                w = decoded.width;
                h = decoded.height;
                rgbaData = decoded.rgba;
            } else {
                if (i > 0) UTIF.decodeImage(buf, ifds[i]); // First page already decoded above
                const rgba = UTIF.toRGBA8(ifds[i]);
                w = ifds[i].width;
                h = ifds[i].height;
                rgbaData = new Uint8Array(rgba.buffer || rgba);
            }

            if (w > MAX_TIFF_DIMENSION || h > MAX_TIFF_DIMENSION || w * h > MAX_TIFF_PIXELS) {
                throw new Error('TIFF boyutları güvenlik limitini aşıyor (' + w + 'x' + h + ').');
            }

            canvas.width = w;
            canvas.height = h;
            const imgData = ctx.createImageData(w, h);
            imgData.data.set(rgbaData);
            ctx.putImageData(imgData, 0, 0);

            const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);

            const imgAspect = w / h;
            const pageAspect = usableW / usableH;
            let renderW, renderH;

            if (imgAspect > pageAspect) {
                renderW = usableW;
                renderH = usableW / imgAspect;
            } else {
                renderH = usableH;
                renderW = usableH * imgAspect;
            }

            const x = MARGIN + (usableW - renderW) / 2;
            const y = MARGIN + (usableH - renderH) / 2;

            doc.addImage(jpegDataUrl, 'JPEG', x, y, renderW, renderH);

            // OCR: add invisible text layer
            if (ocrWorker) {
                try {
                    const result = await ocrWorker.recognize(canvas);
                    if (result.data && result.data.words) {
                        // Render invisible text overlay
                        const scaleX = renderW / w;
                        const scaleY = renderH / h;

                        doc.setFont('NotoSerif', 'normal');

                        for (const word of result.data.words) {
                            const bbox = word.bbox;
                            const wordX = x + bbox.x0 * scaleX;
                            const wordY = y + bbox.y0 * scaleY;
                            const wordW = (bbox.x1 - bbox.x0) * scaleX;
                            const wordH = (bbox.y1 - bbox.y0) * scaleY;

                            // Calculate font size to fit
                            const fontSize = Math.max(2, Math.min(wordH / PT_TO_MM * 0.8, 14));
                            doc.setFontSize(fontSize);
                            doc.setTextColor(255, 255, 255); // White (invisible on white bg)
                            // Use transparency via GState if available
                            try {
                                const gs = new doc.GState({ opacity: 0.01 });
                                doc.saveGraphicsState();
                                doc.setGState(gs);
                                doc.text(word.text, wordX, wordY + wordH * 0.8);
                                doc.restoreGraphicsState();
                            } catch (e) {
                                // Fallback: render with near-invisible color
                                doc.setTextColor(255, 255, 254);
                                doc.text(word.text, wordX, wordY + wordH * 0.8);
                            }
                        }
                        doc.setTextColor(0, 0, 0);
                    }
                } catch (e) {
                    console.warn('OCR failed for page', i, e);
                }
            }

            ctx.clearRect(0, 0, w, h);
        }

        if (ocrWorker) {
            await ocrWorker.terminate();
        }

        canvas.width = 1;
        canvas.height = 1;

        return doc.output('blob');
    }

    // ── Copy Text ──
    async function copyFileText(file, btnEl) {
        try {
            const udf = await parseUdf(file);
            const text = udf.rawText || udf.paragraphs.map(p => {
                if (p.type === 'table') {
                    return p.table.map(row =>
                        row.cells.map(cell =>
                            cell.paragraphs.map(cp => cp.runs.map(r => r.text).join('')).join('\n')
                        ).join('\t')
                    ).join('\n');
                }
                return p.runs.map(r => r.text).join('');
            }).join('\n');

            await navigator.clipboard.writeText(text);
            const origText = btnEl.textContent;
            btnEl.textContent = 'Kopyalandı!';
            btnEl.classList.add('btn-copied');
            setTimeout(() => {
                btnEl.textContent = origText;
                btnEl.classList.remove('btn-copied');
            }, 2000);
        } catch (err) {
            console.error('Copy failed:', err);
            showToast('Metin kopyalanamadı. Tarayıcınız pano erişimine izin vermiyor olabilir.', 'error');
            const origText = btnEl.textContent;
            btnEl.textContent = 'Hata!';
            setTimeout(() => { btnEl.textContent = origText; }, 2000);
        }
    }

    // ── Preview ──
    async function previewFile(file) {
        if (!previewModal || !previewContent) return;

        try {
            const udf = await parseUdf(file);
            let html = '';

            // Show signature info if available
            if (udf.signatureInfo) {
                html += `<div class="preview-sig-info">
                    <strong>İmza Bilgisi:</strong> ${escapeHtml(udf.signatureInfo)}
                    <div class="preview-sig-disclaimer">Bu bilgi yalnızca gösterim amaçlıdır. Kriptografik doğrulama yapılmamıştır.</div>
                </div>`;
            }

            // Render header
            if (udf.headerParagraphs.length > 0) {
                html += '<div class="preview-header">';
                for (const para of udf.headerParagraphs) {
                    html += renderParaToHtml(para);
                }
                html += '</div><hr>';
            }

            // Render body
            for (const para of udf.paragraphs) {
                if (para.type === 'table') {
                    html += renderTableToHtml(para.table);
                    continue;
                }
                html += renderParaToHtml(para);
            }

            // Render footer
            if (udf.footerParagraphs.length > 0) {
                html += '<hr><div class="preview-footer">';
                for (const para of udf.footerParagraphs) {
                    html += renderParaToHtml(para);
                }
                html += '</div>';
            }

            previewContent.innerHTML = html;
            previewModal.hidden = false;
            previewModal.classList.add('active');
        } catch (err) {
            console.error('Preview failed:', err);
            showToast('Önizleme yüklenemedi: dosya bozuk veya desteklenmeyen format.', 'error');
        }
    }

    function renderParaToHtml(para) {
        const alignMap = { 0: 'left', 1: 'center', 2: 'right', 3: 'justify' };
        const align = alignMap[para.alignment] || 'left';
        const indent = (para.leftIndent || 0) * PT_TO_MM + (para.listType ? (para.listLevel + 1) * 10 : 0);

        let content = '';
        if (para.listType) {
            content += escapeHtml(getListMarker(para.listType, para.listLevel, para.listIndex));
        }

        for (const r of para.runs) {
            let text = escapeHtml(r.text);
            if (r.text === '\t') text = '&emsp;';
            if (r.bold) text = `<strong>${text}</strong>`;
            if (r.italic) text = `<em>${text}</em>`;
            if (r.underline) text = `<u>${text}</u>`;
            if (r.color) {
                text = `<span style="color:rgb(${r.color.r},${r.color.g},${r.color.b})">${text}</span>`;
            }
            content += text;
        }

        const style = `text-align:${align};margin-left:${indent}px;margin-top:${(para.spaceAbove || 0) * 0.5}px;margin-bottom:${(para.spaceBelow || 0) * 0.5}px;`;
        return `<p style="${style}">${content || '&nbsp;'}</p>`;
    }

    function renderTableToHtml(tableRows) {
        let html = '<table class="preview-table">';
        for (const row of tableRows) {
            html += '<tr>';
            for (const cell of row.cells) {
                const cs = cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '';
                const rs = cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '';
                html += `<td${cs}${rs}>`;
                for (const p of cell.paragraphs) {
                    html += renderParaToHtml(p);
                }
                html += '</td>';
            }
            html += '</tr>';
        }
        html += '</table>';
        return html;
    }

    // ── Download Helpers ──
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Legacy alias
    function downloadPdf(blob, filename) { downloadBlob(blob, filename); }

    async function downloadAllAsZip(outputFiles) {
        const zip = new JSZip();
        outputFiles.forEach(entry => {
            const name = entry.status === 'passthrough' ? entry.file.name : toOutputFilename(entry.file.name);
            zip.file(name, entry.result);
        });

        let zipName = 'converted-files.zip';

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipName;
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
