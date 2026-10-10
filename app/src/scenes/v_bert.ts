// v3 chorus3 tail, L46–L47 ("BERT, you read both ways, masked and bidirectional, / decoder-only scaled up and made you
// optional"): BOTH WAYS. Cold. A row of glass tokens, YOU WERE [MASK] OF THE ART: two beams read it from both ends at
// once and meet at the mask, which fills in — STATE. Under the row, its attention as a square of lamps, every token
// seeing every other (bidirectional). Then decoder-only: the upper triangle goes dark — each token sees only what came
// before — and the triangle scales up step by step, 117M → 1.5B → 175B parameters, filling the floor. BERT's tile shrinks
// into a checkbox: [ ] BERT — OPTIONAL.
// Style: ice — frost white and steel blue on blue-black; the decoder-only wedge in magenta.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, vlerp, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';

const BG = '#0B0A0D', ICE = '#EDEAF2', STEEL = '#9A96A3', DEEP = '#141219', MAG = '#FF2E7E', PALE = '#C9C5D1';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), COND = F.archivo(75, 900), MONO = F.mono(500), MONOB = F.mono(700);
const TOK = ['YOU', 'WERE', '[MASK]', 'OF', 'THE', 'ART'];
const TW = 3.3, TY = 3.2; // token pitch, row height
const SIZES: [string, number][] = [['117M', 6], ['1.5B', 12], ['175B', 22]]; // parameters, lamp grid side

export default class Bert extends VScene {
  private L46!: Word[]; private L47!: Word[];

