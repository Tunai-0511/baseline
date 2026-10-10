// v3 L06–L07 ("SVM, the widest margin, kernel trick and all, / deep nets ate the benchmarks and the margins had to
// fall"): MARGIN. A light, plotted world. The 32 points of a real hard-margin fit (data/svm_fit.json) stand in a yard;
// the decision blade rises between the classes and the street widens until its two fences touch the three support
// vectors: 2/‖w‖ = 3.29. Next door, rings that no line can split are lifted by φ(x) = (x₁, x₂, x₁² + x₂²) into a bowl
// and one level plane cuts them (z = 25.2) — the circle it leaves on the floor is the kernel SVM's boundary. Then the
// ImageNet top-5 error bars (28.2, 25.8 → 16.4, 11.7, 6.7, 3.6): the deep-net years start at 2011's height and each is
// crushed down to its error on a hit of ATE THE BENCHMARKS, the network that did it named under it (AlexNet, ZFNet,
// GoogLeNet, ResNet). Back in the yard the margin fences fall flat.
// Style: paper-light plot — warm grey ground, ink, orange (+1) and teal (−1), the deep net in black.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, tc, clamp, lerp, ease, hexA, hot, F, W, H, vlerp, orbit, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BG = '#0B0A0D', INK = '#EDEAF2', GRID = '#1E1C24', GRID2 = '#2A2731', ORA = '#FF2E7E', TEAL = '#9A96A3', RED = '#FF2E7E', MUTE = '#5C5966';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), MONO = F.mono(500), MONOB = F.mono(700), ITAL = F.serif(600, true);
const BOWL: V3 = [32, 0, 2]; // kernel demo centre
const CH = { z: -24, x0: 2, dx: 4.4, k: 0.42 }; // chart: bars at z, from x0, spacing dx, height per % error
const BARS: [string, number, boolean][] = [['2010', 28.2, false], ['2011', 25.8, false], ['2012', 16.4, true], ['2013', 11.7, true], ['2014', 6.7, true], ['2015', 3.57, true]];

interface Lin { posts: [number, number][]; label: number[]; w: [number, number]; b: number; normal: [number, number]; tangent: [number, number]; margin_m: number; support: number[] }
interface Ker { posts: [number, number][]; label: number[]; z_m2: number[]; blade_z_m2: number; support: number[] }

export default class Svm extends VScene {
  private L6!: Word[]; private L7!: Word[];
  private lin: Lin | null = null; private ker: Ker | null = null;

