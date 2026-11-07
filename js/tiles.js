/* tiles.js — definisi & tampilan kartu mahjong
   Indeks jenis kartu (k):
   0-8   Wan (karakter 萬) 1-9
   9-17  Tong (bulatan 筒) 1-9
   18-26 Tiao (bambu 索) 1-9
   27-30 Angin: Timur, Selatan, Barat, Utara
   31-33 Naga: Merah 中, Hijau 發, Putih 白
   34-37 Bunga: Plum, Anggrek, Krisan, Bambu (1-4)
   38-41 Musim: Semi, Panas, Gugur, Dingin (1-4)
*/
const NUM_CH = ['一','二','三','四','五','六','七','八','九'];
const WIND_CH = ['東','南','西','北'];
const WIND_ID = ['Timur','Selatan','Barat','Utara'];
const WIND_SHORT = ['T','S','B','U'];
const DRAGON_CH = ['中','發','白'];
const DRAGON_ID = ['Naga Merah','Naga Hijau','Naga Putih'];
const FLOWER_CH = ['梅','蘭','菊','竹'];
const FLOWER_ID = ['Plum','Anggrek','Krisan','Bambu'];
const SEASON_CH = ['春','夏','秋','冬'];
const SEASON_ID = ['Semi','Panas','Gugur','Dingin'];
const SUIT_ID = ['Wan','Tong','Tiao'];
const SUIT_DESC = ['Karakter','Bulatan','Bambu'];

const TK = {
  isSuit: k => k < 27,
  suit: k => Math.floor(k / 9),
  num: k => k % 9 + 1,
  isHonor: k => k >= 27 && k < 34,
  isWind: k => k >= 27 && k <= 30,
  isDragon: k => k >= 31 && k <= 33,
  isBonus: k => k >= 34,
  isTerminal: k => k < 27 && (k % 9 === 0 || k % 9 === 8),
};
TK.isOrphan = k => TK.isTerminal(k) || TK.isHonor(k);

function tileName(k) {
  if (k < 27) return `${k % 9 + 1} ${SUIT_ID[Math.floor(k / 9)]}`;
  if (k < 31) return `Angin ${WIND_ID[k - 27]}`;
  if (k < 34) return DRAGON_ID[k - 31];
  if (k < 38) return `Bunga ${FLOWER_ID[k - 34]}`;
  return `Musim ${SEASON_ID[k - 38]}`;
}

/* Gambar kartu: FluffyStuff riichi-mahjong-tiles (public domain / CC0),
   Naga Putih berbingkai biru & Bunga/Musim dibuat untuk situs ini. */
const TILE_BASE = 'assets/tiles/';
const TILE_VER = '1'; // naikkan jika gambar kartu diganti (agar cache browser diperbarui)
const HONOR_IMG = ['Ton', 'Nan', 'Shaa', 'Pei', 'Chun', 'Hatsu', 'Haku'];
function tileImg(k) {
  if (k < 9) return 'Man' + (k + 1);
  if (k < 18) return 'Pin' + (k - 8);
  if (k < 27) return 'Sou' + (k - 17);
  return HONOR_IMG[k - 27];
}

function tileFace(k) {
  if (k >= 34) {
    const i = (k - 34) % 4, fl = k < 38;
    return `<span class="corner">${i + 1}</span><span class="big ${fl ? 'fl' : 'se'}">${fl ? FLOWER_CH[i] : SEASON_CH[i]}</span><span class="fsub">${fl ? FLOWER_ID[i] : SEASON_ID[i]}</span>`;
  }
  let h = `<img class="tf" src="${TILE_BASE}${tileImg(k)}.svg?v=${TILE_VER}" alt="" draggable="false">`;
  if (k < 9) h += `<span class="corner">${k + 1}</span>`;                 // bantu baca angka Tionghoa
  else if (k >= 27 && k < 31) h += `<span class="corner">${WIND_SHORT[k - 27]}</span>`;
  return h;
}

function tileHTML(k, opt = {}) {
  const cls = opt.cls || '';
  const id = opt.id != null ? ` data-id="${opt.id}"` : '';
  return `<div class="tile ${cls}"${id} title="${tileName(k)}">${tileFace(k)}</div>`;
}
function backHTML(cls = '') { return `<div class="tile back ${cls}"></div>`; }
function tilesHTML(ks, cls = 'sm') { return ks.map(k => tileHTML(k, { cls })).join(''); }
