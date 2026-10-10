// v4 chorus ×4 (2026-10-10, user: 「風格還是統一好了」「完全比不過 p(doom) 的震撼感」): THE BOARD. One look — ink, bone,
// magenta for the state of the art and the word being sung — giant type, big hits.
//   A  YOU WERE / STATE OF THE ART, — two giant lines on the champion's slab at the top of a leaderboard tower
//   B  NOW — the challenger slams onto the tower and the champion's slab shatters; its name plate falls the height of
//      the tower, clunking down on every word, the camera diving with it: NOW · YOU'RE · JUST · A light up as it passes
//   C  BASELINE — the plate hits the floor on the word: magenta floods out over the floor with BASELINE written across it
//   D  TOP OF THE LEADERBOARD — the camera rockets back up to the header; the new champion glows under it
//   E  UNTIL THE NEXT DEADLINE — the header becomes a countdown that hits 00:00.00 on "deadline"; DEADLINE slams in
// n = 1 ILSVRC · 2 WMT14 (harder) · 3 LAMBADA (cold: no shards, no flood — the plate is set down) · 4 parameters (overload)
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, frameMarks, tc, clamp, lerp, ease, hexA, mixHex, hot, W, H, U, UF, vlerp, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

interface Board { title: string; note: string; rows: [string, string, string][]; chal: [string, string, string]; mode: 'gold' | 'hard' | 'cold' | 'over' }
const BOARDS: Record<number, Board> = {
  1: { title: 'ILSVRC · TOP-5 ERROR', note: 'LOWER IS BETTER', mode: 'gold',
    rows: [['HAND FEATURES + SVM', '25.8', '2011'], ['FISHER VECTORS + SVM', '26.2', '2012'], ['FISHER VECTORS + SVM', '27.0', '2012'], ['FISHER VECTORS + SVM', '27.1', '2012'], ['SIFT + LBP + SVM', '28.2', '2010'], ['HAND FEATURES + SVM', '29.6', '2012'], ['HAND FEATURES + SVM', '34.5', '2012']],
    chal: ['DEEP CONVNET · 8 LAYERS', '15.3', '2012'] },
  2: { title: 'WMT14 EN→DE · BLEU', note: 'SINGLE MODELS · HIGHER IS BETTER', mode: 'hard',
    rows: [['LSTM + MIXTURE OF EXPERTS', '26.0', '2017'], ['CONV SEQ2SEQ', '25.2', '2017'], ['LSTM SEQ2SEQ + ATTENTION', '24.6', '2016'], ['BYTENET', '23.8', '2016']],
    chal: ['TRANSFORMER (BIG)', '28.4', '2017'] },
  3: { title: 'LAMBADA · ACCURACY', note: 'HIGHER IS BETTER', mode: 'cold',
    rows: [['17B DECODER · PREVIOUS BEST', '68.0', '2020'], ['8.3B DECODER · ZERO-SHOT', '66.5', '2019'], ['1.5B DECODER · ZERO-SHOT', '63.2', '2019']],
    chal: ['175B DECODER · FEW-SHOT', '86.4', '2020'] },
  4: { title: 'DENSE DECODERS · PARAMETERS', note: 'BIGGER IS BETTER?', mode: 'over',
    rows: [['DENSE DECODER', '530B', '2021'], ['DENSE DECODER', '280B', '2021'], ['DENSE DECODER', '175B', '2020'], ['DENSE DECODER', '17B', '2020'], ['ENC–DEC', '11B', '2019'], ['DENSE DECODER', '1.5B', '2019']],
    chal: ['DENSE DECODER', '540B', '2022'] },
};
const RW = 11;              // tower half-width
const RH = 1.7;             // a lower row's height
const TH = 6.0;             // the champion's slab
const HH = 6.6;             // the header board
const YT = 15.6;            // the champion slab's bottom (the same tower height for every board)
const BZ = 6.5;             // the baseline line on the floor (z)
const PZ = 2.4;             // the falling plate's z
const yHead0 = YT + TH + 0.6, yHeadMid = yHead0 + HH / 2;

export default class Lb extends VScene {
  private n = 1;
  private tNow = 0;
  private b!: Board;
  private L: Word[][] = [];
  private knots: { t: number; y: number }[] = [];
  private wordY: { w: Word; y: number }[] = [];