  override init() {
    this.bg = BG;
    this.env = { eq: ['mlm', 'clm', 'causal', 'scaling', 'params', 'compute'], seed: 12, arcs: 8 }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L46 = ly.lines[i0]!.words; this.L47 = ly.lines[i0 + 1]!.words;
    const s = this.ctx.start, e = this.ctx.end;
    const w46 = (re: RegExp) => this.L46.find((x) => re.test(x.w))!, w47 = (re: RegExp) => this.L47.find((x) => re.test(x.w))!;
    const tRead = w46(/read/).start, tMask = w46(/masked/).start, tBi = w46(/bidirectional/).start, tDec = this.L47[0]!.start, tScale = w47(/scaled/).start, tMade = w47(/made/).start;
    this.rig = new Rig([
      { t0: s, name: 'row', key: (t) => { const k = ease.inOutQuad(clamp((t - s) / (tMask - s))); return K([lerp(-3.5, -0.5, k), lerp(5.4, 5.8, k), lerp(19, 19.5, k)], [lerp(-3.5, -0.5, k), TY + 0.8, 0], 44, 0.02); } },
      { t0: tBi - 0.05, snap: 0.5, name: 'square', key: (t) => { const k = ease.inOutQuad(clamp((t - tBi) / (tDec - tBi))); return K([lerp(2, 0, k), lerp(14, 16, k), lerp(16, 14, k)], [0, 0, lerp(5, 7, k)], 46); } },
      { t0: tScale - 0.05, snap: 0.4, name: 'scale', key: (t) => { const k = ease.inOutCubic(clamp((t - tScale) / (tMade - tScale + 0.3))); return K([0, lerp(18, 34, k), lerp(16, 26, k)], [0, 0, lerp(8, 13, k)], 46); } },
      { t0: tMade - 0.05, snap: 0.45, name: 'optional', key: (t) => { const k = ease.outCubic(clamp((t - tMade) / (e - tMade))); const b = K([lerp(-8.5, -10.5, k), lerp(6, 7, k), lerp(13, 15, k)], [-10.5, 3.4, 2], 44, -0.02); const kp = ease.inCubic(clamp((t - (e - 0.35)) / 0.35)); return kp > 0 ? { ...b, p: vlerp(b.p, [-11.2, 3.4, 1.2], kp), tg: vlerp(b.tg, [-11.2, 3.4, 0], kp) } : b; } },
    ], [{ t: s, amp: 0.3 }, { t: tDec, amp: 0.4 }, { t: tScale, amp: 0.3 }], 0.6, 131);
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L46 = this.L46, L47 = this.L47;
    const w46 = (re: RegExp) => L46.find((x) => re.test(x.w))!, w47 = (re: RegExp) => L47.find((x) => re.test(x.w))!;
    const tBert = L46[0]!, tRead = w46(/read/), tBoth = w46(/both/), tWays = w46(/ways/), tMask = w46(/masked/), tBi = w46(/bidirectional/);
    const tDec = L47[0]!, tScale = w47(/scaled/), tUp = w47(/^up$/), tMade = w47(/made/), tOpt = w47(/optional/);
    const wall = wallPl(0);
    // ------------------------------------------------ cold room: frost floor, pale haze
    pool(c, W * 0.5, H * 0.45, 1000, '#12304A', 0.5);
    this.grid3(c, floorPl(-0.02), -40, 40, -20, 40, 1.2, '#10263A', 1, { alpha: 0.8, fog: [10, 50] });
    // ------------------------------------------------ the token row
    const xs = TOK.map((_, i) => (i - (TOK.length - 1) / 2) * TW + 3.2);
    const shrink = ease.inOutCubic(clamp((t - tMade.start) / 0.6)); // BERT's tile shrinks to a checkbox
    const rowA = 1 - 0.65 * clamp((t - tDec.start) / 0.6);
    TOK.forEach((s0, i) => {
      const x = xs[i]!;
      const isMask = i === 2;
      const filled = t > tBi.start - 0.2;
      const lit = clamp((t - tRead.start) / 0.3);
      this.box3(c, [x - 1.4, TY - 0.8, -0.6], [x + 1.4, TY + 0.8, 0.6], hexA(isMask ? (filled ? MAG : PALE) : STEEL, rowA), 1.4, { fill: hexA(isMask ? '#1A0A16' : DEEP, 0.95 * rowA) });
      const s = isMask && filled ? 'STATE' : s0;
      this.text3(c, s, { o: [x, TY, 0.61], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: isMask && !filled ? 0.5 : 0.62, fam: isMask ? MONOB : COND, color: hexA(isMask && filled ? MAG : ICE, rowA * (0.4 + 0.6 * lit)), align: 'center', mid: true });
      if (isMask && !filled && t > tMask.start - 0.05) {
        // tape across the mask
        this.fill3(c, [[x - 1.5, TY - 0.15, 0.62], [x + 1.5, TY + 0.25, 0.62], [x + 1.5, TY + 0.45, 0.62], [x - 1.5, TY + 0.05, 0.62]], hexA(PALE, 0.35));
      }
    });
    // the two reading beams: from both ends toward the mask, at once
    if (t > tRead.start - 0.05 && t < tDec.start + 0.3) {
      const k = ease.inOutQuad(clamp((t - tRead.start) / (tWays.end - tRead.start)));
      const xm = xs[2]!;
      const yb = TY + 1.25;
      const left: V3 = [xs[0]! - 1.6, yb, 0], right: V3 = [xs[xs.length - 1]! + 1.6, yb, 0];
      this.glowSeg(c, left, [lerp(left[0], xm - 0.3, k), yb, 0], ICE, 2.6, 12, 1);
      this.glowSeg(c, right, [lerp(right[0], xm + 0.3, k), yb, 0], ICE, 2.6, 12, 1);
      if (k > 0.02) {
        this.text3(c, '→', { o: [lerp(left[0], xm - 0.3, k), yb + 0.1, 0], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.7, fam: HEAVY, color: ICE, align: 'right', mid: true });
        this.text3(c, '←', { o: [lerp(right[0], xm + 0.3, k), yb + 0.1, 0], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.7, fam: HEAVY, color: ICE, align: 'left', mid: true });
      }
    }
    // ------------------------------------------------ the attention square on the floor
    const sqA = clamp((t - (tBi.start - 0.3)) / 0.4);
    if (sqA > 0) this.square(c, t, sqA);
    // ------------------------------------------------ BERT's tile and the checkbox
    {
      const bx = -11.2, by = TY + 0.2;
      const k = ease.outBack(clamp((t - tBert.start) / 0.3), 1.6);
      const s = lerp(1, 0.28, shrink);
      this.box3(c, [bx - 2.6 * s, by - 1.4 * s, -0.4], [bx + 2.6 * s, by + 1.4 * s, 0.4], shrink > 0.5 ? STEEL : ICE, 1.8, { fill: DEEP });
      if (shrink < 0.4) this.text3(c, 'BERT', { o: [bx, by, 0.41], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 1.35 * k * s, fam: WIDE, color: ICE, align: 'center', mid: true, glow: 14, glowColor: PALE, alpha: 1 - clamp((shrink - 0.15) / 0.25) });
      if (shrink > 0.45) {
        const a = clamp((shrink - 0.45) / 0.25);
        this.text3(c, 'BERT', { o: [bx + 1.2, by, 0.41], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.9, fam: WIDE, color: hexA(STEEL, a), mid: true });
        if (t > tOpt.start - 0.02) {
          const ko = ease.outBack(clamp((t - tOpt.start) / 0.25), 1.6);
          this.text3(c, '(OPTIONAL)', { o: [bx + 1.2, by - 1.2, 0.41], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.75 * ko, fam: HEAVY, color: hexA(PALE, a), mid: true });
        }
      }
    }
    // ------------------------------------------------ lyric type
    const top: Pl = { o: [0, TY + 3.0, 0], r: [1, 0, 0], u: [0, 1, 0] };
    if (t < tDec.start - 0.05) {
      this.say3(c, L46.slice(1, L46.indexOf(tMask)), t, top, 0, 0, { size: 1.5, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: ICE, align: 'center', upper: true, rise: 0.3, text: (w) => w.w.replace(',', '') });
      if (t > tMask.start - 0.02) this.say3(c, [tMask, w46(/^and$/), tBi], t, { o: [0, 0.05, 10.8], r: [1, 0, 0], u: [0, 0, -1] }, 0, 0, { size: 1.2, slam: 0.35, fam: WIDE, up: '', cur: U.mag, done: ICE, align: 'center', upper: true, text: (w) => w.w.replace(',', '') });
    } else {
      const P = floorPl(0.05);
      const k = ease.outBack(clamp((t - tDec.start) / 0.25), 1.6);
      this.text3(c, 'DECODER-ONLY', { o: [0, 0.9, 1.6], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 1.4 * k, fam: WIDE, color: MAG, align: 'center', glow: 14, glowColor: MAG, alpha: 1 - clamp((t - tMade.start) / 0.3) });
      if (t > tScale.start - 0.02) {
        const i = this.sizeIdx(t);
        void i;
        this.say3(c, [tScale, tUp], t, { o: [0, 2.6, 1.6], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 1.4, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: ICE, align: 'center', upper: true, alpha: 1 - clamp((t - tMade.start) / 0.3) });
      }
      if (t > tMade.start - 0.05) this.say3(c, [w47(/^and$/), tMade, w47(/you/)], t, { o: [-11.2, TY + 2.6, 0.4], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 1.2, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: ICE, align: 'center', upper: true });
    }
    frameMarks(c, U.ash, { tl: 'BASELINE · BOTH WAYS', tr: t < tDec.start ? 'MASKED LM · BIDIRECTIONAL' : 'CAUSAL · NEXT TOKEN', bl: '2018 — 2020', br: tc(t), alpha: 0.6 });
    void tBoth; void wall;
    return { bloom: 0.75, bloomThreshold: 0.55, halation: 0.15, ca: 0.25, grain: 0.05, vignette: 0.32 };
  }

