/* pwa.js — pasang sebagai aplikasi (PWA), mode layar penuh di HP, pembaruan otomatis,
   dan mode offline / mode pesawat (penanda koneksi + kabar "siap dimainkan tanpa internet") */
const PWA = (() => {
  const $$ = s => document.querySelectorAll(s);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isApp = () => navigator.standalone === true ||
    matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  const isPhone = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  let deferred = null, reloadPending = false;

  function syncButtons() {
    const can = !isApp() && (deferred || isIOS);
    $$('[data-install]').forEach(b => { b.hidden = !can; });
    document.documentElement.classList.toggle('is-app', isApp());
  }

  function iosGuide() {
    const box = document.getElementById('modal-box');
    box.innerHTML = `<h2>📲 Pasang di iPhone / iPad</h2>
      <ol style="font-size:16px;line-height:1.7;padding-left:22px">
        <li>Buka situs ini di <b>Safari</b>.</li>
        <li>Ketuk tombol <b>Bagikan</b> <span style="font-size:20px">⎙</span> (kotak dengan panah ke atas) di bawah layar.</li>
        <li>Gulir lalu pilih <b>“Tambah ke Layar Utama”</b> (<i>Add to Home Screen</i>).</li>
        <li>Ketuk <b>Tambah</b>. Ikon <b>Mahjong</b> muncul di layar utama.</li>
      </ol>
      <p class="muted">Dibuka dari ikon itu, meja tampil penuh tanpa bar browser.</p>
      <div class="modal-actions"><button class="btn big" id="ios-ok">Mengerti</button></div>`;
    document.getElementById('modal').hidden = false;
    document.getElementById('ios-ok').onclick = () => { document.getElementById('modal').hidden = true; };
  }

  async function install() {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { }
      deferred = null;
      syncButtons();
    } else if (isIOS) iosGuide();
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
    window.addEventListener('appinstalled', () => { deferred = null; syncButtons(); });
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
  return { init, isApp, isOffline };
})();
PWA.init();
