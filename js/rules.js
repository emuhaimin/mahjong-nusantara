/* rules.js — deteksi menang, perhitungan fan & poin, shanten (untuk bot) */
const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
const FAN_CAP = 13;          // batas fan (tangan maksimal)
const POINT_TABLE = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128]; // fan 0..10+ → poin dasar

function fanPoints(f) { return POINT_TABLE[Math.min(f, 10)]; }
function toCounts(kinds) { const c = new Array(34).fill(0); for (const k of kinds) if (k < 34) c[k]++; return c; }
function meldTiles(m) {
  if (m.type === 'chow') return [m.k, m.k + 1, m.k + 2];
  if (m.type === 'kong') return [m.k, m.k, m.k, m.k];
  return [m.k, m.k, m.k];
}

/* ---------- dekomposisi tangan ---------- */
function extractSets(c, i, need, sets, out) {
  while (i < 34 && c[i] === 0) i++;
  if (i === 34) { if (sets.length === need) out.push(sets.slice()); return; }
  if (sets.length >= need) return;
  if (c[i] >= 3) { c[i] -= 3; sets.push({ type: 'pong', k: i }); extractSets(c, i, need, sets, out); sets.pop(); c[i] += 3; }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--; sets.push({ type: 'chow', k: i });
    extractSets(c, i, need, sets, out);
    sets.pop(); c[i]++; c[i + 1]++; c[i + 2]++;
  }
}
function findDecomps(c, need) {
  const out = [];
  for (let p = 0; p < 34; p++) {
    if (c[p] >= 2) {
      c[p] -= 2; const o = []; extractSets(c, 0, need, [], o);
      o.forEach(s => out.push({ pair: p, sets: s })); c[p] += 2;
    }
  }
  return out;
}
/** concealed: jenis kartu tertutup (termasuk kartu penentu). meldCount: jumlah set terbuka/kong.
    sets: jumlah set untuk menang (4 = HK/Riichi, 5 = Taiwan 16 kartu). Tujuh Pasang & Tiga Belas Yatim hanya untuk 4 set. */
function analyzeWin(concealed, meldCount, sets = 4) {
  const need = sets - meldCount;
  if (concealed.length !== need * 3 + 2) return null;
  if (concealed.some(k => k >= 34)) return null;
  const c = toCounts(concealed);
  const r = { decomps: findDecomps(c, need), sevenPairs: false, thirteen: false };
  if (meldCount === 0 && sets === 4) {
    r.sevenPairs = c.filter(x => x === 2).length === 7;
    r.thirteen = ORPHANS.every(k => c[k] >= 1) && ORPHANS.reduce((s, k) => s + c[k], 0) === 14;
  }
  return (r.decomps.length || r.sevenPairs || r.thirteen) ? r : null;
}

/* ---------- daftar fan (untuk referensi & pelajaran) ---------- */
const FAN_LIST = [
  ['Tangan Ayam', '雞胡', 0, 'Menang tanpa pola apa pun (hanya sah jika minimal fan = 0).'],
  ['Zimo (ambil sendiri)', '自摸', 1, 'Kartu penentu kemenangan diambil sendiri dari tembok.'],
  ['Tangan Tertutup', '門前清', 1, 'Tidak pernah Chow/Pong/Kong dari buangan orang (Kong tertutup boleh).'],
  ['Semua Chow (Ping Hu)', '平胡', 1, 'Keempat set berupa Chow dan mata bukan kartu bernilai.'],
  ['Pong Naga', '箭刻', 1, 'Setiap Pong/Kong Naga Merah, Hijau, atau Putih.'],
  ['Pong Angin Kursi', '門風', 1, 'Pong/Kong angin sesuai tempat duduk sendiri.'],
  ['Pong Angin Ronde', '圈風', 1, 'Pong/Kong angin ronde yang sedang berjalan.'],
  ['Bunga Kursi Sendiri', '正花', 1, 'Setiap bunga/musim yang nomornya sama dengan kursi (Timur=1, Selatan=2, Barat=3, Utara=4).'],
  ['Tanpa Bunga', '無花', 1, 'Tidak punya bunga maupun musim sama sekali.'],
  ['Satu Set Bunga / Musim', '一台花', 2, 'Memiliki keempat bunga, atau keempat musim.'],
  ['Kartu Terakhir', '海底撈月', 1, 'Menang dengan kartu terakhir dari tembok.'],
  ['Menang dari Kong', '槓上開花', 1, 'Menang dengan kartu pengganti setelah Kong.'],
  ['Semua Pong', '對對胡', 3, 'Keempat set berupa Pong/Kong.'],
  ['Satu Warna Campur', '混一色', 3, 'Hanya satu jenis suit, dicampur kartu huruf (angin/naga).'],
  ['Tujuh Pasang', '七對子', 4, 'Tujuh pasangan berbeda, tangan tertutup.'],
  ['Tiga Naga Kecil', '小三元', 5, 'Dua Pong naga + mata dari naga ketiga.'],
  ['Satu Warna Murni', '清一色', 7, 'Seluruh kartu dari satu suit saja, tanpa huruf.'],
  ['Tiga Naga Besar', '大三元', 8, 'Pong/Kong ketiga naga.'],
  ['Empat Angin Kecil', '小四喜', 10, 'Tiga Pong angin + mata dari angin keempat.'],
  ['Empat Angin Besar', '大四喜', 13, 'Pong/Kong keempat angin (maksimal).'],
  ['Semua Huruf', '字一色', 13, 'Seluruh kartu berupa angin & naga (maksimal).'],
  ['Tiga Belas Yatim', '十三幺', 13, '1 & 9 dari tiap suit, 4 angin, 3 naga + satu pasangan (maksimal).'],
  ['Menang Surga', '天胡', 13, 'Dealer langsung menang dengan 14 kartu awal (maksimal).'],
];

