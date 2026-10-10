// v3 intro + L00–L01 (0 → "Sigmoid"): THE LINE. A pen plotter draws the first line of the film — the baseline, y = 0,
// lettered as the pen passes — then the axes of a plane lying in the space; the four Boolean inputs drop onto it. AND and
// OR each fall to one stroke of the pen. XOR does not: the perceptron on the back wall (x₁, x₂ → w → Σ → step → ŷ) draws,
// misses, redraws, epoch after epoch: STAYED UNRESOLVED. "Stack another hidden layer": a second plane rises over the
// first, the diagram grows h₁ = OR and h₂ = NAND, every point is lifted to (h₁, h₂), and one cut on the hidden plane
// separates them — SOLVED, the XOR band shaded on the plane below.
// Style: blueprint plotter — blueprint blue, cyan construction lines, bone ink, coral for class 1, yellow flags, mint ✓.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, vlerp, vsub, vnorm, vcross, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';

const BG = '#0B0A0D', GRID = '#1A1820', GRID2 = '#26232D', CYAN = '#9A96A3', BONE = '#EDEAF2', CORAL = '#FF2E7E', YEL = '#C9C5D1', MINT = '#FF2E7E', DIM = '#5C5966', PANEL = '#141219';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), MONO = F.mono(500), MONOB = F.mono(700), ITAL = F.serif(600, true);
const S = 4; // world units per data unit
const HY = 4.4; // hidden plane height
const AX = -0.3; // axes sit at data −0.3
const ZW = -5.8; // the diagram wall
const PARK: V3 = [11, 0.45, -9.5];
const d2w = (a: number, b: number, y = 0): V3 => [(a - 0.5) * S, y, -(b - 0.5) * S];
const PTS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
const XOR = (a: number, b: number) => (a !== b ? 1 : 0);
const hid = (a: number, b: number): [number, number] => [a || b ? 1 : 0, a && b ? 0 : 1]; // (OR, NAND)
type L3 = [number, number, number];

/** endpoints of the data-space line w1 a + w2 b + c = 0 inside the box [lo, hi]² (left → right) */
function ends(w: L3, lo = -0.55, hi = 1.55): [[number, number], [number, number]] {
  const [w1, w2, c0] = w;
  const P: [number, number][] = [];
  const add = (a: number, b: number) => { if (a >= lo - 1e-6 && a <= hi + 1e-6 && b >= lo - 1e-6 && b <= hi + 1e-6) P.push([a, b]); };
  if (Math.abs(w2) > 1e-9) { add(lo, -(w1 * lo + c0) / w2); add(hi, -(w1 * hi + c0) / w2); }
  if (Math.abs(w1) > 1e-9) { add(-(w2 * lo + c0) / w1, lo); add(-(w2 * hi + c0) / w1, hi); }
  let best: [[number, number], [number, number]] = [P[0] ?? [lo, lo], P[1] ?? [hi, hi]], bd = -1;
  for (const p of P) for (const q of P) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d > bd) { bd = d; best = [p, q]; } }
  return best[0][0] <= best[1][0] ? best : [best[1], best[0]];
}
/** the perceptron's tries on XOR: every line through the square misclassifies ≥ 1 point (it can never be 0) */
const TRIES: L3[] = [
  [1, 1, -0.5], [1, -1, 0.35], [0.2, 1, -0.75], [1, 0.3, -0.62], [-1, 1, -0.4], [1, 1, -1.5], [0.8, -0.4, -0.25], [0.1, 1, -0.3], [1, 0.9, -1.1], [-0.6, 1, 0.1],
];
const side = (w: L3, a: number, b: number) => (w[0] * a + w[1] * b + w[2] > 0 ? 1 : 0);
function errs(w: L3) {
  let e1 = 0, e2 = 0;
  for (const [a, b] of PTS) { const s = side(w, a, b); if (s !== XOR(a, b)) e1++; if (1 - s !== XOR(a, b)) e2++; }
  return Math.min(e1, e2);
}
/** the points this line gets wrong (with the better of its two orientations) */
function wrongSet(w: L3) {
  let e1 = 0; for (const [a, b] of PTS) if (side(w, a, b) !== XOR(a, b)) e1++;
  const flip = e1 > 2;
  return (a: number, b: number) => ((flip ? 1 - side(w, a, b) : side(w, a, b)) !== XOR(a, b));
}

interface Stroke { t0: number; dur: number; w: L3 | null; a: V3; b: V3; until: number }

export default class Intro extends VScene {
  private L0!: Word[]; private L1!: Word[];
  private strokes: Stroke[] = [];
  private tFlip: number[] = [];
  private drops: number[] = [];

