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

const DOT_POS = {
  1: [[2,2]],
  2: [[1,2],[3,2]],
  3: [[1,1],[2,2],[3,3]],
  4: [[1,1],[1,3],[3,1],[3,3]],
  5: [[1,1],[1,3],[2,2],[3,1],[3,3]],
  6: [[1,1],[1,3],[2,1],[2,3],[3,1],[3,3]],
  7: [[1,1],[1,2],[1,3],[2,1],[2,3],[3,1],[3,3]],
  8: [[1,1],[1,2],[1,3],[2,1],[2,3],[3,1],[3,2],[3,3]],
  9: [[1,1],[1,2],[1,3],[2,1],[2,2],[2,3],[3,1],[3,2],[3,3]],
};
const DOT_COL = {
  1:['c3'], 2:['c1','c2'], 3:['c1','c3','c2'], 4:['c1','c2','c2','c1'], 5:['c1','c2','c3','c2','c1'],
  6:['c2','c2','c3','c3','c3','c3'], 7:['c2','c2','c2','c3','c3','c3','c3'], 8:Array(8).fill('c1'),
  9:['c1','c1','c1','c3','c3','c3','c2','c2','c2'],
};
const BAM_POS = {
  1: [[2,2]],
  2: [[1,2],[3,2]],
  3: [[1,2],[3,1],[3,3]],
  4: [[1,1],[1,3],[3,1],[3,3]],
  5: [[1,1],[1,3],[2,2],[3,1],[3,3]],
  6: [[1,1],[1,2],[1,3],[3,1],[3,2],[3,3]],
  7: [[1,2],[2,1],[2,2],[2,3],[3,1],[3,2],[3,3]],
  8: [[1,1],[1,2],[1,3],[2,1],[2,3],[3,1],[3,2],[3,3]],
  9: DOT_POS[9],
};
const BAM_COL = {
  1:['c3'], 2:['c2','c2'], 3:['c2','c2','c2'], 4:['c2','c1','c1','c2'], 5:['c2','c2','c3','c2','c2'],
  6:['c2','c2','c2','c1','c1','c1'], 7:['c3','c2','c2','c2','c2','c2','c2'], 8:['c2','c2','c2','c3','c3','c2','c2','c2'],
  9:['c2','c3','c1','c2','c3','c1','c2','c3','c1'],
};

function tileFace(k) {
  if (k < 9) return `<span class="tn">${NUM_CH[k]}</span><span class="ts">萬</span>`;
  if (k < 18) {
    const n = k - 8;
    return `<span class="corner">${n}</span><span class="dots d${n}">${DOT_POS[n].map(([r, c], i) => `<i class="${DOT_COL[n][i]}" style="grid-area:${r}/${c}"></i>`).join('')}</span>`;
  }
  if (k < 27) {
    const n = k - 17;
    return `<span class="corner">${n}</span><span class="bams b${n}">${BAM_POS[n].map(([r, c], i) => `<i class="${BAM_COL[n][i]}" style="grid-area:${r}/${c}"></i>`).join('')}</span>`;
  }
  if (k < 31) return `<span class="corner">${WIND_SHORT[k - 27]}</span><span class="big wind">${WIND_CH[k - 27]}</span>`;
  if (k === 31) return `<span class="big red">中</span>`;
  if (k === 32) return `<span class="big grn">發</span>`;
  if (k === 33) return `<span class="bai"></span>`;
  if (k < 38) return `<span class="corner">${k - 33}</span><span class="big fl">${FLOWER_CH[k - 34]}</span><span class="fsub">${FLOWER_ID[k - 34]}</span>`;
  return `<span class="corner">${k - 37}</span><span class="big se">${SEASON_CH[k - 38]}</span><span class="fsub">${SEASON_ID[k - 38]}</span>`;
}

function tileHTML(k, opt = {}) {
  const cls = opt.cls || '';
  const id = opt.id != null ? ` data-id="${opt.id}"` : '';
  return `<div class="tile ${cls}"${id} title="${tileName(k)}">${tileFace(k)}</div>`;
}
function backHTML(cls = '') { return `<div class="tile back ${cls}"></div>`; }
function tilesHTML(ks, cls = 'sm') { return ks.map(k => tileHTML(k, { cls })).join(''); }
