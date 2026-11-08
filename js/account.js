/* account.js — login Google, kirim rekaman sesi, halaman Profil (statistik, saran, riwayat) */
const Account = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const QKEY = 'mjn-queue', UKEY = 'mjn-user';   // UKEY: salinan akun agar tetap dikenali saat offline
  let offlineUser = false;                           // true = akun dari salinan lokal (belum dicek server)
  let serverReached = false;                         // API akun server berhasil dihubungi
  const RET_KEY = 'mjn-after-login';                 // halaman tujuan setelah login (mis. #play, #online/ABCD)
  let readyResolve; const readyP = new Promise(r => { readyResolve = r; });
  let user = null, clientId = null, ready = false, gisLoading = null, nudged = false, loadingStats = false, lastFill = '';
  const display = () => (user ? (user.alias || user.given || user.name || 'Pemain') : '');

  async function api(path, opt = {}) {
    const r = await fetch(path, { credentials: 'same-origin', headers: opt.body ? { 'content-type': 'application/json' } : {}, ...opt });
    let j = null; try { j = await r.json(); } catch { }
    if (!r.ok) throw Object.assign(new Error((j && j.error) || ('Gagal (' + r.status + ')')), { status: r.status });
    return j;
  }

  /* ---------- status login ---------- */
  function readUser() { try { return JSON.parse(localStorage.getItem(UKEY)); } catch { return null; } }
  function saveUser() { try { user ? localStorage.setItem(UKEY, JSON.stringify(user)) : localStorage.removeItem(UKEY); } catch { } }
  async function init() {
    if (location.protocol !== 'file:') {
      try {
        const [c, m] = await Promise.all([api('api/config'), api('api/me')]);
        clientId = c.googleClientId; user = m.user; offlineUser = false; saveUser(); serverReached = true;
      } catch (e) {
        // tanpa internet (mode pesawat): pakai akun terakhir agar hasil main tetap diantre & dikirim nanti.
        // Server membalas error (mis. hosting statis tanpa API) → mode tamu.
        if (!e.status) { user = readUser(); offlineUser = !!user; }
      }
    }
    ready = true; readyResolve();
    renderChip(); prefill(true); flushQueue(); emitAuth();
    if (!$('#view-profile').hidden) renderProfile();
  }
  const isLoggedIn = () => !!user;
  /* ---------- akses bermain: Main vs Mesin & Online khusus pemain yang login Google ----------
     Belajar, Simulasi Bot & Aturan bebas. Pengecualian: dibuka langsung dari file (tanpa server) atau
     server yang memang belum mengaktifkan login Google (pengembangan lokal). */
  const canPlay = () => !!user || location.protocol === 'file:' || (serverReached && !clientId);
  function emitAuth() {
    document.documentElement.classList.toggle('guest', !canPlay());
    document.dispatchEvent(new CustomEvent('mjn-auth', { detail: { user, canPlay: canPlay() } }));
  }
  /** ajak login; setelah berhasil, kembali ke `back` (hash halaman) */
  async function requireLogin(text, back) {
    const ok = await FX.ask('🔒 Masuk dengan Google untuk bermain', {
      text: text || 'Main vs Mesin dan Online khusus pemain yang sudah login, agar riwayat, tingkat & badge-mu tersimpan. Belajar dan Simulasi Bot tetap bisa tanpa login.',
      yes: 'Masuk dengan Google', no: 'Nanti saja' });
    if (!ok) return false;
    try { sessionStorage.setItem(RET_KEY, back || location.hash || '#home'); } catch { }
    location.hash = '#profile';
    return false;
  }
  function goBackAfterLogin() {
    let back = null; try { back = sessionStorage.getItem(RET_KEY); sessionStorage.removeItem(RET_KEY); } catch { }
    if (back && back !== '#profile') { location.hash = back; FX.toast('Sudah masuk — silakan lanjut bermain.'); }
  }
  function renderChip() {
    const el = $('#acct-chip');
    if (!el) return;
    el.innerHTML = user
      ? `${user.picture && navigator.onLine !== false ? `<img src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer">` : `<span class="av-fallback">${esc(display()[0] || '?')}</span>`}<span class="acct-name">${esc(display())}</span>`
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
          user = r.user; saveUser(); renderChip(); prefill(true);
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
      user = r.user; offlineUser = false; saveUser();
      renderChip(); prefill(true); flushQueue(); renderProfile(); emitAuth();
      if (!user.alias) await askAlias(true);
      FX.toast(`Halo, ${display()}! Riwayat permainanmu sekarang tersimpan.`);
      goBackAfterLogin();
    } catch (e) { FX.toast(e.message); }
  }
  async function logout() {
    try { await api('api/auth/logout', { method: 'POST' }); } catch { }
    try { if (window.google && google.accounts) google.accounts.id.disableAutoSelect(); } catch { }
    user = null; saveUser(); renderChip(); renderProfile(); emitAuth();
    FX.toast('Kamu sudah keluar dari akun.');
  }
  async function deleteAccount() {
    const ok = await FX.ask('Hapus akun & semua riwayat?', { text: 'Profil, statistik, dan seluruh riwayat permainanmu dihapus permanen dari server. Tindakan ini tidak bisa dibatalkan.', yes: 'Hapus permanen', no: 'Batal' });
    if (!ok) return;
    try { await api('api/me', { method: 'DELETE' }); user = null; saveUser(); localStorage.removeItem(QKEY); renderChip(); renderProfile(); emitAuth(); FX.toast('Akun dan riwayatmu sudah dihapus.'); }
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
        catch (e) {
          if (e.status === 400 || e.status === 413) { /* data rusak → buang */ }
          else { if (e.status === 401) { user = null; offlineUser = false; saveUser(); renderChip(); } break; }
        }
        q = readQ(); q.shift(); writeQ(q);
      }
    } finally { flushing = false; }
  }
  // internet kembali: cek ulang akun (bila tadi pakai salinan lokal), lalu kirim antrean
  window.addEventListener('online', async () => {
    if (offlineUser || !clientId) {
      try {
        const [c, m] = await Promise.all([api('api/config'), api('api/me')]);
        clientId = c.googleClientId; user = m.user; offlineUser = false; saveUser(); serverReached = true; renderChip(); emitAuth();
      } catch { }
    }
    flushQueue();
    if (!$('#view-profile').hidden) renderProfile();
  });

  /* ---------- halaman Profil ---------- */
  const RES = {
    win: ['Menang', 'ok'], zimo: ['Menang Zimo', 'ok'], dealin: ['Kena tembak', 'bad'],
    lose: ['Lawan Zimo', 'mid'], other: ['Lawan menang', 'mid'], draw: ['Seri', 'mid'],
  };
  const LV_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert', mix: 'Campuran' };
  const VAR_NAME = { tw: 'Taiwan', jp: 'Riichi' };
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
    const delta = (r.score || 0) - ({ tw: 1000, jp: 25000 }[r.variant] || 500);
    const lenTxt = { one: '1 hand', east: '1 ronde', full: '4 ronde' }[r.length] || '';
    const hands = r.hands.map(h => {
      const [lbl, cls] = RES[h.r] || ['–', 'mid'];
      return `<tr><td>${h.n}</td><td><span class="res-badge ${cls}">${lbl}</span>${h.items && h.items.length ? `<small class="pf-items">${h.items.map(x => esc(x[0])).join(' · ')}</small>` : ''}</td><td>${h.fan ? h.fan + ' fan' : ''}</td><td class="${h.delta > 0 ? 'plus' : h.delta < 0 ? 'minus' : ''}">${h.delta > 0 ? '+' : ''}${h.delta}</td></tr>`;
    }).join('');
    const ms = (r.d && r.d.mistakes || []).map(mistakeHTML).join('');
    const d = r.d || {};
    return `<details class="pf-sess"><summary>
        <span class="pf-rank r${r.rank || 0}">${r.rank ? '#' + r.rank : '–'}</span>
        <span class="pf-sum"><b>${r.mode === 'online' ? '🌐 Online' : '🀄 vs Mesin'}</b>${VAR_NAME[r.variant] ? ` <span class="lv-tag lv-mix">${VAR_NAME[r.variant]}</span>` : ''}${r.level ? ` <span class="lv-tag lv-${esc(r.level)}">${esc(LV_NAME[r.level] || r.level)}</span>` : ''} · ${r.hands.length} hand · ${wins} menang${r.complete ? '' : ' · <i>belum selesai</i>'}<small>${fmtDate(r.startedAt)} · ${r.variant === 'jp' ? 'wajib yaku' : r.variant === 'tw' ? '16 kartu' : `min ${r.minFan} fan`} · ${lenTxt}</small></span>
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
  /* ---------- tingkat & badge (js/progress.js) ---------- */
  const RARITY = { bronze: ['#b8733a', 'Perunggu'], silver: ['#9aa5ad', 'Perak'], gold: ['#d4a531', 'Emas'], jade: ['#1f9e6e', 'Giok'] };
  /** medali orisinal: cincin berwarna + kartu mahjong krem berhuruf di tengah */
  function medalSVG(ch, color, cls = '') {
    return `<svg class="medal ${cls}" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill="${color}"/>
      <path d="M12 42 A39 39 0 0 1 88 42" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="5" stroke-linecap="round"/>
      <circle cx="50" cy="50" r="40" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="2.5 3.5"/>
      <circle cx="50" cy="50" r="35" fill="#0f3d2c"/>
      <rect x="32" y="24" width="36" height="50" rx="7" fill="#c9b98f"/>
      <rect x="32" y="21" width="36" height="50" rx="7" fill="#fffaf0" stroke="${color}" stroke-width="2.2"/>
      <text x="50" y="57" text-anchor="middle" font-size="27" font-weight="700" fill="#b3262e" style="font-family:var(--cjk)">${esc(ch)}</text>
    </svg>`;
  }
  function rankCardHTML(pg) {
    if (!pg || typeof MJN_TIERS === 'undefined') return '';
    const r = pg.rank, t = MJN_TIERS[r.tierIndex];
    const left = r.next == null ? null : r.next - r.rp;
    const st = pg.standing;
    return `<section class="card pf-level" style="--tier:${t.color}">
        ${medalSVG(t.ch, t.color, 'big')}
        <div class="pf-level-body">
          <p class="eyebrow">Tingkat pemain</p>
          <h3><span class="zh">${t.zh}</span> ${esc(r.label)}</h3>
          <div class="pf-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r.pct}"><span style="width:${r.pct}%"></span></div>
          <small>${r.rp} RP${left != null ? ` · <b>${left}</b> RP lagi menuju ${esc(r.nextName)}` : ' · puncak tertinggi!'}</small>
          ${st ? `<p class="pf-standing">🏅 Peringkat <b>#${st.pos}</b> dari ${st.total} pemain</p>` : ''}
        </div>
        <details class="pf-howto"><summary>Cara naik tingkat</summary>
          <ul class="pf-tierlist">${MJN_TIERS.map((x, i) => `<li class="${i === r.tierIndex ? 'cur' : ''}">${medalSVG(x.ch, x.color, 'xs')}<span><b>${x.name}</b> <span class="zh muted">${x.zh}</span><small>${x.subs.length > 1 ? `${x.subs[0]}–${(MJN_TIERS[i + 1] ? MJN_TIERS[i + 1].subs[0] : '∞')} RP · ${x.subs.length} sub-tingkat` : `${x.subs[0]}+ RP`} — ${esc(x.desc)}</small></span></li>`).join('')}</ul>
          <p class="muted">RP didapat dari <b>posisi akhir sesi lengkap</b> (juara 1 +40, ke-2 +15, ke-3 0, ke-4 −15 mulai tier Jagoan) dan <b>tiap hand menang</b> (+2, ditambah setengah fan). Semua dikali tingkat lawan (Easy ×0,4 · Medium ×0,8 · Hard ×1 · Expert ×1,3 · Online ×1,2), dan poin posisi juga dikali panjang permainan (1 hand ×0,25 · 4 ronde ×2). Tier yang sudah dicapai tidak bisa turun.</p>
        </details>
      </section>`;
  }
  function badgesHTML(pg) {
    if (!pg || typeof MJN_BADGES === 'undefined') return '';
    const got = pg.badges.filter(b => b.earned).length;
    const byId = Object.fromEntries(pg.badges.map(b => [b.id, b]));
    return `<section class="card pf-badges"><h3>🏅 Badge <small class="muted">${got} dari ${MJN_BADGES.length}</small></h3>
        <p class="muted">Didapat dari Main vs Mesin &amp; Online saat login. Ketuk badge untuk melihat syaratnya.</p>
        <div class="badge-grid">${MJN_BADGES.map(d => {
          const b = byId[d.id] || { have: 0, need: d.need, earned: false };
          return `<button type="button" class="badge${b.earned ? ' earned' : ''} r-${d.rarity}" data-badge="${d.id}" title="${esc(d.name)}">${medalSVG(d.ch, RARITY[d.rarity][0], b.earned ? '' : 'locked')}<span>${esc(d.name)}</span>${!b.earned && b.need > 1 ? `<em>${b.have}/${b.need}</em>` : ''}</button>`;
        }).join('')}</div>
        <div class="badge-info" id="pf-badge-info" hidden></div>
      </section>`;
  }
  function bindBadges(pg) {
    const box = $('#pf-badge-info');
    if (!box) return;
    document.querySelectorAll('.badge[data-badge]').forEach(btn => btn.addEventListener('click', () => {
      const d = MJN_BADGES.find(x => x.id === btn.dataset.badge), b = pg.badges.find(x => x.id === d.id) || {};
      document.querySelectorAll('.badge.sel').forEach(x => x.classList.remove('sel'));
      btn.classList.add('sel');
      box.hidden = false;
      box.innerHTML = `${medalSVG(d.ch, RARITY[d.rarity][0], b.earned ? '' : 'locked')}<div><b>${esc(d.name)}</b> <small class="muted">· ${RARITY[d.rarity][1]}</small><p>${esc(d.desc)}</p><small>${b.earned ? '✅ Sudah didapat' : `🔒 Belum — progres ${b.have || 0}/${d.need}`}</small></div>`;
    }));
  }

  async function renderProfile() {
    const el = $('#profile');
    if (!el) return;
    if (!ready) { el.innerHTML = '<p class="muted">Memuat…</p>'; return; }
    if (navigator.onLine === false) {
      const n = readQ().length;
      el.innerHTML = `<div class="card"><p class="eyebrow">Offline / mode pesawat</p>
          <h2>${user ? esc(display()) : 'Profil'} — statistik butuh internet</h2>
          <p>${user ? `Kamu tetap bisa bermain. Hasil setiap sesi Main vs Mesin disimpan di perangkat ini${n ? ` (<b>${n}</b> sesi menunggu)` : ''} dan dikirim otomatis begitu internet kembali.` : 'Login Google butuh internet. Tanpa login pun kamu tetap bisa bermain Main vs Mesin, Belajar, dan Simulasi Bot.'}</p>
          <div class="modal-actions"><a class="btn jade" href="#play">Main vs Mesin</a><a class="btn ghost" href="#learn">Belajar</a></div></div>`;
      return;
    }
    if (!user) {
      el.innerHTML = `<div class="card pf-login">
          ${(() => { try { return sessionStorage.getItem(RET_KEY); } catch { return null; } })() ? '<p class="ab-hint warn pf-gate">🔒 Masuk dulu dengan Google — setelah itu kamu langsung dikembalikan ke permainan.</p>' : ''}
          <p class="eyebrow">Akun pemain</p><h2>Masuk untuk bermain &amp; menyimpan riwayat</h2>
          <ul class="pf-benefits"><li>📊 Statistik: berapa kali menang, kena tembak, rata-rata fan, peringkat</li>
            <li>🧠 Evaluasi setiap keputusan: buangan, klaim, Hu yang terlewat</li>
            <li>💡 Saran perbaikan yang disesuaikan dengan gaya bermainmu</li>
            <li>🗂️ Riwayat setiap sesi Main vs Mesin &amp; Online</li>
            <li>🏅 Tingkat pemain (Pemula → Dewa Mahjong), peringkat global, dan 26 badge pencapaian</li></ul>
          <div id="g-btn" class="g-btn"></div>
          <p class="muted pf-note">Main vs Mesin &amp; Online khusus pemain yang login. Tanpa login kamu tetap bisa <a href="#learn">Belajar</a>, menonton <a href="#watch">Simulasi Bot</a>, dan membaca <a href="#rules">Aturan</a>. Kami hanya menyimpan nama, email, dan foto profil Google-mu serta data permainan. <a href="privacy.html" target="_blank" rel="noopener">Kebijakan privasi</a></p>
        </div>`;
      renderGoogleButton($('#g-btn'));
      return;
    }
    if (loadingStats) return;
    loadingStats = true;
    el.innerHTML = `<div class="card"><p class="muted">Memuat statistik ${esc(display())}…</p></div>`;
    let data;
    try { data = await api('api/stats'); }
    catch (e) { loadingStats = false; if (e.status === 401) { user = null; saveUser(); renderChip(); emitAuth(); return renderProfile(); } el.innerHTML = `<div class="card"><p class="on-err">${esc(e.message)}</p></div>`; return; }
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
      ${rankCardHTML(data.progress)}
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
      ${badgesHTML(data.progress)}
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
    bindBadges(data.progress);
  }
  return { init, isLoggedIn, canPlay, requireLogin, ready: () => readyP, submit, renderProfile, user: () => user, displayName: display };
})();
