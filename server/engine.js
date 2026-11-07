/* engine.js — mesin mahjong otoritatif di server (satu instance per room).
   Memakai ulang aturan dari js/tiles.js & js/rules.js agar hasil hitung sama persis dengan versi offline. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const ctx = vm.createContext({ console });
for (const f of ['tiles.js', 'rules.js', 'record.js', 'ai.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { tileName, WIND_ID, scoreWin, toCounts, meldTiles, shantenAll, waitingTiles, MjnRecorder, mjnHandResult, createMjnAI } =
  vm.runInContext('({ tileName, WIND_ID, scoreWin, toCounts, meldTiles, shantenAll, waitingTiles, MjnRecorder, mjnHandResult, createMjnAI })', ctx);
const LEVELS = ['easy', 'medium', 'hard', 'expert', 'mix'];
const MIX = ['hard', 'medium', 'hard', 'expert'];   // tingkat per kursi bila host memilih Campuran

const ABORT = { abort: true };
const TURN_MS = 30000, CLAIM_MS = 12000, RESULT_MS = 30000, BOT_THINK = 750;
const BOT_NAMES = ['Bot Budi', 'Bot Citra', 'Bot Dedi', 'Bot Eka'];
const rnd = n => Math.floor(Math.random() * n);
const sum = a => a.reduce((x, y) => x + y, 0);
const plain = o => JSON.parse(JSON.stringify(o)); // lepaskan objek dari realm vm
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

class Room {
  constructor(code, opts = {}) {
    this.onRecord = opts.onRecord || null;
    this.recs = new Map();                 // kursi → perekam sesi pemain yang login
    this.code = code;
    this.seats = [null, null, null, null]; // {name, token, human, conn, connected}
    this.opts = { minFan: 1, length: 'east', level: 'medium' };
    // otak bot (js/ai.js, sama dengan versi offline). Kursi manusia yang terputus/kehabisan waktu dimainkan setara Hard.
    this.ai = createMjnAI({
      state: () => ({ players: this.G.players, wallLeft: this.G.wall.length, roundWind: this.G.roundWind, hist: this.G.hist }),
      minFan: () => this.opts.minFan,
      seatWind: p => this.seatWind(p),
      levelOf: p => this.levelOf(p),
    });
    this.phase = 'lobby';                  // lobby | playing | finished
    this.G = null;
    this.pending = new Map();              // seat → {ui, deadline, resolve, fallback}
    this.alive = true;
    this.chat = [];
    this.hostToken = null;
    this.ready = new Set();
    this.nextResolve = null;
    this.humanWaiter = null;
    this.lastActive = Date.now();
    this._dirty = false;
  }

  /* ================= keanggotaan ================= */
  setOpts(o) {
    if ([0, 1, 3].includes(+o.minFan)) this.opts.minFan = +o.minFan;
    if (['one', 'east', 'full'].includes(o.length)) this.opts.length = o.length;
    if (LEVELS.includes(o.level)) this.opts.level = o.level;
  }
  /** tingkat AI kursi p: bot → pilihan host (Campuran: per kursi); manusia (saat dimainkan otomatis) → hard */
  levelOf(p) {
    const s = this.seats[p];
    if (!s || s.human) return 'hard';
    return this.opts.level === 'mix' ? MIX[p] : this.opts.level;
  }
  connectedHumans() { return this.seats.filter(s => s && s.human && s.connected).length; }
  hostSeat() { return this.seats.findIndex(s => s && s.human && s.token === this.hostToken); }
  ensureHost() {
    const h = this.hostSeat();
    if (h >= 0 && this.seats[h].connected) return;
    const c = this.seats.find(s => s && s.human && s.connected);
    if (c) this.hostToken = c.token;
  }
  seatOfConn(conn) { return this.seats.findIndex(s => s && s.conn === conn); }

  /* ---------- rekaman sesi pemain yang login ---------- */
  newRecorder(i) {
    const s = this.seats[i];
    if (!s || !s.userId || !this.onRecord) return;
    this.recs.set(i, { userId: s.userId, r: new MjnRecorder({
      mode: 'online', minFan: this.opts.minFan, length: this.opts.length, level: this.opts.level,
      opponents: this.seats.filter((x, j) => x && j !== i).map(x => x.name),
    }) });
  }
  finishRecorder(i, complete) {
    const e = this.recs.get(i);
    if (!e) return;
    this.recs.delete(i);
    if (!e.r.handCount || !this.G) return;
    const order = this.G.players.map((p, j) => ({ j, sc: p.score })).sort((a, b) => b.sc - a.sc);
    const rec = e.r.finish({ rank: order.findIndex(o => o.j === i) + 1, score: this.G.players[i].score, complete });
    try { this.onRecord(e.userId, plain(rec)); } catch (err) { console.error(err); }
  }
  finishAllRecorders(complete) { for (const i of [...this.recs.keys()]) this.finishRecorder(i, complete); }

  join(name, token, conn, user) {
    let i = this.seats.findIndex(s => s && s.human && s.token === token);
    if (i < 0) {
      i = this.phase === 'lobby' ? this.seats.findIndex(s => !s) : this.seats.findIndex(s => s && !s.human);
      if (i < 0) return { error: this.phase === 'lobby' ? 'Room sudah penuh (4 pemain).' : 'Semua kursi sudah diisi pemain manusia.' };
      const replacing = this.seats[i];
      this.seats[i] = { name, token, human: true, conn: null, connected: false, userId: null };
      if (this.G) {
        this.G.players[i].name = name;
        this.log(`${name} bergabung menggantikan ${replacing ? replacing.name : 'kursi kosong'}.`);
      }
      this.sys(`${name} masuk ke room.`);
    }
    const s = this.seats[i];
    if (s.conn && s.conn !== conn) { try { s.conn.send({ t: 'kicked', msg: 'Akun ini membuka room di tab lain.' }); } catch { } }
    s.conn = conn; s.connected = true; s.name = name;
    if (user && s.userId !== user.id) {             // login (atau ganti akun) di kursi ini
      if (this.recs.has(i)) this.finishRecorder(i, false);
      s.userId = user.id;
      if (this.phase === 'playing') this.newRecorder(i);   // mulai tercatat dari hand berikutnya
    }
    if (this.G) this.G.players[i].name = name;
    if (!this.hostToken || this.hostSeat() < 0) this.hostToken = token;
    this.ensureHost();
    this.lastActive = Date.now();
    if (this.humanWaiter) { const w = this.humanWaiter; this.humanWaiter = null; w(); }
    this.broadcast();
    return { seat: i };
  }
  disconnect(conn) {
    const i = this.seatOfConn(conn);
    if (i < 0) return;
    const s = this.seats[i];
    s.conn = null; s.connected = false;
    this.lastActive = Date.now();
    if (this.phase === 'lobby') { this.seats[i] = null; this.sys(`${s.name} keluar.`); }
    else this.sys(`${s.name} terputus — sementara dimainkan bot.`);
    const pd = this.pending.get(i);
    if (pd) pd.resolve(pd.fallback());
    if (this.nextResolve) this.checkReady();
    this.ensureHost();
    this.broadcast();
  }
  leave(conn) {
    const i = this.seatOfConn(conn);
    if (i < 0) return;
    const s = this.seats[i];
    if (this.phase === 'lobby') this.seats[i] = null;
    else {
      this.finishRecorder(i, false);
      const used = this.seats.map(x => x && x.name);
      this.seats[i] = { name: BOT_NAMES.find(n => !used.includes(n)) || 'Bot', token: null, human: false, conn: null, connected: false };
      if (this.G) this.G.players[i].name = this.seats[i].name;
      const pd = this.pending.get(i); if (pd) pd.resolve(pd.fallback());
    }
    this.sys(`${s.name} meninggalkan room.`);
    if (this.hostToken === s.token) this.hostToken = null;
    this.ensureHost();
    this.lastActive = Date.now();
    if (this.nextResolve) this.checkReady();
    this.broadcast();
  }
  destroy() {
    if (this.phase === 'playing') this.finishAllRecorders(false);
    this.alive = false;
    for (const pd of [...this.pending.values()]) pd.resolve(pd.fallback());
    if (this.humanWaiter) this.humanWaiter();
    if (this.nextResolve) this.nextResolve();
  }

  /* ================= pesan dari klien ================= */
  handle(conn, m) {
    const i = this.seatOfConn(conn);
    if (i < 0) return;
    this.lastActive = Date.now();
    const isHost = this.hostSeat() === i;
    switch (m.t) {
      case 'act': return this.onAct(i, m.act || {});
      case 'opts': if (isHost && this.phase === 'lobby') { this.setOpts(m.opts || {}); this.broadcast(); } return;
      case 'start': if (isHost && this.phase === 'lobby') this.start(); return;
      case 'restart': if (isHost && this.phase === 'finished') { this.phase = 'lobby'; this.G = null; this.start(); } return;
      case 'next': if (this.nextResolve) { this.ready.add(i); this.checkReady(); this.broadcast(); } return;
      case 'chat': {
        const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
        if (!text) return;
        this.chat.push({ n: this.seats[i].name, s: i, text, ts: Date.now() });
        if (this.chat.length > 50) this.chat.shift();
        this.broadcast();
      }
    }
  }
  onAct(p, a) {
    const pd = this.pending.get(p);
    if (!pd) return;
    const ui = pd.ui, pl = this.G.players[p];
    if (ui.mode === 'turn') {
      if (a.type === 'tsumo' && ui.win && !ui.win.insufficient) return pd.resolve({ type: 'tsumo' });
      if (a.type === 'kong' && ui.kongs.some(o => o.k === +a.k)) return pd.resolve({ type: 'kong', k: +a.k });
      if (a.type === 'discard' && pl.hand.some(t => t.id === +a.id)) return pd.resolve({ type: 'discard', id: +a.id });
    } else if (ui.mode === 'claim') {
      const o = ui.opt;
      if (a.type === 'pass') return pd.resolve(null);
      if (a.type === 'win' && o.win) return pd.resolve({ type: 'win' });
      if (a.type === 'pong' && o.pong) return pd.resolve({ type: 'pong' });
      if (a.type === 'kong' && o.kong) return pd.resolve({ type: 'kong' });
      if (a.type === 'chow' && o.chows.includes(+a.s)) return pd.resolve({ type: 'chow', s: +a.s });
    }
  }
  checkReady() {
    const need = this.seats.map((s, i) => (s && s.human && s.connected ? i : -1)).filter(i => i >= 0);
    if (need.every(i => this.ready.has(i)) && this.nextResolve) { const r = this.nextResolve; this.nextResolve = null; r(); }
  }

  /* ================= komunikasi ================= */
  sys(text) { this.chat.push({ n: '', s: -1, text, ts: Date.now() }); if (this.chat.length > 50) this.chat.shift(); }
  log(s) { if (!this.G) return; this.G.log.push(s); if (this.G.log.length > 200) this.G.log.shift(); this.broadcast(); }
  broadcast() {
    if (this._dirty) return;
    this._dirty = true;
    setImmediate(() => {
      this._dirty = false;
      this.seats.forEach((s, i) => { if (s && s.human && s.connected && s.conn) s.conn.send(this.view(i)); });
    });
  }
  view(p) {
    const G = this.G;
    const v = {
      t: 'state', code: this.code, phase: this.phase, opts: this.opts, you: p, host: this.hostSeat(),
      seats: this.seats.map((s, i) => s && { name: s.name, human: s.human, connected: s.connected, level: s.human ? null : this.levelOf(i) }),
      chat: this.chat.slice(-40),
    };
    if (!G) return v;
    v.g = {
      dealer: G.dealer, roundWind: G.roundWind, handNo: G.handNo, wall: G.wall.length, dice: G.dice, msg: G.msg,
      turn: G.turn, lastDiscard: G.lastDiscard, callout: G.callout, log: G.log.slice(-80), reveal: G.reveal, paused: !!G.paused,
      players: G.players.map((pl, i) => ({
        name: pl.name, score: pl.score, count: pl.hand.length,
        hand: i === p || G.reveal ? pl.hand : null, drawn: i === p || G.reveal ? pl.drawn : null,
        melds: pl.melds, flowers: pl.flowers, discards: pl.discards,
      })),
      result: G.result, final: G.final,
    };
    const pd = this.pending.get(p);
    if (pd) v.ui = { ...pd.ui, remain: Math.max(0, pd.deadline - Date.now()), total: pd.ms };
    if (G.result) v.ready = [...this.ready];
    return v;
  }

  /* ================= alur permainan ================= */
  sleep(ms) { return new Promise((res, rej) => setTimeout(() => (this.alive ? res() : rej(ABORT)), ms)); }
  isLive(p) { const s = this.seats[p]; return s && s.human && s.connected; }
  ask(p, ui, ms, fallback, meta = {}) {
    const auto = () => { meta.auto = true; return fallback(); };
    if (!this.isLive(p)) return Promise.resolve(auto());
    return new Promise(resolve => {
      const pd = {
        ui, ms, deadline: Date.now() + ms, fallback: auto,
        resolve: v => { if (pd.done) return; pd.done = true; clearTimeout(pd.timer); this.pending.delete(p); resolve(v); this.broadcast(); },
      };
      pd.timer = setTimeout(() => {
        if (this.G) this.log(`⏱ Waktu ${this.seats[p].name} habis — langkah dipilih otomatis.`);
        pd.resolve(auto());
      }, ms);
      this.pending.set(p, pd);
      this.broadcast();
    });
  }
  async waitHumans() {
    while (this.alive && this.connectedHumans() === 0) {
      this.G.paused = true;
      await new Promise(r => { this.humanWaiter = r; });
    }
    this.G.paused = false;
    if (!this.alive) throw ABORT;
  }

  start() {
    const used = this.seats.map(s => s && s.name);
    for (let i = 0; i < 4; i++) if (!this.seats[i]) {
      const n = BOT_NAMES.find(x => !used.includes(x)) || `Bot ${i + 1}`;
      used.push(n);
      this.seats[i] = { name: n, token: null, human: false, conn: null, connected: false };
    }
    this.phase = 'playing';
    this.G = {
      players: this.seats.map(s => ({ name: s.name, score: 500, hand: [], melds: [], flowers: [], discards: [], drawn: null })),
      dealer: 0, firstDealer: 0, roundWind: 0, handNo: 0, wall: [], turn: -1, log: [], msg: '', dice: null,
      reveal: false, lastDiscard: null, callout: null, result: null, final: null, paused: false, hist: [],
    };
    this.recs.clear();
    for (let i = 0; i < 4; i++) this.newRecorder(i);
    this.sys('Permainan dimulai!');
    this.run();
  }
  async run() {
    try {
      await this.chooseDealer();
      while (true) {
        const res = await this.playHand();
        await this.settle(res);
        if (this.matchOver()) break;
      }
      const G = this.G;
      G.final = G.players.map((p, i) => ({ name: p.name, score: p.score, i })).sort((a, b) => b.score - a.score);
      this.finishAllRecorders(true);
      G.turn = -1;
      this.phase = 'finished';
      this.sys(`Permainan selesai — juara: ${G.final[0].name}!`);
      this.broadcast();
    } catch (e) { if (e !== ABORT) console.error(e); }
  }
  seatWind(p) { return (p - this.G.dealer + 4) % 4; }
  nm(p) { return this.G.players[p].name; }
  matchOver() {
    const L = this.opts.length;
    if (L === 'one') return true;
    if (L === 'east') return this.G.roundWind >= 1;
    return this.G.roundWind >= 4;
  }

  async chooseDealer() {
    const G = this.G;
    let cands = [0, 1, 2, 3];
    this.log('Menentukan dealer: setiap pemain melempar 3 dadu, angka tertinggi menjadi dealer (東 Timur).');
    while (true) {
      const rolls = cands.map(p => ({ p, d: [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)] }));
      rolls.forEach(r => this.log(`${this.nm(r.p)} melempar ${r.d.join('+')} = ${sum(r.d)}`));
      G.msg = '<b>Menentukan dealer</b><br>' + rolls.map(r => `${esc(this.nm(r.p))}: <b>${sum(r.d)}</b>`).join(' · ');
      this.broadcast();
      await this.sleep(2200);
      const max = Math.max(...rolls.map(r => sum(r.d)));
      cands = rolls.filter(r => sum(r.d) === max).map(r => r.p);
      if (cands.length === 1) break;
      this.log('Seri — pemain dengan angka tertinggi melempar ulang.');
    }
    G.dealer = G.firstDealer = cands[0];
    this.log(`${this.nm(G.dealer)} menjadi dealer (東 Timur).`);
  }

  async playHand() {
    const G = this.G;
    G.handNo++;
    G.result = null;
    for (const pl of G.players) { pl.hand = []; pl.melds = []; pl.flowers = []; pl.discards = []; pl.drawn = null; }
    this.ai.newHand();
    G.lastDiscard = null; G.turn = G.dealer; G.reveal = false;
    const tiles = []; let id = 0;
    for (let k = 0; k < 34; k++) for (let c = 0; c < 4; c++) tiles.push({ id: id++, k });
    for (let k = 34; k < 42; k++) tiles.push({ id: id++, k });
    G.wall = shuffle(tiles);
    this.log(`— Hand ${G.handNo} · Ronde Angin ${WIND_ID[G.roundWind]} · Dealer: ${this.nm(G.dealer)} —`);
    G.dice = [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)];
    const tot = sum(G.dice), owner = (G.dealer + tot - 1) % 4;
    G.msg = `Dealer melempar dadu = <b>${tot}</b>, tembok di depan ${esc(this.nm(owner))} dipecah.`;
    this.log(`Dadu ${G.dice.join('+')} = ${tot} → tembok ${this.nm(owner)} dipecah, hitung ${tot} tumpukan dari kanan.`);
    this.broadcast(); await this.sleep(1500);

    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
      const p = (G.dealer + i) % 4;
      for (let j = 0; j < 4; j++) G.players[p].hand.push(G.wall.shift());
      this.broadcast(); await this.sleep(110);
    }
    for (let i = 0; i < 4; i++) G.players[(G.dealer + i) % 4].hand.push(G.wall.shift());
    const extra = G.wall.shift();
    G.players[G.dealer].hand.push(extra); G.players[G.dealer].drawn = extra.id;
    G.msg = 'Kartu dibagikan: dealer 14 kartu, pemain lain 13.';
    this.broadcast(); await this.sleep(700);
    for (let i = 0; i < 4; i++) await this.replaceInitialFlowers((G.dealer + i) % 4);
    { // ringkasan bunga awal (dibuka di depan masing-masing pemain)
      const got = G.players.map((pl, i) => pl.flowers.length ? `${esc(this.nm(i))} ${pl.flowers.length}` : null).filter(Boolean);
      if (got.length) { G.msg = `🌸 Bunga dibuka: ${got.join(' · ')}`; this.broadcast(); await this.sleep(900); }
    }
    for (const [i, e] of this.recs) e.r.startHand({ dealer: i === G.dealer, wind: this.seatWind(i) });

    let cur = G.dealer, phase = 'afterDraw', flags = { heavenly: true, kongDraw: false };
    while (true) {
      await this.waitHumans();
      G.turn = cur;
      if (phase === 'draw') {
        if (G.wall.length === 0) return { type: 'draw' };
        const t = await this.drawTile(cur, false);
        if (!t) return { type: 'draw' };
        phase = 'afterDraw';
      }
      const act = await this.turnAction(cur, phase === 'afterDraw', flags);
      if (act.type === 'exhausted') return { type: 'draw' };
      if (act.type === 'tsumo') { this.log(`🀄 ${this.nm(cur)} menang Zimo!`); return { type: 'win', p: cur, selfDraw: true, score: act.score }; }
      const tile = this.doDiscard(cur, act.id);
      flags = { heavenly: false, kongDraw: false };
      G.msg = `${esc(this.nm(cur))} membuang ${tileName(tile.k)}.`;
      this.broadcast();
      await this.sleep(450);
      const claim = await this.claimPhase(cur, tile);
      if (claim && claim.type === 'win') {
        G.players[cur].discards.pop();
        G.players[claim.p].hand.push(tile); G.players[claim.p].drawn = tile.id;
        this.log(`🀄 ${this.nm(claim.p)} menang (Hu) dari buangan ${this.nm(cur)}!`);
        this.callout(claim.p, 'HU!');
        return { type: 'win', p: claim.p, selfDraw: false, from: cur, score: claim.score, tile };
      }
      if (claim) {
        this.applyClaim(claim, cur, tile);
        cur = claim.p; G.turn = cur;
        if (claim.type === 'kong') {
          const t = await this.drawTile(cur, true);
          if (!t) return { type: 'draw' };
          flags.kongDraw = true; phase = 'afterDraw';
        } else phase = 'afterClaim';
        await this.sleep(500);
        continue;
      }
      cur = (cur + 1) % 4; phase = 'draw';
    }
  }

  flowerNote(p, k) { return (k - 34) % 4 === this.seatWind(p) ? ' (bunga kursi sendiri, +1 fan)' : ''; }
  async replaceInitialFlowers(p) {
    const pl = this.G.players[p];
    while (true) {
      const i = pl.hand.findIndex(t => t.k >= 34);
      if (i < 0) break;
      const f = pl.hand.splice(i, 1)[0];
      pl.flowers.push(f.k);
      const r = this.G.wall.pop();
      pl.hand.push(r);
      if (pl.drawn === f.id) pl.drawn = r.id;
      this.log(`${this.nm(p)} membuka ${tileName(f.k)}${this.flowerNote(p, f.k)} dan mengambil kartu pengganti.`);
      this.G.msg = `${esc(this.nm(p))} membuka <b>${tileName(f.k)}</b> dan mengambil kartu pengganti.`;
      this.broadcast();
      await this.sleep(450);
    }
  }
  async drawTile(p, fromBack) {
    const G = this.G, pl = G.players[p];
    let t = fromBack ? G.wall.pop() : G.wall.shift();
    while (t && t.k >= 34) {
      pl.flowers.push(t.k);
      this.log(`${this.nm(p)} mendapat ${tileName(t.k)}${this.flowerNote(p, t.k)} → dibuka di depan, ambil pengganti.`);
      G.msg = `${esc(this.nm(p))} mendapat <b>${tileName(t.k)}</b> — dibuka, lalu mengambil kartu pengganti.`;
      this.callout(p, 'BUNGA!');
      await this.sleep(700);
      t = G.wall.pop();
    }
    if (!t) return null;
    pl.hand.push(t); pl.drawn = t.id;
    this.broadcast();
    return t;
  }
  evalWin(p, tile, flags) {
    const pl = this.G.players[p];
    const kinds = pl.hand.map(t => t.k);
    if (tile) kinds.push(tile.k);
    const s = scoreWin({
      concealed: kinds, melds: pl.melds, flowers: pl.flowers, seatWind: this.seatWind(p), roundWind: this.G.roundWind,
      selfDraw: !!flags.selfDraw, lastTile: !!flags.lastTile, kongDraw: !!flags.kongDraw, heavenly: !!flags.heavenly,
    });
    if (!s) return null;
    const r = plain(s);
    if (r.fan < this.opts.minFan) r.insufficient = true;
    return r;
  }
  selfKongOptions(pl) {
    const c = toCounts(pl.hand.map(t => t.k)), res = [];
    for (let k = 0; k < 34; k++) if (c[k] === 4) res.push({ k, kind: 'concealed' });
    pl.melds.forEach(m => { if (m.type === 'pong' && c[m.k] >= 1) res.push({ k: m.k, kind: 'add' }); });
    return res;
  }
  doSelfKong(p, k) {
    const pl = this.G.players[p];
    if (pl.hand.filter(t => t.k === k).length === 4) {
      pl.hand = pl.hand.filter(t => t.k !== k);
      pl.melds.push({ type: 'kong', k, concealed: true });
      this.log(`${this.nm(p)} melakukan Kong tertutup ${tileName(k)}.`);
    } else {
      pl.hand.splice(pl.hand.findIndex(t => t.k === k), 1);
      pl.melds.find(m => m.type === 'pong' && m.k === k).type = 'kong';
      this.log(`${this.nm(p)} menambah Pong ${tileName(k)} menjadi Kong.`);
    }
    pl.drawn = null;
    this.callout(p, 'KONG!');
  }
  async turnAction(p, canWin, flags) {
    const G = this.G, pl = G.players[p];
    while (true) {
      const win = canWin ? this.evalWin(p, null, { selfDraw: true, kongDraw: flags.kongDraw, heavenly: flags.heavenly && p === G.dealer, lastTile: G.wall.length === 0 }) : null;
      const kongs = canWin && G.wall.length > 0 ? this.selfKongOptions(pl) : [];
      let act;
      if (!this.isLive(p)) { this.broadcast(); await this.sleep(BOT_THINK); act = this.aiTurn(p, win, kongs); }
      else {
        const h = this.evalDiscard(p, 'hard');   // saran untuk pemain selalu setara Hard
        const ui = { mode: 'turn', win, kongs, hintId: h.id, hintK: h.k, hintS: h.s };
        if (h.s === 0) { const ks = pl.hand.map(t => t.k); ks.splice(ks.indexOf(h.k), 1); ui.waits = plain(waitingTiles(ks, pl.melds.length)); }
        G.msg = `Giliran ${esc(this.nm(p))}.`;
        const meta = {};
        act = await this.ask(p, ui, TURN_MS, () => this.aiTurn(p, win, kongs), meta);
        const e = this.recs.get(p);
        if (e && act.type === 'discard') {
          const t = pl.hand.find(x => x.id === act.id);
          if (t) {
            const c = toCounts(pl.hand.map(x => x.k)); c[t.k]--;
            e.r.discard({ k: t.k, bestK: h.k, bestS: h.s, sAfter: shantenAll(c, pl.melds.length), auto: !!meta.auto });
            if (!meta.auto && win && !win.insufficient) e.r.missedTsumo({ fan: win.fan });
          }
        }
      }
      if (act.type === 'tsumo' && win && !win.insufficient) { this.callout(p, 'ZIMO!'); return { type: 'tsumo', score: win }; }
      if (act.type === 'kong') {
        this.doSelfKong(p, act.k);
        flags.heavenly = false;
        await this.sleep(500);
        const t = await this.drawTile(p, true);
        if (!t) return { type: 'exhausted' };
        flags.kongDraw = true; canWin = true;
        continue;
      }
      if (act.type === 'discard') return act;
      act = this.aiTurn(p, win, kongs); // input tidak valid → otomatis
      if (act.type === 'discard') return act;
    }
  }
  doDiscard(p, id) {
    const pl = this.G.players[p];
    const t = pl.hand.splice(pl.hand.findIndex(t => t.id === id), 1)[0];
    pl.discards.push(t); pl.drawn = null;
    this.G.lastDiscard = { p, id: t.id };
    this.ai.noteDiscard(p, t.k);
    this.log(`${this.nm(p)} membuang ${tileName(t.k)}.`);
    return t;
  }
  chowOptions(pl, k) {
    if (k >= 27) return [];
    const c = toCounts(pl.hand.map(t => t.k)), res = [];
    for (const s of [k - 2, k - 1, k]) {
      if (s < 0 || Math.floor(s / 9) !== Math.floor(k / 9) || s % 9 > 6) continue;
      if ([s, s + 1, s + 2].filter(x => x !== k).every(x => c[x] >= 1)) res.push(s);
    }
    return res;
  }
  async claimPhase(from, tile) {
    const G = this.G, opts = [];
    for (let i = 1; i <= 3; i++) {
      const p = (from + i) % 4, pl = G.players[p];
      const o = { p, i, win: null, short: null, pong: false, kong: false, chows: [] };
      const w = this.evalWin(p, tile, { selfDraw: false, lastTile: G.wall.length === 0 });
      if (w) { if (w.insufficient) o.short = w; else o.win = w; }
      if (G.wall.length > 0) {
        const n = pl.hand.filter(t => t.k === tile.k).length;
        o.pong = n >= 2; o.kong = n >= 3;
        if (i === 1) o.chows = this.chowOptions(pl, tile.k);
      }
      if (o.win || o.pong || o.kong || o.chows.length) opts.push(o);
    }
    const decs = await Promise.all(opts.map(o => {
      if (!this.isLive(o.p)) return Promise.resolve(this.aiClaim(o.p, tile, o));
      const s = this.aiClaim(o.p, tile, o, 'hard');
      const hint = s ? `Saran: <b>${{ win: 'Hu (menang)', chow: 'Chow', kong: 'Kong', pong: 'Pong' }[s.type]}</b>.` : 'Saran: lewati — klaim ini tidak mempercepat tanganmu.';
      const meta = {};
      return this.ask(o.p, { mode: 'claim', tile, from, opt: o, hint }, CLAIM_MS, () => (o.win ? { type: 'win' } : null), meta).then(d => {
        const e = this.recs.get(o.p);
        if (e) e.r.claim({ offered: o, suggestion: s, decision: d, tileK: tile.k, auto: !!meta.auto });
        return d;
      });
    }));
    const list = decs.map((d, j) => d && { ...d, p: opts[j].p, i: opts[j].i, score: opts[j].win }).filter(Boolean);
    const pickBy = types => list.filter(d => types.includes(d.type)).sort((a, b) => a.i - b.i)[0];
    return pickBy(['win']) || pickBy(['pong', 'kong']) || pickBy(['chow']) || null;
  }
  applyClaim(claim, from, tile) {
    const G = this.G, pl = G.players[claim.p];
    G.players[from].discards.pop();
    G.lastDiscard = null;
    const removeK = k => pl.hand.splice(pl.hand.findIndex(t => t.k === k), 1);
    if (claim.type === 'chow') {
      [claim.s, claim.s + 1, claim.s + 2].filter(k => k !== tile.k).forEach(removeK);
      pl.melds.push({ type: 'chow', k: claim.s, concealed: false });
      this.log(`${this.nm(claim.p)} Chow (mengambil ${tileName(tile.k)}).`);
      this.callout(claim.p, 'CHOW!');
    } else {
      const n = claim.type === 'kong' ? 3 : 2;
      for (let j = 0; j < n; j++) removeK(tile.k);
      pl.melds.push({ type: claim.type, k: tile.k, concealed: false });
      this.log(`${this.nm(claim.p)} ${claim.type === 'kong' ? 'Kong' : 'Pong'} ${tileName(tile.k)}.`);
      this.callout(claim.p, claim.type === 'kong' ? 'KONG!' : 'PONG!');
    }
    pl.drawn = null;
    G.msg = `${esc(this.nm(claim.p))} ${claim.type.toUpperCase()} ${tileName(tile.k)}.`;
    this.broadcast();
  }
  callout(p, text) {
    const G = this.G;
    G.callout = { p, text, id: Date.now() };
    const id = G.callout.id;
    this.broadcast();
    setTimeout(() => { if (this.G === G && G.callout && G.callout.id === id) { G.callout = null; this.broadcast(); } }, 1200);
  }

  async settle(res) {
    const G = this.G;
    G.reveal = true; G.turn = -1;
    const before = G.players.map(p => p.score);
    let stays;
    if (res.type === 'draw') { stays = true; this.log('Tembok habis — seri. Dealer tetap.'); }
    else {
      const base = res.score.points, w = res.p;
      if (res.selfDraw) { for (let q = 0; q < 4; q++) if (q !== w) { G.players[q].score -= base; G.players[w].score += base; } }
      else { G.players[res.from].score -= base * 2; G.players[w].score += base * 2; }
      stays = w === G.dealer;
    }
    G.result = {
      type: res.type, p: res.p, from: res.from, selfDraw: res.selfDraw, score: res.score, tileK: res.tile ? res.tile.k : null,
      delta: G.players.map((p, i) => p.score - before[i]), dealerStays: stays, handNo: G.handNo, roundWind: G.roundWind,
      winds: [0, 1, 2, 3].map(i => this.seatWind(i)), dealer: G.dealer, last: false,
    };
    for (const [i, e] of this.recs) {
      const r = mjnHandResult(res, i);
      const mine = r === 'win' || r === 'zimo';
      e.r.endHand({ r, fan: mine ? res.score.fan : 0, pattern: mine ? res.score.pattern : '', items: mine ? res.score.items : [],
        delta: G.result.delta[i], k: r === 'dealin' && res.tile ? res.tile.k : null });
    }
    // apakah ini hand terakhir?
    const nd = stays ? G.dealer : (G.dealer + 1) % 4;
    const nr = !stays && nd === G.firstDealer ? G.roundWind + 1 : G.roundWind;
    const L = this.opts.length;
    G.result.last = L === 'one' || (L === 'east' && nr >= 1) || nr >= 4;
    this.ready = new Set();
    await new Promise(resolve => {
      this.nextResolve = resolve;
      setTimeout(() => { if (this.nextResolve === resolve) { this.nextResolve = null; resolve(); } }, RESULT_MS);
      this.broadcast();
      this.checkReady();
    });
    if (!this.alive) throw ABORT;
    G.result = null; G.reveal = false;
    if (!stays) {
      G.dealer = nd;
      if (nd === G.firstDealer) { G.roundWind++; if (G.roundWind < 4) this.log(`Ronde berganti ke Angin ${WIND_ID[G.roundWind]}.`); }
    }
  }

  /* ================= bot AI (js/ai.js — sama dengan versi offline) ================= */
  evalDiscard(p, level) { return plain(this.ai.evalDiscard(p, level)); }
  aiTurn(p, win, kongs) { return plain(this.ai.turn(p, win, kongs)); }
  aiClaim(p, tile, o, level) { const d = this.ai.claim(p, tile, o, level); return d && plain(d); }
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

module.exports = { Room };
