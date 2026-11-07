/* auth.js — verifikasi "Sign in with Google" (ID token JWT, RS256) tanpa library tambahan.
   Token dicek: tanda tangan kunci publik Google, penerbit, audience (Client ID), masa berlaku. */
'use strict';
const crypto = require('crypto');
const fs = require('fs');

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let cache = { keys: null, exp: 0 };

async function getKeys(force) {
  // khusus pengujian lokal (tidak aktif di produksi)
  if (process.env.NODE_ENV !== 'production' && process.env.MJN_TEST_JWKS) {
    return JSON.parse(fs.readFileSync(process.env.MJN_TEST_JWKS, 'utf8')).keys;
  }
  if (!force && cache.keys && Date.now() < cache.exp) return cache.keys;
  const r = await fetch(CERTS_URL);
  if (!r.ok) throw new Error('certs ' + r.status);
  const j = await r.json();
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  cache = { keys: j.keys, exp: Date.now() + (m ? +m[1] * 1000 : 3600e3) };
  return cache.keys;
}
const b64json = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

async function verifyGoogleIdToken(token, clientId) {
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID belum diatur');
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || token.length > 4096) throw new Error('format token');
  const header = b64json(parts[0]), payload = b64json(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('alg');
  let keys = await getKeys(false);
  let jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) { keys = await getKeys(true); jwk = keys.find(k => k.kid === header.kid); }
  if (!jwk) throw new Error('kid');
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('signature');
  const now = Math.floor(Date.now() / 1000);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('iss');
  if (payload.aud !== clientId) throw new Error('aud');
  if (!(payload.exp > now - 60)) throw new Error('expired');
  if (payload.iat && payload.iat > now + 300) throw new Error('iat');
  if (payload.email && payload.email_verified === false) throw new Error('email');
  if (!payload.sub) throw new Error('sub');
  return payload;
}
module.exports = { verifyGoogleIdToken };
