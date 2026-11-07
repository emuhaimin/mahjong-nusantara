/* server.js — server Mahjong Nusantara: file statis + WebSocket (tanpa dependensi)
   Jalankan: node server/server.js   (atau: npm start)   → http://localhost:3000            */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const zlib = require('zlib');
const { Room } = require('./engine');
const { Store } = require('./store');
const { verifyGoogleIdToken } = require('./auth');
const { summarize, sanitizeRecord } = require('./stats');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
// BASE_PATH: jika dipasang di sub-path, mis. /mahjong (rupaone.io/mahjong/). Kosongkan untuk subdomain.
const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const stripBase = p => (BASE && (p === BASE || p.startsWith(BASE + '/')) ? p.slice(BASE.length) || '/' : p);
const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
};
const PUBLIC = new Set(['index.html', 'privacy.html', 'css', 'js', 'assets', 'sw.js', 'manifest.webmanifest']); // hanya folder ini yang disajikan
const LIMITS = {
  maxRooms: +process.env.MAX_ROOMS || 300,       // room aktif maksimal
  maxConnPerIp: +process.env.MAX_CONN_PER_IP || 12,
  maxFrame: 16 * 1024,                           // byte per pesan
  msgPerWindow: 40, windowMs: 2000,              // batas spam per koneksi
};
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'content-security-policy': "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style; font-src https://fonts.gstatic.com; img-src 'self' data: https://*.googleusercontent.com; connect-src 'self' ws: wss: https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; frame-ancestors 'self'",
};
const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const connPerIp = new Map();

/* ---------------- akun & data pemain ---------------- */
const CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const DATA_DIR = process.env.DATA_DIR || process.env.STATE_DIRECTORY || path.join(ROOT, 'data');
const store = new Store(DATA_DIR);
const COOKIE = 'mjn_sess';
const cookiePath = () => (BASE || '') + '/';
function getCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
const isHttps = req => req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
const setCookie = (req, val, maxAge) => `${COOKIE}=${encodeURIComponent(val)}; Path=${cookiePath()}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`;
const publicUser = u => u && {
  id: u.id, name: u.name, given: u.given || u.name.split(' ')[0], alias: u.alias || null,
  display: u.alias || u.given || u.name.split(' ')[0], email: u.email, picture: u.picture, created: u.created,
};
/** rapikan & periksa alias: 2–14 karakter, huruf/angka/spasi . _ - */
function cleanAlias(v) {
  const a = String(v == null ? '' : v).normalize('NFC').replace(/\s+/g, ' ').trim();
  return /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,13}$/u.test(a) ? a : null;
}
function readJson(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('json')); } });
    req.on('error', reject);
  });
}
const buckets = new Map(); // batas laju sederhana: kunci → {n, reset}
function limited(key, max, windowMs) {
  const now = Date.now(); let b = buckets.get(key);
  if (!b || now > b.reset) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  return ++b.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 600000).unref();

