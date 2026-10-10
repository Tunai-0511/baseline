// v3 L02–L03 ("Sigmoid squashed the signal, gradients fading down to zero, / ReLU clipped the negatives and came in as
// the hero"): SQUASH. An oscilloscope bench standing in the dark: CH1 a big ±5 V wave, the transfer screen σ(x), CH2 the
// output on CH1's own scale — the wave comes out squashed into the thin (0, 1) band. Below, the six-layer chain the
// gradient has to cross backwards: every sigmoid multiplies it by σ′ ≤ ¼ (1 → 0.25 → 0.063 → … → 0.00098 ≈ 0). Then
// the transfer curve becomes max(0, x): a blade at 0 V cuts the negative lobes off (they fall away), the positive half
// passes whole, and the gradient crosses the same chain at ×1 per layer and arrives at full strength: HERO.
// Style: phosphor-green scope lab, amber gradient, red for zero.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, wallPl, floorPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BG = '#0B0A0D', GLASS = '#141219', BEZEL = '#1E1C24', GRID = '#2A2731', PH = '#EDEAF2', AMB = '#FF2E7E', BONE = '#EDEAF2', RED = '#FF2E7E', DIM = '#5C5966';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), COND = F.archivo(75, 900), MONO = F.mono(500), MONOB = F.mono(700);
const sig = (x: number) => 1 / (1 + Math.exp(-x));
const relu = (x: number) => Math.max(0, x);
// scope geometry: three screens on the wall z = 0; one volt = VS world units on CH1/CH2
const VS = 0.62, AMP = 5;
const SCR = { A: [-13.4, -4.6], B: [-4, 4], C: [4.6, 13.4] } as const;
const CY = -8.6; // the chain's height
const UX = (i: number) => -12 + i * 4.4; // unit centres (0 = input side)
const LOSSX = 15.2;

export default class Sig extends VScene {
  private L2!: Word[]; private L3!: Word[];
  private tRelu = 0;

  override init() {
    this.bg = BG;
    const ly = this.ctx.lyrics;
    this.L2 = ly.lines[2]!.words; this.L3 = ly.lines[3]!.words;
    const w = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const t0 = this.ctx.start, tSq = w(this.L2, /squashed/).start, tGrad = w(this.L2, /gradients/).start, tZero = w(this.L2, /zero/).start;
    this.tRelu = this.L3[0]!.start;
    const tClip = w(this.L3, /clipped/).start, tAnd = w(this.L3, /^and$/).start, tHero = w(this.L3, /hero/).start, end = this.ctx.end;
    const gx = (t: number) => this.pulseX(t);
    this.rig = new Rig([
      { t0, name: 'curve', key: (t) => { const k = ease.inOutCubic(clamp((t - t0) / (tSq - t0))); return K([0, lerp(0.3, 0.8, k), lerp(12.5, 13.5, k)], [0, 0.4, 0], 40); } },
      { t0: tSq, snap: 0.35, name: 'bench', key: (t) => { const k = ease.outCubic(clamp((t - tSq) / (tGrad - tSq))); return K([lerp(-1, 0, k), lerp(2.2, 1.8, k), lerp(19, 24, k)], [0, 0.9, 0], 40); } },
      { t0: tGrad - 0.12, snap: 0.45, name: 'chain', key: (t) => { const x = gx(t); return K([x + 5.2, CY + 3.6, 11.0], [x - 1.0, CY + 0.5, 0], 40, -0.03); } },
      { t0: tZero, snap: 0.3, name: 'zero', key: (t) => { const k = ease.outCubic(clamp((t - tZero) / 0.8)); return K([UX(0) + lerp(5.0, 3.6, k), CY + lerp(3.6, 3.2, k), lerp(12.5, 11.0, k)], [UX(0) - 0.6, CY + 2.0, 0], 40, 0.02); } },
      { t0: this.tRelu, snap: 0.4, name: 'relu', key: (t) => { const k = ease.inOutCubic(clamp((t - this.tRelu) / (tClip - this.tRelu))); return K([0, lerp(0.8, 1.2, k), lerp(12.0, 13.5, k)], [0, 0.6, 0], 40); } },
      { t0: tClip, snap: 0.3, name: 'clip', key: (t) => { const k = ease.outCubic(clamp((t - tClip) / (tAnd - tClip))); return K([lerp(5.0, 6.8, k), lerp(2.2, 1.6, k), lerp(17.0, 18.5, k)], [lerp(4.2, 4.8, k), 1.0, 0], 40, -0.02); } },
      { t0: tAnd - 0.1, snap: 0.4, name: 'hero-run', key: (t) => { const x = gx(t); return K([x + 5.0, CY + 3.4, 10.5], [x - 1.2, CY + 0.5, 0], 40, 0.03); } },
      { t0: tHero, snap: 0.25, name: 'hero', key: (t) => { const k = ease.outExpo(clamp((t - tHero) / Math.max(0.3, end - tHero))); return K([UX(0) + lerp(4.0, 2.4, k), CY + lerp(2.8, 3.4, k), lerp(9.5, 12.5, k)], [UX(0) - 0.8, CY + 1.4, 0], lerp(40, 46, k), -0.02); } },
    ], [
      { t: tSq, amp: 0.8 }, { t: tZero, amp: 0.7 }, { t: this.tRelu, amp: 0.8 }, { t: tClip, amp: 1.2, dir: 'h' }, { t: tHero, amp: 1.6 },
    ], 0.8, 21);
  }

