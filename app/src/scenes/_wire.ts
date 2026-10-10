// 2D-simulated 3D, the p(doom) way (user, 2026-10-10: "用 2D 模擬 3D，像 p(doom) 的 chinese room"):
// hairline wireframes and flat ink solids seen through a pinhole camera, type set on planes in the
// space, line debris, sparks and shock frames for the hits. No lighting, no materials, no models:
// a solid is a flat ink fill that hides the lines behind it, everything visible is a line or type.
//
//   const wire = new Wire();                          // one per plate
//   const box = new WObj(wire); box.box([-1,0,-1], [1,2,1]); wire.scene.add(box.group);
//   rig.apply(wire.cam, t); wire.begin(); box.push(); …; wire.draw(renderer, out);
//
// Everything is a pure function of song time t (closed-form motion, hashed randomness).
import * as THREE from 'three';
import { LineBatch } from '../engine/lines';
import { W, H, clearRT } from '../engine/gl';
import { LIN } from '../engine/palette';
import { ot, layout } from '../engine/type';
import { clamp, lerp, ease, hash, fbm1, TAU } from '../engine/util';
import { segMask, dotMask } from './_seg';

export type V3 = [number, number, number];
export type RGB = [number, number, number];
export const C = {
  ink: LIN.ink, ink2: LIN.ink2, graphite: LIN.graphite, ash: LIN.ash, bone: LIN.bone, signal: LIN.signal, ember: LIN.ember, blood: LIN.blood,
};
export const sc = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const mixc = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

export const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vsc = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const vlerp = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
export const vdot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vlen = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a: V3): V3 => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** Rodrigues rotation of v about unit axis k by angle a. */
export const vrot = (v: V3, k: V3, a: number): V3 => {
  const c = Math.cos(a), s = Math.sin(a), kv = vdot(k, v), x = vcross(k, v);
  return [v[0] * c + x[0] * s + k[0] * kv * (1 - c), v[1] * c + x[1] * s + k[1] * kv * (1 - c), v[2] * c + x[2] * s + k[2] * kv * (1 - c)];
};
/** Point on a sphere-ish orbit around c: yaw about +y from +z, pitch up, distance d. */
export const orbit = (c: V3, yaw: number, pitch: number, d: number): V3 =>
  [c[0] + Math.sin(yaw) * Math.cos(pitch) * d, c[1] + Math.sin(pitch) * d, c[2] + Math.cos(yaw) * Math.cos(pitch) * d];

// ====================================================================== camera
/** A camera pose: position, aim point, roll (rad), vertical fov (deg), optional up hint (for looking straight down). */
export interface Key { p: V3; tg: V3; roll: number; fov: number; up?: V3 }
export const K = (p: V3, tg: V3, fov = 40, roll = 0, up?: V3): Key => ({ p, tg, roll, fov, up });
export const lerpKey = (a: Key, b: Key, k: number): Key => ({
  p: vlerp(a.p, b.p, k), tg: vlerp(a.tg, b.tg, k), roll: lerp(a.roll, b.roll, k), fov: lerp(a.fov, b.fov, k),
  up: a.up || b.up ? vnorm(vlerp(a.up ?? [0, 1, 0], b.up ?? [0, 1, 0], k)) : undefined,
});
/** A shot: from t0 until the next shot. `snap` > 0: the reframe into it whips from the previous shot's pose (out-expo) instead of cutting. */
export interface Shot { t0: number; key: (t: number) => Key; snap?: number; name?: string }
/** A camera hit: damped shake + focal punch. amp ~ 0.3 (S) … 1 (L) … 2 (XL). */
export interface Hit { t: number; amp: number; dir?: 'v' | 'h'; hz?: number; decay?: number; punch?: number }
/** Two-key move inside a shot (eased). */
export const move = (a: Key, b: Key, t0: number, t1: number, e: (x: number) => number = ease.inOutCubic) =>
  (t: number) => lerpKey(a, b, e(clamp((t - t0) / Math.max(1e-6, t1 - t0))));