/**
 * ctx = { concealed:[k], melds:[{type,k,concealed}], flowers:[k], seatWind, roundWind,
 *         selfDraw, lastTile, kongDraw, heavenly }
 * return { items:[[nama,fan]], fan, points, pattern, decomp } atau null jika bukan tangan menang.
 */
function scoreWin(ctx) {
  const melds = ctx.melds || [];
  const a = analyzeWin(ctx.concealed, melds.length);
  if (!a) return null;
  const all = ctx.concealed.slice();
  melds.forEach(m => all.push(...meldTiles(m)));
  const open = melds.some(m => !m.concealed);
  const suits = new Set(all.filter(k => k < 27).map(k => Math.floor(k / 9)));
  const hasHonor = all.some(k => k >= 27);
  const seatW = 27 + ctx.seatWind, roundW = 27 + ctx.roundWind;

  const common = [];
  if (ctx.selfDraw) common.push(['Zimo (ambil sendiri)', 1]);
  if (!open) common.push(['Tangan Tertutup', 1]);
  if (ctx.lastTile) common.push(['Kartu Terakhir', 1]);
  if (ctx.kongDraw) common.push(['Menang dari Kong', 1]);
  const fl = ctx.flowers || [];
  if (fl.length === 0) common.push(['Tanpa Bunga', 1]);
  else {
    const own = fl.filter(f => (f - 34) % 4 === ctx.seatWind).length;
    if (own) common.push([`Bunga Kursi Sendiri${own > 1 ? ' ×' + own : ''}`, own]);
    if ([34, 35, 36, 37].every(f => fl.includes(f))) common.push(['Satu Set Bunga', 2]);
    if ([38, 39, 40, 41].every(f => fl.includes(f))) common.push(['Satu Set Musim', 2]);
  }
  const flush = [];
  if (suits.size === 0) flush.push(['Semua Huruf', 13]);
  else if (suits.size === 1 && !hasHonor) flush.push(['Satu Warna Murni', 7]);
  else if (suits.size === 1 && hasHonor) flush.push(['Satu Warna Campur', 3]);

  const cands = [];
  if (ctx.heavenly) cands.push({ pattern: 'Menang Surga', items: [['Menang Surga', 13]] });
  if (a.thirteen) cands.push({ pattern: 'Tiga Belas Yatim', items: [['Tiga Belas Yatim', 13]] });
  if (a.sevenPairs) cands.push({ pattern: 'Tujuh Pasang', items: [['Tujuh Pasang', 4], ...flush, ...common.filter(x => x[0] !== 'Tangan Tertutup')] });

  for (const d of a.decomps) {
    const sets = melds.map(m => ({ type: m.type === 'chow' ? 'chow' : 'pong', k: m.k, open: !m.concealed, kong: m.type === 'kong' }))
      .concat(d.sets.map(s => ({ ...s, open: false })));
    const items = [];
    const pongs = sets.filter(s => s.type === 'pong');
    const chows = sets.filter(s => s.type === 'chow');
    const dragonP = pongs.filter(s => s.k >= 31).length;
    const windP = pongs.filter(s => s.k >= 27 && s.k <= 30).length;
    const pairDragon = d.pair >= 31, pairWind = d.pair >= 27 && d.pair <= 30;
    let fourWinds = false;
    if (windP === 4) { items.push(['Empat Angin Besar', 13]); fourWinds = true; }
    else if (windP === 3 && pairWind) { items.push(['Empat Angin Kecil', 10]); fourWinds = true; }
    if (dragonP === 3) items.push(['Tiga Naga Besar', 8]);
    else if (dragonP === 2 && pairDragon) items.push(['Tiga Naga Kecil', 5]);
    else if (dragonP) items.push([`Pong Naga${dragonP > 1 ? ' ×' + dragonP : ''}`, dragonP]);
    if (!fourWinds) {
      if (pongs.some(s => s.k === seatW)) items.push([`Pong Angin Kursi (${WIND_ID[ctx.seatWind]})`, 1]);
      if (pongs.some(s => s.k === roundW)) items.push([`Pong Angin Ronde (${WIND_ID[ctx.roundWind]})`, 1]);
    }
    if (pongs.length === 4) items.push(['Semua Pong', 3]);
    if (chows.length === 4 && !(pairDragon || d.pair === seatW || d.pair === roundW)) items.push(['Semua Chow (Ping Hu)', 1]);
    items.push(...flush, ...common);
    cands.push({ pattern: 'Standar', items, decomp: { pair: d.pair, sets } });
  }
  let best = null;
  for (const c of cands) {
    let f = c.items.reduce((s, x) => s + x[1], 0);
    if (f > FAN_CAP) f = FAN_CAP;
    c.fan = f;
    if (!best || f > best.fan) best = c;
  }
  if (best.fan === 0) best.items = [['Tangan Ayam (tanpa pola)', 0]];
  best.points = fanPoints(best.fan);
  return best;
}

