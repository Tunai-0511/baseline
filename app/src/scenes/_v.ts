// v3 plate kit (2026-10-10, STORYBOARD-v3.md): Canvas2D drawing seen through a pinhole camera — the "2D that
// simulates 3D" way of building a space (hairlines, flat fills, type and images set on planes, perspective,
// parallax, camera flights), with screen-space notes on top. Every plate is a pure function of song time t.
//
//   class X extends VScene { init() { this.rig = new Rig([...]) }  frame(c, t) { this.seg(c, a, b, '#fff') … } }
//
// World units are arbitrary (≈ metres); y is up. A plane is an origin plus unit right/up vectors.
import type * as THREE from 'three';
import type { Frame, PostOverrides } from '../engine/scene';
import { Layer2D, SCALE } from '../engine/gl';
import { layout, F } from '../engine/type';
import type { Word } from '../engine/lyrics';
import { D2Scene, W, H, clamp, lerp, ease, hexA, mixHex, type Ctx, sungW, hot } from './_d2';
import { smoothstep, hash } from '../engine/util';
import { eqImage } from './_eq';
import { Rig, K, basis, type Key, type V3, vadd, vsub, vsc, vdot, vlerp, vnorm, vcross, vrot, orbit } from './_wire';

export { Rig, K, basis, type Key, type V3, vadd, vsub, vsc, vdot, vlerp, vnorm, vcross, vrot, orbit, W, H, clamp, lerp, ease, hexA, mixHex, sungW, hot, F };
export type { Ctx };

/**
 * v4 (2026-10-10, user: 「風格還是統一好了」「比不過 p(doom) 的震撼感」): ONE look for the whole film — ink, bone, and one
 * hot accent. Magenta = the current state of the art / the word being sung; everything else lives on the ink→bone ramp
 * (the post `unify` pass enforces it). Type: WIDE for hero words, COND for numbers and stacks, MONO for annotations.
 */
export const U = {
  ink: '#0B0A0D', ink2: '#121016', panel: '#17151C', line: '#2A2731', grid: '#1E1C24', graphite: '#5C5966', ash: '#9A96A3', bone: '#EDEAF2',
  mag: '#FF2E7E', magHot: '#FF9CC4', magDeep: '#A3104A', magDark: '#3A0A1E',
};
export const UF = { wide: F.archivo(125, 900), heavy: F.archivo(112, 900), cond: F.archivo(75, 900), mono: F.mono(500), monoB: F.mono(700), serif: F.serif(600, false), ital: F.serif(600, true) };

export interface P2 { x: number; y: number; z: number; k: number }
/** A plane in the world: origin, unit right, unit up. */
export interface Pl { o: V3; r: V3; u: V3 }
export const pl = (o: V3, r: V3 = [1, 0, 0], u: V3 = [0, 1, 0]): Pl => ({ o, r: vnorm(r), u: vnorm(u) });
/** The floor (y = h) seen from above: right = +x, up = −z (away from a camera on +z). */
export const floorPl = (h = 0, o: V3 = [0, h, 0]): Pl => ({ o, r: [1, 0, 0], u: [0, 0, -1] });
/** A wall facing +z at depth z. */
export const wallPl = (z = 0, o: V3 = [0, 0, z]): Pl => ({ o, r: [1, 0, 0], u: [0, 1, 0] });
/** A plane rotated about the world y axis by yaw (rad), then tilted back by pitch (rad). */
export const turnPl = (o: V3, yaw = 0, pitch = 0): Pl => {
  let r: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  let u: V3 = [0, 1, 0];
  const n = vcross(r, u);
  if (pitch) u = vrot(u, r, -pitch);
  void n;
  return { o, r, u };
};
export const at = (P: Pl, x: number, y: number, z = 0): V3 => {
  const n = vcross(P.r, P.u);
  return [P.o[0] + P.r[0] * x + P.u[0] * y + n[0] * z, P.o[1] + P.r[1] * x + P.u[1] * y + n[1] * z, P.o[2] + P.r[2] * x + P.u[2] * y + n[2] * z];
};

export interface T3 {
  /** em size in world units */
  size: number;
  fam: string;
  color?: string;
  stroke?: string;
  /** stroke width in screen px */
  strokeW?: number;
  align?: 'left' | 'center' | 'right';
  /** extra letter spacing, in em */
  track?: number;
  alpha?: number;
  glow?: number;
  glowColor?: string;
  /** vertical anchor: baseline (default) or the middle of the caps */
  mid?: boolean;
  /** per-glyph modifiers (offsets in em; sc scales the glyph about its baseline centre; a multiplies alpha) */
  each?: (i: number, ch: string, n: number) => { dx?: number; dy?: number; sc?: number; sy?: number; a?: number; color?: string; rot?: number } | null | undefined;
}

const CAP = 0.72; // Archivo cap height / em

/** True while a VScene draws its floor reflection (screen-space furniture skips itself then). */
export let MIRRORING = false;
/** Text runs drawn this frame (screen boxes), for the overlap QA (render.ts textqa); filled only when TEXT_QA.on. */
export const TEXT_QA: { on: boolean; runs: { scene: string; s: string; x0: number; y0: number; x1: number; y1: number; a: number; g: number[] }[]; rects: { scene: string; q: number[] }[] } = { on: false, runs: [], rects: [] };
if (typeof window !== 'undefined') (window as any).__textqa = TEXT_QA;
/** World-space stroke weight (2026-10-10 polish: hairlines vanish on a phone; everything a third heavier). */
export const LW = 1.35;

/**
 * The world round a plate (2026-10-10, "the background is too empty"): a city standing far off on the floor — walls
 * carrying the plate's formulas, typeset from the papers, and stacks of layer plates that pulse up on the beat.
 * World-anchored on a lattice, so they keep their place as the camera travels; only sites between r0 and r1 from
 * the camera stand, and never nearer than 1.5 × the camera's distance to its target (they never cover the action).
 */
export interface EnvCfg {
  /** formulas for the walls (keys of app/eq.json), handed out in turn */
  eq: string[];
  /** what the walls face (default the origin) */
  focus?: V3;
  /** lattice spacing (default 38) */
  cell?: number;
  /** nearest / farthest a structure stands from the camera (default 50 / 240) */
  r0?: number; r1?: number;
  /** the floor's height (default 0) */
  floor?: number;
  /** share of lattice sites standing something (default 0.62) and of those, the layer towers (default 0.42) */
  density?: number; towers?: number;
  /** attention arcs strung between the towers' tops (default 0) */
  arcs?: number;
  /** keep a site? (keeps the action's own ground clear) */
  keep?: (x: number, z: number) => boolean;
  /** overall strength (default 1) */
  alpha?: number;
  /** lattice offset, so neighbouring plates don't stand the same city (default 0) */
  seed?: number;
  /** r0 as given, not pushed out by the camera's distance to its target (plates whose target runs far away) */
  fixedR0?: boolean;
  /** formulas engraved flat in the floor round the focus — what a camera looking down sees (default on); no
   *  inscription nearer the focus than floorKeep (default 16) */
  floorEq?: boolean; floorKeep?: number;
  /** the song's hits (s): on each, a magenta wave climbs every tower of the city and the walls' tops flash */
  flash?: number[];
}

export abstract class VScene extends D2Scene {
  /**
   * The glossy floor (2026-10-10 polish): the frame is drawn a second time with the camera mirrored in the plane
   * y = mirror.y, at half resolution, then laid under the frame — clipped below that plane's horizon, blurred, and
   * fading from the horizon (grazing: strong) to the bottom of the frame (looking down: weak). `haze` is a soft band
   * of light along the horizon. null: no floor.
   */
  mirror: { y: number; k: number; blur: number; haze: number; tint?: string } | null = { y: 0, k: 0.34, blur: 2.5, haze: 0.5 };
  /** Motes of dust hanging in the air round the camera (parallax on every move); 0 = none. */
  dust = 1;
  private dustXYZ: Float32Array | null = null;
  private mlayer: Layer2D | null = null;
  rig: Rig | null = null;
  key: Key = K([0, 0, 10], [0, 0, 0], 40);
  R: V3 = [1, 0, 0]; U: V3 = [0, 1, 0]; Fw: V3 = [0, 0, -1];
  f = 1;
  near = 0.05;
  base: DOMMatrix = new DOMMatrix();