  override init() {
    this.n = Number(this.ctx.params.n ?? 1);
    this.b = BOARDS[this.n] ?? BOARDS[1]!;
    this.bg = U.ink;
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L = [0, 1, 2, 3].map((k) => ly.lines[i0 + k]!.words);
    const s = this.ctx.start, e = this.ctx.end;
    const tNow = this.L[1]![0]!.start, tBase = this.w(1, /baseline/).start, tTop = this.L[2]![0]!.start, tLead = this.w(2, /leaderboard/).start, tUntil = this.L[3]![0]!.start, tDead = this.w(3, /deadline/).start;
    // the plate's fall: it stops on every word of "now you're just a" (a clunk per word), then the floor on "baseline"
    const fallWords = this.L[1]!.slice(0, -1);
    this.knots = [{ t: tNow + 0.08, y: YT - 0.4 }];
    fallWords.forEach((w, i) => {
      const y = lerp(YT - 3.2, 2.6, i / Math.max(1, fallWords.length - 1));
      if (i > 0) this.knots.push({ t: w.start, y });
      this.wordY.push({ w, y: y + 0.2 });
    });
    this.knots.push({ t: tBase, y: 0.06 });
    const cold = this.b.mode === 'cold', big = this.b.mode === 'hard' || this.b.mode === 'over' ? 1.35 : 1;
    this.rig = new Rig([
      { t0: s, name: 'state', key: (t) => { const k = ease.inOutQuad(clamp((t - s) / (tNow - s))); return K([lerp(3.5, 1.2, k), YT + lerp(2.4, 3.0, k), lerp(19, 15.5, k)], [0, YT + TH * 0.5 + 0.2, 0], 42, lerp(-0.03, 0.01, k)); } },
      { t0: tNow + 0.1, snap: 0.14, name: 'dive', key: (t) => { const y = this.fallY(t); return K([6.5, y + 2.2, PZ + 12.5], [0.6, y - 0.4, PZ - 0.5], 48, 0.04); } },
      { t0: tBase - 0.03, name: 'floor', key: (t) => { const k = ease.outCubic(clamp((t - tBase) / (tTop - tBase))); return K([0, lerp(15.5, 17.5, k), BZ + 2.4], [0, 0, BZ + 2.4], 52, 0, [0, 0, -1]); } },
      { t0: tTop - 0.03, name: 'crane', key: (t) => {
        const k = ease.inOutCubic(clamp((t - tTop) / (tLead + 0.15 - tTop)));
        return K([lerp(4, 1.5, k), lerp(0.8, yHeadMid + 1.0, k), lerp(15, 18, k)], [0, lerp(3.5, yHeadMid - 0.4, k), 0], lerp(56, 42, k), lerp(0.06, 0, k));
      } },
      { t0: tUntil - 0.03, snap: 0.3, name: 'clock', key: (t) => { const k = ease.inOutQuad(clamp((t - tUntil) / (e - tUntil))); const kd = ease.outExpo(clamp((t - tDead) / 0.3)); return K([lerp(1.0, 0.4, k), yHeadMid + 0.4, lerp(17.5, 16.2, k) - 0.5 * kd], [0, yHeadMid - 0.2, 0], 42); } },
    ], cold
      ? [{ t: tNow, amp: 0.4 }, { t: tBase, amp: 0.3 }]
      : [{ t: tNow, amp: 2.4 * big }, ...this.knots.slice(1, -1).map((k) => ({ t: k.t, amp: 0.7 })), { t: tBase, amp: 2.0 * big }, { t: tDead, amp: 1.3 * big }], 0.8, 60 + this.n);
    void tLead;
  }

