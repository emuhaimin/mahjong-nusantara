/* tools.js — "Alat Meja" untuk bermain mahjong sungguhan:
   🎲 Dadu (2/3 dadu, tentukan dealer, pecah tembok, goyang HP) dan
   📝 Pencatat Skor (4 pemain + posisi angin, Hong Kong / Taiwan / Riichi, rotasi dealer, riwayat)
   dengan 🧮 kalkulator nilai dari kartu menang — diisi manual atau lewat 📷 scan foto (server → Claude API).
   Data pencatat disimpan di perangkat (localStorage) sehingga jalan juga tanpa internet. */
const Tools = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rnd = n => Math.floor(Math.random() * n);
  const SKEY = 'mjn-score';
  const WIND_LBL = i => `${WIND_CH[i]} ${WIND_ID[i]}`;

  /* =========================================================== DADU */
  const D = { n: 3, vals: [1, 1, 1], rolling: false, mode: 'free', hist: [], dealerRolls: null, shake: false };
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dieHTML = (v, cls = '') => `<div class="die ${cls}${v === 1 || v === 4 ? ' red' : ''}">${[...Array(9)].map((_, i) => `<i class="${PIPS[v].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
  const names = () => { const st = load(); return st ? st.players.map(p => p.name) : ['Pemain 1', 'Pemain 2', 'Pemain 3', 'Pemain 4']; };

  function renderDice() {
    const el = $('#tool-dice');
    if (!el) return;
    const sum = D.vals.slice(0, D.n).reduce((a, b) => a + b, 0);
    let help = '';
    if (D.mode === 'wall' && !D.rolling && D.hist.length) {
      const st = load(), dealer = st ? st.dealer : 0, nm = names();
      const owner = (dealer + (sum - 1)) % 4;
      help = `<div class="dice-help"><b>Pecah tembok:</b> hitung ${sum} dari dealer (${esc(nm[dealer])} = 1) berlawanan arah jarum jam → tembok di depan <b>${esc(nm[owner])}</b>${st ? ` (${WIND_ID[(owner - st.dealer + 4) % 4]})` : ''}. Pada tembok itu hitung <b>${sum} tumpukan dari ujung kanan</b>, lalu mulai mengambil dari tumpukan berikutnya (searah jarum jam).</div>`;
    }
    if (D.mode === 'dealer' && D.dealerRolls) {
      const nm = names(), r = D.dealerRolls;
      const done = r.cands.length === 1 && r.idx >= r.order.length;
      help = `<div class="dice-help"><b>Tentukan dealer</b> — tiap pemain melempar ${D.n} dadu, tertinggi jadi dealer (東 Timur).
        <table class="fan-table"><tbody>${nm.map((n, i) => `<tr class="${r.rolls[i] != null && r.cands.includes(i) && done ? 'win-row' : ''}"><td>${esc(n)}</td><td class="num">${r.rolls[i] == null ? '—' : r.rolls[i]}</td></tr>`).join('')}</tbody></table>
        ${done ? `<p>🎉 <b>${esc(nm[r.cands[0]])}</b> menjadi dealer!</p>${load() ? `<button class="btn jade sm" data-t="set-dealer" data-i="${r.cands[0]}">Jadikan dealer di Pencatat Skor</button>` : ''}`
          : `<p>Giliran melempar: <b>${esc(nm[r.order[r.idx]])}</b>${r.round > 1 ? ' (lempar ulang karena seri)' : ''}</p>`}</div>`;
    }
    el.innerHTML = `
      <div class="dice-opts">
        <div class="seg"><button data-t="dn" data-n="2" class="${D.n === 2 ? 'on' : ''}">2 dadu</button><button data-t="dn" data-n="3" class="${D.n === 3 ? 'on' : ''}">3 dadu</button></div>
        <div class="seg"><button data-t="dm" data-m="free" class="${D.mode === 'free' ? 'on' : ''}">Bebas</button><button data-t="dm" data-m="dealer" class="${D.mode === 'dealer' ? 'on' : ''}">Tentukan dealer</button><button data-t="dm" data-m="wall" class="${D.mode === 'wall' ? 'on' : ''}">Pecah tembok</button></div>
      </div>
      <button class="dice-tray" data-t="roll" aria-label="Lempar dadu">${D.vals.slice(0, D.n).map(v => dieHTML(v, D.rolling ? 'spin' : '')).join('')}</button>
      <div class="dice-sum">${D.rolling ? 'Melempar…' : D.hist.length ? `Jumlah <b>${sum}</b>` : 'Ketuk dadu atau tombol untuk melempar'}</div>
      <div class="dice-btns"><button class="btn big" data-t="roll">🎲 Lempar</button><button class="btn ghost" data-t="shake">${D.shake ? '📳 Goyang: aktif' : '📳 Goyang HP untuk lempar'}</button></div>
      ${help}
      ${D.hist.length ? `<p class="muted dice-hist">Lemparan terakhir: ${D.hist.slice(0, 8).map(h => `<b>${h}</b>`).join(' · ')}</p>` : ''}`;
  }
  function roll() {
    if (D.rolling) return;
    if (D.mode === 'dealer') {
      const r = D.dealerRolls;
      if (!r || (r.cands.length === 1 && r.idx >= r.order.length)) D.dealerRolls = { rolls: [null, null, null, null], cands: [0, 1, 2, 3], order: [0, 1, 2, 3], idx: 0, round: 1 };
    }
    D.rolling = true;
    if (window.Sound) Sound.dice();
    if (window.FX) FX.vibrate(40);
    let t = 0;
    const iv = setInterval(() => { D.vals = D.vals.map(() => 1 + rnd(6)); renderDice(); if (++t > 9) { clearInterval(iv); finish(); } }, 70);
    function finish() {
      D.rolling = false;
      D.vals = D.vals.map(() => 1 + rnd(6));
      const sum = D.vals.slice(0, D.n).reduce((a, b) => a + b, 0);
      D.hist.unshift(sum); D.hist = D.hist.slice(0, 20);
      if (D.mode === 'dealer' && D.dealerRolls) {
        const r = D.dealerRolls;
        r.rolls[r.order[r.idx]] = sum; r.idx++;
        if (r.idx >= r.order.length) {                    // semua kandidat sudah melempar → cari tertinggi
          const max = Math.max(...r.order.map(i => r.rolls[i]));
          const top = r.order.filter(i => r.rolls[i] === max);
          r.cands = top;
          if (top.length > 1) { r.order = top; r.idx = 0; r.round++; top.forEach(i => { r.rolls[i] = null; }); }
        }
      }
      if (window.FX) FX.vibrate([30, 40, 60]);
      renderDice();
    }
  }
  let lastShake = 0;
  function onMotion(e) {
    const a = e.accelerationIncludingGravity || e.acceleration; if (!a) return;
    const g = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
    if (g > 24 && Date.now() - lastShake > 1500 && !$('#view-tools').hidden && cur === 'dice') { lastShake = Date.now(); roll(); }
  }
  async function toggleShake() {
    if (D.shake) { D.shake = false; window.removeEventListener('devicemotion', onMotion); return renderDice(); }
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
        if (await DeviceMotionEvent.requestPermission() !== 'granted') return FX.toast('Izin sensor gerak ditolak.');
      }
      if (typeof DeviceMotionEvent === 'undefined') return FX.toast('Perangkat ini tidak punya sensor gerak.');
      window.addEventListener('devicemotion', onMotion); D.shake = true; renderDice();
      FX.toast('Goyangkan HP untuk melempar dadu 🎲');
    } catch { FX.toast('Sensor gerak tidak tersedia.'); }
  }

  /* =========================================================== PENCATAT SKOR */
  function load() { try { const s = JSON.parse(localStorage.getItem(SKEY)); return s && s.v === 1 ? s : null; } catch { return null; } }
  function save(st) { try { localStorage.setItem(SKEY, JSON.stringify(st)); } catch { } }
  const V = st => MJN_VARIANTS[st.variant] || MJN_VARIANTS.hk;
  const unitOf = st => ({ hk: 'fan', tw: 'tai', jp: 'han' }[st.variant]);
  let form = null;                      // form hand yang sedang diisi
  let calc = null;                      // kalkulator kartu

  function newGame(f) {
    const v = MJN_VARIANTS[f.variant];
    const start = +f.start || v.startScore;
    return {
      v: 1, variant: v.id, minFan: v.id === 'hk' ? +f.minFan : v.defaultMin, start,
      players: f.names.map(n => ({ name: (n || '').trim().slice(0, 14) || 'Pemain' })),
      scores: [start, start, start, start], dealer: 0, roundWind: 0, handNo: 1, honba: 0, sticks: 0, renchan: 0,
      hands: [], startedAt: Date.now(),
    };
  }
  /** keadaan permainan seperti G di game.js, untuk fungsi pay/draw di variants.js */
  const pseudoG = st => ({ dealer: st.dealer, renchan: st.renchan, honba: st.honba, sticks: st.sticks });
  function scoreObj(st, f) {
    if (st.variant === 'hk') return { fan: f.value, value: f.value, points: fanPoints(Math.min(f.value, 13)), items: f.items || [[`${f.value} fan`, f.value]] };
    if (st.variant === 'tw') return { value: f.value, fan: f.value, items: f.items || [[`${f.value} tai`, f.value]] };
    const ykm = f.yakuman || 0, han = ykm ? 13 * ykm : f.value, fu = f.fu || 30;
    const basic = _jpBasic(han, fu, ykm);
    return { han, fu, yakuman: ykm, basic, value: han, fan: han, limit: _limitName(han, ykm, basic), items: f.items || [[ykm ? `Yakuman ×${ykm}` : `${han} han ${fu} fu`, han]] };
  }
  /** hitung perubahan skor dari isi form (tanpa menyimpan) */
  function preview(st, f) {
    const v = V(st), G = pseudoG(st), riichi = st.variant === 'jp' ? (f.riichi || []).filter(Boolean).length : 0;
    let base = [0, 0, 0, 0];
    if (riichi) { (f.riichi || []).forEach((r, i) => { if (r) base[i] -= 1000; }); G.sticks += riichi; }
    let r;
    if (f.kind === 'manual') r = { delta: f.manual.map(x => +x || 0), stays: !!f.dealerStays, note: 'Poin dimasukkan manual.' };
    else if (f.kind === 'draw') r = v.draw(G, st.variant === 'jp' ? f.tenpai : null);
    else {
      if (f.winner == null) return { error: 'Pilih pemenang.' };
      if (!f.selfDraw && (f.from == null || f.from === f.winner)) return { error: 'Pilih pemain yang membuang kartu.' };
      if (st.variant === 'hk' && f.value < st.minFan) return { error: `Minimal ${st.minFan} fan untuk menang.` };
      if (st.variant === 'jp' && !f.yakuman && !(f.value >= 1)) return { error: 'Riichi: minimal 1 han (wajib yaku).' };
      r = v.pay(G, { p: f.winner, from: f.from, selfDraw: f.selfDraw, score: scoreObj(st, f) });
    }
    const delta = r.delta.map((d, i) => Math.round(d + base[i]));
    return { delta, stays: r.stays, note: r.note, sticksTaken: !!r.sticksTaken, riichi, tenpaiPay: r.tenpaiPay };
  }
  function commit(st, f) {
    const p = preview(st, f);
    if (p.error) return FX.toast(p.error);
    const v = V(st);
    const label = f.kind === 'draw' ? 'Seri' : f.kind === 'manual' ? 'Manual' : `${st.players[f.winner].name} ${f.selfDraw ? (st.variant === 'jp' ? 'Tsumo' : 'Zimo') : `dari ${st.players[f.from].name}`}`;
    const s = f.kind === 'win' ? scoreObj(st, f) : null;
    const valTxt = s ? (st.variant === 'jp' ? (s.yakuman ? s.limit : `${s.han} han ${s.fu} fu${s.limit ? ' ' + s.limit : ''}`) : `${s.value} ${unitOf(st)}`) : '';
    st.hands.push({
      n: st.handNo, rw: st.roundWind, dealer: st.dealer, kind: f.kind, winner: f.winner, from: f.from, selfDraw: !!f.selfDraw,
      label, valTxt, items: s ? s.items : null, delta: p.delta, prev: { dealer: st.dealer, roundWind: st.roundWind, handNo: st.handNo, honba: st.honba, sticks: st.sticks, renchan: st.renchan }, at: Date.now(),
    });
    p.delta.forEach((d, i) => { st.scores[i] += d; });
    if (st.variant === 'jp') { st.sticks += p.riichi; if (p.sticksTaken) st.sticks = 0; }
    const stays = p.stays;
    if (st.variant === 'jp') st.honba = stays || f.kind === 'draw' ? st.honba + 1 : 0;
    st.renchan = stays ? st.renchan + 1 : 0;
    if (!stays) {
      st.dealer = (st.dealer + 1) % 4;
      if (st.dealer === 0) st.roundWind = Math.min(st.roundWind + 1, 4);
    }
    st.handNo++;
    save(st); form = null; calc = null;
    FX.toast(`Hand ${st.handNo - 1} tercatat${valTxt ? ' — ' + valTxt : ''}.`);
    renderScore();
  }
  function undo(st) {
    const h = st.hands.pop(); if (!h) return;
    h.delta.forEach((d, i) => { st.scores[i] -= d; });
    Object.assign(st, h.prev);
    save(st); renderScore();
  }

  function setupHTML(st) {
    const v = st ? st.variant : 'hk';
    const nm = st ? st.players.map(p => p.name) : ['', '', '', ''];
    return `<div class="card sk-setup">
      <h3>${st ? 'Ubah pemain' : 'Mulai pencatatan baru'}</h3>
      <p class="muted">Isi nama sesuai <b>posisi duduk</b>. 東 Timur = dealer pertama; lalu Selatan, Barat, Utara berlawanan arah jarum jam. Belum tahu siapa dealer? Pakai <a href="#tools/dice" data-t="goto-dice">🎲 Dadu → Tentukan dealer</a>.</p>
      <div class="sk-seats">${[0, 1, 2, 3].map(i => `<label class="sk-seat"><span class="wind-badge w${i}">${WIND_CH[i]}</span><span>${WIND_ID[i]}${i === 0 ? ' · dealer' : ''}</span><input name="sk-n${i}" maxlength="14" placeholder="Pemain ${i + 1}" value="${esc(nm[i])}"></label>`).join('')}</div>
      ${st ? '' : `<div class="form-grid">
        <label>Jenis mahjong<select name="sk-var">${Object.values(MJN_VARIANTS).map(x => `<option value="${x.id}"${x.id === v ? ' selected' : ''}>${x.name}</option>`).join('')}</select></label>
        <label>Skor awal<input name="sk-start" type="number" inputmode="numeric" placeholder="otomatis"></label>
        <label class="sk-minfan">Minimal fan (Hong Kong)<select name="sk-min"><option value="0">0</option><option value="1" selected>1</option><option value="3">3</option></select></label>
      </div>`}
      <div class="modal-actions">${st ? '<button class="btn ghost" data-t="cancel-edit">Batal</button>' : ''}<button class="btn big" data-t="${st ? 'save-names' : 'start'}">${st ? 'Simpan nama' : 'Mulai mencatat'}</button></div>
    </div>`;
  }
  function boardHTML(st) {
    const v = V(st), order = [0, 1, 2, 3].slice().sort((a, b) => st.scores[b] - st.scores[a]);
    const sw = i => (i - st.dealer + 4) % 4;
    return `<div class="card sk-board">
      <div class="sk-head"><b>${esc(v.name)}</b> · Ronde ${WIND_CH[Math.min(st.roundWind, 3)]} ${WIND_ID[Math.min(st.roundWind, 3)]} · Hand ${st.handNo}${st.variant === 'jp' ? ` · honba ${st.honba} · tongkat ${st.sticks}` : st.variant === 'tw' && st.renchan ? ` · dealer lanjut ${st.renchan}×` : ''}</div>
      <div class="sk-players">${st.players.map((p, i) => `<div class="sk-p${i === st.dealer ? ' dealer' : ''}">
          <span class="wind-badge w${sw(i)}" title="Angin kursi">${WIND_CH[sw(i)]}</span>
          <span class="sk-name">${esc(p.name)}${i === st.dealer ? ' <small>dealer</small>' : ''}</span>
          <b class="sk-score">${st.scores[i]}</b><small class="sk-rank">#${order.indexOf(i) + 1}</small></div>`).join('')}</div>
      <div class="sk-actions"><button class="btn big" data-t="new-hand">➕ Catat hand ${st.handNo}</button>
        <button class="btn ghost" data-t="undo"${st.hands.length ? '' : ' disabled'}>↶ Batalkan terakhir</button>
        <button class="btn ghost" data-t="share">📤 Bagikan</button>
        <button class="btn ghost" data-t="edit-names">✏️ Pemain</button>
        <button class="btn ghost" data-t="reset">🗑 Mulai baru</button></div>
    </div>`;
  }
  function pickBtns(name, sel, opts) {
    return `<div class="sk-pick">${opts.map(o => `<button type="button" data-t="pick" data-f="${name}" data-v="${o.v}" class="${sel === o.v ? 'on' : ''}">${o.l}</button>`).join('')}</div>`;
  }
  function formHTML(st) {
    const f = form, v = V(st), P = st.players.map((p, i) => ({ v: i, l: esc(p.name) }));
    let body = '';
    if (f.kind === 'win') {
      body += `<label class="sk-l">Pemenang</label>${pickBtns('winner', f.winner, P)}
        <label class="sk-l">Cara menang</label>${pickBtns('selfDraw', f.selfDraw ? 1 : 0, [{ v: 1, l: st.variant === 'jp' ? 'Tsumo (ambil sendiri)' : 'Zimo (ambil sendiri)' }, { v: 0, l: st.variant === 'jp' ? 'Ron (dari buangan)' : 'Dari buangan' }])}
        ${f.selfDraw ? '' : `<label class="sk-l">Yang membuang</label>${pickBtns('from', f.from, P.filter(o => o.v !== f.winner))}`}
        <label class="sk-l">Nilai</label>
        <div class="sk-val">
          ${st.variant === 'jp' ? `<label>Han<input type="number" min="0" max="20" inputmode="numeric" data-t="val" data-f="value" value="${f.value || ''}"></label>
            <label>Fu<select data-t="val" data-f="fu">${[20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].map(x => `<option${(f.fu || 30) === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
            <label>Yakuman<select data-t="val" data-f="yakuman">${[0, 1, 2, 3].map(x => `<option value="${x}"${(f.yakuman || 0) === x ? ' selected' : ''}>${x ? '×' + x : '—'}</option>`).join('')}</select></label>`
          : `<label>${unitOf(st) === 'fan' ? 'Fan' : 'Tai'}<input type="number" min="0" max="${st.variant === 'tw' ? 64 : 13}" inputmode="numeric" data-t="val" data-f="value" value="${f.value != null ? f.value : ''}"></label>`}
          <button type="button" class="btn jade" data-t="calc">🧮 Hitung dari kartu / 📷 scan</button>
        </div>
        ${f.items ? `<p class="muted sk-items">${f.items.map(x => `${esc(x[0])} (${x[1]})`).join(' · ')}</p>` : ''}`;
    } else if (f.kind === 'draw') {
      body += st.variant === 'jp' ? `<label class="sk-l">Siapa yang Ting (tenpai)?</label><div class="sk-pick">${st.players.map((p, i) => `<button type="button" data-t="tog" data-f="tenpai" data-i="${i}" class="${f.tenpai[i] ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>`
        : '<p class="muted">Tembok habis tanpa pemenang. Dealer tetap.</p>';
    } else {
      body += `<p class="muted">Masukkan perubahan poin tiap pemain (plus/minus), mis. untuk aturan rumah.</p><div class="sk-manual">${st.players.map((p, i) => `<label>${esc(p.name)}<input type="number" inputmode="numeric" data-t="man" data-i="${i}" value="${f.manual[i] || ''}"></label>`).join('')}</div>
        <label class="chk"><input type="checkbox" data-t="stay"${f.dealerStays ? ' checked' : ''}> Dealer tetap (tidak berganti)</label>`;
    }
    if (st.variant === 'jp' && f.kind !== 'manual') body += `<label class="sk-l">Yang menyatakan riichi di hand ini (bayar 1000)</label><div class="sk-pick">${st.players.map((p, i) => `<button type="button" data-t="tog" data-f="riichi" data-i="${i}" class="${f.riichi[i] ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>`;
    const p = preview(st, f);
    const prev = p.error ? `<p class="ab-hint warn sk-err">${esc(p.error)}</p>` : `<div class="sk-preview"><p>${p.note}</p><div class="sk-delta">${st.players.map((pl, i) => `<span class="${p.delta[i] > 0 ? 'plus' : p.delta[i] < 0 ? 'minus' : ''}">${esc(pl.name)} <b>${p.delta[i] > 0 ? '+' : ''}${p.delta[i]}</b></span>`).join('')}</div><small class="muted">${p.stays ? 'Dealer tetap.' : 'Dealer berpindah.'}</small></div>`;
    return `<div class="card sk-form">
      <h3>Hand ${st.handNo}</h3>
      ${pickBtns('kind', f.kind, [{ v: 'win', l: '🀄 Menang' }, { v: 'draw', l: '🤝 Seri' }, { v: 'manual', l: '✍️ Poin manual' }])}
      ${body}${prev}
      <div class="modal-actions"><button class="btn ghost" data-t="cancel-hand">Batal</button><button class="btn big" data-t="save-hand"${p.error ? ' disabled' : ''}>Simpan hand</button></div>
    </div>`;
  }
  function historyHTML(st) {
    if (!st.hands.length) return '<p class="muted sk-empty">Belum ada hand tercatat.</p>';
    return `<div class="card"><h3>Riwayat</h3><div class="sk-hist">${st.hands.slice().reverse().map(h => `<details><summary><b>#${h.n}</b> ${WIND_CH[Math.min(h.rw, 3)]} · ${esc(h.label)}${h.valTxt ? ` · <b>${esc(h.valTxt)}</b>` : ''}<span class="sk-hd">${h.delta.map(d => `<i class="${d > 0 ? 'plus' : d < 0 ? 'minus' : ''}">${d > 0 ? '+' : ''}${d}</i>`).join('')}</span></summary>
      ${h.items ? `<p class="muted">${h.items.map(x => `${esc(x[0])} (${x[1]})`).join(' · ')}</p>` : ''}</details>`).join('')}</div></div>`;
  }
  let editingNames = false;
  function renderScore() {
    const el = $('#tool-score'); if (!el) return;
    const st = load();
    if (!st || editingNames) { el.innerHTML = setupHTML(editingNames ? st : null); syncSetup(); return; }
    el.innerHTML = boardHTML(st) + (calc ? calcHTML(st) : form ? formHTML(st) : '') + historyHTML(st);
  }
  function syncSetup() { const v = $('#tool-score select[name="sk-var"]'); if (v) { const mf = $('#tool-score .sk-minfan'); if (mf) mf.hidden = v.value !== 'hk'; } }

  /* =========================================================== KALKULATOR KARTU (+ scan) */
  const newCalc = st => ({ tiles: [], flowers: [], open: [], win: null, zimo: form ? !!form.selfDraw : false, lastTile: false, kongDraw: false, riichi: false, ippatsu: false, dora: 0, red: 0, scanning: false, note: '' });
  function calcEval(st) {
    const v = V(st), c = calc, sets = v.sets;
    if (!c.tiles.length) return null;
    const counts = toCounts(c.tiles);
    const kongKs = [...new Set(c.tiles)].filter(k => counts[k] === 4);
    const need = sets * 3 + 2 + kongKs.length;
    if (c.tiles.length !== need) return { msg: `${c.tiles.length} kartu — tangan menang butuh ${sets * 3 + 2} kartu (+1 per Kong).` };
    const melds = kongKs.map(k => ({ type: 'kong', k, concealed: !c.open.includes('k' + k) }));
    let conc = c.tiles.filter(k => !kongKs.includes(k));
    // set terbuka yang ditandai pengguna (Chow/Pong dari buangan)
    c.open.filter(x => x[0] !== 'k').forEach(x => {
      const [t, k] = [x[0], +x.slice(1)], ks = t === 'c' ? [k, k + 1, k + 2] : [k, k, k];
      const tmp = conc.slice(); let ok = true;
      ks.forEach(y => { const i = tmp.indexOf(y); if (i < 0) ok = false; else tmp.splice(i, 1); });
      if (ok) { conc = tmp; melds.push({ type: t === 'c' ? 'chow' : 'pong', k, concealed: false }); }
    });
    const winK = c.win != null && conc.includes(c.win) ? c.win : conc[conc.length - 1];
    const winner = form && form.winner != null ? form.winner : st.dealer;
    const ctx = {
      concealed: conc, melds, flowers: c.flowers, seatWind: (winner - st.dealer + 4) % 4, roundWind: Math.min(st.roundWind, 3),
      selfDraw: c.zimo, lastTile: c.lastTile, kongDraw: c.kongDraw, heavenly: false, winTile: winK,
      red: c.red, riichi: c.riichi, ippatsu: c.riichi && c.ippatsu, doraInd: [], uraInd: [],
    };
    const s = v.score(ctx);
    if (!s) return { msg: 'Kartu ini belum membentuk tangan menang (4/5 set + 1 pasang). Periksa lagi.' };
    if (st.variant === 'jp' && c.dora && !s.yakuman && !s.noYaku) {     // dora dihitung manual (indikator ada di meja)
      s.items = s.items.concat([[`Dora ×${c.dora}`, c.dora]]); s.han += c.dora; s.value = s.fan = s.han;
      s.basic = _jpBasic(s.han, s.fu, 0); s.limit = _limitName(s.han, 0, s.basic);
    }
    return { s, winK, sets: s.decomp ? s.decomp.sets : null };
  }
  function tileBtn(k, extra = '') { return `<button type="button" class="tbtn" data-t="add" data-k="${k}"${extra}>${tileHTML(k, { cls: 'sm' })}</button>`; }
  function calcHTML(st) {
    const v = V(st), c = calc, r = calcEval(st);
    const counts = toCounts(c.tiles);
    const pal = [[0, 9, 'Wan 萬'], [9, 18, 'Tong 筒'], [18, 27, 'Tiao 索'], [27, 34, 'Angin & Naga']];
    const sorted = c.tiles.map((k, i) => ({ k, i })).sort((a, b) => a.k - b.k);
    let res = '';
    if (r && r.s) {
      const s = r.s, tot = st.variant === 'jp' ? (s.noYaku ? 'tanpa yaku' : s.yakuman ? s.limit : `${s.han} han ${s.fu} fu${s.limit ? ' · ' + s.limit : ''}`) : `${s.value} ${unitOf(st)}`;
      res = `<div class="calc-res">
        ${r.sets ? `<div class="calc-sets">${r.sets.map(x => { const key = (x.kong ? 'k' : x.type === 'chow' ? 'c' : 'p') + x.k; const isOpen = c.open.includes(key); return `<button type="button" class="calc-set${isOpen ? ' open' : ''}" data-t="open" data-key="${key}" title="Ketuk untuk menandai set terbuka (diambil dari buangan)">${(x.kong ? [x.k, x.k, x.k, x.k] : x.type === 'chow' ? [x.k, x.k + 1, x.k + 2] : [x.k, x.k, x.k]).map(k => tileHTML(k, { cls: 'xs' })).join('')}<small>${x.kong ? 'Kong' : x.type === 'chow' ? 'Chow' : 'Pong'}${isOpen ? ' terbuka' : ''}</small></button>`; }).join('')}</div><p class="muted calc-tip">Ketuk set yang <b>diambil dari buangan</b> (Chow/Pong terbuka) agar nilainya tepat.</p>` : ''}
        <table class="fan-table"><tbody>${s.items.map(([n, x]) => `<tr><td>${esc(n)}</td><td class="num">${x}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${esc(tot)}</td></tr></tfoot></table>
        ${(st.variant === 'hk' && s.fan < st.minFan) ? `<p class="ab-hint warn">Kurang dari minimal ${st.minFan} fan.</p>` : ''}
        ${st.variant === 'jp' && s.noYaku ? '<p class="ab-hint warn">Tidak ada yaku — tangan ini belum sah di Riichi.</p>' : ''}
      </div>`;
    } else if (r && r.msg) res = `<p class="muted calc-msg">${esc(r.msg)}</p>`;
    let marked = 0;                                     // sorot hanya satu kartu penentu
    const usable = r && r.s && !(st.variant === 'jp' && r.s.noYaku) && !(st.variant === 'hk' && r.s.fan < st.minFan);
    return `<div class="card calc">
      <h3>🧮 Hitung dari kartu menang</h3>
      <div class="calc-scan">
        <label class="btn jade">📷 Kamera<input type="file" accept="image/*" capture="environment" data-t="scan" hidden></label>
        <label class="btn ghost">🖼️ Galeri<input type="file" accept="image/*" data-t="scan" hidden></label>
        <span class="muted">${c.scanning ? '⏳ Mengenali kartu…' : 'Foto kartu menang dari atas, terang & tidak terpotong.'}</span>
      </div>
      ${c.note ? `<p class="ab-hint calc-note">${c.note}</p>` : ''}
      <div class="calc-hand">${sorted.length ? sorted.map(({ k, i }) => `<button type="button" class="tbtn${k === (r && r.winK) && !(marked++) ? ' win' : ''}" data-t="rm" data-i="${i}" title="Ketuk: hapus · tahan: jadikan kartu penentu">${tileHTML(k, { cls: 'sm' })}</button>`).join('') : '<span class="muted">Ketuk kartu di bawah untuk mengisi tangan menang.</span>'}</div>
      ${sorted.length ? '<p class="muted calc-tip">Ketuk kartu di atas untuk menghapus. <b>Tahan / klik kanan</b> untuk menandai <b>kartu penentu</b> (disorot emas).</p>' : ''}
      ${pal.map(([a, b, l]) => `<div class="calc-pal"><small>${l}</small><div>${Array.from({ length: b - a }, (_, j) => a + j).map(k => tileBtn(k, counts[k] >= 4 ? ' disabled' : '')).join('')}</div></div>`).join('')}
      ${v.flowers ? `<div class="calc-pal"><small>Bunga & Musim</small><div>${[34, 35, 36, 37, 38, 39, 40, 41].map(k => `<button type="button" class="tbtn${c.flowers.includes(k) ? ' on' : ''}" data-t="flower" data-k="${k}">${tileHTML(k, { cls: 'sm' })}</button>`).join('')}</div></div>` : ''}
      <div class="calc-opts">
        <label class="chk"><input type="checkbox" data-t="copt" data-f="zimo"${c.zimo ? ' checked' : ''}> ${st.variant === 'jp' ? 'Tsumo' : 'Zimo'} (ambil sendiri)</label>
        <label class="chk"><input type="checkbox" data-t="copt" data-f="lastTile"${c.lastTile ? ' checked' : ''}> Kartu terakhir</label>
        <label class="chk"><input type="checkbox" data-t="copt" data-f="kongDraw"${c.kongDraw ? ' checked' : ''}> Menang dari Kong</label>
        ${st.variant === 'jp' ? `<label class="chk"><input type="checkbox" data-t="copt" data-f="riichi"${c.riichi ? ' checked' : ''}> Riichi</label>
          <label class="chk"><input type="checkbox" data-t="copt" data-f="ippatsu"${c.ippatsu ? ' checked' : ''}> Ippatsu</label>
          <label>Dora (+ura)<input type="number" min="0" max="20" inputmode="numeric" data-t="cnum" data-f="dora" value="${c.dora || ''}"></label>
          <label>Lima merah<input type="number" min="0" max="3" inputmode="numeric" data-t="cnum" data-f="red" value="${c.red || ''}"></label>` : ''}
      </div>
      ${res}
      <div class="modal-actions"><button class="btn ghost" data-t="calc-clear">Kosongkan</button><button class="btn ghost" data-t="calc-close">Tutup</button><button class="btn big" data-t="calc-use"${usable ? '' : ' disabled'}>Pakai nilai ini</button></div>
    </div>`;
  }
  /** perkecil foto (maks. 2000 px sisi panjang, JPEG) agar cepat & hemat sebelum dikirim */
  function shrink(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, 2000 / Math.max(im.width, im.height));
          const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          res(cv.toDataURL('image/jpeg', .85).split(',')[1]);
        };
        im.onerror = () => rej(new Error('Foto tidak bisa dibaca.'));
        im.src = fr.result;
      };
      fr.onerror = () => rej(new Error('Foto tidak bisa dibaca.'));
      fr.readAsDataURL(file);
    });
  }
  async function scan(file, st) {
    if (location.protocol === 'file:') return FX.toast('Scan foto butuh server (buka lewat alamat situs).');
    if (navigator.onLine === false) return FX.toast('Scan foto butuh internet. Isi kartu secara manual dulu.');
    calc.scanning = true; calc.note = ''; renderScore();
    try {
      const image = await shrink(file);
      const r = await fetch('api/scan', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image, media: 'image/jpeg' }) });
      let j = null; try { j = await r.json(); } catch { }
      if (!r.ok) {
        if (j && j.code === 'login') { calc.scanning = false; renderScore(); return Account.requireLogin('Scan foto memakai layanan AI berbayar, jadi khusus pemain yang login.', '#tools/score'); }
        throw new Error((j && j.error) || 'Scan gagal.');
      }
      calc.tiles = j.tiles.slice(); calc.flowers = j.flowers.filter(k => V(st).flowers); calc.open = []; calc.win = null;
      if (st.variant === 'jp') calc.red = j.redFives || 0;
      const conf = { high: 'yakin', medium: 'cukup yakin', low: 'kurang yakin' }[j.confidence];
      calc.note = `📷 Terbaca ${j.tiles.length} kartu${j.flowers.length ? ` + ${j.flowers.length} bunga` : ''} (${conf}). <b>Periksa & koreksi</b> sebelum dipakai.${j.notes ? ' ' + esc(j.notes) : ''}`;
    } catch (e) { calc.note = '⚠️ ' + esc(e.message); }
    calc.scanning = false; renderScore();
  }

  /* =========================================================== NAVIGASI & EVENT */
  let cur = 'dice';
  function show(tab) {
    cur = tab === 'score' ? 'score' : 'dice';
    document.querySelectorAll('#tools-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === cur));
    $('#tool-dice').hidden = cur !== 'dice'; $('#tool-score').hidden = cur !== 'score';
    if (cur === 'dice') renderDice(); else renderScore();
  }
  function shareStandings(st) {
    const order = [0, 1, 2, 3].sort((a, b) => st.scores[b] - st.scores[a]);
    MjnShare.shareResult({
      variant: V(st).name, title: `Klasemen meja — hand ${st.hands.length}`,
      subtitle: `Dicatat dengan Pencatat Skor · Ronde ${WIND_ID[Math.min(st.roundWind, 3)]}`,
      scores: order.map((i, n) => ({ rank: n + 1, name: st.players[i].name, delta: st.scores[i] - st.start, score: st.scores[i] })),
      footer: 'Catat skor mahjong mejamu di',
    }, `🀄 Klasemen meja mahjong kami (${V(st).name}): ${order.map((i, n) => `${n + 1}. ${st.players[i].name} ${st.scores[i]}`).join(', ')}`);
  }
  function onClick(e) {
    const b = e.target.closest('[data-t]'); if (!b || !$('#view-tools').contains(b)) return;
    const t = b.dataset.t, st = load();
    if (t === 'roll') roll();
    else if (t === 'dn') { D.n = +b.dataset.n; D.dealerRolls = null; renderDice(); }
    else if (t === 'dm') { D.mode = b.dataset.m; D.dealerRolls = null; renderDice(); }
    else if (t === 'shake') toggleShake();
    else if (t === 'set-dealer' && st) {
      const i = +b.dataset.i;                                   // putar posisi agar pemenang dadu duduk di 東
      st.players = [0, 1, 2, 3].map(j => st.players[(i + j) % 4]); st.scores = [0, 1, 2, 3].map(j => st.scores[(i + j) % 4]);
      st.dealer = 0; save(st); FX.toast(`${st.players[0].name} sekarang dealer (東 Timur).`); location.hash = '#tools/score';
    }
    else if (t === 'goto-dice') { e.preventDefault(); location.hash = '#tools/dice'; D.mode = 'dealer'; }
    else if (t === 'start') {
      const g = n => (($('#tool-score [name="' + n + '"]') || {}).value || '');
      save(newGame({ names: [0, 1, 2, 3].map(i => g('sk-n' + i)), variant: g('sk-var') || 'hk', start: g('sk-start'), minFan: g('sk-min') || 1 })); renderScore();
    }
    else if (t === 'edit-names') { editingNames = true; renderScore(); }
    else if (t === 'cancel-edit') { editingNames = false; renderScore(); }
    else if (t === 'save-names' && st) { [0, 1, 2, 3].forEach(i => { const v = $('#tool-score [name="sk-n' + i + '"]').value.trim(); if (v) st.players[i].name = v.slice(0, 14); }); save(st); editingNames = false; renderScore(); }
    else if (t === 'reset') FX.ask('Mulai pencatatan baru?', { text: 'Semua skor & riwayat meja ini dihapus dari perangkat.', yes: 'Mulai baru', no: 'Batal' }).then(ok => { if (ok) { try { localStorage.removeItem(SKEY); } catch { } form = calc = null; renderScore(); } });
    else if (t === 'undo' && st) FX.ask('Batalkan hand terakhir?', { yes: 'Batalkan', no: 'Tidak' }).then(ok => { if (ok) undo(st); });
    else if (t === 'share' && st) shareStandings(st);
    else if (t === 'new-hand' && st) { form = { kind: 'win', winner: null, from: null, selfDraw: false, value: st.variant === 'hk' ? Math.max(st.minFan, 1) : st.variant === 'jp' ? 1 : 0, fu: 30, yakuman: 0, tenpai: [false, false, false, false], riichi: [false, false, false, false], manual: ['', '', '', ''], dealerStays: false, items: null }; calc = null; renderScore(); setTimeout(() => $('.sk-form').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
    else if (t === 'cancel-hand') { form = null; renderScore(); }
    else if (t === 'save-hand' && st && form) commit(st, form);
    else if (t === 'pick' && form) {
      const f = b.dataset.f, v = b.dataset.v;
      if (f === 'kind') form.kind = v; else if (f === 'selfDraw') form.selfDraw = v === '1'; else form[f] = +v;
      if (f === 'winner' && form.from === form.winner) form.from = null;
      renderScore();
    }
    else if (t === 'tog' && form) { form[b.dataset.f][+b.dataset.i] = !form[b.dataset.f][+b.dataset.i]; renderScore(); }
    else if (t === 'calc' && st) { calc = newCalc(st); renderScore(); setTimeout(() => $('.calc').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
    else if (calc && st) {
      if (t === 'add') { const k = +b.dataset.k; if (toCounts(calc.tiles)[k] < 4 && calc.tiles.length < 24) { calc.tiles.push(k); calc.win = k; } renderScore(); }
      else if (t === 'rm') { const k = calc.tiles.splice(+b.dataset.i, 1)[0]; if (calc.win === k && !calc.tiles.includes(k)) calc.win = null; calc.open = []; renderScore(); }
      else if (t === 'flower') { const k = +b.dataset.k; calc.flowers = calc.flowers.includes(k) ? calc.flowers.filter(x => x !== k) : calc.flowers.concat(k); renderScore(); }
      else if (t === 'open') { const key = b.dataset.key; calc.open = calc.open.includes(key) ? calc.open.filter(x => x !== key) : calc.open.concat(key); renderScore(); }
      else if (t === 'calc-clear') { Object.assign(calc, { tiles: [], flowers: [], open: [], win: null, note: '' }); renderScore(); }
      else if (t === 'calc-close') { calc = null; renderScore(); }
      else if (t === 'calc-use') {
        const r = calcEval(st); if (!r || !r.s) return;
        const s = r.s;
        if (st.variant === 'jp') { form.value = s.yakuman ? 0 : s.han; form.fu = s.fu || 30; form.yakuman = s.yakuman || 0; }
        else form.value = s.value;
        form.items = s.items; form.selfDraw = calc.zimo; calc = null; renderScore();
        FX.toast('Nilai dari kartu dipakai. Periksa pemenang & yang membuang.');
      }
    }
  }
  function onInput(e) {
    const b = e.target; if (!$('#view-tools').contains(b)) return;
    const t = b.dataset && b.dataset.t;
    if (b.name === 'sk-var') return syncSetup();
    if (t === 'val' && form) { form[b.dataset.f] = +b.value || 0; form.items = null; if (e.type === 'change') renderScore(); else refreshPreview(); }
    else if (t === 'man' && form) { form.manual[+b.dataset.i] = b.value; refreshPreview(); }
    else if (t === 'stay' && form) { form.dealerStays = b.checked; renderScore(); }
    else if (t === 'copt' && calc) { calc[b.dataset.f] = b.checked; if (b.dataset.f === 'zimo' && form) form.selfDraw = b.checked; renderScore(); }
    else if (t === 'cnum' && calc) { calc[b.dataset.f] = +b.value || 0; if (e.type === 'change') renderScore(); }
    else if (t === 'scan' && b.files && b.files[0]) { const st = load(); if (st && calc) scan(b.files[0], st); b.value = ''; }
  }
  /** perbarui pratinjau pembayaran tanpa merender ulang input yang sedang diketik */
  function refreshPreview() {
    const st = load(); if (!st || !form) return;
    const box = $('.sk-form'); if (!box) return;
    const tmp = document.createElement('div'); tmp.innerHTML = formHTML(st);
    const a = box.querySelector('.sk-preview, .sk-err'), bNew = tmp.querySelector('.sk-preview, .sk-err');
    if (a && bNew) a.replaceWith(bNew);
    const sv = box.querySelector('[data-t="save-hand"]'); if (sv) sv.disabled = !!tmp.querySelector('.sk-err');
  }
  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput);
    document.addEventListener('contextmenu', e => {           // tahan / klik kanan kartu di tangan → kartu penentu
      const b = e.target.closest('.calc-hand [data-t="rm"]'); if (!b || !calc) return;
      e.preventDefault(); calc.win = calc.tiles[+b.dataset.i]; renderScore();
    });
    document.querySelectorAll('#tools-tabs button').forEach(b => b.addEventListener('click', () => { location.hash = '#tools/' + b.dataset.tab; }));
  }
  return { init, show };
})();
