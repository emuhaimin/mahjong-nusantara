/* learn.js — simulasi belajar langkah demi langkah */
const Learn = (() => {
  const $ = s => document.querySelector(s);
  const rnd = n => Math.floor(Math.random() * n);
  const sum = a => a.reduce((x, y) => x + y, 0);
  const dieCh = v => String.fromCodePoint(0x267F + v);
  const NAMES = ['Kamu', 'Budi', 'Sari', 'Andi'];
  const POSN = ['bawah', 'kanan', 'atas', 'kiri'];
  let cur = 0, timers = [], seen = new Set();
  const st = { dealer: 0, dice: null, kinds: null };

  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };
  const clear = () => { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = []; };
  const T = (ks, cls = 'sm') => tilesHTML(ks, cls);
  const grp = (ks, label, cls = 'sm') => `<div class="ex"><div class="grp">${T(ks, cls)}</div><small>${label}</small></div>`;
  const windOf = p => (p - st.dealer + 4) % 4;
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function ensureKinds() {
    if (st.kinds) return;
    const ks = [];
    for (let k = 0; k < 34; k++) for (let c = 0; c < 4; c++) ks.push(k);
    for (let k = 34; k < 42; k++) ks.push(k);
    st.kinds = shuffle(ks);
  }
  function ensureDice() { if (!st.dice) st.dice = [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)]; }

  /* ---------- papan tembok ---------- */
  function stackRect(w, i) {
    const L = 3.6, D = 4;
    switch (w) {
      case 0: return { x: 84.8 - (i + 1) * L, y: 80, w: L, h: D };
      case 1: return { x: 80, y: 15.2 + i * L, w: D, h: L };
      case 2: return { x: 15.2 + i * L, y: 16, w: L, h: D };
      default: return { x: 16, y: 84.8 - (i + 1) * L, w: D, h: L };
    }
  }
  function board(el, { walls = true, built = true } = {}) {
    let h = '<div class="wb">';
    for (let p = 0; p < 4; p++) {
      const w = windOf(p);
      h += `<div class="wb-label l${p}">${NAMES[p]}<br><b class="zh">${WIND_CH[w]}</b> ${WIND_ID[w]}${w === 0 ? '<br>Dealer' : ''}</div>`;
    }
    if (walls) for (let w = 0; w < 4; w++) for (let i = 0; i < 18; i++) {
      const r = stackRect(w, i);
      h += `<div class="stk${built ? '' : ' hidden'}" data-w="${w}" data-i="${i}" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%"></div>`;
    }
    h += '<div class="wb-center"></div></div>';
    el.insertAdjacentHTML('beforeend', h);
    const all = el.querySelectorAll('.wb'), root = all[all.length - 1];
    return {
      root,
      stk: (w, i) => root.querySelector(`.stk[data-w="${w}"][data-i="${i}"]`),
      center: root.querySelector('.wb-center'),
      label: p => root.querySelector('.l' + p),
    };
  }
  function dealOrder() {
    const N = sum(st.dice), w0 = (st.dealer + N - 1) % 4, order = [];
    let w = w0, i = N;
    for (let c = 0; c < 72; c++) { if (i >= 18) { w = (w + 3) % 4; i = 0; } order.push([w, i]); i++; }
    return order;
  }

  /* ---------- isi pelajaran ---------- */
  const steps = [
    {
      t: 'Apa itu Mahjong?',
      b: `<p>Mahjong adalah permainan 4 orang memakai 144 kartu (sering disebut “batu”). Tujuannya: menjadi yang pertama menyusun <b>tangan lengkap</b> — biasanya <b>4 set + 1 pasangan (mata)</b> = 14 kartu.</p>
          <p>Di Indonesia, mahjong paling banyak dimainkan dengan <b>gaya Hong Kong</b>: 144 kartu termasuk bunga, sistem nilai <b>fan</b> (sering juga disebut <i>tai</i>), dan klaim Chow/Pong/Kong. Situs ini memakai aturan itu.</p>
          <div class="tip">Urutan belajar: kenal kartu → duduk & angin → tentukan dealer → kocok → susun tembok → pecah tembok → bagi kartu → bunga → set → giliran & klaim → menang → hitung fan & poin.</div>`,
      s(el) {
        el.innerHTML = `<div class="felt"><div class="ex-row">${grp([1, 2, 3], 'Chow')}${grp([13, 13, 13], 'Pong')}${grp([31, 31, 31], 'Pong Naga')}${grp([22, 23, 24], 'Chow')}${grp([27, 27], 'Mata')}</div><p style="margin:10px 0 0;font-size:14px">Contoh tangan lengkap: 4 set + 1 mata.</p></div>`;
      },
    },
    {
      t: 'Mengenal 144 Kartu',
      b: `<p>Ada tiga <b>suit</b> angka (masing-masing 1–9, tiap kartu ada 4 lembar), kartu <b>huruf</b> (angin & naga, 4 lembar), serta <b>bunga & musim</b> (masing-masing 1 lembar) sebagai bonus.</p>
          <p>Total: 108 suit + 16 angin + 12 naga + 8 bunga/musim = <b>144 kartu</b>.</p>`,
      s(el) {
        const groups = [
          ['Wan — Karakter (萬)', '9 jenis × 4 = 36 kartu. Angka Tionghoa di atas, huruf 萬 merah di bawah.', [0, 1, 2, 3, 4, 5, 6, 7, 8]],
          ['Tong — Bulatan (筒)', '9 jenis × 4 = 36 kartu. Hitung jumlah bulatannya.', [9, 10, 11, 12, 13, 14, 15, 16, 17]],
          ['Tiao — Bambu (索)', '9 jenis × 4 = 36 kartu. Hitung jumlah batang bambunya.', [18, 19, 20, 21, 22, 23, 24, 25, 26]],
          ['Angin', '4 jenis × 4 = 16 kartu: 東 Timur, 南 Selatan, 西 Barat, 北 Utara.', [27, 28, 29, 30]],
          ['Naga', '3 jenis × 4 = 12 kartu: 中 Merah, 發 Hijau, 白 Putih (kotak biru).', [31, 32, 33]],
          ['Bunga & Musim (bonus)', '8 kartu, masing-masing 1 lembar. Tidak dipakai menyusun set — langsung dibuka & diganti.', [34, 35, 36, 37, 38, 39, 40, 41]],
        ];
        el.innerHTML = groups.map(([h, p, ks]) => `<div class="tile-group"><h4>${h}</h4><p>${p}</p><div class="tile-row">${ks.map(k => `<figure>${tileHTML(k, { cls: 'md' })}<figcaption>${tileName(k)}</figcaption></figure>`).join('')}</div></div>`).join('');
      },
    },
    {
      t: 'Tempat Duduk & Angin',
      b: `<p>Setiap pemain mendapat <b>angin kursi</b>. Dealer selalu <b>Timur (東)</b>. Dari dealer, angin berikutnya berjalan <b>berlawanan arah jarum jam</b>: pemain di kanan dealer = Selatan, seberang = Barat, kiri = Utara.</p>
          <p>Giliran bermain juga berlawanan arah jarum jam: setelah kamu, giliran pindah ke pemain di <b>kananmu</b>. Artinya, kartu buangan yang bisa kamu Chow datang dari pemain di <b>kirimu</b>.</p>
          <div class="tip">Selain angin kursi, ada <b>angin ronde</b> (dimulai dari Timur). Pong angin kursi atau angin ronde memberi tambahan fan.</div>`,
      s(el) {
        const b = board(el, { walls: false });
        b.center.innerHTML = '<div class="wb-arrow">↺</div><div>Giliran berjalan<br><b>berlawanan arah jarum jam</b></div>';
      },
    },
    {
      t: 'Menentukan Dealer',
      b: `<p>Cara yang umum: setiap pemain melempar <b>3 dadu</b>. Jumlah tertinggi menjadi <b>dealer (Timur)</b>. Jika seri, yang seri melempar ulang.</p>
          <p>Cara lain yang juga sering dipakai: mengambil acak 4 kartu angin tertutup — yang dapat 東 menjadi dealer. Hasilnya sama: satu orang jadi Timur, lalu angin lain mengikuti berlawanan arah jarum jam.</p>`,
      s(el) {
        const draw = (rolls, winner) => {
          el.querySelector('.players4').innerHTML = NAMES.map((n, p) => {
            const r = rolls && rolls[p];
            const w = winner != null ? (p - winner + 4) % 4 : null;
            return `<div class="pbox${winner === p ? ' win' : ''}"><b>${n}</b> <small class="muted">(${POSN[p]})</small><div class="dice">${r ? r.map(dieCh).join('') : '🎲'}</div><div class="tot">${r ? sum(r) : '–'}</div>${w != null ? `<div class="wn">${WIND_CH[w]}</div><small>${WIND_ID[w]}${w === 0 ? ' · Dealer' : ''}</small>` : ''}</div>`;
          }).join('');
        };
        el.innerHTML = `<div class="players4"></div><div class="stage-ctrl"><button class="btn" id="dl-roll">🎲 Lempar dadu</button></div><p class="stage-note" id="dl-note"></p>`;
        draw(null, null);
        let cands = [0, 1, 2, 3], rolls = {};
        el.querySelector('#dl-roll').onclick = () => {
          if (cands.length === 1) { cands = [0, 1, 2, 3]; rolls = {}; }
          cands.forEach(p => { rolls[p] = [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)]; });
          const max = Math.max(...cands.map(p => sum(rolls[p])));
          const top = cands.filter(p => sum(rolls[p]) === max);
          if (top.length > 1) {
            draw(rolls, null);
            el.querySelector('#dl-note').innerHTML = `Seri antara ${top.map(p => NAMES[p]).join(' & ')} (${max}). Mereka melempar ulang — tekan tombol lagi.`;
            cands = top;
          } else {
            st.dealer = top[0]; cands = top;
            draw(rolls, st.dealer);
            el.querySelector('#dl-note').innerHTML = `<b>${NAMES[st.dealer]}</b> mendapat ${max} — menjadi dealer (東 Timur). ${NAMES[(st.dealer + 1) % 4]} = Selatan, ${NAMES[(st.dealer + 2) % 4]} = Barat, ${NAMES[(st.dealer + 3) % 4]} = Utara. Dealer ini dipakai di langkah-langkah berikutnya.`;
            st.dice = null;
          }
        };
      },
    },
    {
      t: 'Mengocok Kartu',
      b: `<p>Semua kartu ditelungkupkan di tengah meja, lalu diaduk bersama oleh semua pemain dengan kedua tangan sampai benar-benar acak. Tidak ada yang boleh melihat muka kartu.</p>`,
      s(el) {
        el.innerHTML = `<div class="shuffle-area"></div><div class="stage-ctrl"><button class="btn" id="sh-btn">🀄 Kocok kartu</button></div><p class="stage-note" id="sh-note"></p>`;
        const area = el.querySelector('.shuffle-area');
        let h = '';
        for (let i = 0; i < 72; i++) h += '<div class="tile back sm"></div>';
        area.innerHTML = h;
        const tiles = [...area.children];
        const scatter = () => tiles.forEach(t => { t.style.left = (4 + Math.random() * 86) + '%'; t.style.top = (4 + Math.random() * 78) + '%'; t.style.transform = `rotate(${rnd(360)}deg)`; });
        scatter();
        el.querySelector('#sh-btn').onclick = () => {
          let n = 0;
          el.querySelector('#sh-note').textContent = 'Mengocok…';
          clear();
          every(() => { scatter(); if (++n >= 8) { clear(); el.querySelector('#sh-note').textContent = 'Kartu sudah teracak! Selanjutnya, setiap pemain menyusun tembok di depannya.'; st.kinds = null; ensureKinds(); } }, 260);
        };
      },
    },
    {
      t: 'Menyusun Tembok',
      b: `<p>Setiap pemain menyusun <b>tembok</b> di depannya: <b>18 tumpukan</b>, masing-masing <b>2 kartu</b> bertingkat (36 kartu). Empat tembok membentuk persegi di tengah meja: 4 × 36 = 144 kartu.</p>`,
      s(el) {
        const b = board(el, { built: false });
        el.insertAdjacentHTML('beforeend', `<div class="stage-ctrl"><button class="btn" id="wb-build">🧱 Susun tembok</button></div><p class="stage-note" id="wb-note"></p>`);
        b.center.innerHTML = '<div>4 tembok × 18 tumpukan × 2 kartu</div>';
        el.querySelector('#wb-build').onclick = () => {
          clear();
          el.querySelectorAll('.stk').forEach(s => s.classList.add('hidden'));
          let i = 0;
          every(() => {
            for (let w = 0; w < 4; w++) b.stk(w, i).classList.remove('hidden');
            if (++i >= 18) { clear(); el.querySelector('#wb-note').textContent = 'Tembok selesai: 72 tumpukan = 144 kartu.'; }
          }, 70);
        };
      },
    },
    {
      t: 'Memecah Tembok',
      b: `<p>Dealer melempar <b>3 dadu</b> dan menjumlahkannya (3–18).</p>
          <ol><li>Hitung pemain mulai dari dealer = 1, berlawanan arah jarum jam (dealer, kanan, seberang, kiri, dealer lagi, …). Tembok milik pemain yang kena hitungan terakhir akan dipecah.</li>
          <li>Pada tembok itu, hitung sejumlah angka dadu <b>dari ujung kanan</b> (dilihat dari pemilik tembok).</li>
          <li>Kartu diambil mulai dari tumpukan berikutnya (warna emas), bergerak <b>searah jarum jam</b>. Tumpukan yang terhitung (biru) menjadi <b>ujung belakang</b> — sumber kartu pengganti bunga & Kong.</li></ol>`,
      s(el) {
        const b = board(el);
        el.insertAdjacentHTML('beforeend', `<div class="stage-ctrl"><button class="btn" id="br-roll">🎲 Dealer lempar dadu</button></div><p class="stage-note" id="br-note"></p>`);
        b.center.innerHTML = `<div>Dealer: <b>${NAMES[st.dealer]}</b></div>`;
        el.querySelector('#br-roll').onclick = () => {
          clear();
          st.dice = [1 + rnd(6), 1 + rnd(6), 1 + rnd(6)];
          const N = sum(st.dice), w0 = (st.dealer + N - 1) % 4;
          el.querySelectorAll('.stk').forEach(s => s.className = 'stk');
          el.querySelectorAll('.wb-label').forEach(s => s.classList.remove('hl'));
          b.center.innerHTML = `<div class="dice">${st.dice.map(dieCh).join('')}</div><div>Jumlah: <b>${N}</b></div>`;
          const note = el.querySelector('#br-note');
          let c = 0;
          every(() => {
            el.querySelectorAll('.wb-label').forEach(s => s.classList.remove('hl'));
            const p = (st.dealer + c) % 4;
            b.label(p).classList.add('hl');
            note.innerHTML = `Menghitung pemain: <b>${c + 1}</b> → ${NAMES[p]}`;
            if (++c >= N) {
              clear();
              note.innerHTML = `Hitungan ${N} berhenti di <b>${NAMES[w0]}</b> → tembok ${NAMES[w0]} dipecah. Sekarang hitung ${N} tumpukan dari ujung kanan tembok itu…`;
              let i = 0;
              later(() => every(() => {
                b.stk(w0, i).classList.add('counted');
                if (++i >= N) {
                  clear();
                  b.stk(w0, N).classList.add('start');
                  if (N + 1 < 18) b.stk(w0, N + 1).classList.add('start');
                  note.innerHTML = `Biru = ${N} tumpukan yang dihitung (ujung belakang, untuk kartu pengganti). <b>Emas</b> = dealer mulai mengambil di sini, lalu searah jarum jam.`;
                }
              }, 120), 700);
            }
          }, Math.max(140, 700 - N * 30));
        };
      },
    },
    {
      t: 'Membagi Kartu',
      b: `<p>Mulai dari dealer, berlawanan arah jarum jam, setiap pemain mengambil <b>2 tumpukan (4 kartu)</b> sekaligus — diulang 3 kali (12 kartu). Lalu setiap pemain mengambil <b>1 kartu</b> lagi, dan dealer mengambil <b>1 kartu tambahan</b>.</p>
          <p>Hasilnya: <b>dealer 14 kartu</b>, pemain lain <b>13 kartu</b>. Dealer langsung memulai dengan membuang satu kartu.</p>`,
      s(el) {
        ensureKinds(); ensureDice();
        el.innerHTML = `<div class="learn-split"><div class="bwrap"></div><div><div class="stage-ctrl"><button class="btn" id="dh-step">Langkah berikutnya</button><button class="btn jade" id="dh-auto">▶ Otomatis</button><button class="btn ghost" id="dh-reset">Ulang</button></div><p class="stage-note" id="dh-note">Dadu pemecah: ${st.dice.join('+')} = ${sum(st.dice)}. Tekan “Langkah berikutnya”.</p><div class="deal-hands"></div></div></div>`;
        const b = board(el.querySelector('.bwrap'));
        const order = dealOrder();
        const N = sum(st.dice), w0 = (st.dealer + N - 1) % 4;
        for (let i = 0; i < N; i++) b.stk(w0, i).classList.add('counted');
        b.center.innerHTML = `<div class="dice">${st.dice.map(dieCh).join('')}</div><div>= ${N}</div>`;
        let ptr = 0, step = 0;
        const hands = [[], [], [], []];
        const plan = [];
        for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) plan.push({ p: (st.dealer + i) % 4, n: 4, txt: `Putaran ${r + 1}: ${NAMES[(st.dealer + i) % 4]} mengambil 2 tumpukan (4 kartu).` });
        for (let i = 0; i < 4; i++) plan.push({ p: (st.dealer + i) % 4, n: 1, txt: `${NAMES[(st.dealer + i) % 4]} mengambil 1 kartu.` });
        plan.push({ p: st.dealer, n: 1, txt: `Dealer (${NAMES[st.dealer]}) mengambil 1 kartu tambahan → 14 kartu.` });
        const renderHands = () => {
          el.querySelector('.deal-hands').innerHTML = NAMES.map((n, p) => `<div class="pbox"><b>${n}</b> <small class="muted">${WIND_CH[windOf(p)]} ${WIND_ID[windOf(p)]} · ${hands[p].length} kartu</small><div class="hand-line">${T(hands[p].slice().sort((a, b) => a - b), 'xs')}</div></div>`).join('');
        };
        const take = () => {
          const [w, i] = order[Math.floor(ptr / 2)];
          const s = b.stk(w, i);
          s.classList.remove('start');
          s.classList.add(ptr % 2 === 0 ? 'half' : 'gone');
          if (ptr % 2 === 1) s.classList.remove('half');
          return st.kinds[ptr++];
        };
        const doStep = () => {
          if (step >= plan.length) return false;
          const pl = plan[step++];
          for (let j = 0; j < pl.n; j++) hands[pl.p].push(take());
          renderHands();
          el.querySelector('#dh-note').innerHTML = pl.txt + (step >= plan.length ? ' <b>Selesai!</b> Kartu diurutkan agar mudah dibaca. Lihat: ada bunga? Itu dibahas di langkah berikutnya.' : '');
          return step < plan.length;
        };
        renderHands();
        el.querySelector('#dh-step').onclick = () => { clear(); doStep(); };
        el.querySelector('#dh-auto').onclick = () => { clear(); every(() => { if (!doStep()) clear(); }, 380); };
        el.querySelector('#dh-reset').onclick = () => { clear(); steps[cur].s(el); };
      },
    },
    {
      t: 'Bunga & Kartu Pengganti',
      b: `<p>Kartu <b>bunga/musim</b> tidak dipakai menyusun set. Begitu didapat, kartu itu <b>dibuka</b> di samping, lalu pemain mengambil <b>kartu pengganti dari ujung belakang tembok</b>. Setelah pembagian, dealer membuka dulu, lalu pemain lain berurutan.</p>
          <p>Bunga memberi fan jika nomornya sama dengan kursimu: <b>Timur=1, Selatan=2, Barat=3, Utara=4</b> (梅/春 = 1, 蘭/夏 = 2, 菊/秋 = 3, 竹/冬 = 4).</p>`,
      s(el) {
        const hand = [0, 1, 2, 12, 12, 20, 21, 27, 31, 31, 35, 40, 5];
        let flowers = [], h = hand.slice();
        const draw = msg => {
          el.innerHTML = `<div class="felt"><div class="badges"><span class="badge" style="color:#1d2722">Kursi: Selatan (2)</span></div><div class="hand-line">${T(h.slice().sort((a, b) => a - b), 'md')}</div><p style="margin:10px 0 4px">Bunga dibuka:</p><div class="hand-line" style="min-height:40px">${T(flowers, 'md')}</div></div><div class="stage-ctrl"><button class="btn" id="fl-go">Buka bunga & ambil pengganti</button><button class="btn ghost" id="fl-reset">Ulang</button></div><p class="stage-note">${msg}</p>`;
          el.querySelector('#fl-reset').onclick = () => { flowers = []; h = hand.slice(); draw(''); };
          el.querySelector('#fl-go').onclick = () => {
            const i = h.findIndex(k => k >= 34);
            if (i < 0) return draw('Tidak ada bunga lagi — tangan siap: 13 kartu.');
            const f = h.splice(i, 1)[0];
            flowers.push(f);
            const r = [8, 30][flowers.length - 1] ?? 14;
            h.push(r);
            draw(`${tileName(f)} dibuka. Pengganti dari ujung belakang: <b>${tileName(r)}</b>. ${(f - 34) % 4 === 1 ? 'Ini bunga kursi sendiri (nomor 2 = Selatan) → +1 fan nanti!' : 'Nomornya bukan 2, jadi tidak menambah fan untuk kursi Selatan.'}`);
          };
        };
        draw('Tangan ini berisi 2 kartu bonus. Tekan tombol untuk membukanya satu per satu.');
      },
    },
    {
      t: 'Set: Chow, Pong, Kong & Mata',
      b: `<ul><li><b>Chow (順子)</b> — 3 kartu angka <b>berurutan</b> dari suit yang sama, mis. 3-4-5 Tong. Kartu huruf tidak bisa Chow.</li>
          <li><b>Pong (刻子)</b> — 3 kartu <b>sama persis</b>.</li>
          <li><b>Kong (槓子)</b> — 4 kartu sama persis. Dihitung sebagai satu set; setelah Kong kamu wajib mengambil <b>kartu pengganti</b> dari ujung belakang.</li>
          <li><b>Mata / pasangan (將)</b> — 2 kartu sama. Tangan lengkap butuh tepat satu mata.</li></ul>
          <div class="tip">Set yang dibentuk dari buangan orang lain diletakkan <b>terbuka</b>. Set yang tersusun sendiri di tangan tetap <b>tertutup</b>.</div>`,
      s(el) {
        el.innerHTML = `<div class="felt"><div class="ex-row">${grp([11, 12, 13], 'Chow 3-4-5 Tong', 'md')}${grp([27, 27, 27], 'Pong Timur', 'md')}${grp([31, 31, 31, 31], 'Kong Naga Merah', 'md')}${grp([24, 24], 'Mata 7 Tiao', 'md')}</div>
          <p style="margin:14px 0 6px">Bukan set yang sah:</p><div class="ex-row">${grp([0, 1, 11], 'Beda suit', 'sm')}${grp([7, 8, 0], '8-9-1 tidak berurutan', 'sm')}${grp([27, 28, 29], 'Angin tidak bisa Chow', 'sm')}</div></div>`;
      },
    },
    {
      t: 'Giliran & Klaim',
      b: `<p>Pada giliranmu: <b>ambil 1 kartu</b> dari tembok, lalu <b>buang 1 kartu</b> ke tengah. Saat orang lain membuang, kamu boleh <b>mengklaim</b> kartu itu:</p>
          <ul><li><b>Hu (menang)</b> — siapa pun, prioritas tertinggi.</li>
          <li><b>Pong / Kong</b> — siapa pun, mengalahkan Chow. Giliran melompat ke pengklaim.</li>
          <li><b>Chow</b> — <b>hanya</b> dari pemain sebelummu (di kirimu).</li></ul>
          <p>Setelah Chow/Pong kamu langsung membuang 1 kartu (tanpa mengambil dari tembok). Setelah Kong, ambil kartu pengganti dulu.</p>`,
      s(el) {
        const sc = [
          { hand: [1, 2, 13, 13, 19, 20, 27, 27, 31, 32, 7, 8, 16], k: 13, from: 'seberang (atas)', ans: ['pong'], why: 'Kamu punya dua 5 Tong → boleh Pong dari siapa pun. Chow tidak bisa karena bukan dari pemain di kirimu.' },
          { hand: [1, 2, 9, 10, 20, 21, 27, 27, 31, 32, 7, 8, 16], k: 22, from: 'kiri (sebelummu)', ans: ['chow'], why: 'Kamu punya 3-4 Tiao dan kartu 5 Tiao datang dari kiri → boleh Chow 3-4-5.' },
          { hand: [1, 2, 9, 10, 20, 21, 27, 27, 31, 32, 7, 8, 16], k: 22, from: 'kanan (sesudahmu)', ans: ['skip'], why: 'Chow hanya boleh dari pemain di kirimu. Kamu tidak punya dua 5 Tiao, jadi tidak bisa Pong → lewati.' },
          { hand: [28, 28, 28, 0, 1, 2, 12, 13, 14, 20, 20, 33, 33], k: 28, from: 'kiri (sebelummu)', ans: ['kong', 'pong'], why: 'Kamu punya tiga Angin Selatan → boleh Kong (lalu ambil kartu pengganti) atau cukup Pong.' },
          { hand: [0, 1, 2, 9, 10, 11, 18, 19, 20, 27, 27, 27, 31], k: 31, from: 'seberang (atas)', ans: ['hu'], why: 'Naga Merah melengkapi mata — tanganmu jadi 4 set + 1 mata. Hu! Kemenangan mengalahkan semua klaim lain.' },
        ];
        let i = 0;
        const draw = () => {
          const s = sc[i];
          el.innerHTML = `<div class="felt"><p style="margin:0 0 8px">Soal ${i + 1}/${sc.length} — Tanganmu:</p><div class="hand-line">${T(s.hand.slice().sort((a, b) => a - b), 'md')}</div><p style="margin:12px 0 6px">Pemain di <b>${s.from}</b> membuang:</p>${tileHTML(s.k, { cls: 'lg' })}</div>
            <div class="quiz-opts">${[['hu', 'Hu (menang)'], ['kong', 'Kong'], ['pong', 'Pong'], ['chow', 'Chow'], ['skip', 'Lewati']].map(([v, l]) => `<button class="btn ghost" data-v="${v}">${l}</button>`).join('')}</div><div class="quiz-fb"></div>
            <div class="stage-ctrl"><button class="btn" id="cl-next" hidden>Soal berikutnya →</button></div>`;
          el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
            const ok = s.ans.includes(b.dataset.v);
            const fb = el.querySelector('.quiz-fb');
            fb.className = 'quiz-fb ' + (ok ? 'ok' : 'no');
            fb.innerHTML = (ok ? '✅ Benar! ' : '❌ Belum tepat. ') + s.why;
            el.querySelector('#cl-next').hidden = false;
          });
          el.querySelector('#cl-next').onclick = () => { i = (i + 1) % sc.length; draw(); };
        };
        draw();
      },
    },
    {
      t: 'Bentuk Tangan Menang',
      b: `<p>Tangan menang (Hu) yang sah:</p>
          <ul><li><b>Standar</b>: 4 set (Chow/Pong/Kong) + 1 mata.</li>
          <li><b>Tujuh Pasang</b>: 7 pasangan berbeda (tangan harus tertutup).</li>
          <li><b>Tiga Belas Yatim</b>: satu dari setiap 1 & 9 tiap suit, keempat angin, ketiga naga, ditambah satu kembaran.</li></ul>
          <p>Saat tanganmu tinggal butuh 1 kartu untuk menang, kamu sedang <b>Ting</b> (menunggu). Coba latihan berikut: apakah tangan ini sudah menang?</p>`,
      s(el) {
        const make = () => {
          const h = genWinningHand();
          let ks = [h.pair, h.pair]; h.sets.forEach(s => ks.push(...meldTiles(s)));
          let win = true;
          if (Math.random() < .5) {
            for (let t = 0; t < 50; t++) {
              const c = ks.slice(); c[rnd(14)] = rnd(34);
              if (toCounts(c).every(x => x <= 4) && !analyzeWin(c, 0)) { ks = c; win = false; break; }
            }
          }
          return { ks: ks.sort((a, b) => a - b), win };
        };
        let q = make();
        const draw = () => {
          el.innerHTML = `<div class="felt"><div class="hand-line">${T(q.ks, 'md')}</div></div><div class="quiz-opts"><button class="btn jade" data-v="1">Sudah menang</button><button class="btn ghost" data-v="0">Belum menang</button></div><div class="quiz-fb"></div><div class="stage-ctrl"><button class="btn" id="wq-next">Tangan lain →</button></div>`;
          el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
            const ans = b.dataset.v === '1', ok = ans === q.win;
            const fb = el.querySelector('.quiz-fb');
            fb.className = 'quiz-fb ' + (ok ? 'ok' : 'no');
            let ex = '';
            const a = analyzeWin(q.ks, 0);
            if (a && a.decomps.length) {
              const d = a.decomps[0];
              ex = `<div class="ex-row" style="margin-top:8px">${d.sets.map(s => grp(meldTiles(s), s.type === 'chow' ? 'Chow' : 'Pong', 'sm')).join('')}${grp([d.pair, d.pair], 'Mata', 'sm')}</div>`;
            } else if (a && a.sevenPairs) ex = ' (Tujuh Pasang)';
            fb.innerHTML = (ok ? '✅ Benar! ' : '❌ Kurang tepat. ') + (q.win ? 'Tangan ini menang:' + ex : 'Tangan ini belum bisa disusun menjadi 4 set + 1 mata.');
          });
          el.querySelector('#wq-next').onclick = () => { q = make(); draw(); };
        };
        draw();
      },
    },
    {
      t: 'Menghitung Fan',
      b: `<p>Setelah menang, hitung <b>fan</b> (nilai pola). Jumlahkan semua pola yang terpenuhi. Batas maksimal 13 fan. Banyak meja mewajibkan <b>minimal fan</b> (mis. 1 atau 3) agar boleh Hu — bisa diatur saat bermain.</p>`,
      s(el) {
        const ex = [
          { title: 'Contoh A — Satu Warna Campur', ctx: { concealed: [0, 0, 0, 1, 2, 3, 4, 5, 6, 31, 31, 31, 8, 8], melds: [], flowers: [35], seatWind: 1, roundWind: 0, selfDraw: false } },
          { title: 'Contoh B — Ping Hu + Zimo', ctx: { concealed: [9, 10, 11, 12, 13, 14, 24, 25, 26, 1, 2, 3, 22, 22], melds: [], flowers: [], seatWind: 2, roundWind: 0, selfDraw: true } },
          { title: 'Contoh C — Semua Pong terbuka', ctx: { concealed: [27, 27, 27, 5, 5], melds: [{ type: 'pong', k: 14, concealed: false }, { type: 'pong', k: 20, concealed: false }, { type: 'pong', k: 32, concealed: false }], flowers: [34, 38], seatWind: 0, roundWind: 0, selfDraw: false } },
        ];
        el.innerHTML = `<table class="tbl"><thead><tr><th>Pola</th><th>Keterangan</th><th>Fan</th></tr></thead><tbody>${FAN_LIST.map(([n, zh, f, d]) => `<tr><td><b>${n}</b> <span class="zh muted">${zh}</span></td><td>${d}</td><td class="num">${f}</td></tr>`).join('')}</tbody></table>` +
          ex.map(e => {
            const s = scoreWin(e.ctx);
            return `<div class="card" style="margin-bottom:12px"><h4>${e.title}</h4><div class="badges"><span class="badge">Kursi: ${WIND_ID[e.ctx.seatWind]}</span><span class="badge">Ronde: ${WIND_ID[e.ctx.roundWind]}</span><span class="badge">${e.ctx.selfDraw ? 'Zimo' : 'Dari buangan'}</span>${e.ctx.flowers.length ? `<span class="badge">Bunga: ${e.ctx.flowers.map(tileName).join(', ')}</span>` : ''}</div>
              <div class="felt"><div class="ex-row">${e.ctx.melds.map(m => grp(meldTiles(m), 'terbuka', 'sm')).join('')}${grp(e.ctx.concealed.slice().sort((a, b) => a - b), 'tertutup', 'sm')}</div></div>
              <table class="fan-table">${s.items.map(([n, f]) => `<tr><td>${n}</td><td>${f}</td></tr>`).join('')}<tfoot><tr><td>Total</td><td>${s.fan} fan → ${s.points} poin</td></tr></tfoot></table></div>`;
          }).join('');
      },
    },
    {
      t: 'Fan → Poin & Pembayaran',
      b: `<p>Total fan diubah menjadi <b>poin dasar</b> memakai tabel. Lalu pembayaran:</p>
          <ul><li><b>Zimo</b> (menang dari tembok): <b>setiap</b> lawan membayar 1 × poin dasar.</li>
          <li><b>Menang dari buangan</b>: <b>pembuang</b> membayar 2 × poin dasar; dua pemain lain tidak membayar.</li></ul>
          <div class="tip">Contoh: 3 fan = 8 poin. Zimo → tiap lawan bayar 8 (total +24). Menang dari buangan → pembuang bayar 16. Besaran ini adalah aturan rumah yang umum; tiap meja boleh menyepakati angka lain.</div>`,
      s(el) {
        el.innerHTML = `<table class="tbl"><thead><tr><th>Fan</th>${POINT_TABLE.map((_, i) => `<th>${i}${i === 10 ? '+' : ''}</th>`).join('')}</tr></thead><tbody><tr><td><b>Poin</b></td>${POINT_TABLE.map(p => `<td class="num">${p}</td>`).join('')}</tr></tbody></table>
          <div class="card"><h4>Kalkulator cepat</h4><div class="stage-ctrl"><label>Fan <input type="number" id="pc-fan" min="0" max="13" value="3" style="width:80px"></label><label class="chk"><input type="checkbox" id="pc-zimo"> Zimo</label></div><p class="stage-note" id="pc-out"></p></div>`;
        const calc = () => {
          const f = Math.max(0, Math.min(13, +el.querySelector('#pc-fan').value || 0)), p = fanPoints(f);
          el.querySelector('#pc-out').innerHTML = el.querySelector('#pc-zimo').checked
            ? `${f} fan = ${p} poin dasar. Zimo: 3 lawan masing-masing bayar <b>${p}</b> → pemenang +${p * 3}.`
            : `${f} fan = ${p} poin dasar. Dari buangan: pembuang bayar <b>${p * 2}</b> → pemenang +${p * 2}.`;
        };
        el.querySelector('#pc-fan').oninput = calc; el.querySelector('#pc-zimo').onchange = calc; calc();
      },
    },
    {
      t: 'Latihan Menghitung Fan',
      b: `<p>Tangan menang acak di bawah ini — hitung fan-nya, lalu periksa jawabanmu. Perhatikan angin kursi, angin ronde, cara menang, dan bunga.</p>`,
      s(el) {
        let q;
        const draw = () => {
          q = genScoringQuiz();
          el.innerHTML = `<div class="badges"><span class="badge">Kursi: ${WIND_CH[q.seatWind]} ${WIND_ID[q.seatWind]}</span><span class="badge">Ronde: ${WIND_CH[q.roundWind]} ${WIND_ID[q.roundWind]}</span><span class="badge">${q.selfDraw ? 'Zimo (ambil sendiri)' : 'Menang dari buangan'}</span></div>
            <div class="felt"><div class="ex-row">${q.melds.map(m => grp(meldTiles(m), 'terbuka', 'md')).join('')}${grp(q.concealed.slice().sort((a, b) => a - b), 'tertutup', 'md')}${q.flowers.length ? grp(q.flowers, 'bunga', 'sm') : ''}</div></div>
            <div class="stage-ctrl"><label>Jawabanmu: <input type="number" id="qz-in" min="0" max="13" style="width:80px"> fan</label><button class="btn" id="qz-check">Periksa</button><button class="btn ghost" id="qz-new">Soal baru</button></div><div id="qz-out"></div>`;
          el.querySelector('#qz-new').onclick = draw;
          el.querySelector('#qz-check').onclick = () => {
            const v = +el.querySelector('#qz-in').value, s = q.score;
            const ok = v === s.fan;
            el.querySelector('#qz-out').innerHTML = `<div class="quiz-fb ${ok ? 'ok' : 'no'}">${ok ? '✅ Tepat!' : `❌ Jawaban yang benar: ${s.fan} fan.`}</div><table class="fan-table">${s.items.map(([n, f]) => `<tr><td>${n}</td><td>${f}</td></tr>`).join('')}<tfoot><tr><td>Total</td><td>${s.fan} fan = ${s.points} poin dasar</td></tr></tfoot></table>`;
          };
        };
        draw();
      },
    },
    {
      t: 'Dealer Berikutnya & Ronde',
      b: `<ul><li>Jika <b>dealer menang</b> atau hand <b>seri</b> (tembok habis), dealer <b>tetap</b>.</li>
          <li>Jika pemain lain menang, posisi dealer pindah ke pemain di <b>kanan</b> dealer (berlawanan arah jarum jam). Angin kursi semua pemain ikut bergeser.</li>
          <li>Setelah keempat pemain pernah menjadi dealer, <b>angin ronde</b> berganti: Timur → Selatan → Barat → Utara. Satu permainan penuh = 4 ronde angin.</li></ul>`,
      s(el) {
        el.innerHTML = `<div class="players4">${[0, 1, 2, 3].map(h => `<div class="pbox"><b>Hand ${h + 1}</b><div class="wn">${WIND_CH[0]}</div><small>Dealer: ${NAMES[(st.dealer + h) % 4]}</small></div>`).join('')}</div><p class="stage-note">Contoh ronde Timur jika dealer selalu kalah: dealer bergeser ${NAMES[st.dealer]} → ${NAMES[(st.dealer + 1) % 4]} → ${NAMES[(st.dealer + 2) % 4]} → ${NAMES[(st.dealer + 3) % 4]}, lalu masuk ronde Selatan (南).</p>`;
      },
    },
    {
      t: 'Siap Bermain!',
      b: `<p>Kamu sudah mempelajari seluruh alur: menentukan dealer, mengocok, menyusun & memecah tembok, membagi kartu, bunga, klaim, menang, sampai menghitung poin.</p>
          <p>Sekarang praktik melawan mesin. Aktifkan <b>saran langkah</b> agar bot pembimbing menunjukkan kartu mana yang sebaiknya dibuang dan kartu apa yang kamu tunggu saat Ting.</p>`,
      s(el) {
        el.innerHTML = `<div class="stage-ctrl"><a class="btn big" href="#play">🀄 Main vs Mesin</a><a class="btn big jade" href="#watch">🤖 Tonton simulasi bot</a><a class="btn big ghost" href="#rules">Ringkasan aturan</a></div>`;
      },
    },
  ];

  function show(i) {
    clear();
    cur = Math.max(0, Math.min(steps.length - 1, i));
    seen.add(cur);
    const s = steps[cur];
    $('#learn-title').textContent = s.t;
    $('#learn-body').innerHTML = s.b;
    $('#learn-count').textContent = `Langkah ${cur + 1} dari ${steps.length}`;
    $('#learn-bar').style.width = ((cur + 1) / steps.length * 100) + '%';
    const stage = $('#learn-stage'); stage.innerHTML = '';
    s.s(stage);
    $('#learn-prev').disabled = cur === 0;
    $('#learn-next').disabled = cur === steps.length - 1;
    document.querySelectorAll('#learn-steps button').forEach((b, j) => {
      b.classList.toggle('active', j === cur);
      b.classList.toggle('done', seen.has(j) && j !== cur);
    });
    const ab = document.querySelector('#learn-steps button.active');
    if (ab && ab.scrollIntoView && window.innerWidth <= 900) ab.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function init() {
    $('#learn-steps').innerHTML = steps.map((s, i) => `<button data-i="${i}"><span class="n">${i + 1}</span><span class="t">${s.t}</span></button>`).join('');
    $('#learn-steps').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { show(+b.dataset.i); window.scrollTo({ top: 0 }); } });
    $('#learn-prev').onclick = () => { show(cur - 1); window.scrollTo({ top: 0 }); };
    $('#learn-next').onclick = () => { show(cur + 1); window.scrollTo({ top: 0 }); };
  }
  return { init, show, leave: clear, current: () => cur };
})();
