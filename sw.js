/* PATTY.STUDIO offline cache.
   App page and config: network first, so updates show up right away; cached copy when offline.
   Fonts, icons and the Firebase library: cache first. */
const VERSION = 'patty-v8';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest',
  'fonts/gensen-R.woff', 'fonts/gensen-B.woff',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* never touch Firebase data/auth traffic; Firestore keeps its own offline copy */
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebaseapp.com')) return;
  const isLib = url.hostname === 'www.gstatic.com';
  const sameOrigin = url.origin === location.origin;
  if (!sameOrigin && !isLib) return;
  const networkFirst = sameOrigin && (req.mode === 'navigate' || /(index\.html|config\.js|initial-data\.json)$/.test(url.pathname));
  if (networkFirst) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
  }
});
