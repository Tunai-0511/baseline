// v3 L04–L05 ("Hand-tuned SIFT and HOG, every feature carved by hand, / convolution learned the filters that nobody
// planned"): CARVED / LEARNED. A copper plate engraved with the HOG pedestrian (64 × 128 window): a burin carves the
// 9-bin orientation glyph of every 8 × 8 cell by hand (the real HOG of the figure, data/hog_sift.json), a SIFT keypoint
// is set on the head with its 4 × 4 × 8 = 128-D descriptor beside the plate, the hand-tuned constants on a card. Then a
// cool light takes over: an 11 × 11 kernel slides across the plate and a feature map fills in front of it, and the 96
// conv1 filters of a real training run (data/conv1_seq.png, 45 snapshots) grow out of noise on the wall: nobody planned
// them. Style: warm copper engraving for the hand; cyan glass and colour for the learned.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, wallPl, floorPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, vlerp, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BG = '#0B0A0D', COP = '#7A7682', COPD = '#2A2731', COPL = '#C9C5D1', BONE = '#EDEAF2', STEEL = '#9A96A3', CYAN = '#FF2E7E', ICE = '#EDEAF2';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), MONO = F.mono(500), MONOB = F.mono(700);
const PX = 0.1; // world units per window pixel
const IMG = { x0: -3.2, y0: 6.4 }; // window (0,0) top-left on the plate
const p2w = (u: number, v: number): [number, number] => [IMG.x0 + u * PX, IMG.y0 - v * PX];
const WALL = { x: 13.0, y: -4.2, w: 15.6, h: 10.4 }; // filter wall (plane coords on z = -1)

interface Hog { cells: number[][][]; rays: number[] }
interface Sift { keypoint: [number, number]; orientation_deg: number; descriptor: number[] }
type Caps = Record<string, { a: [number, number]; b: [number, number]; r: number }>;

export default class Feat extends VScene {
  private L4!: Word[]; private L5!: Word[];
  private plate: HTMLCanvasElement | null = null;
  private fmap: HTMLCanvasElement | null = null;
  private seq: ImageBitmap | null = null;
  private hog: Hog | null = null;
  private sift: Sift | null = null;
  private carve: { r: number; c: number; t: number }[] = [];
  private acc: number[] = []; private step: number[] = []; private epoch: number[] = [];