  setKey(k: Key) {
    const b = basis(k);
    this.R = b.R; this.U = b.U; this.Fw = b.F;
    this.f = (H / 2) / Math.tan((k.fov * Math.PI) / 360);
    if (MIRRORING && this.mirror) {
      // the mirror camera: position and basis reflected in y = my (a left-handed basis: points land where their
      // reflections appear to the real camera)
      const my = this.mirror.y, M = (v: V3): V3 => [v[0], -v[1], v[2]];
      this.key = { ...k, p: [k.p[0], 2 * my - k.p[1], k.p[2]], tg: [k.tg[0], 2 * my - k.tg[1], k.tg[2]] };
      this.R = M(this.R); this.U = M(this.U); this.Fw = M(this.Fw);
    } else this.key = k;
  }

  override draw(c: Ctx, t: number, f: Frame): PostOverrides | void {
    this.base = c.getTransform();
    if (this.rig) this.setKey(this.rig.at(t));
    if (this.env) this.drawEnv(c, t, this.env);
    return this.frame(c, t, f);
  }

  /** QA: a line of screen-space type (fillText at x, y with c's current font and textAlign) as a run */
  qaText(c: Ctx, s: string, x: number, y: number) {
    if (!TEXT_QA.on || MIRRORING || !s) return;
    const m = c.measureText(s), w = m.width, asc = m.actualBoundingBoxAscent;
    const x0 = c.textAlign === 'center' ? x - w / 2 : c.textAlign === 'right' || c.textAlign === 'end' ? x - w : x;
    TEXT_QA.runs.push({ scene: this.ctx.id, s, x0, y0: y - asc, x1: x0 + w, y1: y, a: c.globalAlpha, g: [x0, y - asc, x0 + w, y] });
  }