  override init() {
    this.bg = BG;
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.L0 = ly.lines[0]!.words; this.L1 = ly.lines[1]!.words;
    const bp = 60 / au.bpm;
    const w = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const tPer = this.L0[0]!.start, tDrew = w(this.L0, /drew/).start, tLineEnd = w(this.L0, /line/).end, tXor = w(this.L0, /XOR/).start, tStay = w(this.L0, /stayed/).start;
    const tStack = this.L1[0]!.start, tAnd = w(this.L1, /^and$/).start, tSolved = w(this.L1, /solved/).start;
    const end = this.ctx.end;
    const b4 = this.B(3.8, 8);
    this.drops = b4.slice(0, 4);
    const tAND = b4[4]!, tOR = b4[6]!, tXORc = b4[8]!;
    this.tFlip = this.B(tStay - 0.05, tStack).flatMap((x) => [x, x + bp / 2]).filter((x) => x > tStay - 0.06 && x < tStack - 0.1);
    const zA = -(AX - 0.5) * S, xA = (AX - 0.5) * S;
    const line = (t0: number, dur: number, wv: L3, until: number): Stroke => { const e = ends(wv); return { t0, dur, w: wv, a: d2w(...e[0]), b: d2w(...e[1]), until }; };
    this.strokes = [
      { t0: 0.18, dur: 2.42, w: null, a: [-12, 0, zA], b: [5, 0, zA], until: 99 },
      { t0: 2.95, dur: 0.92, w: null, a: [xA, 0, zA], b: [xA, 0, -(1.62 - 0.5) * S], until: 99 },
      line(tAND, 0.42, [1, 1, -1.5], tOR),
      line(tOR, 0.42, [1, 1, -0.5], tXORc),
      line(tDrew, tLineEnd - tDrew, TRIES[0]!, this.tFlip[0] ?? tStack),
      ...this.tFlip.map((tf, i) => line(tf, 0.17, TRIES[(i + 1) % TRIES.length]!, this.tFlip[i + 1] ?? tStack + 0.4)),
    ];
    const pen = (t: number) => this.penAt(t).p;
    this.rig = new Rig([
      { t0: 0, name: 'pen', key: (t) => { const p = pen(t); return K([p[0] + 1.6, 0.8, p[2] + 2.4], [p[0] - 0.4, 0.05, p[2] - 0.1], 30, -0.05); } },
      { t0: 2.02, name: 'pullback', key: (t) => {
        const k = ease.inOutCubic(clamp((t - 2.02) / 1.85));
        const p = pen(Math.min(t, 2.6));
        const a = K([p[0] + 1.6, 0.8, p[2] + 2.4], [p[0] - 0.4, 0.05, p[2] - 0.1], 30, -0.05);
        return { p: vlerp(a.p, [4.2, 7.2, 11.6], k), tg: vlerp(a.tg, [1.4, 0, 0.2], k), roll: lerp(-0.05, 0, k), fov: lerp(30, 40, k) };
      } },
      { t0: 3.87, name: 'square', key: (t) => { const k = ease.inOutQuad(clamp((t - 3.87) / 3.69)); const yaw = lerp(0.3, 0.12, k); return K([2.2 + Math.sin(yaw) * 11.5, lerp(7.2, 6.6, k), Math.cos(yaw) * 11.5 + 0.6], [2.2, 0, 0.3], 40); } },
      { t0: tXORc, snap: 0.5, name: 'diagram', key: (t) => { const k = ease.inOutCubic(clamp((t - tXORc) / (tDrew - tXORc))); return K([lerp(1.6, 0.6, k), lerp(4.6, 4.4, k), lerp(6.0, 4.6, k)], [0, lerp(4.0, 4.4, k), -5.8], 50); } },
      { t0: tDrew, snap: 0.35, name: 'drew', key: (t) => { const k = clamp((t - tDrew) / (tXor - tDrew)); return K([lerp(-6.0, -5.2, k), lerp(5.0, 4.6, k), lerp(6.2, 5.6, k)], [0.4, 0, 0.2], 44); } },
      { t0: tXor, snap: 0.3, name: 'xor', key: (t) => { const k = clamp((t - tXor) / (tStack - tXor)); return K([lerp(0.67, -0.34, k), lerp(13.0, 13.66, k), lerp(9.36, 8.91, k)], [0, 0, 0.4], 44, lerp(0.015, -0.005, k)); } },
      { t0: tStack, snap: 0.4, name: 'stack', key: (t) => { const k = ease.inOutCubic(clamp((t - tStack) / (tAnd - tStack))); return K([lerp(8.6, 7.8, k), lerp(8.6, 9.6, k), lerp(13.0, 13.8, k)], [0, lerp(3.4, 3.8, k), -2.4], 46); } },
      { t0: tAnd, snap: 0.45, name: 'solve', key: (t) => { const k = ease.inOutQuad(clamp((t - tAnd) / (end - tAnd))); return K([lerp(3.4, 4.0, k), lerp(12.6, 13.4, k), lerp(9.6, 10.6, k)], [0.3, lerp(3.4, 2.8, k), -0.6], 44); } },
    ], [
      { t: tPer, amp: 0.5 }, { t: tXor, amp: 0.9 }, { t: tStack, amp: 0.7 }, { t: tSolved, amp: 1.0 },
    ], 0.8, 11);
  }

