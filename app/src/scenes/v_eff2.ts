// v9 verse3 b, L36–L39 (2026-10-10 polish: each idea fills the frame as a structure; same real data as v_eff).
//   MoE      — a dense block of 512 lights, all firing; on "mixture" it breaks into 8 expert towers in an arc; each sung
//              word is routed by the real top-2 gate (data/moe_router.json): two towers blaze, six sleep
//   INT4     — a wall of 24 weights × 32 bits (row 0 is the real conv weight of data/quant.json, fp32 sign · exponent ·
//              mantissa); on the two kicks the low bits break off and fall, 32 → 18 → 4; the memory bar drops ×8 and a
//              big throughput gauge swings over
//   LoRA     — W, a wall of 24 × 24 cells all learning, frosts over and locks on "LoRA"; B and A slide in beside it as
//              thin glowing slabs, and their product ΔW (the rank-8 rebuild of the line's glyphs) lies over W
//   in-context — the few-shot context as a long ribbon of tokens the model completes, the frozen θ as a block, and a
//              ∇θ L that drops past it into the floor: nothing catches it (pre 3 opens on the bricks it falls between)
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BONE = U.bone, MAG = U.mag, ASH = U.ash, GRAPH = U.graphite, ICE = '#7C8695';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), MONO = F.mono(500), MONOB = F.mono(700);
const QX = 70, LX = 140, CX = 210; // station origins: INT4, LoRA, in-context

interface Route { word: string; top2: number[]; gates: number[] }
interface Pillar { hex: string; w: number; q: number; q4: string }

export default class Eff2 extends VScene {
  private L: Word[][] = [];
  private routes: Route[] = [];
  private pillar: Pillar | null = null;
  private kicks: number[] = [];
  private lora: ImageBitmap | null = null;

  private wd(li: number, re: RegExp) { return this.L[li]!.find((w) => re.test(w.w))!; }

