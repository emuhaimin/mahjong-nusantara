/* sound.js — musik latar & efek suara, dibangkitkan langsung dengan Web Audio API (tanpa file audio:
   ringan, tanpa masalah lisensi, jalan offline).
   Musik: Gamelan (slendro) · Guzheng (pentatonik) · Hujan · Ombak · Hutan · MP3 sendiri · Mati — diputar hanya saat di meja.
   MP3 sendiri: file dipilih pemain & disimpan di IndexedDB perangkat itu (tidak diunggah ke server).
   Efek: buang kartu, Chow, Pong, Kong, Bunga, Riichi, menang (fanfare + tepuk tangan), dadu. */
const Sound = (() => {
  const KEY = 'mjn-sound';
  const DEF = { music: 'gamelan', mvol: 0.35, sfx: true, svol: 0.8 };
  let S = Object.assign({}, DEF);
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { } };

  const MUSIC = [
    { id: 'gamelan', ic: '🎼', name: 'Gamelan lembut', desc: 'Saron & bonang tangga nada slendro, gong sesekali — nuansa Nusantara. (Rekomendasi)' },
    { id: 'guzheng', ic: '🎋', name: 'Guzheng', desc: 'Petikan kecapi pentatonik yang pelan — nuansa asal mahjong.' },
    { id: 'rain', ic: '🌧️', name: 'Hujan', desc: 'Rintik hujan menenangkan, bagus untuk fokus.' },
    { id: 'ocean', ic: '🌊', name: 'Ombak pantai', desc: 'Deburan ombak pelan bergelombang.' },
    { id: 'forest', ic: '🌳', name: 'Hutan', desc: 'Angin semilir & kicau burung.' },
    { id: 'mine', ic: '🎵', name: 'Musik sendiri (MP3)', desc: 'Putar lagu dari HP/komputermu — mis. musik China atau gamelan Bali.' },
    { id: 'off', ic: '🔇', name: 'Tanpa musik', desc: 'Hanya efek suara (bila aktif).' },
  ];

  /* ---------------- mesin audio ---------------- */
  let ctx = null, master, musicBus, sfxBus, noiseBuf = null;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = S.mvol; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = S.svol; sfxBus.connect(master);
      const len = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => { });
    return ctx;
  }
  const now = () => ctx.currentTime;
  function env(g, t, a, peak, dur) {           // envelope: naik cepat, turun eksponensial
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }
  function tone(freq, t, dur, { type = 'sine', gain = 0.3, attack = 0.005, dest, detune = 0, bend = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq * (1 + bend), t); if (bend) o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    o.detune.value = detune; env(g, t, attack, gain, dur);
    o.connect(g); g.connect(dest || sfxBus); o.start(t); o.stop(t + attack + dur + 0.05);
  }
  /** bilah logam (saron/bonang/gong): parsial tak harmonis seperti gamelan */
  function bell(freq, t, dur, gain, dest) {
    [[1, 1], [2.76, .35], [5.4, .12], [8.93, .05]].forEach(([r, a]) => tone(freq * r, t, dur / (1 + r * .4), { gain: gain * a, attack: 0.003, dest }));
  }
  function noise(t, dur, { freq = 2000, q = 1, type = 'bandpass', gain = 0.3, attack = 0.002, dest } = {}) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(g, t, attack, gain, dur); s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 1.5); s.stop(t + attack + dur + 0.05);
  }
  const clack = (t, g = 0.5, f = 2600) => { noise(t, 0.035, { freq: f, q: 2.5, gain: g }); tone(f * 0.42, t, 0.04, { type: 'triangle', gain: g * .35 }); };

  /* ---------------- efek suara ---------------- */
  const can = () => S.sfx && ensure();
  const SFX = {
    tile() { if (!can()) return; clack(now(), 0.35, 2300 + Math.random() * 600); },
    chow() { if (!can()) return; const t = now(); clack(t, .45); clack(t + .09, .45, 2900); tone(523, t + .16, .35, { type: 'triangle', gain: .25 }); tone(659, t + .24, .4, { type: 'triangle', gain: .22 }); },
    pong() { if (!can()) return; const t = now(); [0, .08, .16].forEach(d => clack(t + d, .5, 2500)); bell(784, t + .24, .6, .3); },
    kong() { if (!can()) return; const t = now(); [0, .07, .14, .21].forEach(d => clack(t + d, .55, 2200)); bell(196, t + .3, 1.6, .45); bell(392, t + .3, .9, .18); },
    flower() { if (!can()) return; const t = now(); [1047, 1175, 1319, 1568, 1760].forEach((f, i) => bell(f, t + i * .07, .7, .12)); },
    riichi() { if (!can()) return; const t = now(); clack(t, .5, 1800); bell(110, t + .05, 2.6, .55); bell(220, t + .05, 1.2, .15); },
    dice() { if (!can()) return; const t = now(); for (let i = 0; i < 9; i++) clack(t + i * .055 + Math.random() * .03, .25 + Math.random() * .25, 1600 + Math.random() * 1800); },
    win() {
      if (!can()) return;
      const t = now();
      [523, 659, 784, 1047].forEach((f, i) => { tone(f, t + i * .11, .5, { type: 'triangle', gain: .22 }); tone(f / 2, t + i * .11, .5, { type: 'sine', gain: .12 }); });
      bell(1047, t + .5, 1.4, .25); bell(131, t + .5, 2.4, .35);
      applause(t + .35, 3.2);
    },
  };
  /** tepuk tangan: ratusan tepukan pendek (derau terfilter) dengan kepadatan naik-turun */
  function applause(t0, dur) {
    const n = Math.round(dur * 55);
    for (let i = 0; i < n; i++) {
      const u = Math.random(), shape = Math.sin(Math.PI * Math.min(1, u * 1.15));
      const t = t0 + u * dur;
      noise(t, 0.012 + Math.random() * 0.02, { freq: 900 + Math.random() * 1800, q: 0.9 + Math.random(), gain: 0.06 + 0.12 * shape * Math.random() });
    }
    noise(t0, dur, { type: 'bandpass', freq: 1500, q: .5, gain: .05, attack: .4 });
  }
  /** dipanggil FX.callout untuk teks CHOW!/PONG!/KONG!/HU!/ZIMO!/BUNGA!/RIICHI! */
  function callout(text) {
    const k = String(text).replace(/!$/, '').toUpperCase();
    if (k === 'CHOW') SFX.chow(); else if (k === 'PONG') SFX.pong(); else if (k === 'KONG') SFX.kong();
    else if (k === 'BUNGA') SFX.flower(); else if (k === 'RIICHI') SFX.riichi();
    else if (k === 'HU' || k === 'ZIMO' || k === 'RON' || k === 'TSUMO') SFX.win();
  }

  /* ---------------- musik sendiri: MP3 di IndexedDB ---------------- */
  const MAX_TRACKS = 20, MAX_MB = 40;
  const DB = (() => {
    let p = null;
    const open = () => p || (p = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('IndexedDB tidak tersedia'));
      const r = indexedDB.open('mjn-music', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => { p = null; rej(r.error); };
    }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('tracks', mode), req = fn(t.objectStore('tracks'));
      t.oncomplete = () => res(req.result); t.onerror = t.onabort = () => rej(t.error);
    }));
    return { all: () => run('readonly', s => s.getAll()), put: x => run('readwrite', s => s.put(x)), del: id => run('readwrite', s => s.delete(id)) };
  })();
  let tracks = [];                               // [{ id, name, size }] — tanpa blob
  const refreshTracks = () => DB.all().then(a => { tracks = a.sort((x, y) => x.id - y.id).map(({ id, name, size }) => ({ id, name, size })); }).catch(() => { tracks = []; });
  async function addFiles(files) {
    const msg = [];
    for (const f of files) {
      if (tracks.length >= MAX_TRACKS) { msg.push(`Maksimal ${MAX_TRACKS} lagu.`); break; }
      if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i.test(f.name)) { msg.push(`${f.name}: bukan file audio.`); continue; }
      if (f.size > MAX_MB * 1048576) { msg.push(`${f.name}: lebih dari ${MAX_MB} MB.`); continue; }
      try { await DB.put({ id: Date.now() + Math.random(), name: f.name.replace(/\.[^.]+$/, ''), size: f.size, blob: f }); await refreshTracks(); }
      catch { msg.push(`${f.name}: gagal disimpan (memori perangkat penuh?).`); }
    }
    return msg;
  }

  /* ---------------- musik latar (generatif) ---------------- */
  let music = null;                              // { id, stop() }
  function startMusic(id) {
    stopMusic();
    if (!id || id === 'off' || !ensure()) return;
    const bus = ctx.createGain(); bus.gain.setValueAtTime(0.0001, now()); bus.gain.exponentialRampToValueAtTime(1, now() + 2); bus.connect(musicBus);
    const timers = [], nodes = [], cleanup = [];
    const every = (ms, fn) => { const h = setInterval(() => { if (ctx.state === 'running') fn(); }, ms); timers.push(h); fn(); };
    const loopNoise = ({ type, freq, q = .7, gain }) => {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = gain;
      s.connect(f); f.connect(g); g.connect(bus); s.start(); nodes.push(s); return { s, f, g };
    };
    const lfo = (param, rate, depth, base) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth;
      param.value = base; o.connect(g); g.connect(param); o.start(); nodes.push(o);
    };
    if (id === 'gamelan') {
      const base = 196, SL = [1, 1.149, 1.320, 1.516, 1.741, 2, 2.297, 2.639];   // slendro ±240 sen
      let step = 0, deg = 2;
      every(620, () => {
        const t = now() + .05;
        if (Math.random() < .82) { deg = Math.max(0, Math.min(SL.length - 1, deg + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)])); bell(base * 2 * SL[deg], t, 1.2, .16, bus); }
        if (step % 2 === 1) bell(base * SL[(deg + 2) % 5], t + .31, .8, .07, bus);           // bonang imbal
        if (step % 8 === 4) bell(base / 2 * SL[deg % 5], t, 2.2, .14, bus);                   // kenong
        if (step % 32 === 0) { bell(base / 4, t, 6, .32, bus); bell(base / 4 * 1.01, t, 6, .12, bus); }   // gong ageng
        step++;
      });
    } else if (id === 'guzheng') {
      const base = 262, PEN = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2];
      const pluck = (f, t, g) => { tone(f, t, 1.8, { type: 'triangle', gain: g, attack: .004, dest: bus, bend: .015 }); tone(f * 2, t, .6, { type: 'sine', gain: g * .25, attack: .003, dest: bus }); };
      { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = base / 2; g.gain.setValueAtTime(0.0001, now()); g.gain.exponentialRampToValueAtTime(.03, now() + 3); o.connect(g); g.connect(bus); o.start(); nodes.push(o); }   // dengung lembut
      every(3200, () => {
        const t = now() + .05, root = Math.floor(Math.random() * 3);
        const run = Math.random() < .5 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
        run.forEach((d, i) => { if (Math.random() < .85) pluck(base * PEN[(root + d) % PEN.length], t + i * (.22 + Math.random() * .1), .13); });
        if (Math.random() < .5) pluck(base / 2 * PEN[root], t + 1.6, .1);
      });
    } else if (id === 'rain') {
      loopNoise({ type: 'lowpass', freq: 1600, gain: .22 }); loopNoise({ type: 'highpass', freq: 3500, gain: .05 });
      every(90, () => { if (Math.random() < .55) noise(now() + Math.random() * .08, .02, { freq: 2500 + Math.random() * 3000, q: 4, gain: .04 + Math.random() * .06, dest: bus }); });
    } else if (id === 'ocean') {
      const a = loopNoise({ type: 'lowpass', freq: 500, gain: .2 }); lfo(a.g.gain, .085, .17, .2); lfo(a.f.frequency, .085, 300, 650);
      const b = loopNoise({ type: 'bandpass', freq: 1200, q: .4, gain: .05 }); lfo(b.g.gain, .061, .045, .05);
    } else if (id === 'forest') {
      const w = loopNoise({ type: 'lowpass', freq: 420, gain: .12 }); lfo(w.g.gain, .05, .07, .12);
      const bird = () => {
        const t = now() + .05, f0 = 2200 + Math.random() * 2200, n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) {
          const o = ctx.createOscillator(), g = ctx.createGain(), tt = t + i * (.11 + Math.random() * .05);
          o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * .4), tt + .07);
          env(g, tt, .01, .05 + Math.random() * .04, .08); o.connect(g); g.connect(bus); o.start(tt); o.stop(tt + .15);
        }
      };
      every(2600, () => { if (Math.random() < .7) bird(); });
    } else if (id === 'mine') {                  // MP3 pemain, diacak & diulang, lewat musicBus (volume & fade sama)
      const audio = new Audio(); audio.preload = 'auto';
      const src = ctx.createMediaElementSource(audio); src.connect(bus);
      let list = [], i = 0, url = null, dead = false, fails = 0;
      const next = () => {
        if (dead || !list.length) return;
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(list[i++ % list.length].blob);
        audio.src = url; audio.play().catch(() => { });
      };
      audio.onended = () => { fails = 0; next(); };
      audio.onerror = () => { if (++fails < list.length) next(); };
      DB.all().then(a => { for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } list = a; next(); }).catch(() => { });
      cleanup.push(() => { dead = true; audio.pause(); audio.removeAttribute('src'); audio.load(); if (url) URL.revokeObjectURL(url); src.disconnect(); });
    }
    music = { id, stop() { timers.forEach(clearInterval); const t = now(); bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value || .0001, t); bus.gain.exponentialRampToValueAtTime(0.0001, t + .8); setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch { } }); cleanup.forEach(f => { try { f(); } catch { } }); bus.disconnect(); }, 1000); } };
  }
  function stopMusic() { if (music) { music.stop(); music = null; } }
  let preview = false;
  const inGame = () => document.body.classList.contains('in-game');
  function syncMusic() {
    const want = (inGame() || preview) && S.music !== 'off' && !document.hidden ? S.music : null;
    if ((music && music.id) === want) return;
    if (want) { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => { }); startMusic(want); } else stopMusic();
  }

  /* ---------------- panel pengaturan suara ---------------- */
  function openPanel() {
    ensure();
    const w = document.createElement('div');
    w.className = 'share-wrap sound-wrap';
    const render = () => {
      w.innerHTML = `<div class="share-box sound-box" role="dialog" aria-modal="true" aria-label="Suara & musik">
        <button class="share-x" data-s="close" aria-label="Tutup">✕</button>
        <h3>🔊 Suara & musik</h3>
        <p class="muted">Musik latar diputar saat kamu di meja permainan. Ketuk pilihan untuk mendengar contohnya.</p>
        <div class="sound-list">${MUSIC.map(m => `<button type="button" class="sound-opt${S.music === m.id ? ' on' : ''}" data-m="${m.id}"><span class="si">${m.ic}</span><span><b>${m.name}</b><small>${m.id === 'mine' && tracks.length ? `${tracks.length} lagu tersimpan di perangkat ini.` : m.desc}</small></span></button>`).join('')}</div>
        ${S.music === 'mine' ? mineHTML() : ''}
        <label class="sound-vol">Volume musik <input type="range" min="0" max="100" value="${Math.round(S.mvol * 100)}" data-v="mvol"></label>
        <label class="chk sound-chk"><input type="checkbox" data-v="sfx"${S.sfx ? ' checked' : ''}> Efek suara (buang kartu, Chow/Pong/Kong, tepuk tangan saat menang)</label>
        <label class="sound-vol">Volume efek <input type="range" min="0" max="100" value="${Math.round(S.svol * 100)}" data-v="svol"></label>
        <div class="sound-test"><span class="muted">Coba:</span>${['chow', 'pong', 'kong', 'flower', 'riichi', 'win'].map(k => `<button type="button" class="btn ghost sm" data-x="${k}">${{ chow: 'Chow', pong: 'Pong', kong: 'Kong', flower: 'Bunga', riichi: 'Riichi', win: 'Menang 👏' }[k]}</button>`).join('')}</div>
        <p class="muted sound-note">iPhone: matikan mode senyap (sakelar di samping HP) agar suara terdengar.</p>
        <div class="modal-actions"><button class="btn big" data-s="close">Selesai</button></div></div>`;
    };
    const mineHTML = () => `<div class="sound-mine">
          ${tracks.length ? `<ol>${tracks.map(t => `<li><span>${esc(t.name)}</span><small class="muted">${(t.size / 1048576).toFixed(1)} MB</small><button type="button" class="share-x sm" data-del="${t.id}" aria-label="Hapus ${esc(t.name)}">✕</button></li>`).join('')}</ol>` : '<p class="muted">Belum ada lagu. Tambahkan file MP3 dari HP/komputermu.</p>'}
          <label class="btn ghost sm">➕ Tambah lagu (MP3)<input type="file" accept="audio/*,.mp3,.m4a,.ogg,.wav" multiple data-f hidden></label>
          ${msgs.length ? `<p class="sound-err">${msgs.map(esc).join('<br>')}</p>` : ''}
          <p class="muted sound-note">Lagu hanya disimpan di perangkat ini, tidak diunggah ke server (maks. ${MAX_TRACKS} lagu, ${MAX_MB} MB per lagu). Pakai musik yang memang boleh kamu putar.</p>
        </div>`;
    let msgs = [];
    const showMine = () => { const el = w.querySelector('.sound-mine'); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    const restartMine = () => { if (music && music.id === 'mine') { stopMusic(); syncMusic(); } };
    render();
    document.body.appendChild(w);
    refreshTracks().then(() => { if (w.isConnected) render(); });
    preview = true; syncMusic();
    const close = () => { preview = false; w.remove(); syncMusic(); document.dispatchEvent(new CustomEvent('mjn-sound')); };
    w.addEventListener('click', e => {
      if (e.target === w || e.target.closest('[data-s="close"]')) return close();
      const m = e.target.closest('[data-m]'); if (m) {
        S.music = m.dataset.m; msgs = []; save(); stopMusic(); syncMusic(); render();
        if (S.music === 'mine' && !tracks.length) { const f = w.querySelector('[data-f]'); if (f) f.click(); }
        showMine();
        return;
      }
      const d = e.target.closest('[data-del]'); if (d) { DB.del(+d.dataset.del).catch(() => { }).then(refreshTracks).then(() => { msgs = []; render(); restartMine(); }); return; }
      const x = e.target.closest('[data-x]'); if (x) { const was = S.sfx; S.sfx = true; SFX[x.dataset.x](); S.sfx = was; }
    });
    w.addEventListener('change', async e => {
      if (!e.target.matches('[data-f]') || !e.target.files.length) return;
      msgs = await addFiles([...e.target.files]);
      render(); showMine(); restartMine(); syncMusic();
    });
    w.addEventListener('input', e => {
      const v = e.target.dataset.v; if (!v) return;
      if (v === 'sfx') { S.sfx = e.target.checked; }
      else { S[v] = e.target.value / 100; if (v === 'mvol') musicBus.gain.value = S.mvol; else sfxBus.gain.value = S.svol; }
      save();
    });
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const label = () => { const m = MUSIC.find(x => x.id === S.music) || MUSIC[0]; return `${m.ic} ${m.name}${S.sfx ? ' · efek aktif' : ' · efek mati'}`; };

  function init() {
    // AudioContext hanya boleh dibuat setelah sentuhan pengguna
    const unlock = () => { ensure(); syncMusic(); };
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
    new MutationObserver(syncMusic).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) { stopMusic(); ctx.suspend().catch(() => { }); } else { ctx.resume().catch(() => { }); syncMusic(); } });
    document.addEventListener('click', e => { if (e.target.closest('[data-sound]')) openPanel(); });
    const sync = () => document.querySelectorAll('[data-sound-label]').forEach(el => { el.textContent = label(); });
    sync(); document.addEventListener('mjn-sound', sync);
  }
  return { init, callout, tile: () => SFX.tile(), dice: () => SFX.dice(), win: () => SFX.win(), openPanel, settings: () => ({ ...S }), MUSIC };
})();
window.Sound = Sound;
Sound.init();