  /** the plotter pen: tip position and whether it is down (strokes; lifted travel between them; the park when idle) */
  penAt(t: number): { p: V3; down: boolean } {
    const S0 = this.strokes;
    for (const s of S0) if (t >= s.t0 && t <= s.t0 + s.dur) return { p: vlerp(s.a, s.b, ease.inOutQuad(clamp((t - s.t0) / s.dur))), down: true };
    let prev: Stroke | null = null, next: Stroke | null = null;
    for (const s of S0) { if (s.t0 + s.dur < t) prev = s; else if (s.t0 > t && !next) next = s; }
    const from: V3 = prev ? prev.b : PARK;
    const fromT = prev ? prev.t0 + prev.dur : 0;
    if (!next) return { p: this.hop(from, PARK, ease.inOutCubic(clamp((t - fromT) / 0.6))), down: false };
    const gap = next.t0 - fromT;
    if (gap > 1.4) {
      if (t < fromT + 0.5) return { p: this.hop(from, PARK, ease.inOutCubic(clamp((t - fromT) / 0.5))), down: false };
      if (t > next.t0 - 0.5) return { p: this.hop(PARK, next.a, ease.inOutCubic(clamp((t - (next.t0 - 0.5)) / 0.5))), down: false };
      return { p: PARK, down: false };
    }
    return { p: this.hop(from, next.a, ease.inOutCubic(clamp((t - fromT) / gap))), down: false };
  }
  private hop(a: V3, b: V3, k: number): V3 { const p = vlerp(a, b, k); return [p[0], p[1] + 0.4 * Math.sin(Math.PI * k), p[2]]; }
  /** the decision line standing on the input plane at t */
  standing(t: number): (Stroke & { k: number }) | null {
    for (const s of this.strokes) if (s.w && t >= s.t0 && t < s.until) return { ...s, k: ease.inOutQuad(clamp((t - s.t0) / s.dur)) };
    return null;
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L0 = this.L0, L1 = this.L1;
    const word = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const tPer = L0[0]!.start, tDrew = word(L0, /drew/).start, tXor = word(L0, /XOR/).start;
    const tStack = L1[0]!.start, tHid = word(L1, /hidden/).start, tSolved = word(L1, /solved/).start;
    const tAND = this.strokes[2]!.t0, tOR = this.strokes[3]!.t0, tXORc = this.strokes[3]!.until;
    const P0 = floorPl(0);
    const hidUp = ease.outBack(clamp((t - tStack) / 0.55), 1.1);
    const kick = this.beatPulse(t, 0.08);
    const mode = t < tAND ? 'none' : t < tOR ? 'AND' : t < tXORc ? 'OR' : 'XOR';
    const cls = (a: number, b: number) => (mode === 'AND' ? (a && b ? 1 : 0) : mode === 'OR' ? (a || b ? 1 : 0) : mode === 'XOR' ? XOR(a, b) : -1);

    // ------------------------------------------------ the blueprint
    pool(c, W * 0.5, H * 0.58, 1100, '#1B4E8A', 0.45);
    this.grid3(c, P0, -16, 16, -12, 16, 0.5, GRID, 1, { alpha: 0.6, fog: [9, 32] });
    this.grid3(c, P0, -16, 16, -12, 16, 2, GRID2, 1.3, { alpha: 0.9, fog: [11, 36] });
    this.titleBlock(c, t);
    const pen = this.penAt(t);
    for (const x of [-15, 15]) this.box3(c, [x - 0.2, 0, -12], [x + 0.2, 0.5, 14], DIM, 1.2, { fill: '#0B2140' });
    this.box3(c, [-15, 1.55, pen.p[2] - 0.18], [15, 1.85, pen.p[2] + 0.18], '#5C8CC4', 1.3, { fill: '#0E2A4E' });
    // ------------------------------------------------ axes, rulers, the lettered baseline
    this.axes(c, t, P0);
    // ------------------------------------------------ truth table, printed flat on the sheet
    const showTT = clamp((t - 4.0) / 0.5) * (1 - clamp((t - (tDrew - 0.1)) / 0.4));
    if (showTT > 0) this.truth(c, showTT, mode);
    // ------------------------------------------------ decision lines
    const st = this.standing(t);
    if (st && t < tStack + 0.6) {
      const fade = t > tStack ? 1 - clamp((t - tStack) / 0.6) : 1;
      const isXor = mode === 'XOR';
      const col = isXor ? YEL : CYAN;
      const a = [st.a[0], 0.006, st.a[2]] as V3, b = [st.b[0], 0.006, st.b[2]] as V3;
      this.glowSeg(c, a, vlerp(a, b, st.k), col, 2.6, 12, fade * (isXor ? 1 : 0.9));
      if (st.k >= 1 && !isXor) this.text3(c, `${mode}  ✓`, P0, st.b[0] + 0.3, -st.b[2] + 0.1, { size: 0.75, fam: MONOB, color: MINT, alpha: fade });
      if (isXor) for (const s of this.strokes) if (s.w && s.t0 >= tDrew && s.until <= t) this.seg(c, [s.a[0], 0.004, s.a[2]], [s.b[0], 0.004, s.b[2]], YEL, 1.1, { alpha: 0.22 * fade, dash: [6, 8] });
      // "drew a line," written beside the first try, off the pen's path
      if (isXor && t > tDrew - 0.1 && t < tXor + 0.6) {
        const dir = vnorm(vsub(b, a));
        const nrm = vcross([0, 1, 0], dir);
        const mid = vlerp(a, b, 0.5);
        const P: Pl = this.readable({ o: [mid[0] - nrm[0] * 0.75, 0.01, mid[2] - nrm[2] * 0.75], r: dir, u: nrm });
        this.say3(c, L0.slice(1, 4), t, P, 0, 0, { size: 1.05, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, alpha: 1 - clamp((t - tXor - 0.3) / 0.3), rise: 0.4 });
      }
    }
    // the XOR band once solved: a + b between 0.5 and 1.5, shaded on the input plane
    const solvedK = clamp((t - tSolved) / 0.35);
    if (solvedK > 0) {
      const band: V3[] = [];
      for (const [a, b] of [[-0.55, 1.05], [1.05, -0.55], [1.55, -0.55], [1.55, -0.05], [-0.05, 1.55], [-0.55, 1.55]] as [number, number][]) band.push(d2w(a, b, 0.003));
      this.fill3(c, band, hexA(CORAL, 0.2 * solvedK));
      for (const cc of [-0.5, -1.5]) { const e = ends([1, 1, cc]); this.glowSeg(c, d2w(...e[0], 0.005), d2w(...e[1], 0.005), MINT, 2.2, 9, solvedK); }
    }
    // ------------------------------------------------ the points (and their lift to the hidden plane)
    const wrong = st && mode === 'XOR' && t >= tDrew && t < tStack ? wrongSet(st.w!) : null;
    PTS.forEach(([a, b], i) => {
      const tDrop = this.drops[i]!;
      if (t < tDrop - 0.35) return;
      const fall = clamp((t - (tDrop - 0.35)) / 0.35);
      const y = t < tDrop ? lerp(3.4, 0, ease.inQuad(fall)) : 0.3 * Math.abs(Math.sin((t - tDrop) * 14)) * Math.exp(-(t - tDrop) * 9);
      const k = cls(a, b);
      const lift = ease.inOutCubic(clamp((t - (tHid + 0.1 * i)) / 0.8));
      const [h1, h2] = hid(a, b);
      const pIn = d2w(a, b, y + 0.02), pHi = d2w(h1, h2, HY * hidUp + 0.02);
      const arcAt = (u: number): V3 => [lerp(pIn[0], pHi[0], u), lerp(pIn[1], pHi[1], u) + Math.sin(Math.PI * u) * 1.8, lerp(pIn[2], pHi[2], u)];
      const pos = lift > 0 ? arcAt(lift) : pIn;
      if (lift > 0) {
        const arc: V3[] = [];
        for (let j = 0; j <= 28 * lift; j++) arc.push(arcAt(j / 28));
        this.pl3(c, arc, k === 1 ? CORAL : CYAN, 1.6, { alpha: 0.85, dash: [6, 6] });
        this.ring3(c, P0, (a - 0.5) * S, (b - 0.5) * S, 0.26, DIM, 1.3);
      }
      const Ppt: Pl = floorPl(pos[1], [0, pos[1], 0]);
      const px = lift > 0 ? lerp(a, h1, lift) : a, py = lift > 0 ? lerp(b, h2, lift) : b;
      const wr = wrong ? wrong(a, b) : false;
      const flash = wr ? 0.5 + 0.5 * Math.sin(t * 38) : 0;
      const R0 = 0.27 + 0.1 * lift;
      if (wr) this.ring3(c, Ppt, (px - 0.5) * S, (py - 0.5) * S, 0.48 + 0.08 * Math.sin(t * 20), YEL, 2, { alpha: 0.9 });
      if (k === 1) this.ring3(c, Ppt, (px - 0.5) * S, (py - 0.5) * S, R0, mixHex(CORAL, '#FFFFFF', flash * 0.5), 2.2, { fill: CORAL });
      else this.ring3(c, Ppt, (px - 0.5) * S, (py - 0.5) * S, R0, mixHex(BONE, YEL, flash), 2.8, { fill: lift > 0 ? '#0F3466' : BG });
      if (t > tDrop && t < tDrop + 0.7) { const r = 0.3 + (t - tDrop) * 2.4; this.ring3(c, P0, (a - 0.5) * S, (b - 0.5) * S, r, CYAN, 1.3, { alpha: 1 - (t - tDrop) / 0.7 }); }
      if (t > tDrop && t < tPer && lift === 0) this.text3(c, `(${a}, ${b})`, P0, (a - 0.5) * S + 0.42, (b - 0.5) * S - 0.14, { size: 0.38, fam: MONO, color: BONE, alpha: 0.8 * clamp((t - tDrop) / 0.3) });
    });
    // ------------------------------------------------ the pen, the diagram, the hidden plane, the type
    this.drawPen(c, pen.p, pen.down);
    this.diagram(c, t);
    if (t > tStack - 0.05) this.hiddenPlane(c, t, hidUp);
    this.lyricType(c, t, P0);
    frameMarks(c, U.ash, { tl: 'BASELINE · DWG 00 · THE LINE', tr: t < tPer ? 'PLOTTER READY' : t < tStack ? 'LAYERS: 1' : 'LAYERS: 2', bl: '1958 — 1986', br: tc(t), alpha: 0.6 });
    return { bloom: 0.6, bloomThreshold: 0.6, halation: 0.15, ca: 0.3 + 0.9 * hot(t, tXor, 0.1), grain: 0.05, vignette: 0.3, flash: 0.02 * hot(t, tSolved, 0.08), zoom: 1 + 0.01 * kick * (t > tPer ? 1 : 0) };
  }

