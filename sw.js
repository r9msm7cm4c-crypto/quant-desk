/* Quant Desk offline cache */
const CACHE = 'quantdesk-e6f90a8474';
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;      // quotes / klines go direct
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((r) => {
        const cp = r.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', cp));
        return r;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
