/* share.js — bagikan aplikasi (ajak teman/komunitas) & bagikan hasil permainan sebagai gambar
   ke WhatsApp, Instagram, X, Facebook. Gambar digambar sendiri di <canvas> (tanpa pustaka luar,
   jalan juga saat offline). Di HP: menu Bagikan bawaan (gambar ikut terkirim). Di komputer: tautan
   berbagi tiap aplikasi + unduh gambar. */
const MjnShare = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const appUrl = () => (location.protocol === 'file:' ? 'https://mahjong.rupaone.io/' : location.origin + location.pathname.replace(/index\.html$/, ''));
  const W = 1080, H = 1350;                       // potret 4:5 — pas untuk feed Instagram, WhatsApp, X, Facebook
  const SANS = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const CJK = '"Noto Serif SC", "Songti SC", "PingFang SC", serif';

  /* ---------------- teks promosi ---------------- */
  function promoText() {
    return `🀄 *Mahjong Nusantara* — main mahjong ala Indonesia, langsung dari HP!\n\n` +
      `Sekarang sudah ada aplikasi mahjong yang pas dengan selera kita 🇮🇩\n` +
      `✅ Cocok untuk *pemula sampai expert* — ada pelajaran langkah demi langkah & saran langkah\n` +
      `✅ Lawan *bot AI* 4 tingkat: Easy, Medium, Hard, Expert\n` +
      `✅ *Main Online* bareng teman — cukup kirim kode room\n` +
      `✅ 3 gaya: *Hong Kong*, *Taiwan 16 kartu*, *Jepang (Riichi)*\n` +
      `✅ Bisa dimainkan *tanpa internet* & dipasang seperti aplikasi\n` +
      `✅ Tingkat pemain, peringkat & 26 badge 🏅\n\n` +
      `Gratis, tanpa unduh dari Play Store — langsung buka:\n👉 ${appUrl()}\n\n` +
      `Ayo buktikan siapa *Dewa Mahjong* di grup kita! 🐉\n_by emires one_`;
  }
  const plain = t => t.replace(/[*_]/g, '');      // X/Facebook tidak memakai format tebal WhatsApp

  /* ---------------- gambar ---------------- */
  const imgCache = new Map();
  function loadImg(src) {
    if (imgCache.has(src)) return imgCache.get(src);
    const p = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    imgCache.set(src, p);
    return p;
  }
  const tileSrc = k => `${TILE_BASE}${tileImg(k)}.svg?v=${TILE_VER}`;
  async function preloadTiles(ks) {
    const need = new Set(['Front', 'Back']);
    ks.forEach(k => { if (k < 34) need.add(tileImg(k)); });
    await Promise.all([...need].map(n => loadImg(`${TILE_BASE}${n}.svg?v=${TILE_VER}`)));
    try { await document.fonts.load(`700 40px ${CJK}`); await document.fonts.load(`800 40px ${SANS}`); } catch { }
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  async function drawTile(ctx, k, x, y, w, opt = {}) {
    const h = w * 4 / 3;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, x + w * .03, y + w * .1, w, h, w * .13); ctx.fill();
    ctx.fillStyle = '#c2b391'; rr(ctx, x, y + w * .08, w, h, w * .13); ctx.fill();
    const front = await loadImg(`${TILE_BASE}Front.svg?v=${TILE_VER}`);
    if (front) ctx.drawImage(front, x, y, w, h); else { ctx.fillStyle = '#fffaf0'; rr(ctx, x, y, w, h, w * .13); ctx.fill(); }
    if (k >= 34) {                                 // bunga/musim: huruf, seperti di meja
      const i = (k - 34) % 4, fl = k < 38;
      ctx.fillStyle = fl ? '#b3262e' : '#1d4fae'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${w * .62}px ${CJK}`; ctx.fillText(fl ? FLOWER_CH[i] : SEASON_CH[i], x + w / 2, y + h * .46);
      ctx.fillStyle = '#8a7a5c'; ctx.font = `800 ${w * .2}px ${SANS}`; ctx.fillText(String(i + 1), x + w * .16, y + h * .1);
    } else {
      const face = await loadImg(tileSrc(k));
      if (face) ctx.drawImage(face, x, y, w, h);
      if (k < 9 || (k >= 27 && k < 31)) { ctx.fillStyle = '#8a7a5c'; ctx.font = `800 ${w * .19}px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(k < 9 ? String(k + 1) : WIND_SHORT[k - 27], x + w * .1, y + w * .08); }
    }
    if (opt.win) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = w * .07; rr(ctx, x - w * .03, y - w * .03, w * 1.06, h * 1.045, w * .15); ctx.stroke(); }
    if (opt.red) { ctx.strokeStyle = '#e23b3b'; ctx.lineWidth = w * .05; rr(ctx, x + w * .03, y + w * .03, w * .94, h * .955, w * .12); ctx.stroke(); }
    ctx.restore();
    return h;
  }
  function frame(ctx) {
    const g = ctx.createRadialGradient(W / 2, H * .42, 80, W / 2, H / 2, H * .8);
    g.addColorStop(0, '#1a7a55'); g.addColorStop(1, '#0a3d2a');
    ctx.fillStyle = '#5a3519'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = g; rr(ctx, 26, 26, W - 52, H - 52, 34); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; rr(ctx, 44, 44, W - 88, H - 88, 26); ctx.stroke();
  }
  async function header(ctx, sub) {
    const lx = 84, ly = 78;
    ctx.fillStyle = '#fffaf0'; rr(ctx, lx, ly, 64, 84, 11); ctx.fill();
    ctx.fillStyle = '#1d8a60'; rr(ctx, lx, ly + 80, 64, 8, 4); ctx.fill();
    ctx.fillStyle = '#c0262d'; ctx.font = `700 46px ${CJK}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('中', lx + 32, ly + 42);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff'; ctx.font = `400 46px ${SANS}`; ctx.fillText('Mahjong', lx + 88, ly + 46);
    const mw = ctx.measureText('Mahjong ').width;
    ctx.font = `800 46px ${SANS}`; ctx.fillText('Nusantara', lx + 88 + mw, ly + 46);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `600 24px ${SANS}`; ctx.fillText('by emires one', lx + 90, ly + 80);
    if (sub) { ctx.textAlign = 'right'; ctx.fillStyle = '#ffd98a'; ctx.font = `700 26px ${SANS}`; ctx.fillText(sub, W - 84, ly + 50); ctx.textAlign = 'left'; }
  }
  function footer(ctx, text) {
    ctx.fillStyle = 'rgba(0,0,0,.28)'; rr(ctx, 70, H - 150, W - 140, 84, 22); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `700 30px ${SANS}`;
    ctx.fillText(text || 'Main mahjong gratis — pemula sampai expert', W / 2, H - 112);
    ctx.fillStyle = '#ffd98a'; ctx.font = `800 30px ${SANS}`; ctx.fillText(appUrl().replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, H - 76);
    ctx.textAlign = 'left';
  }
  function fitText(ctx, text, maxW, font, size) { let s = size; do { ctx.font = `${font} ${s}px ${SANS}`; } while (ctx.measureText(text).width > maxW && --s > 14); return s; }
  const panel = (ctx, x, y, w, h) => { ctx.fillStyle = 'rgba(255,250,240,.96)'; rr(ctx, x, y, w, h, 24); ctx.fill(); };

  /** gambar hasil hand (menang) atau hasil akhir permainan → Blob PNG */
  async function renderResult(d) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const allKs = [].concat(...(d.groups || []).map(g => g.ks), d.flowers || []);
    await preloadTiles(allKs);
    frame(ctx); await header(ctx, d.variant);
    let y = 220;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    const s1 = fitText(ctx, d.title, W - 168, '800', 58); ctx.font = `800 ${s1}px ${SANS}`; ctx.fillText(d.title, 84, y + 40);
    ctx.fillStyle = 'rgba(255,255,255,.82)'; fitText(ctx, d.subtitle || '', W - 168, '600', 28); ctx.fillText(d.subtitle || '', 84, y + 86);
    y += 120;
    if (d.groups && d.groups.length) {                     // kartu menang, dikelompokkan seperti di meja
      const n = d.groups.reduce((t, g) => t + g.ks.length, 0) + (d.flowers || []).length;
      const gaps = d.groups.length + ((d.flowers || []).length ? 1 : 0) - 1;
      const tw = Math.min(64, Math.floor((W - 168 - gaps * 16) / Math.max(n, 1)) - 2);
      ctx.fillStyle = 'rgba(0,0,0,.22)'; rr(ctx, 70, y, W - 140, tw * 4 / 3 + 82, 22); ctx.fill();
      let x = 84 + Math.max(0, (W - 168 - (n * (tw + 2) + gaps * 16)) / 2), ty = y + 22;
      for (const g of d.groups.concat((d.flowers || []).length ? [{ ks: d.flowers, label: 'Bunga' }] : [])) {
        const gx = x;
        for (const t of g.ks) { await drawTile(ctx, t.k != null ? t.k : t, x, ty, tw, { win: t.win, red: t.red }); x += tw + 2; }
        ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = `600 ${Math.max(14, Math.round(tw * .3))}px ${SANS}`; ctx.textAlign = 'center';
        ctx.fillText(g.label, (gx + x - 2) / 2, ty + tw * 4 / 3 + 40); ctx.textAlign = 'left';
        x += 16;
      }
      y += tw * 4 / 3 + 104;
    }
    if (d.items && d.items.length) {                       // tabel pola / yaku
      const rows = d.items.slice(0, 9), more = d.items.length - rows.length, rh = 46;
      const ph = 34 + rows.length * rh + (more > 0 ? 34 : 0) + 64;
      panel(ctx, 70, y, W - 140, ph);
      let ry = y + 52;
      ctx.font = `700 26px ${SANS}`;
      rows.forEach(([n, v], i) => {
        if (i) { ctx.fillStyle = '#e4dccb'; ctx.fillRect(100, ry - 34, W - 200, 2); }
        ctx.fillStyle = '#1d2722'; ctx.textAlign = 'left'; fitText(ctx, String(n), W - 340, '600', 27); ctx.fillText(String(n), 100, ry);
        ctx.textAlign = 'right'; ctx.font = `800 28px ${SANS}`; ctx.fillStyle = '#0f6b47'; ctx.fillText(String(v), W - 100, ry);
        ry += rh;
      });
      if (more > 0) { ctx.textAlign = 'left'; ctx.fillStyle = '#5f6b64'; ctx.font = `600 22px ${SANS}`; ctx.fillText(`+${more} pola lain`, 100, ry - 8); ry += 34; }
      ctx.fillStyle = '#b3262e'; ctx.fillRect(100, ry - 30, W - 200, 3);
      ctx.textAlign = 'left'; ctx.fillStyle = '#1d2722'; ctx.font = `800 30px ${SANS}`; ctx.fillText('Total', 100, ry + 12);
      ctx.textAlign = 'right'; ctx.fillStyle = '#b3262e'; fitText(ctx, d.total, W - 380, '800', 32); ctx.fillText(d.total, W - 100, ry + 12);
      ctx.textAlign = 'left';
      y += ph + 24;
    }
    if (d.scores && d.scores.length) {                     // skor pemain (hand) atau peringkat akhir
      const big = !(d.items && d.items.length) && !(d.groups && d.groups.length);   // kartu hasil akhir: baris lebih besar
      const rh = Math.min(big ? 104 : 64, Math.floor((H - (big ? 470 : 190) - y - 40) / d.scores.length));
      const ph = rh * d.scores.length + 30;
      if (rh >= 34) {
        panel(ctx, 70, y, W - 140, ph);
        let ry = y + 15 + rh / 2 + 10;
        const fs = Math.min(big ? 40 : 30, Math.round(rh * .5));
        d.scores.forEach((r, i) => {
          if (r.me) { ctx.fillStyle = 'rgba(224,180,76,.28)'; rr(ctx, 84, ry - rh / 2 - 8, W - 168, rh - 4, 14); ctx.fill(); }
          ctx.textAlign = 'left'; ctx.fillStyle = '#1d2722'; ctx.font = `800 ${fs}px ${SANS}`;
          ctx.fillText(`${r.rank ? ['🥇', '🥈', '🥉', '4.'][r.rank - 1] + ' ' : ''}${r.name}${r.me && r.name !== 'Kamu' ? ' (aku)' : ''}`, 100, ry + fs * .2);
          ctx.textAlign = 'right';
          if (r.delta != null) { ctx.fillStyle = r.delta > 0 ? '#0f6b47' : r.delta < 0 ? '#b3262e' : '#5f6b64'; ctx.fillText(`${r.delta > 0 ? '+' : ''}${r.delta}`, W - 300, ry + fs * .2); }
          ctx.fillStyle = '#1d2722'; ctx.fillText(String(r.score), W - 100, ry + fs * .2);
          ry += rh;
        });
        ctx.textAlign = 'left';
        y += ph + 30;
        if (big) {                                 // hiasan: deretan kartu + slogan di ruang kosong
          const ks = [33, 32, 31, 27, 28, 29, 30], tw = 96;
          await preloadTiles(ks);
          let x = (W - ks.length * (tw + 8)) / 2;
          const ty = Math.max(y + 20, H - 470);
          for (const k of ks) { await drawTile(ctx, k, x, ty, tw); x += tw + 8; }
          ctx.textAlign = 'center'; ctx.fillStyle = '#ffd98a'; ctx.font = `800 40px ${SANS}`;
          ctx.fillText('Siapa berani tantang aku?', W / 2, ty + tw * 4 / 3 + 80);
          ctx.textAlign = 'left';
        }
      }
    }
    footer(ctx, d.footer);
    return new Promise(res => cv.toBlob(b => res(b), 'image/png'));
  }

  /** gambar promosi aplikasi → Blob PNG */
  async function renderPromo() {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const ks = [0, 13, 22, 27, 31, 32, 33, 34, 38];
    await preloadTiles(ks);
    frame(ctx); await header(ctx, '');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `800 72px ${SANS}`; ctx.fillText('Main mahjong', W / 2, 330);
    ctx.fillText('ala Indonesia', W / 2, 412);
    ctx.fillStyle = '#ffd98a'; ctx.font = `700 36px ${SANS}`; ctx.fillText('Pemula sampai Expert · langsung dari HP', W / 2, 470);
    const tw = 92; let x = (W - ks.length * (tw + 6)) / 2;
    for (const k of ks) { await drawTile(ctx, k, x, 520, tw, { red: k === 13 || k === 22 }); x += tw + 6; }
    const pts = ['📘 Pelajaran langkah demi langkah', '🤖 Lawan bot AI: Easy → Expert', '🌐 Main Online bareng teman', '🀄 Hong Kong · Taiwan · Riichi', '✈️ Bisa main tanpa internet', '🏅 Tingkat pemain & 26 badge'];
    panel(ctx, 110, 700, W - 220, 420);
    ctx.textAlign = 'left'; ctx.fillStyle = '#1d2722'; ctx.font = `700 34px ${SANS}`;
    pts.forEach((p, i) => ctx.fillText(p, 160, 768 + i * 64));
    footer(ctx, 'Gratis — buka di browser, tanpa unduh');
    return new Promise(res => cv.toBlob(b => res(b), 'image/png'));
  }

  /* ---------------- lembar bagikan ---------------- */
  let sheet = null;
  function close() { if (!sheet) return; URL.revokeObjectURL(sheet.url || ''); sheet.el.remove(); sheet = null; }
  /** opts: { title, text (format WhatsApp), blobP (Promise<Blob>), file } */
  function open(opts) {
    close();
    const el = document.createElement('div');
    el.className = 'share-wrap';
    el.innerHTML = `<div class="share-box" role="dialog" aria-modal="true" aria-label="${esc(opts.title)}">
        <button class="share-x" data-s="close" aria-label="Tutup">✕</button>
        <h3>${esc(opts.title)}</h3>
        <div class="share-prev"><span class="muted">Menyiapkan gambar…</span></div>
        <div class="share-btns">
          <button class="btn big share-native" data-s="native" hidden>📤 Bagikan gambar…</button>
          <button class="sb wa" data-s="wa"><b>WhatsApp</b></button>
          <button class="sb ig" data-s="ig"><b>Instagram</b></button>
          <button class="sb x" data-s="x"><b>X</b></button>
          <button class="sb fb" data-s="fb"><b>Facebook</b></button>
          <button class="sb dl" data-s="dl"><b>⬇ Unduh gambar</b></button>
          <button class="sb cp" data-s="copy"><b>📋 Salin teks</b></button>
        </div>
        <p class="muted share-tip"></p>
      </div>`;
    document.body.appendChild(el);
    sheet = { el, blob: null, url: null, opts };
    const canFiles = f => { try { return !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch { return false; } };
    const tip = el.querySelector('.share-tip');
    tip.textContent = 'Di HP, “Bagikan gambar” mengirim gambar + teks ke WhatsApp, Instagram, X, atau Facebook. Tombol aplikasi di bawahnya membuka tautan berbagi (lampirkan gambar dari tombol Unduh).';
    Promise.resolve(opts.blobP).then(blob => {
      if (!sheet || sheet.el !== el || !blob) return;
      sheet.blob = blob; sheet.url = URL.createObjectURL(blob);
      sheet.file = new File([blob], opts.file || 'mahjong-nusantara.png', { type: 'image/png' });
      // pratinjau memakai data: URL (CSP situs mengizinkan img data:, bukan blob:)
      const fr = new FileReader();
      fr.onload = () => { if (sheet && sheet.el === el) el.querySelector('.share-prev').innerHTML = `<img src="${fr.result}" alt="Pratinjau gambar yang dibagikan">`; };
      fr.readAsDataURL(blob);
      el.querySelector('.share-native').hidden = !canFiles(sheet.file);
    });
    el.addEventListener('click', async e => {
      if (e.target === el) return close();
      const b = e.target.closest('[data-s]'); if (!b) return;
      const a = b.dataset.s, text = opts.text, url = appUrl();
      const win = u => window.open(u, '_blank', 'noopener');
      if (a === 'close') close();
      else if (a === 'native') {
        try { await navigator.share({ files: [sheet.file], text, title: 'Mahjong Nusantara' }); }
        catch (err) { if (err && err.name !== 'AbortError') FX.toast('Tidak bisa membuka menu Bagikan.'); }
      } else if (a === 'wa') win('https://wa.me/?text=' + encodeURIComponent(text));
      else if (a === 'x') win('https://twitter.com/intent/tweet?text=' + encodeURIComponent(plain(text).replace(url, '').trim().slice(0, 230)) + '&url=' + encodeURIComponent(url));
      else if (a === 'fb') win('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url));
      else if (a === 'ig') {                       // Instagram tidak punya tautan berbagi web → menu Bagikan (HP) atau unduh
        if (sheet.file && canFiles(sheet.file)) { try { await navigator.share({ files: [sheet.file] }); } catch { } }
        else { download(); copy(plain(text)); FX.toast('Gambar diunduh & teks disalin — unggah gambarnya di Instagram (Post/Story).'); }
      } else if (a === 'dl') download();
      else if (a === 'copy') { copy(text); FX.toast('Teks disalin — tinggal tempel di grup.'); }
    });
    function download() {
      if (!sheet || !sheet.url) return FX.toast('Gambar masih disiapkan…');
      const lnk = document.createElement('a'); lnk.href = sheet.url; lnk.download = opts.file || 'mahjong-nusantara.png';
      document.body.appendChild(lnk); lnk.click(); lnk.remove();
    }
  }
  function copy(t) {
    try { navigator.clipboard.writeText(t); }
    catch { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { } ta.remove(); }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  /* ---------------- API ---------------- */
  function shareApp() {
    open({ title: '📣 Ajak teman & komunitas', text: promoText(), blobP: renderPromo(), file: 'mahjong-nusantara-ajak.png' });
  }
  /** d: data hasil (lihat renderResult); text: kalimat pamer singkat */
  function shareResult(d, brag) {
    const text = `${brag}\n\nMain juga di *Mahjong Nusantara* — mahjong ala Indonesia, pemula sampai expert 🀄\n👉 ${appUrl()}\n_by emires one_`;
    open({ title: '📤 Bagikan hasil permainan', text, blobP: renderResult(d), file: 'hasil-mahjong-nusantara.png' });
  }
  return { shareApp, shareResult, promoText, renderResult, renderPromo, close };
})();