export class Rig {
  constructor(public shots: Shot[], public hits: Hit[] = [], public hand = 1, public seed = 7) {
    this.shots.sort((a, b) => a.t0 - b.t0);
  }
  index(t: number) { let i = 0; for (let k = 0; k < this.shots.length; k++) if (this.shots[k]!.t0 <= t) i = k; return i; }
  /** The hard cuts (shots entered without a snap), in song seconds. */
  cuts(): number[] { return this.shots.slice(1).filter((s) => !(s.snap && s.snap > 0)).map((s) => s.t0); }
  base(t: number): Key {
    const i = this.index(t), s = this.shots[i]!;
    let k = s.key(t);
    if (i > 0 && s.snap && t - s.t0 < s.snap) k = lerpKey(this.shots[i - 1]!.key(t), k, ease.outExpo(clamp((t - s.t0) / s.snap)));
    return k;
  }
  /** Shake state at t: angles (rad) and focal multiplier. */
  shake(t: number) {
    let pitch = 0, yaw = 0, roll = 0, fovK = 1;
    for (const h of this.hits) {
      const dt = t - h.t;
      if (dt < 0 || dt > 1.5) continue;
      const hz = h.hz ?? 11, dec = h.decay ?? 7;
      const osc = Math.exp(-dt * dec) * Math.sin(TAU * hz * dt);
      const a = h.amp * 0.012;
      if ((h.dir ?? 'v') === 'v') { pitch += a * osc; roll += a * 0.35 * Math.exp(-dt * dec * 0.7) * Math.sin(TAU * hz * 0.5 * dt + 1); }
      else { yaw += a * osc; roll += a * 0.6 * osc; }
      fovK *= 1 - (h.punch ?? 0.05) * h.amp * Math.exp(-dt * 14);
    }
    return { pitch, yaw, roll, fovK };
  }
  at(t: number): Key {
    const k = this.base(t);
    const s = this.shake(t);
    const d = vsub(k.tg, k.p), dist = vlen(d);
    const hs = this.hand;
    const off: V3 = [
      dist * (hs * 0.004 * fbm1(t * 0.45, 3, this.seed) + Math.tan(s.yaw)),
      dist * (hs * 0.003 * fbm1(t * 0.4, 3, this.seed + 9) + Math.tan(s.pitch)),
      0,
    ];
    // the offsets are in the camera's screen plane
    const { R, U } = basis(k);
    const tg = vadd(k.tg, vadd(vsc(R, off[0]), vsc(U, off[1])));
    return { ...k, tg, roll: k.roll + s.roll + hs * 0.003 * fbm1(t * 0.3, 2, this.seed + 3), fov: k.fov * s.fovK };
  }
  apply(cam: THREE.PerspectiveCamera, t: number) { setCam(cam, this.at(t)); }
}

/** Orthonormal camera basis for a key: right, up, forward (into the scene). */
export function basis(k: Key): { R: V3; U: V3; F: V3 } {
  const F = vnorm(vsub(k.tg, k.p));
  let up = k.up ?? [0, 1, 0];
  if (Math.abs(vdot(up, F)) > 0.995) up = [0, 0, -1];
  let R = vnorm(vcross(F, up));
  let U = vcross(R, F);
  if (k.roll) { R = vrot(R, F, -k.roll); U = vrot(U, F, -k.roll); }
  return { R, U, F };
}
const _m = new THREE.Matrix4();
export function setCam(cam: THREE.PerspectiveCamera, k: Key) {
  const { R, U, F } = basis(k);
  _m.set(R[0], U[0], -F[0], k.p[0], R[1], U[1], -F[1], k.p[1], R[2], U[2], -F[2], k.p[2], 0, 0, 0, 1);
  cam.matrixAutoUpdate = false;
  cam.matrix.copy(_m);
  cam.matrixWorld.copy(_m);
  cam.matrixWorldInverse.copy(_m).invert();
  cam.fov = k.fov;
  cam.aspect = W / H;
  cam.updateProjectionMatrix();
}

