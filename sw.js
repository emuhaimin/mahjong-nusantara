/* sw.js — service worker: membuat situs bisa dipasang & mode offline tetap jalan.
   Naikkan VERSION setiap rilis agar cache lama dibersihkan. */
const VERSION = 'mjn-v1';
const CORE = [
  './', 'index.html', 'manifest.webmanifest',
  'css/style.css',
  'js/tiles.js', 'js/rules.js', 'js/game.js', 'js/learn.js', 'js/online.js', 'js/pwa.js', 'js/app.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/favicon-32.png',
  'assets/tiles/Back.svg','assets/tiles/Blank.svg','assets/tiles/Chun.svg','assets/tiles/Front.svg','assets/tiles/Haku.svg','assets/tiles/Hatsu.svg','assets/tiles/Man1.svg','assets/tiles/Man2.svg','assets/tiles/Man3.svg','assets/tiles/Man4.svg','assets/tiles/Man5.svg','assets/tiles/Man6.svg','assets/tiles/Man7.svg','assets/tiles/Man8.svg','assets/tiles/Man9.svg','assets/tiles/Nan.svg','assets/tiles/Pei.svg','assets/tiles/Pin1.svg','assets/tiles/Pin2.svg','assets/tiles/Pin3.svg','assets/tiles/Pin4.svg','assets/tiles/Pin5.svg','assets/tiles/Pin6.svg','assets/tiles/Pin7.svg','assets/tiles/Pin8.svg','assets/tiles/Pin9.svg','assets/tiles/Shaa.svg','assets/tiles/Sou1.svg','assets/tiles/Sou2.svg','assets/tiles/Sou3.svg','assets/tiles/Sou4.svg','assets/tiles/Sou5.svg','assets/tiles/Sou6.svg','assets/tiles/Sou7.svg','assets/tiles/Sou8.svg','assets/tiles/Sou9.svg','assets/tiles/Ton.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {           // font Google: simpan setelah pertama dimuat
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.pathname.endsWith('/ws') || url.pathname.endsWith('/health')) return;
  if (req.mode === 'navigate') {                  // halaman: utamakan versi terbaru, pakai cache jika offline
    e.respondWith(fetch(req).then(r => { put('index.html', r.clone()); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  if (url.pathname.includes('/assets/')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(staleWhileRevalidate(req));      // css/js: cepat dari cache, diperbarui di belakang
});
function put(key, res) { if (res && res.ok) caches.open(VERSION).then(c => c.put(key, res)); }
function cacheFirst(req) {
  return caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => { put(req, r.clone()); return r; }));
}
function staleWhileRevalidate(req) {
  return caches.match(req).then(hit => {
    const net = fetch(req).then(r => { put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  });
}