  /** gradient pulse x along the chain (it runs from the loss on the right to unit 0 on the left) */
  pulseX(t: number) {
    const w = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const tGrad = w(this.L2, /gradients/).start, tZero = w(this.L2, /zero/).start;
    const tAnd = w(this.L3, /^and$/).start, tHero = w(this.L3, /hero/).start;
    if (t < this.tRelu) return lerp(LOSSX, UX(0), ease.inOutQuad(clamp((t - tGrad) / (tZero - tGrad))));
    return lerp(LOSSX, UX(0), ease.inQuad(clamp((t - tAnd) / (tHero - tAnd))));
  }
  /** gradient magnitude after crossing the units up to position x (σ: ×¼ per unit; ReLU: ×1) */
  gradAt(x: number, relu: boolean) {
    let g = 1;
    for (let i = 5; i >= 0; i--) if (x <= UX(i)) g *= relu ? 1 : 0.25;
    return g;
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L2 = this.L2, L3 = this.L3;
    const w = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const t0 = this.ctx.start, tSq = w(L2, /squashed/), tSignal = w(L2, /signal/), tGrad = w(L2, /gradients/), tFad = w(L2, /fading/), tZero = w(L2, /zero/);
    const tRelu = this.tRelu, tClip = w(L3, /clipped/), tNeg = w(L3, /negatives/), tAnd = w(L3, /^and$/), tHero = w(L3, /hero/);
    const isRelu = t >= tRelu - 0.05;
    const morph = isRelu ? ease.inOutCubic(clamp((t - tRelu) / 0.35)) : 0; // σ → ReLU on the transfer screen
    const stepK = 1 - ease.inOutCubic(clamp((t - t0) / 0.45)); // the intro's step morphs into σ at the cut
    const kick = this.beatPulse(t, 0.08);
    const wall = wallPl(0);
    const floor = floorPl(-12);

    // ------------------------------------------------ the lab: floor grid, rack silhouettes, glow pools
    pool(c, W * 0.5, H * 0.45, 1000, '#0F3A26', 0.5);
    this.grid3(c, floor, -40, 40, -30, 30, 2, '#123A28', 1, { alpha: 0.7, fog: [12, 45] });
    for (let i = -6; i <= 6; i++) {
      const x = i * 6.5, h = 14 + 6 * hash(i, 3);
      this.rect3(c, wallPl(-9), x - 2.2, -12, 4.4, h, { fill: '#071610', stroke: hexA(DIM, 0.35), lw: 1 });
      for (let k = 0; k < 10; k++) if (hash(i, k) > 0.55) this.dot3(c, at(wallPl(-8.98), x - 1.6 + 0.5 * (k % 4), -10 + k * 1.3), 0.06, hexA(k % 3 ? PH : AMB, 0.5 + 0.5 * Math.sin(t * (3 + k) + i)), {});
    }

    // ------------------------------------------------ three scope screens
    const screen = (x0: number, x1: number, title: string, sub: string) => {
      this.rect3(c, wall, x0 - 0.5, -5.2, x1 - x0 + 1.0, 10.6, { fill: BEZEL, stroke: hexA(DIM, 0.9), lw: 1.4 });
      this.rect3(c, wall, x0, -4.3, x1 - x0, 8.6, { fill: GLASS, stroke: hexA(PH, 0.35), lw: 1.2 });
      // graticule: 8 × 8 divisions, centre cross ticked
      const gx: [V3, V3][] = [], gy: [V3, V3][] = [];
      for (let i = 1; i < 8; i++) { const u = x0 + ((x1 - x0) * i) / 8; gx.push([at(wall, u, -4.3, 0.01), at(wall, u, 4.3, 0.01)]); }
      for (let i = 1; i < 8; i++) { const v = -4.3 + (8.6 * i) / 8; gy.push([at(wall, x0, v, 0.01), at(wall, x1, v, 0.01)]); }
      this.segs(c, gx, GRID, 1, 0.8); this.segs(c, gy, GRID, 1, 0.8);
      this.text3(c, title, wall, x0, 4.62, { size: 0.42, fam: MONOB, color: PH });
      this.text3(c, sub, wall, x1, 4.62, { size: 0.36, fam: MONO, color: hexA(BONE, 0.6), align: 'right' });
      // knobs under each screen
      for (let k = 0; k < 4; k++) this.ring3(c, wall, x0 + 0.8 + k * 1.2, -4.85, 0.22, hexA(BONE, 0.5), 1.2, { fill: '#10281D' });
    };
    screen(SCR.A[0], SCR.A[1], 'CH1  INPUT', '2 V/DIV');
    screen(SCR.B[0], SCR.B[1], isRelu ? 'XY  max(0, x)' : 'XY  σ(x) = 1 / (1 + e⁻ˣ)', '');
    screen(SCR.C[0], SCR.C[1], 'CH2  OUTPUT', '2 V/DIV');
    // the traces: CH1 scrolls; CH2 is the activation of CH1 on the same scale
    const scroll = (t - t0) * 1.6;
    const wave = (u: number) => AMP * Math.sin((u * 0.9 + scroll) * 1.15);
    const act = (x: number) => (morph >= 1 ? relu(x) : lerp(sig(x), relu(x), morph));
    const tr = (x0: number, x1: number, fn: (u: number) => number, col: string, lw: number, alpha = 1) => {
      const pts: V3[] = [];
      for (let i = 0; i <= 120; i++) { const u = lerp(x0, x1, i / 120); pts.push(at(wall, u, clamp(fn(u - x0) * VS, -4.3, 4.3), 0.02)); }
      this.pl3(c, pts, col, lw + 5, { alpha: 0.12 * alpha });
      this.pl3(c, pts, col, lw, { alpha });
    };
    tr(SCR.A[0], SCR.A[1], wave, PH, 2.6);
    // CH2: before "squashed" it is hidden; then the output appears (σ squashed into (0, 1) — a thin band at the 0 V line)
    const showC = clamp((t - tSq.start) / 0.25);
    if (showC > 0) tr(SCR.C[0], SCR.C[1], (u) => act(wave(u)), isRelu ? AMB : PH, 2.6, showC);
    // σ's band on CH2: the (0, 1) range marked
    if (!isRelu && showC > 0) {
      for (const v of [0, 1]) this.seg(c, at(wall, SCR.C[0], v * VS, 0.02), at(wall, SCR.C[1], v * VS, 0.02), RED, 1.2, { alpha: 0.7 * showC, dash: [6, 6] });
      this.text3(c, 'range (0, 1)', wall, SCR.C[1] - 0.2, 1.05 * VS + 0.25, { size: 0.36, fam: MONOB, color: RED, align: 'right', alpha: showC });
    }
    // the clip blade at 0 V on CH2, and the negative lobes falling away (ReLU)
    if (isRelu) {
      const bk = clamp((t - tClip.start) / 0.2);
      if (bk > 0) {
        this.glowSeg(c, at(wall, SCR.C[0] - 0.4, 0, 0.05), at(wall, SCR.C[0] - 0.4 + (SCR.C[1] - SCR.C[0] + 0.8) * bk, 0, 0.05), RED, 2.4, 10, 1);
        // falling debris: the negative lobes, cut into pieces that drop out of the screen with gravity
        for (let j = 0; j < 26; j++) {
          const u = (j + 0.5) / 26 * (SCR.C[1] - SCR.C[0]);
          const v = wave(u);
          if (v >= 0) continue;
          const tc0 = tClip.start + 0.05 + 0.012 * j;
          if (t < tc0) continue;
          const dt = t - tc0;
          const y = v * VS - 4.5 * dt * dt - 1.2 * dt;
          if (y < -11) continue;
          const x = SCR.C[0] + u + (hash(j, 7) - 0.5) * 2 * dt;
          const rot = (hash(j, 9) - 0.5) * 6 * dt;
          const len = 0.34;
          this.seg(c, [x - Math.cos(rot) * len, y - Math.sin(rot) * len, 0.3 + dt], [x + Math.cos(rot) * len, y + Math.sin(rot) * len, 0.3 + dt], PH, 2.2, { alpha: clamp(1 - dt / 1.4) });
        }
      }
    }
    // the transfer curve on the XY screen (magnified: one division = 1 on x, 0.25 on y for σ)
    {
      const xs = (x: number) => x * 0.62, ys = (y: number) => (isRelu ? y * 0.62 : (y - 0.5) * 6.4);
      const pts: V3[] = [];
      for (let i = 0; i <= 100; i++) {
        const x = lerp(-6.4, 6.4, i / 100);
        const yS = sig(x), yStep = x > 0 ? 1 : 0;
        const yv = stepK > 0 ? lerp(yS, yStep, stepK) : yS;
        const yy = isRelu ? lerp((sig(x) - 0.5) * 6.4 / 0.62, relu(x), morph) : yv;
        pts.push(at(wall, xs(x), clamp(isRelu ? yy * 0.62 : ys(yy), -4.3, 4.3), 0.03));
      }
      // axes
      this.seg(c, at(wall, -4, 0, 0.02), at(wall, 4, 0, 0.02), hexA(BONE, 0.5), 1.2);
      this.seg(c, at(wall, 0, -4.3, 0.02), at(wall, 0, 4.3, 0.02), hexA(BONE, 0.5), 1.2);
      this.pl3(c, pts, isRelu ? AMB : PH, 10, { alpha: 0.12 });
      this.pl3(c, pts, isRelu ? AMB : PH, 3.2);
      // the live operating point: CH1's value at the screen edge maps through the curve
      const xNow = wave(SCR.A[1] - SCR.A[0]);
      const yNow = isRelu ? relu(xNow) * 0.62 : ys(sig(xNow));
      const p = at(wall, xs(xNow), clamp(yNow, -4.3, 4.3), 0.05);
      this.seg(c, at(wall, xs(xNow), -4.3, 0.04), p, hexA(BONE, 0.5), 1, { dash: [4, 5] });
      this.dot3(c, p, 0.16, '#FFFFFF');
      if (!isRelu) this.text3(c, '1', wall, -3.8, 3.2 + 0.2, { size: 0.36, fam: MONO, color: hexA(BONE, 0.7) });
      if (!isRelu) this.text3(c, '0', wall, -3.8, -3.2 + 0.2, { size: 0.36, fam: MONO, color: hexA(BONE, 0.7) });
    }
    // cables: CH1 → XY → CH2 (a dashed run along the top)
    this.pl3(c, [at(wall, SCR.A[1], 5.4, 0.1), at(wall, SCR.B[0], 5.4, 0.1)], hexA(PH, 0.6), 1.4, { dash: [8, 8] });
    this.pl3(c, [at(wall, SCR.B[1], 5.4, 0.1), at(wall, SCR.C[0], 5.4, 0.1)], hexA(PH, 0.6), 1.4, { dash: [8, 8] });

    // ------------------------------------------------ the chain (backprop)
    this.chain(c, t, isRelu);

    // ------------------------------------------------ lyric type
    // SIGMOID → RELU over the transfer screen
    if (!isRelu) {
      const k = ease.outBack(clamp((t - L2[0]!.start) / 0.3), 1.6);
      // (steps left as SQUASHED lands over CH2, so the two words don't run into each other)
      const sx = -1.6 * ease.inOutCubic(clamp((t - (tSq.start - 0.12)) / 0.3));
      this.text3(c, 'SIGMOID', wall, sx, 5.85, { size: 1.6 * k, fam: WIDE, color: t < L2[0]!.end ? U.mag : BONE, align: 'center', glow: 14, glowColor: U.ink });
    } else {
      const k = ease.outBack(clamp((t - tRelu) / 0.25), 2.2);
      this.text3(c, 'RELU', wall, 0, 5.85, { size: 2.4 * k, fam: WIDE, color: AMB, align: 'center', glow: 16, glowColor: U.ink });
    }
    // SQUASHED over CH2, literally squashed
    if (!isRelu && t > tSq.start - 0.03) {
      const k = ease.outExpo(clamp((t - tSq.start) / 0.25));
      this.text3(c, 'SQUASHED', wall, (SCR.C[0] + SCR.C[1]) / 2, 5.85, { size: 1.3, fam: WIDE, color: t < tSq.end ? U.mag : BONE, align: 'center', each: () => ({ sy: lerp(1.7, 0.55, k), sc: 1 }) });
    }
    // THE SIGNAL over CH1 — gone before the gradient run starts: its words (DOWN TO …) are set on the same wall at
    // the same height, and the two used to print over each other (18–20 s)
    const sigA = 1 - clamp((t - (tGrad.start - 0.12)) / 0.2);
    if (!isRelu && sigA > 0) this.say3(c, [w(L2, /^the$/), tSignal], t, wall, (SCR.A[0] + SCR.A[1]) / 2, -6.75, { size: 1.3, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, rise: 0.3, alpha: sigA });
    // CLIPPED THE / NEGATIVES on CH1/CH2 tops (ReLU)
    if (isRelu && t > tClip.start - 0.03 && t < tAnd.start + 0.3) {
      c.save(); c.globalAlpha *= 1 - clamp((t - tAnd.start + 0.18) / 0.14);
      this.say3(c, [tClip, w(L3, /^the$/)], t, wall, 4.3 - 3.6, -6.75, { size: 1.3, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'right', upper: true, rise: 0.3 });
      if (t > tNeg.start - 0.03) {
        const p = clamp((t - tNeg.start) / (tNeg.end - tNeg.start));
        this.text3(c, 'NEGATIVES', wall, 4.3 - 3.2, -6.75, { size: 1.3, fam: WIDE, align: 'left', each: (i, _ch, n) => ((i + 0.5) / n <= p * 1.5 + 0.05 ? { color: t < tNeg.end ? U.mag : BONE } : null) });
        // the clip: the lower 45 % of NEGATIVES is cut away by the blade line
        this.glowSeg(c, at(wall, 0.6, -6.55 + 0.18, 0.06), at(wall, 12.6, -6.55 + 0.18, 0.06), RED, 2, 8, clamp((t - tNeg.start) / 0.2));
      }
      c.restore();
    }
    frameMarks(c, U.ash, { tl: 'BASELINE · BENCH 02 · ACTIVATIONS', tr: isRelu ? 'f(x) = max(0, x)   f′ = 1 (x > 0)' : 'σ′(x) = σ(1 − σ) ≤ 1/4', bl: '1986 — 2011', br: tc(t), alpha: 0.6 });
    void tGrad; void tFad; void tZero; void tAnd; void tHero;
    return { bloom: 0.75, bloomThreshold: 0.55, halation: 0.18, ca: 0.3 + 1.2 * hot(t, tClip.start, 0.1) + 1.5 * hot(t, tHero.start, 0.12), grain: 0.05, vignette: 0.32, flash: 0.025 * hot(t, tHero.start, 0.1), zoom: 1 + 0.012 * kick };
  }