// ====================================================================== flat solids
const FLAT_VERT = /* glsl */ `
varying vec3 vN; varying float vD;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FLAT_FRAG = /* glsl */ `
varying vec3 vN; varying float vD;
uniform vec3 col; uniform vec3 fogCol; uniform vec2 fog; uniform float opacity;
void main() {
  vec3 n = normalize(vN);
  float k = 0.82 + 0.18 * max(n.y, 0.0) + 0.06 * n.x - 0.05 * max(-n.y, 0.0);
  float f = smoothstep(fog.x, fog.y, vD);
  gl_FragColor = vec4(mix(col * k, fogCol, f), opacity);
}`;
/** A flat ink material: faces barely differ by orientation (top a hair lighter), fogs to ink with distance, pushed back so edges on it draw. */
export function flatMat(col: RGB = C.ink2, opacity = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FLAT_VERT, fragmentShader: FLAT_FRAG,
    uniforms: { col: { value: new THREE.Vector3(...col) }, fogCol: { value: new THREE.Vector3(...C.ink) }, fog: { value: new THREE.Vector2(60, 400) }, opacity: { value: opacity } },
    polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 3,
    transparent: opacity < 1, depthWrite: opacity >= 1,
  });
}

// ====================================================================== the line world
/** Per-segment record in a WObj: local a, b, width px, linear colour, alpha. */
const SEG = 11;

export class Wire {
  lines: LineBatch;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, W / H, 0.05, 4000);
  /** distance fog of the lines (alpha → 0 between near and far, m) */
  fog: [number, number] = [60, 400];
  private camPos = new THREE.Vector3();
  private camF = new THREE.Vector3();
  constructor(capacity = 120000) {
    this.lines = new LineBatch(capacity, { screen2D: false, depthTest: true, blend: 'add' });
  }
  begin() {
    this.lines.clear();
    this.cam.updateMatrixWorld();
    this.camPos.setFromMatrixPosition(this.cam.matrixWorld);
    this.camF.set(0, 0, -1).transformDirection(this.cam.matrixWorld);
  }
  /** View depth of a world point. */
  depth(x: number, y: number, z: number) {
    return (x - this.camPos.x) * this.camF.x + (y - this.camPos.y) * this.camF.y + (z - this.camPos.z) * this.camF.z;
  }
  /** World segment; alpha fades with view depth (fog). Width in px (screen). */
  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, c: RGB, a = 1) {
    const d = this.depth((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    const f = 1 - clamp((d - this.fog[0]) / (this.fog[1] - this.fog[0]));
    const al = a * f;
    if (al < 0.004) return;
    // near-plane: drop segments entirely behind the lens, trim the ones crossing it
    const da = this.depth(ax, ay, az), db = this.depth(bx, by, bz), n = 0.08;
    if (da < n && db < n) return;
    if (da < n || db < n) {
      const k = (n - da) / (db - da);
      const x = ax + (bx - ax) * k, y = ay + (by - ay) * k, z = az + (bz - az) * k;
      if (da < n) { ax = x; ay = y; az = z; } else { bx = x; by = y; bz = z; }
    }
    this.lines.seg(ax, ay, az, bx, by, bz, w, c[0], c[1], c[2], al);
  }
  v(a: V3, b: V3, w: number, c: RGB, al = 1) { this.seg(a[0], a[1], a[2], b[0], b[1], b[2], w, c, al); }
  /** Polyline through points. */
  poly(pts: V3[], w: number, c: RGB, a = 1, closed = false) {
    for (let i = 1; i < pts.length; i++) this.v(pts[i - 1]!, pts[i]!, w, c, a);
    if (closed && pts.length > 2) this.v(pts[pts.length - 1]!, pts[0]!, w, c, a);
  }
  /** Clear `out` to the void, draw the solids and type planes, then the lines over them (depth-tested). */
  draw(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, bg: RGB = C.ink, clear = true) {
    if (clear) clearRT(renderer, out, bg);
    renderer.setRenderTarget(out);
    renderer.render(this.scene, this.cam);
    this.lines.render(renderer, out, this.cam);
  }
}

/** A movable object: a THREE group (solids, type planes as children) + its line segments in local space. */
export class WObj {
  group = new THREE.Group();
  private s: number[] = [];
  /** shows/hides both the lines and the solids / type planes */
  get visible() { return this.group.visible; }
  set visible(v: boolean) { this.group.visible = v; }
  /** multiplies every segment's alpha / colour (fade, flash) */
  alpha = 1;
  gain = 1;
  constructor(public wire: Wire, parent?: THREE.Object3D) { (parent ?? wire.scene).add(this.group); }
  get nSeg() { return this.s.length / SEG; }
  seg(a: V3, b: V3, w = 1.2, c: RGB = C.bone, al = 1) { this.s.push(a[0], a[1], a[2], b[0], b[1], b[2], w, c[0], c[1], c[2], al); return this; }
  poly(pts: V3[], w = 1.2, c: RGB = C.bone, al = 1, closed = false) {
    for (let i = 1; i < pts.length; i++) this.seg(pts[i - 1]!, pts[i]!, w, c, al);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1]!, pts[0]!, w, c, al);
    return this;
  }
  /** Long straight edges are split so near-clipping and fog stay smooth. */
  long(a: V3, b: V3, n: number, w = 1.2, c: RGB = C.bone, al = 1) {
    for (let i = 0; i < n; i++) this.seg(vlerp(a, b, i / n), vlerp(a, b, (i + 1) / n), w, c, al);
    return this;
  }
  /** Box edges (12) and optionally a flat solid that hides what is behind it. */
  box(min: V3, max: V3, o: { fill?: RGB | null; w?: number; c?: RGB; a?: number; split?: number; opacity?: number } = {}) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const w = o.w ?? 1.2, c = o.c ?? C.bone, a = o.a ?? 1, n = o.split ?? 1;
    const P = (x: number, y: number, z: number): V3 => [x, y, z];
    const e: [V3, V3][] = [
      [P(x0, y0, z0), P(x1, y0, z0)], [P(x1, y0, z0), P(x1, y0, z1)], [P(x1, y0, z1), P(x0, y0, z1)], [P(x0, y0, z1), P(x0, y0, z0)],
      [P(x0, y1, z0), P(x1, y1, z0)], [P(x1, y1, z0), P(x1, y1, z1)], [P(x1, y1, z1), P(x0, y1, z1)], [P(x0, y1, z1), P(x0, y1, z0)],
      [P(x0, y0, z0), P(x0, y1, z0)], [P(x1, y0, z0), P(x1, y1, z0)], [P(x1, y0, z1), P(x1, y1, z1)], [P(x0, y0, z1), P(x0, y1, z1)],
    ];
    for (const [p, q] of e) this.long(p, q, n, w, c, a);
    if (o.fill !== null) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), flatMat(o.fill ?? C.ink2, o.opacity ?? 1));
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      this.group.add(m);
    }
    return this;
  }
  /** A flat filled quad (two triangles) + its outline: corners in order. */
  quad(p: [V3, V3, V3, V3], o: { fill?: RGB | null; w?: number; c?: RGB; a?: number; opacity?: number } = {}) {
    this.poly(p, o.w ?? 1.2, o.c ?? C.bone, o.a ?? 1, true);
    if (o.fill !== null) {
      const g = new THREE.BufferGeometry();
      const v = [...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, flatMat(o.fill ?? C.ink2, o.opacity ?? 1));
      (m.material as THREE.ShaderMaterial).side = THREE.DoubleSide;
      this.group.add(m);
    }
    return this;
  }
  /** Grid of lines on a plane spanned by u, v from origin o (counts nu × nv cells). */
  grid(o: V3, u: V3, v: V3, nu: number, nv: number, w = 0.8, c: RGB = C.graphite, a = 0.5) {
    for (let i = 0; i <= nu; i++) { const p = vadd(o, vsc(u, i / nu)); this.long(p, vadd(p, v), Math.max(1, nv), w, c, a); }
    for (let j = 0; j <= nv; j++) { const p = vadd(o, vsc(v, j / nv)); this.long(p, vadd(p, u), Math.max(1, nu), w, c, a); }
    return this;
  }
  /** Text outline as line segments on the local XY plane (baseline y = 0, left x = 0 unless centred). */
  text(t: string, family: string, capH: number, o: { at?: V3; cx?: boolean; w?: number; c?: RGB; a?: number; track?: number; rotY?: number } = {}) {
    const g = glyphOutline(t, family, capH, o.track ?? 0);
    const ox = o.cx ? -g.width / 2 : 0;
    const at = o.at ?? [0, 0, 0];
    const cy = Math.cos(o.rotY ?? 0), sy = Math.sin(o.rotY ?? 0);
    const tf = (x: number, y: number): V3 => [at[0] + (x + ox) * cy, at[1] + y, at[2] - (x + ox) * sy];
    for (let i = 0; i < g.segs.length; i += 4) this.seg(tf(g.segs[i]!, g.segs[i + 1]!), tf(g.segs[i + 2]!, g.segs[i + 3]!), o.w ?? 1.1, o.c ?? C.bone, o.a ?? 1);
    return g;
  }
  /** Push this frame's segments (transformed) into the wire. */
  push(alphaMul = 1, gainMul = 1, filter?: (i: number) => number) {
    if (!this.group.visible) return;
    this.group.updateMatrixWorld(true);
    const e = this.group.matrixWorld.elements, s = this.s, wire = this.wire;
    const g = this.gain * gainMul, am = this.alpha * alphaMul;
    if (am <= 0.002) return;
    for (let i = 0, n = 0; i < s.length; i += SEG, n++) {
      const k = filter ? filter(n) : 1;
      if (k <= 0) continue;
      const ax = s[i]!, ay = s[i + 1]!, az = s[i + 2]!, bx = s[i + 3]!, by = s[i + 4]!, bz = s[i + 5]!;
      wire.seg(
        e[0]! * ax + e[4]! * ay + e[8]! * az + e[12]!, e[1]! * ax + e[5]! * ay + e[9]! * az + e[13]!, e[2]! * ax + e[6]! * ay + e[10]! * az + e[14]!,
        e[0]! * bx + e[4]! * by + e[8]! * bz + e[12]!, e[1]! * bx + e[5]! * by + e[9]! * bz + e[13]!, e[2]! * bx + e[6]! * by + e[10]! * bz + e[14]!,
        s[i + 6]!, [s[i + 7]! * g, s[i + 8]! * g, s[i + 9]! * g], s[i + 10]! * am * k,
      );
    }
  }
}

// ====================================================================== type
export interface Outline { segs: Float32Array; width: number; capH: number; glyphs: { ch: string; x0: number; x1: number; s0: number; s1: number }[] }
const outlineCache = new Map<string, Outline>();
/** Glyph outlines of a string as 2D segments (x right, y UP, baseline 0), scaled so the cap height is capH. */
export function glyphOutline(text: string, family: string, capH: number, tracking = 0): Outline {
  const key = `${text}|${family}|${capH}|${tracking}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const f = ot(family);
  const size = 200;
  const lay = layout(text, family, size, tracking * size);
  const cap = (f.tables.os2?.sCapHeight ?? f.unitsPerEm * 0.7) / f.unitsPerEm * size;
  const k = capH / cap;
  const out: number[] = [];
  const glyphs: Outline['glyphs'] = [];
  for (const g of lay.glyphs) {
    const s0 = out.length / 4;
    let px = 0, py = 0, sx = 0, sy = 0;
    const L = (x: number, y: number) => { out.push(px * k, -py * k, x * k, -y * k); px = x; py = y; };
    for (const c of f.charToGlyph(g.ch).getPath(g.x, 0, size).commands as any[]) {
      if (c.type === 'M') { px = sx = c.x; py = sy = c.y; }
      else if (c.type === 'L') L(c.x, c.y);
      else if (c.type === 'Q') { const x0 = px, y0 = py; for (let i = 1; i <= 5; i++) { const u = i / 5, v = 1 - u; L(v * v * x0 + 2 * v * u * c.x1 + u * u * c.x, v * v * y0 + 2 * v * u * c.y1 + u * u * c.y); } }
      else if (c.type === 'C') { const x0 = px, y0 = py; for (let i = 1; i <= 6; i++) { const u = i / 6, v = 1 - u; L(v * v * v * x0 + 3 * v * v * u * c.x1 + 3 * v * u * u * c.x2 + u * u * u * c.x, v * v * v * y0 + 3 * v * v * u * c.y1 + 3 * v * u * u * c.y2 + u * u * u * c.y); } }
      else if (c.type === 'Z') { if (px !== sx || py !== sy) L(sx, sy); }
    }
    glyphs.push({ ch: g.ch, x0: g.x * k, x1: (g.x + g.w) * k, s0, s1: out.length / 4 });
  }
  const o: Outline = { segs: Float32Array.from(out), width: lay.width * k, capH, glyphs };
  outlineCache.set(key, o);
  return o;
}

