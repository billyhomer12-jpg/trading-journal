/* Service worker: offline app shell for the web/PWA build of app/.
   Cache-first for same-origin files, refreshed in the background; cross-origin requests (e.g. the Forex Factory feed) are never cached here.
   VERSION is stamped by build.js from a hash of the app files so updates roll out automatically. */
const VERSION = 'tj-d38044fe3056';
const SHELL = ['./', './index.html', './manifest.json', './css/styles.css',
  './js/main.js', './js/config.js', './js/util.js', './js/state.js', './js/model.js', './js/importer.js', './js/imports.js', './js/ui.js', './js/views.js',
  './js/calc.js', './js/news.js', './js/payouts.js', './js/editors.js', './js/onboarding.js', './js/demo.js',
  './assets/icons/icon-180.png', './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }));
});
