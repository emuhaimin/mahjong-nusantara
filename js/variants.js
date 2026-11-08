/* variants.js — aturan per varian mahjong: Hong Kong (fan), Taiwan (16 kartu, tai), Jepang/Riichi (yaku, han/fu, dora).
   Dipakai js/game.js (Main vs Mesin & Simulasi). Tanpa ketergantungan DOM.
   Indeks kartu sama dengan tiles.js: 0-8 Wan, 9-17 Tong, 18-26 Tiao, 27-30 angin T/S/B/U, 31 中 32 發 33 白, 34-41 bunga/musim. */

const _isTerm = k => k < 27 && (k % 9 === 0 || k % 9 === 8);
const _isHonor = k => k >= 27 && k < 34;
const _isTH = k => _isTerm(k) || _isHonor(k);
const _isSimple = k => k < 27 && !_isTerm(k);
const _suit = k => Math.floor(k / 9);
const _setTiles = s => (s.type === 'chow' ? [s.k, s.k + 1, s.k + 2] : s.kong ? [s.k, s.k, s.k, s.k] : [s.k, s.k, s.k]);

/** semua cara membaca tangan menang (dekomposisi × posisi kartu penentu) untuk menentukan jenis tunggu & pong tertutup */
function mjnReadings(ctx, sets) {
  const melds = ctx.melds || [];
  const a = analyzeWin(ctx.concealed, melds.length, sets);
  if (!a) return null;
  const open = melds.map(m => ({ type: m.type === 'chow' ? 'chow' : 'pong', k: m.k, open: !m.concealed, kong: m.type === 'kong', meld: true }));
  const w = ctx.winTile, out = [];
  for (const d of a.decomps) {
    const base = d.sets.map(s => ({ ...s, open: false, kong: false, meld: false }));
    const push = (wait, idx) => {
      const ss = base.map((s, i) => (i === idx && wait === 'shanpon' && !ctx.selfDraw ? { ...s, open: true, ronPong: true } : s));
      out.push({ pair: d.pair, sets: open.concat(ss), wait });
    };
    if (w == null) { push('ryanmen', -1); continue; }
    if (d.pair === w) push('tanki', -1);
    base.forEach((s, i) => {
      if (s.type === 'pong' && s.k === w) push('shanpon', i);
      if (s.type === 'chow' && w >= s.k && w <= s.k + 2) {
        if (w === s.k + 1) push('kanchan', i);
        else if ((w === s.k && s.k % 9 === 6) || (w === s.k + 2 && s.k % 9 === 0)) push('penchan', i);
        else push('ryanmen', i);
      }
    });
  }
  return { a, readings: out };
}
function _allTiles(ctx) {
  const all = ctx.concealed.slice();
  (ctx.melds || []).forEach(m => all.push(...meldTiles(m)));
  return all;
}

/* =================================================================== HONG KONG */
const VAR_HK = {
  id: 'hk', name: 'Hong Kong', zh: '廣東牌', unit: 'fan', sets: 4, flowers: true, red: false, deadWall: 0,
  startScore: 500, minOptions: [[0, '0 — bebas (pemula)'], [1, '1 fan'], [3, '3 fan (standar Hong Kong)']], defaultMin: 1,
  desc: '144 kartu + bunga. Skor dengan fan; menang butuh minimal fan yang disepakati.',
  score(ctx) { const s = scoreWin(ctx); if (s) { s.value = s.fan; s.points = fanPoints(s.fan); } return s; },
  insufficient(s, cfg) { return s.fan < cfg.minFan ? `baru ${s.fan} fan — minimal ${cfg.minFan} fan` : null; },
  /** perubahan skor per kursi */
  pay(G, res) {
    const d = [0, 0, 0, 0], base = res.score.points, w = res.p;
    if (res.selfDraw) { for (let q = 0; q < 4; q++) if (q !== w) { d[q] -= base; d[w] += base; } }
    else { d[res.from] -= base * 2; d[w] += base * 2; }
    return { delta: d, stays: w === G.dealer, note: `${res.score.fan} fan → <b>${base} poin dasar</b>. ${res.selfDraw ? `Zimo: setiap lawan membayar <b>${base}</b> (total ${base * 3}).` : `Dari buangan: pembuang membayar 2 × ${base} = <b>${base * 2}</b>.`}` };
  },
  draw(G) { return { delta: [0, 0, 0, 0], stays: true, note: 'Tembok habis — seri. Dealer tetap.' }; },
};