// ====================================================================== displays drawn in lines
/** A frame for display/type placement: origin + right/up axes (unit), all world space. */
export interface Plane { o: V3; r: V3; u: V3 }
export const planeAt = (o: V3, yaw = 0, pitch = 0): Plane => {
  let r: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)], u: V3 = [0, 1, 0];
  if (pitch) { u = vrot(u, r, pitch); }
  return { o, r, u };
};
export const onPlane = (P: Plane, x: number, y: number, z = 0): V3 => {
  const n = vcross(P.r, P.u);
  return [P.o[0] + P.r[0] * x + P.u[0] * y + n[0] * z, P.o[1] + P.r[1] * x + P.u[1] * y + n[1] * z, P.o[2] + P.r[2] * x + P.u[2] * y + n[2] * z];
};
/**
 * 5×7 dot-matrix text on a plane (dots as round capsules). `lit(i)` 0..1 per character (0 = unlit dots, faint);
 * cell height cellH (m), left-aligned at x = 0, baseline y = 0. Returns the width.
 */
export function dots(wire: Wire, P: Plane, text: string, cellH: number, lit: (i: number) => number, o: { c?: RGB; off?: number; px?: number; gain?: number } = {}) {
  const pitch = cellH / 7, cw = pitch * 6;
  const c = o.c ?? C.bone, off = o.off ?? 0.05, g = o.gain ?? 1;
  for (let i = 0; i < text.length; i++) {
    const [m0, m1] = dotMask(text[i]!);
    const L = clamp(lit(i));
    for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) {
      const bit = r < 4 ? (m0 >> (r * 5 + col)) & 1 : (m1 >> ((r - 4) * 5 + col)) & 1;
      const k = bit ? lerp(off, 1, L) : off * 0.6;
      if (k < 0.01) continue;
      const p = onPlane(P, i * cw + (col + 0.5) * pitch, (6.5 - r) * pitch);
      const w = (o.px ?? 1) * (bit && L > 0 ? 1 : 0.6);
      wire.seg(p[0], p[1], p[2], p[0] + 1e-4, p[1], p[2], w, sc(c, g * (bit && L > 0.5 ? 1.25 : 1)), k);
    }
  }
  return text.length * cw;
}
/** Dot size for `dots` that reads as a dot at this distance: pixel width from cell height and depth. */
export function dotPx(wire: Wire, P: Plane, cellH: number) {
  const d = Math.max(0.1, wire.depth(P.o[0], P.o[1], P.o[2]));
  const f = H / 2 / Math.tan((wire.cam.fov * Math.PI) / 360);
  return Math.max(1.2, (cellH / 7) * 0.62 * f / d);
}

