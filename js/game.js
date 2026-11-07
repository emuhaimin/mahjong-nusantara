/* game.js — mesin permainan mahjong (Hong Kong) + bot AI + tampilan meja */
const Game = (() => {
  const ABORT = { abort: true };
  const POS = ['bottom', 'right', 'top', 'left'];
  const SLOT = ['slot-me', 'slot-right', 'slot-top', 'slot-left'];
  const SPEED = { lambat: 1.7, normal: 1, cepat: .45, kilat: .12 };
  let G = null, cfg = null, token = 0;
  let pending = null;          // input manusia yang ditunggu
  const aborters = new Set();  // untuk membatalkan modal dsb.

  const $ = s => document.querySelector(s);
  const rnd = n => Math.floor(Math.random() * n);
  const sum = a => a.reduce((x, y) => x + y, 0);
  const dieCh = v => String.fromCodePoint(0x267F + v);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sortT = (a, b) => a.k - b.k || a.id - b.id;
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function wait(ms) {
    const t = token;
    return new Promise((res, rej) => setTimeout(() => (t === token ? res() : rej(ABORT)), ms * (SPEED[cfg.speed] || 1)));
  }
  const seatWind = p => (p - G.dealer + 4) % 4;
  const kindsOf = pl => pl.hand.map(t => t.k);
  const isValue = (p, k) => k >= 31 || k === 27 + seatWind(p) || k === 27 + G.roundWind;
  const pname = p => esc(G.players[p].name);

  function log(s) {
    if (!G) return;
    G.log.push(s);
    if (G.log.length > 400) G.log.shift();
    renderLog();
  }

  /* ================= SIKLUS PERMAINAN ================= */
  function start(config) {
    stop();
    cfg = Object.assign({ mode: 'play', name: 'Kamu', minFan: 1, speed: 'normal', hint: true, showHands: false, length: 'east', level: 'medium' }, config);
    const watch = cfg.mode === 'watch';
    if (!LEVELS[cfg.level] && cfg.level !== 'mix') cfg.level = 'medium';
    const names = watch ? ['Bot Ani', 'Bot Budi', 'Bot Citra', 'Bot Dedi'] : [cfg.name || 'Kamu', 'Bot Budi', 'Bot Citra', 'Bot Dedi'];
    // campuran: tiap bot beda tingkat (simulasi: Easy, Medium, Hard, Expert · main: Medium, Hard, Expert)
    const MIX = watch ? ['easy', 'medium', 'hard', 'expert'] : [null, 'medium', 'hard', 'expert'];
    G = {
      players: names.map((n, i) => ({
        name: n, isAI: watch || i > 0, level: (watch || i > 0) ? (cfg.level === 'mix' ? MIX[i] : cfg.level) : null,
        score: 500, hand: [], melds: [], flowers: [], discards: [], drawn: null,
      })),
      dealer: 0, firstDealer: 0, roundWind: 0, handNo: 0, wall: [], turn: -1, log: [], msg: '', dice: null,
      ui: null, reveal: false, lastDiscard: null, callout: null,
    };
    // rekam sesi pemain (disimpan ke akun jika login)
    G.rec = !watch && typeof MjnRecorder !== 'undefined'
      ? new MjnRecorder({ mode: 'bot', minFan: cfg.minFan, length: cfg.length, opponents: names.slice(1), level: cfg.level }) : null;
    G.recSent = false;
    $('#setup').hidden = true; $('#game').hidden = false;
    syncTools();
    render();
    run();
  }
  function stop() {
    token++;
    if (pending) { const p = pending; pending = null; p.reject(ABORT); }
    aborters.forEach(f => f()); aborters.clear();
    closeModal();
    G = null;
  }
  const isRunning = () => !!G;
  const mode = () => cfg && cfg.mode;

  async function run() {
    try {
      await chooseDealer();
      while (true) {
        const res = await playHand();
        await settle(res);
        if (matchOver()) { await showFinal(); return; }
      }
    } catch (e) { if (e !== ABORT) { console.error(e); } }
  }

  async function chooseDealer() {
    let cands = [0, 1, 2, 3];
    log('Menentukan dealer: setiap pemain melempar 3 dadu. Angka tertinggi menjadi dealer (Angin Timur 東).');
    while (true) {
      const rolls = cands.map(p => ({ p, d: [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)] }));
      rolls.forEach(r => log(`${pname(r.p)} melempar ${r.d.join('+')} = ${sum(r.d)}`));
      G.msg = '<b>Menentukan dealer</b><br>' + rolls.map(r => `${pname(r.p)}: ${r.d.map(dieCh).join('')} = <b>${sum(r.d)}</b>`).join('<br>');
      render();
      await wait(1800);
      const max = Math.max(...rolls.map(r => sum(r.d)));
      cands = rolls.filter(r => sum(r.d) === max).map(r => r.p);
      if (cands.length === 1) break;
      log('Seri! Pemain dengan angka tertinggi yang sama melempar ulang.');
    }
    G.dealer = G.firstDealer = cands[0];
    log(`${pname(G.dealer)} menjadi dealer (東 Timur). Angin kursi lainnya mengikuti berlawanan arah jarum jam: Selatan, Barat, Utara.`);
  }

  function matchOver() {
    if (cfg.length === 'one') return true;
    if (cfg.length === 'east') return G.roundWind >= 1;
    return G.roundWind >= 4;
  }

  async function playHand() {
    G.handNo++;
    for (const pl of G.players) { pl.hand = []; pl.melds = []; pl.flowers = []; pl.discards = []; pl.drawn = null; }
    G.lastDiscard = null; G.turn = G.dealer; G.ui = null; G.reveal = false;
    const tiles = []; let id = 0;
    for (let k = 0; k < 34; k++) for (let c = 0; c < 4; c++) tiles.push({ id: id++, k });
    for (let k = 34; k < 42; k++) tiles.push({ id: id++, k });
    shuffle(tiles);
    G.wall = tiles;
    log(`— Hand ${G.handNo} · Ronde Angin ${WIND_ID[G.roundWind]} · Dealer: ${pname(G.dealer)} —`);
    G.dice = [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)];
    const tot = sum(G.dice);
    const wallOwner = (G.dealer + tot - 1) % 4;
    G.msg = `Kartu dikocok &amp; tembok disusun. Dealer melempar dadu = <b>${tot}</b>, tembok di depan ${pname(wallOwner)} dipecah.`;
    log(`Dadu ${G.dice.join('+')} = ${tot}: hitung dari dealer berlawanan arah jarum jam → tembok ${pname(wallOwner)}; hitung ${tot} tumpukan dari kanan lalu mulai mengambil.`);
    render(); await wait(1200);

    // bagi 4-4-4, lalu 1 tiap pemain, dealer +1
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
      const p = (G.dealer + i) % 4;
      for (let j = 0; j < 4; j++) G.players[p].hand.push(G.wall.shift());
      render(); await wait(90);
    }
    for (let i = 0; i < 4; i++) G.players[(G.dealer + i) % 4].hand.push(G.wall.shift());
    const extra = G.wall.shift();
    G.players[G.dealer].hand.push(extra);
    G.players[G.dealer].drawn = extra.id;
    G.msg = 'Kartu dibagikan: dealer 14 kartu, pemain lain 13.';
    log('Kartu dibagikan: 4-4-4 lalu 1 kartu tiap pemain; dealer mengambil 1 kartu tambahan (14 kartu).');
    render(); await wait(600);

    for (let i = 0; i < 4; i++) await replaceInitialFlowers((G.dealer + i) % 4);
    if (G.rec) G.rec.startHand({ dealer: G.dealer === 0, wind: seatWind(0) });

    let cur = G.dealer, phase = 'afterDraw';
    let flags = { heavenly: true, kongDraw: false };
    while (true) {
      G.turn = cur;
      if (phase === 'draw') {
        if (G.wall.length === 0) return { type: 'draw' };
        const t = await drawTile(cur, false);
        if (!t) return { type: 'draw' };
        phase = 'afterDraw';
      }
      const act = await turnAction(cur, phase === 'afterDraw', flags);
      if (act.type === 'exhausted') return { type: 'draw' };
      if (act.type === 'tsumo') {
        log(`🀄 ${pname(cur)} menang Zimo (ambil sendiri)!`);
        return { type: 'win', p: cur, selfDraw: true, score: act.score };
      }
      const tile = doDiscard(cur, act.id);
      flags = { heavenly: false, kongDraw: false };
      G.msg = `${pname(cur)} membuang ${tileName(tile.k)}.`;
      render();
      await wait(G.players[cur].isAI ? 420 : 200);
      const claim = await claimPhase(cur, tile);
      if (claim && claim.type === 'win') {
        G.players[cur].discards.pop();
        G.players[claim.p].hand.push(tile);
        G.players[claim.p].drawn = tile.id;
        log(`🀄 ${pname(claim.p)} menang (Hu) dari buangan ${pname(cur)}!`);
        callout(claim.p, 'HU!');
        return { type: 'win', p: claim.p, selfDraw: false, from: cur, score: claim.score, tile };
      }
      if (claim) {
        applyClaim(claim, cur, tile);
        cur = claim.p;
        G.turn = cur;
        if (claim.type === 'kong') {
          const t = await drawTile(cur, true);
          if (!t) return { type: 'draw' };
          flags.kongDraw = true; phase = 'afterDraw';
        } else phase = 'afterClaim';
        await wait(500);
        continue;
      }
      cur = (cur + 1) % 4; phase = 'draw';
    }
  }

  async function replaceInitialFlowers(p) {
    const pl = G.players[p];
    while (true) {
      const i = pl.hand.findIndex(t => t.k >= 34);
      if (i < 0) break;
      const f = pl.hand.splice(i, 1)[0];
      pl.flowers.push(f.k);
      const r = G.wall.pop();
      pl.hand.push(r);
      if (pl.drawn === f.id) pl.drawn = r.id;
      log(`${pname(p)} membuka ${tileName(f.k)} dan mengambil pengganti dari ujung belakang tembok.`);
      render(); await wait(260);
    }
  }

  async function drawTile(p, fromBack) {
    const pl = G.players[p];
    let t = fromBack ? G.wall.pop() : G.wall.shift();
    while (t && t.k >= 34) {
      pl.flowers.push(t.k);
      log(`${pname(p)} mendapat ${tileName(t.k)} → disisihkan, ambil pengganti dari ujung belakang tembok.`);
      G.msg = `${pname(p)} mendapat bunga/musim, mengambil kartu pengganti.`;
      render(); await wait(450);
      t = G.wall.pop();
    }
    if (!t) return null;
    pl.hand.push(t); pl.drawn = t.id;
    render();
    return t;
  }

  function evalWin(p, tile, flags) {
    const pl = G.players[p];
    const kinds = kindsOf(pl);
    if (tile) kinds.push(tile.k);
    const s = scoreWin({
      concealed: kinds, melds: pl.melds, flowers: pl.flowers, seatWind: seatWind(p), roundWind: G.roundWind,
      selfDraw: !!flags.selfDraw, lastTile: !!flags.lastTile, kongDraw: !!flags.kongDraw, heavenly: !!flags.heavenly,
    });
    if (!s) return null;
    if (s.fan < cfg.minFan) s.insufficient = true;
    return s;
  }

  function selfKongOptions(pl) {
    const c = toCounts(kindsOf(pl)), res = [];
    for (let k = 0; k < 34; k++) if (c[k] === 4) res.push({ k, kind: 'concealed' });
    pl.melds.forEach(m => { if (m.type === 'pong' && c[m.k] >= 1) res.push({ k: m.k, kind: 'add' }); });
    return res;
  }
  function doSelfKong(p, k) {
    const pl = G.players[p];
    const n = pl.hand.filter(t => t.k === k).length;
    if (n === 4) {
      pl.hand = pl.hand.filter(t => t.k !== k);
      pl.melds.push({ type: 'kong', k, concealed: true });
      log(`${pname(p)} melakukan Kong tertutup ${tileName(k)}.`);
    } else {
      const i = pl.hand.findIndex(t => t.k === k);
      pl.hand.splice(i, 1);
      const m = pl.melds.find(m => m.type === 'pong' && m.k === k);
      m.type = 'kong';
      log(`${pname(p)} menambah Pong ${tileName(k)} menjadi Kong.`);
    }
    pl.drawn = null;
    callout(p, 'KONG!');
  }

  async function turnAction(p, canWin, flags) {
    const pl = G.players[p];
    while (true) {
      const win = canWin ? evalWin(p, null, { selfDraw: true, kongDraw: flags.kongDraw, heavenly: flags.heavenly && p === G.dealer, lastTile: G.wall.length === 0 }) : null;
      const kongs = canWin && G.wall.length > 0 ? selfKongOptions(pl) : [];
      let act;
      if (pl.isAI) {
        render();
        await wait(560);
        act = AI.turn(p, win, kongs);
      } else {
        const ui = { mode: 'turn', win, kongs, selected: null };
        const h = AI.evalDiscard(p, 'hard');
        if (cfg.hint) {
          ui.hintId = h.id; ui.hintK = h.k; ui.hintS = h.s;
          if (h.s === 0) {
            const ks = kindsOf(pl); ks.splice(ks.indexOf(h.k), 1);
            ui.waits = waitingTiles(ks, pl.melds.length);
          }
        }
        G.msg = 'Giliranmu.';
        act = await askHuman(ui);
        if (G.rec && act.type === 'discard') {
          const t = pl.hand.find(x => x.id === act.id);
          if (t) {
            const c = toCounts(kindsOf(pl)); c[t.k]--;
            G.rec.discard({ k: t.k, bestK: h.k, bestS: h.s, sAfter: shantenAll(c, pl.melds.length) });
            if (win && !win.insufficient) G.rec.missedTsumo({ fan: win.fan });
          }
        }
      }
      if (act.type === 'tsumo' && win && !win.insufficient) { callout(p, 'ZIMO!'); return { type: 'tsumo', score: win }; }
      if (act.type === 'kong') {
        doSelfKong(p, act.k);
        flags.heavenly = false;
        render(); await wait(500);
        const t = await drawTile(p, true);
        if (!t) return { type: 'exhausted' };
        flags.kongDraw = true; canWin = true;
        continue;
      }
      if (act.type === 'discard') return act;
    }
  }

  function doDiscard(p, id) {
    const pl = G.players[p];
    const i = pl.hand.findIndex(t => t.id === id);
    const t = pl.hand.splice(i, 1)[0];
    pl.discards.push(t); pl.drawn = null;
    G.lastDiscard = { p, id: t.id };
    log(`${pname(p)} membuang ${tileName(t.k)}.`);
    return t;
  }

  function chowOptions(pl, k) {
    if (k >= 27) return [];
    const c = toCounts(kindsOf(pl)), res = [];
    for (const s of [k - 2, k - 1, k]) {
      if (s < 0 || Math.floor(s / 9) !== Math.floor(k / 9) || s % 9 > 6) continue;
      const need = [s, s + 1, s + 2].filter(x => x !== k);
      if (need.every(x => c[x] >= 1)) res.push(s);
    }
    return res;
  }

  async function claimPhase(from, tile) {
    const opts = [];
    for (let i = 1; i <= 3; i++) {
      const p = (from + i) % 4, pl = G.players[p];
      const o = { p, i, win: null, short: null, pong: false, kong: false, chows: [] };
      const w = evalWin(p, tile, { selfDraw: false, lastTile: G.wall.length === 0 });
      if (w) { if (w.insufficient) o.short = w; else o.win = w; }
      if (G.wall.length > 0) {
        const n = pl.hand.filter(t => t.k === tile.k).length;
        o.pong = n >= 2; o.kong = n >= 3;
        if (i === 1) o.chows = chowOptions(pl, tile.k);
      }
      if (o.win || o.pong || o.kong || o.chows.length) opts.push(o);
      else if (o.short && !pl.isAI) log(`(Info) ${tileName(tile.k)} melengkapi tanganmu, tetapi baru ${o.short.fan} fan — minimal ${cfg.minFan} fan.`);
    }
    const decs = [];
    for (const o of opts) {
      const pl = G.players[o.p];
      let d;
      if (pl.isAI) d = AI.claim(o.p, tile, o);
      else {
        const ui = { mode: 'claim', tile, from, opt: o };
        const sug = AI.claim(o.p, tile, o, 'hard');
        if (cfg.hint) {
          const s = sug;
          ui.hint = s ? `Saran: <b>${s.type === 'win' ? 'Hu (menang)' : s.type === 'chow' ? 'Chow' : s.type === 'kong' ? 'Kong' : 'Pong'}</b>.` : 'Saran: lewati — klaim ini tidak mempercepat tanganmu.';
        }
        G.msg = `${pname(from)} membuang ${tileName(tile.k)}.`;
        d = await askHuman(ui);
        if (G.rec) G.rec.claim({ offered: o, suggestion: sug, decision: d, tileK: tile.k });
      }
      if (d) decs.push({ ...d, p: o.p, i: o.i, score: o.win });
    }
    const pickBy = types => decs.filter(d => types.includes(d.type)).sort((a, b) => a.i - b.i)[0];
    return pickBy(['win']) || pickBy(['pong', 'kong']) || pickBy(['chow']) || null;
  }

  function applyClaim(claim, from, tile) {
    const pl = G.players[claim.p];
    G.players[from].discards.pop();
    G.lastDiscard = null;
    const removeK = k => { const i = pl.hand.findIndex(t => t.k === k); pl.hand.splice(i, 1); };
    if (claim.type === 'chow') {
      [claim.s, claim.s + 1, claim.s + 2].filter(k => k !== tile.k).forEach(removeK);
      pl.melds.push({ type: 'chow', k: claim.s, concealed: false, claimed: tile.k });
      log(`${pname(claim.p)} Chow ${tileName(claim.s)}–${tileName(claim.s + 2).split(' ')[0]} (mengambil ${tileName(tile.k)}).`);
      callout(claim.p, 'CHOW!');
    } else if (claim.type === 'pong') {
      removeK(tile.k); removeK(tile.k);
      pl.melds.push({ type: 'pong', k: tile.k, concealed: false, claimed: tile.k });
      log(`${pname(claim.p)} Pong ${tileName(tile.k)}.`);
      callout(claim.p, 'PONG!');
    } else if (claim.type === 'kong') {
      removeK(tile.k); removeK(tile.k); removeK(tile.k);
      pl.melds.push({ type: 'kong', k: tile.k, concealed: false, claimed: tile.k });
      log(`${pname(claim.p)} Kong ${tileName(tile.k)} — mengambil kartu pengganti.`);
      callout(claim.p, 'KONG!');
    }
    pl.drawn = null;
    G.msg = `${pname(claim.p)} ${claim.type.toUpperCase()} ${tileName(tile.k)}.`;
    render();
  }

  function callout(p, text) {
    if (!G) return;
    FX.callout(text, G.players[p].name, $('#seat-' + p));
  }

  function askHuman(ui) {
    G.ui = ui; render();
    if (ui.mode === 'claim') FX.vibrate(ui.opt && ui.opt.win ? [80, 50, 80] : 120);
    else if (ui.win && !ui.win.insufficient) FX.vibrate([80, 50, 80]);
    return new Promise((resolve, reject) => {
      pending = { resolve: v => { pending = null; if (G) G.ui = null; resolve(v); render(); }, reject };
    });
  }

  /* ================= PENYELESAIAN & SKOR ================= */
  async function settle(res) {
    G.reveal = true; G.turn = -1; G.ui = null;
    const before = G.players.map(p => p.score);
    let stays;
    if (res.type === 'draw') {
      stays = true;
      log('Tembok habis — hand seri. Dealer tetap.');
    } else {
      const base = res.score.points, w = res.p;
      if (res.selfDraw) {
        for (let q = 0; q < 4; q++) if (q !== w) { G.players[q].score -= base; G.players[w].score += base; }
      } else {
        G.players[res.from].score -= base * 2; G.players[w].score += base * 2;
      }
      stays = w === G.dealer;
      log(`${pname(w)}: ${res.score.fan} fan = ${base} poin dasar.`);
    }
    res.delta = G.players.map((p, i) => p.score - before[i]);
    if (G.rec) {
      const r = mjnHandResult(res, 0), mine = r === 'win' || r === 'zimo';
      G.rec.endHand({ r, fan: mine ? res.score.fan : 0, pattern: mine ? res.score.pattern : '', items: mine ? res.score.items : [],
        delta: res.delta[0], k: r === 'dealin' && res.tile ? res.tile.k : null });
    }
    res.dealerStays = stays;
    render();
    await showResult(res);
    G.reveal = false;
    if (!stays) {
      G.dealer = (G.dealer + 1) % 4;
      if (G.dealer === G.firstDealer) {
        G.roundWind++;
        if (G.roundWind < 4) log(`Semua pemain sudah menjadi dealer — ronde berganti ke Angin ${WIND_ID[G.roundWind]}.`);
      }
      if (G.roundWind < 4) log(`Dealer berpindah ke ${pname(G.dealer)}.`);
    }
  }

  function groupHTML(ks, label, cls = 'sm', winK = null) {
    let marked = false;
    return `<div class="res-group"><div class="grp">${ks.map(k => { const w = !marked && k === winK; if (w) marked = true; return tileHTML(k, { cls: cls + (w ? ' win-t' : '') }); }).join('')}</div><small>${label}</small></div>`;
  }
  function winningHandHTML(res) {
    const pl = G.players[res.p], s = res.score;
    const winK = res.tile ? res.tile.k : (pl.hand.find(t => t.id === pl.drawn) || {}).k;
    let h = '';
    if (s.decomp) {
      s.decomp.sets.forEach(set => {
        const ks = set.kong ? [set.k, set.k, set.k, set.k] : set.type === 'chow' ? [set.k, set.k + 1, set.k + 2] : [set.k, set.k, set.k];
        const name = set.kong ? 'Kong' : set.type === 'chow' ? 'Chow' : 'Pong';
        h += groupHTML(ks, name + (set.open ? ' (terbuka)' : ''), 'sm', set.open ? null : winK);
      });
      h += groupHTML([s.decomp.pair, s.decomp.pair], 'Mata', 'sm', winK);
    } else {
      h += groupHTML(kindsOf(pl).sort((a, b) => a - b), s.pattern, 'sm', winK);
    }
    if (pl.flowers.length) h += groupHTML(pl.flowers.slice().sort((a, b) => a - b), 'Bunga/Musim', 'xs');
    return h;
  }
  function scoreTableHTML(res) {
    return `<table class="fan-table score-table"><thead><tr><th>Pemain</th><th>Angin</th><th>Perubahan</th><th>Skor</th></tr></thead><tbody>${G.players.map((p, i) => {
      const d = res.delta ? res.delta[i] : 0;
      return `<tr><td>${esc(p.name)}${i === G.dealer ? ' <small>(dealer)</small>' : ''}</td><td><span class="zh">${WIND_CH[seatWind(i)]}</span> ${WIND_ID[seatWind(i)]}</td><td class="${d > 0 ? 'plus' : d < 0 ? 'minus' : ''}">${d > 0 ? '+' : ''}${d}</td><td>${p.score}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  function showResult(res) {
    return new Promise((resolve, reject) => {
      let h = '';
      if (res.type === 'draw') {
        h = `<h2>Seri — tembok habis</h2><p>Tidak ada pemain yang menang. Dealer (${pname(G.dealer)}) tetap menjadi dealer pada hand berikutnya.</p>`;
      } else {
        const s = res.score;
        h = `<p class="eyebrow">Hand ${G.handNo} · Ronde Angin ${WIND_ID[G.roundWind]}</p><h2>🀄 ${pname(res.p)} menang! ${res.selfDraw ? '<small>(Zimo — ambil sendiri)</small>' : `<small>(dari buangan ${pname(res.from)})</small>`}</h2>`;
        h += `<div class="res-hand">${winningHandHTML(res)}</div>`;
        h += `<table class="fan-table"><thead><tr><th>Pola</th><th>Fan</th></tr></thead><tbody>${s.items.map(([n, f]) => `<tr><td>${n}</td><td>${f}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total${s.fan >= FAN_CAP ? ' (batas maksimal)' : ''}</td><td>${s.fan} fan</td></tr></tfoot></table>`;
        h += `<p>${s.fan} fan → <b>${s.points} poin dasar</b> (tabel poin). ${res.selfDraw ? `Zimo: setiap lawan membayar <b>${s.points}</b> (total ${s.points * 3}).` : `Menang dari buangan: pembuang membayar 2 × ${s.points} = <b>${s.points * 2}</b>.`}</p>`;
      }
      h += scoreTableHTML(res);
      const last = matchOver() || (!res.dealerStays && (G.dealer + 1) % 4 === G.firstDealer && (cfg.length === 'east' ? G.roundWind === 0 : G.roundWind === 3));
      h += `<p class="muted">${res.dealerStays ? 'Dealer menang atau seri → dealer tetap.' : 'Dealer tidak menang → posisi dealer berpindah ke pemain berikutnya (berlawanan arah jarum jam).'}</p>`;
      h += `<div class="modal-actions"><button class="btn big" id="res-ok">${last || cfg.length === 'one' ? 'Lihat hasil akhir' : 'Hand berikutnya →'}</button></div>`;
      openModal(h);
      const t = token; let done = false;
      const fin = () => { if (done) return; done = true; aborters.delete(ab); closeModal(); t === token ? resolve() : reject(ABORT); };
      const ab = () => { done = true; reject(ABORT); };
      aborters.add(ab);
      $('#res-ok').onclick = fin;
      if (cfg.mode === 'watch') setTimeout(fin, Math.max(3000, 7000 * (SPEED[cfg.speed] || 1)));
    });
  }

  function submitRecord(complete) {
    if (!G || !G.rec || G.recSent || !G.rec.handCount) return;
    G.recSent = true;
    const order = G.players.map((p, j) => ({ j, sc: p.score })).sort((a, b) => b.sc - a.sc);
    const rec = G.rec.finish({ rank: order.findIndex(o => o.j === 0) + 1, score: G.players[0].score, complete });
    if (typeof Account !== 'undefined') Account.submit(rec);
  }
  function showFinal() {
    submitRecord(true);
    const rank = G.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.score - a.score);
    const h = `<h2>🏆 Permainan selesai</h2><p>Juara: <b>${esc(rank[0].name)}</b> dengan ${rank[0].score} poin.</p>
      <table class="fan-table"><thead><tr><th>#</th><th>Pemain</th><th>Skor akhir</th></tr></thead><tbody>${rank.map((p, n) => `<tr><td>${n + 1}</td><td>${esc(p.name)}</td><td>${p.score} <small class="muted">(${p.score - 500 >= 0 ? '+' : ''}${p.score - 500})</small></td></tr>`).join('')}</tbody></table>
      <div class="modal-actions"><button class="btn ghost" id="fin-menu">Ke pengaturan</button><button class="btn big" id="fin-again">Main lagi</button></div>`;
    openModal(h);
    $('#fin-again').onclick = () => { closeModal(); start(cfg); };
    $('#fin-menu').onclick = () => { closeModal(); quit(); };
  }

  function openModal(h) { $('#modal-box').innerHTML = h; $('#modal').hidden = false; }
  function closeModal() { const m = $('#modal'); if (m) m.hidden = true; }

  /* ================= BOT AI ================= */
  function visibleCounts() {
    const v = new Array(34).fill(0);
    G.players.forEach(pl => {
      pl.discards.forEach(t => v[t.k]++);
      pl.melds.forEach(m => meldTiles(m).forEach(k => v[k]++));
    });
    return v;
  }
  function flushTarget(pl) {
    const ks = kindsOf(pl); pl.melds.forEach(m => ks.push(...meldTiles(m)));
    const per = [0, 0, 0]; let hon = 0;
    ks.forEach(k => k < 27 ? per[Math.floor(k / 9)]++ : hon++);
    const best = per.indexOf(Math.max(...per));
    if (pl.melds.some(m => m.k < 27 && Math.floor(m.k / 9) !== best)) return null;
    if (per[best] >= 7 && per[best] + hon >= ks.length - 3) return best;
    return null;
  }
  function fanEstimate(p, extraPongK) {
    const pl = G.players[p]; let f = 0;
    pl.melds.forEach(m => { if (m.type !== 'chow' && isValue(p, m.k)) f += (m.k === 27 + seatWind(p) && m.k === 27 + G.roundWind) ? 2 : 1; });
    const c = toCounts(kindsOf(pl));
    for (let k = 27; k < 34; k++) if (c[k] >= 3 && isValue(p, k)) f++;
    if (extraPongK != null && isValue(p, extraPongK)) f++;
    if (flushTarget(pl) != null) f += 3;
    return f;
  }
  function discardBias(p, k, c, fl) {
    let b = 0; const val = isValue(p, k);
    if (k >= 27) {
      if (c[k] === 1) b += val ? 0.6 : 2.2;
      if (c[k] >= 2 && val) b -= 4;
    } else {
      if (TK.isTerminal(k)) b += 0.6;
      if (fl != null && Math.floor(k / 9) !== fl) b += 6;
    }
    return b;
  }
  /* ---------- pertahanan (dipakai level Expert) ---------- */
  /** seberapa besar kemungkinan lawan q sudah Ting (0–1), dari Pong/Chow terbuka & sisa tembok */
  function threatOf(q) {
    const m = G.players[q].melds.filter(x => !x.concealed).length, w = G.wall.length;
    let t = m >= 3 ? .85 : m === 2 ? .45 : m === 1 ? .2 : .1;
    if (w < 40) t += .15;
    if (w < 20) t += .2;
    return Math.min(1, t);
  }
  /** suit yang sedang dikumpulkan lawan q (Flush terlihat dari meld terbuka), atau null */
  function openFlushSuit(q) {
    const ms = G.players[q].melds.filter(x => !x.concealed && x.k < 27);
    if (ms.length < 2) return null;
    const su = Math.floor(ms[0].k / 9);
    return ms.every(x => Math.floor(x.k / 9) === su) && G.players[q].melds.every(x => x.k >= 27 || Math.floor(x.k / 9) === su) ? su : null;
  }
  /** risiko membuang kartu k ke lawan q (≈0 aman … 1+ berbahaya) */
  function dangerTo(q, k, left) {
    if (left <= 0) return 0.05;                 // semua lembar sudah terlihat → hampir pasti aman
    let d;
    if (k >= 27) d = left === 1 ? .12 : left === 2 ? .45 : .7;
    else {
      const r = k % 9;
      d = r === 0 || r === 8 ? .55 : r === 1 || r === 7 ? .8 : 1;
      if (left === 1) d *= .6;
      const fs = openFlushSuit(q);
      if (fs != null) d *= Math.floor(k / 9) === fs ? 2 : .35;
    }
    if (G.players[q].discards.some(t => t.k === k)) d *= .45;   // lawan sendiri membuangnya → jarang ditunggu
    const ld = G.lastDiscard;
    if (ld && ld.p !== q && G.players[ld.p].discards.length && G.players[ld.p].discards[G.players[ld.p].discards.length - 1].k === k) d *= .7;  // baru saja lolos
    return d;
  }

  /* ---------- tingkat kesulitan bot ----------
     easy   : sering membuang asal, tidak menghitung peluang kartu, klaim sembarangan
     medium : mengejar Ting dengan benar, kadang keliru, jarang mengejar Flush
     hard   : bot standar (versi lama): hitung peluang kartu, bias kartu bernilai, kejar Flush
     expert : seperti hard + selalu kejar fan besar + membaca lawan & bertahan saat lawan Ting */
  const LEVELS = {
    easy: { label: 'Easy', ic: '🟢', sloppy: .5, ukeire: false, flush: 0, defense: false },
    medium: { label: 'Medium', ic: '🟡', sloppy: .12, ukeire: true, flush: .2, defense: false },
    hard: { label: 'Hard', ic: '🟠', sloppy: 0, ukeire: true, flush: .5, defense: false },
    expert: { label: 'Expert', ic: '🔴', sloppy: 0, ukeire: true, flush: 1, defense: true },
  };
  const lvOf = p => LEVELS[(G.players[p] && G.players[p].level) || 'hard'] || LEVELS.hard;
  const pick = a => a[rnd(a.length)];

  const AI = {
    /** pilih kartu yang dibuang. level: nama tingkat (default: tingkat pemain / 'hard' untuk saran manusia) */
    evalDiscard(p, level) {
      const pl = G.players[p], L = LEVELS[level] || lvOf(p);
      const c = toCounts(kindsOf(pl)), open = pl.melds.length, vis = visibleCounts();
      const fl = cfg.minFan >= 2 || Math.random() < L.flush ? flushTarget(pl) : null;
      const all = [...new Set(kindsOf(pl))].map(k => { c[k]--; const s = shantenAll(c, open); c[k]++; return { k, s }; });
      const minS = Math.min(...all.map(x => x.s));
      const choose = k => {
        const t = pl.hand.find(t => t.k === k && t.id === pl.drawn) || pl.hand.find(t => t.k === k);
        return { id: t.id, k, s: all.find(x => x.k === k).s };
      };
      // Easy/Medium kadang ceroboh: buang acak (Easy boleh sampai menjauhkan Ting)
      if (L.sloppy && Math.random() < L.sloppy) {
        const pool = all.filter(x => x.s <= minS + (L.ukeire ? 0 : 1));
        return choose(pick(pool).k);
      }
      // Expert bertahan: kartu yang menjauhkan Ting tetap dipertimbangkan bila lawan berbahaya
      const opps = L.defense ? [0, 1, 2, 3].filter(q => q !== p).map(q => ({ q, t: threatOf(q) })) : [];
      const maxT = opps.reduce((m, o) => Math.max(m, o.t), 0);
      const defend = L.defense && maxT >= .4;
      const cands = all.filter(x => x.s <= minS + (defend ? 1 : 0));
      for (const x of cands) {
        let u = 0;
        if (L.ukeire && x.s === minS) {
          c[x.k]--;
          for (let y = 0; y < 34; y++) {
            const left = 4 - c[y] - vis[y];
            if (left <= 0) continue;
            c[y]++;
            if (shantenAll(c, open) < x.s) u += left;
            c[y]--;
          }
          c[x.k]++;
        }
        x.u = u;
        x.score = (L.ukeire ? u : 0) + discardBias(p, x.k, c, fl) + (L.ukeire ? 0 : Math.random() * 2);
        if (defend) {
          const left = 4 - c[x.k] - vis[x.k];   // lembar yang belum terlihat dari sudut pandang bot
          const danger = opps.reduce((sum, o) => sum + o.t * dangerTo(o.q, x.k, left), 0);
          const w = minS <= 0 ? 5 : minS === 1 ? 14 : 34;       // makin jauh dari Ting → makin memilih aman
          x.score -= danger * w + (x.s - minS) * 14;
        }
      }
      cands.sort((a, b) => b.score - a.score);
      return choose(cands[0].k);
    },
    turn(p, win, kongs) {
      if (win && !win.insufficient) return { type: 'tsumo' };
      const pl = G.players[p], L = lvOf(p);
      if (L === LEVELS.easy && kongs.length) return { type: 'kong', k: kongs[0].k };   // Easy selalu Kong
      for (const o of kongs) {
        if (o.kind === 'add') return { type: 'kong', k: o.k };
        const c = toCounts(kindsOf(pl));
        const before = shantenAll(c, pl.melds.length);
        c[o.k] -= 4;
        if (shantenAll(c, pl.melds.length + 1) <= before) return { type: 'kong', k: o.k };
      }
      return { type: 'discard', id: AI.evalDiscard(p).id };
    },
    claim(p, tile, o, level) {
      if (o.win) return { type: 'win' };
      const L = LEVELS[level] || lvOf(p);
      if (L === LEVELS.easy) {                 // Easy: klaim karena “kelihatannya bagus”, tanpa menghitung fan
        if (o.kong) return { type: 'kong' };
        if (o.pong && Math.random() < .7) return { type: 'pong' };
        if (o.chows.length && Math.random() < .45) return { type: 'chow', s: pick(o.chows) };
        return null;
      }
      const pl = G.players[p], k = tile.k, open = pl.melds.length;
      const c = toCounts(kindsOf(pl));
      const cur = shantenAll(c, open);
      const val = isValue(p, k);
      const after = rm => {
        rm.forEach(x => c[x]--);
        let best = 99;
        for (let x = 0; x < 34; x++) if (c[x] > 0) { c[x]--; const s = shantenAll(c, open + 1); if (s < best) best = s; c[x]++; }
        rm.forEach(x => c[x]++);
        return best;
      };
      const fl = flushTarget(pl);
      const fits = fl == null || k >= 27 || Math.floor(k / 9) === fl;
      if (L.defense && cur >= 2 && [0, 1, 2, 3].some(q => q !== p && threatOf(q) >= .6)) return null;  // Expert: lawan hampir Hu, jangan buka tangan
      const okFan = extra => cfg.minFan === 0 || fanEstimate(p, extra) >= cfg.minFan;
      if (o.kong) {
        c[k] -= 3; const s = shantenAll(c, open + 1); c[k] += 3;
        if (s <= cur && fits && okFan(k)) return { type: 'kong' };
      }
      if (o.pong) {
        const s = after([k, k]);
        if (okFan(k) && fits && (s < cur || (val && s <= cur))) return { type: 'pong' };
      }
      if (o.chows.length && fits && okFan(null) && !(L.defense && cur >= 3 && open === 0)) {   // Expert: tangan jauh → tetap tertutup
        let best = null;
        for (const s0 of o.chows) {
          const rm = [s0, s0 + 1, s0 + 2]; rm.splice(rm.indexOf(k), 1);
          const s = after(rm);
          if (s < cur && (!best || s < best.s)) best = { s0, s };
        }
        if (best) return { type: 'chow', s: best.s0 };
      }
      return null;
    },
  };

  /* ================= TAMPILAN ================= */
  function syncTools() {
    $('#opt-hint').checked = !!cfg.hint;
    $('#opt-show').checked = !!cfg.showHands;
    $('#opt-speed').value = cfg.speed;
    $('#opt-hint').parentElement.hidden = cfg.mode === 'watch';
    $('#opt-show').parentElement.hidden = cfg.mode === 'watch';
  }

  function render() {
    if (!G) return;
    for (let p = 0; p < 4; p++) renderSeat(p);
    renderCenter(); renderActions(); renderInfo();
  }
  function renderInfo() {
    const lv = cfg.level === 'mix' ? '🎲 <b>Campuran</b>' : `${LEVELS[cfg.level].ic} <b>${LEVELS[cfg.level].label}</b>`;
    $('#game-info').innerHTML = `${cfg.mode === 'watch' ? '🤖 <b>Simulasi 4 bot</b>' : '🀄 <b>Main vs Mesin</b>'} · AI ${lv} · Minimal <b>${cfg.minFan}</b> fan · ${cfg.length === 'one' ? '1 hand' : cfg.length === 'east' ? '1 ronde angin' : '4 ronde angin'}`;
  }
  function renderSeat(p) {
    const pl = G.players[p], pos = POS[p], el = $('#seat-' + p), sw = seatWind(p);
    const human = !pl.isAI;
    const reveal = human || cfg.showHands || cfg.mode === 'watch' || G.reveal;
    const side = pos === 'left' || pos === 'right';
    el.className = `seat ${SLOT[p]} pos-${pos}${G.turn === p ? ' active' : ''}`;

    const info = `<div class="seat-info"><span class="wind-badge w${sw}" title="Angin kursi: ${WIND_ID[sw]}">${WIND_CH[sw]}</span><span class="who"><b>${esc(pl.name)}</b><small>${WIND_ID[sw]}${p === G.dealer ? ' · Dealer' : ''}${pl.level ? ` · <span class="lv-tag lv-${pl.level}" title="Tingkat AI">${LEVELS[pl.level].label}</span>` : ''}</small></span><span class="pts" title="Skor">${pl.score}</span><span class="cnt">${pl.hand.length} kartu</span>${pl.flowers.length ? `<span class="flw">${pl.flowers.map(k => tileHTML(k, { cls: 'xxs' })).join('')}</span>` : ''}</div>`;

    const sorted = pl.hand.slice().sort(sortT);
    let drawnT = null;
    if (pl.drawn != null) { const i = sorted.findIndex(t => t.id === pl.drawn); if (i >= 0) drawnT = sorted.splice(i, 1)[0]; }
    const list = drawnT ? [...sorted, drawnT] : sorted;
    let hand;
    if (human) {
      const ui = G.ui && G.ui.mode === 'turn' ? G.ui : null;
      hand = list.map(t => tileHTML(t.k, { id: t.id, cls: `lg${t === drawnT ? ' drawn' : ''}${ui ? ' clickable' : ''}${ui && ui.selected === t.id ? ' sel' : ''}${ui && cfg.hint && ui.hintId === t.id ? ' hint' : ''}` })).join('');
    } else if (reveal) {
      hand = list.map(t => tileHTML(t.k, { cls: (side ? 'xs' : 'sm') + (t === drawnT ? ' drawn' : '') })).join('');
    } else {
      hand = list.map(() => backHTML(side ? 'sm slat' : 'sm')).join('');
    }
    const msz = human ? 'md' : 'xs';
    const melds = pl.melds.map(m => `<div class="meld" title="${m.type}">${meldTiles(m).map((k, i) => (m.type === 'kong' && m.concealed && (i === 0 || i === 3)) ? backHTML(msz) : tileHTML(k, { cls: msz })).join('')}</div>`).join('');
    const ld = G.lastDiscard;
    const dis = pl.discards.map(t => tileHTML(t.k, { cls: 'xs' + (ld && ld.id === t.id ? ' last' : '') })).join('');

    const H = `<div class="seat-hand">${hand}</div>`, M = `<div class="seat-melds">${melds}</div>`, D = `<div class="seat-discards">${dis}</div>`;
    let html;
    if (pos === 'top') html = info + `<div class="seat-row">${H}${M}</div>` + D;
    else if (pos === 'bottom') html = D + `<div class="seat-row">${H}${M}</div>` + info;
    else if (pos === 'left') html = info + M + `<div class="seat-row">${H}${D}</div>`;
    else html = info + M + `<div class="seat-row">${D}${H}</div>`;
    el.innerHTML = html;
  }
  function renderCenter() {
    $('#center').innerHTML = `<div class="c-round"><span class="c-wind">${WIND_CH[Math.min(G.roundWind, 3)]}</span><div><b>Ronde Angin ${WIND_ID[Math.min(G.roundWind, 3)]}</b><small>Hand ke-${G.handNo} · Dealer: ${pname(G.dealer)}</small></div></div>
      <div class="c-wall">Sisa tembok: <b>${G.wall.length}</b></div>
      ${G.dice ? `<div class="c-dice" title="Dadu pemecah tembok">${G.dice.map(dieCh).join('')}</div>` : ''}
      <div class="c-msg">${G.msg || ''}</div>`;
  }
  function renderActions() {
    const bar = $('#action-bar'), ui = G.ui;
    bar.classList.toggle('alert-turn', !!ui && ui.mode === 'turn');
    bar.classList.toggle('alert-claim', !!ui && ui.mode === 'claim');
    if (!ui) {
      const t = G.turn >= 0 ? G.players[G.turn] : null;
      bar.innerHTML = t ? `<div class="ab-msg">Giliran: <b>${esc(t.name)}</b>${t.isAI ? ' — sedang berpikir…' : ''}</div>` : '';
      return;
    }
    let h = '';
    if (ui.mode === 'turn') {
      h += `<div class="ab-msg"><b>Giliranmu</b> — ketuk kartu untuk memilih, ketuk lagi untuk membuang.</div><div class="ab-btns">`;
      if (ui.win && !ui.win.insufficient) h += `<button class="btn win" data-act="tsumo">🀄 Zimo! Menang (${ui.win.fan} fan)</button>`;
      ui.kongs.forEach(o => { h += `<button class="btn jade" data-act="kong" data-k="${o.k}">Kong ${tileHTML(o.k, { cls: 'xxs' })}</button>`; });
      if (ui.selected != null) {
        const t = G.players[0].hand.find(t => t.id === ui.selected);
        if (t) h += `<button class="btn" data-act="discard">Buang ${tileName(t.k)}</button>`;
      }
      h += '</div>';
      if (ui.win && ui.win.insufficient) h += `<div class="ab-hint warn">Tanganmu sudah lengkap, tetapi baru ${ui.win.fan} fan (minimal ${cfg.minFan}).</div>`;
      if (cfg.hint && ui.hintK != null && !(ui.win && !ui.win.insufficient)) {
        h += `<div class="ab-hint">💡 Saran: buang <b>${tileName(ui.hintK)}</b>. ${ui.hintS <= 0
          ? `Kamu akan <b>Ting</b> (tinggal 1 kartu lagi untuk menang)${ui.waits && ui.waits.length ? ' — menunggu: ' + ui.waits.map(k => tileHTML(k, { cls: 'xxs' })).join('') : ''}`
          : `Setelah itu masih butuh <b>${ui.hintS}</b> kartu yang tepat sebelum Ting.`}</div>`;
      }
    } else if (ui.mode === 'claim') {
      const o = ui.opt;
      h += `<div class="ab-msg">${pname(ui.from)} membuang ${tileHTML(ui.tile.k, { cls: 'sm' })} <b>${tileName(ui.tile.k)}</b> — ambil?</div><div class="ab-btns">`;
      if (o.win) h += `<button class="btn win" data-act="win">🀄 Hu! Menang (${o.win.fan} fan)</button>`;
      if (o.kong) h += `<button class="btn jade" data-act="kongc">Kong</button>`;
      if (o.pong) h += `<button class="btn jade" data-act="pong">Pong</button>`;
      o.chows.forEach(s => { h += `<button class="btn jade" data-act="chow" data-s="${s}">Chow ${[s, s + 1, s + 2].map(k => tileHTML(k, { cls: 'xxs' })).join('')}</button>`; });
      h += `<button class="btn ghost" data-act="pass" style="color:#fff;border-color:rgba(255,255,255,.4)">Lewati</button></div>`;
      if (o.short) h += `<div class="ab-hint warn">Kartu ini melengkapi tanganmu, tetapi baru ${o.short.fan} fan (minimal ${cfg.minFan}).</div>`;
      if (cfg.hint && ui.hint) h += `<div class="ab-hint">💡 ${ui.hint}</div>`;
    }
    bar.innerHTML = h;
  }
  function renderLog() {
    const el = $('#log');
    if (!el || el.hidden || !G) return;
    el.innerHTML = G.log.map(l => `<div>${l}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }

  function quit() {
    submitRecord(false);
    stop();
    $('#game').hidden = true; $('#setup').hidden = false;
  }

  function init() {
    $('#action-bar').addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b || !pending || !G || !G.ui) return;
      const a = b.dataset.act, ui = G.ui;
      if (ui.mode === 'turn') {
        if (a === 'tsumo') pending.resolve({ type: 'tsumo' });
        else if (a === 'kong') pending.resolve({ type: 'kong', k: +b.dataset.k });
        else if (a === 'discard' && ui.selected != null) pending.resolve({ type: 'discard', id: ui.selected });
      } else if (ui.mode === 'claim') {
        if (a === 'win') pending.resolve({ type: 'win' });
        else if (a === 'pong') pending.resolve({ type: 'pong' });
        else if (a === 'kongc') pending.resolve({ type: 'kong' });
        else if (a === 'chow') pending.resolve({ type: 'chow', s: +b.dataset.s });
        else if (a === 'pass') pending.resolve(null);
      }
    });
    $('#seat-0').addEventListener('click', e => {
      const t = e.target.closest('.tile[data-id]');
      if (!t || !G || !G.ui || G.ui.mode !== 'turn' || !pending) return;
      const id = +t.dataset.id;
      if (G.ui.selected === id) pending.resolve({ type: 'discard', id });
      else { G.ui.selected = id; render(); }
    });
    $('#opt-hint').addEventListener('change', e => { if (cfg) { cfg.hint = e.target.checked; render(); } });
    $('#opt-show').addEventListener('change', e => { if (cfg) { cfg.showHands = e.target.checked; render(); } });
    $('#opt-speed').addEventListener('change', e => { if (cfg) cfg.speed = e.target.value; });
    $('#btn-log').addEventListener('click', () => { const l = $('#log'); l.hidden = !l.hidden; renderLog(); });
    $('#btn-quit').addEventListener('click', async () => {
      if (!G || await FX.ask('Keluar dari permainan?', { text: 'Permainan yang sedang berjalan akan dihentikan.', yes: 'Keluar', no: 'Lanjut main' })) quit();
    });
  }

  return { init, start, stop, quit, isRunning, mode, LEVELS };
})();
