/* adminstats.js — statistik untuk Panel Owner (Profil → hanya akun di ADMIN_EMAILS).
   Hanya angka agregat: tidak ada nama, email, atau IP yang dikirim ke browser.
   Bekerja dengan kedua store (SQLite & file JSON) lewat method bersama: userIds(), getUser(), games(). */
'use strict';
const fs = require('fs'), zlib = require('zlib');

const DAY = 86400000;
const WIB = 7 * 3600000;
const dayWib = t => new Date(t + WIB).toISOString().slice(0, 10);

function fromStore(store, now) {
  const ids = store.userIds();
  const out = {
    users: ids.length, players: 0,
    newUsers: { 1: 0, 7: 0, 30: 0 }, logins: { 1: 0, 7: 0, 30: 0 }, active: { 1: 0, 7: 0, 30: 0 },
    games: { total: 0, complete: 0, 1: 0, 7: 0, 30: 0 }, byMode: {}, byLevel: {}, byVariant: {}, daily: {}, firstUser: null,
  };
  const dailyPlayers = {};
  for (const id of ids) {
    const u = store.getUser(id) || {};
    if (u.created && (!out.firstUser || u.created < out.firstUser)) out.firstUser = u.created;
    for (const d of [1, 7, 30]) {
      if (u.created >= now - d * DAY) out.newUsers[d]++;
      if (u.lastLogin >= now - d * DAY) out.logins[d]++;
    }
    const gs = store.games(id, Infinity);
    if (gs.length) out.players++;
    const act = { 1: false, 7: false, 30: false };
    const modes = new Set();
    for (const g of gs) {
      const t = g.endedAt || g.startedAt || 0;
      out.games.total++; if (g.complete) out.games.complete++;
      for (const d of [1, 7, 30]) if (t >= now - d * DAY) { out.games[d]++; act[d] = true; }
      const m = g.mode || '?';
      out.byMode[m] = out.byMode[m] || { n: 0, p: 0 }; out.byMode[m].n++;
      if (!modes.has(m)) { modes.add(m); out.byMode[m].p++; }
      if (g.level) out.byLevel[g.level] = (out.byLevel[g.level] || 0) + 1;
      out.byVariant[g.variant || 'hk'] = (out.byVariant[g.variant || 'hk'] || 0) + 1;
      if (t >= now - 14 * DAY) {
        const k = dayWib(t);
        out.daily[k] = out.daily[k] || { n: 0, p: 0 }; out.daily[k].n++;
        (dailyPlayers[k] = dailyPlayers[k] || new Set()).add(id);
      }
    }
    for (const d of [1, 7, 30]) if (act[d]) out.active[d]++;
  }
  for (const k of Object.keys(out.daily)) out.daily[k].p = dailyPlayers[k].size;
  // 14 hari lengkap (hari tanpa sesi = 0), urut lama → baru
  const days = [];
  for (let i = 13; i >= 0; i--) { const k = dayWib(now - i * DAY); days.push({ d: k, n: (out.daily[k] || {}).n || 0, p: (out.daily[k] || {}).p || 0 }); }
  out.daily = days;
  return out;
}

/* ---------- pengunjung unik dari log nginx (termasuk tamu tanpa login) ---------- */
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const RE = /^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"/;
const BOT = /bot|crawl|spider|slurp|curl|wget|python|go-http|httpclient|headless|monitor|uptime|scan|preview/i;
function fromLogs(logFile, now) {
  if (!logFile) return { available: false, reason: 'Lokasi log tidak diatur.' };
  const files = [];
  for (const cand of [logFile, logFile + '.1']) if (fs.existsSync(cand)) files.push(cand);
  for (let i = 2; i <= 14; i++) if (fs.existsSync(`${logFile}.${i}.gz`)) files.push(`${logFile}.${i}.gz`);
  if (!files.length) return { available: false, reason: 'File log server tidak ditemukan.' };
  const seen = { 1: new Set(), 7: new Set(), 30: new Set(), all: new Set() };
  let oldest = now, pages = 0, read = 0;
  for (const f of files) {
    let txt;
    try { txt = f.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(f)).toString('utf8') : fs.readFileSync(f, 'utf8'); read++; } catch { continue; }
    for (const l of txt.split('\n')) {
      const m = RE.exec(l); if (!m) continue;
      const [, ip, dd, mon, yy, hh, mi, ss, tz, meth, url, status, ua] = m;
      if (meth !== 'GET' || BOT.test(ua) || !/^[23]/.test(status)) continue;
      const p = url.split('?')[0];
      if (!(p === '/' || p === '/index.html')) continue;
      const sign = tz[0] === '-' ? -1 : 1, off = sign * (+tz.slice(1, 3) * 60 + +tz.slice(3)) * 60000;
      const t = Date.UTC(+yy, MON[mon], +dd, +hh, +mi, +ss) - off;
      const key = ip + '|' + ua;
      pages++; if (t < oldest) oldest = t;
      seen.all.add(key);
      for (const d of [1, 7, 30]) if (t >= now - d * DAY) seen[d].add(key);
    }
  }
  if (!read) return { available: false, reason: 'Log server tidak bisa dibaca (izin file).' };
  return { available: true, 1: seen[1].size, 7: seen[7].size, 30: seen[30].size, all: seen.all.size, pages, since: oldest };
}

let cache = null;
/** statistik lengkap; di-cache 2 menit agar ringan */
function adminStats(store, { logFile, rooms = 0, now = Date.now(), fresh = false } = {}) {
  if (!fresh && cache && now - cache.at < 120000) return { ...cache.data, roomsNow: rooms, cached: true };
  const data = { at: now, ...fromStore(store, now), visitors: fromLogs(logFile, now), store: store.kind };
  cache = { at: now, data };
  return { ...data, roomsNow: rooms };
}

/** daftar email owner dari env ADMIN_EMAILS (dipisah koma) */
function adminSet(env = process.env.ADMIN_EMAILS) {
  return new Set(String(env || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
}

module.exports = { adminStats, adminSet, fromStore, fromLogs };