async function handleApi(req, res, url) {
  const send = (code, obj, extra = {}) => {
    res.writeHead(code, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
    res.end(JSON.stringify(obj));
  };
  const m = req.method;
  if (m !== 'GET') {                                     // cegah permintaan dari situs lain (CSRF)
    const o = req.headers.origin;
    try { if (!o || new URL(o).host !== req.headers.host) return send(403, { error: 'Asal permintaan tidak diizinkan.' }); }
    catch { return send(403, { error: 'Asal permintaan tidak diizinkan.' }); }
  }
  const tok = getCookie(req, COOKIE);
  const user = store.userBySession(tok);
  const ip = clientIp(req);
  try {
    if (url === '/api/config' && m === 'GET') return send(200, { googleClientId: CLIENT_ID || null });
    if (url === '/api/me' && m === 'GET') return send(200, { user: publicUser(user) });
    if (url === '/api/auth/google' && m === 'POST') {
      if (limited('auth:' + ip, 20, 600000)) return send(429, { error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
      if (!CLIENT_ID) return send(503, { error: 'Login Google belum diaktifkan di server.' });
      const body = await readJson(req, 8192);
      let p;
      try { p = await verifyGoogleIdToken(body.credential, CLIENT_ID); }
      catch (e) { console.warn('[auth] token ditolak:', e.message); return send(401, { error: 'Login Google gagal diverifikasi. Coba lagi.' }); }
      const u = store.upsertGoogleUser(p);
      const t = store.createSession(u.id);
      console.log(`[auth] masuk: ${u.email}`);
      return send(200, { user: publicUser(u) }, { 'set-cookie': setCookie(req, t, 30 * 86400) });
    }
    if (url === '/api/auth/logout' && m === 'POST') {
      store.deleteSession(tok);
      return send(200, { ok: true }, { 'set-cookie': setCookie(req, '', 0) });
    }
    if (!user) return send(401, { error: 'Silakan masuk dengan Google dulu.' });
    if (url === '/api/stats' && m === 'GET') {
      const recs = store.games(user.id, 500);
      return send(200, { user: publicUser(user), ...summarize(recs), recent: recs.slice(-30).reverse() });
    }
    if (url === '/api/games' && m === 'POST') {
      if (limited('games:' + user.id, 120, 3600000)) return send(429, { error: 'Terlalu banyak data.' });
      const body = await readJson(req, 96 * 1024);
      const rec = sanitizeRecord(body.record);
      if (!rec) return send(400, { error: 'Data sesi tidak valid.' });
      store.addGame(user.id, rec);
      return send(200, { ok: true });
    }
    if (url === '/api/me/alias' && m === 'POST') {
      if (limited('alias:' + user.id, 30, 3600000)) return send(429, { error: 'Terlalu sering mengganti alias. Coba lagi nanti.' });
      const body = await readJson(req, 2048);
      const alias = cleanAlias(body.alias);
      if (!alias) return send(400, { error: 'Alias 2–14 karakter: huruf, angka, spasi, titik, garis bawah, atau tanda minus.' });
      return send(200, { user: publicUser(store.setAlias(user.id, alias)) });
    }
    if (url === '/api/me' && m === 'DELETE') {
      console.log(`[auth] akun dihapus: ${user.email}`);
      store.deleteUser(user.id);
      return send(200, { ok: true }, { 'set-cookie': setCookie(req, '', 0) });
    }
    return send(404, { error: 'Tidak ditemukan.' });
  } catch (e) {
    return send(e.message === 'too large' ? 413 : 400, { error: 'Permintaan tidak valid.' });
  }
}

/* ---------------- HTTP statis ---------------- */
const fileCache = new Map(); // path → {mtime, raw, gz, etag}
const COMPRESS = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);
function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    let c = fileCache.get(file);
    if (!c || c.mtime !== st.mtimeMs) {
      let raw;
      try { raw = fs.readFileSync(file); } catch { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(file);
      c = { mtime: st.mtimeMs, raw, gz: COMPRESS.has(ext) ? zlib.gzipSync(raw, { level: 9 }) : null, etag: '"' + crypto.createHash('sha1').update(raw).digest('base64').slice(0, 16) + '"' };
      fileCache.set(file, c);
    }
    const ext = path.extname(file);
    const headers = {
      ...SECURITY_HEADERS,
      'content-type': MIME[ext] || 'application/octet-stream',
      // gambar kartu jarang berubah → cache 7 hari; kode → selalu cek versi terbaru (ETag)
      'cache-control': file.includes(path.sep + 'assets' + path.sep) ? 'public, max-age=604800' : 'no-cache',
      etag: c.etag, vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, headers); return res.end(); }
    const useGz = c.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (useGz) headers['content-encoding'] = 'gzip';
    const body = useGz ? c.gz : c.raw;
    headers['content-length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (BASE && url === BASE) { res.writeHead(301, { location: BASE + '/' }); return res.end(); }
  url = stripBase(url);
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(`ok rooms=${rooms.size}`); }
  if (url.startsWith('/api/')) { handleApi(req, res, url); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (url === '/') url = '/index.html';
  const file = path.resolve(ROOT, '.' + url);
  const top = path.relative(ROOT, file).split(path.sep)[0];
  if (!file.startsWith(ROOT + path.sep) || !PUBLIC.has(top)) { res.writeHead(404); return res.end('Not found'); }
  serveFile(req, res, file);
});

/* ---------------- WebSocket minimal (RFC 6455) ---------------- */
class Conn extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket; this.buf = Buffer.alloc(0); this.frags = []; this.open = true; this.alive = true;
    socket.setNoDelay(true);
    socket.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }
  parse() {
    while (this.open) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > LIMITS.maxFrame) return this.close();
      const mOff = off; if (masked) off += 4;
      if (b.length < off + len) return;
      let payload = Buffer.from(b.subarray(off, off + len));
      if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= b[mOff + (i & 3)];
      this.buf = b.subarray(off + len);
      if (op === 0x8) return this.close();
      if (op === 0x9) { this.frame(0xA, payload); continue; }
      if (op === 0xA) { this.alive = true; continue; }
      if (op === 0x1 || op === 0x0) {
        this.frags.push(payload);
        if (this.frags.reduce((n, b) => n + b.length, 0) > LIMITS.maxFrame) return this.close();
        if (fin) { const text = Buffer.concat(this.frags).toString('utf8'); this.frags = []; this.emit('message', text); }
      }
    }
  }
  frame(op, payload) {
    if (!this.open) return;
    const len = payload.length; let h;
    if (len < 126) h = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
    try { this.socket.write(Buffer.concat([h, payload])); } catch { this.finish(); }
  }
  send(obj) { this.frame(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))); }
  ping() { this.frame(0x9, Buffer.alloc(0)); }
  close() { if (!this.open) return; this.frame(0x8, Buffer.alloc(0)); this.finish(); try { this.socket.end(); } catch { } }
  finish() { if (!this.open) return; this.open = false; try { this.socket.destroy(); } catch { } this.emit('close'); }
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (stripBase(new URL(req.url, 'http://x').pathname) !== '/ws' || !key) { socket.destroy(); return; }
  // tolak koneksi dari situs lain (Origin harus sama dengan host)
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) { socket.destroy(); return; } } catch { socket.destroy(); return; } }
  const ip = clientIp(req);
  if ((connPerIp.get(ip) || 0) >= LIMITS.maxConnPerIp) { socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return; }
  connPerIp.set(ip, (connPerIp.get(ip) || 0) + 1);
  socket.once('close', () => { const n = (connPerIp.get(ip) || 1) - 1; n > 0 ? connPerIp.set(ip, n) : connPerIp.delete(ip); });
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  onConnection(new Conn(socket), store.userBySession(getCookie(req, COOKIE)));
});

