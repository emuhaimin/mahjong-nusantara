/* store.js — penyimpanan sederhana berbasis file (tanpa database terpisah).
   users.json   : profil pengguna (dari akun Google)
   sessions.json: sesi login (token disimpan dalam bentuk hash)
   games/<id>.jsonl : riwayat sesi permainan per pengguna, satu baris per sesi */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_DAYS = 30;
const hash = t => crypto.createHash('sha256').update(String(t)).digest('base64url');
const safeId = id => String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);

class Store {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(path.join(dir, 'games'), { recursive: true, mode: 0o700 });
    this.users = this._load('users.json', {});
    this.sessions = this._load('sessions.json', {});
    this._timers = {};
    this._purgeSessions();
    setInterval(() => this._purgeSessions(), 6 * 3600 * 1000).unref();
  }
  _load(f, def) {
    try { return JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')); } catch { return def; }
  }
  _write(f, obj) {
    const p = path.join(this.dir, f), tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
    fs.renameSync(tmp, p);
  }
  _save(f) {
    clearTimeout(this._timers[f]);
    this._timers[f] = setTimeout(() => { delete this._timers[f]; this._write(f, f === 'users.json' ? this.users : this.sessions); }, 150);
  }
  flush() {
    for (const f of Object.keys(this._timers)) clearTimeout(this._timers[f]);
    this._timers = {};
    this._write('users.json', this.users);
    this._write('sessions.json', this.sessions);
  }
  _purgeSessions() {
    const now = Date.now(); let n = 0;
    for (const [k, s] of Object.entries(this.sessions)) if (!s || s.exp < now) { delete this.sessions[k]; n++; }
    if (n) this._save('sessions.json');
  }

  /* ---------- pengguna ---------- */
  upsertGoogleUser(p) {
    const id = 'g_' + safeId(p.sub);
    const u = this.users[id] || { id, created: Date.now() };
    Object.assign(u, {
      sub: String(p.sub), email: String(p.email || ''), name: String(p.name || p.given_name || p.email || 'Pemain').slice(0, 60),
      given: String(p.given_name || '').slice(0, 30), picture: String(p.picture || '').slice(0, 500), lastLogin: Date.now(),
    });
    this.users[id] = u;
    this._save('users.json');
    return u;
  }
  /** nama alias yang dipakai di meja (2–14 huruf/angka/spasi . _ -) */
  setAlias(id, alias) {
    const u = this.users[id];
    if (!u) return null;
    u.alias = alias;
    this._save('users.json');
    return u;
  }
  deleteUser(id) {
    delete this.users[id];
    for (const [k, s] of Object.entries(this.sessions)) if (s.userId === id) delete this.sessions[k];
    try { fs.unlinkSync(this._gamesFile(id)); } catch { }
    this._save('users.json'); this._save('sessions.json');
  }

  /* ---------- sesi login ---------- */
  createSession(userId) {
    const tok = crypto.randomBytes(32).toString('base64url');
    this.sessions[hash(tok)] = { userId, exp: Date.now() + SESSION_DAYS * 86400e3, created: Date.now() };
    this._save('sessions.json');
    return tok;
  }
  userBySession(tok) {
    if (!tok) return null;
    const s = this.sessions[hash(tok)];
    if (!s || s.exp < Date.now()) return null;
    return this.users[s.userId] || null;
  }
  deleteSession(tok) {
    if (!tok) return;
    delete this.sessions[hash(tok)];
    this._save('sessions.json');
  }

  /* ---------- riwayat permainan ---------- */
  _gamesFile(id) { return path.join(this.dir, 'games', safeId(id) + '.jsonl'); }
  addGame(userId, rec) {
    if (!this.users[userId]) return;
    rec.id = crypto.randomBytes(6).toString('hex');
    fs.appendFileSync(this._gamesFile(userId), JSON.stringify(rec) + '\n', { mode: 0o600 });
  }
  games(userId, limit = 500) {
    let txt;
    try { txt = fs.readFileSync(this._gamesFile(userId), 'utf8'); } catch { return []; }
    const out = [];
    for (const line of txt.split('\n')) { if (!line) continue; try { out.push(JSON.parse(line)); } catch { } }
    return out.slice(-limit);
  }
}
module.exports = { Store };