  // ------------------------------------------------------------------ pieces
  private axes(c: Ctx, t: number, P0: Pl) {
    const zA = -(AX - 0.5) * S, xA = (AX - 0.5) * S;
    const x1s = this.strokes[0]!, x2s = this.strokes[1]!;
    if (t > x1s.t0) {
      const e = t < x1s.t0 + x1s.dur ? this.penAt(t).p[0] : x1s.b[0];
      this.glowSeg(c, [-12, 0.003, zA], [e, 0.003, zA], BONE, 2.4, 9, 1);
      // the baseline lettered as the pen passes: BASELINE stamped in front of the line (ending short of the x₂ axis:
      // larger, its last letters ran over the origin, its point and the axis)
      const lx0 = -11.6, lstep = 0.92;
      this.text3(c, 'BASELINE', P0, lx0, -(zA - 0.55), {
        size: 0.95, fam: WIDE, alpha: 1 - clamp((t - 7.2) / 0.8), track: 0.06,
        each: (i) => { const xi = lx0 + i * lstep; if (e < xi + 0.6) return null; const k = clamp((e - (xi + 0.6)) / 0.8); return { color: mixHex(CYAN, BONE, k), a: k }; },
      });
      if (e > -1.2) this.text3(c, 'y = 0', P0, -1.0, -(zA - 0.55), { size: 0.55, fam: MONOB, color: CYAN, alpha: clamp((e + 1.2) / 1) * (1 - clamp((t - 7.2) / 0.8)) });
    }
    if (t > x2s.t0) {
      const e = t < x2s.t0 + x2s.dur ? this.penAt(t).p[2] : x2s.b[2];
      this.glowSeg(c, [xA, 0.003, zA], [xA, 0.003, e], BONE, 2.4, 9, 1);
    }
    // ruler ticks along both axes, every 0.1, labelled at 0 and 1
    const kx = clamp((t - 1.3) / 1.3), ky = clamp((t - 3.3) / 0.6);
    const tk: [V3, V3][] = [], tk2: [V3, V3][] = [];
    for (let i = -3; i <= 15; i++) {
      const v = i / 10, big = i % 5 === 0;
      if ((i + 3) / 18 < kx) tk.push([d2w(v, AX - (big ? 0.06 : 0.03), 0.003), d2w(v, AX + (big ? 0.06 : 0.03), 0.003)]);
      if ((i + 3) / 18 < ky) tk2.push([d2w(AX - (big ? 0.06 : 0.03), v, 0.003), d2w(AX + (big ? 0.06 : 0.03), v, 0.003)]);
    }
    this.segs(c, tk, BONE, 1.3, 0.85); this.segs(c, tk2, BONE, 1.3, 0.85);
    // (the 0 / 1 marks go once the hidden layer rises: STACK ANOTHER / HIDDEN LAYER is set over them)
    // (and the two 1s step aside while DREW A LINE, — set along the first try, across the plot — is up)
    const ra = 0.85 * (1 - clamp((t - this.L1[0]!.start) / 0.4));
    const tDw = this.L0.find((w) => /drew/.test(w.w))!.start, tXr = this.L0.find((w) => /XOR/.test(w.w))!.start;
    const dip = clamp((t - (tDw - 0.2)) / 0.2) * (1 - clamp((t - (tXr + 0.35)) / 0.3));
    for (const v of [0, 1]) {
      const av = ra * (v === 1 ? 1 - dip : 1);
      if (av <= 0) continue;
      if (kx > 0.4) this.text3(c, String(v), P0, (v - 0.5) * S, (AX - 0.2 - 0.5) * S, { size: 0.46, fam: MONO, color: BONE, align: 'center', alpha: av });
      if (ky > 0.4) this.text3(c, String(v), P0, (AX - 0.13 - 0.5) * S, (v - 0.5) * S - 0.16, { size: 0.46, fam: MONO, color: BONE, align: 'right', alpha: av });
    }
    if (t > 2.2) this.text3(c, 'x₁', P0, 5.3, (AX - 0.5) * S - 0.25, { size: 0.7, fam: ITAL, color: BONE, alpha: clamp((t - 2.2) / 0.4) });
    if (t > 3.6) this.text3(c, 'x₂', P0, (AX - 0.5) * S - 0.1, (1.62 - 0.5) * S + 0.3, { size: 0.7, fam: ITAL, color: BONE, align: 'center', alpha: clamp((t - 3.6) / 0.3) });
  }