/* =================================================================== TAIWAN */
const TW_BASE = 30, TW_TAI = 10;
function scoreTaiwan(ctx) {
  const r = mjnReadings(ctx, 5);
  if (!r) return null;
  const melds = ctx.melds || [], fl = ctx.flowers || [];
  const menzen = melds.every(m => m.concealed);
  const allOpen = melds.length === 5 && melds.every(m => !m.concealed);
  const all = _allTiles(ctx);
  const suits = new Set(all.filter(k => k < 27).map(_suit)), hasHonor = all.some(_isHonor);
  const seatW = 27 + ctx.seatWind, roundW = 27 + ctx.roundWind;
  // tunggu tunggal (獨聽): hanya satu jenis kartu yang bisa melengkapi
  const before = ctx.concealed.slice(); before.splice(before.indexOf(ctx.winTile), 1);
  const single = waitingTiles(before, melds.length, 5).length === 1;
  const common = [];
  if (ctx.heavenly) common.push(['Menang Surga (天胡)', 24]);
  if (menzen && ctx.selfDraw) common.push(['Tertutup + Zimo (門清自摸)', 3]);
  else if (menzen) common.push(['Tangan Tertutup (門清)', 1]);
  else if (ctx.selfDraw) common.push(['Zimo (自摸)', 1]);
  if (allOpen && ctx.selfDraw) common.push(['Setengah Minta (半求人)', 1]);
  if (allOpen && !ctx.selfDraw) common.push(['Semua Minta (全求人)', 2]);
  if (ctx.lastTile) common.push([ctx.selfDraw ? 'Kartu Terakhir (海底撈月)' : 'Buangan Terakhir (河底撈魚)', 1]);
  if (ctx.kongDraw) common.push(['Menang dari Kong (槓上開花)', 1]);
  if (single && !allOpen) common.push(['Tunggu Tunggal (獨聽)', 1]);
  if (fl.length === 8) common.push(['Delapan Bunga (八仙過海)', 8]);
  else {
    const own = fl.filter(f => (f - 34) % 4 === ctx.seatWind).length;
    if (own) common.push([`Bunga Kursi Sendiri (正花)${own > 1 ? ' ×' + own : ''}`, own]);
    if ([34, 35, 36, 37].every(f => fl.includes(f))) common.push(['Satu Set Bunga (花槓)', 2]);
    if ([38, 39, 40, 41].every(f => fl.includes(f))) common.push(['Satu Set Musim (花槓)', 2]);
  }
  const flush = [];
  if (suits.size === 0) flush.push(['Semua Huruf (字一色)', 16]);
  else if (suits.size === 1 && !hasHonor) flush.push(['Satu Warna Murni (清一色)', 8]);
  else if (suits.size === 1) flush.push(['Satu Warna Campur (混一色)', 4]);
  let best = null;
  for (const rd of r.readings) {
    const items = [];
    const pongs = rd.sets.filter(s => s.type === 'pong'), chows = rd.sets.filter(s => s.type === 'chow');
    const dragonP = pongs.filter(s => s.k >= 31).length, windP = pongs.filter(s => s.k >= 27 && s.k <= 30).length;
    const pairD = rd.pair >= 31, pairW = rd.pair >= 27 && rd.pair <= 30;
    if (dragonP === 3) items.push(['Tiga Naga Besar (大三元)', 8]);
    else if (dragonP === 2 && pairD) items.push(['Tiga Naga Kecil (小三元)', 4]);
    else if (dragonP) items.push([`Pong Naga (三元牌)${dragonP > 1 ? ' ×' + dragonP : ''}`, dragonP]);
    if (windP === 4) items.push(['Empat Angin Besar (大四喜)', 16]);
    else if (windP === 3 && pairW) items.push(['Empat Angin Kecil (小四喜)', 8]);
    else {
      if (pongs.some(s => s.k === seatW)) items.push([`Pong Angin Kursi (門風 ${WIND_ID[ctx.seatWind]})`, 1]);
      if (pongs.some(s => s.k === roundW)) items.push([`Pong Angin Ronde (圈風 ${WIND_ID[ctx.roundWind]})`, 1]);
    }
    if (pongs.length === 5) items.push(['Semua Pong (碰碰胡)', 4]);
    const anko = pongs.filter(s => !s.open).length;
    if (anko >= 5) items.push(['Lima Pong Tertutup (五暗刻)', 8]);
    else if (anko === 4) items.push(['Empat Pong Tertutup (四暗刻)', 5]);
    else if (anko === 3) items.push(['Tiga Pong Tertutup (三暗刻)', 2]);
    if (chows.length === 5 && !hasHonor && !fl.length && !ctx.selfDraw && rd.wait === 'ryanmen') items.push(['Semua Chow (Ping Hu)', 2]);
    items.push(...flush, ...common);
    const v = items.reduce((t, x) => t + x[1], 0);
    if (!best || v > best.value) best = { items, value: v, decomp: { pair: rd.pair, sets: rd.sets }, pattern: 'Standar' };
  }
  if (!best.items.length) best.items = [['Tanpa tai (dasar saja)', 0]];
  best.fan = best.value;
  return best;
}
const VAR_TW = {
  id: 'tw', name: 'Taiwan', zh: '台灣16張', unit: 'tai', sets: 5, flowers: true, red: false, deadWall: 0,
  startScore: 1000, minOptions: [[0, 'Bebas (tanpa minimal tai)']], defaultMin: 0,
  desc: '144 kartu + bunga, tangan 16 kartu (menang 5 set + 1 pasang). Bayar = dasar + tai; dealer menambah tai.',
  score: scoreTaiwan,
  insufficient() { return null; },
  pay(G, res) {
    const d = [0, 0, 0, 0], w = res.p, tai = res.score.value;
    const dealerTai = 1 + 2 * (G.renchan || 0);           // 莊家 + 連莊拉莊
    const amount = q => TW_BASE + (tai + ((w === G.dealer || q === G.dealer) ? dealerTai : 0)) * TW_TAI;
    const payers = res.selfDraw ? [0, 1, 2, 3].filter(q => q !== w) : [res.from];
    payers.forEach(q => { const a = amount(q); d[q] -= a; d[w] += a; });
    const dn = `dealer +${dealerTai} tai${G.renchan ? ` (lanjut ${G.renchan}×)` : ''}`;
    return { delta: d, stays: w === G.dealer,
      note: `${tai} tai. Bayar = ${TW_BASE} + tai × ${TW_TAI}${w === G.dealer ? `, ${dn}` : `; bila dealer yang membayar: ${dn}`}. ${res.selfDraw ? 'Zimo: ketiga lawan membayar.' : 'Pembuang membayar sendiri.'}` };
  },
  draw(G) { return { delta: [0, 0, 0, 0], stays: true, note: 'Tembok habis — seri. Dealer tetap (lanjut).' }; },
};