  override async init() {
    this.bg = BG;
    this.env = { eq: ['hog', 'sift', 'conv', 'convlayer', 'sgd', 'relu'], seed: 3 }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    this.L4 = ly.lines[4]!.words; this.L5 = ly.lines[5]!.words;
    const w = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const t0 = this.ctx.start, tSift = w(this.L4, /SIFT/).start, tHog = w(this.L4, /HOG/).start, tEvery = w(this.L4, /every/).start, tHand = w(this.L4, /hand,/);
    const tConv = this.L5[0]!.start, tLearn = w(this.L5, /learned/).start, tNobody = w(this.L5, /nobody/).start, end = this.ctx.end;
    try {
      const d = await (await fetch('data/hog_sift.json')).json();
      this.hog = { cells: d.hog.cells, rays: d.hog.ray_angles_deg };
      this.sift = d.sift;
      this.plate = this.engrave(d.capsules as Caps);
      this.fmap = this.featureMap(d.relief.height as number[][]);
      const s = await (await fetch('data/conv1_seq.json')).json();
      this.acc = s.test_acc; this.step = s.step; this.epoch = s.epoch;
      this.seq = await createImageBitmap(await (await fetch('data/conv1_seq.png')).blob());
    } catch { /* plates without data still draw their frame */ }
    // carving schedule: the non-empty cells in raster order; the head first, slowly, then faster and faster
    const cells: { r: number; c: number }[] = [];
    if (this.hog) for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) if (this.hog.cells[r]![c]!.reduce((a, b) => a + b, 0) > 0.08) cells.push({ r, c });
    const nHead = Math.min(10, cells.length);
    cells.forEach((cl, k) => {
      const tk = k < nHead ? lerp(t0 + 0.12, tHog - 0.1, k / nHead) : lerp(tHog, tHand.end - 0.25, Math.pow((k - nHead) / Math.max(1, cells.length - nHead - 1), 0.85));
      this.carve.push({ ...cl, t: tk });
    });
    this.rig = new Rig([
      // (far enough back and aimed high enough that HAND-TUNED on the plate's top frame is in the shot)
      { t0, name: 'head', key: (t) => { const k = ease.inOutQuad(clamp((t - t0) / (tSift - t0))); return K([lerp(2.4, 1.6, k), lerp(6.2, 5.8, k), lerp(11.2, 11.8, k)], [0, lerp(5.7, 5.3, k), 0], 42, 0.03); } },
      { t0: tSift, snap: 0.3, name: 'sift', key: (t) => { const k = ease.outCubic(clamp((t - tSift) / (tHog - tSift))); return K([lerp(-3.0, -4.2, k), lerp(4.6, 4.0, k), lerp(11.5, 12.5, k)], [lerp(-4.8, -5.4, k), 3.6, 0], 42, -0.02); } },
      { t0: tHog, snap: 0.35, name: 'plate', key: (t) => { const k = ease.inOutQuad(clamp((t - tHog) / (tConv - tHog))); return K([lerp(1.0, -0.6, k), lerp(0.6, -0.2, k), lerp(26.0, 23.5, k)], [lerp(0.4, 0.0, k), -0.5, 0], 42); } },
      { t0: tConv - 0.05, snap: 0.45, name: 'conv', key: (t) => { const k = ease.inOutCubic(clamp((t - tConv) / (tLearn - tConv))); return K([lerp(10.5, 9.0, k), lerp(3.2, 2.4, k), lerp(14.5, 15.5, k)], [lerp(2.0, 3.2, k), 0.4, 1.0], 44, -0.02); } },
      { t0: tLearn - 0.05, snap: 0.5, name: 'wall', key: (t) => { const k = ease.inOutQuad(clamp((t - tLearn) / (tNobody - tLearn))); return K([lerp(16.0, 19.0, k), lerp(1.8, 1.2, k), lerp(14.0, 13.0, k)], [lerp(18.4, 20.4, k), 0.6, -1], 44, -0.02); } },
      { t0: tNobody, snap: 0.3, name: 'nobody', key: (t) => { const k = ease.outCubic(clamp((t - tNobody) / (end - tNobody))); return K([lerp(20.6, 20.8, k), lerp(0.8, 0.5, k), lerp(12.6, 11.6, k)], [20.8, lerp(0.2, -0.1, k), -1], 46); } },
    ], [{ t: tSift, amp: 0.6 }, { t: tHog, amp: 0.8 }, { t: tConv, amp: 1.0, dir: 'h' }, { t: tNobody, amp: 0.9 }], 0.8, 31);
    void tEvery;
  }

  /** the plate image: copper with horizontal hatching; the pedestrian filled dark with crossed hatching and a bright edge */
  private engrave(caps: Caps): HTMLCanvasElement {
    const S = 10, cv = document.createElement('canvas');
    cv.width = 64 * S; cv.height = 128 * S;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#A3582A'; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = 'rgba(70,30,10,0.55)'; c.lineWidth = 1.6;
    for (let y = 3; y < cv.height; y += 7) { c.beginPath(); c.moveTo(0, y + Math.sin(y * 0.05) * 1.5); c.lineTo(cv.width, y - Math.sin(y * 0.03) * 1.5); c.stroke(); }
    const cap = (ctx: CanvasRenderingContext2D, grow: number) => {
      for (const k of Object.keys(caps)) {
        const q = caps[k]!;
        ctx.lineCap = 'round'; ctx.lineWidth = (q.r * 2 + grow) * S;
        ctx.beginPath(); ctx.moveTo(q.a[0] * S, q.a[1] * S); ctx.lineTo(q.b[0] * S, q.b[1] * S); ctx.stroke();
      }
    };
    // bright engraved edge, then the dark figure inside it
    c.strokeStyle = '#F4C79E'; cap(c, 0.7);
    const fig = document.createElement('canvas'); fig.width = cv.width; fig.height = cv.height;
    const f = fig.getContext('2d')!;
    f.strokeStyle = '#3A1708'; cap(f, 0);
    f.globalCompositeOperation = 'source-atop';
    f.strokeStyle = 'rgba(232,150,95,0.55)'; f.lineWidth = 1.4;
    for (let k = -cv.height; k < cv.width + cv.height; k += 9) { f.beginPath(); f.moveTo(k, 0); f.lineTo(k - cv.height, cv.height); f.stroke(); }
    f.strokeStyle = 'rgba(232,150,95,0.3)';
    for (let k = -cv.height; k < cv.width + cv.height; k += 13) { f.beginPath(); f.moveTo(k, 0); f.lineTo(k + cv.height, cv.height); f.stroke(); }
    c.drawImage(fig, 0, 0);
    return cv;
  }
  /** a real convolution of the relief with a vertical-edge kernel, stride 2 → 32 × 64, shown as a copper-to-ice map */
  private featureMap(hgt: number[][]): HTMLCanvasElement {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 64;
    const c = cv.getContext('2d')!;
    const im = c.createImageData(32, 64);
    const K = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    for (let j = 0; j < 64; j++) for (let i = 0; i < 32; i++) {
      let s = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const y = clamp(j * 2 + a, 0, 127), x = clamp(i * 2 + b, 0, 63);
        s += (hgt[y]?.[x] ?? 0) * K[a + 1]![b + 1]!;
      }
      const v = clamp(Math.abs(s) * 0.9);
      const o = (j * 32 + i) * 4;
      im.data[o] = Math.round(lerp(10, 190, v)); im.data[o + 1] = Math.round(lerp(22, 243, v)); im.data[o + 2] = Math.round(lerp(34, 255, v)); im.data[o + 3] = 255;
    }
    c.putImageData(im, 0, 0);
    return cv;
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L4 = this.L4, L5 = this.L5;
    const w = (L: Word[], re: RegExp) => L.find((x) => re.test(x.w))!;
    const t0 = this.ctx.start, tSift = w(L4, /SIFT/), tHogW = w(L4, /HOG/), tEvery = w(L4, /every/), tCarved = w(L4, /carved/);
    const tConv = L5[0]!, tLearn = w(L5, /learned/), tFilters = w(L5, /filters/), tNobody = w(L5, /nobody/), tPlanned = w(L5, /planned/);
    const P = wallPl(0);
    const cool = ease.inOutCubic(clamp((t - tConv.start + 0.1) / 0.6)); // the light turns from copper to ice
    const kick = this.beatPulse(t, 0.08);

    // ------------------------------------------------ workshop: back wall guilloché, bench, light pools
    pool(c, W * 0.48, H * 0.5, 1000, mixHex('#5A2A10', '#0E3550', cool), 0.55);
    const back = wallPl(-7);
    for (let i = 0; i < 26; i++) this.ring3(c, back, -6, 2, 3 + i * 1.1, hexA(mixHex('#3A1D0C', '#123044', cool), 0.8), 1, { n: 90 });
    this.grid3(c, floorPl(-8.2), -30, 40, -12, 14, 1.5, mixHex('#3B1E0D', '#12334A', cool), 1, { alpha: 0.8, fog: [10, 40] });
    // ------------------------------------------------ the plate
    this.rect3(c, P, -4.2, -7.2, 8.4, 15.0, { fill: '#2A160B', stroke: hexA(COPL, 0.6), lw: 1.5 });
    this.rect3(c, P, -3.4, -6.6, 6.8, 13.2, { fill: '#7A3E1C' });
    if (this.plate) this.img3(c, this.plate, this.plate.width, this.plate.height, P, -3.2, -6.4, 6.4, 12.8, { n: 8 });
    // window grid (8 × 8 cells) faint
    const gl: [V3, V3][] = [];
    for (let i = 0; i <= 8; i++) { const [x] = p2w(i * 8, 0); gl.push([at(P, x, -6.4, 0.01), at(P, x, 6.4, 0.01)]); }
    for (let j = 0; j <= 16; j++) { const [, y] = p2w(0, j * 8); gl.push([at(P, -3.2, y, 0.01), at(P, 3.2, y, 0.01)]); }
    this.segs(c, gl, hexA(COPL, 0.35), 1);
    // ------------------------------------------------ HOG glyphs, carved cell by cell, and the burin
    let cur: { r: number; c: number; t: number } | null = null, nxt: { r: number; c: number; t: number } | null = null;
    if (this.hog) {
      const lines: [V3, V3][][] = [[], [], [], []], hotLines: [V3, V3][] = [];
      for (let k = 0; k < this.carve.length; k++) {
        const cl = this.carve[k]!;
        if (t < cl.t) { if (!nxt) nxt = cl; continue; }
        cur = cl;
        const [cx, cy] = p2w(cl.c * 8 + 4, cl.r * 8 + 4);
        const age = t - cl.t;
        const grow = clamp(age / 0.12);
        const hist = this.hog.cells[cl.r]![cl.c]!;
        const mx = Math.max(...hist);
        for (let b = 0; b < 9; b++) {
          const v = hist[b]! / (mx || 1);
          if (v < 0.12) continue;
          const a = (this.hog.rays[b]! * Math.PI) / 180;
          const L = 0.39 * grow;
          const sg: [V3, V3] = [at(P, cx - Math.cos(a) * L, cy - Math.sin(a) * L, 0.02), at(P, cx + Math.cos(a) * L, cy + Math.sin(a) * L, 0.02)];
          if (age < 0.25) hotLines.push(sg); else lines[Math.min(3, Math.floor(v * 4))]!.push(sg);
        }
      }
      const fadeGlyph = 1 - 0.5 * cool;
      lines.forEach((ls, i) => this.segs(c, ls, hexA('#FFF0DC', fadeGlyph * (0.3 + 0.23 * i)), 2.4));
      c.save(); c.globalCompositeOperation = 'lighter'; this.segs(c, hotLines, '#FFFFFF', 3.2); this.segs(c, hotLines, hexA('#FFB070', 0.4), 9); c.restore();
    }
    // the burin rides from cell to cell until the convolution takes over
    if (cur && t < tConv.start + 0.2) {
      let [bx, by] = p2w(cur.c * 8 + 4, cur.r * 8 + 4);
      if (nxt) { const [nx, ny] = p2w(nxt.c * 8 + 4, nxt.r * 8 + 4); const k = ease.inOutQuad(clamp((t - cur.t) / Math.max(0.02, nxt.t - cur.t))); bx = lerp(bx, nx, k); by = lerp(by, ny, k); }
      const gone = clamp((t - tConv.start + 0.3) / 0.4);
      this.burin(c, at(P, bx, by, 0.03), gone);
    }
    // ------------------------------------------------ SIFT: the keypoint on the head, a few more, and the descriptor
    if (this.sift && t > tSift.start - 0.05) this.siftDraw(c, t, P, tSift.start, cool);
    // ------------------------------------------------ the hand-tuned constants card (right of the plate)
    {
      const a = clamp((t - tHogW.start) / 0.4) * (1 - cool);
      if (a > 0) {
        const C = wallPl(-0.4);
        this.rect3(c, C, 5.0, -3.8, 6.6, 9.4, { fill: hexA('#21110A', 0.92 * a), stroke: hexA(COPL, 0.7 * a), lw: 1.3 });
        const rows = ['CELL      8 × 8 PX', 'BLOCK     2 × 2 CELLS', 'BINS      9 · 0–180°', 'NORM      L2-HYS 0.2', 'WINDOW    64 × 128', 'σ₀        1.6', 'CONTRAST  0.03', 'EDGE r    10'];
        rows.forEach((s, i) => {
          const ti = tHogW.start + 0.15 + i * 0.16;
          if (t < ti) return;
          this.text3(c, s, C, 5.4, 4.3 - i * 0.98, { size: 0.42, fam: MONO, color: hexA(i < 5 ? BONE : COPL, a) });
          this.seg(c, at(C, 5.4, 4.3 - i * 0.98 - 0.32), at(C, 11.2, 4.3 - i * 0.98 - 0.32), hexA(COPL, 0.25 * a), 1);
        });
        this.text3(c, 'TUNED BY HAND', C, 5.4, -3.3, { size: 0.46, fam: MONOB, color: hexA(COP, a) });
      }
    }
    // ------------------------------------------------ convolution: kernel, pyramid, feature map
    if (t > tConv.start - 0.05) this.convDraw(c, t, P, tConv.start, tLearn.start);
    // ------------------------------------------------ the filter wall
    if (t > tLearn.start - 0.6) this.wall(c, t, tLearn.start, tNobody.start);
    // ------------------------------------------------ lyric type
    const top = wallPl(0.02);
    // HAND-TUNED carved into the plate's top frame (outline first, then the copper fill)
    {
      const hw = L4[0]!;
      const k = clamp((t - hw.start) / (hw.end - hw.start));
      this.text3(c, 'HAND-TUNED', top, 0, 8.25, { size: 1.0, fam: WIDE, align: 'center', stroke: COPL, strokeW: 1.4, alpha: 1 - 0.6 * cool, each: (i, _ch, n) => { const ki = clamp(k * n * 1.3 - i); if (ki <= 0) return null; return { color: ki >= 1 ? (t < hw.end ? U.mag : BONE) : undefined }; } });
    }
    // SIFT over the descriptor panel; HOG over the constants card
    if (t > tSift.start - 0.03) {
      const k = ease.outBack(clamp((t - tSift.start) / 0.22), 2);
      this.text3(c, 'SIFT', wallPl(-0.4), -9.3, 6.2, { size: 1.9 * k, fam: WIDE, color: t < tSift.end ? U.mag : BONE, align: 'center', alpha: 1 - 0.6 * cool });
    }
    const andW = w(L4, /^and$/);
    // (just after SIFT, where the camera is when it is sung — at the far end, by HOG, it was out of the shot)
    if (t > andW.start - 0.03) this.text3(c, 'AND', wallPl(-0.4), -5.4, 6.2, { size: 0.8, fam: HEAVY, color: t < andW.end ? U.mag : hexA(BONE, 0.85), alpha: 1 - 0.6 * cool });
    if (t > tHogW.start - 0.03) {
      const k = ease.outBack(clamp((t - tHogW.start) / 0.22), 2);
      this.text3(c, 'HOG', wallPl(-0.4), 8.9, 6.2, { size: 1.9 * k, fam: WIDE, color: t < tHogW.end ? U.mag : BONE, align: 'center', alpha: 1 - 0.6 * cool });
    }
    // EVERY FEATURE / CARVED BY HAND on the plaque under the plate
    if (t > tEvery.start - 0.05) {
      const a = 1 - 0.7 * cool;
      this.rect3(c, top, -5.4, -9.75, 10.8, 2.35, { fill: hexA('#21110A', 0.9 * a), stroke: hexA(COPL, 0.6 * a), lw: 1.2 });
      const i0 = L4.indexOf(tEvery), i1 = L4.indexOf(tCarved);
      this.say3(c, L4.slice(i0, i1), t, top, 0, -8.35, { size: 0.9, slam: 0.3, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, alpha: a });
      this.say3(c, L4.slice(i1), t, top, 0, -9.4, { size: 0.9, slam: 0.3, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, alpha: a, rise: 0.25 });
    }
    // CONVOLUTION over the feature map; LEARNED THE FILTERS over the wall; NOBODY PLANNED under it
    const fm = this.fmPlane();
    if (t > tConv.start - 0.03) {
      const p = clamp((t - tConv.start) / (tConv.end - tConv.start));
      this.text3(c, 'CONVOLUTION', fm, 1.6, 7.2, { size: 1.15, fam: WIDE, align: 'center', each: (i, _ch, n) => ((i + 0.5) / n <= p * 1.4 + 0.05 ? { color: t < tConv.end ? U.mag : ICE } : null), glow: 14, glowColor: U.ink, alpha: 1 - clamp((t - tNobody.start) / 0.5) * 0.6 });
    }
    const WT = wallPl(-0.7);
    const mid = WALL.x + WALL.w / 2;
    if (t > tLearn.start - 0.03) this.say3(c, [tLearn, w(L5, /^the$/), tFilters], t, WT, mid, WALL.y + WALL.h - 1.9, { size: 1.35, slam: 0.35, fam: WIDE, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, rise: 0.3, glow: 24, glowColor: '#000000', alpha: 1 - clamp((t - tNobody.start) / 0.3) });
    if (t > tNobody.start - 0.25) {
      const thatW = w(L5, /that/);
      // (above NOBODY's cap line, not tucked into it)
      this.say3(c, [thatW], t, WT, mid, WALL.y + WALL.h / 2 + 1.75, { size: 0.7, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, glow: 18, glowColor: '#000000' });
    }
    if (t > tNobody.start - 0.03) {
      const k = ease.outBack(clamp((t - tNobody.start) / 0.25), 1.8);
      this.text3(c, 'NOBODY', WT, mid, WALL.y + WALL.h / 2 - 0.6, { size: 2.15 * k, fam: WIDE, color: t < tNobody.end ? U.mag : BONE, align: 'center', glow: 30, glowColor: '#000000' });
      if (t > tPlanned.start - 0.03) {
        const k2 = ease.outBack(clamp((t - tPlanned.start) / 0.25), 1.8);
        this.text3(c, 'PLANNED', WT, mid, WALL.y + WALL.h / 2 - 2.55, { size: 2.15 * k2, fam: WIDE, color: t < tPlanned.end ? U.mag : '#FFFFFF', align: 'center', glow: 30, glowColor: '#000000' });
      }
    }
    frameMarks(c, U.ash, { tl: cool < 0.5 ? 'BASELINE · PLATE 03 · FEATURES BY HAND' : 'BASELINE · PLATE 03 · FEATURES LEARNED', tr: cool < 0.5 ? 'HOG 3,780-D · SIFT 128-D' : 'conv1 · 96 × 11 × 11 × 3', bl: '2004 — 2012', br: tc(t), alpha: 0.6 });
    return { bloom: 0.6, bloomThreshold: 0.6, halation: 0.18, ca: 0.3 + 1.0 * hot(t, tConv.start, 0.1), grain: 0.05, vignette: 0.32, zoom: 1 + 0.01 * kick };
  }

  private burin(c: Ctx, tip: V3, gone: number) {
    // a steel shaft from the tip up and out toward the camera, a mushroom handle at its end
    const dir: V3 = [0.62, 0.7, 0.35];
    const off = gone * 3;
    const T: V3 = [tip[0] + dir[0] * off, tip[1] + dir[1] * off, tip[2] + dir[2] * off];
    const E: V3 = [T[0] + dir[0] * 3.0, T[1] + dir[1] * 3.0, T[2] + dir[2] * 3.0];
    const side: V3 = [0.09, -0.12, 0];
    this.fill3(c, [T, [E[0] + side[0], E[1] + side[1], E[2]], [E[0] - side[0], E[1] - side[1], E[2]]], '#7E8994', { stroke: STEEL, lw: 1.2, alpha: 1 - gone });
    const q = this.pr(E);
    if (q.z > this.near && gone < 1) {
      c.save(); c.globalAlpha *= 1 - gone;
      const r = 0.3 * q.k;
      const g = c.createRadialGradient(q.x - r * 0.3, q.y - r * 0.3, r * 0.1, q.x, q.y, r);
      g.addColorStop(0, '#E7C29A'); g.addColorStop(1, '#6B3A1B');
      c.fillStyle = g; c.beginPath(); c.ellipse(q.x, q.y, r, r * 0.8, -0.6, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // sparks of copper at the tip while carving
    if (gone < 0.5) {
      const p = this.pr(T);
      if (p.z > this.near) { c.save(); c.globalCompositeOperation = 'lighter'; const R = 26; const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, R); g.addColorStop(0, 'rgba(255,200,140,0.8)'); g.addColorStop(1, 'rgba(255,200,140,0)'); c.fillStyle = g; c.fillRect(p.x - R, p.y - R, 2 * R, 2 * R); c.restore(); }
    }
  }

  private siftDraw(c: Ctx, t: number, P: Pl, t0: number, cool: number) {
    const s = this.sift!;
    const a = 1 - 0.6 * cool;
    const kp = p2w(s.keypoint[0], s.keypoint[1]);
    const grow = ease.outBack(clamp((t - t0) / 0.3), 1.5);
    const R = 0.95 * grow;
    const ori = (s.orientation_deg * Math.PI) / 180;
    this.ring3(c, P, kp[0], kp[1], R, hexA('#FFE36E', a), 2.4, { n: 48 });
    this.seg(c, at(P, kp[0], kp[1], 0.03), at(P, kp[0] + Math.cos(ori) * R, kp[1] + Math.sin(ori) * R, 0.03), hexA('#FFE36E', a), 2.4);
    // more keypoints on hands, knees and feet, set one by one
    const more: [number, number, number][] = [[19, 65, 0.5], [47.5, 63, 0.45], [24.5, 88, 0.6], [39, 88, 0.55], [15.5, 113, 0.42], [41.5, 111, 0.4], [32, 47, 0.75]];
    more.forEach(([u, v, r], i) => {
      const ti = t0 + 0.12 + i * 0.07;
      if (t < ti) return;
      const g = ease.outBack(clamp((t - ti) / 0.2), 1.5);
      const [x, y] = p2w(u, v);
      const o = hash(i, 5) * Math.PI * 2;
      this.ring3(c, P, x, y, r * g, hexA('#FFE36E', 0.85 * a), 1.6, { n: 32 });
      this.seg(c, at(P, x, y, 0.03), at(P, x + Math.cos(o) * r * g, y + Math.sin(o) * r * g, 0.03), hexA('#FFE36E', 0.85 * a), 1.6);
    });
    // the descriptor panel (left): 4 × 4 subregions × 8 orientation bins = 128 numbers
    const D = wallPl(-0.4);
    const ox = -11.4, oy = -0.6, cs = 1.6;
    const pa = clamp((t - t0 - 0.1) / 0.4) * a;
    if (pa <= 0) return;
    this.rect3(c, D, ox - 0.3, oy - 0.3, cs * 4 + 0.6, cs * 4 + 0.6, { fill: hexA('#21110A', 0.92 * pa), stroke: hexA(COPL, 0.7 * pa), lw: 1.3 });
    const segs: [V3, V3][] = [];
    for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
      const cx = ox + q * cs + cs / 2, cy = oy + (3 - r) * cs + cs / 2;
      const ti = t0 + 0.2 + (r * 4 + q) * 0.03;
      if (t < ti) continue;
      for (let b = 0; b < 8; b++) {
        const v = s.descriptor[(r * 4 + q) * 8 + b]!;
        const ang = ori + (b * Math.PI) / 4;
        const L = Math.min(0.72, v * 2.6);
        segs.push([at(D, cx, cy, 0.02), at(D, cx + Math.cos(ang) * L, cy + Math.sin(ang) * L, 0.02)]);
      }
    }
    const grid: [V3, V3][] = [];
    for (let i = 0; i <= 4; i++) { grid.push([at(D, ox + i * cs, oy), at(D, ox + i * cs, oy + 4 * cs)]); grid.push([at(D, ox, oy + i * cs), at(D, ox + 4 * cs, oy + i * cs)]); }
    this.segs(c, grid, hexA(COPL, 0.35 * pa), 1);
    this.segs(c, segs, hexA('#FFE36E', pa), 2);
    this.text3(c, '4 × 4 × 8 = 128-D', D, ox, oy - 1.0, { size: 0.42, fam: MONOB, color: hexA(BONE, pa) });
    // leader from the keypoint to the panel
    this.seg(c, at(P, kp[0] - R, kp[1], 0.03), at(D, ox + cs * 4 + 0.3, oy + cs * 2, 0.02), hexA('#FFE36E', 0.5 * pa), 1.2, { dash: [6, 6] });
  }

  /** the feature-map plane: in front of the plate and to its right, turned to the camera */
  private fmPlane(): Pl { return { o: [4.4, -3.2, 2.6], r: [0.97, 0, -0.26], u: [0, 1, 0] }; }

  private convDraw(c: Ctx, t: number, P: Pl, t0: number, tLearn: number) {
    const fm = this.fmPlane();
    const a = clamp((t - t0 + 0.05) / 0.3);
    const prog = ease.inQuad(clamp((t - t0) / (tLearn - t0 + 0.6)));
    const N = 32 * 64, n = Math.floor(prog * N);
    // the feature map: revealed row by row up to the kernel's position
    const rows = Math.floor(n / 32), colsInRow = n % 32;
    this.rect3(c, fm, -0.2, -0.2, 3.6, 6.8, { fill: hexA('#06141D', 0.95 * a), stroke: hexA(CYAN, 0.8 * a), lw: 1.4 });
    if (this.fmap && rows > 0) this.img3(c, this.fmap, 32, 64, fm, 0, 6.4 - rows * 0.1, 3.2, rows * 0.1, { sy: 0, sh: rows, n: 4, smooth: false, alpha: a });
    if (this.fmap && colsInRow > 0) this.img3(c, this.fmap, 32, 64, fm, 0, 6.4 - (rows + 1) * 0.1, colsInRow * 0.1, 0.1, { sy: rows, sh: 1, sw: colsInRow, n: 1, smooth: false, alpha: a });
    this.text3(c, '32 × 64 · STRIDE 2', fm, 0, -0.75, { size: 0.32, fam: MONO, color: hexA(ICE, 0.8 * a) });
    // what the kernel computes, typeset under the map
    this.eqFit(c, 'conv', fm, 1.7, -1.75, 4.6, 0.75, { color: ICE, alpha: 0.9 * a });
    if (n >= N) return;
    // the kernel on the plate (11 × 11 px) and the pyramid to the output pixel
    const i = n % 32, j = Math.floor(n / 32);
    const cx = i * 2, cy = j * 2;
    const [kx, ky] = p2w(cx - 5.5, cy - 5.5);
    const k0 = at(P, kx, ky, 0.05), k1 = at(P, kx + 1.1, ky, 0.05), k2 = at(P, kx + 1.1, ky - 1.1, 0.05), k3 = at(P, kx, ky - 1.1, 0.05);
    this.fill3(c, [k0, k1, k2, k3], hexA(CYAN, 0.18 * a), { stroke: hexA(CYAN, a), lw: 2 });
    const out = at(fm, i * 0.1 + 0.05, 6.4 - j * 0.1 - 0.05, 0.02);
    for (const k of [k0, k1, k2, k3]) this.seg(c, k, out, hexA(CYAN, 0.6 * a), 1.3);
    this.dot3(c, out, 0.07, ICE);
    // (under the kernel, and only once CONVOLUTION is written: in the plate's top rows it ran into the word)
    const la = a * clamp((t - (t0 + 1.4)) / 0.3);
    if (la > 0) this.text3(c, '11 × 11', P, kx, ky - 1.55, { size: 0.32, fam: MONOB, color: hexA(ICE, la) });
  }

  private wall(c: Ctx, t: number, tLearn: number, tNobody: number) {
    const WP = wallPl(-1);
    const a = clamp((t - (tLearn - 0.6)) / 0.5);
    this.rect3(c, WP, WALL.x - 0.5, WALL.y - 0.5, WALL.w + 1.0, WALL.h + 1.0, { fill: hexA('#030A10', 0.95 * a), stroke: hexA(CYAN, 0.6 * a), lw: 1.4 });
    if (!this.seq) return;
    // training snapshot index: noise at "learned", the final filters by "nobody", held after
    const fr = 44 * ease.inOutQuad(clamp((t - tLearn) / (tNobody - tLearn + 0.25)));
    const f0 = Math.floor(fr), f1 = Math.min(44, f0 + 1), k = fr - f0;
    this.img3(c, this.seq, 156, 104 * 45, WP, WALL.x, WALL.y, WALL.w, WALL.h, { sy: 104 * f0, sh: 104, sw: 156, n: 6, smooth: false, alpha: a });
    if (k > 0.02) this.img3(c, this.seq, 156, 104 * 45, WP, WALL.x, WALL.y, WALL.w, WALL.h, { sy: 104 * f1, sh: 104, sw: 156, n: 6, smooth: false, alpha: a * k });
    // the film's one accent: the learned filters in magenta duotone (their luminance kept)
    c.save(); c.globalCompositeOperation = 'color'; this.rect3(c, WP, WALL.x, WALL.y, WALL.w, WALL.h, { fill: hexA('#FF2E7E', 0.9 * a) }); c.restore();
    // (dimmed under NOBODY PLANNED: magenta type on the magenta wall did not read)
    const dim = 0.55 * clamp((t - (tNobody - 0.3)) / 0.3);
    if (dim > 0) this.rect3(c, WP, WALL.x, WALL.y, WALL.w, WALL.h, { fill: hexA('#0B0A0D', dim * a) });
    const fi = Math.round(fr);
    const acc = this.acc[fi] ?? 0, st = this.step[fi] ?? 0, ep = this.epoch[fi] ?? 0;
    this.text3(c, `STEP ${st.toLocaleString('en-US')}   EPOCH ${ep.toFixed(ep < 1 ? 2 : 0)}   TEST ACC ${(acc * 100).toFixed(1)}%`, WP, WALL.x, WALL.y - 0.5 - 0.42, { size: 0.36, fam: MONOB, color: hexA(ICE, 0.85 * a) });
    this.text3(c, 'conv1 · 96 filters · learned from data', WP, WALL.x, WALL.y + WALL.h + 0.75, { size: 0.36, fam: MONO, color: hexA(ICE, 0.6 * a) });
  }
}
