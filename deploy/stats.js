#!/usr/bin/env node
/* stats.js — ringkasan jumlah pemain & permainan Mahjong Nusantara, dijalankan di VPS (lihat workflow
   .github/workflows/stats.yml). Hanya mencetak ANGKA agregat: tidak ada nama, email, atau alamat IP.
   Pemakaian: node deploy/stats.js [DATA_DIR] [log nginx ...]
   - DATA_DIR  : folder data (bawaan /var/lib/mahjong-nusantara) berisi mahjong.db (SQLite, hanya dibaca)
   - log nginx : opsional, untuk menghitung pengunjung unik (termasuk tamu yang tidak login) */
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const DATA_DIR = process.argv[2] || '/var/lib/mahjong-nusantara';
const LOGS = process.argv.slice(3);
const now = Date.now(), DAY = 86400000;
const fmt = n => Number(n || 0).toLocaleString('id-ID');
const out = [];
const line = (s = '') => out.push(s);

/* ---------- akun & permainan (SQLite) ---------- */
function dbStats() {
  const file = path.join(DATA_DIR, 'mahjong.db');
  if (!fs.existsSync(file)) { line(`Database ${file} tidak ditemukan.`); return; }
  let sqlite;
  try { sqlite = require('node:sqlite'); } catch { line('Node ini belum mendukung node:sqlite (butuh 22.13+).'); return; }
  let db;
  try { db = new sqlite.DatabaseSync(file, { readOnly: true }); } catch { db = new sqlite.DatabaseSync(file); }
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const since = d => now - d * DAY;

  const u = one('SELECT COUNT(*) n FROM users').n;
  const players = one('SELECT COUNT(DISTINCT user_id) n FROM games').n;
  line('## Akun (login Google)');
  line(`- Total akun terdaftar      : **${fmt(u)}**`);
  line(`- Pernah menyelesaikan/merekam permainan : **${fmt(players)}**`);
  for (const d of [1, 7, 30]) {
    line(`- Akun baru ${String(d).padStart(2)} hari terakhir : ${fmt(one('SELECT COUNT(*) n FROM users WHERE created >= ?', since(d)).n)}` +
      ` · login ${d} hari terakhir: ${fmt(one('SELECT COUNT(*) n FROM users WHERE last_login >= ?', since(d)).n)}` +
      ` · bermain ${d} hari terakhir: ${fmt(one('SELECT COUNT(DISTINCT user_id) n FROM games WHERE COALESCE(ended_at, started_at) >= ?', since(d)).n)}`);
  }
  const first = one('SELECT MIN(created) t FROM users').t;
  if (first) line(`- Akun pertama dibuat       : ${new Date(first).toISOString().slice(0, 10)}`);

  const g = one('SELECT COUNT(*) n, SUM(complete) c FROM games');
  line('');
  line('## Sesi permainan tercatat');
  line(`- Total sesi : **${fmt(g.n)}** (selesai sampai akhir: ${fmt(g.c)})`);
  for (const d of [1, 7, 30]) line(`- ${String(d).padStart(2)} hari terakhir : ${fmt(one('SELECT COUNT(*) n FROM games WHERE COALESCE(ended_at, started_at) >= ?', since(d)).n)}`);
  const MODE = { bot: 'Main vs Mesin', online: 'Online', watch: 'Simulasi' };
  const byMode = all(`SELECT COALESCE(mode, '?') m, COUNT(*) n, COUNT(DISTINCT user_id) p FROM games GROUP BY m ORDER BY n DESC`);
  if (byMode.length) {
    line('');
    line('| Mode | Sesi | Pemain |');
    line('|---|---:|---:|');
    for (const r of byMode) line(`| ${MODE[r.m] || r.m} | ${fmt(r.n)} | ${fmt(r.p)} |`);
  }
  const byLevel = all(`SELECT COALESCE(level, '?') l, COUNT(*) n FROM games GROUP BY l ORDER BY n DESC`);
  if (byLevel.length) line(`\nTingkat AI yang dipilih: ${byLevel.map(r => `${r.l} ${fmt(r.n)}`).join(' · ')}`);
  // aktivitas harian 14 hari terakhir
  const daily = all(`SELECT date(COALESCE(ended_at, started_at) / 1000, 'unixepoch', '+7 hours') d, COUNT(*) n, COUNT(DISTINCT user_id) p
                     FROM games WHERE COALESCE(ended_at, started_at) >= ? GROUP BY d ORDER BY d`, since(14));
  if (daily.length) {
    line('');
    line('## 14 hari terakhir (WIB)');
    line('| Tanggal | Sesi | Pemain |');
    line('|---|---:|---:|');
    for (const r of daily) line(`| ${r.d} | ${fmt(r.n)} | ${fmt(r.p)} |`);
  }
  db.close();
}

