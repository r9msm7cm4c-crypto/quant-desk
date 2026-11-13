/* Quant Desk offline cache */
const CACHE_PREFIX = 'quantdesk-lab-';
const CACHE = `${CACHE_PREFIX}2f81c4d0a7`;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon-120.png', './icons/icon-152.png', './icons/icon-167.png',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-384.png',
  './icons/icon-512.png', './icons/maskable-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // quotes / klines go direct
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(req);
        if (response.ok) await cache.put('./index.html', response.clone());
        return response;
      } catch {
        return (await cache.match('./index.html')) || new Response(
          'Offline: cached app shell is unavailable.',
          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }
    })());
    return;
  }
  // Scope lookups to this app's cache; caches.match(req) could return another
  // application’s same-path asset when multiple PWAs share one origin.
  e.respondWith(caches.open(CACHE).then((cache) => cache.match(req)).then((r) => r || fetch(req)));
});