  private w(i: number, re: RegExp) { return this.L[i]!.find((x) => re.test(x.w))!; }
  /** the plate's height: eased drops between the knots, each ending in a stop */
  private fallY(t: number) {
    const K0 = this.knots;
    if (t <= K0[0]!.t) return K0[0]!.y;
    for (let i = 1; i < K0.length; i++) {
      const a = K0[i - 1]!, b = K0[i]!;
      if (t <= b.t) return lerp(a.y, b.y, ease.inQuad(clamp((t - a.t) / Math.max(0.05, b.t - a.t))));
    }
    return K0[K0.length - 1]!.y;
  }
  /** the largest size ≤ max at which s fits in width wd (plane units) */
  private fitSize(s: string, fam: string, wd: number, max: number) { return Math.min(max, wd / Math.max(0.01, this.tw3(s, { size: 1, fam }))); }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    this.tNow = t;
    void f;
    const b = this.b, L = this.L, s = this.ctx.start, e = this.ctx.end;
    const tNow = L[1]![0]!, tBase = this.w(1, /baseline/), tTop = L[2]![0]!, tUntil = L[3]![0]!, tDead = this.w(3, /deadline/);
    const cold = b.mode === 'cold';
    const kick = this.beatPulse(t, 0.08);
    const nLow = b.rows.length - 1;
    const smashed = t >= tNow.start;
    // ------------------------------------------------ the arena: floor grid, the baseline, beams
    this.grid3(c, floorPl(0), -40, 40, -30, 30, 2, U.line, 1, { alpha: 0.9, fog: [14, 60] });
    this.beams(c, t);
    // ------------------------------------------------ the tower: rails, back glass, lower rows
    for (const x of [-RW - 0.5, RW + 0.5]) this.box3(c, [x - 0.18, 0, -0.9], [x + 0.18, yHead0 + HH + 0.4, -0.5], U.graphite, 1.2, { fill: U.ink2 });
    this.fill3(c, [[-RW, 0, -0.7], [RW, 0, -0.7], [RW, yHead0 + HH, -0.7], [-RW, yHead0 + HH, -0.7]], hexA(U.ink2, 0.9));
    const pitch = (YT - 1.2) / Math.max(5, nLow);
    for (let k = 0; k < nLow; k++) {
      const r = b.rows[nLow - k]!, y0 = 0.7 + k * pitch;
      this.row(c, y0, RH, r, nLow - k + 1, false, 0);
    }
    // ------------------------------------------------ the champion's slab (before the smash) / the challenger (after)
    if (!smashed) this.champion(c, t);
    else this.shards(c, t, tNow.start);
    const tIn = tNow.start - 0.3;
    if (t > tIn) {
      const y = t < tNow.start ? lerp(YT + 26, YT, ease.inQuad(clamp((t - tIn) / 0.3))) : YT + 0.35 * Math.exp(-(t - tNow.start) * 11) * Math.sin((t - tNow.start) * 46);
      this.challenger(c, t, y);
    }
    // ------------------------------------------------ the falling plate, NOW YOU'RE JUST A on the tower face
    if (smashed) {
      for (const { w, y } of this.wordY) {
        if (t < w.start - 0.03 || t > tBase.start + 0.1) continue;
        const P: Pl = { o: [0, y, 0.45], r: [1, 0, 0], u: [0, 1, 0] };
        const s0 = w.w.toUpperCase().replace('’', "'");
        const sz = this.fitSize(s0, UF.wide, 17, 3.0);
        this.hero3(c, s0, P, 0, 0, t, w.start, w.end + 0.08, { size: sz, slam: 0.45, glow: 18, glowColor: U.ink });
      }
      this.plate(c, t);
    }
    // ------------------------------------------------ BASELINE on the floor (the flood)
    if (t > tBase.start - 0.03) this.flood(c, t, tBase.start, tTop.start);
    // ------------------------------------------------ the header: YOU WERE (A) · TOP OF THE LEADERBOARD (D) · countdown (E)
    this.header(c, t);
    if (t > tDead.start + 0.25 && !cold) this.nextShadow(c, t, tDead.start + 0.25);
    frameMarks(c, U.ash, { tl: `BASELINE · BOARD ${String(this.n).padStart(2, '0')}`, tr: b.title, bl: `CHORUS ${this.n} / 4`, br: tc(t), alpha: 0.5 });
    const floodK = t > tBase.start && t < tTop.start ? 1 : 0;
    const hitN = cold ? 0 : hot(t, tNow.start, 0.1), hitB = cold ? 0 : hot(t, tBase.start, 0.1), hitD = cold ? 0 : hot(t, tDead.start, 0.1);
    void s; void e; void W; void H;
    return {
      grade: 0, bloom: floodK ? 0.25 : 0.7, bloomThreshold: floodK ? 0.95 : 0.6, halation: 0.18, grain: 0.06, vignette: 0.34,
      ca: 0.3 + 3.0 * hitN + 2.4 * hitB + 1.6 * hitD, split: 6 * hitN + 4 * hitB, radial: 0.05 * hitN + 0.04 * hitB,
      zoom: 1 + 0.012 * kick + 0.05 * hitN + 0.04 * hitB + 0.03 * hitD,
    };
  }

  /** a lower row: rank, name, score, year */
  private row(c: Ctx, y0: number, h: number, r: [string, string, string], rank: number, top: boolean, flash: number) {
    const P: Pl = { o: [0, y0, 0.31], r: [1, 0, 0], u: [0, 1, 0] };
    this.box3(c, [-RW, y0, -0.3], [RW, y0 + h, 0.3], top ? U.mag : U.graphite, top ? 2 : 1.2, { fill: top ? U.magDark : U.panel });
    if (flash > 0.01) this.rect3(c, P, -RW, 0, 2 * RW, h, { fill: hexA(U.bone, 0.3 * flash) });
    const ts = h / 1.7;
    this.text3(c, String(rank).padStart(2, '0'), P, -RW + 0.5, h * 0.5, { size: 0.95 * ts, fam: UF.cond, color: top ? U.mag : U.ash, mid: true });
    const x0 = -RW + 2.3, x1 = RW - 4.2;
    const sz = Math.min(0.62 * ts, (x1 - x0) / Math.max(0.01, this.tw3(r[0], { size: 1, fam: UF.monoB })));
    this.text3(c, r[0], P, x0, h * 0.5, { size: sz, fam: UF.monoB, color: U.bone, mid: true });
    this.text3(c, r[1], P, RW - 1.6, h * 0.5, { size: 0.95 * ts, fam: UF.cond, color: top ? U.mag : U.bone, align: 'right', mid: true });
    this.text3(c, r[2], P, RW - 0.3, h * 0.5, { size: 0.4 * ts, fam: UF.mono, color: U.ash, align: 'right', mid: true });
  }

  /**
   * The face of a champion's slab (2026-10-10 polish: the flat pink box read cheap): dark glass over a fine grid of
   * magenta LEDs, brighter toward the foot, a scan band sweeping across on the beat, and a hot top edge.
   */
  private ledFace(c: Ctx, t: number, y0: number, w: number, h: number, k = 1) {
    const sp = 0.24, nx = Math.floor((2 * w) / sp), ny = Math.floor(h / sp);
    const dim: number[] = [], lit: number[] = [];
    const scan = -w + (((t - this.ctx.start) * 0.55) % 1) * 2 * w * 1.4 - 0.2 * w;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = -w + (i + 0.5) * sp, y = y0 + (j + 0.5) * sp;
      const foot = 1 - j / ny;
      const band = Math.exp(-Math.pow((x - scan) / 1.2, 2));
      const v = 0.18 * foot + band * 0.8 + (hash(i, j) > 0.985 ? 0.6 : 0);
      (v > 0.42 ? lit : dim).push(x, y, 0.37);
    }
    this.points(c, dim, dim.length / 3, U.magDeep, 4.2, 0.6 * k);
    this.points(c, lit, lit.length / 3, U.mag, 4.8, 0.95 * k);
    // the glass: a faint sheen across the top third
    const P: Pl = { o: [0, y0, 0.375], r: [1, 0, 0], u: [0, 1, 0] };
    this.rect3(c, P, -w, h * 0.62, 2 * w, h * 0.38, { fill: hexA(U.bone, 0.035 * k) });
    this.glowSeg(c, [-w, y0 + h, 0.38], [w, y0 + h, 0.38], U.mag, 2.2, 12, k);
  }

  /** A: the champion's slab, STATE OF / THE ART, set giant on its face */
  private champion(c: Ctx, t: number) {
    const b = this.b, L = this.L;
    const y0 = YT;
    const P: Pl = { o: [0, y0, 0.36], r: [1, 0, 0], u: [0, 1, 0] };
    this.box3(c, [-RW, y0, -0.35], [RW, y0 + TH, 0.35], U.mag, 2.4, { fill: '#12050C' });
    this.ledFace(c, t, y0, RW, TH, 0.8 + 0.2 * this.beatPulse(t, 0.12));
    // the crown on its roof
    this.crown(c, [-RW + 1.4, y0 + TH + 0.65, 0], 0.85);
    // YOU WERE, small, top-left; STATE OF / THE ART, giant, word by word
    const iS = L[0]!.findIndex((w) => /state/.test(w.w));
    this.say3(c, L[0]!.slice(0, iS), t, P, -RW + 0.6, TH - 0.85, { size: 0.62, fam: UF.heavy, up: '', cur: U.mag, done: U.bone, upper: true, slam: 0.3 });
    const l1 = L[0]!.slice(iS, iS + 2), l2 = L[0]!.slice(iS + 2);
    const s1 = l1.map((w) => w.w.toUpperCase()).join(' '), s2 = l2.map((w) => w.w.toUpperCase()).join(' ');
    const sz = Math.min(this.fitSize(s1, UF.wide, 2 * RW - 1.6, 2.4), this.fitSize(s2, UF.wide, 2 * RW - 1.6, 2.4));
    const y1 = TH - 1.05 - sz * 0.72, y2 = y1 - sz * 0.72 - 0.42;
    this.say3(c, l1, t, P, 0, y1, { size: sz, fam: UF.wide, up: '', cur: U.mag, done: U.bone, align: 'center', upper: true, slam: 0.4 });
    this.say3(c, l2, t, P, 0, y2, { size: sz, fam: UF.wide, up: '', cur: U.mag, done: U.bone, align: 'center', upper: true, slam: 0.4 });
    // the name strip along the slab's foot: who is the state of the art
    const r = b.rows[0]!;
    this.rect3(c, P, -RW, 0, 2 * RW, 0.55, { fill: hexA(U.ink, 0.6) });
    this.text3(c, `#1   ${r[0]}`, P, -RW + 0.5, 0.28, { size: 0.32, fam: UF.monoB, color: U.bone, mid: true });
    this.text3(c, `${r[1]}   ${r[2]}`, P, RW - 0.5, 0.28, { size: 0.32, fam: UF.monoB, color: U.mag, align: 'right', mid: true });
  }

  /** the challenger's slab: drops onto the tower on "now" and is the champion from then on */
  private challenger(c: Ctx, t: number, y0: number) {
    const r = this.b.chal;
    const P: Pl = { o: [0, y0, 0.36], r: [1, 0, 0], u: [0, 1, 0] };
    this.box3(c, [-RW, y0, -0.35], [RW, y0 + TH, 0.35], U.mag, 2.4, { fill: '#12050C' });
    this.ledFace(c, t, y0, RW, TH, 0.85 + 0.15 * this.beatPulse(t, 0.12));
    const sz = this.fitSize(r[0], UF.wide, 2 * RW - 2, 1.5);
    this.text3(c, r[0], P, 0, TH * 0.6, { size: sz, fam: UF.wide, color: U.bone, align: 'center', mid: true });
    this.text3(c, r[1], P, 0, TH * 0.24, { size: 1.5, fam: UF.cond, color: U.mag, align: 'center', mid: true, glow: 16, glowColor: U.mag });
    this.text3(c, `#1 · ${r[2]}`, P, RW - 0.5, TH - 0.5, { size: 0.32, fam: UF.monoB, color: U.bone, align: 'right', mid: true });
    this.crown(c, [-RW + 1.4, y0 + TH + 0.65, 0], 0.85);
  }

  /** the champion's slab shattered on the smash (the cold chorus sets it down instead: no shards) */
  private shards(c: Ctx, t: number, t0: number) {
    if (this.b.mode === 'cold') return;
    const dt = t - t0;
    if (dt > 1.6) return;
    const n = this.b.mode === 'over' ? 64 : 44;
    for (let i = 0; i < n; i++) {
      const x0 = -RW + (i % 11) * (2 * RW / 11) + 1, y0 = YT + 0.8 + Math.floor(i / 11) * 1.0;
      const vx = (hash(i, 1) - 0.5) * 14 + x0 * 0.6, vy = 3 + hash(i, 2) * 7, vz = 2 + hash(i, 3) * 9;
      const x = x0 + vx * dt, y = y0 + vy * dt - 9.8 * dt * dt, z = 0.4 + vz * dt;
      if (y < -1) continue;
      const a = hash(i, 4) * 6.28 + dt * (hash(i, 5) - 0.5) * 12, s = 0.5 + hash(i, 6) * 0.7;
      const pts: V3[] = [0, 1, 2].map((j) => { const an = a + j * 2.1 + hash(i, j + 7); return [x + Math.cos(an) * s, y + Math.sin(an) * s * 0.8, z + Math.sin(an * 1.3) * 0.3] as V3; });
      const fade = clamp(1 - dt / 1.6);
      this.fill3(c, pts, hexA(i % 3 ? U.magDark : U.mag, 0.9 * fade), { stroke: hexA(U.magHot, fade), lw: 1.2 });
    }
  }

  /** the old champion's name plate: falls the tower with the camera, lands flat on the floor behind the baseline */
  private plate(c: Ctx, t: number) {
    const tBase = this.w(1, /baseline/).start, tNow = this.L[1]![0]!.start;
    const y = this.fallY(t);
    const land = ease.outCubic(clamp((t - tBase) / 0.14));
    const slide = ease.outCubic(clamp((t - tBase) / 0.45));
    const z = lerp(lerp(0.4, PZ, ease.outCubic(clamp((t - tNow) / 0.3))), BZ - 1.9, slide);
    const wob = 0.12 * Math.sin((t - tNow) * 9) * (1 - land);
    const ang = lerp(wob, Math.PI / 2, land);
    const P: Pl = { o: [0, Math.max(0.05, y), z], r: [1, 0, 0], u: [0, Math.cos(ang), -Math.sin(ang)] };
    const grey = clamp((t - tBase - 0.5) / 0.6);
    const ph = 1.3;
    this.rect3(c, P, -RW, 0, 2 * RW, ph, { fill: mixHex(U.magDark, U.panel, grey), stroke: mixHex(U.mag, U.graphite, grey), lw: 2.2 });
    const r = this.b.rows[0]!;
    this.text3(c, r[0], P, -RW + 0.6, ph * 0.5, { size: 0.62, fam: UF.monoB, color: mixHex(U.bone, U.ash, grey), mid: true });
    this.text3(c, `${r[1]} · ${r[2]}`, P, RW - 0.6, ph * 0.5, { size: 0.62, fam: UF.monoB, color: mixHex(U.mag, U.ash, grey), align: 'right', mid: true });
    // speed lines while it falls
    if (land < 1 && t > tNow + 0.15) {
      const sl: [V3, V3][] = [];
      for (let j = 0; j < 26; j++) { const x = -RW + (j / 25) * 2 * RW, yy = y + 1.6 + 3 * hash(j, 7); sl.push([[x, yy, z], [x, yy + 2.2 + 2 * hash(j, 8), z]]); }
      this.segs(c, sl, hexA(U.bone, 0.3), 1.2);
    }
  }

  /** C: the floor on "baseline": magenta floods out from the line (bone in the cold chorus), BASELINE across it */
  private flood(c: Ctx, t: number, t0: number, t1: number) {
    const cold = this.b.mode === 'cold';
    const G = floorPl(0.02);
    const grow = ease.outExpo(clamp((t - t0) / 0.22)), shrink = ease.inOutCubic(clamp((t - (t1 - 0.32)) / 0.32));
    const half = lerp(0.06, 11, grow) * (1 - shrink) + 0.06 * shrink;
    const fieldCol = cold ? U.ash : U.mag;
    this.rect3(c, G, -26, -(BZ + half), 52, 2 * half, { fill: fieldCol });
    // shock rings off the impact
    if (!cold && t < t0 + 0.9) for (let i = 0; i < 2; i++) { const u = clamp((t - t0 - i * 0.12) / 0.75); if (u > 0) this.ring3(c, G, 0, -(BZ - 1.9), 3 + 22 * u, U.bone, 3 * (1 - u), { alpha: 1 - u, n: 64 }); }
    // BASELINE: ink on the flood, bone once it has receded
    const onField = half > 3;
    const sz = this.fitSize('BASELINE', UF.wide, 22, 3.4);
    const k = clamp((t - t0) / 0.13);
    this.text3(c, 'BASELINE', G, 0, -(BZ + 2.6), { size: sz, fam: UF.wide, color: onField ? U.ink : U.bone, align: 'center', mid: true, each: () => ({ sc: 1 + 0.5 * Math.pow(1 - k, 3) }) });
    this.text3(c, 'y = 0', G, 0, -(BZ + 5.2), { size: 0.6, fam: UF.monoB, color: onField ? U.ink : U.ash, align: 'center', mid: true });
  }

  /** the header board above the tower: YOU WERE … in A is on the slab; here TOP OF THE LEADERBOARD and the countdown */
  private header(c: Ctx, t: number) {
    const L = this.L, b = this.b;
    const tTop = L[2]![0]!, tUntil = L[3]![0]!, tDead = this.w(3, /deadline/);
    const P: Pl = { o: [0, yHead0, 0.1], r: [1, 0, 0], u: [0, 1, 0] };
    this.rect3(c, P, -RW, 0, 2 * RW, HH, { fill: U.ink2, stroke: U.graphite, lw: 1.4 });
    this.text3(c, b.title, P, -RW + 0.5, HH - 0.5, { size: 0.36, fam: UF.monoB, color: U.ash, mid: true });
    this.text3(c, b.note, P, RW - 0.5, HH - 0.5, { size: 0.3, fam: UF.mono, color: U.graphite, align: 'right', mid: true });
    if (t >= tTop.start - 0.02 && t < tUntil.start - 0.02) {
      const ws = L[2]!;
      const iL = ws.findIndex((w) => /leaderboard/.test(w.w));
      const s1 = ws.slice(0, iL).map((w) => w.w.toUpperCase()).join(' '), s2 = ws[iL]!.w.toUpperCase();
      const z1 = this.fitSize(s1, UF.wide, 2 * RW - 1.6, 2.4), z2 = this.fitSize(s2, UF.wide, 2 * RW - 1.2, 2.4);
      this.say3(c, ws.slice(0, iL), t, P, 0, HH - 1.4 - z1 * 0.72, { size: z1, fam: UF.wide, up: '', cur: U.mag, done: U.bone, align: 'center', upper: true, slam: 0.4 });
      this.say3(c, [ws[iL]!], t, P, 0, 0.9, { size: z2, fam: UF.wide, up: '', cur: U.mag, done: U.bone, align: 'center', upper: true, slam: 0.4 });
    } else if (t >= tUntil.start - 0.02) {
      const ws = L[3]!;
      const iD = ws.indexOf(tDead);
      const s1 = ws.slice(0, iD).map((w) => w.w.toUpperCase()).join(' ');
      const z1 = this.fitSize(s1, UF.wide, 2 * RW - 6, 1.4);
      this.say3(c, ws.slice(0, iD), t, P, 0, HH - 1.3 - z1 * 0.72, { size: z1, fam: UF.wide, up: '', cur: U.mag, done: U.bone, align: 'center', upper: true, slam: 0.3 });
      if (t < tDead.start) {
        const rem = Math.max(0, tDead.start - t);
        const str = `${String(Math.floor(rem / 60)).padStart(2, '0')}:${String(Math.floor(rem % 60)).padStart(2, '0')}.${String(Math.floor((rem % 1) * 100)).padStart(2, '0')}`;
        const zs = this.fitSize('00:00.00', UF.monoB, 2 * RW - 2, 3.4);
        this.text3(c, str, P, 0, 1.0, { size: zs, fam: UF.monoB, color: U.bone, align: 'center', glow: 12, glowColor: U.ink });
      } else {
        const zd = this.fitSize('DEADLINE', UF.wide, 2 * RW - 4.5, 3.0);
        this.hero3(c, 'DEADLINE', P, 0, 1.0, t, tDead.start, this.ctx.end + 1, { size: zd, slam: 0.55, glow: 20, glowColor: U.mag });
      }
    }
  }

  /** the next one: an empty slab's outline coming down over the header after "deadline" */
  private nextShadow(c: Ctx, t: number, t0: number) {
    const k = ease.outCubic(clamp((t - t0) / 0.6));
    const y = lerp(yHead0 + HH + 14, yHead0 + HH + 1.2, k);
    this.box3(c, [-RW, y, -0.35], [RW, y + TH, 0.35], hexA(U.bone, 0.7), 1.6, { fill: hexA(U.ink, 0.5) });
    this.text3(c, '? ? ?', { o: [0, y + TH * 0.5, 0.36], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 1.6, fam: UF.wide, color: hexA(U.bone, 0.8), align: 'center', mid: true });
  }

  private crown(c: Ctx, p: V3, s: number) { this.crown3(c, [p[0], p[1] - 0.4 * s, p[2]], s * 0.9, this.tNow); }


  private beams(c: Ctx, t: number) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x0 = (i - 2.5) * 9, a = Math.sin(t * (0.5 + 0.13 * i) + i) * 0.5;
      const top: V3 = [x0, 40, -16], bot: V3 = [x0 + Math.sin(a) * 30, 0, -4 + Math.cos(a) * 10];
      this.fill3(c, [top, [bot[0] - 3.2, 0, bot[2]], [bot[0] + 3.2, 0, bot[2]]], hexA(i % 2 ? U.bone : U.mag, 0.035));
    }
    c.restore();
  }
}
