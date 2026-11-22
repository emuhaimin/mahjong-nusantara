/* handdrag.js — susun kartu tangan sendiri (drag & drop) dan buang kartu dengan menggeser ke atas.
   Dipakai js/game.js (Main vs Mesin) & js/online.js (Online).
   - Bawaan: kartu diurutkan & set jadi dikelompokkan otomatis (groupConcealed, js/rules.js).
   - Setelah pemain menggeser kartu, urutannya diingat per hand (key) dan set dihitung dari
     3 kartu BERDAMPINGAN sesuai susunan pemain (mis. pilih 4-5-6 Wan, bukan 3-4-5).
   - Tarik kartu ke atas (keluar dari area tangan) lalu lepas = buang (hanya saat giliranmu).
   - Ketuk & ketuk lagi tetap berfungsi seperti biasa. */
const MjnHand = (() => {
  const orders = new Map();                // key → [id, ...] urutan buatan pemain
  const sortT = (a, b) => a.k - b.k || a.id - b.id;
  let dragId = null;

  const isSet = (a, b, c) => {
    if (a.k === b.k && b.k === c.k) return true;
    const ks = [a.k, b.k, c.k].sort((x, y) => x - y);
    return ks[2] < 27 && Math.floor(ks[0] / 9) === Math.floor(ks[2] / 9) && ks[1] === ks[0] + 1 && ks[2] === ks[1] + 1;
  };

  /** susunan tampilan: { custom, items (tanpa kartu ambilan yang dipisah), drawn (dipisah di ujung) } */
  function arrange(key, sorted, drawnT) {
    const ids = orders.get(key);
    if (!ids) return { custom: false, items: sorted, drawn: drawnT };
    const all = drawnT ? [...sorted, drawnT] : sorted.slice();
    const byId = new Map(all.map(t => [t.id, t]));
    const items = ids.map(id => byId.get(id)).filter(Boolean);
    const seen = new Set(items.map(t => t.id));
    const drawn = drawnT && !seen.has(drawnT.id) ? drawnT : null;
    for (const t of sorted) if (!seen.has(t.id)) items.push(t);      // kartu baru (hasil klaim dsb.) ke ujung
    return { custom: true, items, drawn };
  }
  /** segmen untuk digambar: [{ set:[t,t,t] } | { t }] + daftar kartu lepas (untuk saran buang) */
  function segments(arr, grouping) {
    const segs = [], rest = [];
    if (!grouping) { for (const t of arr.items) { segs.push({ t }); rest.push(t); } }
    else if (!arr.custom) {
      const gr = groupConcealed(arr.items);
      gr.sets.forEach(s => segs.push({ set: s }));
      gr.rest.forEach(t => { segs.push({ t }); rest.push(t); });
    } else {
      const a = arr.items;
      for (let i = 0; i < a.length;) {
        if (i + 2 < a.length && isSet(a[i], a[i + 1], a[i + 2])) { segs.push({ set: [a[i], a[i + 1], a[i + 2]] }); i += 3; }
        else { segs.push({ t: a[i] }); rest.push(a[i]); i++; }
      }
    }
    if (arr.drawn) rest.push(arr.drawn);
    return { segs, rest };
  }
  /** HTML tangan; tH(tile) → html satu kartu */
  function html(key, sorted, drawnT, tH, grouping) {
    const arr = arrange(key, sorted, drawnT);
    const { segs } = segments(arr, grouping);
    return segs.map(s => s.set ? `<span class="hand-set" title="Set jadi (masih tertutup)">${s.set.map(tH).join('')}</span>` : tH(s.t)).join('')
      + (arr.drawn ? tH(arr.drawn) : '')
      + (arr.custom ? '<button type="button" class="hand-reset" data-hand-reset title="Susun otomatis lagi" aria-label="Susun otomatis lagi">↺</button>' : '');
  }
  /** kartu yang boleh disarankan untuk dibuang (bukan bagian set) bila susunan buatan aktif; null = pakai otomatis */
  function pool(key, hand, drawnId, grouping) {
    if (!orders.has(key) || !hand) return null;
    const drawnT = hand.find(t => t.id === drawnId) || null;
    const sorted = hand.filter(t => t !== drawnT).sort(sortT);
    return segments(arrange(key, sorted, drawnT), grouping).rest;
  }

  /* ---------- gesture ---------- */
  function attach(root, cb) {
    let st = null, suppressUntil = 0;
    const handEl = () => root.querySelector('.seat-hand');
    const tilesNow = () => [...root.querySelectorAll('.seat-hand .tile[data-id]')];
    const clearMarks = () => root.querySelectorAll('.drop-before,.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
    function target(x, y, skipId) {
      let best = null, bd = Infinity;
      for (const el of tilesNow()) {
        if (+el.dataset.id === skipId) continue;
        const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot((x - cx) * 1, (y - cy) * 1.6);
        if (d < bd) { bd = d; best = { el, after: x > cx }; }
      }
      return best;
    }
    function end(e, cancel) {
      if (!st) return;
      const s = st; st = null; dragId = null;
      document.body.classList.remove('hand-dragging');
      if (s.ghost) s.ghost.remove();
      clearMarks();
      root.querySelectorAll('.drag-src').forEach(el => el.classList.remove('drag-src'));
      if (!s.moved || cancel) return;
      suppressUntil = Date.now() + 400;
      if (s.up) { cb.discard(s.id); return; }
      const tg = target(e.clientX, e.clientY, s.id);
      if (!tg) return;
      const ids = tilesNow().map(el => +el.dataset.id).filter(id => id !== s.id);
      let at = ids.indexOf(+tg.el.dataset.id) + (tg.after ? 1 : 0);
      ids.splice(at, 0, s.id);
      orders.set(cb.key(), ids);
      cb.changed();
    }
    root.addEventListener('pointerdown', e => {
      if (e.button > 0 || st) return;
      const t = e.target.closest('.seat-hand .tile[data-id]');
      if (!t || !root.contains(t)) return;
      st = { id: +t.dataset.id, x0: e.clientX, y0: e.clientY, pid: e.pointerId, moved: false, up: false, ghost: null, src: t };
    });
    window.addEventListener('pointermove', e => {
      if (!st || e.pointerId !== st.pid) return;
      const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
      if (!st.moved) {
        if (Math.hypot(dx, dy) < 8) return;
        st.moved = true; dragId = st.id;
        const src = tilesNow().find(el => +el.dataset.id === st.id) || st.src;
        const r = src.getBoundingClientRect();
        const g = src.cloneNode(true);
        g.classList.remove('sel', 'hint', 'drag-src');
        g.classList.add('drag-ghost');
        Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', fontSize: getComputedStyle(src).fontSize });
        document.body.appendChild(g);
        st.ghost = g;
        src.classList.add('drag-src');
        document.body.classList.add('hand-dragging');
      }
      e.preventDefault();
      st.ghost.style.transform = `translate(${dx}px,${dy}px)`;
      const h = handEl(), hr = h ? h.getBoundingClientRect() : null;
      st.up = !!hr && e.clientY < hr.top - 24 && cb.canDiscard(st.id);
      st.ghost.classList.toggle('to-discard', st.up);
      clearMarks();
      if (!st.up) { const tg = target(e.clientX, e.clientY, st.id); if (tg) tg.el.classList.add(tg.after ? 'drop-after' : 'drop-before'); }
    }, { passive: false });
    window.addEventListener('pointerup', e => { if (st && e.pointerId === st.pid) end(e, false); });
    window.addEventListener('pointercancel', e => { if (st && e.pointerId === st.pid) end(e, true); });
    // klik setelah drag jangan dianggap "pilih/buang"
    root.addEventListener('click', e => {
      if (Date.now() < suppressUntil) { e.stopImmediatePropagation(); e.preventDefault(); return; }
      if (e.target.closest('[data-hand-reset]')) { e.stopImmediatePropagation(); orders.delete(cb.key()); cb.changed(); }
    }, true);
  }

  return {
    html, pool, attach, arrange,
    dragging: () => dragId,
    isCustom: key => orders.has(key),
    setOrder: (key, ids) => orders.set(key, ids.slice()),
    /** tips sekali per perangkat (localStorage mjn-drag-tip) */
    tip() { try { if (localStorage.getItem('mjn-drag-tip')) return; localStorage.setItem('mjn-drag-tip', '1'); } catch { return; } setTimeout(() => { try { FX.toast('💡 Geser kartu untuk menyusun set sendiri · tarik kartu ke atas untuk membuang'); } catch { } }, 1500); },
    reset: key => orders.delete(key),
    clear: prefix => { for (const k of [...orders.keys()]) if (!prefix || String(k).startsWith(prefix)) orders.delete(k); },
  };
})();
if (typeof window !== 'undefined') window.MjnHand = MjnHand;