/* ---------- shanten (jarak menuju Ting) — dipakai bot & fitur saran ---------- */
const _gc = new Map();
function groupCombos(c, from, honor) {
  const n = honor ? 7 : 9;
  let key = 0;
  for (let i = 0; i < n; i++) key = key * 5 + c[from + i];
  if (honor) key += 2e6;
  let r = _gc.get(key);
  if (r) return r;
  const a = c.slice(from, from + n), set = new Set();
  (function dfs(i, m, t, p) {
    while (i < n && a[i] === 0) i++;
    if (i >= n) { set.add(m * 100 + Math.min(t, 9) * 10 + p); return; }
    if (a[i] >= 3) { a[i] -= 3; dfs(i, m + 1, t, p); a[i] += 3; }
    if (!honor && i <= 6 && a[i + 1] && a[i + 2]) { a[i]--; a[i + 1]--; a[i + 2]--; dfs(i, m + 1, t, p); a[i]++; a[i + 1]++; a[i + 2]++; }
    if (a[i] >= 2) { a[i] -= 2; if (!p) dfs(i, m, t, 1); dfs(i, m, t + 1, p); a[i] += 2; }
    if (!honor && i <= 7 && a[i + 1]) { a[i]--; a[i + 1]--; dfs(i, m, t + 1, p); a[i]++; a[i + 1]++; }
    if (!honor && i <= 6 && a[i + 2]) { a[i]--; a[i + 2]--; dfs(i, m, t + 1, p); a[i]++; a[i + 2]++; }
    a[i]--; dfs(i, m, t, p); a[i]++;
  })(0, 0, 0, 0);
  const all = [...set].map(v => [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10]);
  // buang kombinasi yang kalah telak (m, t lebih kecil dengan p sama)
  r = all.filter(x => !all.some(y => y !== x && y[2] === x[2] && y[0] >= x[0] && y[1] >= x[1] && (y[0] > x[0] || y[1] > x[1])));
  _gc.set(key, r);
  return r;
}
const _SH_GROUPS = [[0, false], [9, false], [18, false], [27, true]];
function shantenStd(c, open, sets = 4) {
  const need = Math.max(0, sets - open), W = need + 1, N = W * W * 2;
  let cur = new Uint8Array(N); cur[0] = 1;             // indeks = (m*W + t)*2 + p
  for (const [from, honor] of _SH_GROUPS) {
    const g = groupCombos(c, from, honor), nx = new Uint8Array(N);
    for (let idx = 0; idx < N; idx++) {
      if (!cur[idx]) continue;
      const p = idx & 1, t = (idx >> 1) % W, m = Math.floor((idx >> 1) / W);
      for (const [m2, t2, p2] of g) {
        const P = p + p2; if (P > 1) continue;
        const M = Math.min(m + m2, need), T = Math.min(t + t2, need);
        nx[(M * W + T) * 2 + P] = 1;
      }
    }
    cur = nx;
  }
  let best = 2 * need + 1;
  for (let idx = 0; idx < N; idx++) {
    if (!cur[idx]) continue;
    const p = idx & 1, t = (idx >> 1) % W, m = Math.floor((idx >> 1) / W);
    const s = 2 * (need - m) - Math.min(t, need - m) - p;
    if (s < best) best = s;
  }
  return best;
}
/** -1 = sudah menang, 0 = Ting (menunggu 1 kartu), n = butuh n kartu tepat lagi menuju Ting */
function shantenAll(c, open, sets = 4) {
  let s = shantenStd(c, open, sets);
  if (open === 0 && sets === 4) {
    let pairs = 0, kinds = 0;
    for (let i = 0; i < 34; i++) { if (c[i] >= 1) kinds++; if (c[i] >= 2) pairs++; }
    s = Math.min(s, 6 - pairs + Math.max(0, 7 - kinds));
    let oc = 0, op = 0;
    for (const k of ORPHANS) { if (c[k] >= 1) oc++; if (c[k] >= 2) op = 1; }
    s = Math.min(s, 13 - oc - op);
  }
  return s;
}
/** kartu-kartu yang membuat tangan 13 (atau 16 untuk Taiwan) menjadi menang */
function waitingTiles(kinds, meldCount, sets = 4) {
  const c = toCounts(kinds), res = [];
  for (let x = 0; x < 34; x++) {
    if (c[x] >= 4) continue;
    if (analyzeWin(kinds.concat([x]), meldCount, sets)) res.push(x);
  }
  return res;
}