  override async init() {
    this.bg = BG;
    this.env = { eq: ['svm_primal', 'svm_dual', 'rbf', 'margin', 'kerneltrick', 'convlayer'], seed: 4 }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    this.L6 = ly.lines[6]!.words; this.L7 = ly.lines[7]!.words;
    try { const d = await (await fetch('data/svm_fit.json')).json(); this.lin = d.linear; this.ker = d.kernel; } catch { /* frame only */ }
    const w = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const t0 = this.ctx.start, tWide = w(this.L6, /widest/).start, tKer = w(this.L6, /kernel/).start, tDeep = this.L7[0]!.start, tBench = w(this.L7, /benchmarks/).start, tMarg = w(this.L7, /margins/).start, tFall = w(this.L7, /fall/).start, end = this.ctx.end;
    const tAnd = w(this.L7, /^and$/).start;
    this.crush = this.crushTimes();
    const tg = this.lin ? this.lin.tangent : [-0.98, 0.18];
    const nm = this.lin ? this.lin.normal : [0.18, 0.98];
    this.rig = new Rig([
      { t0, name: 'yard', key: (t) => { const k = ease.inOutQuad(clamp((t - t0) / (tWide - t0))); return K([lerp(15, 12, k), lerp(17, 14, k), lerp(21, 19, k)], [0, 0, 0.5], 40); } },
      { t0: tWide - 0.05, snap: 0.45, name: 'street', key: (t) => {
        const k = ease.inOutQuad(clamp((t - tWide) / (tKer - tWide)));
        const d = lerp(17, 14, k);
        return K([nm[0]! * d + tg[0]! * 2, lerp(7.5, 8.5, k), nm[1]! * d + tg[1]! * 2], [tg[0]! * 1.5, 0.4, tg[1]! * 1.5], 44, 0.0);
      } },
      { t0: tKer - 0.05, snap: 0.55, name: 'bowl', key: (t) => { const k = ease.inOutQuad(clamp((t - tKer) / (tDeep - tKer))); return K(orbit([BOWL[0], 4.5, BOWL[2]], lerp(0.25, 0.95, k), lerp(0.45, 0.32, k), lerp(27, 24, k)), [BOWL[0], lerp(4.0, 5.2, k), BOWL[2]], 42); } },
      // the chart, square on and still (the bars are crushed in place; no pan to follow)
      { t0: tDeep - 0.05, snap: 0.5, name: 'chart', key: (t) => { const k = ease.inOutQuad(clamp((t - tDeep) / (tAnd - tDeep))); return K([lerp(18, 16, k), lerp(9.0, 8.8, k), lerp(2.6, 2.0, k)], [13, 7.6, CH.z + 2], 46, -0.02); } },
      // (from AND: the margins line is on the yard's fence, so the camera is back in the yard as it is sung)
      { t0: tAnd - 0.05, snap: 0.45, name: 'fall', key: (t) => {
        const k = ease.outCubic(clamp((t - tAnd) / (end - tAnd)));
        const a = K([lerp(12, 8, k), lerp(9, 11, k), lerp(17, 19, k)], [0, lerp(3.2, 2.6, k), -1], lerp(44, 48, k));
        // the last half second: the yard opens into a square shaft and the camera turns to look down it (DEPTH's mouth)
        const kh = ease.inOutCubic(clamp((t - (end - 0.55)) / 0.55));
        if (kh <= 0) return a;
        const b = K([3.1, 16, 4.6], [0, -14, 0], 50, 0, [0, 0, -1]);
        return { p: vlerp(a.p, b.p, kh), tg: vlerp(a.tg, b.tg, kh), roll: 0, fov: lerp(a.fov, b.fov, kh), up: kh > 0.5 ? [0, 0, -1] : undefined };
      } },
    ], [{ t: t0, amp: 0.5 }, { t: tKer, amp: 0.6 }, { t: tDeep, amp: 1.2, dir: 'h' }, ...this.crush.map((tc) => ({ t: tc + 0.15, amp: 0.55 })), { t: tFall, amp: 1.8 }], 0.8, 41);
    void tMarg; void tBench;
  }

