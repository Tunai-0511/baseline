// v9 verse3 a, L32–L35 (2026-10-10 polish: the four lab panels were small diagrams in the dark; now each idea fills
// the frame as a structure the camera moves through). Same real data as v_gen (gan25, diffusion_glyph, rope, norms).
//   GAN       — the court: 25 target modes on the floor (wells of light); G's samples as a magenta terrain (a KDE of
//               the 64 real samples) with the samples riding it; G and D as monuments at the two ends; MODES n/25
//               huge on the back wall; "collapsed": the terrain folds into one spike and the uncovered wells go out
//   diffusion — each word of the line out of a volume of noise (real DDPM trajectories; the noise scattered in depth,
//               flattening into the word as t → 0); "a thousand tiny steps": the camera flies down a corridor of the
//               intermediate frames, t = 1000 … 0 on each
//   RoPE      — the sinusoidal code as a wall of light (40 positions × 16 dims) that falls away into a tunnel of
//               needles: position m along the tunnel, the 8 frequency pairs round it, each needle turned by m·θᵢ
//   norms     — the 16 residual values as columns: LayerNorm re-centres and rescales them, RMSNorm only rescales;
//               then the activation as a glowing tube, ReLU bending into Swish (min −0.278 at x = −1.278)
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BONE = U.bone, MAG = U.mag, ASH = U.ash, GRAPH = U.graphite;
const WIDE = F.archivo(125, 900), COND = F.archivo(75, 900), MONO = F.mono(500), MONOB = F.mono(700);
const GS = 2.4; // GAN: world units per data unit
const DX = 70, RX = 140, NX = 210; // station origins along x: diffusion, RoPE, norms

function f16(b64: string): Float32Array {
  const bin = atob(b64), n = bin.length >> 1, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const h = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    out[i] = e === 0 ? s * Math.pow(2, -14) * (m / 1024) : e === 31 ? (m ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + m / 1024);
  }
  return out;
}
interface GanSnap { step: number; balls: [number, number][]; modes: number }
interface DWord { text: string; n: number; t: number[]; pos: Float32Array; width: number }

export default class Gen2 extends VScene {
  private L: Word[][] = [];
  private gan: GanSnap[] = [];
  private dw: DWord[] = [];
  private rope: { theta: number[] } | null = null;
  private norms: { x: number[]; mu: number; sigma: number; rms: number; layernorm: { unit: number[] }; rmsnorm: { unit: number[] } } | null = null;
  private buf = new Float32Array(3 * 9000);
  private spike: [number, number] = [0, 0];

  private wd(li: number, re: RegExp) { return this.L[li]!.find((w) => re.test(w.w))!; }

