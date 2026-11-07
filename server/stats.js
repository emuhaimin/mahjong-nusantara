/* stats.js — ringkasan statistik & saran perbaikan dari riwayat sesi seorang pemain */
'use strict';

const RES = ['win', 'zimo', 'dealin', 'lose', 'other', 'draw'];
const num = (v, lo, hi, def = 0) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def; };
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').slice(0, n);
const kind = v => (Number.isInteger(+v) && +v >= 0 && +v < 42 ? +v : null);

/** Membersihkan rekaman dari browser (Main vs Mesin) sebelum disimpan */
function sanitizeRecord(r) {
  if (!r || typeof r !== 'object' || r.v !== 1) return null;
  const d = r.d || {};
  const hands = Array.isArray(r.hands) ? r.hands.slice(0, 80).map(h => ({
    n: num(h.n, 0, 999), r: RES.includes(h.r) ? h.r : 'other', fan: num(h.fan, 0, 13), pattern: str(h.pattern, 40),
    items: Array.isArray(h.items) ? h.items.slice(0, 12).map(x => [str(x && x[0], 50), num(x && x[1], 0, 13)]) : [],
    delta: num(h.delta, -2000, 2000), turns: num(h.turns, 0, 200), tenpaiAt: h.tenpaiAt == null ? null : num(h.tenpaiAt, 0, 200),
    open: !!h.open, dealer: !!h.dealer,
  })) : [];
  if (!hands.length) return null;
  const mistakes = Array.isArray(d.mistakes) ? d.mistakes.slice(0, 40).map(m => ({
    h: num(m.h, 0, 999), t: ['worse', 'dealin', 'missedwin', 'missedtsumo', 'claim'].includes(m.t) ? m.t : 'worse',
    k: kind(m.k), better: kind(m.better), s: m.s == null ? null : num(m.s, -1, 13), best: m.best == null ? null : num(m.best, -1, 13),
    fan: m.fan == null ? null : num(m.fan, 0, 13), c: m.c ? str(m.c, 8) : null,
  })) : [];
  const cnt = k => num(d[k], 0, 100000);
  return {
    v: 1, mode: 'bot', startedAt: num(r.startedAt, 0, 4e12), endedAt: num(r.endedAt, 0, 4e12),
    minFan: num(r.minFan, 0, 13), length: ['one', 'east', 'full'].includes(r.length) ? r.length : 'east', complete: !!r.complete,
    hands, rank: r.rank == null ? null : num(r.rank, 1, 4), score: num(r.score, -100000, 100000),
    opponents: Array.isArray(r.opponents) ? r.opponents.slice(0, 3).map(x => str(x, 20)) : [],
    d: {
      discards: cnt('discards'), hintSame: cnt('hintSame'), worse: cnt('worse'), autoMoves: cnt('autoMoves'),
      claimsOffered: cnt('claimsOffered'), claimsTaken: cnt('claimsTaken'), claimAgainstHint: cnt('claimAgainstHint'),
      missedWins: cnt('missedWins'), tenpaiHands: cnt('tenpaiHands'), tenpaiTurnSum: cnt('tenpaiTurnSum'), openHands: cnt('openHands'), mistakes,
    },
  };
}

