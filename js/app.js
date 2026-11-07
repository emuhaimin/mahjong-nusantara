/* app.js — navigasi, beranda, halaman aturan, pengaturan permainan */
(() => {
  const $ = s => document.querySelector(s);

  /* ---------- beranda ---------- */
  $('#hero-tiles').innerHTML = [0, 4, 8, 13, 17, 22, 26, 27, 28, 29, 30, 31, 32, 33, 34, 38].map(k => tileHTML(k, { cls: 'lg' })).join('');

  /* ---------- halaman aturan ---------- */
  function renderRules() {
    const el = $('#rules-content');
    if (el.dataset.ok) return;
    el.dataset.ok = 1;
    el.innerHTML = `
      <section class="card"><p class="eyebrow">Ringkasan</p><h2>Aturan Mahjong Gaya Hong Kong</h2>
        <p>Dipakai di situs ini dan paling umum dimainkan di Indonesia. Banyak meja punya “aturan rumah” sendiri — angka di bawah adalah standar yang umum dan mudah diubah.</p></section>
      <section class="card"><h2>1. Perlengkapan</h2>
        <table class="tbl"><tbody>
          <tr><td>Wan, Tong, Tiao</td><td>3 suit × 9 angka × 4 lembar</td><td class="num">108</td></tr>
          <tr><td>Angin 東南西北</td><td>4 jenis × 4 lembar</td><td class="num">16</td></tr>
          <tr><td>Naga 中發白</td><td>3 jenis × 4 lembar</td><td class="num">12</td></tr>
          <tr><td>Bunga & Musim</td><td>8 kartu bonus, 1 lembar</td><td class="num">8</td></tr>
          <tr><td colspan="2"><b>Total</b></td><td class="num">144</td></tr></tbody></table>
        <p>Ditambah 3 dadu. Empat pemain.</p></section>
      <section class="card"><h2>2. Persiapan</h2><ol>
        <li><b>Dealer</b>: setiap pemain melempar 3 dadu, tertinggi menjadi Timur (東). Angin lain berlawanan arah jarum jam: Selatan, Barat, Utara.</li>
        <li><b>Kocok</b> semua kartu tertelungkup.</li>
        <li><b>Tembok</b>: tiap pemain menyusun 18 tumpukan × 2 kartu.</li>
        <li><b>Pecah tembok</b>: dealer melempar 3 dadu; hitung pemain dari dealer (=1) berlawanan arah jarum jam; pada tembok terpilih, hitung tumpukan sebanyak angka dadu dari kanan; ambil mulai tumpukan berikutnya, searah jarum jam.</li>
        <li><b>Bagi</b>: 4-4-4 kartu bergiliran, lalu 1 kartu tiap pemain, dealer +1. Dealer 14, lainnya 13.</li>
        <li><b>Bunga</b>: dibuka & diganti dari ujung belakang tembok (dealer dahulu).</li></ol></section>
      <section class="card"><h2>3. Jalannya permainan</h2><ul>
        <li>Giliran berlawanan arah jarum jam: ambil 1 kartu, buang 1 kartu.</li>
        <li>Klaim buangan: <b>Hu</b> &gt; <b>Pong/Kong</b> &gt; <b>Chow</b>. Chow hanya dari pemain sebelummu.</li>
        <li>Kong (4 kartu sama): tertutup, terbuka dari buangan, atau menambah Pong yang sudah terbuka. Setelah Kong ambil kartu pengganti dari ujung belakang.</li>
        <li>Tembok habis tanpa pemenang = <b>seri</b>.</li></ul></section>
      <section class="card"><h2>4. Bentuk menang</h2><ul>
        <li>4 set (Chow/Pong/Kong) + 1 mata.</li><li>Tujuh Pasang (tertutup).</li><li>Tiga Belas Yatim.</li>
        <li>Harus memenuhi <b>minimal fan</b> yang disepakati (situs ini: 0, 1, atau 3).</li></ul></section>
      <section class="card"><h2>5. Tabel fan</h2>
        <table class="tbl"><thead><tr><th>Pola</th><th>Keterangan</th><th>Fan</th></tr></thead><tbody>${FAN_LIST.map(([n, zh, f, d]) => `<tr><td><b>${n}</b> <span class="zh muted">${zh}</span></td><td>${d}</td><td class="num">${f}</td></tr>`).join('')}</tbody></table>
        <p class="muted">Batas maksimal 13 fan. Untuk pembayaran, fan dihitung paling tinggi 10.</p></section>
      <section class="card"><h2>6. Poin & pembayaran</h2>
        <table class="tbl"><thead><tr><th>Fan</th>${POINT_TABLE.map((_, i) => `<th>${i}${i === 10 ? '+' : ''}</th>`).join('')}</tr></thead><tbody><tr><td><b>Poin</b></td>${POINT_TABLE.map(p => `<td class="num">${p}</td>`).join('')}</tr></tbody></table>
        <ul><li><b>Zimo</b>: tiap lawan membayar 1 × poin dasar.</li><li><b>Dari buangan</b>: pembuang membayar 2 × poin dasar.</li><li>Setiap pemain mulai dengan 500 poin.</li></ul></section>
      <section class="card"><h2>7. Pergantian dealer & ronde</h2><ul>
        <li>Dealer menang atau seri → dealer tetap.</li><li>Pemain lain menang → dealer pindah ke kanan.</li>
        <li>Setelah keempat pemain menjadi dealer, angin ronde berganti (Timur → Selatan → Barat → Utara).</li></ul></section>`;
  }

  /* ---------- pengaturan permainan ---------- */
  function setupMode(m) {
    $('#cfg-mode').value = m;
    const watch = m === 'watch';
    $('#setup-title').textContent = watch ? 'Simulasi: 4 Bot Bermain' : 'Main melawan Mesin';
    $('#setup-desc').textContent = watch
      ? 'Empat bot bermain dengan kartu terbuka. Aktifkan Log untuk membaca setiap keputusan: ambil, buang, Chow, Pong, Kong, hingga perhitungan fan.'
      : 'Kamu duduk di bawah, tiga bot di kanan, atas, dan kiri. Giliran berjalan berlawanan arah jarum jam.';
    $('#lbl-name').hidden = watch;
    $('#cfg-hint').parentElement.hidden = watch;
    $('#cfg-show').parentElement.hidden = watch;
  }
  $('#cfg-mode').addEventListener('change', e => setupMode(e.target.value));
  $('#cfg-start').addEventListener('click', () => {
    const m = $('#cfg-mode').value;
    Game.start({
      mode: m,
      name: $('#cfg-name').value.trim() || 'Kamu',
      minFan: +$('#cfg-minfan').value,
      length: $('#cfg-length').value,
      speed: m === 'watch' && $('#cfg-speed').value === 'normal' ? 'normal' : $('#cfg-speed').value,
      hint: $('#cfg-hint').checked,
      showHands: $('#cfg-show').checked,
    });
    if (m === 'watch') $('#log').hidden = false;
  });

  /* ---------- mode meja penuh + laci menu ---------- */
  const games = ['#game', '#on-game'].map(q => $(q));
  const closeDrawers = () => games.forEach(g => g.classList.remove('dr-open'));
  function syncInGame() {
    const on = (!$('#view-play').hidden && !$('#game').hidden) || (!$('#view-online').hidden && !$('#on-game').hidden);
    const was = document.body.classList.contains('in-game');
    document.body.classList.toggle('in-game', on);
    document.documentElement.classList.toggle('in-game', on);
    if (on && !was) armBackGuard();
    if (!on) {
      closeDrawers();
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => { });
      if (was) disarmBackGuard();
    }
  }

  /* ---------- penjaga sesi: Back & refresh tidak sengaja ---------- */
  // Saat bermain, satu entri riwayat "penjaga" ditambahkan. Tombol/gesture Back hanya
  // menghapus entri itu → kita pasang lagi dan tanyakan dulu apakah benar mau keluar.
  let guarded = false, guardHref = '';
  const inGame = () => document.body.classList.contains('in-game');
  function armBackGuard() {
    if (guarded) return;
    guardHref = location.href;
    history.pushState({ mjnGuard: true }, '', guardHref);
    guarded = true;
  }
  function disarmBackGuard() {
    // jangan history.back() (bisa bertabrakan dengan navigasi) — cukup netralkan entri penjaga
    if (guarded && history.state && history.state.mjnGuard) history.replaceState(null, '', location.href);
    guarded = false;
  }
  async function exitCurrentGame() {
    if (!$('#on-game').hidden && !$('#view-online').hidden) Online.leave();
    else Game.quit();
  }
  window.addEventListener('popstate', async () => {
    if (!inGame() || !guarded) { guarded = false; return; }
    // pindah lewat link/menu (alamat berubah) ≠ tombol Back (kembali ke alamat yang sama)
    if (location.href !== guardHref) { guarded = false; return; }
    history.pushState({ mjnGuard: true }, '', location.href);   // tahan di meja
    guarded = true;
    const g = games.find(x => x.classList.contains('dr-open'));
    if (g) { g.classList.remove('dr-open'); return; }              // Back pertama: tutup menu dulu
    if (FX.isAsking() || !$('#modal').hidden) return;
    const online = !$('#on-game').hidden && !$('#view-online').hidden;
    const ok = await FX.ask(online ? 'Keluar dari room?' : 'Keluar dari permainan?', {
      text: online ? 'Kursimu akan dimainkan bot. Kamu bisa masuk lagi dengan kode room yang sama.' : 'Permainan yang sedang berjalan akan dihentikan.',
      yes: 'Keluar', no: 'Lanjut main',
    });
    if (ok && inGame()) exitCurrentGame();
  });
  // refresh lewat keyboard diblokir saat bermain
  document.addEventListener('keydown', e => {
    if (!inGame()) return;
    const k = e.key.toLowerCase();
    if (k === 'f5' || ((e.metaKey || e.ctrlKey) && k === 'r')) {
      e.preventDefault();
      FX.toast('Refresh dinonaktifkan saat bermain. Keluar lewat menu ☰ jika ingin berhenti.');
    }
  }, true);
  // menutup tab / refresh dari tombol browser → browser menampilkan peringatan
  window.addEventListener('beforeunload', e => {
    if (inGame()) { e.preventDefault(); e.returnValue = ''; }
  });
  const mo = new MutationObserver(syncInGame);
  ['#game', '#on-game', '#view-play', '#view-online'].forEach(q => mo.observe($(q), { attributes: true, attributeFilter: ['hidden'] }));
  document.addEventListener('click', e => {
    const open = e.target.closest('[data-drawer]');
    if (open) { open.closest('.game').classList.toggle('dr-open'); return; }
    if (e.target.closest('.drawer [data-close], .dr-backdrop, .dr-nav a, .dr-head .brand')) closeDrawers();
    const fs = e.target.closest('[data-fullscreen]');
    if (fs) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { });
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawers(); });
  const fsLabel = () => document.querySelectorAll('[data-fullscreen]').forEach(b => {
    b.hidden = !document.fullscreenEnabled;
    b.textContent = document.fullscreenElement ? '⛶ Keluar layar penuh' : '⛶ Layar penuh';
  });
  document.addEventListener('fullscreenchange', fsLabel);
  fsLabel();

  /* ---------- router ---------- */
  let prev = null;
  function route() {
    const [v, arg] = (location.hash || '#home').slice(1).split('/');
    const view = ['home', 'learn', 'play', 'watch', 'rules', 'online', 'profile'].includes(v) ? v : 'home';
    document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== 'view-' + (view === 'watch' ? 'play' : view); });
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
    document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('active', a.dataset.view === (view === 'watch' ? 'play' : view)));
    if (prev === 'learn' && view !== 'learn') Learn.leave();
    if (view === 'learn') Learn.show(Learn.current());
    if (view === 'rules') renderRules();
    if (view === 'profile') Account.renderProfile();
    if (prev === 'online' && view !== 'online') Online.exit();
    if (view === 'online') Online.enter(arg);
    if (view === 'play' || view === 'watch') {
      const want = view === 'watch' ? 'watch' : 'play';
      if (Game.isRunning() && Game.mode() !== want) {
        if (confirm(`Permainan ${Game.mode() === 'watch' ? 'simulasi' : 'kamu'} masih berjalan. Hentikan dan buka ${want === 'watch' ? 'simulasi bot' : 'mode main'}?`)) Game.quit();
      }
      if (!Game.isRunning()) { $('#game').hidden = true; $('#setup').hidden = false; setupMode(want); }
    }
    prev = view;
    syncInGame();
    window.scrollTo({ top: 0 });
  }
  Learn.init();
  Game.init();
  Online.init();
  Account.init();
  window.addEventListener('hashchange', route);
  route();
})();