  private sizeIdx(t: number) {
    const tScale = this.L47.find((x) => /scaled/.test(x.w))!.start;
    const bs = this.B(tScale - 0.05, tScale + 3);
    let i = 0;
    for (let k = 0; k < Math.min(3, bs.length); k++) if (t >= bs[k]!) i = k;
    return i;
  }

  /** the attention square: full (bidirectional) → causal triangle → scaled up */
  private square(c: Ctx, t: number, a: number) {
    const L47 = this.L47;
    const tDec = L47[0]!.start, tScale = L47.find((x) => /scaled/.test(x.w))!.start;
    const causal = ease.inOutCubic(clamp((t - tDec) / 0.5));
    let n = TOK.length, side = 6.6, label = '6 TOKENS';
    if (t > tScale - 0.05) { const i = this.sizeIdx(t); n = SIZES[i]![1]; side = 6.6 * Math.pow(1.7, i + 1); label = SIZES[i]![0] + ' PARAMETERS'; }
    const P = floorPl(0.03);
    const x0 = -side / 2, z0 = 3.0; // the square spans z from z0 to z0 + side (toward the camera)
    const cs = side / n;
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
      const allowed = q <= r;
      const v = allowed ? 1 : 1 - causal;
      const col = allowed && causal > 0.5 ? MAG : PALE;
      const pulse = 0.6 + 0.4 * Math.sin(t * 5 + r * 0.7 + q * 0.4);
      this.rect3(c, P, x0 + q * cs + cs * 0.06, -(z0 + r * cs) - cs * 0.94, cs * 0.88, cs * 0.88, { fill: hexA(v > 0.05 ? col : '#0B1A28', a * (0.2 + 0.75 * v * pulse)) });
    }
    this.text3(c, label, P, x0, -(z0 - 0.7), { size: Math.max(0.42, side * 0.04), fam: MONOB, color: hexA(causal > 0.5 ? MAG : PALE, a) });
    // (EVERY TOKEN SEES EVERY TOKEN used to sit under MASKED AND BIDIRECTIONAL: the full grid says it already)
    if (causal >= 0.5) this.text3(c, 'EACH TOKEN SEES ONLY THE PAST', P, x0, -(z0 + side + 0.9) - side * 0.02, { size: Math.max(0.4, side * 0.035), fam: MONOB, color: hexA(MAG, a) });
  }
}