  private titleBlock(c: Ctx, t: number) {
    const P = floorPl(0);
    const x = -14.5, y = 6.5, w = 7.2, h = 3.0;
    const a = clamp((t - 2.6) / 1.0) * 0.85;
    if (a <= 0) return;
    this.rect3(c, P, x, y, w, h, { stroke: hexA(CYAN, a), lw: 1.3 });
    this.seg(c, at(P, x, y + 1.0), at(P, x + w, y + 1.0), hexA(CYAN, a), 1);
    this.seg(c, at(P, x + 4.2, y), at(P, x + 4.2, y + 1.0), hexA(CYAN, a), 1);
    this.text3(c, 'THE LINE', P, x + 0.3, y + 1.6, { size: 0.95, fam: WIDE, color: hexA(BONE, a) });
    this.text3(c, 'DWG 00 · SHEET 1 OF 1', P, x + 0.3, y + 0.4, { size: 0.34, fam: MONO, color: hexA(CYAN, a) });
    this.text3(c, 'SCALE 1 : 1', P, x + 4.4, y + 0.4, { size: 0.34, fam: MONO, color: hexA(CYAN, a) });
    this.text3(c, '1958', P, 9.5, 9.0, { size: 4.2, fam: WIDE, color: hexA('#2C5C98', clamp((t - 3.5) / 1.5) * 0.6), align: 'center' });
  }

