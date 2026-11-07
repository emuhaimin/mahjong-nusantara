/* progress.js — tingkat pemain (rank) & badge pencapaian.
   Dipakai bersama: server (server/stats.js menghitung dari riwayat sesi) & browser (js/account.js menampilkan).
   Jenjang terinspirasi sistem peringkat platform mahjong daring (mis. Mahjong Soul: Novice → Celestial,
   Tenhou: kyu/dan), dengan nama bernuansa Nusantara + istilah Tionghoa mahjong Hong Kong. */

const MJN_TIERS = [
  { id: 'pemula', zh: '新手', ch: '新', name: 'Pemula', color: '#7d8c84', subs: [0, 20, 50], desc: 'Baru mengenal meja: belajar kartu, Ting, dan cara menang.' },
  { id: 'pemain', zh: '雀士', ch: '士', name: 'Pemain', color: '#b8733a', subs: [100, 160, 230], desc: 'Sudah lancar bermain dan mulai sering Hu.' },
  { id: 'jagoan', zh: '雀傑', ch: '傑', name: 'Jagoan', color: '#8e9aa3', subs: [320, 430, 560], desc: 'Paham efisiensi kartu. Mulai tier ini, posisi ke-4 mengurangi poin.' },
  { id: 'pendekar', zh: '雀豪', ch: '豪', name: 'Pendekar', color: '#d4a531', subs: [720, 900, 1100], desc: 'Membaca lawan, bertahan, dan mengejar fan besar.' },
  { id: 'suhu', zh: '雀聖', ch: '聖', name: 'Suhu', color: '#1f9e6e', subs: [1350, 1650, 2000], desc: 'Guru meja — konsisten juara melawan bot terkuat & pemain Online.' },
  { id: 'dewa', zh: '雀神', ch: '神', name: 'Dewa Mahjong', color: '#b3262e', subs: [2500], desc: 'Puncak tertinggi. Poin terus bertambah tanpa batas.' },
];
const MJN_ROMAN = ['I', 'II', 'III'];

/* ---------- poin peringkat (RP) ---------- */
const MJN_RP = {
  place: [40, 15, 0, -15],                  // posisi akhir sesi lengkap (−15 hanya mulai tier Jagoan)
  win: 2,                                   // tiap hand menang (+ setengah fan, dibulatkan ke bawah)
  vs: { easy: 0.4, medium: 0.8, hard: 1, expert: 1.3, mix: 1 },   // lawan bot
  online: 1.2,                              // meja Online (lawan manusia/bot)
  len: { one: 0.25, east: 1, full: 2 },     // 1 hand · 1 ronde angin · 4 ronde angin
};
function mjnTierAt(rp) {
  let ti = 0, si = 0;
  MJN_TIERS.forEach((t, i) => t.subs.forEach((min, j) => { if (rp >= min) { ti = i; si = j; } }));
  return { ti, si };
}
function mjnRankFromRp(rp) {
  const { ti, si } = mjnTierAt(rp), t = MJN_TIERS[ti];
  const floor = t.subs[si];
  const nextMin = t.subs[si + 1] != null ? t.subs[si + 1] : (MJN_TIERS[ti + 1] ? MJN_TIERS[ti + 1].subs[0] : null);
  const nextName = nextMin == null ? null : t.subs[si + 1] != null ? `${t.name} ${MJN_ROMAN[si + 1]}` : `${MJN_TIERS[ti + 1].name}${MJN_TIERS[ti + 1].subs.length > 1 ? ' I' : ''}`;
  return {
    rp, tier: t.id, tierIndex: ti, sub: si, label: t.subs.length > 1 ? `${t.name} ${MJN_ROMAN[si]}` : t.name,
    floor, next: nextMin, nextName, pct: nextMin == null ? 100 : Math.floor((rp - floor) / (nextMin - floor) * 100),
  };
}
const isWinHand = h => h.r === 'win' || h.r === 'zimo';
/** RP dari daftar sesi (urut waktu). Tidak bisa turun di bawah batas tier yang sudah dicapai. */
function mjnComputeRp(records) {
  let rp = 0, tierFloor = 0;
  for (const r of records) {
    const vs = r.mode === 'online' ? MJN_RP.online : (MJN_RP.vs[r.level] != null ? MJN_RP.vs[r.level] : 0.8);
    let g = 0;
    for (const h of r.hands || []) if (isWinHand(h)) g += MJN_RP.win + Math.floor((h.fan || 0) / 2);
    if (r.complete && r.rank >= 1 && r.rank <= 4) {
      let pl = MJN_RP.place[r.rank - 1];
      if (pl < 0 && mjnTierAt(rp).ti < 2) pl = 0;
      g += pl * (MJN_RP.len[r.length] != null ? MJN_RP.len[r.length] : 1);
    }
    rp = Math.max(tierFloor, Math.round((rp + g * vs) * 10) / 10);
    tierFloor = Math.max(tierFloor, MJN_TIERS[mjnTierAt(rp).ti].subs[0]);
  }
  return Math.round(rp);
}

