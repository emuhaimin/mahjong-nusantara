/* online.js — klien multipemain (WebSocket ke server/server.js) */
const Online = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dieCh = v => String.fromCodePoint(0x267F + v);
  const sortT = (a, b) => a.k - b.k || a.id - b.id;
  const POS = ['bottom', 'right', 'top', 'left'];
  const LS = 'mjn-online';
  let ws = null, S = null, everOpen = false, retry = null, sel = null, deadlineAt = 0, totalMs = 0;
  let lastCallout = null, invitedTo = null, lastDiscardId = null;
  let active = false, seenChat = -1, logOpen = false, modalKey = '';

  const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
  const save = o => { try { localStorage.setItem(LS, JSON.stringify(Object.assign(load(), o))); } catch { } };
  function token() {
    let t = load().token;
    if (!t) { t = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); save({ token: t }); }
    return t;
  }
  const myName = () => ($('#on-name').value.trim() || load().name || 'Pemain').slice(0, 14);
  const status = (t, err) => { $('#on-status').innerHTML = err ? `<span class="on-err">${esc(t)}</span>` : esc(t); };

  /* ---------------- koneksi ---------------- */
  function connect() {
    if (ws && ws.readyState <= 1) return;
    if (location.protocol === 'file:') return noServer();
    clearTimeout(retry);
    if (navigator.onLine === false) {           // mode pesawat: tunggu event 'online', jangan coba terus
      offlineNote();
      if (S) { S.offline = true; render(); }
      return;
    }
    // relatif terhadap halaman → bekerja di subdomain maupun sub-path (mis. /mahjong/ws)
    const wsUrl = new URL('ws', location.href.split('#')[0]);
    wsUrl.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(wsUrl.href);
    ws.onopen = () => {
      everOpen = true; $('#on-noserver').hidden = true;
      const o = load();
      if (o.code) send({ t: 'join', code: o.code, name: o.name || myName(), token: token() });
      else if (!invitedTo) status('');
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
    ws.onclose = () => {
      ws = null;
      if (!everOpen) return noServer();
      if (load().code) {
        if (S) S.offline = true;
        render();
        retry = setTimeout(connect, 2000);
      }
    };
  }
  function offlineNote() {
    const el = $('#on-noserver');
    el.hidden = false;
    el.innerHTML = `✈️ Kamu sedang offline (mode pesawat). Main Online butuh internet — sambil menunggu, coba <a href="#play">Main vs Mesin</a> atau <a href="#learn">Belajar</a> yang tetap jalan tanpa koneksi. Room akan tersambung lagi otomatis begitu internet kembali.`;
  }
  window.addEventListener('online', () => {
    $('#on-noserver').hidden = true;
    if (active || load().code) connect();
  });
  function noServer() {
    if (navigator.onLine === false) return offlineNote();
    const el = $('#on-noserver');
    el.hidden = false;
    el.innerHTML = `Server online tidak terdeteksi di alamat ini. Mode online butuh server permainan: di folder proyek jalankan <code>npm start</code> (atau <code>node server/server.js</code>), lalu buka alamat yang ditampilkan, mis. <b>http://localhost:3000</b>.`;
  }
  function send(m) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; }
    connect();
    return false;
  }
  function sendWhenOpen(m) {
    if (send(m)) return;
    const t = setInterval(() => { if (ws && ws.readyState === 1) { clearInterval(t); send(m); } }, 200);
    setTimeout(() => clearInterval(t), 8000);
  }

  function onMsg(m) {
    if (m.t === 'joined') {
      save({ code: m.code });
      if (location.hash !== '#online/' + m.code) history.replaceState(null, '', '#online/' + m.code);
      status('');
    } else if (m.t === 'error') {
      if (m.code === 'noroom') { save({ code: null }); S = null; render(); }
      if (m.code === 'login') { save({ code: null }); S = null; render(); }
      status(m.msg, true);
    } else if (m.t === 'left') {
      save({ code: null }); S = null; closeModal(); render();
      if (location.hash.startsWith('#online/')) history.replaceState(null, '', '#online');
    } else if (m.t === 'kicked') {
      save({ code: null }); S = null; render(); status(m.msg, true);
    } else if (m.t === 'state') {
      const prevUi = S && S.ui ? S.ui.mode + (S.g && S.g.turn) : '';
      S = m; S.offline = false;
      if (S.ui) { deadlineAt = Date.now() + S.ui.remain; totalMs = S.ui.total; }
      const nowUi = S.ui ? S.ui.mode + (S.g && S.g.turn) : '';
      if (nowUi !== prevUi) {
        sel = null;
        if (S.ui && S.ui.mode === 'claim') FX.vibrate(S.ui.opt && S.ui.opt.win ? [80, 50, 80] : 120);
        else if (S.ui && S.ui.win && !S.ui.win.insufficient) FX.vibrate([80, 50, 80]);
      }
      render();
    }
  }

  /* ---------------- tampilan ---------------- */
  /* ---------- Online khusus pemain yang login Google ---------- */
  const locked = () => typeof Account !== 'undefined' && !Account.canPlay();
  function syncGate() {
    const lk = locked();
    $('#on-login-gate').hidden = !lk;
    document.querySelectorAll('#on-lobby .on-grid, #on-lobby label.form-grid').forEach(el => { el.hidden = lk; });
    const code = invitedTo || ($('#on-code').value || '').trim().toUpperCase();
    $('#on-gate-invite').innerHTML = lk && /^[A-Z]{4}$/.test(code) ? `Setelah masuk, kamu langsung bergabung ke room <b>${esc(code)}</b>.` : '';
  }
  function render() {
    if (!active) return;
    syncGate();
    const inRoom = !!S && load().code;
    $('#on-lobby').hidden = !!inRoom;
    $('#on-room').hidden = !(inRoom && S.phase === 'lobby');
    $('#on-game').hidden = !(inRoom && S.phase !== 'lobby' && S.g);
    if (!inRoom) { closeModal(); return; }
    if (S.phase === 'lobby') { closeModal(); return renderRoom(); }
    if (S.g) renderGame();
  }

  const LV = { easy: ['🟢', 'Easy'], medium: ['🟡', 'Medium'], hard: ['🟠', 'Hard'], expert: ['🔴', 'Expert'], mix: ['🎲', 'Campuran'] };
  const lvTxt = l => (LV[l] ? LV[l][1] : 'Medium');
  const lvTag = l => (LV[l] ? `<span class="lv-tag lv-${l}" title="Tingkat AI">${LV[l][1]}</span>` : '');

  /** link & pesan undangan WhatsApp */
  const inviteLink = () => `${location.origin}${location.pathname}#online/${S.code}`;
  function inviteText() {
    const me = S.seats[S.you] ? S.seats[S.you].name : '';
    const free = S.seats.filter(s => !s || !s.human).length;
    const lenTxt = { one: '1 hand', east: '1 ronde angin', full: '4 ronde angin' }[S.opts.length];
    return `🀄 *Ayo main Mahjong bareng${me ? ' ' + me : ''}!*\n\n` +
      `Kode room: *${S.code}*\n` +
      `Aturan: minimal ${S.opts.minFan} fan · ${lenTxt} · bot ${lvTxt(S.opts.level)}` + (free ? (S.phase === 'lobby' ? ` · ${free} kursi masih kosong` : ` · ${free} kursi bot bisa kamu gantikan`) : '') + `\n\n` +
      (S.phase === 'lobby' ? '' : `Permainan sudah berjalan — kamu akan menggantikan salah satu bot.\n\n`) +
      `Ketuk link ini untuk langsung gabung:\n${inviteLink()}`;
  }
  function setInvite() {
    const href = 'https://wa.me/?text=' + encodeURIComponent(inviteText());
    ['#on-wa', '#on-wa2'].forEach(q => { const a = $(q); if (a) a.href = href; });
  }
  function renderRoom() {
    const link = inviteLink();
    setInvite();
    $('#on-roomcode').textContent = S.code;
    $('#on-link').value = link;
    $('#on-shareb').hidden = !navigator.share;
    const isHost = S.host === S.you;
    $('#on-seats').innerHTML = S.seats.map((s, i) => s
      ? `<div class="seat-item"><span class="dot${s.connected ? '' : ' off'}"></span><b>${esc(s.name)}</b>${i === S.you ? '<span class="tag me">Kamu</span>' : ''}${i === S.host ? '<span class="tag">Host</span>' : ''}${s.human ? '' : ' ' + lvTag(s.level)}</div>`
      : `<div class="seat-item empty"><span class="dot off"></span>Kursi ${i + 1} kosong — akan diisi bot ${lvTag(S.opts.level === 'mix' ? null : S.opts.level)}</div>`).join('');
    $('#on-r-minfan').value = S.opts.minFan; $('#on-r-length').value = S.opts.length; $('#on-r-level').value = S.opts.level || 'medium';
    $('#on-r-minfan').disabled = $('#on-r-length').disabled = $('#on-r-level').disabled = !isHost;
    $('#on-start').hidden = !isHost;
    const n = S.seats.filter(Boolean).length;
    $('#on-roomnote').innerHTML = isHost
      ? `${n} dari 4 pemain hadir. Tekan <b>Mulai</b> kapan saja — kursi kosong diisi bot.`
      : `Menunggu host (${esc((S.seats[S.host] || {}).name || '-')}) memulai permainan…`;
    if (S.offline) $('#on-roomnote').innerHTML = '<span class="on-err">Koneksi terputus — menyambung ulang…</span>';
  }

  const rel = i => (i - S.you + 4) % 4;
  const windOf = i => (i - S.g.dealer + 4) % 4;
  function renderGame() {
    const g = S.g;
    for (let i = 0; i < 4; i++) renderSeat(i);
    const lenTxt = { one: '1 hand', east: '1 ronde angin', full: '4 ronde angin' }[S.opts.length];
    $('#on-info').innerHTML = `🌐 Room <b>${esc(S.code)}</b> · Minimal <b>${S.opts.minFan}</b> fan · ${lenTxt} · AI ${LV[S.opts.level] ? LV[S.opts.level].join(' ') : 'Medium'}${S.offline ? ' · <span class="on-err">terputus, menyambung ulang…</span>' : ''}`;
    $('#on-center').innerHTML = `<div class="c-round"><span class="c-wind">${WIND_CH[Math.min(g.roundWind, 3)]}</span><div><b>Ronde Angin ${WIND_ID[Math.min(g.roundWind, 3)]}</b><small>Hand ke-${g.handNo} · Dealer: ${esc(g.players[g.dealer].name)}</small></div></div>
      <div class="c-wall">Sisa tembok: <b>${g.wall}</b></div>
      ${g.dice ? `<div class="c-dice">${g.dice.map(dieCh).join('')}</div>` : ''}
      <div class="c-msg">${g.msg || ''}</div>${g.paused ? '<div class="paused">Dijeda — tidak ada pemain terhubung.</div>' : ''}`;
    renderActions();
    renderChat();
    setInvite();
    if (g.lastDiscard && g.lastDiscard.id !== lastDiscardId) { if (lastDiscardId !== null && window.Sound) Sound.tile(); lastDiscardId = g.lastDiscard.id; }
    if (g.callout && g.callout.id !== lastCallout) {
      const fresh = lastCallout !== null || Date.now() - g.callout.id < 2500;
      lastCallout = g.callout.id;
      if (fresh) FX.callout(g.callout.text, g.players[g.callout.p].name, $('#on-s-' + POS[rel(g.callout.p)]));
    }
    if (logOpen) $('#on-log').innerHTML = g.log.map(l => `<div>${esc(l)}</div>`).join('');
    renderModal();
  }

  function renderSeat(i) {
    const g = S.g, pl = g.players[i], pos = POS[rel(i)], seat = S.seats[i] || {};
    const el = $('#on-s-' + pos), sw = windOf(i), me = i === S.you, side = pos === 'left' || pos === 'right';
    el.className = `seat slot-${pos === 'bottom' ? 'me' : pos} pos-${pos}${g.turn === i ? ' active' : ''}`;
    const tag = seat.human ? (seat.connected ? '' : ' · <span class="on-err">terputus</span>') : ` · ${seat.level ? lvTag(seat.level) : 'bot'}`;
    const nextUp = g.turn != null && g.turn >= 0 && (g.turn + 1) % 4 === i;
    const info = `<div class="seat-info">${typeof mjnRelTag === 'function' ? mjnRelTag(rel(i), nextUp, true) : ''}<span class="wind-badge w${sw}">${WIND_CH[sw]}</span><span class="who"><b>${esc(pl.name)}</b><small>${WIND_ID[sw]}${i === g.dealer ? ' · Dealer' : ''}${tag}</small></span><span class="pts">${pl.score}</span><span class="cnt">${pl.count} kartu</span></div>`;
    let hand;
    if (pl.hand) {
      const sorted = pl.hand.slice().sort(sortT);
      let drawnT = null;
      if (pl.drawn != null) { const j = sorted.findIndex(t => t.id === pl.drawn); if (j >= 0) drawnT = sorted.splice(j, 1)[0]; }
      const list = drawnT ? [...sorted, drawnT] : sorted;
      const ui = me && S.ui && S.ui.mode === 'turn' ? S.ui : null;
      const hint = ui && $('#on-hint').checked ? ui.hintId : null;
      if (sel != null && !list.some(t => t.id === sel)) sel = null;
      hand = list.map(t => tileHTML(t.k, {
        id: me ? t.id : null,
        cls: (me ? 'lg' : side ? 'xs' : 'sm') + (t === drawnT ? ' drawn' : '') + (ui ? ' clickable' : '') + (ui && sel === t.id ? ' sel' : '') + (hint === t.id ? ' hint' : ''),
      })).join('');
    } else hand = Array.from({ length: pl.count }, () => backHTML(side ? 'sm slat' : 'sm')).join('');
    const msz = me ? 'md' : 'xs';
    const melds = flowersHTML(pl.flowers, msz, sw) + pl.melds.map(m => `<div class="meld">${meldTiles(m).map((k, j) => (m.type === 'kong' && m.concealed && (j === 0 || j === 3) && !g.reveal && !me) ? backHTML(msz) : tileHTML(k, { cls: msz })).join('')}</div>`).join('');
    const ld = g.lastDiscard;
    const dis = pl.discards.map(t => tileHTML(t.k, { cls: 'xs' + (ld && ld.id === t.id ? ' last' : '') })).join('');
    const H = `<div class="seat-hand">${hand}</div>`, M = `<div class="seat-melds">${melds}</div>`, D = `<div class="seat-discards">${dis}</div>`;
    let html;
    if (pos === 'top') html = info + `<div class="seat-row">${H}${M}</div>` + D;
    else if (pos === 'bottom') html = D + `<div class="seat-row">${H}${M}</div>` + info;
    else if (pos === 'left') html = info + M + `<div class="seat-row">${H}${D}</div>`;
    else html = info + M + `<div class="seat-row">${D}${H}</div>`;
    el.innerHTML = html;
  }

  function timerHTML() {
    if (!S || !S.ui) return '';
    const left = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
    return `<span class="timer${left <= 5 ? ' low' : ''}" id="on-timer">⏱ ${left} dtk</span>`;
  }
  function renderActions() {
    const bar = $('#on-action'), ui = S.ui, g = S.g, hint = $('#on-hint').checked;
    bar.classList.toggle('alert-turn', !!ui && ui.mode === 'turn');
    bar.classList.toggle('alert-claim', !!ui && ui.mode === 'claim');
    if (!ui) {
      const t = g.turn >= 0 ? g.players[g.turn] : null;
      const live = t && S.seats[g.turn] && S.seats[g.turn].human && S.seats[g.turn].connected;
      bar.innerHTML = t ? `<div class="ab-msg">Giliran: <b>${esc(t.name)}</b>${g.turn === S.you ? '' : live ? ' — menunggu…' : ' — bot berpikir…'}</div>` : '';
      return;
    }
    let h = '';
    if (ui.mode === 'turn') {
      h += `<div class="ab-msg"><b>Giliranmu</b>${timerHTML()} — ketuk kartu untuk memilih, ketuk lagi untuk membuang.</div><div class="ab-btns">`;
      if (ui.win && !ui.win.insufficient) h += `<button class="btn win" data-act="tsumo">🀄 Zimo! Menang (${ui.win.fan} fan)</button>`;
      ui.kongs.forEach(o => { h += `<button class="btn jade" data-act="kong" data-k="${o.k}">Kong ${tileHTML(o.k, { cls: 'xxs' })}</button>`; });
      const me = g.players[S.you];
      const t = sel != null && me.hand && me.hand.find(t => t.id === sel);
      if (t) h += `<button class="btn" data-act="discard">Buang ${tileName(t.k)}</button>`;
      h += '</div>';
      if (ui.win && ui.win.insufficient) h += `<div class="ab-hint warn">Tanganmu lengkap, tetapi baru ${ui.win.fan} fan (minimal ${S.opts.minFan}).</div>`;
      if (hint && ui.hintK != null && !(ui.win && !ui.win.insufficient)) {
        h += `<div class="ab-hint">💡 Saran: buang <b>${tileName(ui.hintK)}</b>. ${ui.hintS <= 0
          ? `Kamu akan <b>Ting</b>${ui.waits && ui.waits.length ? ' — menunggu: ' + ui.waits.map(k => tileHTML(k, { cls: 'xxs' })).join('') : ''}`
          : `Setelah itu masih butuh <b>${ui.hintS}</b> kartu yang tepat sebelum Ting.`}</div>`;
      }
      h += `<div class="ab-hint" style="background:none;padding:0;opacity:.75">Jika waktu habis, kartu dibuang otomatis.</div>`;
    } else {
      const o = ui.opt;
      h += `<div class="ab-msg">${esc(g.players[ui.from].name)} membuang ${tileHTML(ui.tile.k, { cls: 'sm' })} <b>${tileName(ui.tile.k)}</b> — ambil?${timerHTML()}</div><div class="ab-btns">`;
      if (o.win) h += `<button class="btn win" data-act="win">🀄 Hu! Menang (${o.win.fan} fan)</button>`;
      if (o.kong) h += `<button class="btn jade" data-act="kong">Kong</button>`;
      if (o.pong) h += `<button class="btn jade" data-act="pong">Pong</button>`;
      o.chows.forEach(s => { h += `<button class="btn jade" data-act="chow" data-s="${s}">Chow ${[s, s + 1, s + 2].map(k => tileHTML(k, { cls: 'xxs' })).join('')}</button>`; });
      h += `<button class="btn ghost" data-act="pass" style="color:#fff;border-color:rgba(255,255,255,.4)">Lewati</button></div>`;
      if (o.short) h += `<div class="ab-hint warn">Kartu ini melengkapi tanganmu, tetapi baru ${o.short.fan} fan (minimal ${S.opts.minFan}).</div>`;
      if (hint && ui.hint) h += `<div class="ab-hint">💡 ${ui.hint}</div>`;
    }
    bar.innerHTML = h;
  }

  function renderChat() {
    const box = $('#on-chat');
    const open = $('#on-game').classList.contains('dr-open');
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 10;
    box.innerHTML = S.chat.map(c => c.s < 0 ? `<div class="sys">${esc(c.text)}</div>` : `<div><b>${esc(c.n)}:</b> ${esc(c.text)}</div>`).join('');
    if (atBottom) box.scrollTop = box.scrollHeight;
    const last = S.chat.length ? S.chat[S.chat.length - 1].ts : 0;
    if (seenChat < 0) seenChat = last;           // pesan lama saat baru masuk tidak dihitung
    const unread = !open && last > seenChat;
    const btn = document.querySelector('[data-drawer="on-drawer"]');
    btn.classList.toggle('unread', unread);
    btn.title = unread ? 'Menu — ada pesan chat baru' : 'Menu';
    if (open) seenChat = last;
  }

  /* ---------------- modal hasil ---------------- */
  function groupHTML(ks, label, cls, winK) {
    let marked = false;
    return `<div class="res-group"><div class="grp">${ks.map(k => { const w = !marked && k === winK; if (w) marked = true; return tileHTML(k, { cls: cls + (w ? ' win-t' : '') }); }).join('')}</div><small>${label}</small></div>`;
  }
  function renderModal() {
    const g = S.g, r = g.result, f = g.final;
    if (!r && !f) { if (modalKey) { closeModal(); } return; }
    const ready = r && (S.ready || []).includes(S.you);
    const key = r ? `r${r.handNo}-${ready}-${(S.ready || []).length}` : `f-${S.host === S.you}`;
    if (key === modalKey && !$('#modal').hidden) return;
    modalKey = key;
    let h = '';
    if (f) {
      h = `<h2>🏆 Permainan selesai</h2><p>Juara: <b>${esc(f[0].name)}</b> dengan ${f[0].score} poin.</p>
        <table class="fan-table"><thead><tr><th>#</th><th>Pemain</th><th>Skor akhir</th></tr></thead><tbody>${f.map((p, n) => `<tr><td>${n + 1}</td><td>${esc(p.name)}${p.i === S.you ? ' <small>(kamu)</small>' : ''}</td><td>${p.score} <small class="muted">(${p.score - 500 >= 0 ? '+' : ''}${p.score - 500})</small></td></tr>`).join('')}</tbody></table>
        <div class="modal-actions"><button class="btn ghost" data-m="leave">Keluar room</button><button class="btn ghost" data-m="share">📤 Bagikan</button>${S.host === S.you ? '<button class="btn big" data-m="restart">Main lagi</button>' : '<span class="muted">Menunggu host memulai lagi…</span>'}</div>`;
    } else {
      if (r.type === 'draw') h = `<h2>Seri — tembok habis</h2><p>Tidak ada yang menang. Dealer tetap.</p>`;
      else {
        const s = r.score, pl = g.players[r.p];
        h = `<p class="eyebrow">Hand ${r.handNo} · Ronde Angin ${WIND_ID[r.roundWind]}</p><h2>🀄 ${esc(pl.name)} menang! <small>${r.selfDraw ? '(Zimo)' : `(dari buangan ${esc(g.players[r.from].name)})`}</small></h2><div class="res-hand">`;
        const winK = r.tileK != null ? r.tileK : ((pl.hand || []).find(t => t.id === pl.drawn) || {}).k;
        if (s.decomp) {
          s.decomp.sets.forEach(set => {
            const ks = set.kong ? [set.k, set.k, set.k, set.k] : set.type === 'chow' ? [set.k, set.k + 1, set.k + 2] : [set.k, set.k, set.k];
            h += groupHTML(ks, (set.kong ? 'Kong' : set.type === 'chow' ? 'Chow' : 'Pong') + (set.open ? ' (terbuka)' : ''), 'sm', set.open ? null : winK);
          });
          h += groupHTML([s.decomp.pair, s.decomp.pair], 'Mata', 'sm', winK);
        } else h += groupHTML((pl.hand || []).map(t => t.k).sort((a, b) => a - b), s.pattern, 'sm', winK);
        if (pl.flowers.length) h += groupHTML(pl.flowers.slice().sort((a, b) => a - b), 'Bunga/Musim', 'xs', null);
        h += `</div><table class="fan-table"><thead><tr><th>Pola</th><th>Fan</th></tr></thead><tbody>${s.items.map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td>${s.fan} fan</td></tr></tfoot></table>
          <p>${s.fan} fan → <b>${s.points} poin dasar</b>. ${r.selfDraw ? `Zimo: setiap lawan membayar ${s.points}.` : `Pembuang membayar 2 × ${s.points} = ${s.points * 2}.`}</p>`;
      }
      h += `<table class="fan-table score-table"><thead><tr><th>Pemain</th><th>Angin</th><th>Perubahan</th><th>Skor</th></tr></thead><tbody>${g.players.map((p, i) => {
        const d = r.delta[i];
        return `<tr><td>${esc(p.name)}${i === S.you ? ' <small>(kamu)</small>' : ''}</td><td><span class="zh">${WIND_CH[r.winds[i]]}</span> ${WIND_ID[r.winds[i]]}</td><td class="${d > 0 ? 'plus' : d < 0 ? 'minus' : ''}">${d > 0 ? '+' : ''}${d}</td><td>${p.score}</td></tr>`;
      }).join('')}</tbody></table>
        <p class="muted">${r.dealerStays ? 'Dealer menang atau seri → dealer tetap.' : 'Dealer berpindah ke pemain berikutnya.'}</p>
        <div class="modal-actions">${r.type !== 'draw' ? '<button class="btn ghost" data-m="share">📤 Bagikan</button>' : ''}${ready ? '<span class="muted">Menunggu pemain lain… (otomatis lanjut dalam 30 detik)</span>' : `<button class="btn big" data-m="next">${r.last ? 'Lihat hasil akhir' : 'Hand berikutnya →'}</button>`}</div>`;
    }
    $('#modal-box').innerHTML = h;
    $('#modal').hidden = false;
  }
  function closeModal() { modalKey = ''; if (active) $('#modal').hidden = true; }
  /* ---------- bagikan hasil Online (js/share.js) ---------- */
  function shareOnline() {
    const g = S.g, r = g.result, f = g.final;
    if (f) {
      const mine = f.findIndex(p => p.i === S.you) + 1;
      return MjnShare.shareResult({
        variant: 'Online · Hong Kong', title: mine === 1 ? 'Aku juara meja Online!' : 'Permainan Online selesai',
        subtitle: `Room ${S.code} · ${S.seats.filter(s => s && s.human).length} pemain manusia`,
        scores: f.map((p, n) => ({ rank: n + 1, name: p.name, delta: p.score - 500, score: p.score, me: p.i === S.you })),
        footer: 'Ajak teman main Online di',
      }, mine ? `🏆 Aku finis *#${mine}* di meja Online Mahjong Nusantara!` : '🏆 Main Online di Mahjong Nusantara!');
    }
    if (!r || r.type === 'draw') return;
    const s = r.score, pl = g.players[r.p];
    const winK = r.tileK != null ? r.tileK : ((pl.hand || []).find(t => t.id === pl.drawn) || {}).k;
    let marked = false;
    const mark = (ks, can) => ks.map(k => { const w = can && !marked && k === winK; if (w) marked = true; return { k, win: w }; });
    const groups = s.decomp
      ? s.decomp.sets.map(set => ({ ks: mark(set.kong ? [set.k, set.k, set.k, set.k] : set.type === 'chow' ? [set.k, set.k + 1, set.k + 2] : [set.k, set.k, set.k], !set.open), label: (set.kong ? 'Kong' : set.type === 'chow' ? 'Chow' : 'Pong') + (set.open ? ' terbuka' : '') }))
        .concat([{ ks: mark([s.decomp.pair, s.decomp.pair], true), label: 'Mata' }])
      : [{ ks: mark((pl.hand || []).map(t => t.k).sort((a, b) => a - b), true), label: s.pattern }];
    const me = r.p === S.you;
    MjnShare.shareResult({
      variant: 'Online · Hong Kong', title: me ? 'Aku menang!' : `${pl.name} menang!`,
      subtitle: `Room ${S.code} · Hand ${r.handNo} · ${r.selfDraw ? 'Zimo — ambil sendiri' : `dari buangan ${g.players[r.from].name}`}`,
      groups, flowers: pl.flowers.slice().sort((a, b) => a - b), items: s.items, total: `${s.fan} fan`,
      scores: g.players.map((p, i) => ({ name: p.name, delta: r.delta[i], score: p.score, me: i === S.you })),
    }, me ? `🀄 Aku baru menang *${s.fan} fan* di meja Online Mahjong Nusantara!` : `🀄 Seru! ${pl.name} menang *${s.fan} fan* di meja Online Mahjong Nusantara.`);
  }

  /* ---------------- aksi pengguna ---------------- */
  function act(a) { send({ t: 'act', act: a }); }
  let leftCode = null; // room yang baru saja ditinggalkan → jangan otomatis masuk lagi lewat tombol Back
  function leave() {
    leftCode = load().code || (S && S.code) || null;
    send({ t: 'leave' });
    save({ code: null }); S = null; closeModal(); render();
    history.replaceState(null, '', '#online');
  }
  function create() {
    if (locked()) return Account.requireLogin(null, '#online');
    const name = myName();
    save({ name });
    status('Membuat room…');
    sendWhenOpen({ t: 'create', name, token: token(), opts: { minFan: +$('#on-minfan').value, length: $('#on-length').value, level: $('#on-level').value } });
  }
  function join(code) {
    code = (code || $('#on-code').value).trim().toUpperCase();
    leftCode = null; invitedTo = null;
    if (!/^[A-Z]{4}$/.test(code)) return status('Kode room harus 4 huruf.', true);
    if (locked()) return Account.requireLogin(null, '#online/' + code);
    const name = myName();
    save({ name, code });
    status('Menghubungkan…');
    sendWhenOpen({ t: 'join', code, name, token: token() });
  }

  function init() {
    $('#on-name').value = load().name || '';
    $('#on-create').onclick = create;
    $('#on-login-btn').onclick = () => Account.requireLogin(null, invitedTo ? '#online/' + invitedTo : '#online');
    // status login berubah → koneksi WebSocket dibuka ulang agar server mengenali akun (cookie) yang baru
    document.addEventListener('mjn-auth', () => {
      if (ws) { ws.onclose = null; try { ws.close(); } catch { } ws = null; }
      if (active || load().code) connect();
      render();
    });
    $('#on-join').onclick = () => join();
    $('#on-code').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
    $('#on-start').onclick = () => send({ t: 'start' });
    $('#on-leave1').onclick = leave;
    $('#on-leave2').onclick = async () => {
      if (await FX.ask('Keluar dari room?', { text: 'Kursimu akan dimainkan bot. Kamu bisa masuk lagi dengan kode room yang sama.', yes: 'Keluar', no: 'Lanjut main' })) leave();
    };
    $('#on-copy').onclick = async () => {
      const v = $('#on-link').value;
      try { await navigator.clipboard.writeText(v); $('#on-copy').textContent = 'Tersalin ✓'; }
      catch { $('#on-link').select(); document.execCommand && document.execCommand('copy'); $('#on-copy').textContent = 'Tersalin ✓'; }
      setTimeout(() => { $('#on-copy').textContent = 'Salin link'; }, 1600);
    };
    $('#on-shareb').onclick = () => navigator.share && navigator.share({ title: 'Main Mahjong bareng', text: inviteText().replace(/\*/g, '').replace(/\n[^\n]*$/, ''), url: inviteLink() }).catch(() => { });
    ['#on-wa', '#on-wa2'].forEach(q => $(q).addEventListener('click', () => { if (S) setInvite(); }));
    $('#on-r-minfan').onchange = $('#on-r-length').onchange = $('#on-r-level').onchange = () => send({ t: 'opts', opts: { minFan: +$('#on-r-minfan').value, length: $('#on-r-length').value, level: $('#on-r-level').value } });
    // tingkat bot terakhir yang dipilih (sama dengan Main vs Mesin) jadi bawaan saat membuat room
    try { const v = localStorage.getItem('mjn-level'); if (v && LV[v]) $('#on-level').value = v; } catch { }
    $('#on-level').addEventListener('change', e => { try { localStorage.setItem('mjn-level', e.target.value); } catch { } });
    $('#on-hint').onchange = () => S && S.g && renderGame();
    document.querySelector('[data-drawer="on-drawer"]').addEventListener('click', () => setTimeout(() => {
      if (!S || !S.g) return;
      renderChat();
      const box = $('#on-chat'); box.scrollTop = box.scrollHeight;
    }, 0));
    $('#on-btn-log').onclick = () => { logOpen = !logOpen; $('#on-log').hidden = !logOpen; if (S && S.g) renderGame(); };
    $('#on-chatform').addEventListener('submit', e => {
      e.preventDefault();
      const v = $('#on-chatin').value.trim();
      if (v) { send({ t: 'chat', text: v }); $('#on-chatin').value = ''; }
    });
    $('#on-action').addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || !S || !S.ui) return;
      const a = b.dataset.act;
      if (S.ui.mode === 'turn') {
        if (a === 'tsumo') act({ type: 'tsumo' });
        else if (a === 'kong') act({ type: 'kong', k: +b.dataset.k });
        else if (a === 'discard' && sel != null) act({ type: 'discard', id: sel });
      } else {
        if (a === 'chow') act({ type: 'chow', s: +b.dataset.s });
        else act({ type: a });
      }
    });
    $('#on-s-bottom').addEventListener('click', e => {
      const t = e.target.closest('.tile[data-id]');
      if (!t || !S || !S.ui || S.ui.mode !== 'turn') return;
      const id = +t.dataset.id;
      if (sel === id) act({ type: 'discard', id });
      else { sel = id; renderGame(); }
    });
    $('#modal-box').addEventListener('click', e => {
      if (!active) return;
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const m = b.dataset.m;
      if (m === 'next') send({ t: 'next' });
      else if (m === 'restart') { send({ t: 'restart' }); closeModal(); }
      else if (m === 'leave') leave();
      else if (m === 'share') shareOnline();
    });
    setInterval(() => {
      const el = document.getElementById('on-timer');
      if (!el || !S || !S.ui) return;
      const left = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
      el.textContent = `⏱ ${left} dtk`;
      el.classList.toggle('low', left <= 5);
    }, 250);
  }

  /** dipanggil router saat membuka #online atau #online/KODE */
  function enter(code) {
    active = true;
    connect();
    if (code && /^[A-Z]{4}$/i.test(code)) {
      code = code.toUpperCase();
      $('#on-code').value = code;
      const o = load();
      if (o.code !== code) {
        if (locked()) { invitedTo = code; status(`👋 Kamu diundang ke room ${code}. Masuk dengan Google dulu, lalu kamu langsung bergabung.`); }
        else if (code === leftCode) status(`Kamu sudah keluar dari room ${code}. Tekan Gabung jika ingin masuk lagi.`);
        else if (o.name || $('#on-name').value.trim()) join(code);
        else {
          invitedTo = code;
          status(`👋 Kamu diundang ke room ${code}. Isi nama kamu, lalu tekan Gabung.`);
          setTimeout(() => { const n = $('#on-name'); n.scrollIntoView({ block: 'center' }); n.focus(); }, 300);
        }
      }
    }
    render();
  }
  function exit() { active = false; if (!$('#modal').hidden && modalKey) $('#modal').hidden = true; modalKey = ''; }
  return { init, enter, exit, leave };
})();
