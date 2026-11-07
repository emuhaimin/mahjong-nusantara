/* sw.js — service worker: membuat situs bisa dipasang & tetap bisa dimainkan tanpa internet
   (mode pesawat): Belajar, Main vs Mesin, Simulasi Bot, dan Aturan berjalan sepenuhnya dari cache.
   Naikkan VERSION setiap rilis agar cache lama dibersihkan (deploy/install.sh melakukannya otomatis). */
const VERSION = 'mjn-v2';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700&family=Plus+Jakarta+Sans:wght@400;600;800&display=swap';
const NAV_TIMEOUT = 3500;   // sinyal lemah/mode pesawat: jangan biarkan halaman menunggu lama
const CORE = [
  './', 'index.html', 'manifest.webmanifest',
  'css/style.css',
  'js/tiles.js', 'js/rules.js', 'js/fx.js', 'js/record.js', 'js/game.js', 'js/learn.js', 'js/online.js', 'js/pwa.js', 'js/account.js', 'js/app.js', 'privacy.html',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png', 'assets/icons/apple-touch-icon.png', 'assets/icons/favicon-32.png',
  'assets/tiles/Back.svg','assets/tiles/Blank.svg','assets/tiles/Chun.svg','assets/tiles/Front.svg','assets/tiles/Haku.svg','assets/tiles/Hatsu.svg','assets/tiles/Man1.svg','assets/tiles/Man2.svg','assets/tiles/Man3.svg','assets/tiles/Man4.svg','assets/tiles/Man5.svg','assets/tiles/Man6.svg','assets/tiles/Man7.svg','assets/tiles/Man8.svg','assets/tiles/Man9.svg','assets/tiles/Nan.svg','assets/tiles/Pei.svg','assets/tiles/Pin1.svg','assets/tiles/Pin2.svg','assets/tiles/Pin3.svg','assets/tiles/Pin4.svg','assets/tiles/Pin5.svg','assets/tiles/Pin6.svg','assets/tiles/Pin7.svg','assets/tiles/Pin8.svg','assets/tiles/Pin9.svg','assets/tiles/Shaa.svg','assets/tiles/Sou1.svg','assets/tiles/Sou2.svg','assets/tiles/Sou3.svg','assets/tiles/Sou4.svg','assets/tiles/Sou5.svg','assets/tiles/Sou6.svg','assets/tiles/Sou7.svg','assets/tiles/Sou8.svg','assets/tiles/Sou9.svg','assets/tiles/Ton.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))).then(() => cacheFonts(c)))
    .then(() => self.skipWaiting()));
});
/** simpan font Google sekaligus file-file .woff2-nya, agar tampilan sama saat offline. Gagal = tidak apa-apa (pakai font sistem). */
async function cacheFonts(c) {
  try {
    const r = await fetch(FONT_CSS, { mode: 'cors' });
    if (!r.ok) return;
    const css = await r.clone().text();
    await c.put(FONT_CSS, r);
    // hanya font teks (Plus Jakarta Sans). Noto Serif SC terpecah ratusan berkas per rentang huruf —
    // yang benar-benar tampil di layar tersimpan sendiri saat pertama dimuat (lihat handler fetch).
    const blocks = css.split('@font-face').filter(b => /Plus Jakarta Sans/.test(b));
    const urls = [...new Set(blocks.join('').match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) || [])];
    await Promise.all(urls.map(u => fetch(u, { mode: 'cors' }).then(f => f.ok && c.put(u, f)).catch(() => { })));
  } catch { }
}
// halaman bertanya: apakah semua file penting sudah tersimpan (siap dimainkan tanpa internet)?
self.addEventListener('message', e => {
  if (!e.data || e.data.t !== 'offline-ready?') return;
  e.waitUntil(caches.open(VERSION).then(async c => {
    const missing = (await Promise.all(CORE.map(u => c.match(u, { ignoreSearch: true })))).filter(x => !x).length;
    if (e.source) e.source.postMessage({ t: 'offline-ready', ok: missing === 0, version: VERSION });
  }));
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
  if (url.pathname.endsWith('/ws') || url.pathname.endsWith('/health') || url.pathname.includes('/api/')) return;   // data akun selalu dari server
  if (req.mode === 'navigate') {                  // halaman: utamakan versi terbaru, pakai cache jika offline
    e.respondWith(navigate(req, url));
    return;
  }
  if (url.pathname.includes('/assets/')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(staleWhileRevalidate(req));      // css/js: cepat dari cache, diperbarui di belakang
});
/** halaman: utamakan versi terbaru; offline / terlalu lama → versi tersimpan */
function navigate(req, url) {
  const key = url.pathname.endsWith('/privacy.html') ? 'privacy.html' : 'index.html';
  const net = fetch(req).then(r => { if (r.ok) put(key, r.clone()); return r; });
  const cached = () => caches.match(key, { ignoreSearch: true });
  const timeout = new Promise(res => setTimeout(res, NAV_TIMEOUT)).then(cached);
  return Promise.race([net.catch(cached), timeout.then(hit => hit || net)])
    .then(r => r || net)
    .catch(() => cached().then(hit => hit || new Response('<h1>Offline</h1><p>Buka halaman ini sekali saat ada internet agar bisa dimainkan tanpa koneksi.</p>', { headers: { 'content-type': 'text/html; charset=utf-8' } })));
}
function put(key, res) { if (res && res.ok) caches.open(VERSION).then(c => c.put(key, res)); }
function cacheFirst(req) {
  return caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => { put(req, r.clone()); return r; }));
}
function staleWhileRevalidate(req) {
  return caches.match(req, { ignoreSearch: new URL(req.url).origin === location.origin }).then(hit => {
    const net = fetch(req).then(r => { put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  });
}
