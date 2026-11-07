/* record.js — perekam satu sesi permainan seorang pemain + evaluasi keputusannya.
   Dipakai di browser (Main vs Mesin) dan di server (Online), jadi tanpa ketergantungan. */
class MjnRecorder {
  constructor(meta) {
    this.rec = {
      v: 1, mode: meta.mode, startedAt: Date.now(), endedAt: null,
      minFan: meta.minFan, length: meta.length, level: meta.level || null, complete: false,
      hands: [], rank: null, score: null, opponents: (meta.opponents || []).slice(0, 3),
      d: {
        discards: 0, hintSame: 0, worse: 0, autoMoves: 0,
        claimsOffered: 0, claimsTaken: 0, claimAgainstHint: 0, missedWins: 0,
        tenpaiHands: 0, tenpaiTurnSum: 0, openHands: 0, mistakes: [],
      },
    };
    this.h = null;
    this.handNo = 0;
  }
  get handCount() { return this.rec.hands.length; }
  _m(x) { const m = this.rec.d.mistakes; if (m.length < 40) m.push(Object.assign({ h: this.handNo }, x)); }

  startHand(info) {
    this.handNo++;
    this.h = { n: this.handNo, turns: 0, tenpaiAt: null, open: false, dealer: !!info.dealer, wind: info.wind };
  }
  /** k: kartu yang dibuang · bestK/bestS: saran mesin & shanten terbaik · sAfter: shanten setelah buanganmu */
  discard({ k, bestK, bestS, sAfter, auto }) {
    if (!this.h) return;
    const d = this.rec.d;
    this.h.turns++;
    if (auto) { d.autoMoves++; return; }
    d.discards++;
    if (k === bestK) d.hintSame++;
    if (sAfter > bestS) { d.worse++; this._m({ t: 'worse', k, better: bestK, s: sAfter, best: bestS }); }
    if (sAfter <= 0 && this.h.tenpaiAt == null) this.h.tenpaiAt = this.h.turns;
  }
  /** offered: opsi klaim {win,pong,kong,chows} · suggestion: saran mesin (null = lewati) · decision: pilihanmu */
  claim({ offered, suggestion, decision, tileK, auto }) {
    if (!this.h) return;
    const d = this.rec.d;
    d.claimsOffered++;
    if (auto) { d.autoMoves++; return; }
    if (offered.win && (!decision || decision.type !== 'win')) {
      d.missedWins++; this._m({ t: 'missedwin', k: tileK, fan: offered.win.fan });
    }
    if (decision && decision.type !== 'win') {
      d.claimsTaken++; this.h.open = true;
      if (!suggestion) { d.claimAgainstHint++; this._m({ t: 'claim', k: tileK, c: decision.type }); }
    }
  }
  missedTsumo({ fan }) {
    if (!this.h) return;
    this.rec.d.missedWins++; this._m({ t: 'missedtsumo', fan });
  }
  /** r: win | zimo | dealin | lose | other | draw */
  endHand({ r, fan = 0, pattern = '', items = [], delta = 0, k = null }) {
    if (!this.h) return;
    const d = this.rec.d;
    if (this.h.tenpaiAt != null) { d.tenpaiHands++; d.tenpaiTurnSum += this.h.tenpaiAt; }
    if (this.h.open) d.openHands++;
    if (r === 'dealin') this._m({ t: 'dealin', k });
    this.rec.hands.push({
      n: this.h.n, r, fan, pattern, items: items.slice(0, 12).map(x => [String(x[0]), +x[1] || 0]), delta,
      turns: this.h.turns, tenpaiAt: this.h.tenpaiAt, open: this.h.open, dealer: this.h.dealer,
    });
    this.h = null;
  }
  finish({ rank, score, complete }) {
    this.rec.endedAt = Date.now();
    this.rec.rank = rank; this.rec.score = score; this.rec.complete = !!complete;
    return this.rec;
  }
}

/** hasil hand dari sudut pandang kursi `me` */
function mjnHandResult(res, me) {
  if (res.type === 'draw') return 'draw';
  if (res.p === me) return res.selfDraw ? 'zimo' : 'win';
  if (res.selfDraw) return 'lose';
  return res.from === me ? 'dealin' : 'other';
}
if (typeof module !== 'undefined') module.exports = { MjnRecorder, mjnHandResult };