/* ---------------- room & pesan ---------------- */
const rooms = new Map();
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  for (let n = 0; n < 1000; n++) {
    let c = ''; for (let i = 0; i < 4; i++) c += CODE_CH[crypto.randomInt(CODE_CH.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no code');
}
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

function onConnection(conn, user) {
  let room = null, seat = -1;
  const hb = setInterval(() => { if (!conn.alive) return conn.close(); conn.alive = false; conn.ping(); }, 25000);
  const attach = (r, name, token) => {
    const res = r.join(name, token, conn, user);
    if (res.error) return conn.send({ t: 'error', msg: res.error });
    if (room && room !== r) room.leave(conn);
    room = r; seat = res.seat;
    conn.send({ t: 'joined', code: r.code, seat });
  };
  let winStart = Date.now(), winCount = 0, strikes = 0;
  conn.on('message', text => {
    const now = Date.now();
    if (now - winStart > LIMITS.windowMs) { winStart = now; winCount = 0; }
    if (++winCount > LIMITS.msgPerWindow) { if (++strikes > 5) conn.close(); return; }
    let m; try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const token = clean(m.token, 64), name = clean(m.name, 14) || 'Pemain';
    if (m.t === 'create') {
      if (!token) return;
      if (rooms.size >= LIMITS.maxRooms) return conn.send({ t: 'error', msg: 'Server sedang penuh. Coba lagi beberapa saat lagi.' });
      const r = new Room(newCode(), { onRecord: (uid, rec) => { try { store.addGame(uid, rec); } catch (e) { console.error('rekam gagal', e); } } });
      r.setOpts(m.opts || {});
      rooms.set(r.code, r);
      attach(r, name, token);
      console.log(`[room ${r.code}] dibuat oleh ${name}`);
    } else if (m.t === 'join') {
      const r = rooms.get(clean(m.code, 4).toUpperCase());
      if (!r || !r.alive) return conn.send({ t: 'error', msg: 'Room tidak ditemukan. Periksa kodenya.', code: 'noroom' });
      if (!token) return;
      attach(r, name, token);
    } else if (m.t === 'leave') {
      if (room) room.leave(conn);
      room = null; seat = -1;
      conn.send({ t: 'left' });
    } else if (room) {
      room.handle(conn, m);
    }
  });
  conn.on('close', () => { clearInterval(hb); if (room) room.disconnect(conn); });
}

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.connectedHumans() === 0 && now - r.lastActive > 15 * 60 * 1000) { r.destroy(); rooms.delete(code); console.log(`[room ${code}] dihapus (kosong)`); }
  }
}, 60000);

function shutdown() {
  console.log('Menutup server…');
  for (const r of rooms.values()) r.destroy();
  try { store.flush(); } catch (e) { console.error(e); }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', e => console.error('uncaught:', e));

server.listen(PORT, HOST, () => {
  console.log(`\n🀄 Mahjong Nusantara berjalan:`);
  console.log(`   Komputer ini : http://localhost:${PORT}${BASE}/`);
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) console.log(`   Wi-Fi / LAN  : http://${a.address}:${PORT}${BASE}/`);
  }
  console.log('');
});
