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
  return { callout, vibrate };
})();
