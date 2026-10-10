// v3 tail, L68–L69 ("Cite me in related work / one more time"): ONE MORE TIME. The fallen plate lies on the baseline;
// the floor turns back into the blueprint of the first shot, grid and all. "Cite me in related work": the plate's name
// is printed small into the sheet's title block, under RELATED WORK. The plotter's bridge rolls in, the pen comes down
// beside the old line, and draws a new one — lettering ONE MORE TIME along it the way it lettered BASELINE at the
// start. The last frame is the first frame: a pen, a line, the dark.
// Style: back to the blueprint (navy, cyan, bone).
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, vlerp, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';

const BG = '#0B0A0D', GRID = '#1A1820', GRID2 = '#26232D', CYAN = '#9A96A3', BONE = '#EDEAF2', MAG = '#FF2E7E';
const WIDE = F.archivo(125, 900), MONO = F.mono(500), MONOB = F.mono(700);
const BZ = 5.0; // the baseline (from the fall)
const NZ = 1.6; // the new line, drawn just behind it

export default class Tail extends VScene {
  private L68!: Word[]; private L69!: Word[];

  override init() {
    this.bg = BG;
    this.env = { eq: ['perc_rule', 'attention', 'scaling', 'clm'], seed: 18, density: 0.35 }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.5);
    this.L68 = ly.lines[i0]!.words; this.L69 = ly.lines[i0 + 1]!.words;
    const s = this.ctx.start, e = this.ctx.end;
    const t69 = this.L69[0]!.start;
    this.rig = new Rig([
      { t0: s, name: 'sheet', key: (t) => { const k = ease.inOutQuad(clamp((t - s) / (t69 - s))); return K([lerp(2, 5, k), lerp(11, 4.5, k), lerp(19, 9.5, k)], [lerp(0, 1.5, k), 0, lerp(4.5, NZ, k)], lerp(46, 36, k), 0); } },
      { t0: t69 - 0.05, snap: 0.5, name: 'pen', key: (t) => { const p = this.penX(t); const k = ease.inOutCubic(clamp((t - (this.L69[this.L69.length - 1]!.end - 0.1)) / 0.9)); const a = K([2.2 + p * 0.08, 3.8, NZ + 11.5], [0.3 + p * 0.05, 0.05, NZ - 0.2], 46, -0.02); void p; /* (the whole of ONE MORE TIME in frame as the pen writes it: following the pen 2 m away, two letters showed at a time) */ return { p: vlerp(a.p, [1.0, 7.5, NZ + 10.5], k), tg: vlerp(a.tg, [0.2, 0, NZ - 1.2], k), roll: lerp(-0.05, 0, k), fov: lerp(30, 40, k) }; } },
    ], [], 0.6, 191);
  }

  private penX(t: number) { const t69 = this.L69[0]!.start; return lerp(-6, 7.4, ease.inOutQuad(clamp((t - (t69 - 0.2)) / 1.25))); }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L68 = this.L68, L69 = this.L69;
    const s = this.ctx.start, e = this.ctx.end;
    const t69 = L69[0]!, tRel = L68.find((w) => /related/.test(w.w))!;
    const blue = ease.inOutCubic(clamp((t - s) / 1.4));
    const P0 = floorPl(0);
    pool(c, W * 0.5, H * 0.58, 1100, '#1B4E8A', 0.45 * blue);
    this.grid3(c, P0, -16, 16, -12, 16, 0.5, GRID, 1, { alpha: 0.6 * blue, fog: [9, 32] });
    this.grid3(c, P0, -16, 16, -12, 16, 2, GRID2, 1.3, { alpha: 0.9 * blue, fog: [11, 36] });
    // the old baseline and the fallen plate on it
    this.glowSeg(c, [-14, 0.02, BZ], [14, 0.02, BZ], BONE, 2, 8, 0.8);
    const plate: Pl = { o: [0, 0.03, BZ - 0.6], r: [1, 0, 0], u: [0, 0, -1] };
    this.rect3(c, plate, -10.5, 0, 21, 1.45, { fill: '#16141A', stroke: '#77727F', lw: 2 });
    this.text3(c, 'SELF-ATTENTION · TRANSFORMER', plate, -8.1, 0.72, { size: 0.6, fam: MONOB, color: '#9A96A3', mid: true });
    this.text3(c, '2017', plate, 10.0, 0.72, { size: 0.42, fam: MONO, color: hexA(BONE, 0.6), align: 'right', mid: true });
    // the title block, with RELATED WORK
    const tb: Pl = floorPl(0.01);
    const x = -14.5, y = -9.0 + 0, ttb = clamp((t - s - 0.4) / 0.6) * blue;
    if (ttb > 0) {
      this.rect3(c, tb, x, y, 9.2, 3.4, { stroke: hexA(CYAN, ttb), lw: 1.3 });
      this.text3(c, 'RELATED WORK', tb, x + 0.3, y + 2.5, { size: 0.5, fam: MONOB, color: hexA(CYAN, ttb) });
      const kk = clamp((t - tRel.start) / 0.5);
      this.text3(c, 'SELF-ATTENTION · TRANSFORMER · 2017', tb, x + 0.3, y + 1.5, { size: 0.36, fam: MONO, color: hexA(BONE, kk * ttb) });
      this.text3(c, 'PERCEPTRON · 1958  …', tb, x + 0.3, y + 0.8, { size: 0.36, fam: MONO, color: hexA(BONE, 0.7 * kk * ttb) });
    }
    // the bridge and the pen; the new line, lettered ONE MORE TIME
    const pd = clamp((t - (t69.start - 0.9)) / 0.6);
    if (pd > 0) {
      const px = t < t69.start - 0.2 ? lerp(-12, -6, ease.outCubic(pd)) : this.penX(t);
      const down = t >= t69.start - 0.2;
      const bz = NZ;
      this.box3(c, [-15, 1.55, bz - 0.18], [15, 1.85, bz + 0.18], hexA('#5C8CC4', pd), 1.3, { fill: hexA('#0E2A4E', pd) });
      this.box3(c, [px - 0.45, 1.3, bz - 0.32], [px + 0.45, 2.05, bz + 0.32], hexA('#8CC0F0', pd), 1.4, { fill: hexA('#123058', pd) });
      const yTip = down ? 0 : 0.3;
      this.seg(c, [px, yTip + 0.3, bz], [px, 1.3, bz], hexA(BONE, pd), 3);
      this.seg(c, [px, yTip, bz], [px, yTip + 0.3, bz], hexA(BONE, pd), 2);
      if (down) {
        this.glowSeg(c, [-6, 0.03, NZ], [px, 0.03, NZ], BONE, 2.4, 9, 1);
        const q = this.pr([px, 0, NZ]);
        if (q.z > this.near) { c.save(); c.globalCompositeOperation = 'lighter'; const R = 36; const g = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, R); g.addColorStop(0, 'rgba(150,225,255,0.6)'); g.addColorStop(1, 'rgba(150,225,255,0)'); c.fillStyle = g; c.fillRect(q.x - R, q.y - R, 2 * R, 2 * R); c.restore(); }
        // ONE MORE TIME lettered behind the pen, the way BASELINE was
        const word = 'ONE MORE TIME', lx0 = -5.6, step = 0.9;
        this.text3(c, word, P0, lx0, -(NZ - 0.55), { size: 0.95, fam: WIDE, track: 0.1, each: (i) => { const xi = lx0 + i * step; if (px < xi + 0.4) return null; const k = clamp((px - (xi + 0.4)) / 0.4); return { color: mixHex(CYAN, BONE, k), a: k }; } });
      }
    }
    // the line's words (small, quiet) until "one more time" takes the floor
    if (t < t69.start - 0.1) {
      // CITE ME IN RELATED WORK: set on the sheet, over the title block, as the camera comes down to it
      // (centred on the camera's aim and smaller: seen at a grazing angle, WORK ran off the right edge)
      this.chunk3(c, L68, t, floorPl(0.02), 0.9, -(NZ - 4.6), { size: 1.4, maxW: 18, slam: 0.4, glow: 14, glowColor: U.ink, breaks: [0, 3] });
    }
    frameMarks(c, U.ash, { tl: 'BASELINE · DWG 01 · ONE MORE TIME', tr: 'PLOTTER READY', bl: 'NOW — ', br: tc(t), alpha: 0.6 * blue });
    const fade = clamp((t - (e - 0.9)) / 0.9);
    void vlerp; void wallPl; void MAG;
    return { bloom: 0.6, bloomThreshold: 0.6, halation: 0.15, ca: 0.3, grain: 0.05, vignette: 0.3, fade };
  }
}