/* ---------- badge ---------- */
// rarity: bronze · silver · gold · jade · need: target (untuk progres) · test(ctx) → angka progres
const MJN_BADGES = [
  { id: 'first_game', ch: '始', name: 'Langkah Pertama', desc: 'Selesaikan 1 sesi permainan.', rarity: 'bronze', need: 1, test: c => c.complete },
  { id: 'first_win', ch: '胡', name: 'Hu Pertama', desc: 'Menangkan 1 hand.', rarity: 'bronze', need: 1, test: c => c.wins },
  { id: 'first_zimo', ch: '摸', name: 'Zimo Pertama', desc: 'Menang dengan kartu ambilan sendiri.', rarity: 'bronze', need: 1, test: c => c.zimo },
  { id: 'ping_hu', ch: '平', name: 'Semua Chow', desc: 'Menang dengan pola Semua Chow (Ping Hu).', rarity: 'bronze', need: 1, test: c => c.pat('Semua Chow') },
  { id: 'quick_ting', ch: '速', name: 'Ting Kilat', desc: 'Mencapai Ting dalam 5 giliran atau kurang.', rarity: 'bronze', need: 1, test: c => c.quickTing },
  { id: 'sessions_10', ch: '十', name: 'Pemain Setia', desc: 'Selesaikan 10 sesi.', rarity: 'silver', need: 10, test: c => c.complete },
  { id: 'wins_10', ch: '勝', name: '10 Kemenangan', desc: 'Menangkan 10 hand.', rarity: 'silver', need: 10, test: c => c.wins },
  { id: 'first_place', ch: '冠', name: 'Juara Meja', desc: 'Juara 1 di akhir sesi lengkap.', rarity: 'silver', need: 1, test: c => c.firsts },
  { id: 'clean', ch: '守', name: 'Tembok Baja', desc: 'Sesi lengkap (min. 4 hand) tanpa sekali pun kena tembak.', rarity: 'silver', need: 1, test: c => c.clean },
  { id: 'all_pong', ch: '對', name: 'Semua Pong', desc: 'Menang dengan pola Semua Pong.', rarity: 'silver', need: 1, test: c => c.pat('Semua Pong') },
  { id: 'half_flush', ch: '混', name: 'Satu Warna Campur', desc: 'Menang dengan satu suit + kartu huruf.', rarity: 'silver', need: 1, test: c => c.pat('Satu Warna Campur') },
  { id: 'seven_pairs', ch: '七', name: 'Tujuh Pasang', desc: 'Menang dengan tujuh pasangan.', rarity: 'silver', need: 1, test: c => c.pat('Tujuh Pasang') },
  { id: 'flower_set', ch: '花', name: 'Taman Bunga', desc: 'Mengumpulkan satu set lengkap bunga atau musim saat menang.', rarity: 'silver', need: 1, test: c => c.pat('Satu Set Bunga') + c.pat('Satu Set Musim') },
  { id: 'last_tile', ch: '月', name: 'Bulan di Dasar Laut', desc: 'Menang dengan kartu terakhir tembok.', rarity: 'silver', need: 1, test: c => c.pat('Kartu Terakhir') },
  { id: 'kong_bloom', ch: '槓', name: 'Mekar di Atas Kong', desc: 'Menang dengan kartu pengganti setelah Kong.', rarity: 'silver', need: 1, test: c => c.pat('Menang dari Kong') },
  { id: 'marathon', ch: '圈', name: 'Maraton', desc: 'Selesaikan permainan 4 ronde angin penuh.', rarity: 'silver', need: 1, test: c => c.fullDone },
  { id: 'sessions_50', ch: '五', name: 'Penghuni Meja', desc: 'Selesaikan 50 sesi.', rarity: 'gold', need: 50, test: c => c.complete },
  { id: 'wins_100', ch: '百', name: '100 Kemenangan', desc: 'Menangkan 100 hand.', rarity: 'gold', need: 100, test: c => c.wins },
  { id: 'big_hand', ch: '大', name: 'Tangan Besar', desc: 'Menang dengan 7 fan atau lebih.', rarity: 'gold', need: 1, test: c => c.big7 },
  { id: 'full_flush', ch: '清', name: 'Satu Warna Murni', desc: 'Menang dengan satu suit saja, tanpa huruf.', rarity: 'gold', need: 1, test: c => c.pat('Satu Warna Murni') },
  { id: 'dragons', ch: '中', name: 'Tiga Naga', desc: 'Menang dengan Tiga Naga Kecil atau Besar.', rarity: 'gold', need: 1, test: c => c.pat('Tiga Naga Kecil') + c.pat('Tiga Naga Besar') },
  { id: 'expert_slayer', ch: '龍', name: 'Penakluk Expert', desc: 'Juara 1 sesi lengkap melawan bot Expert.', rarity: 'gold', need: 1, test: c => c.expertFirsts },
  { id: 'online_champ', ch: '網', name: 'Juara Online', desc: 'Juara 1 sesi lengkap di meja Online.', rarity: 'gold', need: 1, test: c => c.onlineFirsts },
  { id: 'limit', ch: '滿', name: 'Tangan Maksimal', desc: 'Menang dengan 13 fan (batas maksimal).', rarity: 'jade', need: 1, test: c => c.limit },
  { id: 'winds', ch: '喜', name: 'Empat Angin', desc: 'Menang dengan Empat Angin Kecil atau Besar.', rarity: 'jade', need: 1, test: c => c.pat('Empat Angin Kecil') + c.pat('Empat Angin Besar') },
  { id: 'orphans', ch: '么', name: 'Tiga Belas Yatim', desc: 'Menang dengan Tiga Belas Yatim.', rarity: 'jade', need: 1, test: c => c.pat('Tiga Belas Yatim') },
];