function summarize(records) {
  const s = {
    sessions: records.length, completeSessions: 0, hands: 0, wins: 0, zimo: 0, dealins: 0, lose: 0, other: 0, draws: 0,
    fanSum: 0, maxFan: 0, ranks: [0, 0, 0, 0], scoreDelta: 0, discards: 0, hintSame: 0, worse: 0,
    claimsOffered: 0, claimsTaken: 0, claimAgainstHint: 0, missedWins: 0, tenpaiHands: 0, tenpaiTurnSum: 0, openHands: 0, openWins: 0,
    patterns: {}, worseTiles: {}, dealinTiles: {}, byMode: { bot: 0, online: 0 }, lastPlayed: 0,
  };
  for (const r of records) {
    if (r.complete) s.completeSessions++;
    if (r.rank >= 1 && r.rank <= 4) s.ranks[r.rank - 1]++;
    s.byMode[r.mode] = (s.byMode[r.mode] || 0) + 1;
    s.lastPlayed = Math.max(s.lastPlayed, r.endedAt || 0);
    for (const h of r.hands || []) {
      s.hands++; s.scoreDelta += h.delta || 0;
      if (h.r === 'win' || h.r === 'zimo') {
        s.wins++; if (h.r === 'zimo') s.zimo++;
        s.fanSum += h.fan || 0; s.maxFan = Math.max(s.maxFan, h.fan || 0);
        if (h.open) s.openWins++;
        for (const [n] of h.items || []) { const key = String(n).replace(/ ×\d+$/, '').replace(/ \(.*\)$/, ''); s.patterns[key] = (s.patterns[key] || 0) + 1; }
      } else if (h.r === 'dealin') s.dealins++;
      else if (h.r === 'lose') s.lose++;
      else if (h.r === 'draw') s.draws++;
      else s.other++;
    }
    const d = r.d || {};
    for (const k of ['discards', 'hintSame', 'worse', 'claimsOffered', 'claimsTaken', 'claimAgainstHint', 'missedWins', 'tenpaiHands', 'tenpaiTurnSum', 'openHands']) s[k] += d[k] || 0;
    for (const m of d.mistakes || []) {
      if (m.t === 'worse' && m.k != null) s.worseTiles[m.k] = (s.worseTiles[m.k] || 0) + 1;
      if (m.t === 'dealin' && m.k != null) s.dealinTiles[m.k] = (s.dealinTiles[m.k] || 0) + 1;
    }
  }
  const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null);
  const rates = {
    winRate: pct(s.wins, s.hands), dealInRate: pct(s.dealins, s.hands), zimoShare: pct(s.zimo, s.wins),
    avgFan: s.wins ? Math.round(s.fanSum / s.wins * 10) / 10 : null,
    tenpaiRate: pct(s.tenpaiHands, s.hands), avgTenpaiTurn: s.tenpaiHands ? Math.round(s.tenpaiTurnSum / s.tenpaiHands * 10) / 10 : null,
    hintMatch: pct(s.hintSame, s.discards), worseRate: pct(s.worse, s.discards),
    openRate: pct(s.openHands, s.hands), firstRate: pct(s.ranks[0], s.ranks.reduce((a, b) => a + b, 0)),
    avgRank: (() => { const n = s.ranks.reduce((a, b) => a + b, 0); return n ? Math.round(s.ranks.reduce((a, c, i) => a + c * (i + 1), 0) / n * 100) / 100 : null; })(),
  };
  return { summary: { ...s, ...rates }, tips: buildTips(s, rates), trend: trend(records) };
}

/** perbandingan 10 sesi terakhir dengan sebelumnya */
function trend(records) {
  if (records.length < 6) return null;
  const rate = list => {
    let h = 0, w = 0, di = 0, ws = 0, dc = 0;
    for (const r of list) { for (const x of r.hands || []) { h++; if (x.r === 'win' || x.r === 'zimo') w++; if (x.r === 'dealin') di++; } ws += (r.d || {}).worse || 0; dc += (r.d || {}).discards || 0; }
    return { winRate: h ? w / h * 100 : 0, dealInRate: h ? di / h * 100 : 0, worseRate: dc ? ws / dc * 100 : 0 };
  };
  const recent = records.slice(-10), before = records.slice(-20, -10);
  if (!before.length) return null;
  const a = rate(recent), b = rate(before);
  const r1 = x => Math.round(x * 10) / 10;
  return { recent: { winRate: r1(a.winRate), dealInRate: r1(a.dealInRate), worseRate: r1(a.worseRate) }, before: { winRate: r1(b.winRate), dealInRate: r1(b.dealInRate), worseRate: r1(b.worseRate) } };
}

