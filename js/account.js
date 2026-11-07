/* account.js — login Google, kirim rekaman sesi, halaman Profil (statistik, saran, riwayat) */
const Account = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const QKEY = 'mjn-queue';
  let user = null, clientId = null, ready = false, gisLoading = null, nudged = false, loadingStats = false, lastFill = '';
  const display = () => (user ? (user.alias || user.given || user.name || 'Pemain') : '');

  async function api(path, opt = {}) {
    const r = await fetch(path, { credentials: 'same-origin', headers: opt.body ? { 'content-type': 'application/json' } : {}, ...opt });
    let j = null; try { j = await r.json(); } catch { }
    if (!r.ok) throw Object.assign(new Error((j && j.error) || ('Gagal (' + r.status + ')')), { status: r.status });
    return j;
  }

  /* ---------- status login ---------- */
  async function init() {
    if (location.protocol !== 'file:') {
      try {
        const [c, m] = await Promise.all([api('api/config'), api('api/me')]);
        clientId = c.googleClientId; user = m.user;
      } catch { /* server tanpa API (mis. hosting statis) → mode tamu */ }
    }
    ready = true;
    renderChip(); prefill(true); flushQueue();
    if (!$('#view-profile').hidden) renderProfile();
  }
  const isLoggedIn = () => !!user;
  function renderChip() {
    const el = $('#acct-chip');
    if (!el) return;
    el.innerHTML = user
      ? `${user.picture ? `<img src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="av-fallback">${esc(display()[0] || '?')}</span>`}<span class="acct-name">${esc(display())}</span>`
      : `<span class="acct-login">Masuk</span>`;
    el.title = user ? `Profil ${user.name}` : 'Masuk dengan Google';
  }
  /** isi nama pemain dengan alias. force: saat masuk/ganti alias selalu dipakai (nama lama tersimpan ditimpa) */
  function prefill(force) {
    if (!user) return;
    const name = display().slice(0, 14);
    for (const q of ['#cfg-name', '#on-name']) {
      const el = $(q);
      if (el && (force || !el.value.trim() || el.value === 'Kamu' || el.value === lastFill || el.value === user.given)) el.value = name;
    }
    lastFill = name;
  }

  /* ---------- nama alias ---------- */
  function askAlias(first) {
    return new Promise(resolve => {
      const w = document.createElement('div');
      w.className = 'fx-confirm';
      w.innerHTML = `<form class="fx-confirm-box" role="dialog" aria-modal="true" novalidate>
          <h3>${first ? '👋 Pilih nama alias kamu' : 'Ubah nama alias'}</h3>
          <p>Nama ini yang terlihat oleh pemain lain di meja (Main vs Mesin &amp; Online). Nama asli Google-mu tidak ditampilkan.</p>
          <label class="alias-field"><span>Nama alias</span>
            <input name="alias" maxlength="14" autocomplete="nickname" autocapitalize="words" enterkeyhint="done" value="${esc(user.alias || user.given || '')}" placeholder="mis. RajaMahjong"></label>
          <small class="alias-hint">2–14 karakter: huruf, angka, spasi, titik, _ atau -</small>
          <p class="on-err alias-err" hidden></p>
          <div class="modal-actions"><button type="button" class="btn ghost" data-v="0">${first ? 'Nanti saja' : 'Batal'}</button><button type="submit" class="btn jade">Simpan alias</button></div></form>`;
      const form = w.querySelector('form'), input = form.querySelector('input'), err = form.querySelector('.alias-err');
      const done = v => { w.remove(); resolve(v); };
      w.addEventListener('click', e => { if (e.target.closest('[data-v="0"]') || e.target === w) done(false); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const v = input.value.replace(/\s+/g, ' ').trim();
        if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,13}$/u.test(v)) { err.hidden = false; err.textContent = 'Alias 2–14 karakter: huruf, angka, spasi, titik, _ atau -. Harus diawali huruf/angka.'; input.focus(); return; }
        try {
          const r = await api('api/me/alias', { method: 'POST', body: JSON.stringify({ alias: v }) });
          user = r.user; renderChip(); prefill(true);
          FX.toast(`Nama alias kamu sekarang “${display()}”.`);
          done(true); renderProfile();
        } catch (ex) { err.hidden = false; err.textContent = ex.message; }
      });
      document.body.appendChild(w);
      setTimeout(() => { input.focus(); input.select(); }, 50);
    });
  }

  /* ---------- tombol Google ---------- */
  function loadGis() {
    if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = res; s.onerror = () => { gisLoading = null; rej(new Error('gsi')); };
      document.head.appendChild(s);
    });
    return gisLoading;
  }
  async function renderGoogleButton(el) {
    if (!clientId) { el.innerHTML = '<p class="muted">Login Google belum diaktifkan di server ini (GOOGLE_CLIENT_ID belum diatur).</p>'; return; }
    try {
      await loadGis();
      google.accounts.id.initialize({ client_id: clientId, callback: onCredential, ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_prompt: true });
      el.innerHTML = '';
      google.accounts.id.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', locale: 'id', width: Math.max(220, Math.min(340, el.clientWidth || 320)) });
    } catch {
      el.innerHTML = '<p class="on-err">Tombol Google tidak bisa dimuat. Periksa koneksi internet lalu muat ulang.</p>';
    }
  }
  async function onCredential(resp) {
    try {
      const r = await api('api/auth/google', { method: 'POST', body: JSON.stringify({ credential: resp.credential }) });
      user = r.user;
      renderChip(); prefill(true); flushQueue(); renderProfile();
      if (!user.alias) await askAlias(true);
      FX.toast(`Halo, ${display()}! Riwayat permainanmu sekarang tersimpan.`);
    } catch (e) { FX.toast(e.message); }
  }
  async function logout() {
    try { await api('api/auth/logout', { method: 'POST' }); } catch { }
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch { }
    user = null; renderChip(); renderProfile();
    FX.toast('Kamu sudah keluar dari akun.');
  }
  async function deleteAccount() {
    const ok = await FX.ask('Hapus akun & semua riwayat?', { text: 'Profil, statistik, dan seluruh riwayat permainanmu dihapus permanen dari server. Tindakan ini tidak bisa dibatalkan.', yes: 'Hapus permanen', no: 'Batal' });
    if (!ok) return;
    try { await api('api/me', { method: 'DELETE' }); user = null; localStorage.removeItem(QKEY); renderChip(); renderProfile(); FX.toast('Akun dan riwayatmu sudah dihapus.'); }
    catch (e) { FX.toast(e.message); }
  }

  /* ---------- kirim rekaman sesi (antre jika sedang offline) ---------- */
  function readQ() { try { return JSON.parse(localStorage.getItem(QKEY)) || []; } catch { return []; } }
  function writeQ(q) { try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-30))); } catch { } }
  function submit(rec) {
    if (!user) {
      if (!nudged && ready && clientId) { nudged = true; setTimeout(() => FX.toast('Masuk dengan Google (menu Profil) agar riwayat & evaluasi permainanmu tersimpan.'), 600); }
      return;
    }
    const q = readQ(); q.push(rec); writeQ(q);
    flushQueue();
  }
  let flushing = false;
  async function flushQueue() {
    if (!user || flushing) return;
    flushing = true;
    try {
      let q = readQ();
      while (q.length) {
        try { await api('api/games', { method: 'POST', body: JSON.stringify({ record: q[0] }) }); }
        catch (e) { if (e.status === 400 || e.status === 413) { /* data rusak → buang */ } else break; }
        q = readQ(); q.shift(); writeQ(q);
      }
    } finally { flushing = false; }
  }
  window.addEventListener('online', flushQueue);

  /* ---------- halaman Profil ---------- */
  const RES = {
    win: ['Menang', 'ok'], zimo: ['Menang Zimo', 'ok'], dealin: ['Kena tembak', 'bad'],
    lose: ['Lawan Zimo', 'mid'], other: ['Lawan menang', 'mid'], draw: ['Seri', 'mid'],
  };
  const fmtDate = t => new Date(t).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const tile = (k, cls = 'xs') => (k == null ? '' : tileHTML(k, { cls }));
  const pctTxt = v => (v == null ? '–' : v + '%');

  function mistakeHTML(m) {
    if (m.t === 'worse') return `<li>${tile(m.k)} Hand ${m.h}: membuang <b>${tileName(m.k)}</b> membuat tangan lebih jauh dari Ting${m.better != null ? ` — lebih baik buang ${tile(m.better)} <b>${tileName(m.better)}</b>` : ''}.</li>`;
    if (m.t === 'dealin') return `<li>${tile(m.k)} Hand ${m.h}: buangan <b>${m.k != null ? tileName(m.k) : 'kartu'}</b> membuat lawan Hu.</li>`;
    if (m.t === 'missedwin') return `<li>${tile(m.k)} Hand ${m.h}: melewatkan Hu dari <b>${m.k != null ? tileName(m.k) : 'buangan'}</b>${m.fan != null ? ` (${m.fan} fan)` : ''}.</li>`;
    if (m.t === 'missedtsumo') return `<li>Hand ${m.h}: sudah bisa <b>Zimo</b>${m.fan != null ? ` (${m.fan} fan)` : ''} tetapi memilih membuang kartu.</li>`;
    if (m.t === 'claim') return `<li>${tile(m.k)} Hand ${m.h}: <b>${m.c === 'chow' ? 'Chow' : m.c === 'kong' ? 'Kong' : 'Pong'}</b> ${m.k != null ? tileName(m.k) : ''} tidak mempercepat tangan.</li>`;
    return '';
  }
  function sessionHTML(r) {
    const wins = r.hands.filter(h => h.r === 'win' || h.r === 'zimo').length;
    const delta = (r.score || 0) - 500;
    const lenTxt = { one: '1 hand', east: '1 ronde', full: '4 ronde' }[r.length] || '';
    const hands = r.hands.map(h => {
      const [lbl, cls] = RES[h.r] || ['–', 'mid'];
      return `<tr><td>${h.n}</td><td><span class="res-badge ${cls}">${lbl}</span>${h.items && h.items.length ? `<small class="pf-items">${h.items.map(x => esc(x[0])).join(' · ')}</small>` : ''}</td><td>${h.fan ? h.fan + ' fan' : ''}</td><td class="${h.delta > 0 ? 'plus' : h.delta < 0 ? 'minus' : ''}">${h.delta > 0 ? '+' : ''}${h.delta}</td></tr>`;
    }).join('');
    const ms = (r.d && r.d.mistakes || []).map(mistakeHTML).join('');
    const d = r.d || {};
    return `<details class="pf-sess"><summary>
        <span class="pf-rank r${r.rank || 0}">${r.rank ? '#' + r.rank : '–'}</span>
        <span class="pf-sum"><b>${r.mode === 'online' ? '🌐 Online' : '🀄 vs Mesin'}</b> · ${r.hands.length} hand · ${wins} menang${r.complete ? '' : ' · <i>belum selesai</i>'}<small>${fmtDate(r.startedAt)} · min ${r.minFan} fan · ${lenTxt}</small></span>
        <span class="pf-delta ${delta > 0 ? 'plus' : delta < 0 ? 'minus' : ''}">${delta > 0 ? '+' : ''}${delta}</span></summary>
      <div class="pf-sess-body">
        <table class="fan-table"><thead><tr><th>#</th><th>Hasil</th><th>Fan</th><th>Skor</th></tr></thead><tbody>${hands}</tbody></table>
        <p class="muted pf-dec">Buangan sesuai saran mesin: <b>${d.discards ? Math.round(d.hintSame / d.discards * 100) : 0}%</b> · buangan menjauhkan Ting: <b>${d.worse || 0}</b> · klaim: <b>${d.claimsTaken || 0}</b>${d.autoMoves ? ` · langkah otomatis (waktu habis): ${d.autoMoves}` : ''}</p>
        ${ms ? `<h4>Catatan untuk diperbaiki</h4><ul class="pf-mistakes">${ms}</ul>` : '<p class="pf-good">✅ Tidak ada kesalahan besar tercatat di sesi ini.</p>'}
      </div></details>`;
  }
  function tileStat(label, value, sub) {
    return `<div class="pf-tile"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }
  async function renderProfile() {
    const el = $('#profile');
    if (!el) return;
    if (!ready) { el.innerHTML = '<p class="muted">Memuat…</p>'; return; }
    if (!user) {
      el.innerHTML = `<div class="card pf-login">
          <p class="eyebrow">Akun pemain</p><h2>Simpan riwayat &amp; evaluasi permainanmu</h2>
          <ul class="pf-benefits"><li>📊 Statistik: berapa kali menang, kena tembak, rata-rata fan, peringkat</li>
            <li>🧠 Evaluasi setiap keputusan: buangan, klaim, Hu yang terlewat</li>
            <li>💡 Saran perbaikan yang disesuaikan dengan gaya bermainmu</li>
            <li>🗂️ Riwayat setiap sesi Main vs Mesin &amp; Online</li></ul>
          <div id="g-btn" class="g-btn"></div>
          <p class="muted pf-note">Kami hanya menyimpan nama, email, dan foto profil Google-mu serta data permainan. Tanpa login pun kamu tetap bisa bermain. <a href="privacy.html" target="_blank" rel="noopener">Kebijakan privasi</a></p>
        </div>`;
      renderGoogleButton($('#g-btn'));
      return;
    }
    if (loadingStats) return;
    loadingStats = true;
    el.innerHTML = `<div class="card"><p class="muted">Memuat statistik ${esc(display())}…</p></div>`;
    let data;
    try { data = await api('api/stats'); }
    catch (e) { loadingStats = false; if (e.status === 401) { user = null; renderChip(); return renderProfile(); } el.innerHTML = `<div class="card"><p class="on-err">${esc(e.message)}</p></div>`; return; }
    loadingStats = false;
    const s = data.summary, t = data.trend;
    const arrow = (now, before, goodUp) => { if (now === before) return ''; const up = now > before; return `<em class="${up === goodUp ? 'plus' : 'minus'}">${up ? '▲' : '▼'}</em>`; };
    el.innerHTML = `
      <div class="card pf-head">
        ${user.picture ? `<img class="pf-av" src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="pf-av av-fallback">${esc(display()[0] || '?')}</span>`}
        <div class="pf-id"><h2>${esc(display())}</h2><small>${esc(user.name)} · ${esc(user.email)}</small></div>
        <button class="btn ghost sm" id="pf-logout">Keluar akun</button>
        <div class="pf-alias"><span>Nama di meja: <b>${esc(display())}</b>${user.alias ? '' : ' <em>(belum memilih alias)</em>'}</span>
          <button class="btn jade sm" id="pf-alias">${user.alias ? 'Ubah alias' : 'Pilih alias'}</button></div>
      </div>
      ${s.hands ? `<div class="pf-tiles">
        ${tileStat('Sesi', s.sessions, `${s.byMode.bot || 0} vs Mesin · ${s.byMode.online || 0} Online`)}
        ${tileStat('Hand', s.hands, `${s.wins} menang · ${s.draws} seri`)}
        ${tileStat('Menang', pctTxt(s.winRate), `${s.zimo} Zimo`)}
        ${tileStat('Kena tembak', pctTxt(s.dealInRate), `${s.dealins}× buanganmu membuat lawan Hu`)}
        ${tileStat('Rata-rata fan', s.avgFan == null ? '–' : s.avgFan, s.maxFan ? `tertinggi ${s.maxFan} fan` : '')}
        ${tileStat('Mencapai Ting', pctTxt(s.tenpaiRate), s.avgTenpaiTurn ? `rata-rata giliran ke-${s.avgTenpaiTurn}` : '')}
        ${tileStat('Sesuai saran', pctTxt(s.hintMatch), `${s.worse} buangan menjauhkan Ting`)}
        ${tileStat('Peringkat', s.avgRank == null ? '–' : s.avgRank, `juara 1: ${s.ranks[0]}× (${pctTxt(s.firstRate)})`)}
      </div>` : ''}
      ${t ? `<div class="card pf-trend"><b>10 sesi terakhir vs sebelumnya</b>
        <span>Menang ${t.recent.winRate}% ${arrow(t.recent.winRate, t.before.winRate, true)} <small>(${t.before.winRate}%)</small></span>
        <span>Kena tembak ${t.recent.dealInRate}% ${arrow(t.recent.dealInRate, t.before.dealInRate, false)} <small>(${t.before.dealInRate}%)</small></span>
        <span>Buangan kurang tepat ${t.recent.worseRate}% ${arrow(t.recent.worseRate, t.before.worseRate, false)} <small>(${t.before.worseRate}%)</small></span></div>` : ''}
      <section class="card"><h3>💡 Evaluasi &amp; saran perbaikan</h3>
        ${data.tips.length ? `<ul class="pf-tips">${data.tips.map(x => `<li class="${x.level}"><b>${esc(x.title)}</b><p>${esc(x.text)}</p>${x.tiles && x.tiles.length ? `<div class="pf-tip-tiles">${x.tiles.map(k => tile(k, 'sm')).join('')}</div>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Mainkan beberapa sesi untuk mendapatkan saran.</p>'}
      </section>
      <section class="card"><h3>🗂️ Riwayat sesi</h3>
        ${data.recent.length ? data.recent.map(sessionHTML).join('') : '<p class="muted">Belum ada sesi tercatat. Mainkan <a href="#play">Main vs Mesin</a> atau <a href="#online">Online</a> — hasilnya otomatis muncul di sini.</p>'}
      </section>
      <section class="card pf-danger"><h3>Data &amp; privasi</h3>
        <p class="muted">Data disimpan di server mahjong.rupaone.io dan tidak dibagikan ke pihak lain. <a href="privacy.html" target="_blank" rel="noopener">Kebijakan privasi</a></p>
        <button class="btn ghost" id="pf-delete">Hapus akun &amp; semua riwayat</button></section>`;
    $('#pf-logout').onclick = logout;
    $('#pf-alias').onclick = () => askAlias(false);
    $('#pf-delete').onclick = deleteAccount;
  }
  return { init, isLoggedIn, submit, renderProfile, user: () => user, displayName: display };
})();