  override async init() {
    this.bg = U.ink;
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L = [0, 1, 2, 3].map((k) => ly.lines[i0 + k]!.words);
    try {
      this.routes = (await (await fetch('data/moe_router.json')).json()).words;
      const q = await (await fetch('data/quant.json')).json(); this.pillar = q.pillars.find((p: Pillar) => p.q !== 0) ?? q.pillars[1]; this.kicks = q.plates.kicks;
      this.lora = await createImageBitmap(await (await fetch('data/lora_rank8.png')).blob());
    } catch { /* */ }
    const s = this.ctx.start, e = this.ctx.end;
    const t37 = this.L[1]![0]!.start, t38 = this.L[2]![0]!.start, t39 = this.L[3]![0]!.start;
    const tMix = this.wd(0, /mixture/).start, tThr = this.wd(1, /throughput/).start, tLora = this.wd(2, /LoRA/).start, tNo = this.wd(3, /^no$/).start;
    this.rig = new Rig([
      { t0: s, name: 'dense', key: (t) => { const k = ease.inOutQuad(clamp((t - s) / (tMix - s))); return K([lerp(-3, -1, k), lerp(4, 5, k), lerp(11, 14, k)], [0, 3.6, 0], 52, -0.04); } },
      { t0: tMix - 0.04, snap: 0.3, name: 'experts', key: (t) => { const k = ease.inOutQuad(clamp((t - tMix) / (t37 - tMix))); return K([lerp(-1, 3, k), lerp(6.5, 7.5, k), lerp(19, 18, k)], [0, 3.2, -2], 52, 0.03); } },
      { t0: t37 - 0.05, snap: 0.45, name: 'bits', key: (t) => { const k = ease.inOutQuad(clamp((t - t37) / (tThr - t37))); return K([QX + lerp(-3, 1, k), lerp(5.6, 5.2, k), lerp(20, 17, k)], [QX, 5.4, 0], 52, -0.02); } },
      { t0: tThr - 0.05, snap: 0.25, name: 'gauge', key: (t) => { const k = ease.outCubic(clamp((t - tThr) / (t38 - tThr))); return K([QX + 13 + lerp(-2, 0, k), lerp(4, 4.6, k), lerp(11, 9, k)], [QX + 13, 3.6, 0], 50, 0.04); } },
      { t0: t38 - 0.05, snap: 0.45, name: 'W', key: (t) => { const k = ease.inOutQuad(clamp((t - t38) / (tLora - t38))); return K([LX + lerp(-4, -2, k), lerp(6.5, 6.2, k), lerp(19, 17, k)], [LX - 1, 6.2, 0], 52, -0.03); } },
      { t0: tLora - 0.05, snap: 0.3, name: 'patch', key: (t) => { const k = ease.inOutQuad(clamp((t - tLora) / (t39 - tLora))); return K([LX + lerp(2, 6, k), lerp(6.4, 6.8, k), lerp(17, 15, k)], [LX + lerp(1, 3.5, k), 6.2, 0], 52, 0.03); } },
      { t0: t39 - 0.05, snap: 0.45, name: 'context', key: (t) => { const k = ease.inOutQuad(clamp((t - t39) / (tNo - t39))); return K([CX + lerp(-9, -5, k), lerp(3.4, 4.2, k), lerp(10, 12, k)], [CX + lerp(-2, 1, k), 2.6, -2], 54, -0.05); } },
      { t0: tNo - 0.05, snap: 0.3, name: 'grad', key: (t) => { const k = ease.inOutQuad(clamp((t - tNo) / (e - tNo))); const kd = ease.inCubic(clamp((t - (e - 0.5)) / 0.5)); return K([CX + 7, lerp(6, 5, k), lerp(13, 11, k)], [CX + 7, lerp(4.5, 2.5, k) - 7 * kd, -1 + 2 * kd], 52, 0.02); } },
    ], [{ t: s, amp: 0.6 }, { t: tMix, amp: 1.0 }, { t: t37, amp: 0.6 }, ...this.kicks.map((k) => ({ t: k, amp: 1.4 })), { t: tThr, amp: 0.7 }, { t: t38, amp: 0.6 }, { t: tLora, amp: 1.0 }, { t: t39, amp: 0.6 }, { t: tNo, amp: 0.6 }], 0.8, 123);
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L = this.L;
    const t37 = L[1]![0]!.start, t38 = L[2]![0]!.start, t39 = L[3]![0]!.start;
    const kick = this.beatPulse(t, 0.08);
    const cx = this.key.p[0];
    this.grid3(c, floorPl(-0.02, [cx, -0.02, 0]), cx - 30, cx + 30, -20, 16, 1.4, '#1A1820', 1, { alpha: 0.85, fog: [14, 50] });
    if (cx < QX - 25) this.moe(c, t);
    if (t > t37 - 0.8 && cx > 20 && cx < LX - 25) this.quant(c, t);
    if (t > t38 - 0.8 && cx > QX + 30 && cx < CX - 25) this.loraSt(c, t);
    if (t > t39 - 0.8 && cx > LX + 25) this.icl(c, t);
    frameMarks(c, ASH, { tl: 'BASELINE · THE LAB · EFFICIENCY', tr: t < t37 ? 'TOP-2 OF 8' : t < t38 ? 'FP32 → INT4 · ×8 SMALLER' : t < t39 ? 'd = 4096 · r = 8' : 'IN-CONTEXT · θ FROZEN', bl: '2017 — 2023', br: tc(t), alpha: 0.5 });
    return { bloom: 0.85, bloomThreshold: 0.5, halation: 0.2, ca: 0.3 + this.kicks.reduce((a, k) => a + 1.8 * hot(t, k, 0.1), 0), grain: 0.05, vignette: 0.34, zoom: 1 + 0.01 * kick };
  }

  // ------------------------------------------------------------------ MoE
  /** expert e's tower: centre x, z on an arc behind the router */
  private tower(e: number): [number, number] { const a = (e - 3.5) * 0.24; return [Math.sin(a) * 11, -Math.cos(a) * 11 + 6]; }