  /** when each deep-net bar is crushed: on ATE, THE, BENCH-, -MARKS */
  private crush: number[] = [];
  private crushTimes(): number[] {
    const L7 = this.L7, w = (re: RegExp) => L7.find((x) => re.test(x.w))!;
    const ate = w(/ate/), bench = w(/benchmarks/), the = L7[L7.indexOf(ate) + 1]!;
    const tt = [ate.start, the.start, bench.start, bench.start + 0.55 * (bench.end - bench.start)];
    for (let i = 1; i < tt.length; i++) tt[i] = Math.max(tt[i]!, tt[i - 1]! + 0.2);
    return tt;
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L6 = this.L6, L7 = this.L7;
    const w = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const t0 = this.ctx.start, tSvm = L6[0]!, tWide = w(L6, /widest/), tMargin = w(L6, /margin/), tKer = w(L6, /kernel/), tAll = w(L6, /all/);
    const tDeep = L7[0]!, tAte = w(L7, /ate/), tBench = w(L7, /benchmarks/), tMarg = w(L7, /margins/), tFall = w(L7, /fall/);
    const G = floorPl(0);
    const kick = this.beatPulse(t, 0.08);
    // ------------------------------------------------ the plotted ground
    this.grid3(c, G, -40, 60, -40, 30, 1, GRID, 1, { alpha: 0.9, fog: [14, 70] });
    this.grid3(c, G, -40, 60, -40, 30, 5, GRID2, 1.4, { alpha: 1, fog: [16, 80] });
    // ------------------------------------------------ the yard: linear SVM
    this.yard(c, t, G);
    // ------------------------------------------------ the bowl: the kernel trick
    if (t > tKer.start - 0.6) this.bowl(c, t, tKer.start, tAll.end);
    // ------------------------------------------------ the chart and the deep net
    const tAnd2 = L7[L7.indexOf(tBench) + 1]!; // AND (the margins …)
    this.chart(c, t, tDeep.start, tAnd2.start);
    // ------------------------------------------------ lyric type
    const wallY: Pl = wallPl(-6.5);
    // SVM, painted huge on the yard's back fence; THE WIDEST MARGIN along the street
    {
      const k = ease.outBack(clamp((t - tSvm.start) / 0.25), 1.8);
      this.text3(c, 'SVM', wallY, -1, 2.4, { size: 5.2 * k, fam: WIDE, color: t < tSvm.end ? U.mag : INK, align: 'center', alpha: 1 - clamp((t - tKer.start) / 0.4) });
      // the hard-margin problem, painted under the name (Cortes & Vapnik)
      this.eqFit(c, 'svm_primal', wallY, -1, 0.95, 13, 1.1, { color: INK, alpha: 0.85 * clamp((t - (tSvm.start + 0.3)) / 0.3) * (1 - clamp((t - tKer.start) / 0.4)) });
    }
    if (this.lin && t > tWide.start - 0.05) {
      const tg = this.lin.tangent, nm = this.lin.normal;
      const P: Pl = this.readable({ o: [nm[0] * -0.2 - tg[0] * 1.5, 0.02, nm[1] * -0.2 - tg[1] * 1.5], r: [tg[0], 0, tg[1]], u: [nm[0], 0, nm[1]] });
      this.say3(c, [w(L6, /^the$/), tWide, tMargin], t, P, -1.4, -0.65, { size: 1.2, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: INK, align: 'center', upper: true, rise: 0.3, alpha: 1 - clamp((t - tKer.start) / 0.3) });
    }
    // (gone before DEEP NETS: as the camera swings to the chart they slid over its labels)
    const bwA = 1 - clamp((t - (tDeep.start - 0.12)) / 0.12);
    if (t > tKer.start - 0.03 && bwA > 0) {
      const BW: Pl = { o: [BOWL[0], 0, BOWL[2] - 9.5], r: [1, 0, 0], u: [0, 1, 0] };
      this.say3(c, L6.slice(L6.indexOf(tKer)), t, BW, 0, 11.4, { size: 1.5, slam: 0.35, fam: WIDE, up: '', cur: U.mag, done: INK, align: 'center', upper: true, rise: 0.4, alpha: bwA, maxW: 16.5, lead: 1.85 });
      this.text3(c, 'φ(x) = (x₁, x₂, x₁² + x₂²)', BW, 0, 8.25, { size: 0.72, fam: ITAL, color: INK, align: 'center', alpha: clamp((t - tKer.start - 0.3) / 0.4) * bwA });
      this.text3(c, 'k(x, y) = ⟨φ(x), φ(y)⟩ · φ never built', BW, 0, 7.1, { size: 0.5, fam: MONO, color: MUTE, align: 'center', alpha: clamp((t - tKer.start - 0.6) / 0.4) * bwA });
    }
    // DEEP NETS / ATE THE BENCHMARKS over the chart, above the bars, held still; gone as the camera leaves on AND
    if (t > tDeep.start - 0.03 && t < tAnd2.start + 0.1) {
      const LP: Pl = wallPl(CH.z + 1.6);
      const la = 1 - clamp((t - (tAnd2.start - 0.12)) / 0.12);
      this.say3(c, [tDeep, L7[1]!], t, LP, 13, 15.3, { size: 2.1, slam: 0.55, fam: WIDE, up: '', cur: U.mag, done: INK, align: 'center', upper: true, rise: 0.25, glow: 16, glowColor: U.ink, alpha: la });
      this.say3(c, L7.slice(L7.indexOf(tAte), L7.indexOf(tBench) + 1), t, LP, 13, 13.3, { size: 1.75, slam: 0.35, fam: WIDE, up: '', cur: U.mag, done: INK, align: 'center', upper: true, rise: 0.4, glow: 14, glowColor: U.ink, alpha: la });
    }
    // AND THE MARGINS HAD TO FALL, the last word huge
    if (t > tAnd2.start - 0.05) {
      const P: Pl = wallPl(-6.4);
      const i0 = L7.indexOf(w(L7, /^and$/));
      this.say3(c, L7.slice(i0, L7.indexOf(tFall)), t, P, 0, 8.6, { size: 1.55, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: INK, align: 'center', upper: true, rise: 0.3 });
      if (t > tFall.start - 0.03) {
        const k = clamp((t - tFall.start) / 0.5);
        // (its cap line stays under the line above it)
        this.text3(c, 'FALL', P, 0, 3.9, { size: 5.3, fam: WIDE, color: RED, align: 'center', each: (i) => { const d = clamp(k * 2.2 - i * 0.28); return { dy: -0.9 * ease.inQuad(d), rot: d * (i % 2 ? 0.35 : -0.3), a: 1 - 0.25 * d }; } });
      }
    }
    // the hole: a square shaft opening in the yard for the next claim (DEPTH)
    const hk = clamp((t - (this.ctx.end - 0.6)) / 0.45);
    if (hk > 0) {
      const sz = 5.0 * ease.outCubic(hk);
      this.fill3(c, [[-sz, 0.02, -sz], [sz, 0.02, -sz], [sz, 0.02, sz], [-sz, 0.02, sz]], '#0B0716');
      for (let k = 0; k <= 14; k++) {
        const y = -k * 0.8;
        this.pl3(c, [[-sz, y, -sz], [sz, y, -sz], [sz, y, sz], [-sz, y, sz]], hexA('#9370FF', 0.85 * Math.pow(0.86, k) * hk), k === 0 ? 2.4 : 1.2, { close: true });
      }
    }
    frameMarks(c, U.ash, { tl: 'BASELINE · YARD 04 · MAXIMUM MARGIN', tr: t < tDeep.start ? 'HARD MARGIN · 3 SUPPORT VECTORS' : 'ILSVRC TOP-5 ERROR', bl: '1995 — 2012', br: tc(t), alpha: 0.6 });
    void t0; void tAte; void W; void H;
    return { bloom: 0.2, bloomThreshold: 0.95, halation: 0.05, ca: 0.25 + 1.2 * hot(t, tDeep.start, 0.1) + 1.6 * hot(t, tFall.start, 0.12), grain: 0.045, vignette: 0.22, zoom: 1 + 0.012 * kick, shake: [0, 0] };
  }