  private chain(c: Ctx, t: number, isRelu: boolean) {
    const L2 = this.L2, L3 = this.L3;
    const w = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const tGrad = w(L2, /gradients/).start, tZero = w(L2, /zero/), tAnd = w(L3, /^and$/).start, tHero = w(L3, /hero/);
    const P = wallPl(0);
    const run = isRelu ? t >= tAnd - 0.1 : t >= tGrad - 0.15;
    const px = run ? this.pulseX(t) : 99;
    // units
    for (let i = 0; i < 6; i++) {
      const x = UX(i);
      const lit = run && px <= x + 0.2 ? 1 : 0;
      this.box3(c, [x - 1.2, CY - 1.2, -1.2], [x + 1.2, CY + 1.2, 1.2], hexA(isRelu ? AMB : PH, 0.65 + 0.35 * lit), 1.5, { fill: '#0A1F16', alpha: 0.95 });
      // the activation glyph on the front face
      const pts: V3[] = [];
      for (let j = 0; j <= 30; j++) { const x0 = lerp(-4, 4, j / 30); const y = isRelu ? relu(x0) / 4 : sig(x0); pts.push([x + x0 * 0.2, CY - 0.8 + y * 1.5, 1.22]); }
      this.pl3(c, pts, isRelu ? AMB : PH, 2.4);
      this.text3(c, `L${i + 1}`, P, x - 1.1, CY - 1.65, { size: 0.36, fam: MONOB, color: hexA(BONE, 0.6) });
      // forward arrows between units
      if (i < 5) this.seg(c, [x + 1.3, CY + 0.6, 0], [UX(i + 1) - 1.3, CY + 0.6, 0], hexA(BONE, 0.35), 1.4);
      // the factor this unit applies on the way back
      // (they come with the backward run: before it they sat under THE SIGNAL at the foot of the bench shot)
      const fa = isRelu ? 1 : clamp((t - tGrad) / 0.25);
      if (fa > 0) this.text3(c, isRelu ? '× 1' : '× ¼', P, x, CY + 1.55, { size: 0.5, fam: MONOB, color: isRelu ? AMB : PH, align: 'center', alpha: 0.85 * fa });
    }
    // the loss box at the right
    this.box3(c, [LOSSX - 1.0, CY - 1.0, -1.0], [LOSSX + 1.0, CY + 1.0, 1.0], RED, 1.6, { fill: '#200C0A' });
    this.text3(c, 'LOSS', P, LOSSX, CY - 0.18, { size: 0.55, fam: MONOB, color: RED, align: 'center' });
    this.text3(c, 'INPUT', P, UX(0) - 2.2, CY - 0.18, { size: 0.42, fam: MONOB, color: hexA(BONE, 0.6), align: 'right' });
    // the backward track
    this.seg(c, [LOSSX - 1.0, CY - 1.9, 0], [UX(0) - 1.2, CY - 1.9, 0], hexA(isRelu ? AMB : PH, 0.25), 1.2, { dash: [3, 7] });
    if (!run) return;
    // the pulse: amber orb whose size and light are the gradient's magnitude
    const g = this.gradAt(px, isRelu);
    const rr = 0.85 * Math.pow(g, 0.32), aa = clamp(Math.pow(g, 0.22));
    const pos: V3 = [px, CY - 1.9, 0.2];
    const q = this.pr(pos);
    if (q.z > this.near && aa > 0.02) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const R = rr * q.k * 3.2;
      const gr = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, R);
      gr.addColorStop(0, hexA(AMB, 0.9 * aa)); gr.addColorStop(0.35, hexA(AMB, 0.35 * aa)); gr.addColorStop(1, hexA(AMB, 0));
      c.fillStyle = gr; c.fillRect(q.x - R, q.y - R, 2 * R, 2 * R);
      c.restore();
      this.dot3(c, pos, rr * 0.45, hexA('#FFF1D6', aa));
    }
    // the running value over the pulse
    const val = g >= 0.01 ? g.toFixed(g >= 0.1 ? 2 : 4) : g.toFixed(5);
    this.text3(c, `∂L/∂x = ${isRelu ? '1.00' : val}`, P, px, CY - 3.0, { size: 0.55, fam: MONOB, color: isRelu ? AMB : mixHex(AMB, RED, 1 - Math.pow(g, 0.25)), align: 'center', alpha: clamp(aa + 0.3) });
    // lyric along the chain: each word set where the pulse is when it is sung, so the line is written by the run
    // (one phrase at a time: the run is quick, so each phrase clears as the next is sung — they used to print over
    // each other where the pulse had barely moved between two words)
    const gone = (until?: number) => (until === undefined ? 1 : 1 - clamp((t - (until - 0.06)) / 0.1));
    const place = (ws: Word[], dx: number, y: number, size: number, col: string, fam = HEAVY, until?: number) => {
      const w0 = ws[0]!;
      if (t < w0.start - 0.02) return;
      const a = gone(until);
      if (a <= 0) return;
      const x = this.pulseX(w0.start) + dx;
      this.say3(c, ws, t, P, x, y, { size: size * 1.35, fam, up: '', cur: col, done: BONE, align: 'center', upper: true, rise: 0.3, slam: 0.35, alpha: a });
    };
    if (!isRelu) {
      const fw = w(L2, /fading/), dw = w(L2, /down/);
      place([w(L2, /gradients/)], -1.0, CY + 2.7, 1.2, AMB, WIDE, fw.start);
      if (t > fw.start - 0.02 && gone(dw.start) > 0) {
        const x = this.pulseX(fw.start) - 1.2;
        const p = clamp((t - fw.start) / (fw.end - fw.start));
        c.save(); c.globalAlpha *= gone(dw.start);
        this.text3(c, 'FADING', P, x, CY + 2.7, { size: 1.6, fam: WIDE, align: 'center', each: (i, _ch, n) => ((i + 0.5) / n <= p * 1.6 + 0.05 ? { color: BONE, a: 1 - 0.13 * i } : null) });
        c.restore();
      }
      // DOWN TO, then ZERO under it (reading order: down to zero)
      // (ZERO sits clear of the × ¼ row under it; DOWN TO is sung low enough to be in the close shot, and ZERO pushes it
      // up as it lands — set at its final height, it was over the top of the frame while it was sung)
      const zk = t > tZero.start - 0.03 ? ease.outBack(clamp((t - tZero.start) / 0.25), 1.8) : 0;
      place([w(L2, /down/), w(L2, /^to$/)], -1.6, Math.max(CY + 3.6, CY + 2.5 + 0.685 * 2.6 * zk + 0.5), 0.9, AMB);
      if (t > tZero.start - 0.03) {
        const k = zk;
        this.text3(c, 'ZERO', P, UX(0) - 0.2, CY + 2.5, { size: 2.6 * k, fam: WIDE, color: RED, align: 'center', glow: 18, glowColor: U.ink, each: (i) => ({ a: 1 - 0.18 * i * clamp((t - tZero.start) / (tZero.end - tZero.start)) }) });
      }
    } else {
      const wi = (re: RegExp) => w(L3, re);
      place([wi(/^and$/), wi(/came/)], -2.6, CY + 2.6, 1.1, AMB, HEAVY, wi(/^in$/).start);
      place([wi(/^in$/)], -1.0, CY + 2.6, 1.1, AMB, HEAVY, wi(/^as$/).start);
      place([wi(/^as$/), L3[L3.length - 2]!], -2.2, CY + 2.6, 1.1, AMB, HEAVY, tHero.start);
      if (t > tHero.start - 0.03) {
        const k = ease.outBack(clamp((t - tHero.start) / 0.22), 2.4);
        const q0 = this.pr([UX(0), CY + 1.5, 0]);
        if (q0.z > this.near) {
          c.save(); c.globalCompositeOperation = 'lighter';
          const n = 28, R = 900 * k;
          for (let j = 0; j < n; j++) {
            const a = (j / n) * Math.PI * 2 + (t - tHero.start) * 0.4;
            c.strokeStyle = hexA(AMB, 0.16); c.lineWidth = 10 + 18 * hash(j, 2);
            c.beginPath(); c.moveTo(q0.x, q0.y); c.lineTo(q0.x + Math.cos(a) * R, q0.y + Math.sin(a) * R); c.stroke();
          }
          c.restore();
        }
        this.text3(c, 'HERO', P, UX(0), CY + 3.3, { size: 3.8 * k, fam: WIDE, color: AMB, align: 'center', glow: 22, glowColor: U.ink });
      }
    }
  }
}