  override async init() {
    this.bg = U.ink;
    this.env = { eq: ['gan', 'ddpm_fwd', 'ddpm_loss', 'rope', 'rope_rot', 'rmsnorm', 'swiglu'], seed: 10, keep: (x, z) => Math.abs(z) > 34 && !(z < 0 && z > -130 && (Math.abs(x - 70) < 40 || Math.abs(x - 140) < 40)) }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L = [0, 1, 2, 3].map((k) => ly.lines[i0 + k]!.words);
    try {
      this.gan = (await (await fetch('data/gan25.json')).json()).snapshots;
      const d = await (await fetch('data/diffusion_glyph.json')).json();
      this.dw = d.words.map((w: { text: string; n: number; t: number[]; pos: string; width: number }) => ({ text: w.text, n: w.n, t: w.t, width: w.width, pos: f16(w.pos) }));
      this.rope = await (await fetch('data/rope.json')).json();
      this.norms = await (await fetch('data/norms.json')).json();
    } catch { /* */ }
    // where the collapsed terrain peaks (the mean of the last collapse snapshot)
    const last = this.gan[67];
    if (last) this.spike = [last.balls.reduce((a, b) => a + b[0], 0) / last.balls.length, last.balls.reduce((a, b) => a + b[1], 0) / last.balls.length];
    const s = this.ctx.start, e = this.ctx.end;
    const t33 = this.L[1]![0]!.start, t34 = this.L[2]![0]!.start, t35 = this.L[3]![0]!.start;
    const tCol = this.wd(0, /collapsed/).start, tThou = this.wd(1, /thousand/).start, tGave = this.wd(2, /gave/).start, tRelu = this.wd(3, /ReLU/).start;
    const [sx, sz] = [this.spike[0] * GS, this.spike[1] * GS];
    this.rig = new Rig([
      // the court, from its near end, drifting across it
      { t0: s, name: 'court', key: (t) => { const k = ease.inOutQuad(clamp((t - s) / (tCol - s))); return K([lerp(-4.5, 3.5, k), lerp(5.6, 4.4, k), lerp(13.5, 11, k)], [lerp(-1, 0.5, k), 0.6, -1.5], 54, -0.03 + 0.05 * k); } },
      // the spike
      { t0: tCol - 0.04, snap: 0.22, name: 'spike', key: (t) => { const k = ease.outCubic(clamp((t - tCol) / (t33 - tCol))); return K([sx + lerp(5.5, 4, k), lerp(2.2, 3.0, k), sz + lerp(7.5, 6, k)], [sx, lerp(2.4, 3.2, k), sz], 50, 0.04); } },
      // diffusion: square on to the words
      { t0: t33 - 0.05, snap: 0.5, name: 'noise', key: (t) => { const k = ease.inOutQuad(clamp((t - t33) / (tThou - t33))); return K([DX + lerp(-2, 2, k), lerp(4.6, 4.2, k), lerp(30, 27, k)], [DX, 4.4, 0], 50, 0.02); } },
      // a thousand tiny steps: down the corridor of frames
      { t0: tThou - 0.05, snap: 0.3, name: 'corridor', key: (t) => { const k = ease.inOutQuad(clamp((t - tThou) / (t34 - tThou + 0.1))); const z = lerp(14, -78, k); return K([DX + 0.6, 4.2, z], [DX, 4.2, z - 30], 56, 0.05 * Math.sin(k * 3)); } },
      // the sinusoid wall
      { t0: t34 - 0.05, snap: 0.45, name: 'wall', key: (t) => { const k = ease.inOutQuad(clamp((t - t34) / (tGave - t34))); return K([RX + lerp(-3, 0, k), lerp(5.5, 5.2, k), lerp(26, 22, k)], [RX, 5.2, 0], 50, -0.02); } },
      // RoPE: into the tunnel, rolling with it
      { t0: tGave - 0.05, snap: 0.3, name: 'tunnel', key: (t) => { const k = ease.inOutQuad(clamp((t - tGave) / (t35 - tGave + 0.1))); const z = lerp(12, -18, k); return K([RX, 5, z], [RX, 5, z - 20], 62, k * 0.35); } },
      // norms: the columns
      { t0: t35 - 0.05, snap: 0.45, name: 'columns', key: (t) => { const k = ease.inOutQuad(clamp((t - t35) / (tRelu - t35))); return K([NX + lerp(-5, -1.5, k), lerp(3.6, 4.6, k), lerp(15, 13.5, k)], [NX + lerp(-1, 0, k), 2.4, 0], 52, -0.03); } },
      // the activation: along the tube
      { t0: tRelu - 0.05, snap: 0.3, name: 'curve', key: (t) => { const k = ease.inOutQuad(clamp((t - tRelu) / (e - tRelu))); return K([NX + lerp(-9, 4, k), lerp(3.0, 4.6, k), lerp(11, 13, k)], [NX + lerp(-3, 3, k), lerp(2.8, 3.8, k), 0], 54, 0.03); } },
    ], [{ t: s, amp: 0.6 }, { t: tCol, amp: 1.6 }, { t: t33, amp: 0.6 }, { t: tThou, amp: 0.5 }, { t: t34, amp: 0.6 }, { t: tGave, amp: 0.7 }, { t: t35, amp: 0.6 }, { t: tRelu, amp: 0.6 }], 0.8, 113);
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L = this.L;
    const t33 = L[1]![0]!.start, t34 = L[2]![0]!.start, t35 = L[3]![0]!.start;
    const kick = this.beatPulse(t, 0.08);
    const cx = this.key.p[0];
    if (cx < DX - 25) this.gan25(c, t);
    if (t > t33 - 0.8 && cx > 20 && cx < RX - 25) this.diffusion(c, t);
    if (t > t34 - 0.8 && cx > DX + 25 && cx < NX - 25) this.ropeTunnel(c, t);
    if (t > t35 - 0.8 && cx > RX + 25) this.normsAct(c, t);
    frameMarks(c, ASH, { tl: 'BASELINE · THE LAB · GENERATIVE ERA', tr: t < t33 ? 'GAN · 25 GAUSSIANS' : t < t34 ? 'DDPM · T = 1000' : t < t35 ? 'θᵢ = 10000^(−2i/d)' : 'NORMS · ACTIVATIONS', bl: '2014 — 2020', br: tc(t), alpha: 0.5 });
    return { bloom: 0.85, bloomThreshold: 0.5, halation: 0.2, ca: 0.3 + 2.2 * hot(t, this.wd(0, /collapsed/).start, 0.12), grain: 0.05, vignette: 0.34, zoom: 1 + 0.01 * kick };
  }