  private yard(c: Ctx, t: number, G: Pl) {
    const L6 = this.L6, L7 = this.L7;
    const w = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const t0 = this.ctx.start, tWide = w(L6, /widest/), tFall = w(L7, /fall/), tMarg = w(L7, /margins/);
    const d = this.lin;
    if (!d) return;
    const tg = d.tangent, nm = d.normal;
    const nw = Math.hypot(d.w[0], d.w[1]);
    // the street: margin half-width grows from a hair to 1/‖w‖ while "widest margin" is sung
    const half = (1 / nw) * ease.outCubic(clamp((t - tWide.start) / (tWide.end + 0.4 - tWide.start)));
    // centre line: w·x + b = 0 → offset along the normal = −b/‖w‖
    const off = -d.b / nw;
    const L = 16;
    const P0: [number, number] = [nm[0] * off, nm[1] * off];
    const ptOn = (s: number, o: number): V3 => [P0[0] + tg[0] * s + nm[0] * o, 0, P0[1] + tg[1] * s + nm[1] * o];
    // street tint
    if (half > 0.01) this.fill3(c, [ptOn(-L, -half), ptOn(L, -half), ptOn(L, half), ptOn(-L, half)], hexA('#FFFFFF', 0.07));
    // points
    const sup = new Set(d.support);
    d.posts.forEach((p, i) => {
      const ti = t0 + 0.05 + (i / d.posts.length) * 0.5;
      if (t < ti) return;
      const g = ease.outBack(clamp((t - ti) / 0.25), 2);
      const col = d.label[i]! > 0 ? ORA : TEAL;
      const Pp = floorPl(0.01, [0, 0.01, 0]);
      this.ring3(c, Pp, p[0], -p[1], 0.32 * g, INK, 1.4, { fill: col });
      // a short stem: the posts stand up a little
      this.seg(c, [p[0], 0, p[1]], [p[0], 0.9 * g, p[1]], hexA(col, 0.9), 2.2);
      this.dot3(c, [p[0], 0.9 * g, p[1]], 0.13, col);
      if (sup.has(i) && t > tWide.end - 0.1) {
        const k = clamp((t - (tWide.end - 0.1)) / 0.3);
        this.ring3(c, Pp, p[0], -p[1], 0.65 + 0.12 * Math.sin(t * 9), INK, 2.2, { alpha: k });
      }
    });
    if (t > tWide.end + 0.1) {
      const sv = d.posts[d.support[0]!]!;
      this.note(c, [sv[0], 1.0, sv[1]], 60, -70, 'SUPPORT VECTORS', { col: INK, sub: '3 of 32 points decide the line', alpha: clamp((t - tWide.end - 0.1) / 0.3) * (1 - clamp((t - tMarg.start) / 0.3)) });
    }
    // the decision blade (a tall pane) and the two fences (low panes) — the fences fall at "fall"
    const rise = ease.outCubic(clamp((t - (t0 + 0.25)) / 0.5));
    const bladeH = 3.2 * rise;
    this.fill3(c, [ptOn(-L, 0), ptOn(L, 0), [ptOn(L, 0)[0], bladeH, ptOn(L, 0)[2]], [ptOn(-L, 0)[0], bladeH, ptOn(-L, 0)[2]]], hexA(INK, 0.12));
    this.seg(c, ptOn(-L, 0), ptOn(L, 0), INK, 2.6);
    this.seg(c, [ptOn(-L, 0)[0], bladeH, ptOn(-L, 0)[2]], [ptOn(L, 0)[0], bladeH, ptOn(L, 0)[2]], INK, 1.4);
    if (half > 0.01) {
      const fallK = ease.inQuad(clamp((t - tFall.start) / 0.55));
      for (const sgn of [-1, 1]) {
        const fh = 1.5;
        // fence pane hinged on its floor line, rotating outward to lie flat
        const ang = fallK * (Math.PI / 2);
        const top = (s: number): V3 => {
          const base = ptOn(s, sgn * half);
          return [base[0] + nm[0] * sgn * Math.sin(ang) * fh, Math.cos(ang) * fh, base[2] + nm[1] * sgn * Math.sin(ang) * fh];
        };
        this.fill3(c, [ptOn(-L, sgn * half), ptOn(L, sgn * half), top(L), top(-L)], hexA(sgn > 0 ? ORA : TEAL, 0.3));
        this.seg(c, ptOn(-L, sgn * half), ptOn(L, sgn * half), INK, 1.6, { dash: [10, 8] });
        this.seg(c, top(-L), top(L), sgn > 0 ? ORA : TEAL, 2);
        for (let s = -L; s <= L; s += 3) this.seg(c, ptOn(s, sgn * half), top(s), hexA(INK, 0.5), 1);
        // dust when they land
        if (fallK >= 1 && t < tFall.start + 1.3) {
          const dt = t - (tFall.start + 0.55);
          for (let j = 0; j < 30; j++) {
            const s = -L + (j / 30) * 2 * L;
            const b = top(s);
            const up = 1.8 * dt - 2.5 * dt * dt;
            this.dot3(c, [b[0] + (hash(j, 3) - 0.5) * dt * 3, Math.max(0, up) + 0.05, b[2] + sgn * nm[1] * dt * 2], 0.08, hexA(INK, clamp(1 - dt / 0.75)));
          }
        }
      }
      // the width readout, on the floor between the fences
      if (t > tWide.end - 0.2 && t < tFall.start + 0.4) {
        // (past the start of THE WIDEST MARGIN, which runs down the same street: at 6 it crossed THE)
        const P: Pl = this.readable({ o: ptOn(9.8, 0), r: [nm[0], 0, nm[1]], u: [-tg[0], 0, -tg[1]] });
        this.text3(c, `2 / ‖w‖ = ${(2 * half).toFixed(2)}`, P, 0, 0.3, { size: 0.55, fam: MONOB, color: INK, align: 'center', alpha: clamp((t - tWide.end + 0.2) / 0.3) });
      }
    }
    void G;
  }

