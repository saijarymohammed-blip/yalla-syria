/* Service Worker — يجعل التطبيق يفتح فوراً وحتى بدون إنترنت (الواجهة فقط).
   بيانات Supabase لا تُخزَّن أبداً (تُجلب دائماً من الشبكة). */
const VERSION = 'yalla-v1.4.0';
const SHELL = ['./', 'index.html', 'style.css', 'config.js', 'store.js', 'app.js', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return; // بيانات حيّة
  if (url.hostname.endsWith('tile.openstreetmap.org')) return; // بلاطات الخريطة

  const sameOrigin = url.origin === location.origin;
  const isShell = sameOrigin && (req.mode === 'navigate' || /\.(js|css|html|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/'));
  if (isShell) {
    // الشبكة أولاً (لتصل التحديثات)، ثم الكاش عند انقطاع الإنترنت
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then(m => m || caches.match('index.html'))));
    return;
  }
  // باقي الملفات (أيقونات، خطوط، Leaflet، مكتبة Supabase): الكاش أولاً
  e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => {
    if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
    return r;
  })));
});