  private moe(c: Ctx, t: number) {
    const L36 = this.L[0]!;
    const tMix = this.wd(0, /mixture/), tOnly = this.wd(0, /only/);
    const split = ease.inOutCubic(clamp((t - tMix.start + 0.05) / 0.7));
    const routeW = this.routes.map((r) => L36.find((w) => w.w.toUpperCase().replace(/[^A-Z]/g, '') === r.word));
    let cur = -1;
    routeW.forEach((w, i) => { if (w && t >= w.start - 0.05) cur = i; });
    const awake = cur >= 0 ? this.routes[cur]!.top2 : [];
    // 512 lights: in the dense block (8 × 8 × 8 lattice round the origin) → in the 8 towers (64 each)
    const pts: number[] = [], hotPts: number[] = [];
    for (let i = 0; i < 512; i++) {
      const bx = (i % 8) - 3.5, by = Math.floor(i / 8) % 8, bz = Math.floor(i / 64) - 3.5;
      const dense: V3 = [bx * 0.9, 0.8 + by * 0.9, bz * 0.9];
      const e = Math.floor(i / 64), j = i % 64;
      const [tx, tz] = this.tower(e);
      const tw: V3 = [tx + ((j % 4) - 1.5) * 0.55, 0.6 + Math.floor(j / 4) * 0.55, tz + ((Math.floor(j / 16) % 2) - 0.5) * 0.55];
      const kk = ease.inOutCubic(clamp((split - hash(i, 2) * 0.3) / 0.7));
      const p: V3 = [lerp(dense[0], tw[0], kk), lerp(dense[1], tw[1], kk) + Math.sin(kk * Math.PI) * 2.5 * hash(i, 3), lerp(dense[2], tw[2], kk)];
      const on = split < 0.5 ? 0.5 + 0.5 * Math.sin(t * 11 + i * 1.7) > 0.4 : awake.includes(e);
      (on ? hotPts : pts).push(p[0], p[1], p[2]);
    }
    this.points(c, pts, pts.length / 3, split < 0.5 ? '#C9C5D1' : '#3A3742', 7, 0.9);
    this.points(c, hotPts, hotPts.length / 3, split < 0.5 ? BONE : '#FFD6E6', 9);
    if (split < 0.6) {
      const a = 1 - split / 0.6;
      this.box3(c, [-3.8, 0.4, -3.8], [3.8, 7.6, 3.8], hexA(BONE, 0.7 * a), 1.6);
      this.text3(c, 'DENSE FFN  ·  EVERY WEIGHT, EVERY TOKEN', wallPl(4.2, [0, 0, 4.2]), 0, -0.9, { size: 0.55, fam: MONOB, color: hexA(BONE, a), align: 'center', track: 0.08 });
    }
    if (split > 0.4) {
      const a = clamp((split - 0.4) / 0.6);
      for (let e = 0; e < 8; e++) {
        const [x, z] = this.tower(e);
        const on = awake.includes(e);
        const g = on ? this.routes[cur]!.gates[awake.indexOf(e)] ?? 0.5 : 0;
        this.box3(c, [x - 1.1, 0.2, z - 0.6], [x + 1.1, 9.4, z + 0.6], hexA(on ? MAG : GRAPH, a), on ? 2.4 : 1.2, { fill: hexA(on ? U.magDark : '#121016', 0.5 * a) });
        const P = this.readable(wallPl(z + 0.7, [x, 0, z + 0.7]));
        // (on the tower's face, under its top: over the top the tags stood in the lyric's line on the back wall)
        this.text3(c, `E${e}`, P, 0, 8.55, { size: 0.9, fam: MONOB, color: hexA(on ? MAG : ASH, a), align: 'center', glow: on ? 14 : 0, glowColor: MAG });
        this.text3(c, on ? `g = ${g.toFixed(2)}` : 'z z z', P, 0, -0.6, { size: 0.55, fam: MONOB, color: hexA(on ? BONE : GRAPH, a), align: 'center' });
      }
      // the router: a ring of light in front; the current token's two beams
      const R: V3 = [0, 3.4, 5.5];
      const ring: V3[] = [];
      for (let k = 0; k <= 40; k++) { const an = (k / 40) * Math.PI * 2; ring.push([R[0] + Math.cos(an) * 1.0, R[1] + Math.sin(an) * 1.0, R[2]]); }
      this.pl3(c, ring, BONE, 2.4, { alpha: a, glow: 10 });
      if (cur >= 0) {
        const wk = clamp((t - (routeW[cur]?.start ?? 0)) / 0.18);
        for (const e of awake) { const [x, z] = this.tower(e); this.glowSeg(c, R, [lerp(R[0], x, wk), lerp(R[1], 6, wk), lerp(R[2], z, wk)], MAG, 2.4, 12, a); }
        this.text3(c, this.routes[cur]!.word, wallPl(R[2] + 0.1, [0, 0, R[2] + 0.1]), 0, 1.6, { size: 0.7, fam: MONOB, color: BONE, align: 'center', alpha: a });
      }
    }
    // the lyric, big, behind it all
    const back = wallPl(-9, [0, 0, -9]);
    this.chunk3(c, L36, t, back, 0, 10.8, { size: 2.4, maxW: 30, slam: 0.4, glow: 18, glowColor: U.ink, breaks: [0, 2, 4, 6] });
    void tOnly;
  }