const SEG16: Record<string, [number, number, number, number]> = {
  // unit cell 0..1 × 0..2 (x right, y up); a1 a2 b c d1 d2 e f g1 g2 h i j k l m
  a1: [0.08, 2, 0.5, 2], a2: [0.5, 2, 0.92, 2], b: [1, 1.92, 1, 1.08], c: [1, 0.92, 1, 0.08], d1: [0.08, 0, 0.5, 0], d2: [0.5, 0, 0.92, 0],
  e: [0, 0.08, 0, 0.92], f: [0, 1.08, 0, 1.92], g1: [0.08, 1, 0.46, 1], g2: [0.54, 1, 0.92, 1], h: [0.1, 1.9, 0.44, 1.1], i: [0.5, 1.9, 0.5, 1.1],
  j: [0.9, 1.9, 0.56, 1.1], k: [0.44, 0.9, 0.1, 0.1], l: [0.5, 0.9, 0.5, 0.1], m: [0.56, 0.9, 0.9, 0.1],
};
const S16N = ['a1', 'a2', 'b', 'c', 'd1', 'd2', 'e', 'f', 'g1', 'g2', 'h', 'i', 'j', 'k', 'l', 'm'];
/** 16-segment text on a plane: segments as strokes. cellH = glyph height (m). Unlit segments are drawn faint (ghost). */
export function seg16(wire: Wire, P: Plane, text: string, cellH: number, lit: (i: number) => number, o: { c?: RGB; px?: number; ghost?: number; gain?: number; slant?: number } = {}) {
  const s = cellH / 2, cw = s * 1.45;
  const c = o.c ?? C.bone, ghost = o.ghost ?? 0.06, sl = o.slant ?? 0.12;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const mask = segMask(ch, 16);
    const L = clamp(lit(i));
    for (let b = 0; b < 17; b++) {
      const on = (mask >> b) & 1;
      if (b === 16) {
        if (on && L > 0) { const p = onPlane(P, i * cw + s * 1.12, 0); wire.seg(p[0], p[1], p[2], p[0] + 1e-4, p[1], p[2], (o.px ?? 2) * 1.3, sc(c, o.gain ?? 1), L); }
        continue;
      }
      const k = on ? lerp(ghost, 1, L) : ghost;
      const q = SEG16[S16N[b]!]!;
      const A = onPlane(P, i * cw + (q[0] + q[1] * sl) * s, q[1] * s), B = onPlane(P, i * cw + (q[2] + q[3] * sl) * s, q[3] * s);
      wire.seg(A[0], A[1], A[2], B[0], B[1], B[2], o.px ?? 2, sc(c, (o.gain ?? 1) * (on && L > 0.5 ? 1.2 : 1)), k);
    }
  }
  return text.length * cw;
}