  private drawPen(c: Ctx, tip: V3, down: boolean) {
    const x = tip[0], z = tip[2], y0 = tip[1] + (down ? 0 : 0.3);
    this.box3(c, [x - 0.45, 1.3, z - 0.32], [x + 0.45, 2.05, z + 0.32], '#8CC0F0', 1.4, { fill: '#123058' });
    const N = 6, r = 0.13, top = 1.3, cone = 0.32;
    const ring = (yy: number): V3[] => Array.from({ length: N + 1 }, (_, i) => [x + Math.cos((i / N) * Math.PI * 2) * r, yy, z + Math.sin((i / N) * Math.PI * 2) * r] as V3);
    const lo = ring(y0 + cone), hi = ring(top);
    const faces = Array.from({ length: N }, (_, i) => ({ i, z: this.cs(lo[i]!)[2] + this.cs(hi[i + 1]!)[2] }));
    faces.sort((p, q) => q.z - p.z).forEach(({ i }) => this.fill3(c, [lo[i]!, lo[i + 1]!, hi[i + 1]!, hi[i]!], i % 2 ? '#1C4370' : '#285488'));
    this.pl3(c, lo, BONE, 1.2); this.pl3(c, hi, BONE, 1.2);
    for (let i = 0; i < N; i++) this.seg(c, lo[i]!, [x, y0, z], BONE, 1.1);
    const g = this.dot3(c, [x, y0, z], 0.05, down ? '#FFFFFF' : BONE);
    if (g && down) { c.save(); c.globalCompositeOperation = 'lighter'; const R = Math.min(30, 4 + 6 * this.pr([x, y0, z]).k * 0.05); const gr = c.createRadialGradient(g.x, g.y, 0, g.x, g.y, R); gr.addColorStop(0, 'rgba(150,225,255,0.5)'); gr.addColorStop(1, 'rgba(150,225,255,0)'); c.fillStyle = gr; c.fillRect(g.x - R, g.y - R, 2 * R, 2 * R); c.restore(); }
  }

  private truth(c: Ctx, a: number, mode: string) {
    const P = floorPl(0);
    const m = mode === 'AND' ? 0 : mode === 'OR' ? 1 : mode === 'XOR' ? 2 : -1;
    const x0 = 3.6, top = 2.2, rh = 0.78;
    const xs = [0.3, 1.2, 2.5, 3.8, 5.1];
    this.rect3(c, P, x0 - 0.2, top - 4 * rh - 0.9, 6.0, 4 * rh + 1.75, { fill: hexA(PANEL, 0.9 * a), stroke: hexA(CYAN, 0.8 * a), lw: 1.3 });
    ['x₁', 'x₂', 'AND', 'OR', 'XOR'].forEach((h, i) => this.text3(c, h, P, x0 + xs[i]!, top, { size: 0.5, fam: i > 1 ? MONOB : ITAL, color: i - 2 === m ? YEL : BONE, alpha: a, align: 'center' }));
    this.seg(c, at(P, x0, top - 0.3), at(P, x0 + 5.6, top - 0.3), hexA(BONE, 0.6 * a), 1);
    this.seg(c, at(P, x0 + 1.85, top + 0.5), at(P, x0 + 1.85, top - 4 * rh - 0.1), hexA(BONE, 0.6 * a), 1);
    PTS.forEach(([x1, x2], r) => {
      const y = top - (r + 1) * rh - 0.05;
      [x1, x2, x1 & x2, x1 | x2, x1 ^ x2].forEach((v, i) => this.text3(c, String(v), P, x0 + xs[i]!, y, { size: 0.5, fam: MONO, color: i - 2 === m ? (v ? CORAL : BONE) : hexA(BONE, 0.55), alpha: a, align: 'center' }));
    });
    if (m >= 0) this.text3(c, m < 2 ? 'ONE LINE ✓' : 'ONE LINE ?', P, x0 + xs[m + 2]!, top - 4 * rh - 0.62, { size: 0.36, fam: MONOB, color: m < 2 ? MINT : YEL, alpha: a, align: 'center' });
  }