/** hitung semua badge dari riwayat sesi → [{id, have, need, earned}] */
function mjnBadges(records) {
  const pats = {};
  const c = { complete: 0, wins: 0, zimo: 0, firsts: 0, expertFirsts: 0, onlineFirsts: 0, clean: 0, fullDone: 0, quickTing: 0, big7: 0, limit: 0 };
  for (const r of records) {
    const hands = r.hands || [];
    if (r.complete) {
      c.complete++;
      if (r.length === 'full') c.fullDone++;
      if (hands.length >= 4 && !hands.some(h => h.r === 'dealin')) c.clean++;
      if (r.rank === 1) { c.firsts++; if (r.mode === 'online') c.onlineFirsts++; else if (r.level === 'expert') c.expertFirsts++; }
    }
    for (const h of hands) {
      if (h.tenpaiAt != null && h.tenpaiAt <= 5) c.quickTing++;
      if (!isWinHand(h)) continue;
      c.wins++; if (h.r === 'zimo') c.zimo++;
      if ((h.fan || 0) >= 7) c.big7++;
      if ((h.fan || 0) >= 13) c.limit++;
      const seen = new Set((h.items || []).map(x => String(x[0]).replace(/ ×\d+$/, '').replace(/ \(.*\)$/, '')));
      if (h.pattern) seen.add(h.pattern);
      seen.forEach(n => { pats[n] = (pats[n] || 0) + 1; });
    }
  }
  c.pat = n => pats[n] || 0;
  return MJN_BADGES.map(b => { const have = b.test(c); return { id: b.id, have: Math.min(have, b.need), need: b.need, earned: have >= b.need }; });
}

if (typeof module !== 'undefined') module.exports = { MJN_TIERS, MJN_BADGES, MJN_RP, mjnComputeRp, mjnRankFromRp, mjnBadges };
