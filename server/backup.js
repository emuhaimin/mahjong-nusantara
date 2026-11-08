/* backup.js — backup otomatis harian data pemain.
   - SQLite : salinan konsisten (VACUUM INTO) → mahjong-YYYY-MM-DD_HHMM.db.gz
   - File   : semua users/sessions/riwayat dalam satu berkas → mahjong-YYYY-MM-DD_HHMM.json.gz
   Disimpan di BACKUP_DIR (bawaan <DATA_DIR>/backups), hanya BACKUP_KEEP terakhir (bawaan 14) yang dipertahankan.
   Dicek tiap jam; backup dibuat bila backup terakhir sudah lebih dari 20 jam (≈ sekali sehari, juga setelah restart). */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');

const DUE_MS = 20 * 3600 * 1000;
const isBackup = f => /^mahjong-\d{4}-\d{2}-\d{2}_\d{4}\.(db|json)\.gz$/.test(f);
const stamp = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

function startBackups(store, { dir, keep = 14, log = console.log } = {}) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  let running = false;

  const list = () => fs.readdirSync(dir).filter(isBackup).sort();
  function latestTime() {
    const l = list();
    if (!l.length) return 0;
    try { return fs.statSync(path.join(dir, l[l.length - 1])).mtimeMs; } catch { return 0; }
  }
  function prune() {
    const l = list();
    for (const f of l.slice(0, Math.max(0, l.length - keep))) { try { fs.unlinkSync(path.join(dir, f)); } catch { } }
  }

  async function backupNow() {
    if (running) return null;
    running = true;
    const base = `mahjong-${stamp(new Date())}`;
    const t0 = Date.now();
    try {
      let out;
      if (store.kind === 'sqlite') {
        const tmp = path.join(dir, `.${base}.db`);
        store.snapshot(tmp);
        out = path.join(dir, `${base}.db.gz`);
        await pipeline(fs.createReadStream(tmp), zlib.createGzip({ level: 9 }), fs.createWriteStream(out + '.part', { mode: 0o600 }));
        fs.unlinkSync(tmp);
      } else {
        out = path.join(dir, `${base}.json.gz`);
        const bundle = { v: 1, kind: 'file', at: new Date().toISOString(), users: {}, sessions: store.sessions || {}, games: {} };
        for (const id of store.userIds()) { bundle.users[id] = store.users[id]; bundle.games[id] = store.games(id, Infinity); }
        fs.writeFileSync(out + '.part', zlib.gzipSync(JSON.stringify(bundle), { level: 9 }), { mode: 0o600 });
      }
      fs.renameSync(out + '.part', out);
      prune();
      log(`[backup] ${path.basename(out)} (${Math.round(fs.statSync(out).size / 1024)} KB, ${Date.now() - t0} ms) · tersimpan ${list().length} backup`);
      return out;
    } catch (e) {
      console.error('[backup] gagal:', e);
      for (const f of fs.readdirSync(dir)) if (f.startsWith(`.${base}`) || f.endsWith('.part')) { try { fs.unlinkSync(path.join(dir, f)); } catch { } }
      return null;
    } finally { running = false; }
  }

  const check = () => { if (Date.now() - latestTime() > DUE_MS) backupNow(); };
  setTimeout(check, 15000).unref();                         // sesaat setelah server menyala
  setInterval(check, 3600 * 1000).unref();                  // lalu dicek tiap jam
  return { backupNow, list, dir };
}

module.exports = { startBackups };