/* ---------- generator latihan ---------- */
const _rnd = n => Math.floor(Math.random() * n);
const _pick = a => a[_rnd(a.length)];
function _shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = _rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function genWinningHand() {
  const theme = _pick(['acak', 'acak', 'acak', 'campur', 'murni', 'pong', 'naga', 'chow']);
  const suit = _rnd(3);
  const inPool = k => theme === 'murni' ? (k < 27 && Math.floor(k / 9) === suit)
    : theme === 'campur' ? ((k < 27 && Math.floor(k / 9) === suit) || k >= 27) : true;
  const pool = [...Array(34).keys()].filter(inPool);
  for (let tries = 0; tries < 400; tries++) {
    const c = new Array(34).fill(0), sets = [];
    if (theme === 'naga') { const ds = _shuffle([31, 32, 33]); sets.push({ type: 'pong', k: ds[0] }, { type: 'pong', k: ds[1] }); c[ds[0]] += 3; c[ds[1]] += 3; }
    let guard = 0;
    while (sets.length < 4 && guard++ < 60) {
      const chow = theme === 'chow' || (theme !== 'pong' && Math.random() < .55);
      if (chow) {
        const starts = pool.filter(k => k < 27 && k % 9 <= 6 && inPool(k + 2));
        if (!starts.length) continue;
        const s = _pick(starts);
        if (c[s] >= 4 || c[s + 1] >= 4 || c[s + 2] >= 4) continue;
        c[s]++; c[s + 1]++; c[s + 2]++; sets.push({ type: 'chow', k: s });
      } else {
        const k = _pick(pool);
        if (c[k] > 1) continue;
        c[k] += 3; sets.push({ type: 'pong', k });
      }
    }
    if (sets.length < 4) continue;
    const pk = _pick(theme === 'chow' ? pool.filter(k => k < 27) : pool);
    if (c[pk] > 2) continue;
    return { sets, pair: pk, theme };
  }
  return { sets: [{ type: 'chow', k: 0 }, { type: 'chow', k: 9 }, { type: 'chow', k: 18 }, { type: 'pong', k: 31 }], pair: 4, theme: 'acak' };
}
function genScoringQuiz() {
  const h = genWinningHand();
  const openCount = Math.random() < .45 ? 0 : 1 + _rnd(2);
  const openIdx = _shuffle([0, 1, 2, 3]).slice(0, openCount);
  const melds = [], concealed = [];
  h.sets.forEach((s, i) => {
    if (openIdx.includes(i)) melds.push({ type: s.type, k: s.k, concealed: false });
    else concealed.push(...meldTiles(s));
  });
  concealed.push(h.pair, h.pair);
  const flowers = _shuffle([34, 35, 36, 37, 38, 39, 40, 41]).slice(0, _pick([0, 0, 1, 1, 2, 2, 3]));
  const ctx = { concealed, melds, flowers, seatWind: _rnd(4), roundWind: Math.random() < .6 ? 0 : _rnd(4), selfDraw: Math.random() < .4 };
  ctx.winTile = _pick(concealed);
  ctx.score = scoreWin(ctx);
  return ctx;
}