  private bowl(c: Ctx, t: number, tKer: number, tAllEnd: number) {
    const d = this.ker;
    if (!d) return;
    const S = 0.25; // height per m²
    const lift = ease.inOutCubic(clamp((t - tKer) / 0.9));
    const a = clamp((t - (tKer - 0.6)) / 0.4);
    const [bx, , bz] = BOWL;
    // the paraboloid's wire (rings + meridians) as it rises
    const segs: [V3, V3][] = [];
    for (let r = 1; r <= 8; r++) {
      const R = r * 0.9;
      for (let i = 0; i < 48; i++) {
        const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2;
        segs.push([[bx + Math.cos(a0) * R, R * R * S * lift, bz + Math.sin(a0) * R], [bx + Math.cos(a1) * R, R * R * S * lift, bz + Math.sin(a1) * R]]);
      }
    }
    for (let i = 0; i < 16; i++) {
      const an = (i / 16) * Math.PI * 2;
      for (let r = 0; r < 8; r++) { const R0 = r * 0.9, R1 = (r + 1) * 0.9; segs.push([[bx + Math.cos(an) * R0, R0 * R0 * S * lift, bz + Math.sin(an) * R0], [bx + Math.cos(an) * R1, R1 * R1 * S * lift, bz + Math.sin(an) * R1]]); }
    }
    this.segs(c, segs, hexA(MUTE, 0.6 * a), 1);
    // the lattice points: stems up to φ₃ = x₁² + x₂²
    d.posts.forEach((p, i) => {
      const z2 = d.z_m2[i]!;
      const h = z2 * S * lift;
      const col = d.label[i]! > 0 ? ORA : TEAL;
      const base: V3 = [bx + p[0], 0, bz + p[1]], top: V3 = [bx + p[0], h, bz + p[1]];
      this.seg(c, base, top, hexA(col, 0.55 * a), 1.4);
      this.dot3(c, top, 0.22, col, { stroke: INK, lw: 1, alpha: a });
    });
    // the cutting plane at z = 25.2 and its circle, dropped to the floor
    const cut = clamp((t - (tKer + 0.75)) / 0.35);
    if (cut > 0) {
      const hz = d.blade_z_m2 * S * lift, R = Math.sqrt(d.blade_z_m2);
      const E = 9.5 * cut;
      this.fill3(c, [[bx - E, hz, bz - E], [bx + E, hz, bz - E], [bx + E, hz, bz + E], [bx - E, hz, bz + E]], hexA('#FFFFFF', 0.07), { stroke: INK, lw: 1.6 });
      const ring = (y: number): V3[] => Array.from({ length: 65 }, (_, i) => [bx + Math.cos((i / 64) * Math.PI * 2) * R, y, bz + Math.sin((i / 64) * Math.PI * 2) * R] as V3);
      this.pl3(c, ring(hz + 0.01), RED, 3);
      const drop = clamp((t - (tKer + 1.15)) / 0.4);
      if (drop > 0) { this.pl3(c, ring(0.02), RED, 3, { alpha: drop }); for (let i = 0; i < 12; i++) { const an = (i / 12) * Math.PI * 2; this.seg(c, [bx + Math.cos(an) * R, hz, bz + Math.sin(an) * R], [bx + Math.cos(an) * R, hz * (1 - drop), bz + Math.sin(an) * R], hexA(RED, 0.6), 1, { dash: [4, 5] }); } }
      this.note(c, [bx + E, hz, bz - E], 40, -40, `PLANE  x₁² + x₂² = ${d.blade_z_m2}`, { col: INK, sub: 'a line in φ-space · a circle on the floor', alpha: cut * (1 - clamp((t - tAllEnd) / 0.3)) });
    }
  }

