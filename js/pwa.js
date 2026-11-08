/* pwa.js — pasang sebagai aplikasi (PWA), mode layar penuh di HP, pembaruan otomatis,
   dan mode offline / mode pesawat (penanda koneksi + kabar "siap dimainkan tanpa internet") */
const PWA = (() => {
  const $$ = s => document.querySelectorAll(s);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isApp = () => navigator.standalone === true ||
    matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  let deferred = null, reloadPending = false;

  /* ---------- pasang aplikasi: Android (install), iPhone/iPad (Layar Utama), komputer ---------- */
  const UA = navigator.userAgent;
  const isAndroid = /android/i.test(UA);
  const isSamsung = /SamsungBrowser/i.test(UA);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|TikTok|; wv\)/i.test(UA);   // browser di dalam aplikasi lain
  const iosNotSafari = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(UA);
  function label() {
    if (isIOS) return '📲 Pasang di Layar Utama';
    if (isAndroid) return '📲 Install di Android';
    return '💻 Pasang di komputer';
  }
  function syncButtons() {
    const app = isApp();
    $$('[data-install]').forEach(b => { b.hidden = app; b.textContent = label(); });
    document.documentElement.classList.toggle('is-app', app);
  }
  function guide(title, steps, note) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `<h2>${title}</h2>
      ${inApp ? `<p class="ab-hint warn install-warn">⚠️ Kamu membuka situs ini dari dalam aplikasi lain (mis. WhatsApp/Instagram/Facebook). Ketuk menu <b>⋮</b> atau <b>↗</b> lalu pilih <b>“Buka di ${isIOS ? 'Safari' : 'Chrome'}”</b> dulu — browser di dalam aplikasi tidak bisa memasang.</p>` : ''}
      <ol class="install-steps">${steps.map(x => `<li>${x}</li>`).join('')}</ol>
      ${note ? `<p class="muted">${note}</p>` : ''}
      <p class="muted">Setelah terpasang, buka dari ikon <b>Mahjong</b>: tampil penuh tanpa bar browser, lebih cepat, dan bisa dimainkan tanpa internet.</p>
      <div class="modal-actions"><button class="btn big" id="ins-ok">Mengerti</button></div>`;
    document.getElementById('modal').hidden = false;
    document.getElementById('ins-ok').onclick = () => { document.getElementById('modal').hidden = true; };
  }
  function iosGuide() {
    guide('📲 Pasang di iPhone / iPad', [
      iosNotSafari ? 'Paling mudah lewat <b>Safari</b>: salin alamat situs ini lalu buka di Safari (di iOS 16.4+ Chrome juga bisa lewat tombol Bagikan).' : 'Pastikan situs ini terbuka di <b>Safari</b>.',
      'Ketuk tombol <b>Bagikan</b> <span style="font-size:20px">⎙</span> (kotak dengan panah ke atas) — di bawah layar iPhone, atau di kanan atas iPad.',
      'Gulir lalu pilih <b>“Tambah ke Layar Utama”</b> (<i>Add to Home Screen</i>).',
      'Ketuk <b>Tambah</b>. Ikon <b>Mahjong</b> muncul di layar utama.',
    ]);
  }
  function androidGuide() {
    guide('📲 Install di Android', isSamsung ? [
      'Ketuk menu <b>☰</b> (kanan bawah) di Samsung Internet.',
      'Pilih <b>“Tambahkan halaman ke”</b> → <b>“Layar Beranda”</b> (atau <b>“Instal aplikasi”</b> bila tersedia).',
      'Ketuk <b>Tambahkan</b>. Ikon <b>Mahjong</b> muncul di layar beranda.',
    ] : [
      'Buka situs ini di <b>Google Chrome</b>.',
      'Ketuk menu <b>⋮</b> (tiga titik, kanan atas).',
      'Pilih <b>“Instal aplikasi”</b> atau <b>“Tambahkan ke Layar utama”</b>.',
      'Ketuk <b>Instal</b>. Ikon <b>Mahjong</b> muncul di layar beranda & daftar aplikasi.',
    ], 'Tidak perlu Play Store — aplikasinya ringan dan selalu versi terbaru.');
  }
  function desktopGuide() {
    guide('💻 Pasang di komputer', [
      '<b>Chrome / Edge</b>: klik ikon <b>Instal</b> (layar dengan panah) di ujung kanan kolom alamat, atau menu <b>⋮</b> → <b>“Instal Mahjong Nusantara”</b> / <b>“Simpan dan bagikan” → “Instal halaman sebagai aplikasi”</b>.',
      '<b>Safari (Mac)</b>: menu <b>File</b> → <b>“Tambah ke Dock”</b>.',
      'Mahjong Nusantara terbuka di jendela sendiri seperti aplikasi biasa.',
    ]);
  }

  async function install() {
    if (deferred) {                              // Android/komputer yang mendukung: dialog install bawaan, satu ketuk
      deferred.prompt();
      try { const c = await deferred.userChoice; if (c && c.outcome === 'accepted' && window.FX) FX.toast('Mahjong Nusantara sedang dipasang 🎉'); } catch { }
      deferred = null;
      syncButtons();
    } else if (isIOS) iosGuide();
    else if (isAndroid) androidGuide();
    else desktopGuide();
  }

  /* ---------- offline / mode pesawat ---------- */
  const READY_KEY = 'mjn-offline-ready';
  const isOffline = () => navigator.onLine === false;
  function syncNet() {
    const off = isOffline();
    document.documentElement.classList.toggle('is-offline', off);
    const b = document.getElementById('net-banner');
    if (b) b.hidden = !off;
    document.dispatchEvent(new CustomEvent('mjn-net', { detail: { offline: off } }));
  }
  function askReady(sw) { if (sw) sw.postMessage({ t: 'offline-ready?' }); }
  function onSwMessage(e) {
    if (!e.data || e.data.t !== 'offline-ready') return;
    const el = document.getElementById('offline-state');
    if (el) {
      el.textContent = e.data.ok ? '✅ Siap dimainkan tanpa internet (mode pesawat)' : '⏳ Menyiapkan mode offline…';
      el.classList.toggle('ok', !!e.data.ok);
    }
    let seen = null; try { seen = localStorage.getItem(READY_KEY); } catch { }
    if (e.data.ok && seen !== e.data.version) {
      try { localStorage.setItem(READY_KEY, e.data.version); } catch { }
      if (seen === null && window.FX) FX.toast('✈️ Siap offline: Belajar, Main vs Mesin & Simulasi Bot bisa dimainkan tanpa internet.');
    }
  }

  function init() {
    window.addEventListener('online', syncNet);
    window.addEventListener('offline', () => { syncNet(); if (window.FX) FX.toast('✈️ Kamu sedang offline — mode Belajar, vs Mesin & Simulasi tetap bisa dimainkan.'); });
    syncNet();

    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; syncButtons(); });
    window.addEventListener('appinstalled', () => { deferred = null; syncButtons(); if (window.FX) FX.toast('Terpasang! Buka Mahjong Nusantara dari ikon di layar utama.'); });
    document.addEventListener('click', e => { if (e.target.closest('[data-install]')) install(); });

    // HP lewat browser: masuk meja langsung layar penuh (butuh ketukan pengguna → saat tombol Mulai)
    document.addEventListener('click', e => {
      if (!e.target.closest('#cfg-start, #on-start, [data-m="restart"], #fin-again')) return;
      if (isPhone() && !isApp() && document.fullscreenEnabled && !document.fullscreenElement) {
        document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => { });
      }
    }, true);

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { });
      navigator.serviceWorker.addEventListener('message', onSwMessage);
      navigator.serviceWorker.ready.then(reg => askReady(reg.active)).catch(() => { });
      // versi baru terpasang → muat ulang, tapi jangan saat sedang bermain
      let had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        askReady(navigator.serviceWorker.controller);
        if (!had) { had = true; return; }
        if (document.body.classList.contains('in-game')) reloadPending = true;
        else location.reload();
      });
      new MutationObserver(() => {
        if (reloadPending && !document.body.classList.contains('in-game')) location.reload();
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    else {
      const el = document.getElementById('offline-state');
      if (el) el.textContent = 'Dibuka langsung dari file: semua mode kecuali Online jalan tanpa internet.';
    }
    syncButtons();
  }
  return { init, isApp, isOffline, sync: syncButtons, install };
})();
PWA.init();