  /** QA: a word drawn as something other than type (dots, particles, an outline): its letters as 3D quads */
  qaWord(s: string, quads: V3[][], a = 1) {
    if (!TEXT_QA.on || MIRRORING || !quads.length || a <= 0) return;
    const g: number[] = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of quads) {
      const cq = q.map((p) => this.cs(p));
      if (cq.some((p) => p[2] < this.near)) continue;
      const sq = cq.map((p) => this.sp(p));
      const xs = sq.map((p) => p[0]), ys = sq.map((p) => p[1]);
      const b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
      g.push(b[0], b[1], b[2], b[3]);
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    }
    if (g.length) TEXT_QA.runs.push({ scene: this.ctx.id, s, x0, y0, x1, y1, a, g });
  }

  /** the plate's world (see EnvCfg); set it in init */
  env: EnvCfg | null = null;

  private drawEnv(c: Ctx, t: number, E: EnvCfg) {
    if (!E.eq.length) return;
    const cell = E.cell ?? 38, fl = E.floor ?? 0, A = E.alpha ?? 1, sd = E.seed ?? 0;
    const p = this.key.p, dT = Math.hypot(this.key.tg[0] - p[0], this.key.tg[1] - p[1], this.key.tg[2] - p[2]);
    const r0 = E.fixedR0 ? (E.r0 ?? 70) : Math.max(E.r0 ?? 70, dT * 1.8 + 14), r1 = Math.max(E.r1 ?? 330, r0 * 2.2);
    if (E.floorEq !== false && !MIRRORING) this.floorInscriptions(c, E, A, sd, fl);
    const dens = E.density ?? 0.5, tw = E.towers ?? 0.42;
    // the glow along the horizon the city stands against (a backlight, low: it gives the skyline a silhouette)
    {
      const fwd = vnorm([this.Fw[0], 0, this.Fw[2]]);
      const hz = this.cs(vadd([p[0], fl, p[2]], vsc(fwd, 5000)));
      if (hz[2] > 0 && Math.abs(this.Fw[1]) < 0.8) {
        const hy = this.sp(hz)[1];
        if (hy > -H * 0.3 && hy < H * 1.3) {
          c.save();
          const g = c.createLinearGradient(0, hy - H * 0.32, 0, hy + H * 0.06);
          g.addColorStop(0, hexA(U.magDark, 0)); g.addColorStop(0.8, hexA(U.magDark, 0.42 * A)); g.addColorStop(1, hexA(U.magDark, 0));
          c.fillStyle = g; c.fillRect(0, hy - H * 0.32, W, H * 0.38);
          c.restore();
        }
      }
    }
    const focus = E.focus ?? [0, 0, 0];
    type Site = { i: number; j: number; x: number; z: number; d: number; a: number; tower: boolean };
    const sites: Site[] = [];
    const i0 = Math.floor((p[0] - r1) / cell), i1 = Math.floor((p[0] + r1) / cell);
    const j0 = Math.floor((p[2] - r1) / cell), j1 = Math.floor((p[2] + r1) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (hash(i, j, 11 + sd) > dens) continue;
      const x = (i + 0.15 + 0.7 * hash(i, j, 12 + sd)) * cell, z = (j + 0.15 + 0.7 * hash(i, j, 13 + sd)) * cell;
      if (E.keep && !E.keep(x, z)) continue;
      const d = Math.hypot(x - p[0], z - p[2]);
      if (d < r0 * 0.85 || d > r1) continue;
      // in front of the camera, roughly (a wide margin: the structures are big)
      const q = this.cs([x, fl + 12, z]);
      if (q[2] < 0 || Math.abs(q[0]) > q[2] * 2.2 + 40) continue;
      const a = A * smoothstep(r0 * 0.85, r0 * 1.25, d) * (1 - smoothstep(r1 * 0.62, r1, d));
      if (a > 0.01) sites.push({ i, j, x, z, d, a, tower: hash(i, j, 14 + sd) < tw });
    }
    sites.sort((s1, s2) => s2.d - s1.d);
    const kick = this.beatPulse(t, 0.16);
    // the latest hit's wave: u climbs 0 → 1 over 0.55 s, strength fading over 0.9 s
    let wu = -1, wa = 0;
    for (const tf of E.flash ?? []) { const dt = t - tf; if (dt >= 0 && dt < 0.9) { wu = dt / 0.55; wa = 1 - dt / 0.9; } }
    const tops: V3[] = [];
    let wi = 0;
    for (const S of sites) {
      const hh = (k: number) => hash(S.i, S.j, k + sd);
      if (S.tower) {
        // a stack of layer plates; a pulse runs up it from every beat
        const s = 4 + 4 * hh(21), nL = 16 + Math.floor(32 * hh(22)), gap = 1.6 + 0.9 * hh(23), yaw = hh(24) * Math.PI;
        const cx = Math.cos(yaw) * s, sx = Math.sin(yaw) * s;
        const corner = (k: number, y: number): V3 => {
          const u = k === 0 || k === 3 ? -1 : 1, v = k < 2 ? -1 : 1;
          return [S.x + u * cx - v * sx, y, S.z + u * sx + v * cx];
        };
        const lb = this.lastBeat(t), run = (t - lb.t0) / 0.55; // the pulse climbs the stack in 0.55 s
        const dim: [V3, V3][] = [], hot: [V3, V3][] = [];
        const wave: [V3, V3][] = [];
        for (let k = 0; k < nL; k++) {
          const y = fl + 0.6 + k * gap;
          const inWave = wa > 0 && Math.abs(wu - k / nL) < 0.1;
          const lit = Math.abs(run * nL - k) < 1.5 && run < 1.2;
          const L = inWave ? wave : lit ? hot : dim;
          for (let e = 0; e < 4; e++) L.push([corner(e, y), corner((e + 1) % 4, y)]);
        }
        if (wave.length) this.segs(c, wave, U.mag, 2.4, Math.min(1, 1.2 * wa) * S.a);
        const yTop = fl + 0.6 + (nL - 1) * gap;
        for (let e = 0; e < 4; e++) dim.push([corner(e, fl), corner(e, yTop + 1.2)]);
        this.segs(c, dim, U.graphite, 1.1, 0.75 * S.a);
        if (hot.length) this.segs(c, hot, U.mag, 1.6, 0.85 * S.a * (0.5 + 0.5 * kick));
        tops.push([S.x, yTop + 1.2, S.z]);
      } else {
        // a wall of formulas: a dark slab, its main formula large, a second one under it
        const w = 38 + 30 * hh(31), h = 13 + 11 * hh(32), lift = hh(33) < 0.45 ? 0 : 6 + 16 * hh(34);
        const dx = focus[0] - S.x, dz = focus[2] - S.z, dl = Math.hypot(dx, dz) || 1;
        const n: V3 = [dx / dl, 0, dz / dl];
        const P0: Pl = { o: [S.x, fl + lift, S.z], r: [n[2], 0, -n[0]], u: [0, 1, 0] };
        const P = this.readable(P0);
        const q = [at(P, -w / 2, 0), at(P, w / 2, 0), at(P, w / 2, h), at(P, -w / 2, h)];
        this.fill3(c, q, hexA(U.ink2, 0.94 * S.a));
        this.pl3(c, q, U.line, 1.2, { close: true, alpha: S.a });
        this.seg(c, at(P, -w / 2, h), at(P, w / 2, h), wa > 0 ? mixHex(U.ash, U.mag, wa) : hexA(U.ash, 0.55 * S.a), 1.4 + 1.6 * wa);
        if (lift > 0) for (const ux of [-0.32, 0.32]) this.seg(c, at(P, ux * w, 0), [at(P, ux * w, 0)[0], fl, at(P, ux * w, 0)[2]], hexA(U.graphite, 0.8 * S.a), 1.2);
        const k1 = E.eq[wi++ % E.eq.length]!, k2 = E.eq[(wi + Math.floor(hh(35) * 7)) % E.eq.length]!;
        if (MIRRORING) continue; // (in the floor's blurred reflection the slab is enough; the type costs time)
        const e1 = eqImage(k1, U.bone), e2 = eqImage(k2, U.ash);
        if (e1) {
          const em = Math.min((0.84 * w) / e1.box.w, (0.5 * h) / e1.box.h);
          this.eq3(c, k1, P, 0, h * 0.62, em, { color: U.bone, alpha: 0.55 * S.a, v: 'mid' });
          this.seg(c, at(P, -0.42 * w, h * 0.62 - (e1.box.h * em) / 2 - 0.5), at(P, -0.42 * w + Math.min(0.84 * w, e1.box.w * em) * 0.3, h * 0.62 - (e1.box.h * em) / 2 - 0.5), hexA(U.mag, 0.8 * S.a), 1.6);
        }
        if (e2 && k2 !== k1) {
          const em2 = Math.min((0.6 * w) / e2.box.w, (0.2 * h) / e2.box.h);
          this.eq3(c, k2, P, 0, h * 0.2, em2, { color: U.ash, alpha: 0.42 * S.a, v: 'mid' });
        }
      }
    }
    // attention arcs strung between the towers' tops
    const na = Math.min(E.arcs ?? 0, (tops.length * (tops.length - 1)) / 2);
    for (let k = 0, m = 0; k < tops.length && m < na; k++) for (let l = k + 1; l < tops.length && m < na; l++, m++) {
      const a3 = tops[k]!, b3 = tops[l]!, span = Math.hypot(b3[0] - a3[0], b3[2] - a3[2]);
      const pts: V3[] = [];
      for (let u = 0; u <= 16; u++) { const v = u / 16; pts.push([lerp(a3[0], b3[0], v), lerp(a3[1], b3[1], v) + Math.sin(Math.PI * v) * span * 0.35, lerp(a3[2], b3[2], v)]); }
      this.pl3(c, pts, (k + l) % 3 ? U.ash : U.mag, 1.1, { alpha: 0.35 * A });
    }
  }

  /** formulas engraved flat in the floor: a world lattice of inscriptions round the camera, kept off the focus */
  private floorInscriptions(c: Ctx, E: EnvCfg, A: number, sd: number, fl: number) {
    const cell = 26, p = this.key.p, R = 150, keep = E.floorKeep ?? 16, focus = E.focus ?? [0, 0, 0];
    if (p[1] < fl + 0.5) return;
    for (let i = Math.floor((p[0] - R) / cell); i <= Math.floor((p[0] + R) / cell); i++) for (let j = Math.floor((p[2] - R) / cell); j <= Math.floor((p[2] + R) / cell); j++) {
      if (hash(i, j, 51 + sd) > 0.42) continue;
      const x = (i + 0.2 + 0.6 * hash(i, j, 52 + sd)) * cell, z = (j + 0.2 + 0.6 * hash(i, j, 53 + sd)) * cell;
      if (Math.hypot(x - focus[0], z - focus[2]) < keep) continue; // (not E.keep: engraved in the floor, they cover nothing)
      const d = Math.hypot(x - p[0], z - p[2], fl - p[1]);
      const a = A * 0.3 * (1 - smoothstep(R * 0.5, R, d));
      if (a < 0.02) continue;
      const q = this.cs([x, fl, z]);
      if (q[2] < 1 || Math.abs(q[0]) > q[2] * 2 + 30) continue;
      const key = E.eq[Math.floor(hash(i, j, 54 + sd) * E.eq.length) % E.eq.length]!;
      const yaw = (Math.floor(hash(i, j, 55 + sd) * 4) * Math.PI) / 2 + (hash(i, j, 56 + sd) - 0.5) * 0.3;
      const P = this.readable({ o: [x, fl + 0.01, z], r: [Math.cos(yaw), 0, -Math.sin(yaw)], u: [-Math.sin(yaw), 0, -Math.cos(yaw)] });
      this.eq3(c, key, P, 0, 0, 1.6 + 1.6 * hash(i, j, 57 + sd), { color: U.bone, alpha: a, v: 'mid' });
    }
  }

  /**
   * An image on a plane as a grid of affine cells (no clipping: cheap). Each cell's affine map fits its four
   * projected corners; n defaults from the projected size. For type and line art seen from in front.
   */
  quad3(c: Ctx, img: CanvasImageSource, iw: number, ih: number, P: Pl, x: number, y: number, w: number, h: number, o: { n?: number; alpha?: number } = {}) {
    const cq = [at(P, x, y + h), at(P, x + w, y + h), at(P, x, y), at(P, x + w, y)].map((p) => this.cs(p));
    if (cq.some((q) => q[2] < this.near * 4)) return;
    const sq = cq.map((q) => this.sp(q));
    const span = Math.max(Math.hypot(sq[1]![0] - sq[0]![0], sq[1]![1] - sq[0]![1]), Math.hypot(sq[2]![0] - sq[0]![0], sq[2]![1] - sq[0]![1]));
    if (span < 2) return;
    const n = o.n ?? Math.max(1, Math.min(6, Math.ceil(span / 320)));
    const G: [number, number][][] = [];
    for (let i = 0; i <= n; i++) { G.push([]); for (let j = 0; j <= n; j++) G[i]!.push(this.sp(this.cs(at(P, x + (w * i) / n, y + h - (h * j) / n)))); }
    c.save();
    if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    c.imageSmoothingEnabled = true;
    const cw = iw / n, ch = ih / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p00 = G[i]![j]!, p10 = G[i + 1]![j]!, p01 = G[i]![j + 1]!, p11 = G[i + 1]![j + 1]!;
      const Xx = (p10[0] - p00[0] + p11[0] - p01[0]) / 2 / cw, Xy = (p10[1] - p00[1] + p11[1] - p01[1]) / 2 / cw;
      const Yx = (p01[0] - p00[0] + p11[0] - p10[0]) / 2 / ch, Yy = (p01[1] - p00[1] + p11[1] - p10[1]) / 2 / ch;
      const mx = (p00[0] + p10[0] + p01[0] + p11[0]) / 4, my = (p00[1] + p10[1] + p01[1] + p11[1]) / 4;
      const ox = mx - (Xx * cw + Yx * ch) / 2, oy = my - (Xy * cw + Yy * ch) / 2;
      c.setTransform(this.base.multiply(new DOMMatrix([Xx, Xy, Yx, Yy, ox, oy])));
      c.drawImage(img, i * cw, j * ch, cw, ch, 0, 0, cw, ch);
    }
    c.restore();
  }

  /**
   * A typeset formula (app/eq.json) on a plane. em: the world height of one em; (x, y) the anchor — the baseline
   * (v 'base', default), the box's middle ('mid') or its top ('top'). Returns the formula's world width.
   */
  eq3(c: Ctx, key: string, P: Pl, x: number, y: number, em: number, o: { color?: string; alpha?: number; align?: 'left' | 'center' | 'right'; v?: 'base' | 'mid' | 'top'; n?: number; qa?: boolean } = {}): number {
    const e = eqImage(key, o.color ?? U.bone);
    if (!e) return 0;
    const w = e.box.w * em, h = e.box.h * em;
    const x0 = (o.align ?? 'center') === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    const yb = o.v === 'mid' ? y - h / 2 : o.v === 'top' ? y - h : y - e.box.d * em;
    this.quad3(c, e.img, e.img.width, e.img.height, P, x0, yb, w, h, { alpha: o.alpha, n: o.n });
    // (overlap QA for formulas set in the action, not the city's: the box in 8 slices, like glyphs)
    if (o.qa && TEXT_QA.on && !MIRRORING && (o.alpha ?? 1) * c.globalAlpha > 0.45) {
      const g: number[] = [];
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      for (let k = 0; k < 8; k++) {
        const cs = [at(P, x0 + (w * k) / 8, yb), at(P, x0 + (w * (k + 1)) / 8, yb), at(P, x0 + (w * k) / 8, yb + h), at(P, x0 + (w * (k + 1)) / 8, yb + h)].map((pp) => this.cs(pp));
        if (cs.some((q) => q[2] < this.near)) continue;
        const sp = cs.map((q) => this.sp(q));
        const xs = sp.map((q) => q[0]), ys = sp.map((q) => q[1]);
        g.push(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
        bx0 = Math.min(bx0, ...xs); by0 = Math.min(by0, ...ys); bx1 = Math.max(bx1, ...xs); by1 = Math.max(by1, ...ys);
      }
      if (g.length) TEXT_QA.runs.push({ scene: this.ctx.id, s: `eq:${key}`, x0: bx0, y0: by0, x1: bx1, y1: by1, a: (o.alpha ?? 1) * c.globalAlpha, g });
    }
    return w;
  }
  /** a formula fitted into a box maxW × maxH centred at (x, y) on P; returns its em */
  eqFit(c: Ctx, key: string, P: Pl, x: number, y: number, maxW: number, maxH: number, o: { color?: string; alpha?: number; align?: 'left' | 'center' | 'right'; n?: number; qa?: boolean } = {}): number {
    const e = eqImage(key, o.color ?? U.bone);
    if (!e) return 0;
    const em = Math.min(maxW / e.box.w, maxH / e.box.h);
    const xa = (o.align ?? 'center') === 'center' ? x : o.align === 'right' ? x + maxW / 2 : x - maxW / 2;
    this.eq3(c, key, P, xa, y, em, { ...o, v: 'mid', qa: o.qa ?? true });
    return em;
  }

  /** The dust: 1400 motes in a 70 m box that follows the camera in whole cells (so they stay put in the world). */
  private drawDust(c: Ctx, t: number) {
    if (this.dust <= 0) return;
    const N = 1400, B = 70;
    const xyz = (this.dustXYZ ??= new Float32Array(N * 3));
    const p = this.key.p, cell = (v: number) => Math.floor(v / B) * B;
    const cx = cell(p[0]), cy = cell(p[1]), cz = cell(p[2]);
    for (let i = 0; i < N; i++) {
      // each mote lives in one of the 8 cells round the camera, drifting slowly
      const h = (k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
      let x = cx + (h(1) - 0.5) * B * 2 + Math.sin(t * 0.13 + i) * 0.6;
      let y = cy + (h(2) - 0.35) * B + Math.sin(t * 0.21 + i * 1.7) * 0.3;
      let z = cz + (h(3) - 0.5) * B * 2 + Math.cos(t * 0.11 + i * 0.7) * 0.6;
      // keep the box centred on the camera
      if (x - p[0] > B) x -= 2 * B; else if (p[0] - x > B) x += 2 * B;
      if (z - p[2] > B) z -= 2 * B; else if (p[2] - z > B) z += 2 * B;
      xyz[i * 3] = x; xyz[i * 3 + 1] = y; xyz[i * 3 + 2] = z;
    }
    this.points(c, xyz, N, '#9A96A3', 1.6, 0.35 * this.dust);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const m = this.mirror;
    if (!m || m.k <= 0) return super.render(f, out, (c) => this.drawDust(c, f.t));
    // the mirror pass, into the half-res layer
    const ml = (this.mlayer ??= new Layer2D(W, H, SCALE * 0.5));
    ml.clear();
    const mc = ml.ctx;
    mc.save(); mc.textBaseline = 'alphabetic';
    MIRRORING = true;
    try { this.draw(mc, f.t, f); } finally { MIRRORING = false; }
    mc.restore();
    // the real camera again (every plate drives its camera with a rig)
    if (this.rig) this.setKey(this.rig.at(f.t));
    const camY = this.key.p[1];
    const post = super.render(f, out, (c) => {
      this.drawDust(c, f.t);
      if (camY <= m.y + 1e-3) return;
      // the horizon of y = my: where two far directions along the floor project
      const fl = vnorm([this.Fw[0], 0, this.Fw[2]]);
      const side = vnorm(vcross(fl, [0, 1, 0]));
      const far = 1e4;
      const ptA = this.pr(vadd(vadd([this.key.p[0], m.y, this.key.p[2]], vsc(fl, far)), vsc(side, far * 1.5)));
      const ptB = this.pr(vadd(vadd([this.key.p[0], m.y, this.key.p[2]], vsc(fl, far)), vsc(side, -far * 1.5)));
      const looksDown = vdot(this.Fw, [0, -1, 0]) > 0.999;
      c.save();
      c.beginPath();
      if (looksDown || ptA.z <= 0) { c.rect(0, 0, W, H); }
      else {
        // the half-plane below the line A-B, as a big quad
        const dx = ptB.x - ptA.x, dy = ptB.y - ptA.y, L = Math.hypot(dx, dy) || 1;
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux; // normal: pointing "down" the screen when the line is level
        const sgn = ny >= 0 ? 1 : -1;
        const E = 6000;
        c.moveTo(ptA.x - ux * E, ptA.y - uy * E); c.lineTo(ptA.x + ux * E, ptA.y + uy * E);
        c.lineTo(ptA.x + ux * E + nx * sgn * E, ptA.y + uy * E + ny * sgn * E); c.lineTo(ptA.x - ux * E + nx * sgn * E, ptA.y - uy * E + ny * sgn * E);
        c.closePath();
      }
      c.clip();
      const hy = looksDown || ptA.z <= 0 ? -H : (ptA.y + ptB.y) / 2;
      // the reflection: blurred, fading toward the bottom of the frame; Fresnel: strong at grazing views, gone when
      // the camera looks steeply down (there the mirror would show what is behind and above it, upside down)
      const fres = 1 - smoothstep(0.3, 0.7, -this.Fw[1]);
      if (fres <= 0.01) { c.restore(); return; }
      c.globalAlpha = m.k * fres;
      c.filter = `blur(${m.blur}px)`;
      c.drawImage(ml.canvas, 0, 0, W, H);
      c.filter = 'none';
      c.globalAlpha = 1;
      const g = c.createLinearGradient(0, Math.max(hy, -H), 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, hexA(this.bg.startsWith('#') ? this.bg : '#000000', 0.62));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.restore();
      // the haze along the horizon
      if (m.haze > 0 && !looksDown && ptA.z > 0) {
        const tint = m.tint ?? '#9A96A3';
        c.save();
        const hg = c.createLinearGradient(0, hy - 110, 0, hy + 70);
        hg.addColorStop(0, hexA(tint, 0)); hg.addColorStop(0.62, hexA(tint, 0.07 * m.haze)); hg.addColorStop(1, hexA(tint, 0));
        c.fillStyle = hg; c.fillRect(0, hy - 110, W, 180);
        c.restore();
      }
    });
    return post;
  }

  abstract frame(c: Ctx, t: number, f: Frame): PostOverrides | void;

  // ------------------------------------------------------------------ projection
  /** camera-space coordinates (x right, y up, z forward) */
  cs(p: V3): V3 { const d = vsub(p, this.key.p); return [vdot(d, this.R), vdot(d, this.U), vdot(d, this.Fw)]; }
  sp(q: V3): [number, number] { const z = Math.max(q[2], 1e-6); return [W / 2 + (this.f * q[0]) / z, H / 2 - (this.f * q[1]) / z]; }
  pr(p: V3): P2 { const q = this.cs(p); const z = Math.max(q[2], 1e-6); return { x: W / 2 + (this.f * q[0]) / z, y: H / 2 - (this.f * q[1]) / z, z: q[2], k: this.f / z }; }
  vis(p: V3, m = 0) { const q = this.pr(p); return q.z > this.near && q.x > -m && q.x < W + m && q.y > -m && q.y < H + m; }

  /** add a near-clipped segment to the current path */
  mv(c: Ctx, a: V3, b: V3) {
    let A = this.cs(a), B = this.cs(b);
    const n = this.near;
    if (A[2] < n && B[2] < n) return;
    if (A[2] < n) A = vlerp(A, B, (n - A[2]) / (B[2] - A[2]));
    else if (B[2] < n) B = vlerp(B, A, (n - B[2]) / (A[2] - B[2]));
    const p = this.sp(A), q = this.sp(B);
    c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]);
  }
  seg(c: Ctx, a: V3, b: V3, col: string, lw = 1.5, o: { dash?: number[]; alpha?: number; cap?: CanvasLineCap } = {}) {
    c.save();
    c.strokeStyle = col; c.lineWidth = lw * LW; c.lineCap = o.cap ?? 'round';
    if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    if (o.dash) c.setLineDash(o.dash);
    c.beginPath(); this.mv(c, a, b); c.stroke();
    c.restore();
  }
  segs(c: Ctx, list: [V3, V3][], col: string, lw = 1.5, alpha = 1, dash?: number[]) {
    if (!list.length) return;
    c.save(); c.strokeStyle = col; c.lineWidth = lw * LW; c.lineCap = 'round'; c.globalAlpha *= alpha; if (dash) c.setLineDash(dash);
    c.beginPath(); for (const [a, b] of list) this.mv(c, a, b); c.stroke(); c.restore();
  }
  /** neon: a wide soft pass under a thin hot core */
  glowSeg(c: Ctx, a: V3, b: V3, col: string, lw = 2, glow = 10, alpha = 1) {
    c.save(); c.globalCompositeOperation = 'lighter';
    this.seg(c, a, b, col, lw + glow, { alpha: 0.12 * alpha });
    this.seg(c, a, b, col, lw + glow * 0.4, { alpha: 0.25 * alpha });
    this.seg(c, a, b, mixHex(col.length === 7 ? col : '#ffffff', '#ffffff', 0.5), lw, { alpha });
    c.restore();
  }
  /** polyline through world points (near-clipped piece by piece) */
  pl3(c: Ctx, pts: V3[], col: string, lw = 1.5, o: { close?: boolean; alpha?: number; dash?: number[]; glow?: number } = {}) {
    if (pts.length < 2) return;
    c.save(); c.strokeStyle = col; c.lineWidth = lw * LW; c.lineCap = 'round'; c.lineJoin = 'round';
    if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    if (o.dash) c.setLineDash(o.dash);
    if (o.glow) { c.shadowBlur = o.glow; c.shadowColor = col; }
    c.beginPath();
    let pen = false;
    const n = this.near;
    const N = o.close ? pts.length : pts.length - 1;
    for (let i = 0; i < N; i++) {
      let A = this.cs(pts[i]!), B = this.cs(pts[(i + 1) % pts.length]!);
      if (A[2] < n && B[2] < n) { pen = false; continue; }
      let cutA = false;
      if (A[2] < n) { A = vlerp(A, B, (n - A[2]) / (B[2] - A[2])); cutA = true; }
      let cutB = false;
      if (B[2] < n) { B = vlerp(B, A, (n - B[2]) / (A[2] - B[2])); cutB = true; }
      const p = this.sp(A), q = this.sp(B);
      if (!pen || cutA) c.moveTo(p[0], p[1]);
      c.lineTo(q[0], q[1]);
      pen = !cutB;
    }
    c.stroke(); c.restore();
  }
  /** filled polygon (clipped against the near plane) */
  fill3(c: Ctx, pts: V3[], fill: string, o: { alpha?: number; stroke?: string; lw?: number } = {}) {
    const n = this.near;
    const Q = pts.map((p) => this.cs(p));
    const out: V3[] = [];
    for (let i = 0; i < Q.length; i++) {
      const A = Q[i]!, B = Q[(i + 1) % Q.length]!;
      const ia = A[2] >= n, ib = B[2] >= n;
      if (ia) out.push(A);
      if (ia !== ib) out.push(vlerp(A, B, (n - A[2]) / (B[2] - A[2])));
    }
    if (out.length < 3) return;
    c.save(); if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    c.beginPath();
    out.forEach((q, i) => { const s = this.sp(q); if (i) c.lineTo(s[0], s[1]); else c.moveTo(s[0], s[1]); });
    c.closePath();
    c.fillStyle = fill; c.fill();
    if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = (o.lw ?? 1.5) * LW; c.lineJoin = 'round'; c.stroke(); }
    c.restore();
  }
  /** a rectangle on a plane */
  rect3(c: Ctx, P: Pl, x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; lw?: number; alpha?: number; dash?: number[] } = {}) {
    const q: V3[] = [at(P, x, y), at(P, x + w, y), at(P, x + w, y + h), at(P, x, y + h)];
    if (o.fill) this.fill3(c, q, o.fill, { alpha: o.alpha });
    if (o.stroke) this.pl3(c, q, o.stroke, o.lw ?? 1.5, { close: true, alpha: o.alpha, dash: o.dash });
    // (box QA: an outlined box's screen quad, to find type that runs over its border)
    if (TEXT_QA.on && !MIRRORING && o.stroke && (o.alpha ?? 1) * c.globalAlpha > 0.3) {
      const cq = q.map((p) => this.cs(p));
      if (cq.every((p) => p[2] > this.near)) TEXT_QA.rects.push({ scene: this.ctx.id, q: cq.flatMap((p) => this.sp(p)) });
    }
  }
  /** a boxed label: the box is sized to the text, so the type never runs over its border */
  label3(c: Ctx, s: string, P: Pl, x: number, y: number, o: T3 & { fill?: string; stroke?: string; lw?: number; padX?: number; padY?: number }) {
    const w = this.tw3(s, o), h = CAP * o.size;
    const px = o.padX ?? 0.45 * o.size, py = o.padY ?? 0.45 * o.size;
    const x0 = (o.align ?? 'left') === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    this.rect3(c, P, x0 - px, y - h / 2 - py, w + 2 * px, h + 2 * py, { fill: o.fill, stroke: o.stroke, lw: o.lw, alpha: o.alpha });
    return this.text3(c, s, P, x, y, { ...o, mid: true });
  }
  /** wire box (axis aligned), optional faces */
  box3(c: Ctx, a: V3, b: V3, col: string, lw = 1.5, o: { fill?: string; alpha?: number } = {}) {
    const P: V3[] = [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]];
    if (o.fill) {
      const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
      // painter: far faces first
      const zs = faces.map((fc) => fc.reduce((s, i) => s + this.cs(P[i]!)[2], 0) / 4);
      faces.map((fc, i) => ({ fc, z: zs[i]! })).sort((x, y) => y.z - x.z).forEach(({ fc }) => this.fill3(c, fc.map((i) => P[i]!), o.fill!, { alpha: o.alpha }));
    }
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    this.segs(c, E.map(([i, j]) => [P[i!]!, P[j!]!] as [V3, V3]), col, lw, o.alpha ?? 1);
  }
  /** grid on a plane, fading with camera distance between fog[0] and fog[1] */
  grid3(c: Ctx, P: Pl, x0: number, x1: number, y0: number, y1: number, step: number, col: string, lw = 1, o: { alpha?: number; fog?: [number, number]; sub?: number; dash?: number[] } = {}) {
    const fog = o.fog ?? [1e9, 2e9];
    const buckets: [V3, V3][][] = Array.from({ length: 6 }, () => []);
    const sub = o.sub ?? 6;
    const push = (A: V3, B: V3) => {
      for (let i = 0; i < sub; i++) {
        const a = vlerp(A, B, i / sub), b = vlerp(A, B, (i + 1) / sub);
        const z = this.cs(vlerp(a, b, 0.5))[2];
        const k = 1 - clamp((z - fog[0]) / (fog[1] - fog[0]));
        if (k <= 0.02) continue;
        buckets[Math.min(5, Math.floor(k * 6))]!.push([a, b]);
      }
    };
    for (let x = Math.ceil(x0 / step) * step; x <= x1 + 1e-6; x += step) push(at(P, x, y0), at(P, x, y1));
    for (let y = Math.ceil(y0 / step) * step; y <= y1 + 1e-6; y += step) push(at(P, x0, y), at(P, x1, y));
    buckets.forEach((b, i) => this.segs(c, b, col, lw, (o.alpha ?? 1) * ((i + 0.5) / 6), o.dash));
  }
  /** a dot at a world point; r in world units (min 1 px) */
  dot3(c: Ctx, p: V3, r: number, fill?: string, o: { stroke?: string; lw?: number; alpha?: number; px?: boolean } = {}) {
    const q = this.pr(p);
    if (q.z < this.near) return null;
    const rr = o.px ? r : Math.max(0.6, r * q.k);
    if (rr > 3000 || q.x + rr < -10 || q.x - rr > W + 10 || q.y + rr < -10 || q.y - rr > H + 10) return null;
    c.save(); if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    c.beginPath(); c.arc(q.x, q.y, rr, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = (o.lw ?? 1.5) * LW; c.stroke(); }
    c.restore();
    return { ...q, r: rr };
  }
  /** a circle lying on a plane */
  ring3(c: Ctx, P: Pl, x: number, y: number, r: number, col: string, lw = 1.5, o: { fill?: string; alpha?: number; a0?: number; a1?: number; n?: number; dash?: number[] } = {}) {
    const n = o.n ?? 48, a0 = o.a0 ?? 0, a1 = o.a1 ?? Math.PI * 2;
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push(at(P, x + Math.cos(a) * r, y + Math.sin(a) * r)); }
    if (o.fill) this.fill3(c, pts, o.fill, { alpha: o.alpha });
    this.pl3(c, pts, col, lw, { alpha: o.alpha, dash: o.dash });
  }

  // ------------------------------------------------------------------ type on planes
  /** text width in world units (before `each` offsets) */
  tw3(s: string, o: { size: number; fam: string; track?: number }) {
    const L = layout(s, o.fam, 100);
    return (L.width + Math.max(0, Array.from(s).length - 1) * (o.track ?? 0) * 100) * (o.size / 100);
  }
  /**
   * Set a string on a plane, glyph by glyph (each glyph gets its own affine from the camera, so long words
   * on receding planes foreshorten correctly). (x, y) is the anchor on the plane (baseline, or cap middle).
   * Returns the run's width in world units.
   */
  text3(c: Ctx, s: string, P: Pl, x: number, y: number, o: T3): number {
    if (!s) return 0;
    const L = layout(s, o.fam, 100);
    const k = o.size / 100;
    const tr = (o.track ?? 0) * 100;
    const chars = Array.from(s);
    const width = (L.width + Math.max(0, chars.length - 1) * tr) * k;
    const x0 = (o.align ?? 'left') === 'center' ? x - width / 2 : o.align === 'right' ? x - width : x;
    const yb = o.mid ? y - (CAP * o.size) / 2 : y;
    c.save();
    if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    if (o.glow) {
      // (2026-10-10, "the light is too strong": a coloured glow is kept to a tight, half-strength halo; the dark
      // ones that keep type legible over busy ground stay as they were)
      const gc = o.glowColor ?? o.color ?? '#fff';
      const m = /^#([0-9a-f]{6})$/i.exec(gc);
      const lum = m ? (0.2126 * parseInt(m[1]!.slice(0, 2), 16) + 0.7152 * parseInt(m[1]!.slice(2, 4), 16) + 0.0722 * parseInt(m[1]!.slice(4, 6), 16)) / 255 : 0.5;
      if (lum > 0.2 && m) { c.shadowBlur = o.glow * 0.6; c.shadowColor = hexA(gc, 0.5); } else { c.shadowBlur = o.glow; c.shadowColor = gc; }
    }
    const ga = c.globalAlpha;
    // (overlap QA: the run's screen box and its strongest alpha)
    let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, bA = 0;
    const gl: number[] = []; // (QA: each glyph's own box — a tilted line's run box covers the lines next to it)
    let gbox: [number, number, number, number] | null = null;
    const colA = (col?: string) => { const mm = col ? /rgba\([^)]*,\s*([\d.]+)\)/.exec(col) : null; return mm ? +mm[1]! : 1; };
    for (let i = 0; i < L.glyphs.length; i++) {
      const g = L.glyphs[i]!;
      if (g.ch === ' ') continue;
      const m = o.each ? o.each(i, g.ch, L.glyphs.length) : null;
      if (o.each && m === null) continue;
      const sc = m?.sc ?? 1, sy = (m?.sy ?? 1) * sc;
      const gx = x0 + (g.x + i * tr) * k + (m?.dx ?? 0) * o.size;
      const gy = yb + (m?.dy ?? 0) * o.size;
      // glyph centre-bottom pivot for scaling
      const cx = gx + (g.w * k) / 2;
      const A = at(P, cx, gy);
      const qa = this.cs(A);
      if (qa[2] < this.near * 2) continue;
      const Rx = at(P, cx + g.w * k * 0.5, gy), Ux = at(P, cx, gy + o.size * 0.5);
      const pA = this.sp(qa), pR = this.sp(this.cs(Rx)), pU = this.sp(this.cs(Ux));
      // per glyph-px (font at 100 px): screen delta for +x and for +y (canvas y down = world −up)
      const ex = [(pR[0] - pA[0]) / (g.w * 0.5 || 1), (pR[1] - pA[1]) / (g.w * 0.5 || 1)];
      const ey = [-(pU[0] - pA[0]) / 50, -(pU[1] - pA[1]) / 50];
      const kx = Math.hypot(ex[0]!, ex[1]!), ky = Math.hypot(ey[0]!, ey[1]!);
      // cull: a glyph near the camera plane off to the side projects enormous — skip anything whose box misses the
      // frame or is many frames wide
      {
        const hw = (g.w * sc) / 2, up = -80 * sy, dn = 20 * sy;
        const xs = [-hw, hw, -hw, hw], ys = [up, up, dn, dn];
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let q = 0; q < 4; q++) {
          const X = pA[0] + ex[0]! * xs[q]! + ey[0]! * ys[q]!, Y = pA[1] + ex[1]! * xs[q]! + ey[1]! * ys[q]!;
          x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
        }
        if (x1 < -40 || x0 > W + 40 || y1 < -40 || y0 > H + 40) continue;
        if (x1 - x0 > W * 3 || y1 - y0 > H * 3) continue;
        const qr = this.cs(Rx), qu = this.cs(Ux);
        if (qr[2] < this.near * 2 || qu[2] < this.near * 2) continue;
        if (TEXT_QA.on) {
          // (the QA box is the ink: cap height over the baseline, no descender allowance)
          let a0 = 1e9, a1 = -1e9, c0 = 1e9, c1 = -1e9;
          const qx = [-hw * 0.9, hw * 0.9, -hw * 0.9, hw * 0.9], qy = [-72 * sy, -72 * sy, 0, 0];
          for (let q = 0; q < 4; q++) {
            const X = pA[0] + ex[0]! * qx[q]! + ey[0]! * qy[q]!, Y = pA[1] + ex[1]! * qx[q]! + ey[1]! * qy[q]!;
            a0 = Math.min(a0, X); a1 = Math.max(a1, X); c0 = Math.min(c0, Y); c1 = Math.max(c1, Y);
          }
          gbox = [a0, c0, a1, c1];
        }
      }
      const px = Math.max(4, Math.min(1400, 100 * Math.max(kx * sc, ky * sy)));
      const f = px / 100; // raster the glyph at px, so scale the matrix down by f
      let a = (ex[0]! * sc) / f, b = (ex[1]! * sc) / f, cc = (ey[0]! * sy) / f, d = (ey[1]! * sy) / f;
      if (m?.rot) { const cr = Math.cos(m.rot), sr = Math.sin(m.rot); [a, b, cc, d] = [a * cr + cc * sr, b * cr + d * sr, -a * sr + cc * cr, -b * sr + d * cr]; }
      c.setTransform(this.base.multiply(new DOMMatrix([a, b, cc, d, pA[0], pA[1]])));
      c.font = `${px}px "${o.fam}"`;
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.globalAlpha = ga * (m?.a ?? 1);
      if (c.globalAlpha <= 0.003) continue;
      if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = (o.strokeW ?? 2) / Math.max(1e-3, Math.hypot(a, b)); c.lineJoin = 'round'; c.strokeText(g.ch, 0, 0); }
      if (o.color || m?.color) { c.fillStyle = m?.color ?? o.color!; c.fillText(g.ch, 0, 0); }
      if (TEXT_QA.on && gbox) {
        const ea = c.globalAlpha * colA(m?.color ?? o.color);
        if (ea > 0.05) { bx0 = Math.min(bx0, gbox[0]); by0 = Math.min(by0, gbox[1]); bx1 = Math.max(bx1, gbox[2]); by1 = Math.max(by1, gbox[3]); bA = Math.max(bA, ea); if (ea > 0.45) gl.push(gbox[0], gbox[1], gbox[2], gbox[3]); }
      }
    }
    c.restore();
    if (TEXT_QA.on && !MIRRORING && bx1 > bx0) TEXT_QA.runs.push({ scene: this.ctx.id, s, x0: bx0, y0: by0, x1: bx1, y1: by1, a: bA, g: gl });
    return width;
  }
  /** the plane flipped so type set on it reads left → right and upright from the current camera */
  readable(P: Pl): Pl {
    // seen from its back, type would read mirrored: flip u first (mirror back) …
    let r = P.r, u = P.u;
    const n = vcross(r, u), toCam = vsub(this.key.p, P.o);
    if (vdot(n, toCam) < 0) u = vsc(u, -1) as V3;
    // … then, if it runs right-to-left on screen, turn it half a turn (both axes)
    const o = this.pr(P.o), rr = this.pr(vadd(P.o, r));
    if (rr.x < o.x) { r = vsc(r, -1) as V3; u = vsc(u, -1) as V3; }
    return { o: P.o, r, u };
  }
  /** on-screen cap height (px) of type of em size `size` at world point p */
  capPx(p: V3, size: number) { return this.pr(p).k * size * CAP; }

  /**
   * A lyric line set on a plane in rows (wrapped at maxW world units), karaoke by glyph: upcoming in `up` (or hidden
   * when up is ''), the sung part of the current word in `cur`, sung words in `done`. Returns word boxes in plane units.
   */
  say3(c: Ctx, words: Word[], t: number, P: Pl, x: number, y: number, o: T3 & { up: string; cur: string; done: string; maxW?: number; lead?: number; upper?: boolean; gap?: number; pop?: number; text?: (w: Word, i: number) => string; rise?: number; slam?: number }) {
    const gap = (o.gap ?? 0.28) * o.size, lead = o.lead ?? o.size * 1.05;
    const items = words.map((w, i) => { const s0 = o.text ? o.text(w, i) : w.w; const s = o.upper ? s0.toUpperCase() : s0; return { w, s, wd: this.tw3(s, o) }; });
    const rows: (typeof items)[] = [[]];
    let rw = 0;
    for (const it of items) {
      const cur = rows[rows.length - 1]!;
      if (o.maxW && cur.length && rw + gap + it.wd > o.maxW) { rows.push([it]); rw = it.wd; } else { cur.push(it); rw += (cur.length > 1 ? gap : 0) + it.wd; }
    }
    const boxes: { x: number; y: number; w: number; s: string; word: Word }[] = [];
    rows.forEach((row, ri) => {
      const total = row.reduce((a, b) => a + b.wd, 0) + gap * (row.length - 1);
      let xx = (o.align ?? 'left') === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
      const yy = y - ri * lead;
      for (const it of row) {
        const p = sungW(t, it.w);
        const n = Array.from(it.s).length;
        const pop = (o.pop ? o.pop * hot(t, it.w.start, 0.09) : 0) + (o.slam ? o.slam * Math.pow(1 - clamp((t - it.w.start) / 0.13), 3) : 0);
        const rise = o.rise ?? 0;
        if (t >= it.w.start || o.up) {
          this.text3(c, it.s, P, xx, yy, {
            ...o, align: 'left', color: undefined,
            each: (i) => {
              const lit = t >= it.w.start && (i + 0.5) / n <= p * 1.6 + 0.02;
              const col = !lit ? o.up : p >= 1 ? o.done : o.cur;
              if (!col) return null;
              const since = t - (it.w.start + (i / n) * (it.w.end - it.w.start) / 1.6);
              const dy = lit && rise ? -rise * Math.exp(-Math.max(0, since) * 14) : 0;
              return { color: col, sc: 1 + pop, dy };
            },
          });
        }
        boxes.push({ x: xx, y: yy, w: it.wd, s: it.s, word: it.w });
        xx += it.wd + gap;
      }
    });
    return boxes;
  }

  // ------------------------------------------------------------------ images on planes
  /** draw an image onto a rectangle of a plane (x, y = bottom-left; w, h world units), n×n affine cells */
  img3(c: Ctx, img: CanvasImageSource, iw: number, ih: number, P: Pl, x: number, y: number, w: number, h: number, o: { n?: number; alpha?: number; sx?: number; sy?: number; sw?: number; sh?: number; smooth?: boolean } = {}) {
    const n = o.n ?? 6;
    const sx = o.sx ?? 0, sy = o.sy ?? 0, sw = o.sw ?? iw, sh = o.sh ?? ih;
    const G: ([number, number] | null)[][] = [];
    for (let i = 0; i <= n; i++) {
      G.push([]);
      for (let j = 0; j <= n; j++) {
        const q = this.cs(at(P, x + (w * i) / n, y + h - (h * j) / n));
        G[i]!.push(q[2] > this.near ? this.sp(q) : null);
      }
    }
    c.save();
    if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
    c.imageSmoothingEnabled = o.smooth ?? true;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p00 = G[i]![j], p10 = G[i + 1]![j], p01 = G[i]![j + 1], p11 = G[i + 1]![j + 1];
      if (!p00 || !p10 || !p01 || !p11) continue;
      const u0 = sx + (sw * i) / n, u1 = sx + (sw * (i + 1)) / n, v0 = sy + (sh * j) / n, v1 = sy + (sh * (j + 1)) / n;
      this.tri(c, img, [u0, v0], [u1, v0], [u0, v1], p00, p10, p01, [u0, v0, u1, v1]);
      this.tri(c, img, [u1, v0], [u1, v1], [u0, v1], p10, p11, p01, [u0, v0, u1, v1]);
    }
    c.restore();
  }
  private tri(c: Ctx, img: CanvasImageSource, s0: number[], s1: number[], s2: number[], d0: number[], d1: number[], d2: number[], src: number[]) {
    const den = (s1[0]! - s0[0]!) * (s2[1]! - s0[1]!) - (s2[0]! - s0[0]!) * (s1[1]! - s0[1]!);
    if (Math.abs(den) < 1e-9) return;
    const a = ((d1[0]! - d0[0]!) * (s2[1]! - s0[1]!) - (d2[0]! - d0[0]!) * (s1[1]! - s0[1]!)) / den;
    const b = ((d1[1]! - d0[1]!) * (s2[1]! - s0[1]!) - (d2[1]! - d0[1]!) * (s1[1]! - s0[1]!)) / den;
    const cc = ((d2[0]! - d0[0]!) * (s1[0]! - s0[0]!) - (d1[0]! - d0[0]!) * (s2[0]! - s0[0]!)) / den;
    const d = ((d2[1]! - d0[1]!) * (s1[0]! - s0[0]!) - (d1[1]! - d0[1]!) * (s2[0]! - s0[0]!)) / den;
    const e = d0[0]! - a * s0[0]! - cc * s0[1]!;
    const f = d0[1]! - b * s0[0]! - d * s0[1]!;
    // clip to the triangle, grown by ~0.7 px to hide seams
    const mx = (d0[0]! + d1[0]! + d2[0]!) / 3, my = (d0[1]! + d1[1]! + d2[1]!) / 3;
    const grow = (p: number[]) => { const dx = p[0]! - mx, dy = p[1]! - my, l = Math.hypot(dx, dy) || 1; return [p[0]! + (dx / l) * 0.7, p[1]! + (dy / l) * 0.7]; };
    const g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);
    c.save();
    c.beginPath(); c.moveTo(g0[0]!, g0[1]!); c.lineTo(g1[0]!, g1[1]!); c.lineTo(g2[0]!, g2[1]!); c.closePath(); c.clip();
    c.setTransform(this.base.multiply(new DOMMatrix([a, b, cc, d, e, f])));
    const [u0, v0, u1, v1] = src as [number, number, number, number];
    const pad = 1;
    c.drawImage(img, u0 - pad, v0 - pad, u1 - u0 + 2 * pad, v1 - v0 + 2 * pad, u0 - pad, v0 - pad, u1 - u0 + 2 * pad, v1 - v0 + 2 * pad);
    c.restore();
  }

  /**
   * A lyric line set big, a phrase at a time (v4, the p(doom)-scale type): the words are packed greedily into chunks no
   * wider than maxW; the chunk holding the word being sung is shown (word by word, slamming, the sung word magenta), and
   * it cuts to the next chunk on that chunk's first word. Before the line: nothing; after it: the last chunk holds.
   */
  chunk3(c: Ctx, words: Word[], t: number, P: Pl, x: number, y: number, o: Partial<T3> & { size: number; maxW: number; upper?: boolean; text?: (w: Word, i: number) => string; slam?: number; hold?: number; lead?: number; rows?: number; breaks?: number[]; anchor?: (first: Word) => [number, number] }) {
    if (!words.length || t < words[0]!.start - 0.03) return;
    const fam = o.fam ?? UF.wide;
    const str = (w: Word, i: number) => { const s0 = o.text ? o.text(w, i) : w.w.replace(/[,.]$/, ''); return (o.upper ?? true) ? s0.toUpperCase() : s0; };
    const gap = 0.28 * o.size;
    const chunks: Word[][] = [[]];
    let rw = 0;
    words.forEach((w, i) => {
      const wd = this.tw3(str(w, i), { size: o.size, fam });
      const cur = chunks[chunks.length - 1]!;
      const brk = o.breaks ? o.breaks.includes(i) && i > 0 : cur.length > 0 && rw + gap + wd > o.maxW;
      if (brk) { chunks.push([w]); rw = wd; } else { cur.push(w); rw += (cur.length > 1 ? gap : 0) + wd; }
    });
    // explicit breaks: shrink any chunk wider than maxW to fit
    const fitK = (ch: Word[]) => { const wd = ch.reduce((a, w) => a + this.tw3(str(w, words.indexOf(w)), { size: o.size, fam }), 0) + gap * (ch.length - 1); return Math.min(1, o.maxW / Math.max(0.01, wd)); };
    // with rows > 1, chunks are shown in groups of `rows` lines (a block that cuts as a whole)
    const R = Math.max(1, o.rows ?? 1);
    let ci = 0;
    for (let k = 0; k < chunks.length; k++) if (t >= chunks[k]![0]!.start - 0.03) ci = k;
    const g0 = Math.floor(ci / R) * R;
    const last = words[words.length - 1]!;
    if (o.hold !== undefined && t > last.end + o.hold) return;
    const lead = o.lead ?? o.size * 0.95;
    for (let r = 0; r < R && g0 + r < chunks.length; r++) {
      const ch = chunks[g0 + r]!;
      if (t < ch[0]!.start - 0.03) continue;
      const kf = fitK(ch);
      const [ax, ay] = o.anchor ? o.anchor(ch[0]!) : [x, y];
      this.say3(c, ch, t, P, ax, ay - r * lead, { ...o, size: o.size * kf, fam, up: '', cur: o.color ?? U.mag, done: U.bone, align: o.align ?? 'center', upper: false, text: (w) => str(w, words.indexOf(w)), slam: o.slam ?? 0.35 });
    }
  }

  /**
   * A hero word: slams in at t0 (scale 1 + slam → 1 in 0.13 s, out-cubic) and is magenta while it is sung (t0 → t1),
   * bone after. Returns the width in plane units.
   */
  hero3(c: Ctx, s: string, P: Pl, x: number, y: number, t: number, t0: number, t1: number, o: Partial<T3> & { size: number; slam?: number; col?: string; after?: string }) {
    if (t < t0 - 0.02) return 0;
    const k = clamp((t - t0) / 0.13);
    const sc = 1 + (o.slam ?? 0.35) * Math.pow(1 - k, 3);
    const col = t < t1 ? (o.col ?? U.mag) : (o.after ?? U.bone);
    return this.text3(c, s, P, x, y, { fam: UF.wide, align: 'center', ...o, color: col, each: o.each ?? (() => ({ sc })) });
  }

  // ------------------------------------------------------------------ screen-space notes
  /** pdoom-style callout: a dot at the world point, an elbow leader, a small label (+ sub line) */
  note(c: Ctx, p: V3, dx: number, dy: number, label: string, o: { sub?: string; col?: string; sub2?: string; size?: number; alpha?: number; dot?: boolean; fam?: string } = {}) {
    if (MIRRORING) return;
    const q = this.pr(p);
    if (q.z < this.near) return;
    const col = o.col ?? '#EDEAF2', size = o.size ?? 15, fam = o.fam ?? F.mono(500);
    c.save();
    c.globalAlpha *= o.alpha ?? 1;
    c.font = `${size}px "${fam}"`;
    const wLab = Math.max(c.measureText(label).width, o.sub ? c.measureText(o.sub).width * 0.86 : 0);
    const ex = q.x + dx, ey = q.y + dy;
    const right = dx >= 0;
    c.strokeStyle = col; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(ex, ey); c.lineTo(ex + (right ? wLab + 10 : -wLab - 10), ey); c.stroke();
    if (o.dot ?? true) { c.fillStyle = col; c.beginPath(); c.arc(q.x, q.y, 3, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = col; c.textAlign = right ? 'left' : 'right'; c.textBaseline = 'alphabetic';
    c.fillText(label, ex + (right ? 5 : -5), ey - 6);
    if (o.sub) { c.font = `${size * 0.82}px "${fam}"`; c.globalAlpha *= 0.7; c.fillText(o.sub, ex + (right ? 5 : -5), ey + size * 1.05); }
    if (o.sub2) { c.font = `${size * 0.82}px "${fam}"`; c.fillText(o.sub2, ex + (right ? 5 : -5), ey + size * 2.05); }
    c.restore();
  }
  /** many small square points at world positions (fast path: no arcs, one fill per colour); size in px at depth 10 */
  points(c: Ctx, xyz: ArrayLike<number>, n: number, col: string, size = 2, alpha = 1) {
    c.save(); c.fillStyle = col; c.globalAlpha *= alpha;
    const R = this.R, U = this.U, Fw = this.Fw, p0 = this.key.p, f = this.f, near = this.near;
    for (let i = 0; i < n; i++) {
      const dx = xyz[i * 3]! - p0[0], dy = xyz[i * 3 + 1]! - p0[1], dz = xyz[i * 3 + 2]! - p0[2];
      const z = dx * Fw[0] + dy * Fw[1] + dz * Fw[2];
      if (z < near) continue;
      const x = W / 2 + (f * (dx * R[0] + dy * R[1] + dz * R[2])) / z, y = H / 2 - (f * (dx * U[0] + dy * U[1] + dz * U[2])) / z;
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      const s = Math.max(0.8, Math.min(8, (size * 10) / z));
      c.fillRect(x - s / 2, y - s / 2, s, s);
    }
    c.restore();
  }
  /**
   * The crown (2026-10-10 polish: the filled clip-art crowns read cheap): a wireframe band in thin light — a base
   * ring, a five-pointed top edge, struts — turning slowly, with a soft magenta core. p = centre of the band's foot.
   */
  crown3(c: Ctx, p: V3, s: number, t: number, col = '#EDEAF2', glow = '#FF2E7E') {
    const n = 60, spin = t * 0.9;
    const pt = (a: number, y: number, r: number): V3 => [p[0] + Math.cos(a) * r, p[1] + y, p[2] + Math.sin(a) * r];
    const lo: V3[] = [], mid: V3[] = [], hi: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 + spin;
      const u = ((i / n) * 5) % 1, spike = 1 - Math.abs(u - 0.5) * 2; // a sawtooth: five sharp points
      lo.push(pt(a, 0, 0.78 * s)); mid.push(pt(a, 0.22 * s, 0.8 * s)); hi.push(pt(a, (0.32 + 0.62 * Math.pow(spike, 1.6)) * s, 0.84 * s));
    }
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = this.pr(pt(0, 0.4 * s, 0));
    if (g.z > this.near) pool(c, g.x, g.y, Math.max(30, g.k * s * 1.6), glow, 0.35);
    c.restore();
    this.pl3(c, lo, col, 1.6); this.pl3(c, mid, col, 1.0, { alpha: 0.6 }); this.pl3(c, hi, col, 1.8, { glow: 6 });
    for (let k = 0; k < 10; k++) { const i = Math.round((k / 10) * n); this.seg(c, lo[i]!, hi[i]!, col, 1.0, { alpha: 0.7 }); }
    for (let k = 0; k < 5; k++) { const i = Math.round(((k + 0.5) / 5) * n); this.dot3(c, hi[i]!, 0.05 * s, '#FFFFFF'); }
  }
  /** the beats of the song inside [a, b) (alias kept short for plates) */
  B(a: number, b: number) { return this.beats(a, b); }
}