// ====================================================================== effects (closed-form)
/** Ballistic point: p0 + v·dt + ½·g·dt² (g down). */
export const fall = (p0: V3, v: V3, dt: number, g = 9.81): V3 => [p0[0] + v[0] * dt, p0[1] + v[1] * dt - 0.5 * g * dt * dt, p0[2] + v[2] * dt];

/**
 * Shatter a set of local 2D outline segments placed on plane P: at t0 every segment flies off from `impact` with
 * a spin; fades out over `life`. Before t0 nothing is drawn (draw the intact type yourself).
 */
export function shatter(wire: Wire, P: Plane, segs: Float32Array, t0: number, t: number, o: { impact: V3; speed?: number; up?: number; life?: number; w?: number; c?: RGB; seed?: number; floorY?: number; slow?: (dt: number) => number }) {
  if (t < t0) return;
  const dt0 = t - t0, life = o.life ?? 1.6;
  if (dt0 > life) return;
  const dt = o.slow ? o.slow(dt0) : dt0;
  const fade = 1 - ease.inQuad(dt0 / life);
  const sp = o.speed ?? 9, up = o.up ?? 3, seed = o.seed ?? 1;
  for (let i = 0; i < segs.length; i += 4) {
    const a = onPlane(P, segs[i]!, segs[i + 1]!), b = onPlane(P, segs[i + 2]!, segs[i + 3]!);
    const m = vlerp(a, b, 0.5), h = vsc(vsub(b, a), 0.5);
    const j = i / 4;
    const r1 = hash(j, seed, 1), r2 = hash(j, seed, 2), r3 = hash(j, seed, 3);
    const dir = vnorm(vadd(vsub(m, o.impact), [r1 - 0.5, r2 - 0.3, r3 - 0.5]));
    const v = vadd(vsc(dir, sp * (0.4 + r2)), [0, up * (0.5 + r1), 0]);
    let p = fall(m, v, dt);
    if (o.floorY !== undefined && p[1] < o.floorY) p = [p[0], o.floorY, p[2]];
    const ax = vnorm([r3 - 0.5, r1 - 0.5, r2 - 0.5]);
    const hh = vrot(h, ax, dt * (3 + 9 * r3));
    wire.v(vsub(p, hh), vadd(p, hh), o.w ?? 1.4, o.c ?? C.bone, fade);
  }
}