  // ------------------------------------------------------------------ INT4
  private quant(c: Ctx, t: number) {
    const L37 = this.L[1]!;
    const t4 = this.wd(1, /^4$/), tThr = this.wd(1, /throughput/);
    const p = this.pillar;
    const k1 = this.kicks[0] ?? L37[0]!.start + 0.6, k2 = this.kicks[1] ?? L37[0]!.start + 1.1;
    const real = p ? parseInt(p.hex, 16).toString(2).padStart(32, '0') : '0'.repeat(32);
    const P = wallPl(0, [QX, 0, 0]);
    const cw = 0.62, rh = 0.42, rows = 24, x0 = -16 * cw;
    // after the second kick the four kept columns close up toward the centre
    const close = ease.inOutCubic(clamp((t - k2 - 0.25) / 0.6));
    for (let r = 0; r < rows; r++) {
      const bits = r === 0 ? real : Array.from({ length: 32 }, (_, i) => (i < 1 ? (hash(r, 1) > 0.5 ? '1' : '0') : i < 9 ? (hash(r, i) > 0.35 ? '1' : '0') : hash(r, i, 7) > 0.5 ? '1' : '0')).join('');
      for (let i = 0; i < 32; i++) {
        const shedAt = i >= 18 ? k1 : i >= 4 ? k2 : Infinity;
        const dt = t - shedAt - hash(r, i) * 0.12;
        let x = x0 + i * cw + (i < 4 ? close * (16 * cw - 2 * cw) : 0), y = 1.2 + (rows - 1 - r) * rh, z = 0.02;
        let a = 1;
        if (dt > 0) { y -= 9 * dt * dt; z += 6 * dt * (0.5 + hash(r, i, 3)); x += (hash(r, i, 5) - 0.5) * 6 * dt; a = clamp(1 - dt / 0.9); }
        if (a <= 0) continue;
        const field = i === 0 ? 0 : i < 9 ? 1 : 2;
        const lit = bits[i] === '1';
        const col = field === 0 ? MAG : field === 1 ? BONE : ASH;
        const Pq: Pl = { o: [QX + x, y, z], r: [1, 0, 0], u: [0, 1, 0] };
        this.rect3(c, Pq, 0, 0, cw * 0.88, rh * 0.82, { fill: hexA(lit ? mixHex('#121016', col, 0.55) : '#121016', a), stroke: hexA(col, 0.5 * a), lw: 1 });
        if (r === 0) this.text3(c, i < 4 && t > k2 ? (p?.q4 ?? '0000')[i]! : bits[i]!, Pq, cw * 0.44, rh * 0.41, { size: 0.3, fam: MONOB, color: hexA(BONE, a), align: 'center', mid: true });
      }
    }
    const labA = 1 - clamp((t - k1) / 0.3);
    if (labA > 0) {
      // (SIGN to the left of the wall: over its one-cell field it ran into EXPONENT)
      this.text3(c, 'SIGN', P, x0 - 0.25, 11.8, { size: 0.42, fam: MONOB, color: hexA(MAG, labA), align: 'right' });
      this.text3(c, 'EXPONENT · 8', P, x0 + cw * 1.3, 11.8, { size: 0.42, fam: MONOB, color: hexA(BONE, labA) });
      this.text3(c, 'MANTISSA · 23', P, x0 + cw * 10, 11.8, { size: 0.42, fam: MONOB, color: hexA(ASH, labA) });
    }
    if (t > k2) this.text3(c, `INT4  ·  q = ${p?.q ?? 1}  ·  16 LEVELS  ·  SCALE PER CHANNEL`, P, 0, 0.35, { size: 0.5, fam: MONOB, color: hexA(BONE, clamp((t - k2) / 0.3)), align: 'center' });
    // memory: a bar along the floor shrinking ×8
    const mk = clamp((t - t4.start) / 0.6), mb = lerp(1.23, 0.154, ease.outCubic(mk));
    const G = floorPl(0.02, [QX, 0.02, 3]);
    this.rect3(c, G, -10, -0.5, 20, 1, { fill: '#121016', stroke: hexA(BONE, 0.4), lw: 1 });
    this.rect3(c, G, -10, -0.5, 20 * (mb / 1.23), 1, { fill: mixHex(BONE, MAG, mk) });
    this.text3(c, `MEMORY  ${mb.toFixed(2)} MB${mk > 0.95 ? '   ×8 SMALLER' : ''}`, this.readable(wallPl(3.6, [QX, 0, 3.6])), -10, 0.35, { size: 0.55, fam: MONOB, color: BONE });
    // the throughput gauge: a big dial standing to the right, its needle swung over
    const gk = ease.outBack(clamp((t - tThr.start) / 0.5), 1.4);
    const Gc: Pl = { o: [QX + 13, 3.4, 0.5], r: [1, 0, 0], u: [0, 1, 0] };
    this.ring3(c, Gc, 0, 0, 3.0, hexA(BONE, 0.7), 2, { a0: 0, a1: Math.PI, n: 48 });
    for (let i = 0; i <= 10; i++) { const a = Math.PI - (i / 10) * Math.PI; this.seg(c, at(Gc, Math.cos(a) * 2.6, Math.sin(a) * 2.6), at(Gc, Math.cos(a) * 3.0, Math.sin(a) * 3.0), hexA(BONE, 0.7), 1.6); }
    const na = Math.PI - lerp(0.1, 0.94, gk) * Math.PI;
    this.glowSeg(c, at(Gc, 0, 0), at(Gc, Math.cos(na) * 2.8, Math.sin(na) * 2.8), MAG, 3, 12, 1);
    this.dot3(c, at(Gc, 0, 0), 0.18, BONE);
    this.text3(c, 'TOKENS / s', Gc, 0, -0.9, { size: 0.55, fam: MONOB, color: BONE, align: 'center' });
    // the lyric
    // (higher: from the bits shot the line on the far wall came down onto the field labels over the wall)
    this.chunk3(c, L37, t, wallPl(-6, [QX, 0, -6]), 0, 14.7, { size: 2.2, maxW: 30, slam: 0.4, glow: 18, glowColor: U.ink, breaks: [0, 2, 5, 7] });
  }