  private diagram(c: Ctx, t: number) {
    const L0 = this.L0, L1 = this.L1;
    const tPer = L0[0]!.start, tStack = L1[0]!.start, tHid = L1.find((w) => /hidden/.test(w.w))!.start;
    const t0 = this.strokes[3]!.until - 0.35;
    const show = clamp((t - t0) / 0.5);
    if (show <= 0) return;
    const P = wallPl(ZW);
    const hk = ease.inOutCubic(clamp((t - tStack) / 0.9));
    const X1: [number, number] = [lerp(-5.4, -7.6, hk), 4.9], X2: [number, number] = [lerp(-5.4, -7.6, hk), 2.5];
    const SG: [number, number] = [lerp(-1.2, 0.4, hk), 3.7], ST: [number, number] = [lerp(2.0, 3.4, hk), 3.7], YY: [number, number] = [lerp(4.8, 6.2, hk), 3.7];
    const H1: [number, number] = [-3.6, 4.9], H2: [number, number] = [-3.6, 2.5];
    const k1 = clamp((t - t0) / 0.4), k2 = clamp((t - t0 - 0.3) / 0.4), k3 = clamp((t - t0 - 0.6) / 0.4);
    const col = mixHex(CYAN, BONE, hot(t, tPer, 0.35));
    this.rect3(c, P, -9.6, 0.6, 19.2, 8.6, { fill: hexA('#0A2142', 0.75 * show), stroke: hexA(DIM, show), lw: 1.2 });
    this.grid3(c, P, -9.6, 9.6, 0.6, 9.2, 0.6, '#16375F', 1, { alpha: 0.7 * show });
    const node = (p: [number, number], r: number, lab: string, k: number, fill = PANEL) => {
      if (k <= 0) return;
      this.ring3(c, P, p[0], p[1], r, col, 2, { fill: hexA(fill, 0.97), a1: Math.PI * 2 * k, n: 40 });
      this.text3(c, lab, P, p[0], p[1], { size: r * 1.05, fam: ITAL, color: BONE, align: 'center', mid: true, alpha: k });
    };
    const wire = (a: [number, number], b: [number, number], k: number, lab?: string, ra = 0.6, rb = 0.85) => {
      if (k <= 0) return;
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
      const A: [number, number] = [a[0] + ux * ra, a[1] + uy * ra], Bp: [number, number] = [b[0] - ux * rb, b[1] - uy * rb];
      this.seg(c, at(P, A[0], A[1]), at(P, lerp(A[0], Bp[0], k), lerp(A[1], Bp[1], k)), col, 1.8);
      if (k >= 1) {
        this.pl3(c, [at(P, Bp[0] - ux * 0.32 - uy * 0.15, Bp[1] - uy * 0.32 + ux * 0.15), at(P, Bp[0], Bp[1]), at(P, Bp[0] - ux * 0.32 + uy * 0.15, Bp[1] - uy * 0.32 - ux * 0.15)], col, 1.8);
        if (lab) this.text3(c, lab, P, lerp(A[0], Bp[0], 0.45), lerp(A[1], Bp[1], 0.45) + 0.28, { size: 0.5, fam: ITAL, color: CYAN, align: 'center' });
      }
    };
    c.save(); c.globalAlpha *= show;
    node(X1, 0.6, 'x₁', k1); node(X2, 0.6, 'x₂', k1);
    if (hk > 0) {
      const hkk = clamp((t - tHid) / 0.45);
      node(H1, 0.65, 'h₁', hkk, '#14365F'); node(H2, 0.65, 'h₂', hkk, '#14365F');
      wire(X1, H1, hkk, undefined, 0.6, 0.7); wire(X2, H1, hkk, undefined, 0.6, 0.7); wire(X1, H2, hkk, undefined, 0.6, 0.7); wire(X2, H2, hkk, undefined, 0.6, 0.7);
      wire(H1, SG, hkk, undefined, 0.65, 0.85); wire(H2, SG, hkk, undefined, 0.65, 0.85);
      if (hkk > 0.4) {
        this.text3(c, 'OR', P, H1[0], H1[1] + 0.95, { size: 0.42, fam: MONOB, color: CYAN, align: 'center', alpha: hkk });
        this.text3(c, 'NAND', P, H2[0], H2[1] - 1.3, { size: 0.42, fam: MONOB, color: CYAN, align: 'center', alpha: hkk });
      }
    } else { wire(X1, SG, k2, 'w₁'); wire(X2, SG, k2, 'w₂'); }
    node(SG, 0.85, 'Σ', k2);
    if (k3 > 0) {
      this.rect3(c, P, ST[0] - 0.85, ST[1] - 0.7, 1.7, 1.4, { fill: hexA(PANEL, 0.97), stroke: col, lw: 2 });
      this.pl3(c, [at(P, ST[0] - 0.62, ST[1] - 0.42), at(P, ST[0], ST[1] - 0.42), at(P, ST[0], ST[1] + 0.42), at(P, ST[0] + 0.62, ST[1] + 0.42)], CORAL, 2.6);
      wire(SG, ST, k3, undefined, 0.85, 0.85); wire(ST, YY, k3, undefined, 0.85, 0.5);
      node(YY, 0.5, 'ŷ', k3);
      this.text3(c, 'STEP', P, ST[0], ST[1] - 1.15, { size: 0.36, fam: MONOB, color: hexA(BONE, 0.75), align: 'center' });
    }
    // (the rule goes as XOR lands in front of it: its ends stuck out round the big word)
    const tX = L0.find((w) => /XOR/.test(w.w))!.start;
    if (t > tPer && t < tX + 0.2) this.text3(c, 'w ← w + η (y − ŷ) x', P, 0, 1.3, { size: 0.55, fam: MONO, color: hexA(BONE, 0.9), align: 'center', alpha: clamp((t - tPer - 0.3) / 0.4) * (1 - clamp((t - (tX - 0.1)) / 0.25)) });
    // (to the right, past the hidden plane — seen through the plane it read in pieces — and gone as SOLVED ✓ is stamped
    // across it)
    const tSv = L1.find((w) => /solved/.test(w.w))!.start;
    if (t > tStack + 0.6 && t < tSv + 0.2) this.text3(c, 'XOR = AND(OR, NAND)', P, 6.0, 1.3, { size: 0.55, fam: MONO, color: hexA(MINT, 0.9), align: 'center', alpha: clamp((t - tStack - 0.6) / 0.4) * (1 - clamp((t - (tSv - 0.08)) / 0.15)) });
    c.restore();
  }

  private hiddenPlane(c: Ctx, t: number, up: number) {
    const L1 = this.L1;
    const tAnd = L1.find((w) => /^and$/.test(w.w))!.start, tSolved = L1.find((w) => /solved/.test(w.w))!.start;
    const a = clamp(up);
    const y = HY * up;
    const HP = floorPl(y, [0, y, 0]);
    this.rect3(c, HP, -3.6, -3.6, 7.2, 7.2, { fill: hexA('#0F3466', 0.6 * a), stroke: hexA(CYAN, 0.95 * a), lw: 1.8 });
    this.grid3(c, HP, -3.6, 3.6, -3.6, 3.6, 0.6, '#3A78C0', 1, { alpha: 0.65 * a });
    for (const [x, z] of [[-3.6, -3.6], [3.6, -3.6], [3.6, 3.6], [-3.6, 3.6]] as [number, number][]) this.seg(c, [x, 0, z], [x, y, z], CYAN, 1.2, { alpha: 0.4 * a, dash: [4, 6] });
    // (no h₁ = OR / h₂ = NAND labels on the plane: the units on the wall carry OR and NAND, and seen past the wall the
    // plane's labels ran through its units and between the lyric's lines)
    const k = ease.inOutQuad(clamp((t - tAnd) / (tSolved - tAnd)));
    if (k > 0) {
      const e = ends([1, 1, -1.5]);
      const A = d2w(...e[0], y + 0.01), B = d2w(...e[1], y + 0.01);
      this.glowSeg(c, A, vlerp(A, B, k), MINT, 2.8, 13, 1);
    }
  }