  private chart(c: Ctx, t: number, tDeep: number, tOut: number) {
    const a = clamp((t - (tDeep - 0.15)) / 0.3) * (1 - clamp((t - tOut) / 0.35));
    if (a <= 0) return;
    const CP: Pl = wallPl(CH.z - 0.6);
    // backboard with gridlines every 5 %
    this.rect3(c, CP, CH.x0 - 2.5, -0.2, CH.dx * 6 + 3.0, 12.6, { fill: hexA('#141219', 0.95 * a), stroke: hexA(INK, 0.4 * a), lw: 1.2 });
    for (let p = 0; p <= 25; p += 5) {
      this.seg(c, at(CP, CH.x0 - 2.0, p * CH.k, 0.02), at(CP, CH.x0 + CH.dx * 6, p * CH.k, 0.02), hexA(INK, (p === 0 ? 0.8 : 0.2) * a), 1);
      this.text3(c, `${p}%`, CP, CH.x0 - 2.2, p * CH.k - 0.15, { size: 0.42, fam: MONO, color: hexA(INK, 0.7 * a), align: 'right' });
    }
    // the bars: the hand-feature years stay; each deep-net year starts at 2011's height and is crushed down to its
    // error on its hit — the network that did it named under it (2026-10-10: a train of conv slabs used to drive
    // past and bite them, and read as boxes floating by)
    const NETS: [string, string][] = [['', ''], ['', ''], ['ALEXNET', '8 LAYERS'], ['ZFNET', '8 LAYERS'], ['GOOGLENET', '22 LAYERS'], ['RESNET', '152 LAYERS']];
    BARS.forEach(([yr, err, deep], i) => {
      const x = CH.x0 + i * CH.dx;
      const ti = deep ? this.crush[i - 2]! : -1;
      const u = deep ? clamp((t - ti) / 0.14) : 1;
      const hit = deep && t >= ti;
      // the slam (ease-in) and a short ring after it
      const ring = hit && u >= 1 ? 0.35 * Math.exp(-(t - ti - 0.14) * 12) * Math.sin((t - ti - 0.14) * 42) : 0;
      const h = (deep ? lerp(25.8, err, ease.inQuad(u)) : err) * CH.k + ring;
      const col = deep ? (hit ? ORA : MUTE) : TEAL;
      this.box3(c, [x - 1.3, 0, CH.z - 1.3], [x + 1.3, h, CH.z + 0.3], hexA(INK, a), 1.3, { fill: hexA(col, 0.85 * a) });
      this.text3(c, yr, CP, x, -1.0, { size: 0.6, fam: MONOB, color: hexA(INK, a), align: 'center' });
      if (!deep || u >= 1) this.text3(c, err.toFixed(1), wallPl(CH.z + 0.32), x, h + 0.35, { size: 0.62, fam: MONOB, color: hexA(deep ? RED : INK, a), align: 'center' });
      if (!deep) return;
      // what was crushed off: a flat shock line out from the bar's new top, and chips thrown up
      const dt = t - ti - 0.14;
      if (dt > 0 && dt < 0.7) {
        const yt = err * CH.k, f = 1 - dt / 0.7;
        this.glowSeg(c, [x - 1.3 - dt * 5, yt, CH.z + 0.31], [x + 1.3 + dt * 5, yt, CH.z + 0.31], RED, 2.2 * f, 10, f);
        for (let j = 0; j < 14; j++) {
          const vx = (hash(i, j, 1) - 0.5) * 7, vy = 3 + 5 * hash(i, j, 2), vz = 1 + 3 * hash(i, j, 3);
          this.dot3(c, [x + vx * dt, yt + vy * dt - 9 * dt * dt, CH.z + 0.3 + vz * dt], 0.09, hexA(j % 3 ? INK : RED, f));
        }
      }
      // the network, named under its year (lit from its hit)
      const on = hit ? 1 : 0.3;
      this.text3(c, NETS[i]![0], CP, x, -1.75, { size: 0.44, fam: MONOB, color: hexA(hit ? RED : INK, a * on), align: 'center' });
      this.text3(c, NETS[i]![1], CP, x, -2.3, { size: 0.32, fam: MONO, color: hexA(INK, 0.8 * a * on), align: 'center' });
    });
    // the hand-feature / deep-net divide
    this.seg(c, at(CP, CH.x0 + CH.dx * 1.5, 0, 0.05), at(CP, CH.x0 + CH.dx * 1.5, 12.2, 0.05), hexA(RED, 0.8 * a), 1.6, { dash: [8, 6] });
  }
}