/** Spark streaks from a point: n streaks, white-hot heads cooling to ash, each a short trail along its path. */
export function sparks(wire: Wire, at: V3, t0: number, t: number, o: { n?: number; speed?: number; up?: number; life?: number; seed?: number; dir?: V3; spread?: number; c?: RGB; w?: number; floorY?: number } = {}) {
  const dt = t - t0, life = o.life ?? 0.55;
  if (dt < 0 || dt > life * 1.6) return;
  const n = o.n ?? 40, sp = o.speed ?? 14, seed = o.seed ?? 3, spread = o.spread ?? 1;
  const base = o.dir ? vnorm(o.dir) : null;
  for (let i = 0; i < n; i++) {
    const r1 = hash(i, seed, 11), r2 = hash(i, seed, 12), r3 = hash(i, seed, 13), r4 = hash(i, seed, 14);
    const L = life * (0.5 + r4);
    if (dt > L) continue;
    let d: V3 = vnorm([r1 - 0.5, r2 * 0.8 + 0.1, r3 - 0.5]);
    if (base) d = vnorm(vadd(base, vsc(d, spread)));
    const v = vsc(d, sp * (0.45 + r2 * 0.8));
    v[1] += o.up ?? 2;
    const tail = 0.035 + 0.02 * r1;
    let p1 = fall(at, v, dt), p0 = fall(at, v, Math.max(0, dt - tail));
    if (o.floorY !== undefined) { if (p1[1] < o.floorY) p1 = [p1[0], o.floorY, p1[2]]; if (p0[1] < o.floorY) p0 = [p0[0], o.floorY, p0[2]]; }
    const k = 1 - dt / L;
    const col = mixc(o.c ?? C.bone, C.ash, 1 - k);
    wire.v(p0, p1, (o.w ?? 1.6) * (0.6 + 0.6 * k), sc(col, 1 + 2.2 * k * k), k);
  }
}

