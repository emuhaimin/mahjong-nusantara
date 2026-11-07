/* ai.js — bot AI mahjong, dipakai bersama oleh js/game.js (browser) dan server/engine.js (Online).
   Tingkat: easy · medium · hard · expert. Tanpa ketergantungan DOM.
   env = {
     state()     → { players: [{hand, melds, discards, drawn, lastSeq}], wallLeft, roundWind, hist: [] }
     minFan()    → minimal fan meja
     seatWind(p) → angin kursi 0..3
     levelOf(p)  → 'easy' | 'medium' | 'hard' | 'expert'
   } */
function createMjnAI(env) {
  const st = env.state;
  const rnd = n => Math.floor(Math.random() * n);
  const kindsOf = pl => pl.hand.map(t => t.k);
  const seatWind = p => env.seatWind(p);
  const isValue = (p, k) => k >= 31 || k === 27 + seatWind(p) || k === 27 + st().roundWind;

  function visibleCounts() {
    const v = new Array(34).fill(0);
    st().players.forEach(pl => {
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
    const pl = st().players[p]; let f = 0;
    pl.melds.forEach(m => { if (m.type !== 'chow' && isValue(p, m.k)) f += (m.k === 27 + seatWind(p) && m.k === 27 + st().roundWind) ? 2 : 1; });
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
    const pl = st().players[q], m = pl.melds.filter(x => !x.concealed).length, w = st().wallLeft, n = pl.discards.length;
    let t = m >= 3 ? .85 : m === 2 ? .5 : m === 1 ? .25 : .1;
    if (n >= 6) t += .15;                       // makin lama bermain, makin mungkin sudah Ting
    if (n >= 10) t += .2;
    if (w < 20) t += .15;
    return Math.min(1, t);
  }
  /** suit yang sedang dikumpulkan lawan q (Flush terlihat dari meld terbuka), atau null */
  function openFlushSuit(q) {
    const ms = st().players[q].melds.filter(x => !x.concealed && x.k < 27);
    if (ms.length < 2) return null;
    const su = Math.floor(ms[0].k / 9);
    return ms.every(x => Math.floor(x.k / 9) === su) && st().players[q].melds.every(x => x.k >= 27 || Math.floor(x.k / 9) === su) ? su : null;
  }
  /** risiko membuang kartu k ke lawan q (≈0 aman … 1+ berbahaya) */
  function dangerTo(q, k, left) {
    if (left <= 0) return 0.05;                 // semua lembar sudah terlihat → hampir pasti aman
    // kartu ini sudah dibuang orang lain SETELAH giliran terakhir q dan q tidak Hu → tangan q belum berubah, jadi aman
    const ls = st().players[q].lastSeq || 0;
    if (st().hist.some(h => h.k === k && h.seq > ls && h.p !== q)) return 0.02;
    let d;
    if (k >= 27) d = left === 1 ? .12 : left === 2 ? .45 : .7;
    else {
      const r = k % 9;
      d = r === 0 || r === 8 ? .55 : r === 1 || r === 7 ? .8 : 1;
      if (left === 1) d *= .6;
      const fs = openFlushSuit(q);
      if (fs != null) d *= Math.floor(k / 9) === fs ? 2 : .35;
    }
    if (st().players[q].discards.some(t => t.k === k)) d *= .45;   // lawan sendiri membuangnya → jarang ditunggu
    return d;
  }

  /* ---------- tingkat kesulitan bot ----------
     easy   : sering membuang asal, tidak menghitung peluang kartu, klaim sembarangan
     medium : mengejar Ting dengan benar, kadang keliru, jarang mengejar Flush
     hard   : hitung peluang kartu, bias kartu bernilai, kejar Flush; sesekali (10%) kurang teliti
     expert : tidak pernah ceroboh + selalu kejar fan besar + membaca lawan & bertahan saat lawan Ting */
  const LEVELS = {
    easy: { label: 'Easy', ic: '🟢', sloppy: .3, ukeire: false, flush: 0, defense: false },
    medium: { label: 'Medium', ic: '🟡', sloppy: .3, ukeire: true, flush: 0, defense: false },
    hard: { label: 'Hard', ic: '🟠', sloppy: .1, ukeire: true, flush: .5, defense: false },
    expert: { label: 'Expert', ic: '🔴', sloppy: 0, ukeire: true, flush: 1, defense: true },
  };
  const lvOf = p => LEVELS[env.levelOf(p)] || LEVELS.hard;
  const pick = a => a[rnd(a.length)];

  const AI = {
    /** pilih kartu yang dibuang. level: nama tingkat (default: tingkat pemain / 'hard' untuk saran manusia) */
    evalDiscard(p, level) {
      const pl = st().players[p], L = LEVELS[level] || lvOf(p);
      const c = toCounts(kindsOf(pl)), open = pl.melds.length, vis = visibleCounts();
      const fl = env.minFan() >= 2 || Math.random() < L.flush ? flushTarget(pl) : null;
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
      const fold = L.defense && minS >= 2 && maxT >= .45;     // boleh menjauh dari Ting demi membuang kartu aman
      const cands = all.filter(x => x.s <= minS + (fold ? 1 : 0));
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
        if (L.defense) {                       // Expert selalu menimbang bahaya; makin jauh dari Ting makin hati-hati
          const left = 4 - c[x.k] - vis[x.k];   // lembar yang belum terlihat dari sudut pandang bot
          const danger = opps.reduce((sum, o) => sum + o.t * dangerTo(o.q, x.k, left), 0);
          const w = minS <= 0 ? 4 : minS === 1 ? 10 : 36;
          x.score -= danger * w + (x.s - minS) * 14;
        }
      }
      cands.sort((a, b) => b.score - a.score);
      return choose(cands[0].k);
    },
    turn(p, win, kongs) {
      if (win && !win.insufficient) return { type: 'tsumo' };
      const pl = st().players[p], L = lvOf(p);
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
        const ok = env.minFan() === 0 || fanEstimate(p, tile.k) >= env.minFan() || isValue(p, tile.k);
        if (o.kong && ok) return { type: 'kong' };
        if (o.pong && ok && Math.random() < .6) return { type: 'pong' };
        if (o.chows.length && (env.minFan() === 0 || fanEstimate(p, null) >= env.minFan()) && Math.random() < .35) return { type: 'chow', s: pick(o.chows) };
        return null;
      }
      const pl = st().players[p], k = tile.k, open = pl.melds.length;
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
      const okFan = extra => env.minFan() === 0 || fanEstimate(p, extra) >= env.minFan();
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

  /* ---------- riwayat buangan (untuk membaca kartu aman) ---------- */
  function newHand() { const s = st(); s.hist.length = 0; s.players.forEach(pl => { pl.lastSeq = 0; }); }
  function noteDiscard(p, k) {
    const s = st(), seq = (s.hist.length ? s.hist[s.hist.length - 1].seq : 0) + 1;
    s.hist.push({ k, seq, p });
    s.players[p].lastSeq = seq;
  }

  return { LEVELS, evalDiscard: AI.evalDiscard, turn: AI.turn, claim: AI.claim, newHand, noteDiscard };
}
const MJN_LEVELS = ['easy', 'medium', 'hard', 'expert'];
if (typeof module !== 'undefined') module.exports = { createMjnAI, MJN_LEVELS };