  // ------------------------------------------------------------------ LoRA
  private loraSt(c: Ctx, t: number) {
    const L38 = this.L[2]!;
    const tLora = this.wd(2, /LoRA/), tLow = this.wd(2, /low-rank/);
    const frost = clamp((t - tLora.start + 0.05) / 0.6);
    const n = 24, cs = 0.5, ox = LX - 9 - n * cs / 2 + 4, oy = 0.8;
    const P = wallPl(0, [0, 0, 0]);
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
      // the frost spreads from the top-left corner
      const fr = clamp(frost * 2.4 - (q + (n - 1 - r)) / (2 * n) * 1.4);
      // (every cell learning: values flicker 12 times a second until the frost reaches them)
      const v = fr >= 1 ? hash(r, q, 99) : hash(r, q, Math.floor(t * 12));
      const col = mixHex(mixHex('#141218', BONE, 0.15 + 0.6 * v), mixHex('#1A1C22', ICE, 0.35 + 0.15 * v), fr);
      this.rect3(c, P, ox + q * cs, oy + r * cs, cs * 0.9, cs * 0.9, { fill: col });
    }
    this.text3(c, frost < 0.5 ? 'W  ·  4096 × 4096  ·  16,777,216 TRAINABLE' : 'W  ·  FROZEN', P, ox, oy + n * cs + 0.45, { size: 0.55, fam: MONOB, color: frost < 0.5 ? BONE : ICE });
    // the patch: B (tall, thin), A (wide, thin), ΔW = B·A over W
    const pk = ease.outCubic(clamp((t - tLow.start + 0.25) / 0.5));
    if (pk > 0) {
      const bx = ox + n * cs + 1.0, ay = oy + n * cs - 0.9;
      this.rect3(c, P, bx, oy + n * cs * (1 - pk), 0.7, n * cs * pk, { fill: U.magDark, stroke: MAG, lw: 2 });
      this.text3(c, 'B', P, bx + 0.35, oy + n * cs + 0.45, { size: 0.7, fam: MONOB, color: MAG, align: 'center' });
      this.rect3(c, P, bx + 1.4, ay, n * cs * pk, 0.7, { fill: U.magDark, stroke: MAG, lw: 2 });
      this.text3(c, 'A', P, bx + 1.4 + n * cs * pk + 0.3, ay + 0.15, { size: 0.7, fam: MONOB, color: MAG });
      this.text3(c, '65,536 TRAINABLE  ·  0.39 %', P, bx + 1.4, ay - 0.9, { size: 0.5, fam: MONOB, color: BONE });
      if (this.lora) {
        this.img3(c, this.lora, 912, 64, { o: [0, 0, 0.05], r: [1, 0, 0], u: [0, 1, 0] }, ox, oy + n * cs * 0.42, n * cs, n * cs * (64 / 912) * 2.2, { n: 4, alpha: 0.85 * pk });
        this.text3(c, 'ΔW = B · A   (RANK 8)', P, ox, oy + n * cs * 0.42 - 0.8, { size: 0.55, fam: MONOB, color: MAG, alpha: pk });
      }
    }
    this.chunk3(c, L38, t, wallPl(-6, [LX, 0, -6]), 0, 13.4, { size: 2.4, maxW: 30, slam: 0.4, glow: 18, glowColor: U.ink, breaks: [0, 2, 4, 6] });
  }

  // ------------------------------------------------------------------ in-context
  private icl(c: Ctx, t: number) {
    const L39 = this.L[3]!;
    const tPrompt = this.wd(3, /prompt/), tCtx = this.wd(3, /context/), tNo = this.wd(3, /^no$/);
    // θ, frozen: a block of ice-grey glass (drawn first: the ribbon lies on the floor in front of it)
    const bx = CX + 7;
    this.box3(c, [bx - 2.2, 0, -3.2], [bx + 2.2, 5.2, -0.8], hexA(ICE, 0.9), 1.6, { fill: '#1A1C22' });
    for (let i = 0; i < 7; i++) this.seg(c, [bx - 2.2, 0.6 + i * 0.68, -0.79], [bx + 2.2, 0.6 + i * 0.68, -0.79], hexA(ICE, 0.45), 1);
    this.text3(c, 'θ  ·  FROZEN', wallPl(-0.78, [bx, 0, -0.78]), 0, 5.7, { size: 0.65, fam: MONOB, color: ICE, align: 'center' });
    // the context: a long ribbon of tokens running away along the floor toward the frozen block
    const rows: [string, string][] = [['STATE OF THE ART', 'BASELINE'], ['TOP OF THE LEADERBOARD', 'BASELINE'], ['ALL YOU NEED', 'BASELINE'], ['ATTENTION', '?']];
    // (all four rows in front of the block — the first used to run under it — and the answers in a column clear of
    // the longest prompt: TOP OF THE LEADERBOARD ran into its → BASELINE)
    const R = floorPl(0.02, [CX - 4, 0.02, 3]);
    this.rect3(c, R, -2, -1.9, 14.9, 5.7, { fill: '#121016', stroke: hexA(BONE, 0.5), lw: 1.4 });
    rows.forEach(([a, b], i) => {
      const ti = tPrompt.start - 0.25 + i * 0.22;
      if (t < ti) return;
      const y = 3.3 - i * 1.4;
      const k = ease.outCubic(clamp((t - ti) / 0.25));
      this.text3(c, a, R, -1.2, y, { size: 0.72 * k, fam: MONOB, color: BONE });
      const fill = i === 3 ? (t > tCtx.end - 0.1 ? 'BASELINE' : '▮') : b;
      this.text3(c, '→  ' + fill, R, 8.1, y, { size: 0.72 * k, fam: MONOB, color: i === 3 ? MAG : ASH, alpha: i === 3 && fill === '▮' ? (Math.floor(t * 4) % 2 ? 1 : 0.2) : 1, glow: i === 3 && fill !== '▮' ? 14 : 0, glowColor: MAG });
    });
    // ∇θ L drops past it, through the floor: nothing catches it
    if (t > tNo.start - 0.15) {
      const dt = t - (tNo.start - 0.15);
      // (beside the block, not through the lyric; NOT COMPUTED on the block's face, clear of the context ribbon)
      const y = 9.5 - 4.5 * dt * dt - 1.5 * dt;
      const P = wallPl(0.6, [bx + 5.0, 0, 0.6]);
      this.text3(c, '∇θ L', P, 0, y, { size: 2.2, fam: HEAVY, color: MAG, align: 'center', mid: true, glow: 20, glowColor: U.ink, alpha: clamp(1 - (dt - 1.4) / 0.4) });
      if (y < 5.2) this.text3(c, 'NOT COMPUTED', wallPl(-0.78, [bx, 0, -0.78]), 0, 2.6, { size: 0.6, fam: MONOB, color: BONE, align: 'center', alpha: clamp((5.2 - y) / 2) });
    }
    this.chunk3(c, L39, t, wallPl(-7, [CX, 0, -7]), 0, 7.4, { size: 2.2, maxW: 26, slam: 0.4, glow: 18, glowColor: U.ink, breaks: [0, 4, 6, 8] });
  }
}