  private lyricType(c: Ctx, t: number, P0: Pl) {
    const L0 = this.L0, L1 = this.L1;
    const tPer = L0[0]!.start, xorW = L0.find((w) => /XOR/.test(w.w))!, stayW = L0.find((w) => /stayed/.test(w.w))!, unresW = L0.find((w) => /unresolved/.test(w.w))!;
    const tStack = L1[0]!.start, solvedW = L1.find((w) => /solved/.test(w.w))!;
    const wallP = wallPl(ZW + 0.02);
    // PERCEPTRON across the top of the wall: outline first, then filled; MULTI-LAYER stamped over it at "stack"
    if (t > tPer - 0.05) {
      const k = clamp((t - tPer) / 0.55);
      const tAndW = L1.find((w) => /^and$/.test(w.w))!.start;
      const outT = 1 - clamp((t - tAndW) / 0.3);
      this.text3(c, 'PERCEPTRON', wallP, 0, 7.25, {
        size: 1.85, fam: WIDE, align: 'center', stroke: t < L0[0]!.end ? U.mag : CYAN, strokeW: 1.8, alpha: outT,
        each: (i) => { const ki = clamp(k * 8 - i * 0.7); if (ki <= 0) return null; return { color: ki >= 1 ? (t < L0[0]!.end + 0.1 ? U.mag : BONE) : undefined, dy: -0.2 * (1 - ki) }; },
      });
      if (t > tStack) {
        const s = ease.outBack(clamp((t - tStack) / 0.25), 2.2);
        this.text3(c, 'MULTI-LAYER', wallP, 0, 9.0, { size: 1.3 * s, fam: WIDE, color: U.mag, align: 'center', glow: 14, glowColor: U.ink, alpha: outT });
      }
    }
    // XOR, huge, lying on the sheet behind the square; it shivers once unresolved
    if (t > xorW.start - 0.03 && t < tStack + 0.5) {
      const k = ease.outBack(clamp((t - xorW.start) / 0.22), 2);
      const jit = t > stayW.start ? 0.03 * Math.sin(t * 47) : 0;
      // (well past the x₂ axis' end: closer, its X sat on the axis label)
      this.text3(c, 'XOR', P0, jit, (1.62 - 0.5) * S + 1.15, { size: 4.2 * k, fam: WIDE, color: t < xorW.end + 0.05 ? U.mag : BONE, align: 'center', alpha: 1 - clamp((t - tStack) / 0.5) });
    }
    // STAYED UNRESOLVED printed in front of the square, the epoch counter under it
    if (t > stayW.start && t < tStack + 0.4) {
      const fade = clamp((t - stayW.start) / 0.12) * (1 - clamp((t - tStack) / 0.4));
      const p = clamp((t - unresW.start) / (unresW.end - unresW.start));
      const nlit = t < unresW.start ? Math.ceil(6 * clamp((t - stayW.start) / (unresW.start - stayW.start))) : 7 + Math.ceil(p * 10);
      // (smaller and nearer the square: at 1.45 it ran off both sides and the bottom of the frame)
      const zy = (AX - 0.5) * S - 1.75;
      this.text3(c, 'STAYED UNRESOLVED', P0, 0.2, zy, { size: 1.05, fam: HEAVY, align: 'center', alpha: fade, each: (i) => (i < nlit ? { color: i >= 7 && t < unresW.end ? U.mag : BONE, dx: i >= 7 ? 0.015 * Math.sin(t * 60 + i) : 0 } : null) });
      const n = this.strokes.filter((s) => s.w && s.t0 <= t && s.t0 >= L0[1]!.start).length;
      const st = this.standing(t);
      this.text3(c, `EPOCH ${String(n * 37).padStart(4, '0')}    ERRORS ${st?.w ? errs(st.w) : 1} / 4`, P0, 0.5, zy - 0.95, { size: 0.46, fam: MONOB, color: YEL, align: 'center', alpha: fade });
    }
    // L1: STACK ANOTHER / HIDDEN LAYER on the hidden plane's front edge, AND THE PROBLEM'S on its top, SOLVED ✓ stamped
    if (t > tStack - 0.05) {
      const up = ease.outBack(clamp((t - tStack) / 0.55), 1.1);
      const y = HY * up;
      const front: Pl = { o: [0, y, 3.62], r: [1, 0, 0], u: [0, 1, 0] };
      this.say3(c, L1.slice(0, 2), t, front, 0, -1.25, { size: 1.2, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, rise: 0.4 });
      this.say3(c, L1.slice(2, 4), t, front, 0, -2.6, { size: 1.2, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, rise: 0.4 });
      const HP = floorPl(y + 0.01, [0, y + 0.01, 0]);
      this.say3(c, L1.slice(4, 7), t, HP, 0.9, -1.75, { size: 0.9, slam: 0.3, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true });
      if (t > solvedW.start) {
        const s = ease.outBack(clamp((t - solvedW.start) / 0.2), 2.5);
        this.text3(c, 'SOLVED ✓', HP, 1.0, 1.0, { size: 1.9 * s, fam: WIDE, color: MINT, align: 'center', glow: 20, glowColor: U.ink, each: () => ({ rot: -0.1 }) });
      }
    }
  }
}
