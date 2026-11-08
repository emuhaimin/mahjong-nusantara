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
        <li>Setelah keempat pemain menjadi dealer, angin ronde berganti (Timur → Selatan → Barat → Utara).</li></ul></section>
      <section class="card" id="rules-tw"><p class="eyebrow">Varian</p><h2>Taiwan 16 kartu <span class="zh muted">台灣16張</span></h2>
        <ul><li>144 kartu termasuk bunga. Tiap pemain memegang <b>16 kartu</b> (dealer 17); menang = <b>5 set + 1 pasang</b> (17 kartu). Tidak ada Tujuh Pasang.</li>
          <li>Tidak ada minimal: tangan tanpa tai tetap sah. Bayar = <b>dasar 30 + tai × 10</b>. Pembuang membayar sendiri; Zimo dibayar ketiga lawan.</li>
          <li><b>Dealer (莊家)</b> menambah 1 tai pada pembayaran yang melibatkan dealer, +2 tai lagi tiap kali dealer lanjut (連莊).</li></ul>
        <table class="tbl"><thead><tr><th>Pola</th><th>Tai</th></tr></thead><tbody>
          ${[['Tangan Tertutup (門清)', 1], ['Zimo (自摸)', 1], ['Tertutup + Zimo (門清自摸)', 3], ['Semua Chow — tanpa huruf/bunga, tunggu dua sisi (平胡)', 2], ['Semua Minta, menang dari buangan (全求人)', 2], ['Tunggu Tunggal (獨聽)', 1], ['Kartu Terakhir / Buangan Terakhir / Menang dari Kong', 1], ['Bunga Kursi Sendiri (正花), tiap kartu', 1], ['Satu Set Bunga atau Musim (花槓)', 2], ['Pong Naga, tiap set (三元牌)', 1], ['Pong Angin Kursi / Angin Ronde', 1], ['Tiga Pong Tertutup / Empat / Lima (暗刻)', '2 / 5 / 8'], ['Semua Pong (碰碰胡)', 4], ['Satu Warna Campur (混一色)', 4], ['Tiga Naga Kecil / Besar (小/大三元)', '4 / 8'], ['Satu Warna Murni (清一色)', 8], ['Delapan Bunga (八仙過海)', 8], ['Empat Angin Kecil / Besar (小/大四喜)', '8 / 16'], ['Semua Huruf (字一色)', 16], ['Menang Surga (天胡)', 24]].map(([n, t]) => `<tr><td>${n}</td><td class="num">${t}</td></tr>`).join('')}</tbody></table></section>
      <section class="card" id="rules-jp"><p class="eyebrow">Varian</p><h2>Jepang — Riichi <span class="zh muted">立直麻雀</span></h2>
        <ul><li>136 kartu, <b>tanpa bunga</b>; satu lima merah (赤) di tiap suit = +1 han dora. Skor awal 25.000.</li>
          <li>Menang <b>wajib punya minimal 1 yaku</b>. Dora (kartu setelah indikator di dead wall) menambah han tetapi bukan yaku.</li>
          <li><b>Riichi</b>: tangan tertutup & Ting → bayar tongkat 1000, +1 han, ura-dora dibuka saat menang. Setelah riichi tangan terkunci.</li>
          <li><b>Furiten</b>: bila salah satu kartu tunggumu pernah kamu buang (atau kamu melewatkan Ron), kamu hanya boleh menang Tsumo.</li>
          <li>Skor = <b>han & fu</b> → poin dasar fu × 2<sup>han+2</sup>; Mangan (5 han) 8000, Haneman 12000, Baiman 16000, Sanbaiman 24000, Yakuman 32000 (dealer ×1,5). Honba +300 per hand lanjutan.</li>
          <li>Seri karena tembok habis: pemain yang Ting menerima total 3000 dari yang tidak Ting. Dealer lanjut bila menang atau Ting.</li></ul>
        <table class="tbl"><thead><tr><th>Yaku</th><th>Han (tertutup / terbuka)</th></tr></thead><tbody>
          ${[['Riichi · Ippatsu · Menzen Tsumo · Pinfu · Iipeikou', '1 / —'], ['Tanyao (semua 2–8) · Yakuhai (Pong naga / angin kursi / angin ronde) · Haitei · Houtei · Rinshan', '1 / 1'], ['Sanshoku · Ittsu · Chanta', '2 / 1'], ['Chiitoitsu (7 pasang) · Double Riichi', '2 / —'], ['Toitoi · Sanankou · Sanshoku Doukou · Sankantsu · Honroutou · Shousangen', '2 / 2'], ['Honitsu (satu warna + huruf) · Junchan', '3 / 2'], ['Ryanpeikou', '3 / —'], ['Chinitsu (satu warna murni)', '6 / 5'], ['Yakuman: Kokushi, Suuankou, Daisangen, Shousuushii, Daisuushii, Tsuuiisou, Chinroutou, Ryuuiisou, Chuuren, Suukantsu, Tenhou', '13']].map(([n, t]) => `<tr><td>${n}</td><td class="num">${t}</td></tr>`).join('')}</tbody></table></section>`;
  }

  /* ---------- pengaturan permainan ---------- */
  function setupMode(m) {
    $('#cfg-mode').value = m;
    const watch = m === 'watch';
    setTimeout(syncPlayGate);
    $('#setup-title').textContent = watch ? 'Simulasi: 4 Bot Bermain' : 'Main melawan Mesin';
    $('#setup-desc').textContent = watch
      ? 'Empat bot bermain dengan kartu terbuka. Aktifkan Log untuk membaca setiap keputusan: ambil, buang, Chow, Pong, Kong, hingga perhitungan fan.'
      : 'Kamu duduk di bawah, tiga bot di kanan, atas, dan kiri. Giliran berjalan berlawanan arah jarum jam.';
    $('#lbl-name').hidden = watch;
    $('#cfg-hint').parentElement.hidden = watch;
    $('#cfg-show').parentElement.hidden = watch;
  }
  $('#cfg-mode').addEventListener('change', e => { setupMode(e.target.value); syncPlayGate(); });
  /* ---------- Main vs Mesin khusus pemain yang login (Simulasi bebas) ---------- */
  function syncPlayGate() {
    const locked = $('#cfg-mode').value === 'play' && !Account.canPlay();
    $('#cfg-login-note').hidden = !locked;
    $('#cfg-start').textContent = locked ? '🔒 Masuk untuk bermain' : 'Mulai Permainan';
  }
  document.addEventListener('mjn-auth', syncPlayGate);

  /* ---------- tingkat AI (diingat di perangkat ini) ---------- */
  const LV_KEY = 'mjn-level';
  const LV_DESC = {
    easy: 'Bot sering membuang asal dan asal klaim Pong/Chow. Cocok untuk yang baru belajar.',
    medium: 'Bot mengejar Ting dengan benar, tapi kadang keliru dan jarang mengejar Flush.',
    hard: 'Bot menghitung peluang kartu yang tersisa, menjaga kartu bernilai, dan mengejar Flush.',
    expert: 'Seperti Hard, plus selalu mengejar fan besar, membaca meld lawan, dan bertahan (buang kartu aman) saat lawan hampir Hu.',
    mix: 'Tiap bot punya tingkat berbeda — lihat label di bawah nama bot. Simulasi: Easy, Medium, Hard, Expert.',
  };
  const lvSel = $('#cfg-level');
  try { const v = localStorage.getItem(LV_KEY); if (v && LV_DESC[v]) lvSel.value = v; } catch { }
  const lvDesc = () => { $('#cfg-level-desc').textContent = LV_DESC[lvSel.value] || ''; };
  lvSel.addEventListener('change', () => { lvDesc(); try { localStorage.setItem(LV_KEY, lvSel.value); } catch { } });
  lvDesc();
  /* ---------- tombol 📣 Ajak teman (Beranda, Profil, dll.) ---------- */
  document.addEventListener('click', e => { if (e.target.closest('[data-share-app]')) MjnShare.shareApp(); });

  /* ---------- jenis mahjong (diingat di perangkat ini) ---------- */
  const VAR_KEY = 'mjn-variant';
  const varVal = () => (document.querySelector('input[name="cfg-variant"]:checked') || {}).value || 'hk';
  function syncVariant() {
    const V = MJN_VARIANTS[varVal()];
    const mf = $('#cfg-minfan');
    mf.innerHTML = V.minOptions.map(([v, t]) => `<option value="${v}"${v === V.defaultMin ? ' selected' : ''}>${t}</option>`).join('');
    mf.disabled = V.minOptions.length < 2;
    mf.parentElement.firstChild.textContent = V.id === 'hk' ? 'Minimal fan untuk menang' : V.id === 'tw' ? 'Minimal tai' : 'Syarat menang';
    const len = $('#cfg-length');
    len.options[1].textContent = V.id === 'jp' ? 'Tonpuusen — ronde Timur (min. 4 hand)' : '1 ronde angin (min. 4 hand)';
    len.options[2].textContent = V.id === 'jp' ? 'Hanchan — Timur + Selatan (min. 8 hand)' : '4 ronde angin (penuh)';
  }
  try { const v = localStorage.getItem(VAR_KEY); const r = v && document.querySelector(`input[name="cfg-variant"][value="${v}"]`); if (r) r.checked = true; } catch { }
  document.querySelectorAll('input[name="cfg-variant"]').forEach(r => r.addEventListener('change', () => { syncVariant(); try { localStorage.setItem(VAR_KEY, varVal()); } catch { } }));
  syncVariant();
  $('#cfg-start').addEventListener('click', () => {
    const m = $('#cfg-mode').value;
    if (m === 'play' && !Account.canPlay()) { Account.requireLogin(null, '#play'); return; }
    Game.start({
      mode: m,
      name: $('#cfg-name').value.trim() || 'Kamu',
      minFan: +$('#cfg-minfan').value,
      length: $('#cfg-length').value,
      speed: m === 'watch' && $('#cfg-speed').value === 'normal' ? 'normal' : $('#cfg-speed').value,
      hint: $('#cfg-hint').checked,
      showHands: $('#cfg-show').checked,
      level: lvSel.value,
      variant: varVal(),
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
    const view = ['home', 'learn', 'play', 'watch', 'rules', 'online', 'profile', 'tools'].includes(v) ? v : 'home';
    document.querySelectorAll('.view').forEach(s => { s.hidden = s.id !== 'view-' + (view === 'watch' ? 'play' : view); });
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
    document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('active', a.dataset.view === (view === 'watch' ? 'play' : view)));
    if (prev === 'learn' && view !== 'learn') Learn.leave();
    if (view === 'learn') Learn.show(Learn.current());
    if (view === 'rules') renderRules();
    if (view === 'profile') Account.renderProfile();
    if (view === 'tools') Tools.show(arg);
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
  Tools.init();
  window.addEventListener('hashchange', route);
  route();
})();
