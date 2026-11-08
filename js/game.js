/* game.js — mesin permainan mahjong (Hong Kong · Taiwan 16 kartu · Jepang/Riichi, lihat js/variants.js) + bot AI + tampilan meja */
const Game = (() => {
  const ABORT = { abort: true };
  const POS = ['bottom', 'right', 'top', 'left'];
  const SLOT = ['slot-me', 'slot-right', 'slot-top', 'slot-left'];
  const SPEED = { lambat: 1.7, normal: 1, cepat: .45, kilat: .12 };
  let G = null, cfg = null, token = 0, V = MJN_VARIANTS.hk;
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
    cfg = Object.assign({ mode: 'play', name: 'Kamu', minFan: 1, speed: 'normal', hint: true, showHands: false, length: 'east', level: 'medium', variant: 'hk' }, config);
    V = MJN_VARIANTS[cfg.variant] || MJN_VARIANTS.hk;
    cfg.variant = V.id;
    if (V.id !== 'hk') cfg.minFan = V.defaultMin;
    const watch = cfg.mode === 'watch';
    if (!LEVELS[cfg.level] && cfg.level !== 'mix') cfg.level = 'medium';
    const names = watch ? ['Bot Ani', 'Bot Budi', 'Bot Citra', 'Bot Dedi'] : [cfg.name || 'Kamu', 'Bot Budi', 'Bot Citra', 'Bot Dedi'];
    // campuran: tiap bot beda tingkat (simulasi: Easy, Medium, Hard, Expert · main: Medium, Hard, Expert)
    const MIX = watch ? ['easy', 'medium', 'hard', 'expert'] : [null, 'medium', 'hard', 'expert'];
    G = {
      players: names.map((n, i) => ({
        name: n, isAI: watch || i > 0, level: (watch || i > 0) ? (cfg.level === 'mix' ? MIX[i] : cfg.level) : null,
        score: V.startScore, hand: [], melds: [], flowers: [], discards: [], drawn: null,
      })),
      dealer: 0, firstDealer: 0, roundWind: 0, handNo: 0, wall: [], turn: -1, log: [], msg: '', dice: null,
      ui: null, reveal: false, lastDiscard: null, callout: null, hist: [],
      honba: 0, sticks: 0, renchan: 0, doraInd: [], uraInd: [], doraHidden: [], rinshan: null,
    };
    // rekam sesi pemain (disimpan ke akun jika login)
    G.rec = !watch && typeof MjnRecorder !== 'undefined'
      ? new MjnRecorder({ mode: 'bot', minFan: cfg.minFan, length: cfg.length, opponents: names.slice(1), level: cfg.level, variant: V.id }) : null;
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
    if (V.id === 'jp' && G.players.some(p => p.score < 0)) return true;      // Riichi: ada yang bangkrut (tobi)
    if (cfg.length === 'east') return G.roundWind >= 1;
    return G.roundWind >= (V.id === 'jp' ? 2 : 4);                            // Riichi: hanchan = Timur + Selatan
  }
  const handSize = () => V.sets * 3 + 1;                                     // 13 (HK/Riichi) atau 16 (Taiwan)

  async function playHand() {
    G.handNo++;
    for (const pl of G.players) {
      pl.hand = []; pl.melds = []; pl.flowers = []; pl.discards = []; pl.drawn = null;
      pl.riichi = false; pl.ippatsu = false; pl.doubleRiichi = false; pl.tempFuriten = false; pl.riichiFuriten = false; pl.redMelded = 0;
    }
    AI.newHand();
    G.lastDiscard = null; G.turn = G.dealer; G.ui = null; G.reveal = false; G.firstGo = true;
    const tiles = shuffle(mjnMakeTiles(V));
    G.rinshan = null; G.doraInd = []; G.uraInd = []; G.doraHidden = [];
    if (V.deadWall) {                            // Riichi: dead wall 14 = 4 pengganti Kong + 5 indikator dora + 5 ura-dora
      const dead = tiles.splice(-V.deadWall);
      G.rinshan = dead.slice(0, 4); G.doraInd = [dead[4]]; G.doraHidden = dead.slice(5, 9); G.uraInd = dead.slice(9, 14);
    }
    G.wall = tiles;
    log(`— Hand ${G.handNo} · Ronde Angin ${WIND_ID[G.roundWind]} · Dealer: ${pname(G.dealer)} —`);
    G.dice = [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)];
    const tot = sum(G.dice);
    const wallOwner = (G.dealer + tot - 1) % 4;
    G.msg = `Kartu dikocok &amp; tembok disusun. Dealer melempar dadu = <b>${tot}</b>, tembok di depan ${pname(wallOwner)} dipecah.`;
    log(`Dadu ${G.dice.join('+')} = ${tot}: hitung dari dealer berlawanan arah jarum jam → tembok ${pname(wallOwner)}; hitung ${tot} tumpukan dari kanan lalu mulai mengambil.`);
    render(); await wait(1200);

    // bagi 4 kartu bergiliran (3× untuk 13 kartu, 4× untuk Taiwan 16 kartu), lalu sisa 1 tiap pemain, dealer +1
    const n = handSize(), rounds = Math.floor(n / 4), rest = n - rounds * 4;
    for (let r = 0; r < rounds; r++) for (let i = 0; i < 4; i++) {
      const p = (G.dealer + i) % 4;
      for (let j = 0; j < 4; j++) G.players[p].hand.push(G.wall.shift());
      render(); await wait(90);
    }
    for (let r = 0; r < rest; r++) for (let i = 0; i < 4; i++) G.players[(G.dealer + i) % 4].hand.push(G.wall.shift());
    const extra = G.wall.shift();
    G.players[G.dealer].hand.push(extra);
    G.players[G.dealer].drawn = extra.id;
    G.msg = `Kartu dibagikan: dealer ${n + 1} kartu, pemain lain ${n}.`;
    log(`Kartu dibagikan: ${Array(rounds).fill(4).join('-')}${rest ? ' lalu 1' : ''} kartu tiap pemain; dealer mengambil 1 kartu tambahan (${n + 1} kartu).`);
    if (V.id === 'jp') log(`Indikator dora: ${tileName(G.doraInd[0].k)} → dora: <b>${tileName(V.doraNext(G.doraInd[0].k))}</b>.`);
    render(); await wait(600);

    if (V.flowers) for (let i = 0; i < 4; i++) await replaceInitialFlowers((G.dealer + i) % 4);
    if (V.flowers) { // ringkasan bunga awal (dibuka di depan masing-masing pemain)
      const got = G.players.map((pl, i) => pl.flowers.length ? `${pname(i)} ${pl.flowers.length}` : null).filter(Boolean);
      if (got.length) { G.msg = `🌸 Bunga dibuka: ${got.join(' · ')}`; render(); await wait(900); }
    }
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

  const flowerNote = (p, k) => (isOwnFlower(k, seatWind(p)) ? ' (bunga kursi sendiri, +1 fan)' : '');
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
      log(`${pname(p)} membuka ${tileName(f.k)}${flowerNote(p, f.k)} dan mengambil pengganti dari ujung belakang tembok.`);
      G.msg = `${pname(p)} membuka <b>${tileName(f.k)}</b> dan mengambil kartu pengganti.`;
      render(); await wait(420);
    }
  }

  async function drawTile(p, fromBack) {
    const pl = G.players[p];
    let t;
    if (fromBack && G.rinshan) {               // Riichi: pengganti Kong dari dead wall + buka indikator dora baru
      t = G.rinshan.pop();
      if (G.wall.length) G.wall.pop();          // dead wall tetap 14 kartu
      if (G.doraHidden.length) { const d = G.doraHidden.shift(); G.doraInd.push(d); log(`Kan dora baru: indikator ${tileName(d.k)} → dora ${tileName(V.doraNext(d.k))}.`); }
    } else t = fromBack ? G.wall.pop() : G.wall.shift();
    while (V.flowers && t && t.k >= 34) {
      pl.flowers.push(t.k);
      log(`${pname(p)} mendapat ${tileName(t.k)}${flowerNote(p, t.k)} → dibuka di depan, ambil pengganti dari ujung belakang tembok.`);
      G.msg = `${pname(p)} mendapat <b>${tileName(t.k)}</b> — dibuka, lalu mengambil kartu pengganti.`;
      callout(p, 'BUNGA!');
      render(); await wait(700);
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
    const drawnT = tile || pl.hand.find(t => t.id === pl.drawn);
    const red = pl.hand.filter(t => t.red).length + (tile && tile.red ? 1 : 0) + (pl.redMelded || 0);
    const s = V.score({
      concealed: kinds, melds: pl.melds, flowers: pl.flowers, seatWind: seatWind(p), roundWind: G.roundWind,
      selfDraw: !!flags.selfDraw, lastTile: !!flags.lastTile, kongDraw: !!flags.kongDraw, heavenly: !!flags.heavenly,
      winTile: drawnT ? drawnT.k : null, red, riichi: !!pl.riichi, ippatsu: !!pl.ippatsu, doubleRiichi: !!pl.doubleRiichi,
      doraInd: G.doraInd.map(t => t.k), uraInd: G.uraInd.slice(0, G.doraInd.length).map(t => t.k),
    });
    if (!s) return null;
    const why = V.insufficient(s, cfg);
    if (why) { s.insufficient = true; s.reason = why; }
    return s;
  }
  /** Riichi: Ting dengan tangan tertutup → kartu mana saja yang boleh dibuang sambil deklarasi riichi */
  function riichiOptions(p) {
    const pl = G.players[p];
    if (V.id !== 'jp' || pl.riichi || pl.melds.some(m => !m.concealed) || G.wall.length < 4 || pl.score < 1000) return [];
    const c = toCounts(kindsOf(pl)), ok = new Set();
    for (const k of new Set(kindsOf(pl))) { c[k]--; if (shantenAll(c, pl.melds.length, 4) === 0) ok.add(k); c[k]++; }
    return pl.hand.filter(t => ok.has(t.k)).map(t => t.id);
  }
  /** Riichi: furiten — salah satu kartu tunggu pernah dibuang sendiri, atau baru saja melewatkan Ron */
  function isFuriten(p) {
    const pl = G.players[p];
    if (V.id !== 'jp') return false;
    if (pl.tempFuriten || pl.riichiFuriten) return true;
    const waits = waitingTiles(kindsOf(pl), pl.melds.length, 4);
    return waits.some(k => (pl.discardKinds || []).includes(k));
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
    pl.redMelded += pl.hand.filter(t => t.k === k && t.red).length;
    G.players.forEach(x => { x.ippatsu = false; });
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
      const kongs = canWin && G.wall.length > 0 && !pl.riichi ? selfKongOptions(pl) : [];
      let act;
      if (pl.riichi) {                           // Riichi: setelah deklarasi, kartu ambilan langsung dibuang kecuali bisa Tsumo
        const canTsumo = win && !win.insufficient;
        if (pl.isAI || !canTsumo) { render(); await wait(pl.isAI ? 520 : 650); act = canTsumo ? { type: 'tsumo' } : { type: 'discard', id: pl.drawn != null ? pl.drawn : pl.hand[pl.hand.length - 1].id }; }
        else { G.msg = 'Riichi — kartu ini membuatmu menang!'; act = await askHuman({ mode: 'turn', win, kongs: [], selected: null, riichiLock: true }); if (act.type !== 'tsumo') act = { type: 'discard', id: pl.drawn }; }
      } else if (pl.isAI) {
        render();
        await wait(560);
        act = AI.turn(p, win, kongs);
        if (act.type === 'discard') {
          const ro = riichiOptions(p);
          if (ro.includes(act.id) && AI.wantRiichi(p)) act.riichi = true;
        }
      } else {
        const ui = { mode: 'turn', win, kongs, selected: null, riichiIds: riichiOptions(p), riichiMode: false };
        const h = AI.evalDiscard(p, 'hard');
        if (cfg.hint) {
          ui.hintId = h.id; ui.hintK = h.k; ui.hintS = h.s;
          if (h.s === 0) {
            const ks = kindsOf(pl); ks.splice(ks.indexOf(h.k), 1);
            ui.waits = waitingTiles(ks, pl.melds.length, V.sets);
          }
        }
        G.msg = 'Giliranmu.';
        act = await askHuman(ui);
        if (G.rec && act.type === 'discard') {
          const t = pl.hand.find(x => x.id === act.id);
          if (t) {
            const c = toCounts(kindsOf(pl)); c[t.k]--;
            G.rec.discard({ k: t.k, bestK: h.k, bestS: h.s, sAfter: shantenAll(c, pl.melds.length, V.sets) });
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
      if (act.type === 'discard') {
        if (act.riichi) declareRiichi(p);
        return act;
      }
    }
  }
  function declareRiichi(p) {
    const pl = G.players[p];
    pl.riichi = true; pl.ippatsu = true; pl.riichiPending = true;
    pl.doubleRiichi = G.firstGo && pl.discards.length === 0;
    pl.score -= 1000; G.sticks++;
    log(`${pname(p)} menyatakan <b>Riichi</b>${pl.doubleRiichi ? ' (double riichi)' : ''} — membayar tongkat 1000 poin.`);
    callout(p, 'RIICHI!');
  }

  function doDiscard(p, id) {
    const pl = G.players[p];
    const i = pl.hand.findIndex(t => t.id === id);
    const t = pl.hand.splice(i, 1)[0];
    if (pl.riichiPending) { t.riichi = true; pl.riichiPending = false; }      // buangan riichi diletakkan menyamping
    else if (pl.riichi) pl.ippatsu = false;                                   // ippatsu hanya sampai giliran berikutnya
    if (!pl.riichi) pl.tempFuriten = false;                                   // furiten sementara berakhir saat membuang
    if (pl.discards.length >= 0 && p === (G.dealer + 3) % 4) G.firstGo = false;
    pl.discards.push(t); pl.drawn = null;
    G.lastDiscard = { p, id: t.id };
    AI.noteDiscard(p, t.k);                     // riwayat buangan untuk AI Expert
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
      if (w) { if (w.insufficient) o.short = w; else if (isFuriten(p)) o.furiten = w; else o.win = w; }
      if (o.furiten && !pl.isAI) log(`(Info) ${tileName(tile.k)} melengkapi tanganmu, tetapi kamu <b>furiten</b> — tidak boleh Ron (hanya Tsumo).`);
      if (G.wall.length > 0 && !pl.riichi) {
        const n = pl.hand.filter(t => t.k === tile.k).length;
        o.pong = n >= 2; o.kong = n >= 3;
        if (i === 1) o.chows = chowOptions(pl, tile.k);
      }
      if (o.win || o.pong || o.kong || o.chows.length) opts.push(o);
      else if (o.short && !pl.isAI) log(`(Info) ${tileName(tile.k)} melengkapi tanganmu, tetapi ${o.short.reason}.`);
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
      if (o.win && (!d || d.type !== 'win')) {     // Riichi: melewatkan Ron → furiten
        pl.tempFuriten = true; if (pl.riichi) pl.riichiFuriten = true;
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
    const removeK = k => { const i = pl.hand.findIndex(t => t.k === k); if (pl.hand[i].red) pl.redMelded++; pl.hand.splice(i, 1); };
    if (tile.red) pl.redMelded++;
    G.players.forEach(x => { x.ippatsu = false; });
    G.firstGo = false;
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
    let r;
    if (res.type === 'draw') {
      res.tenpai = V.id === 'jp' ? G.players.map(pl => shantenAll(toCounts(kindsOf(pl)), pl.melds.length, 4) === 0) : null;
      r = V.draw(G, res.tenpai);
    } else {
      r = V.pay(G, res);
      if (r.sticksTaken) G.sticks = 0;
    }
    r.delta.forEach((d, q) => { G.players[q].score += d; });
    const stays = r.stays;
    res.note = r.note;
    log(res.type === 'draw' ? r.note : `${pname(res.p)}: ${r.note.replace(/<[^>]+>/g, '')}`);
    if (V.id === 'jp') G.honba = stays || res.type === 'draw' ? G.honba + 1 : 0;
    G.renchan = stays ? G.renchan + 1 : 0;
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
        h = `<h2>Seri — tembok habis</h2><p>Tidak ada pemain yang menang. ${res.note}</p>${res.tenpai ? `<p>Ting: ${G.players.map((p, i) => `${esc(p.name)} ${res.tenpai[i] ? '✅' : '—'}`).join(' · ')}</p>` : ''}<p>${res.dealerStays ? `Dealer (${pname(G.dealer)}) tetap menjadi dealer.` : 'Dealer berpindah.'}</p>`;
      } else {
        const s = res.score;
        h = `<p class="eyebrow">Hand ${G.handNo} · Ronde Angin ${WIND_ID[G.roundWind]}</p><h2>🀄 ${pname(res.p)} menang! ${res.selfDraw ? '<small>(Zimo — ambil sendiri)</small>' : `<small>(dari buangan ${pname(res.from)})</small>`}</h2>`;
        h += `<div class="res-hand">${winningHandHTML(res)}</div>`;
        const U = V.unit === 'han' ? 'Han' : V.unit === 'tai' ? 'Tai' : 'Fan';
        const tot = V.id === 'jp' ? (s.yakuman ? s.limit : `${s.han} han · ${s.fu} fu${s.limit ? ' · ' + s.limit : ''}`) : `${s.value} ${V.unit}${V.id === 'hk' && s.fan >= FAN_CAP ? ' (batas maksimal)' : ''}`;
        h += `<table class="fan-table"><thead><tr><th>${V.id === 'jp' ? 'Yaku' : 'Pola'}</th><th>${U}</th></tr></thead><tbody>${s.items.map(([n, f]) => `<tr><td>${n}</td><td>${f}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td>${tot}</td></tr></tfoot></table>`;
        if (V.id === 'jp') h += `<p class="muted">Indikator dora: ${G.doraInd.map(t => tileHTML(t.k, { cls: 'xs' })).join('')}${G.players[res.p].riichi ? ` · ura-dora: ${G.uraInd.slice(0, G.doraInd.length).map(t => tileHTML(t.k, { cls: 'xs' })).join('')}` : ''}</p>`;
        h += `<p>${res.note}</p>`;
      }
      h += scoreTableHTML(res);
      const last = matchOver() || (!res.dealerStays && (G.dealer + 1) % 4 === G.firstDealer && (cfg.length === 'east' ? G.roundWind === 0 : G.roundWind === (V.id === 'jp' ? 1 : 3)));
      h += `<p class="muted">${res.dealerStays ? (V.id === 'jp' ? 'Dealer menang atau Ting saat seri → dealer tetap (honba +1).' : 'Dealer menang atau seri → dealer tetap.') : 'Dealer tidak menang → posisi dealer berpindah ke pemain berikutnya (berlawanan arah jarum jam).'}</p>`;
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
      <table class="fan-table"><thead><tr><th>#</th><th>Pemain</th><th>Skor akhir</th></tr></thead><tbody>${rank.map((p, n) => `<tr><td>${n + 1}</td><td>${esc(p.name)}</td><td>${p.score} <small class="muted">(${p.score - V.startScore >= 0 ? '+' : ''}${p.score - V.startScore})</small></td></tr>`).join('')}</tbody></table>
      <div class="modal-actions"><button class="btn ghost" id="fin-menu">Ke pengaturan</button><button class="btn big" id="fin-again">Main lagi</button></div>`;
    openModal(h);
    $('#fin-again').onclick = () => { closeModal(); start(cfg); };
    $('#fin-menu').onclick = () => { closeModal(); quit(); };
  }

  function openModal(h) { $('#modal-box').innerHTML = h; $('#modal').hidden = false; }
  function closeModal() { const m = $('#modal'); if (m) m.hidden = true; }

  /* ================= BOT AI (js/ai.js) ================= */
  const AI = createMjnAI({
    state: () => ({ players: G.players, wallLeft: G.wall.length, roundWind: G.roundWind, hist: G.hist }),
    minFan: () => (V.id === 'hk' ? cfg.minFan : 0),
    seatWind: p => seatWind(p),
    levelOf: p => G.players[p].level || 'hard',
    sets: () => V.sets,
    variant: () => V.id,
  });
  const LEVELS = AI.LEVELS;

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
    const rule = V.id === 'hk' ? `Minimal <b>${cfg.minFan}</b> fan` : V.id === 'tw' ? '16 kartu · tai' : 'Wajib yaku';
    const len = cfg.length === 'one' ? '1 hand' : cfg.length === 'east' ? (V.id === 'jp' ? 'Tonpuusen (Timur)' : '1 ronde angin') : (V.id === 'jp' ? 'Hanchan (Timur+Selatan)' : '4 ronde angin');
    $('#game-info').innerHTML = `${cfg.mode === 'watch' ? '🤖 <b>Simulasi 4 bot</b>' : '🀄 <b>Main vs Mesin</b>'} · <b>${V.name}</b> · AI ${lv} · ${rule} · ${len}`;
  }
  function renderSeat(p) {
    const pl = G.players[p], pos = POS[p], el = $('#seat-' + p), sw = seatWind(p);
    const human = !pl.isAI;
    const reveal = human || cfg.showHands || cfg.mode === 'watch' || G.reveal;
    const side = pos === 'left' || pos === 'right';
    el.className = `seat ${SLOT[p]} pos-${pos}${G.turn === p ? ' active' : ''}`;

    const info = `<div class="seat-info"><span class="wind-badge w${sw}" title="Angin kursi: ${WIND_ID[sw]}">${WIND_CH[sw]}</span><span class="who"><b>${esc(pl.name)}</b><small>${WIND_ID[sw]}${p === G.dealer ? ' · Dealer' : ''}${pl.level ? ` · <span class="lv-tag lv-${pl.level}" title="Tingkat AI">${LEVELS[pl.level].label}</span>` : ''}${pl.riichi ? ' · <span class="riichi-tag" title="Sudah menyatakan riichi">RIICHI</span>' : ''}</small></span><span class="pts" title="Skor">${pl.score}</span><span class="cnt">${pl.hand.length} kartu</span></div>`;

    const sorted = pl.hand.slice().sort(sortT);
    let drawnT = null;
    if (pl.drawn != null) { const i = sorted.findIndex(t => t.id === pl.drawn); if (i >= 0) drawnT = sorted.splice(i, 1)[0]; }
    const list = drawnT ? [...sorted, drawnT] : sorted;
    let hand;
    if (human) {
      const ui = G.ui && G.ui.mode === 'turn' ? G.ui : null;
      const rOK = ui && ui.riichiMode ? new Set(ui.riichiIds) : null;
      hand = list.map(t => tileHTML(t.k, { id: t.id, cls: `lg${t === drawnT ? ' drawn' : ''}${t.red ? ' red5' : ''}${ui ? ' clickable' : ''}${ui && ui.selected === t.id ? ' sel' : ''}${ui && cfg.hint && ui.hintId === t.id ? ' hint' : ''}${rOK && !rOK.has(t.id) ? ' dim' : ''}` })).join('');
    } else if (reveal) {
      hand = list.map(t => tileHTML(t.k, { cls: (side ? 'xs' : 'sm') + (t === drawnT ? ' drawn' : '') + (t.red ? ' red5' : '') })).join('');
    } else {
      hand = list.map(() => backHTML(side ? 'sm slat' : 'sm')).join('');
    }
    const msz = human ? 'md' : 'xs';
    const melds = flowersHTML(pl.flowers, msz, sw) + pl.melds.map(m => `<div class="meld" title="${m.type}">${meldTiles(m).map((k, i) => (m.type === 'kong' && m.concealed && (i === 0 || i === 3)) ? backHTML(msz) : tileHTML(k, { cls: msz })).join('')}</div>`).join('');
    const ld = G.lastDiscard;
    const dis = pl.discards.map(t => tileHTML(t.k, { cls: 'xs' + (ld && ld.id === t.id ? ' last' : '') + (t.red ? ' red5' : '') + (t.riichi ? ' riichi-t' : '') })).join('');

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
      <div class="c-wall">Sisa tembok: <b>${G.wall.length}</b>${V.id === 'jp' ? ` · honba <b>${G.honba}</b> · tongkat riichi <b>${G.sticks}</b>` : V.id === 'tw' && G.renchan ? ` · dealer lanjut <b>${G.renchan}×</b>` : ''}</div>
      ${V.id === 'jp' && G.doraInd.length ? `<div class="c-dora" title="Indikator dora — dora = kartu berikutnya">Dora ${G.doraInd.map(t => tileHTML(t.k, { cls: 'xs' })).join('')}</div>` : ''}
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
      h += ui.riichiLock ? `<div class="ab-msg"><b>Riichi</b> — kartu ambilanmu melengkapi tangan!</div><div class="ab-btns">`
        : `<div class="ab-msg"><b>Giliranmu</b> — ketuk kartu untuk memilih, ketuk lagi untuk membuang.${ui.riichiMode ? ' <b>Pilih kartu untuk deklarasi Riichi.</b>' : ''}</div><div class="ab-btns">`;
      if (ui.win && !ui.win.insufficient) h += `<button class="btn win" data-act="tsumo">🀄 ${V.id === 'jp' ? 'Tsumo' : 'Zimo'}! Menang (${winTxt(ui.win)})</button>`;
      if (ui.riichiLock) h += `<button class="btn ghost" data-act="pass" style="color:#fff;border-color:rgba(255,255,255,.4)">Lewati (buang kartu ambilan)</button>`;
      if (ui.riichiIds && ui.riichiIds.length) h += `<button class="btn ${ui.riichiMode ? 'gold' : 'jade'}" data-act="riichi">${ui.riichiMode ? '✓ Riichi dipilih — batal' : 'Riichi! (−1000)'}</button>`;
      ui.kongs.forEach(o => { h += `<button class="btn jade" data-act="kong" data-k="${o.k}">Kong ${tileHTML(o.k, { cls: 'xxs' })}</button>`; });
      if (ui.selected != null) {
        const t = G.players[0].hand.find(t => t.id === ui.selected);
        if (t) h += `<button class="btn" data-act="discard">${ui.riichiMode ? 'Riichi & buang' : 'Buang'} ${tileName(t.k)}</button>`;
      }
      h += '</div>';
      if (ui.win && ui.win.insufficient) h += `<div class="ab-hint warn">Tanganmu sudah lengkap, tetapi ${ui.win.reason}.</div>`;
      if (cfg.hint && ui.riichiIds && ui.riichiIds.length && !ui.riichiMode) h += `<div class="ab-hint">💡 Kamu bisa <b>Riichi</b>: tangan tertutup & Ting. Riichi = +1 han (yaku), tetapi tangan terkunci sampai menang.</div>`;
      if (cfg.hint && ui.hintK != null && !(ui.win && !ui.win.insufficient)) {
        h += `<div class="ab-hint">💡 Saran: buang <b>${tileName(ui.hintK)}</b>. ${ui.hintS <= 0
          ? `Kamu akan <b>Ting</b> (tinggal 1 kartu lagi untuk menang)${ui.waits && ui.waits.length ? ' — menunggu: ' + ui.waits.map(k => tileHTML(k, { cls: 'xxs' })).join('') : ''}`
          : `Setelah itu masih butuh <b>${ui.hintS}</b> kartu yang tepat sebelum Ting.`}</div>`;
      }
    } else if (ui.mode === 'claim') {
      const o = ui.opt;
      h += `<div class="ab-msg">${pname(ui.from)} membuang ${tileHTML(ui.tile.k, { cls: 'sm' })} <b>${tileName(ui.tile.k)}</b> — ambil?</div><div class="ab-btns">`;
      if (o.win) h += `<button class="btn win" data-act="win">🀄 ${V.id === 'jp' ? 'Ron' : 'Hu'}! Menang (${winTxt(o.win)})</button>`;
      if (o.kong) h += `<button class="btn jade" data-act="kongc">Kong</button>`;
      if (o.pong) h += `<button class="btn jade" data-act="pong">Pong</button>`;
      o.chows.forEach(s => { h += `<button class="btn jade" data-act="chow" data-s="${s}">Chow ${[s, s + 1, s + 2].map(k => tileHTML(k, { cls: 'xxs' })).join('')}</button>`; });
      h += `<button class="btn ghost" data-act="pass" style="color:#fff;border-color:rgba(255,255,255,.4)">Lewati</button></div>`;
      if (o.short) h += `<div class="ab-hint warn">Kartu ini melengkapi tanganmu, tetapi ${o.short.reason}.</div>`;
      if (o.furiten) h += `<div class="ab-hint warn">Kartu ini melengkapi tanganmu, tetapi kamu <b>furiten</b> (pernah membuang kartu tunggumu / melewatkan Ron) — hanya boleh menang Tsumo.</div>`;
      if (cfg.hint && ui.hint) h += `<div class="ab-hint">💡 ${ui.hint}</div>`;
    }
    bar.innerHTML = h;
  }
  const winTxt = w => (V.id === 'jp' ? (w.yakuman ? w.limit : `${w.han} han`) : `${w.value} ${V.unit}`);
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
        if (a === 'riichi') { ui.riichiMode = !ui.riichiMode; if (ui.riichiMode && !ui.riichiIds.includes(ui.selected)) ui.selected = null; render(); return; }
        if (a === 'pass' && ui.riichiLock) { pending.resolve({ type: 'discard' }); return; }
        if (a === 'discard' && ui.riichiMode && !ui.riichiIds.includes(ui.selected)) return;
        if (a === 'discard' && ui.selected != null && ui.riichiMode) { pending.resolve({ type: 'discard', id: ui.selected, riichi: true }); return; }
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
      if (G.ui.riichiLock) return;
      if (G.ui.riichiMode && !G.ui.riichiIds.includes(id)) { FX.toast('Untuk Riichi, buang kartu yang membuatmu tetap Ting (kartu terang).'); return; }
      if (G.ui.selected === id) pending.resolve({ type: 'discard', id, riichi: !!G.ui.riichiMode });
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

  return { init, start, stop, quit, isRunning, mode, LEVELS, variant: () => V.id };
})();