// ------------------------------------------------------------------ frame furniture (screen space)
/** corner brackets + a tiny tag in each corner: the plate's "instrument" frame */
export function frameMarks(c: Ctx, col: string, o: { tl?: string; tr?: string; bl?: string; br?: string; inset?: number; len?: number; alpha?: number; size?: number } = {}) {
  if (MIRRORING) return;
  const m = o.inset ?? 36, L = o.len ?? 26, s = o.size ?? 13;
  c.save();
  c.globalAlpha *= o.alpha ?? 0.8;
  c.strokeStyle = col; c.lineWidth = 1.5;
  const corners: [number, number, number, number][] = [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]];
  c.beginPath();
  for (const [x, y, sx, sy] of corners) { c.moveTo(x + sx * L, y); c.lineTo(x, y); c.lineTo(x, y + sy * L); }
  c.stroke();
  c.fillStyle = col; c.font = `${s}px "${F.mono(500)}"`; c.textBaseline = 'alphabetic';
  if (o.tl) { c.textAlign = 'left'; c.fillText(o.tl, m + L + 10, m + s * 0.4); }
  if (o.tr) { c.textAlign = 'right'; c.fillText(o.tr, W - m - L - 10, m + s * 0.4); }
  if (o.bl) { c.textAlign = 'left'; c.fillText(o.bl, m + L + 10, H - m + s * 0.35); }
  if (o.br) { c.textAlign = 'right'; c.fillText(o.br, W - m - L - 10, H - m + s * 0.35); }
  c.restore();
}

/** a radial vignette-ish glow pool (screen space) */
export function pool(c: Ctx, x: number, y: number, r: number, col: string, a = 0.5) {
  if (MIRRORING) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(col, a)); g.addColorStop(1, hexA(col, 0));
  c.save(); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
}

/** song-time timecode string m:ss.cc */
export const tc = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`;
