/**
 * Service Worker for UDF to PDF Converter PWA
 * Caches all critical assets for offline use.
 */

const CACHE_NAME = 'udf-converter-v5';

const CRITICAL_ASSETS = [
    '/',
    '/index.html',
    '/converter.js',
    '/style.css',
    '/manifest.json',
    '/favicon.svg',
    '/fonts/NotoSerif-Regular.ttf',
    '/fonts/NotoSerif-Bold.ttf',
    '/fonts/NotoSerif-Italic.ttf',
    '/fonts/NotoSerif-BoldItalic.ttf',
];

const CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap',
];

// Install: cache critical assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Cache local assets
            await cache.addAll(CRITICAL_ASSETS);
            // Cache CDN assets (best-effort, don't fail install if CDN is down)
            for (const url of CDN_ASSETS) {
                try {
                    await cache.add(url);
                } catch (e) {
                    console.warn('SW: CDN cache failed for', url, e);
                }
            }
        })
    );
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim();
});

// Fetch: cache-first for assets, network-first for pages
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip test/temp files and non-web assets
    if (url.pathname.match(/\.(tif|tiff|udf|sgn)$/i)) return;

    // Skip AdSense and analytics
    if (url.hostname.includes('googlesyndication') ||
        url.hostname.includes('googleadservices') ||
        url.hostname.includes('doubleclick') ||
        url.hostname.includes('google-analytics')) {
        return;
    }

    // For fonts and CDN assets: cache-first
    if (url.pathname.includes('/fonts/') ||
        url.hostname === 'cdnjs.cloudflare.com' ||
        url.hostname === 'cdn.jsdelivr.net' ||
        url.hostname === 'fonts.googleapis.com' ||
        url.hostname === 'fonts.gstatic.com') {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // For local assets: cache-first with network fallback
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                const fetchPromise = fetch(event.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(() => cached);

                return cached || fetchPromise;
            })
        );
        return;
    }
});
