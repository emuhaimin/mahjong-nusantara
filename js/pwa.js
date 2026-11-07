/* pwa.js — pasang sebagai aplikasi (PWA), mode layar penuh di HP, pembaruan otomatis */
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

  function init() {
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
      // versi baru terpasang → muat ulang, tapi jangan saat sedang bermain
      let had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!had) { had = true; return; }
        if (document.body.classList.contains('in-game')) reloadPending = true;
        else location.reload();
      });
      new MutationObserver(() => {
        if (reloadPending && !document.body.classList.contains('in-game')) location.reload();
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    syncButtons();
  }
  return { init, isApp };
})();
PWA.init();