  // ------------------------------------------------------------------ GAN: the court
  private ganField(t: number) {
    const L32 = this.L[0]!;
    const tG = L32[0]!, tUntil = this.wd(0, /until/), tCol = this.wd(0, /collapsed/);
    const n = this.gan.length;
    let fi: number;
    if (t < tUntil.start) fi = lerp(0, 56, ease.inOutQuad(clamp((t - tG.start) / (tUntil.start - tG.start))));
    else fi = lerp(56, 67, ease.inOutCubic(clamp((t - tUntil.start) / (tCol.start + 0.35 - tUntil.start))));
    const i0 = Math.min(n - 1, Math.floor(fi)), i1 = Math.min(n - 1, i0 + 1), k = fi - i0;
    const S0 = this.gan[i0]!, S1 = this.gan[i1]!;
    const balls = S0.balls.map((p, j) => { const q = S1.balls[j] ?? p; return [lerp(p[0], q[0], k), lerp(p[1], q[1], k)] as [number, number]; });
    return { balls, modes: k < 0.5 ? S0.modes : S1.modes, step: k < 0.5 ? S0.step : S1.step };
  }

  private gan25(c: Ctx, t: number) {
    if (!this.gan.length) return;
    const L32 = this.L[0]!;
    const tCol = this.wd(0, /collapsed/);
    const { balls, modes, step } = this.ganField(t);
    const sig = 0.3, M = 46, half = 6.2;
    const dens = (x: number, z: number) => { let d = 0; for (const b of balls) { const dx = x - b[0], dz = z - b[1]; d += Math.exp(-(dx * dx + dz * dz) / (2 * sig * sig)); } return d; };
    const hgt = (d: number) => 6.2 * Math.sqrt(d / 64);
    // the floor of the court and the 25 wells of light (the data); lit while the terrain covers them
    this.grid3(c, floorPl(-0.02), -16, 16, -16, 12, 1.2, '#1A1820', 1, { alpha: 0.9, fog: [14, 50] });
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const on = clamp(dens(a, b) / 2.5);
      const P = floorPl(0.01, [a * GS, 0.01, b * GS]);
      this.ring3(c, P, 0, 0, 0.42, hexA(BONE, 0.25 + 0.6 * on), 2, { fill: hexA(on > 0.3 ? BONE : '#2A2731', 0.15 + 0.3 * on), n: 28 });
      if (on > 0.05) this.glowSeg(c, [a * GS, 0, b * GS], [a * GS, 3.4 * on, b * GS], BONE, 1.2, 8, 0.35 * on);
    }
    // G's terrain: rows and columns of the density surface; the high ground in hot magenta
    const lines: V3[][] = [];
    for (let r = 0; r <= M; r++) {
      const zr = -half + (2 * half * r) / M, row: V3[] = [], col: V3[] = [];
      for (let q = 0; q <= M; q++) {
        const xq = -half + (2 * half * q) / M;
        row.push([xq * GS / 2.2, hgt(dens(xq / 2.2, zr / 2.2)), zr * GS / 2.2]);
        col.push([zr * GS / 2.2, hgt(dens(zr / 2.2, xq / 2.2)), xq * GS / 2.2]);
      }
      lines.push(row, col);
    }
    for (const ln of lines) {
      this.pl3(c, ln, U.magDeep, 1.1, { alpha: 0.55 });
      // the runs above the plain, bright
      let run: V3[] = [];
      for (const p of ln) { if (p[1] > 0.35) run.push(p); else { if (run.length > 1) this.pl3(c, run, MAG, 1.6, { alpha: clamp(0.4 + run.reduce((a, q) => Math.max(a, q[1]), 0) / 4) }); run = []; } }
      if (run.length > 1) this.pl3(c, run, MAG, 1.6, { alpha: 1 });
    }
    // the samples riding the terrain
    const pts: number[] = [];
    for (const b of balls) pts.push(b[0] * GS, hgt(dens(b[0], b[1])) + 0.12, b[1] * GS);
    this.points(c, pts, pts.length / 3, '#FFD6E6', 6);
    this.points(c, pts, pts.length / 3, '#FFFFFF', 2.6);
    // the two players: monuments at the ends of the court
    const mon = (s: string, sub: string, x: number, z: number, col: string) => {
      const P = this.readable(wallPl(z, [x, 0, z]));
      this.text3(c, s, P, 0, 0.2, { size: 4.2, fam: WIDE, color: col, align: 'center', glow: 18, glowColor: U.ink });
      this.text3(c, sub, P, 0, -1.05, { size: 0.42, fam: MONOB, color: hexA(ASH, 0.9), align: 'center', track: 0.3 });
    };
    mon('G', 'GENERATOR · PLAYER 1', -9.5, 4.5, BONE);
    mon('D', 'DISCRIMINATOR · PLAYER 2', 9.5, -9, BONE);
    // MODES n/25 on the back wall, and the step
    const back = wallPl(-12, [0, 0, -12]);
    const mc = modes <= 1 && t > tCol.start - 0.1 ? MAG : BONE;
    // (lower and left of centre: as the court shot drifts down its top went out of frame, and from the spike shot
    // the wall's centre is past the right edge)
    this.text3(c, `MODES ${String(modes).padStart(2, '0')}/25`, back, -5.5, 7.15, { size: 1.55, fam: MONOB, color: mc, align: 'center', glow: modes <= 1 ? 22 : 8, glowColor: mc });
    this.text3(c, `STEP ${step.toLocaleString('en-US')}  ·  NON-SATURATING LOSS`, back, -5.5, 6.6, { size: 0.45, fam: MONO, color: hexA(ASH, 0.85), align: 'center', track: 0.12 });
    // the lyric over the court
    if (t < tCol.start) this.chunk3(c, L32.slice(0, L32.indexOf(tCol)), t, back, 0, 4.6, { size: 2.3, maxW: 26, slam: 0.4, glow: 18, glowColor: U.ink, breaks: [0, 3, 5] });
    // COLLAPSED: slammed over the spike; shock rings run out across the court
    const [sx, sz] = [this.spike[0] * GS, this.spike[1] * GS];
    if (t > tCol.start - 0.02) {
      const kk = ease.outBack(clamp((t - tCol.start) / 0.2), 2);
      const P = this.readable(wallPl(sz + 0.5, [sx, 0, sz + 0.5]));
      // (low, over the spike's foot: higher up it landed on MODES 01/25 on the back wall; at 1.55 it ran from the G
      // monument off the right edge of the close shot)
      this.text3(c, 'COLLAPSED', P, 0, 1.6, { size: 1.15 * kk, fam: WIDE, color: MAG, align: 'center', mid: true, glow: 26, glowColor: U.ink, each: (i) => ({ dy: -0.2 * Math.max(0, Math.sin((t - tCol.start) * 9 - i * 0.6)) * Math.exp(-(t - tCol.start) * 2) }) });
      for (let r = 0; r < 3; r++) {
        const u = clamp((t - tCol.start - r * 0.1) / 0.9);
        if (u > 0 && u < 1) this.ring3(c, floorPl(0.03, [sx, 0.03, sz]), 0, 0, 0.6 + 14 * ease.outCubic(u), BONE, 3 * (1 - u), { alpha: 1 - u, n: 72 });
      }
    }
  }

  // ------------------------------------------------------------------ diffusion
  private diffusion(c: Ctx, t: number) {
    const L33 = this.L[1]!;
    const tThou = this.wd(1, /thousand/), tTiny = this.wd(1, /tiny/), tSteps = this.wd(1, /steps/);
    const P = wallPl(0, [DX, 0, 0]);
    const cap = 3.1;
    // each word in turn, assembling out of a volume of noise; the one before falls back into the dark
    let tAll = 1000;
    for (let j = 0; j < 6; j++) {
      const dwj = this.dw[j], w = L33[j];
      if (!dwj || !w) continue;
      const next = L33[j + 1];
      if (t < w.start - 0.2) continue;
      if (next && t > next.start + 0.35) continue; // (the last one, A, clears as THOUSAND comes down the corridor)
      // (the words are sung fast: each is clean by the middle of its own syllables; it forms only just before it is
      // sung and the one before clears quickly, so two words never sit on each other for long)
      const k = clamp((t - (w.start - 0.15)) / Math.max(0.25, Math.min(0.5, (w.end - w.start) * 0.6 + 0.15)));
      const fr = Math.min(63, Math.floor(ease.inOutQuad(k) * 63));
      const away = next ? ease.inCubic(clamp((t - next.start + 0.15) / 0.25)) : 0;
      const N = dwj.n, base = fr * N * 2;
      const pts = this.buf.length >= N * 3 ? this.buf : (this.buf = new Float32Array(N * 3));
      const clean = fr / 63, depth = (1 - clean) * 9;
      const x0 = -(dwj.width * cap) / 2;
      for (let p = 0; p < N; p++) {
        const z = (hash(p, j) - 0.5) * depth - away * 26;
        const wq = at(P, x0 + dwj.pos[base + 2 * p]! * cap, 3.2 + dwj.pos[base + 2 * p + 1]! * cap + away * 3, z);
        pts[p * 3] = wq[0]; pts[p * 3 + 1] = wq[1]; pts[p * 3 + 2] = wq[2];
      }
      this.points(c, pts, N, mixHex(ASH, '#FFFFFF', clean), 7 + 5 * clean, 1 - away);
      tAll = Math.min(tAll, dwj.t[fr] ?? 0);
      // (QA: the word is the particles, legible once mostly assembled)
      if (clean > 0.55 && away < 0.2) {
        const nL = Math.max(1, w.w.replace(/[^A-Za-z]/g, '').length), ww = dwj.width * cap;
        const quads: V3[][] = [];
        for (let q = 0; q < nL; q++) { const xa = x0 + (ww * q) / nL, xb = x0 + (ww * (q + 1)) / nL; quads.push([at(P, xa, 3.2), at(P, xb, 3.2), at(P, xb, 3.2 + cap * 0.75), at(P, xa, 3.2 + cap * 0.75)]); }
        this.qaWord(w.w, quads, 1 - away);
      }
    }
    // the step counter, huge, under the word
    const cnt = t < L33[0]!.start ? 1000 : t < tThou.start ? Math.round(tAll) : Math.round(lerp(1000, 0, clamp((t - tThou.start) / (tSteps.end - tThou.start))));
    if (t < tThou.start + 0.3) this.text3(c, `t = ${String(cnt).padStart(4, ' ')}`, P, 0, -0.6, { size: 1.5, fam: MONOB, color: hexA(BONE, 0.9), align: 'center' });
    // the corridor of the steps: ten frames of DIFFUSION from t = 1000 to 0, receding down −z
    const cor = clamp((t - tThou.start + 0.4) / 0.4);
    if (cor > 0 && this.dw[0]) {
      const dw0 = this.dw[0];
      for (let sI = 0; sI < 10; sI++) {
        const fr = Math.round((sI / 9) * 63), z = -sI * 9 - 4, base = fr * dw0.n * 2;
        const Pz = wallPl(z, [DX, 0, z]);
        this.rect3(c, Pz, -12, -1.8, 24, 12, { stroke: hexA(ASH, 0.5 * cor), lw: 1.4 });
        const N = Math.floor(dw0.n / 2);
        const pts = new Float32Array(N * 3);
        const cl = fr / 63;
        for (let p = 0; p < N; p++) {
          const wq = at(Pz, -(dw0.width * 2.2) / 2 + dw0.pos[base + 4 * p]! * 2.2, 3.4 + dw0.pos[base + 4 * p + 1]! * 2.2, 0.02);
          pts[p * 3] = wq[0]; pts[p * 3 + 1] = wq[1]; pts[p * 3 + 2] = wq[2];
        }
        this.points(c, pts, N, mixHex(ASH, '#FFFFFF', cl), 5, cor);
        // (high on the frame's left side: at its foot the labels lay over THOUSAND · TINY · STEPS on the floor; and
        // gone as the camera comes up to the frame, before it is cut by the edge of the shot)
        const la = cor * clamp((this.key.p[2] - z - 12) / 5) * clamp((t - (tThou.start + 0.1)) / 0.3); // (corridor shot only: seen square-on they sat in DENOISE)
        if (la > 0.01) this.text3(c, `t = ${Math.round(dw0.t[fr] ?? 0)}`, Pz, -11.4, 7.4, { size: 0.9, fam: MONOB, color: hexA(sI === 9 ? MAG : BONE, la), glow: sI === 9 ? 14 : 0, glowColor: MAG });
      }
      // THOUSAND · TINY · STEPS on the floor of the corridor as they are sung
      const G = floorPl(0.02);
      // THOUSAND · TINY · STEPS hung in the corridor a little ahead of the camera, over the frames' particles (on the
      // floor, the camera flew over each before it was sung)
      const zt = this.key.p[2] - 14;
      this.chunk3(c, [tThou, tTiny, tSteps], t, wallPl(zt, [DX, 0, zt]), 0, 7.6, { size: 2.6, maxW: 24, slam: 0.4, glow: 18, glowColor: U.ink, breaks: [0, 1, 2] });
      void G;
    }
    // the lyric (the words themselves are the particles): a small mono caption of the schedule
    this.text3(c, 'ε-PREDICTION  ·  β 1e-4 → 0.02  ·  T = 1000', P, 0, 11.5, { size: 0.5, fam: MONO, color: hexA(ASH, 0.8), align: 'center', track: 0.12 });
  }

  // ------------------------------------------------------------------ RoPE
  private ropeTunnel(c: Ctx, t: number) {
    const L34 = this.L[2]!;
    const tS = L34[0]!, tGave = this.wd(2, /gave/), tRope = this.wd(2, /RoPE/);
    const fallK = ease.inCubic(clamp((t - tGave.start) / 0.6));
    // the sinusoid wall: 40 positions × 16 dims, built column by column, falling back as the tunnel opens
    if (fallK < 1) {
      const reveal = clamp((t - tS.start + 0.2) / 0.9);
      const cols = 40, rows = 16, cw = 0.62, rh = 0.62;
      const z0 = -fallK * 30;
      const P = wallPl(z0, [RX, -fallK * 6, z0]);
      for (let q = 0; q < cols * reveal; q++) for (let r = 0; r < rows; r++) {
        const i = Math.floor(r / 2), th = Math.pow(10000, (-2 * i) / 16);
        const v = r % 2 ? Math.cos(q * th) : Math.sin(q * th);
        const col = v > 0 ? mixHex('#141218', BONE, v * 0.9) : mixHex('#141218', U.magDeep, -v * 0.8);
        this.rect3(c, P, -cols * cw / 2 + q * cw, 0.6 + r * rh, cw * 0.9, rh * 0.88, { fill: hexA(col, 1 - fallK) });
      }
      this.text3(c, 'PE(pos, 2i) = sin(pos · θᵢ)    PE(pos, 2i+1) = cos(pos · θᵢ)', P, 0, -0.4, { size: 0.55, fam: MONO, color: hexA(BONE, 0.8 * (1 - fallK)), align: 'center' });
      this.chunk3(c, L34.slice(0, L34.indexOf(tGave)), t, P, 0, 11.4, { size: 2.4, maxW: 26, slam: 0.4, glow: 18, glowColor: U.ink });
    }
    // the tunnel: rings of 8 needles (one per frequency pair) at positions m = 0 … 40 along −z
    if (t > tGave.start - 0.1 && this.rope) {
      const op = clamp((t - tGave.start + 0.1) / 0.5);
      const AX: V3 = [RX, 5, 0], R0 = 3.6;
      for (let m = 0; m <= 40; m++) {
        const z = 2 - m * 1.6;
        const ring: V3[] = [];
        for (let a = 0; a <= 32; a++) { const an = (a / 32) * Math.PI * 2; ring.push([AX[0] + Math.cos(an) * R0, AX[1] + Math.sin(an) * R0, z]); }
        this.pl3(c, ring, hexA(GRAPH, 0.7 * op), 1);
        for (let i = 0; i < 8; i++) {
          const ph = (i / 8) * Math.PI * 2, th = this.rope.theta[i]!;
          const b: V3 = [AX[0] + Math.cos(ph) * R0, AX[1] + Math.sin(ph) * R0, z];
          const an = ph + Math.PI / 2 + m * th + (t - tGave.start) * th * 6;
          const tip: V3 = [b[0] + Math.cos(an) * 1.25, b[1] + Math.sin(an) * 1.25, z];
          const hotM = i === 0 || i === 1;
          this.seg(c, b, tip, hotM ? MAG : BONE, hotM ? 2.4 : 1.6, { alpha: op * (hotM ? 1 : 0.75) });
        }
      }
      // GAVE WAY TO / ROPE'S ROTATION, hung in the tunnel a little ahead of the camera as it flies in (on the mouth,
      // the line was behind the camera by the time it was sung, and GAVE WAY TO was nowhere)
      const tEnd = this.L[3]![0]!.start, ka = clamp((t - tGave.start) / (tEnd - tGave.start));
      const zt = this.key.p[2] - lerp(13, 10, ka);
      const TP = wallPl(zt, [RX, 0, zt]);
      this.chunk3(c, L34.slice(L34.indexOf(tGave)), t, TP, 0, 4.4, { size: 1.75, maxW: 12, slam: 0.4, glow: 18, glowColor: U.ink, breaks: [0, 3] });
      const mouth = wallPl(4, [RX, 0, 4]);
      this.text3(c, 'q·k DEPENDS ONLY ON m − n', mouth, 0, 0.6, { size: 0.6, fam: MONOB, color: hexA(BONE, 0.85 * op), align: 'center', track: 0.1 });
      void tRope;
    }
  }

  // ------------------------------------------------------------------ norms + the activation
  private normsAct(c: Ctx, t: number) {
    const L35 = this.L[3]!;
    const N = this.norms;
    if (!N) return;
    const tLN = L35[0]!, tRMS = this.wd(3, /RMS/), tRelu = this.wd(3, /ReLU/), tSwi = this.wd(3, /SwiGLU/);
    const act = ease.inOutCubic(clamp((t - tRelu.start + 0.1) / 0.5));
    this.grid3(c, floorPl(-0.02, [NX, -0.02, 0]), -14, 14, -10, 8, 1.2, '#1A1820', 1, { alpha: 0.8, fog: [12, 40] });
    const back = wallPl(-4, [NX, 0, -4]);
    if (act < 0.99) {
      const a = 1 - act;
      // raw → LayerNorm (re-centred and scaled) → RMSNorm (scaled only)
      const kLN = ease.inOutCubic(clamp((t - tLN.start) / 0.5)), kR = ease.inOutCubic(clamp((t - tRMS.start) / 0.5));
      const vals = N.x.map((x, i) => lerp(lerp(x * 1.6, N.layernorm.unit[i]! * 2.0, kLN), N.rmsnorm.unit[i]! * 2.0, kR));
      const lab = kR > 0.5 ? 'RMSNORM   x / rms(x)' : kLN > 0.5 ? 'LAYERNORM   (x − μ) / σ' : 'RESIDUAL STREAM   x';
      vals.forEach((v, i) => {
        const x = NX + (i - 7.5) * 1.5, w = 0.55;
        const y0 = Math.min(0, v), y1 = Math.max(0, v);
        const col = v >= 0 ? BONE : MAG;
        this.box3(c, [x - w, y0, -w], [x + w, y1, w], hexA(col, a), 1.6, { fill: hexA(v >= 0 ? '#2A2731' : U.magDark, 0.9 * a) });
      });
      if (kLN < 0.5) this.seg(c, [NX - 12.5, N.mu * 1.6, 0.7], [NX + 12.5, N.mu * 1.6, 0.7], hexA(MAG, a), 2, { dash: [8, 6] });
      this.text3(c, lab, back, 0, 4.6, { size: 0.8, fam: MONOB, color: hexA(BONE, a), align: 'center', track: 0.08 });
      // (gone the moment RELU is sung: the activation's line and label come in where it was)
      c.save(); c.globalAlpha *= 1 - clamp((t - (tRelu.start - 0.08)) / 0.12);
      this.chunk3(c, L35.slice(0, L35.indexOf(tRelu)), t, back, 0, 6.6, { size: 2.2, maxW: 24, slam: 0.4, glow: 18, glowColor: U.ink });
      c.restore();
    }
    // the activation: a glowing tube through the room, ReLU bending into Swish
    if (act > 0.01) {
      const bend = ease.inOutCubic(clamp((t - tSwi.start) / 0.6));
      const xs = (x: number) => NX + x * 2.1, ys = (y: number) => 1.6 + y * 2.1;
      this.seg(c, [xs(-6.5), ys(0), 0], [xs(5.5), ys(0), 0], hexA(ASH, 0.6 * act), 1.4);
      this.seg(c, [xs(0), ys(-1.4), 0], [xs(0), ys(5), 0], hexA(ASH, 0.6 * act), 1.4);
      const pts: V3[] = [];
      for (let i = 0; i <= 160; i++) { const x = lerp(-6, 4.8, i / 160); pts.push([xs(x), ys(lerp(Math.max(0, x), x / (1 + Math.exp(-x)), bend)), 0]); }
      const col = mixHex(BONE, MAG, bend);
      this.pl3(c, pts, col, 22, { alpha: 0.08 * act });
      this.pl3(c, pts, col, 9, { alpha: 0.22 * act });
      this.pl3(c, pts, mixHex(col, '#FFFFFF', 0.5), 3.4, { alpha: act });
      if (bend > 0.6) {
        this.dot3(c, [xs(-1.278), ys(-0.278), 0], 0.14, '#FFFFFF');
        this.text3(c, 'min ≈ −0.278  @  x ≈ −1.278', wallPl(0.1), xs(-1.278) - 0.3, ys(-0.278) - 1.0, { size: 0.42, fam: MONO, color: BONE, align: 'right' });
      }
      this.text3(c, bend < 0.5 ? 'ReLU(x) = max(0, x)' : 'SwiGLU(x) = Swish(xW) ⊙ xV', back, 0, 5.2, { size: 0.8, fam: MONOB, color: mixHex(BONE, MAG, bend), align: 'center', alpha: act });
      this.chunk3(c, L35.slice(L35.indexOf(tRelu)), t, back, 0, 6.4, { size: 2.2, maxW: 24, slam: 0.4, glow: 18, glowColor: U.ink });
    }
  }
}