/** A square shock frame racing out on a horizontal plane at height y (the world is square: no rings). */
export function shockSquare(wire: Wire, c: V3, t0: number, t: number, o: { r0?: number; r1?: number; dur?: number; w?: number; col?: RGB; n?: number } = {}) {
  const dt = t - t0, dur = o.dur ?? 0.7;
  if (dt < 0 || dt > dur) return;
  const k = ease.outCubic(dt / dur);
  const n = o.n ?? 3;
  for (let j = 0; j < n; j++) {
    const kk = clamp(k - j * 0.08);
    if (kk <= 0) continue;
    const r = lerp(o.r0 ?? 0.5, o.r1 ?? 30, kk);
    const a = (1 - kk) * (j === 0 ? 1 : 0.4);
    const P = (x: number, z: number): V3 => [c[0] + x, c[1], c[2] + z];
    const pts = [P(-r, -r), P(r, -r), P(r, r), P(-r, r)];
    for (let i = 0; i < 4; i++) {
      const A = pts[i]!, B = pts[(i + 1) % 4]!;
      for (let s = 0; s < 8; s++) wire.v(vlerp(A, B, s / 8), vlerp(A, B, (s + 1) / 8), (o.w ?? 2.2) * (1 - kk * 0.5), sc(o.col ?? C.bone, 1.4), a);
    }
  }
}

/** Branching frost / crack lines growing from p over [t0, t0+dur] on a plane (deterministic dendrite). */
export function dendrite(wire: Wire, P: Plane, x: number, y: number, t0: number, t: number, o: { len?: number; depth?: number; seed?: number; dur?: number; c?: RGB; w?: number; a?: number; ang?: number } = {}) {
  const prog = clamp((t - t0) / (o.dur ?? 0.4));
  if (prog <= 0) return;
  const seed = o.seed ?? 1, maxD = o.depth ?? 4;
  const rec = (x0: number, y0: number, ang: number, len: number, d: number, id: number, start: number) => {
    const p = clamp((prog - start) / (1 - start));
    if (p <= 0) return;
    const x1 = x0 + Math.cos(ang) * len * p, y1 = y0 + Math.sin(ang) * len * p;
    const A = onPlane(P, x0, y0), B = onPlane(P, x1, y1);
    wire.v(A, B, (o.w ?? 1) * (1 - d * 0.15), o.c ?? C.bone, (o.a ?? 0.8) * (1 - d * 0.12));
    if (d >= maxD || p < 1) return;
    const n = 2 + (hash(id, seed) > 0.6 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const da = (hash(id, k, seed) - 0.5) * 1.6;
      rec(x1, y1, ang + da, len * (0.55 + 0.2 * hash(id, k, seed + 1)), d + 1, id * 3 + k + 1, start + (1 - start) * 0.35);
    }
  };
  rec(x, y, o.ang ?? hash(seed, 9) * TAU, o.len ?? 0.6, 0, 1, 0);
}

/** Word timing helpers. */
export const sung = (t: number, start: number, end: number) => clamp((t - start) / Math.max(0.02, end - start));
export const hot = (t: number, start: number, hl = 0.06) => (t < start ? 0 : Math.pow(0.5, (t - start) / hl));