/* ---------- pengunjung situs (log nginx), termasuk tamu tanpa login ---------- */
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const RE = /^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"/;
const BOT = /bot|crawl|spider|slurp|curl|wget|python|go-http|httpclient|headless|monitor|uptime|scan|preview/i;
function logStats() {
  const files = [];
  for (const f of LOGS) {
    for (const cand of [f, f + '.1']) if (fs.existsSync(cand)) files.push(cand);
    for (let i = 2; i <= 14; i++) if (fs.existsSync(`${f}.${i}.gz`)) files.push(`${f}.${i}.gz`);
  }
  if (!files.length) return;
  const seen = { 1: new Set(), 7: new Set(), 30: new Set(), all: new Set() };
  let oldest = now, pages = 0;
  for (const f of files) {
    let txt;
    try { txt = f.endsWith('.gz') ? zlib.gunzipSync(fs.readFileSync(f)).toString('utf8') : fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const l of txt.split('\n')) {
      const m = RE.exec(l); if (!m) continue;
      const [, ip, dd, mon, yy, hh, mi, ss, tz, meth, url, status, ua] = m;
      if (meth !== 'GET' || BOT.test(ua) || !/^2|^3/.test(status)) continue;
      const p = url.split('?')[0];
      if (!(p === '/' || p === '/index.html')) continue;          // hitung buka halaman utama saja
      const sign = tz[0] === '-' ? -1 : 1, off = sign * (+tz.slice(1, 3) * 60 + +tz.slice(3)) * 60000;
      const t = Date.UTC(+yy, MON[mon], +dd, +hh, +mi, +ss) - off;
      const key = ip + '|' + ua;                                  // perkiraan 1 perangkat
      pages++; oldest = Math.min(oldest, t);
      seen.all.add(key);
      for (const d of [1, 7, 30]) if (t >= now - d * DAY) seen[d].add(key);
    }
  }
  line('');
  line('## Pengunjung situs (perkiraan dari log nginx, termasuk tamu tanpa login)');
  line(`- Perangkat unik 24 jam terakhir : **${fmt(seen[1].size)}**`);
  line(`- Perangkat unik 7 hari terakhir : **${fmt(seen[7].size)}**`);
  line(`- Perangkat unik 30 hari terakhir: **${fmt(seen[30].size)}**`);
  line(`- Sejak ${new Date(oldest).toISOString().slice(0, 10)} (data log yang tersedia): ${fmt(seen.all.size)} perangkat, ${fmt(pages)} kali buka halaman`);
  line('- Catatan: 1 perangkat = kombinasi alamat IP + browser; aplikasi terpasang (PWA/offline) bisa tidak tercatat setiap dibuka.');
}

line(`# Statistik Mahjong Nusantara — ${new Date(now + 7 * 3600000).toISOString().slice(0, 16).replace('T', ' ')} WIB`);
line('');
try { dbStats(); } catch (e) { line('Gagal membaca database: ' + e.message); }
try { logStats(); } catch (e) { line('Gagal membaca log nginx: ' + e.message); }
console.log(out.join('\n'));