/* =================================================================== JEPANG (RIICHI) */
const _doraNext = k => (k < 27 ? _suit(k) * 9 + (k % 9 + 1) % 9 : k <= 30 ? 27 + (k - 27 + 1) % 4 : k === 33 ? 32 : k === 32 ? 31 : 33);
const _r100 = x => Math.ceil(x / 100) * 100;
function _jpBasic(han, fu, yakuman) {
  if (yakuman) return 8000 * yakuman;
  if (han >= 13) return 8000;
  if (han >= 11) return 6000;
  if (han >= 8) return 4000;
  if (han >= 6) return 3000;
  const b = fu * Math.pow(2, 2 + han);
  return han >= 5 || b > 2000 ? 2000 : b;
}
const _limitName = (han, yakuman, basic) => yakuman ? (yakuman > 1 ? `Yakuman ×${yakuman}` : 'Yakuman') : han >= 13 ? 'Yakuman (hitungan)' : han >= 11 ? 'Sanbaiman' : han >= 8 ? 'Baiman' : han >= 6 ? 'Haneman' : basic >= 2000 ? 'Mangan' : '';
function scoreRiichi(ctx) {
  const r = mjnReadings(ctx, 4);
  if (!r) return null;
  const melds = ctx.melds || [], menzen = melds.every(m => m.concealed);
  const all = _allTiles(ctx);
  const suits = new Set(all.filter(k => k < 27).map(_suit)), hasHonor = all.some(_isHonor);
  const seatW = 27 + ctx.seatWind, roundW = 27 + ctx.roundWind;
  const yakuhaiK = k => k >= 31 || k === seatW || k === roundW;
  const c34 = toCounts(all);
  // dora
  const doraT = (ctx.doraInd || []).map(_doraNext), uraT = ctx.riichi ? (ctx.uraInd || []).map(_doraNext) : [];
  const countIn = ts => ts.reduce((n, t) => n + c34[t], 0);
  const dora = countIn(doraT), ura = countIn(uraT), aka = ctx.red || 0;
  const doraItems = [];
  if (dora) doraItems.push([`Dora ×${dora}`, dora]);
  if (ura) doraItems.push([`Ura-dora ×${ura}`, ura]);
  if (aka) doraItems.push([`Lima merah (aka) ×${aka}`, aka]);
  // yaku umum
  const situ = [];
  if (ctx.riichi) situ.push([ctx.doubleRiichi ? 'Double Riichi' : 'Riichi', ctx.doubleRiichi ? 2 : 1]);
  if (ctx.riichi && ctx.ippatsu) situ.push(['Ippatsu', 1]);
  if (menzen && ctx.selfDraw) situ.push(['Menzen Tsumo (zimo tertutup)', 1]);
  if (ctx.lastTile) situ.push([ctx.selfDraw ? 'Haitei — Kartu Terakhir' : 'Houtei — Buangan Terakhir', 1]);
  if (ctx.kongDraw) situ.push(['Rinshan — Menang dari Kong', 1]);
  const tanyao = all.every(_isSimple);
  const flushY = suits.size === 1 && !hasHonor ? [['Chinitsu — Satu Warna Murni', menzen ? 6 : 5]] : suits.size === 1 ? [['Honitsu — Satu Warna Campur', menzen ? 3 : 2]] : [];
  const honroutou = all.every(_isTH) && hasHonor && suits.size > 0;
  const cands = [];
  // yakuman
  const yk = [];
  if (ctx.heavenly) yk.push(['Tenhou — Menang Surga', 1]);
  if (r.a.thirteen) yk.push(['Kokushi — Tiga Belas Yatim', 1]);
  if (all.every(_isHonor)) yk.push(['Tsuuiisou — Semua Huruf', 1]);
  if (all.every(_isTerm)) yk.push(['Chinroutou — Semua Terminal', 1]);
  if (all.every(k => [19, 20, 21, 23, 25, 32].includes(k))) yk.push(['Ryuuiisou — Semua Hijau', 1]);
  if (menzen && suits.size === 1 && !hasHonor && melds.length === 0) {
    const s0 = [...suits][0] * 9, cc = c34.slice(s0, s0 + 9), need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
    if (cc.every((x, i) => x >= need[i])) yk.push(['Chuuren Poutou — Sembilan Gerbang', 1]);
  }
  if (yk.length) cands.push({ items: yk, yakuman: yk.reduce((t, x) => t + x[1], 0), pattern: 'Yakuman' });   // mis. Kokushi (tanpa pembacaan set)
  if (r.a.sevenPairs) {
    const items = [['Chiitoitsu — Tujuh Pasang', 2], ...situ];
    if (tanyao) items.push(['Tanyao — Semua Sederhana', 1]);
    if (honroutou) items.push(['Honroutou — Semua Terminal & Huruf', 2]);
    items.push(...flushY);
    cands.push({ items, fu: 25, pattern: 'Tujuh Pasang' });
  }
  for (const rd of r.readings) {
    const items = situ.slice();
    const sets = rd.sets, pongs = sets.filter(s => s.type === 'pong'), chows = sets.filter(s => s.type === 'chow');
    const anko = pongs.filter(s => !s.open).length, kongs = sets.filter(s => s.kong).length;
    const dragonP = pongs.filter(s => s.k >= 31).length, windP = pongs.filter(s => s.k >= 27 && s.k <= 30).length;
    const ykr = yk.slice();
    if (anko === 4) ykr.push([rd.wait === 'tanki' ? 'Suuankou Tanki — Empat Pong Tertutup' : 'Suuankou — Empat Pong Tertutup', 1]);
    if (dragonP === 3) ykr.push(['Daisangen — Tiga Naga Besar', 1]);
    if (windP === 4) ykr.push(['Daisuushii — Empat Angin Besar', 2]);
    else if (windP === 3 && rd.pair >= 27 && rd.pair <= 30) ykr.push(['Shousuushii — Empat Angin Kecil', 1]);
    if (kongs === 4) ykr.push(['Suukantsu — Empat Kong', 1]);
    if (ykr.length) { cands.push({ items: ykr, yakuman: ykr.reduce((t, x) => t + x[1], 0), decomp: rd, pattern: 'Yakuman' }); continue; }
    const pinfu = menzen && chows.length === 4 && !yakuhaiK(rd.pair) && rd.wait === 'ryanmen';
    if (pinfu) items.push(['Pinfu', 1]);
    if (tanyao) items.push(['Tanyao — Semua Sederhana', 1]);
    pongs.forEach(s => {
      if (s.k >= 31) items.push([`Yakuhai — Naga ${DRAGON_ID[s.k - 31].replace('Naga ', '')}`, 1]);
      if (s.k === seatW) items.push([`Yakuhai — Angin Kursi (${WIND_ID[ctx.seatWind]})`, 1]);
      if (s.k === roundW) items.push([`Yakuhai — Angin Ronde (${WIND_ID[ctx.roundWind]})`, 1]);
    });
    if (menzen) {
      const keys = chows.map(s => s.k).sort((a, b) => a - b);
      let peiko = 0; for (let i = 0; i + 1 < keys.length; i++) if (keys[i] === keys[i + 1]) { peiko++; i++; }
      if (peiko === 2) items.push(['Ryanpeikou — Dua Pasang Chow Kembar', 3]);
      else if (peiko === 1) items.push(['Iipeikou — Chow Kembar', 1]);
    }
    const nums = t => chows.some(s => s.k === t);
    for (let n = 0; n < 7; n++) if (nums(n) && nums(9 + n) && nums(18 + n)) { items.push(['Sanshoku — Tiga Warna Sama', menzen ? 2 : 1]); break; }
    for (let s0 = 0; s0 < 27; s0 += 9) if (nums(s0) && nums(s0 + 3) && nums(s0 + 6)) { items.push(['Ittsu — Satu Jalur Lurus 1-9', menzen ? 2 : 1]); break; }
    const pk = t => pongs.some(s => s.k === t);
    for (let n = 0; n < 9; n++) if (pk(n) && pk(9 + n) && pk(18 + n)) { items.push(['Sanshoku Doukou — Tiga Pong Sama', 2]); break; }
    if (pongs.length === 4) items.push(['Toitoi — Semua Pong', 2]);
    if (anko === 3) items.push(['Sanankou — Tiga Pong Tertutup', 2]);
    if (kongs === 3) items.push(['Sankantsu — Tiga Kong', 2]);
    if (dragonP === 2 && rd.pair >= 31) items.push(['Shousangen — Tiga Naga Kecil', 2]);
    if (honroutou) items.push(['Honroutou — Semua Terminal & Huruf', 2]);
    else if (chows.length && sets.every(s => _setTiles(s).some(_isTH)) && _isTH(rd.pair)) {
      if (hasHonor) items.push(['Chanta — Terminal/Huruf di Setiap Set', menzen ? 2 : 1]);
      else items.push(['Junchan — Terminal di Setiap Set', menzen ? 3 : 2]);
    }
    items.push(...flushY);
    // fu
    let fu;
    if (pinfu) fu = ctx.selfDraw ? 20 : 30;
    else {
      fu = 20 + (menzen && !ctx.selfDraw ? 10 : 0) + (ctx.selfDraw ? 2 : 0);
      if (rd.pair >= 31) fu += 2;
      if (rd.pair === seatW) fu += 2;
      if (rd.pair === roundW) fu += 2;
      if (['kanchan', 'penchan', 'tanki'].includes(rd.wait)) fu += 2;
      pongs.forEach(s => { let f = 2; if (_isTH(s.k)) f *= 2; if (!s.open) f *= 2; if (s.kong) f *= 4; fu += f; });
      fu = Math.ceil(fu / 10) * 10;
      if (fu === 20) fu = 30;
    }
    cands.push({ items, fu, decomp: rd, pattern: 'Standar' });
  }
  let best = null;
  for (const cd of cands) {
    const yakuHan = cd.yakuman ? 0 : cd.items.reduce((t, x) => t + x[1], 0);
    cd.noYaku = !cd.yakuman && yakuHan === 0;
    if (!cd.yakuman && !cd.noYaku) cd.items = cd.items.concat(doraItems);
    cd.han = cd.yakuman ? 13 * cd.yakuman : cd.items.reduce((t, x) => t + x[1], 0);
    cd.basic = cd.noYaku ? 0 : _jpBasic(cd.han, cd.fu || 0, cd.yakuman || 0);
    if (!best || cd.basic > best.basic || (cd.basic === best.basic && cd.han > best.han)) best = cd;
  }
  const out = { items: best.items.length ? best.items : [['Tanpa yaku', 0]], value: best.han, fan: best.han, han: best.han, fu: best.fu, yakuman: best.yakuman || 0,
    basic: best.basic, noYaku: best.noYaku, pattern: best.pattern, limit: _limitName(best.han, best.yakuman, best.basic),
    decomp: best.decomp ? { pair: best.decomp.pair, sets: best.decomp.sets } : null };
  return out;
}
const VAR_JP = {
  id: 'jp', name: 'Jepang (Riichi)', zh: '立直麻雀', unit: 'han', sets: 4, flowers: false, red: true, deadWall: 14,
  startScore: 25000, minOptions: [[1, 'Wajib 1 yaku']], defaultMin: 1,
  desc: '136 kartu tanpa bunga, 3 lima merah. Menang wajib punya yaku; skor han/fu; riichi, dora, furiten.',
  score: scoreRiichi,
  insufficient(s) { return s.noYaku ? 'tidak ada yaku (pola wajib Riichi) — dora saja tidak cukup' : null; },
  pay(G, res) {
    const d = [0, 0, 0, 0], w = res.p, b = res.score.basic, h = G.honba || 0, dealerWin = w === G.dealer;
    let note;
    if (res.selfDraw) {
      for (let q = 0; q < 4; q++) if (q !== w) {
        const a = _r100(b * (dealerWin || q === G.dealer ? 2 : 1)) + 100 * h;
        d[q] -= a; d[w] += a;
      }
      note = dealerWin ? `Tsumo dealer: tiap lawan ${_r100(b * 2) + 100 * h}.` : `Tsumo: dealer ${_r100(b * 2) + 100 * h}, lainnya ${_r100(b) + 100 * h}.`;
    } else {
      const a = _r100(b * (dealerWin ? 6 : 4)) + 300 * h;
      d[res.from] -= a; d[w] += a;
      note = `Ron: pembuang membayar ${a}.`;
    }
    if (G.sticks) { d[w] += 1000 * G.sticks; note += ` + ${G.sticks} tongkat riichi (${1000 * G.sticks}).`; }
    const s = res.score;
    note = `${s.yakuman ? (s.limit) : `${s.han} han ${s.fu} fu${s.limit ? ' — ' + s.limit : ''}`}. ${note}${h ? ` (honba ${h}: +${h * 300})` : ''}`;
    return { delta: d, stays: dealerWin, sticksTaken: true, note };
  },
  /** seri: pemain Ting menerima total 3000 dari yang tidak Ting; dealer lanjut bila Ting */
  draw(G, tenpai) {
    const d = [0, 0, 0, 0], n = tenpai.filter(Boolean).length;
    if (n > 0 && n < 4) for (let q = 0; q < 4; q++) d[q] += tenpai[q] ? 3000 / n : -3000 / (4 - n);
    return { delta: d, stays: !!tenpai[G.dealer], tenpaiPay: true,
      note: n === 0 ? 'Seri — tidak ada yang Ting.' : n === 4 ? 'Seri — semua Ting.' : `Seri — ${n} pemain Ting menerima ${3000 / n} masing-masing dari yang tidak Ting.` };
  },
  doraNext: _doraNext,
};

const MJN_VARIANTS = { hk: VAR_HK, tw: VAR_TW, jp: VAR_JP };
/** set kartu satu permainan: [{id, k, red?}] */
function mjnMakeTiles(V) {
  const t = []; let id = 0;
  for (let k = 0; k < 34; k++) for (let c = 0; c < 4; c++) t.push({ id: id++, k, red: V.red && c === 0 && (k === 4 || k === 13 || k === 22) });
  if (V.flowers) for (let k = 34; k < 42; k++) t.push({ id: id++, k });
  return t;
}
if (typeof module !== 'undefined') module.exports = { MJN_VARIANTS, mjnMakeTiles, scoreTaiwan, scoreRiichi, mjnReadings };
