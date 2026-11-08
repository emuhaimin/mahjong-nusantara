/* scan.js — kenali kartu mahjong dari foto memakai Claude API (vision + structured outputs).
   Dipakai server/server.js untuk POST /api/scan. Tanpa paket npm: memakai fetch bawaan Node (raw HTTP),
   karena proyek ini sengaja tanpa dependensi npm.
   Aktif bila ANTHROPIC_API_KEY diatur (mis. di /etc/mahjong-nusantara.env). */
'use strict';

const API_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '') + '/v1/messages';
const MODEL = process.env.SCAN_MODEL || 'claude-opus-5-5';

// kode kartu → indeks k (sama dengan js/tiles.js)
const CODES = {};
for (let i = 0; i < 9; i++) { CODES[`${i + 1}m`] = i; CODES[`${i + 1}p`] = 9 + i; CODES[`${i + 1}s`] = 18 + i; }
Object.assign(CODES, { E: 27, S: 28, W: 29, N: 30, C: 31, F: 32, P: 33 });
const FLOWERS = { f1: 34, f2: 35, f3: 36, f4: 37, s1: 38, s2: 39, s3: 40, s4: 41 };

const SCHEMA = {
  type: 'object',
  properties: {
    tiles: { type: 'array', items: { type: 'string', enum: Object.keys(CODES) } },
    flowers: { type: 'array', items: { type: 'string', enum: Object.keys(FLOWERS) } },
    red_fives: { type: 'integer' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    notes: { type: 'string' },
  },
  required: ['tiles', 'flowers', 'red_fives', 'confidence', 'notes'],
  additionalProperties: false,
};

const PROMPT = `This photo shows a winning mahjong hand (Hong Kong / Taiwan / Japanese tiles) laid out on a table.
List every playing tile in the winning hand, one entry per physical tile (a Pong of 5 bamboo is three "5s" entries; a Kong is four entries).

Tile codes:
- Characters / 萬 / Wan (Chinese numeral above 萬): "1m".."9m"
- Circles / 筒 / dots: "1p".."9p"
- Bamboo / 索 / sticks: "1s".."9s" (1 bamboo is usually a bird)
- Winds: "E" 東 East, "S" 南 South, "W" 西 West, "N" 北 North
- Dragons: "C" red 中, "F" green 發, "P" white 白 (blank or framed tile)
Bonus tiles go in "flowers", not "tiles": "f1".."f4" for flowers (梅 plum, 蘭 orchid, 菊 chrysanthemum, 竹 bamboo, numbered 1-4) and "s1".."s4" for seasons (春 spring, 夏 summer, 秋 autumn, 冬 winter).
"red_fives": how many 5 tiles are red/aka (Japanese sets), else 0.

Rules:
- Only tiles that are clearly part of the displayed hand; ignore discards, the wall, tile backs and anything you cannot read.
- Order tiles left to right as they appear.
- If tiles are hidden, blurry or ambiguous, still give your best reading, set "confidence" lower and explain briefly in "notes" (in Indonesian).
- "notes": short, Indonesian, for the player (e.g. which tile was uncertain). Empty string if nothing to add.`;

/** gambar base64 (JPEG/PNG/WebP) → { tiles:[k], flowers:[k], redFives, confidence, notes } */
async function scanTiles(imageB64, mediaType) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Object.assign(new Error('Scan foto belum diaktifkan di server ini.'), { status: 503, code: 'noscan' });
  const body = {
    model: MODEL,
    max_tokens: 4000,
    fallbacks: 'default',                                   // bila ditolak pengaman, coba model cadangan otomatis
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageB64 } },
        { type: 'text', text: PROMPT },
      ],
    }],
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90000);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST', signal: ctl.signal,
      headers: {
        'content-type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw Object.assign(new Error('Layanan pengenal kartu tidak bisa dihubungi. Coba lagi.'), { status: 502 });
  } finally { clearTimeout(timer); }
  let j = null; try { j = await res.json(); } catch { }
  if (!res.ok) {
    console.error('[scan] API', res.status, j && j.error ? `${j.error.type}: ${j.error.message}` : '');
    const busy = res.status === 429 || res.status === 529 || res.status >= 500;
    throw Object.assign(new Error(busy ? 'Pengenal kartu sedang sibuk. Coba lagi sebentar.' : 'Foto tidak bisa diproses.'), { status: busy ? 503 : 502 });
  }
  if (j.stop_reason === 'refusal') throw Object.assign(new Error('Foto tidak bisa diproses. Coba foto lain.'), { status: 422 });
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let out;
  try { out = JSON.parse(text); } catch { throw Object.assign(new Error('Hasil pengenalan tidak terbaca. Coba lagi.'), { status: 502 }); }
  const tiles = (out.tiles || []).map(c => CODES[c]).filter(k => k != null).slice(0, 24);
  const flowers = [...new Set((out.flowers || []).map(c => FLOWERS[c]).filter(k => k != null))];
  return {
    tiles, flowers, redFives: Math.max(0, Math.min(3, out.red_fives | 0)),
    confidence: ['high', 'medium', 'low'].includes(out.confidence) ? out.confidence : 'low',
    notes: String(out.notes || '').slice(0, 300),
  };
}
const scanEnabled = () => !!process.env.ANTHROPIC_API_KEY;

module.exports = { scanTiles, scanEnabled, CODES, FLOWERS };
