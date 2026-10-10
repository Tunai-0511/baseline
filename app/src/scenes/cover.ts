// The cover (2026-10-10). A new composition, not a frame of the film: BASELINE stands on the line y = 0 — the
// film's first stroke and the floor every state of the art lands on — seen from low on the floor so it towers; over
// it, YOU WERE STATE OF THE ART with STATE OF THE ART struck out in magenta; the crown, knocked off, falls onto the line
// at the word's end. Behind, the formula city of the film on the horizon, the floor engraved with its equations.
// Render: bun scripts/render.ts stills --scene cover --t 1 --scale 2 --out ../cover
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, wallPl, floorPl, clamp, lerp, hexA, vrot, U, UF, W, H, frameMarks, type Ctx } from './_v';

const MAG = U.mag, BONE = U.bone;

export default class Cover extends VScene {
  override init() {
    this.bg = U.ink;
    // (the city further off and dimmer than in the film: the title must win at thumbnail size)
    this.env = { eq: ['attention', 'scaling', 'perc_rule', 'lstm_c', 'svm_primal', 'dpo', 'gan', 'resnet', 'conv', 'rlhf'], seed: 77, arcs: 10, r0: 115, r1: 320, fixedR0: true, density: 0.66, floorKeep: 40, alpha: 0.6 };
    // low on the floor, a little left of the word's middle, looking up at it
    this.rig = new Rig([{ t0: 0, name: 'cover', key: () => K([-1.6, 1.15, 25.5], [0.6, 5.0, 0], 40, -0.012) }], [], 0, 1);
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    // ------------------------------------------------ the line y = 0, magenta, across the whole floor
    const G = floorPl(0.012);
    this.rect3(c, G, -90, -0.16, 180, 0.32, { fill: hexA(MAG, 0.95) });
    this.glowSeg(c, [-90, 0.015, 0], [90, 0.015, 0], MAG, 3.2, 26, 1);
    this.text3(c, 'y = 0', wallPl(0.05), 15.6, 0.32, { size: 0.42, fam: UF.monoB, color: hexA(MAG, 0.95) });
    // ticks along it, like the plotter's ruler
    const ticks: [V3, V3][] = [];
    for (let x = -60; x <= 60; x += 2) ticks.push([[x, 0.02, -0.3], [x, 0.02, 0.3]]);
    this.segs(c, ticks, hexA(MAG, 0.55), 1.2);

    // ------------------------------------------------ BASELINE, standing on the line
    const P: Pl = wallPl(0, [0, 0, 0]);
    const size = 23.5 / this.tw3('BASELINE', { size: 1, fam: UF.wide });
    const wd = this.tw3('BASELINE', { size, fam: UF.wide });
    this.text3(c, 'BASELINE', P, 0, 0.02, { size, fam: UF.wide, color: BONE, align: 'center', glow: 22, glowColor: U.ink });

    // ------------------------------------------------ the hook over it, STATE OF THE ART struck out
    const hk = { size: 1.25, fam: UF.heavy, track: 0.12 };
    const a = 'YOU WERE ', b = 'STATE OF THE ART';
    const wa = this.tw3(a, hk) + 0.12 * hk.size, wb = this.tw3(b, hk);
    const x0 = -wd / 2 + 0.3, yH = size * 0.74 + 2.25;
    this.text3(c, a, P, x0, yH, { ...hk, color: BONE });
    this.text3(c, b, P, x0 + wa, yH, { ...hk, color: hexA(BONE, 0.55) });
    const ys = yH + 0.34 * hk.size;
    this.glowSeg(c, at(P, x0 + wa - 0.15, ys, 0.02), at(P, x0 + wa + wb + 0.15, ys, 0.02), MAG, 4, 14, 1);
    this.text3(c, 'NOW YOU’RE JUST A', P, x0, size * 0.74 + 0.75, { size: 0.62, fam: UF.monoB, color: hexA(MAG, 0.95), track: 0.2 });

    // ------------------------------------------------ the crown, knocked off, falling onto the line at the word's end
    // (past the word's end, halfway down its height: on its way from the struck-out line to y = 0)
    const cp: V3 = [wd / 2 + 1.5, size * 0.74 * 0.42, 1.4];
    this.fallingCrown(c, cp, 1.25, 0.62, t);

    // ------------------------------------------------ frame furniture
    frameMarks(c, U.ash, { tl: 'BASELINE', tr: 'A MUSIC VIDEO ABOUT AI ARCHITECTURES', bl: 'PERCEPTRON 1958 — ? ? ?', br: '4:07', alpha: 0.7, size: 14 });
    void clamp; void lerp; void W; void H;
    return { bloom: 0.55, bloomThreshold: 0.6, halation: 0.15, ca: 0.35, grain: 0.04, vignette: 0.42 };
  }

  /** a wireframe crown tilted by `tilt` (rad) about the z axis, with fall streaks above it */
  private fallingCrown(c: Ctx, p: V3, s: number, tilt: number, t: number) {
    const n = 60;
    const rot = (q: V3): V3 => { const d: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]; const r1 = vrot(d, [0, 0, 1], tilt); const r2 = vrot(r1, [1, 0, 0], 0.32); return [p[0] + r2[0], p[1] + r2[1], p[2] + r2[2]]; };
    const pt = (a: number, y: number, r: number): V3 => rot([p[0] + Math.cos(a) * r, p[1] + y, p[2] + Math.sin(a) * r]);
    const lo: V3[] = [], mid: V3[] = [], hi: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const u = ((i / n) * 5) % 1, spike = 1 - Math.abs(u - 0.5) * 2;
      lo.push(pt(a, 0, 0.78 * s)); mid.push(pt(a, 0.22 * s, 0.8 * s)); hi.push(pt(a, (0.32 + 0.62 * Math.pow(spike, 1.6)) * s, 0.84 * s));
    }
    // fall streaks: the crown's path above it
    for (let k = 0; k < 7; k++) {
      const off = (k - 3) * 0.32 * s, len = (2.2 + (k % 3) * 0.9) * s;
      const q0: V3 = [p[0] + off - 0.55 * len * Math.sin(tilt) * 0.3, p[1] + 0.7 * s, p[2]];
      this.seg(c, q0, [q0[0] - len * 0.18, q0[1] + len, q0[2]], hexA(BONE, 0.16 - 0.015 * Math.abs(k - 3)), 1.4);
    }
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = this.pr(pt(0, 0.4 * s, 0));
    if (g.z > this.near) { const R = Math.max(30, g.k * s * 1.4); const gr = c.createRadialGradient(g.x, g.y, 0, g.x, g.y, R); gr.addColorStop(0, hexA(MAG, 0.45)); gr.addColorStop(1, hexA(MAG, 0)); c.fillStyle = gr; c.fillRect(g.x - R, g.y - R, 2 * R, 2 * R); }
    c.restore();
    this.pl3(c, lo, BONE, 2.2); this.pl3(c, mid, BONE, 1.4, { alpha: 0.6 }); this.pl3(c, hi, BONE, 2.4, { glow: 8 });
    for (let k = 0; k < 10; k++) { const i = Math.round((k / 10) * n); this.seg(c, lo[i]!, hi[i]!, BONE, 1.3, { alpha: 0.75 }); }
    for (let k = 0; k < 5; k++) { const i = Math.round(((k + 0.5) / 5) * n); this.dot3(c, hi[i]!, 0.06 * s, '#FFFFFF'); }
    void t;
  }
}
