/* store-sqlite.js — penyimpanan data pemain dengan SQLite (modul bawaan Node `node:sqlite`, Node ≥ 22.13).
   Antarmukanya sama dengan store.js (penyimpanan file) sehingga server bisa memakai salah satunya.
   File database: <DATA_DIR>/mahjong.db (mode WAL).
   Saat database baru dibuat dan masih ada data lama berbasis file (users.json, sessions.json, games/*.jsonl),
   semuanya dipindahkan otomatis lalu file lama digeser ke <DATA_DIR>/legacy-json/ (tidak dihapus). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_DAYS = 30;
const hash = t => crypto.createHash('sha256').update(String(t)).digest('base64url');
const safeId = id => String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);

/** muat node:sqlite tanpa memunculkan ExperimentalWarning di log; null jika tidak tersedia */
function loadSqlite() {
  const orig = process.emitWarning;
  process.emitWarning = function (w, ...a) {
    const t = typeof a[0] === 'string' ? a[0] : a[0] && a[0].type;
    if ((t === 'ExperimentalWarning' || (w && w.name === 'ExperimentalWarning')) && /sqlite/i.test(String(w && w.message || w))) return;
    return orig.call(this, w, ...a);
  };
  try { return require('node:sqlite'); } catch { return null; } finally { process.emitWarning = orig; }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT, name TEXT, alias TEXT,
  created INTEGER, last_login INTEGER, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, exp INTEGER NOT NULL, created INTEGER
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS games (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT, user_id TEXT NOT NULL,
  mode TEXT, level TEXT, length TEXT, complete INTEGER, rank INTEGER,
  started_at INTEGER, ended_at INTEGER, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS games_user ON games(user_id, seq);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

class SqliteStore {
  constructor(dir, sqlite = loadSqlite()) {
    if (!sqlite) throw new Error('node:sqlite tidak tersedia (butuh Node 22.13+)');
    this.kind = 'sqlite';
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = path.join(dir, 'mahjong.db');
    const fresh = !fs.existsSync(this.file);
    this.db = new sqlite.DatabaseSync(this.file);
    try { fs.chmodSync(this.file, 0o600); } catch { }
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
    this.db.exec(SCHEMA);
    const q = sql => this.db.prepare(sql);
    this.q = {
      user: q('SELECT data FROM users WHERE id = ?'),
      putUser: q(`INSERT INTO users (id, email, name, alias, created, last_login, data) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, alias = excluded.alias,
        last_login = excluded.last_login, data = excluded.data`),
      userIds: q('SELECT id FROM users'),
      delUser: q('DELETE FROM users WHERE id = ?'),
      session: q('SELECT user_id, exp FROM sessions WHERE token_hash = ?'),
      putSession: q('INSERT OR REPLACE INTO sessions (token_hash, user_id, exp, created) VALUES (?, ?, ?, ?)'),
      delSession: q('DELETE FROM sessions WHERE token_hash = ?'),
      delUserSessions: q('DELETE FROM sessions WHERE user_id = ?'),
      purge: q('DELETE FROM sessions WHERE exp < ?'),
      addGame: q(`INSERT INTO games (id, user_id, mode, level, length, complete, rank, started_at, ended_at, data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
      games: q('SELECT data FROM (SELECT seq, data FROM games WHERE user_id = ? ORDER BY seq DESC LIMIT ?) ORDER BY seq'),
      delGames: q('DELETE FROM games WHERE user_id = ?'),
      count: q('SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM games) AS games, (SELECT COUNT(*) FROM sessions) AS sessions'),
    };
    if (fresh) this._migrateFromFiles();
    this._purgeSessions();
    setInterval(() => this._purgeSessions(), 6 * 3600 * 1000).unref();
  }
  _tx(fn) {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  _purgeSessions() { this.q.purge.run(Date.now()); }
  _putUser(u) { this.q.putUser.run(u.id, u.email || null, u.name || null, u.alias || null, u.created || Date.now(), u.lastLogin || null, JSON.stringify(u)); }
  _getUser(id) { const r = this.q.user.get(id); return r ? JSON.parse(r.data) : null; }

  /* ---------- pindahan dari penyimpanan file lama ---------- */
  _migrateFromFiles() {
    const read = f => { try { return JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')); } catch { return null; } };
    const users = read('users.json'), sessions = read('sessions.json');
    const gdir = path.join(this.dir, 'games');
    const gfiles = fs.existsSync(gdir) ? fs.readdirSync(gdir).filter(f => f.endsWith('.jsonl')) : [];
    if (!users && !sessions && !gfiles.length) return;
    let nu = 0, ns = 0, ng = 0;
    this._tx(() => {
      for (const u of Object.values(users || {})) { if (u && u.id) { this._putUser(u); nu++; } }
      for (const [h, s] of Object.entries(sessions || {})) {
        if (s && s.userId && s.exp > Date.now()) { this.q.putSession.run(h, s.userId, s.exp, s.created || null); ns++; }
      }
      for (const f of gfiles) {
        const uid = f.replace(/\.jsonl$/, '');
        for (const line of fs.readFileSync(path.join(gdir, f), 'utf8').split('\n')) {
          if (!line) continue;
          let rec; try { rec = JSON.parse(line); } catch { continue; }
          this._insertGame(uid, rec); ng++;
        }
      }
    });
    // simpan file lama sebagai cadangan, jangan dihapus
    const legacy = path.join(this.dir, 'legacy-json');
    fs.mkdirSync(legacy, { recursive: true, mode: 0o700 });
    for (const f of ['users.json', 'sessions.json']) { try { fs.renameSync(path.join(this.dir, f), path.join(legacy, f)); } catch { } }
    if (fs.existsSync(gdir)) { try { fs.renameSync(gdir, path.join(legacy, 'games')); } catch { } }
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('migrated_from_files', new Date().toISOString());
    console.log(`[data] dipindahkan ke SQLite: ${nu} pemain, ${ns} sesi login, ${ng} riwayat permainan (file lama di ${legacy})`);
  }

  /* ---------- pengguna ---------- */
  upsertGoogleUser(p) {
    const id = 'g_' + safeId(p.sub);
    const u = this._getUser(id) || { id, created: Date.now() };
    Object.assign(u, {
      sub: String(p.sub), email: String(p.email || ''), name: String(p.name || p.given_name || p.email || 'Pemain').slice(0, 60),
      given: String(p.given_name || '').slice(0, 30), picture: String(p.picture || '').slice(0, 500), lastLogin: Date.now(),
    });
    this._putUser(u);
    return u;
  }
  setAlias(id, alias) {
    const u = this._getUser(id);
    if (!u) return null;
    u.alias = alias;
    this._putUser(u);
    return u;
  }
  deleteUser(id) {
    this._tx(() => { this.q.delGames.run(id); this.q.delUserSessions.run(id); this.q.delUser.run(id); });
  }
  userIds() { return this.q.userIds.all().map(r => r.id); }

  /* ---------- sesi login ---------- */
  createSession(userId) {
    const tok = crypto.randomBytes(32).toString('base64url');
    this.q.putSession.run(hash(tok), userId, Date.now() + SESSION_DAYS * 86400e3, Date.now());
    return tok;
  }
  userBySession(tok) {
    if (!tok) return null;
    const s = this.q.session.get(hash(tok));
    if (!s || s.exp < Date.now()) return null;
    return this._getUser(s.user_id);
  }
  deleteSession(tok) { if (tok) this.q.delSession.run(hash(tok)); }

  /* ---------- riwayat permainan ---------- */
  _insertGame(userId, rec) {
    this.q.addGame.run(rec.id || null, userId, rec.mode || null, rec.level || null, rec.length || null,
      rec.complete ? 1 : 0, rec.rank == null ? null : rec.rank, rec.startedAt || null, rec.endedAt || null, JSON.stringify(rec));
  }
  addGame(userId, rec) {
    if (!this.q.user.get(userId)) return;
    rec.id = crypto.randomBytes(6).toString('hex');
    this._insertGame(userId, rec);
  }
  games(userId, limit = 500) {
    const n = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : -1;   // -1 = tanpa batas
    return this.q.games.all(userId, n).map(r => JSON.parse(r.data));
  }

  /* ---------- pemeliharaan ---------- */
  stats() { return this.q.count.get(); }
  /** salinan konsisten database ke file tujuan (dipakai backup harian) */
  snapshot(dest) { try { fs.unlinkSync(dest); } catch { } this.db.prepare('VACUUM INTO ?').run(dest); }
  flush() { try { this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { } }
  close() { try { this.db.close(); } catch { } }
}

module.exports = { SqliteStore, loadSqlite };