function buildTips(s, r) {
  const tips = [];
  const add = (level, title, text, tiles) => tips.push({ level, title, text, tiles: tiles || [] });
  const topTiles = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => +k);
  if (s.hands < 8) {
    add('info', 'Kumpulkan data dulu', `Baru ${s.hands} hand tercatat. Evaluasi akan lebih akurat setelah sekitar 8 hand atau lebih — terus bermain sambil login.`);
    if (!s.hands) return tips;
  }
  // kekuatan
  if (r.winRate != null && r.winRate >= 30) add('good', 'Tingkat menang bagus', `Kamu menang di ${r.winRate}% hand — di atas rata-rata meja 4 orang (±25%).`);
  if (r.dealInRate != null && r.dealInRate <= 10 && s.hands >= 8) add('good', 'Pertahanan rapi', `Hanya ${r.dealInRate}% hand kamu “kena tembak”. Kamu jarang memberi kemenangan ke lawan.`);
  if (r.hintMatch != null && r.hintMatch >= 70 && s.discards >= 30) add('good', 'Pilihan buangan efisien', `${r.hintMatch}% buanganmu sama dengan pilihan terbaik mesin.`);

  // perbaikan
  if (r.dealInRate != null && r.dealInRate > 15) add('warn', 'Terlalu sering kena tembak',
    `${r.dealInRate}% hand berakhir karena lawan Hu dari buanganmu. Saat lawan sudah membuka 2–3 set atau tembok tinggal sedikit, utamakan membuang kartu yang sudah dibuang lawan atau kartu huruf yang sudah keluar 2–3 lembar.`, topTiles(s.dealinTiles));
  if (r.worseRate != null && r.worseRate > 12 && s.discards >= 20) add('warn', 'Buangan menjauhkan dari Ting',
    `${r.worseRate}% buanganmu justru membuat tangan lebih jauh dari Ting. Sebelum membuang, cek kartu mana yang tidak terhubung dengan kartu lain (kartu yatim) — biasanya itu yang paling aman dibuang. Aktifkan “Saran langkah” untuk latihan.`, topTiles(s.worseTiles));
  if (r.tenpaiRate != null && r.tenpaiRate < 35 && s.hands >= 8) add('warn', 'Jarang mencapai Ting',
    `Kamu mencapai Ting di ${r.tenpaiRate}% hand. Pertahankan pasangan dan kartu berurutan (mis. 3-4, 5-7), buang kartu huruf yang tidak berpasangan lebih awal.`);
  if (r.openRate != null && r.openRate > 60 && (r.avgFan == null || r.avgFan < 2.5)) add('warn', 'Terlalu sering Chow/Pong',
    `${r.openRate}% hand kamu terbuka. Tangan terbuka kehilangan fan “Tangan Tertutup” dan lebih mudah dibaca lawan. Klaim hanya bila mempercepat Ting atau memberi fan (Pong naga/angin).`);
  if (s.claimAgainstHint >= 3 && s.claimsTaken && s.claimAgainstHint / s.claimsTaken > 0.4) add('warn', 'Klaim yang kurang perlu',
    `${s.claimAgainstHint} dari ${s.claimsTaken} klaimmu tidak mempercepat tangan. Coba lewati klaim yang tidak mengurangi jarak ke Ting.`);
  if (s.missedWins > 0) add('warn', 'Ada Hu yang terlewat',
    `${s.missedWins}× kamu sebenarnya sudah bisa menang tetapi tidak mengambilnya. Perhatikan tombol emas “Hu!/Zimo!” yang berkedip.`);
  if (r.avgFan != null && r.avgFan < 2 && s.wins >= 4) add('info', 'Kejar fan lebih tinggi',
    `Rata-rata kemenanganmu ${r.avgFan} fan. Coba pertahankan tangan tertutup, kumpulkan satu suit (Satu Warna Campur = 3 fan) atau Pong naga.`);
  if (r.zimoShare != null && r.zimoShare < 20 && s.wins >= 5) add('info', 'Manfaatkan Zimo',
    `Hanya ${r.zimoShare}% kemenanganmu dari Zimo. Zimo bernilai +1 fan dan dibayar semua lawan.`);
  if (r.avgTenpaiTurn != null && r.avgTenpaiTurn > 12) add('info', 'Ting terlalu lambat',
    `Rata-rata kamu Ting di giliran ke-${r.avgTenpaiTurn}. Buang kartu terminal/huruf yang tidak berguna di awal hand agar lebih cepat.`);
  if (!tips.some(t => t.level === 'warn') && s.hands >= 8) add('good', 'Terus pertahankan!', 'Tidak ada kelemahan besar yang terdeteksi. Coba naikkan minimal fan ke 3 untuk tantangan lebih.');
  return tips;
}

module.exports = { summarize, sanitizeRecord };
