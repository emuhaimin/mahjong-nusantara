/* fx.js — efek visual: notifikasi besar berkedip (CHOW/PONG/KONG/HU/ZIMO) & getar HP */
const FX = (() => {
  const KIND = { 'CHOW!': 'chow', 'PONG!': 'pong', 'KONG!': 'kong', 'HU!': 'hu', 'ZIMO!': 'hu' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function vibrate(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { } }

  /** text: 'PONG!' dll · who: nama pemain · anchor: elemen kursi pemain (untuk posisi) */
  function callout(text, who, anchor) {
    const kind = KIND[text] || 'pong';
    const el = document.createElement('div');
    el.className = 'fx-call fx-' + kind;
    el.setAttribute('role', 'status');
    el.innerHTML = `<b>${esc(text.replace('!', ''))}</b><small>${esc(who)}</small>`;
    // di desktop: di antara kursi pemain dan tengah meja; di HP: tengah layar
    let x = innerWidth / 2, y = innerHeight / 2;
    if (anchor && innerWidth > 820) {
      const r = anchor.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < innerHeight) {
        x = (r.left + r.width / 2 + innerWidth / 2) / 2;
        y = (r.top + r.height / 2 + innerHeight / 2) / 2;
      }
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
    if (kind === 'hu') vibrate([90, 60, 90, 60, 160]);
  }
  /** Dialog konfirmasi (Promise<boolean>). Pengganti confirm() bawaan yang lebih rapi di HP. */
  let openConfirm = null;
  function ask(title, { text = '', yes = 'Ya', no = 'Batal', danger = true } = {}) {
    if (openConfirm) return openConfirm;
    openConfirm = new Promise(res => {
      const w = document.createElement('div');
      w.className = 'fx-confirm';
      w.innerHTML = `<div class="fx-confirm-box" role="alertdialog" aria-modal="true"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
        <div class="modal-actions"><button class="btn ghost" data-v="0">${esc(no)}</button><button class="btn${danger ? '' : ' jade'}" data-v="1">${esc(yes)}</button></div></div>`;
      const done = v => { w.remove(); document.removeEventListener('keydown', key, true); openConfirm = null; res(v); };
      const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
      w.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); else if (e.target === w) done(false); });
      document.addEventListener('keydown', key, true);
      document.body.appendChild(w);
      w.querySelector('[data-v="0"]').focus();
    });
    return openConfirm;
  }
  const isAsking = () => !!openConfirm;

  /** Pesan singkat di bawah layar */
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'fx-toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  return { callout, vibrate, ask, isAsking, toast };
})();
