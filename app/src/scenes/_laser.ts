// Galvo laser (TREATMENT §7.1 F1 marking, F6 vector projection). Owner: fab.
//
// The galvo head lives on a machine (the B rail over the WELL, a gantry, K1's nameplate arm). Its spot IS the
// sing-along cursor. The B5 schedule times the spot so it arrives at each letter on that letter's syllable
// (syl.json parts: 'guar|an|teed' → G-U-A-R during 'guar'; letters within a syllable by width), moving across each
// letter on a quintic minimum-jerk profile (B5 = the 5th-order blend: it settles at every letter boundary, the
// stop-start of a real marking head) while hatching it top to bottom. F1 ablation: the black anodising burns off to the
// white oxide behind the spot (only there: unmarked letters do not exist yet; a 20 % graphite toolpath preview shows
// where they will be), the spot is white-hot (> 1.0, the only F1 part that blooms), with fine smoke as closed-form
// particles. F6: a vector-laser projector traces the glyph outlines letter by letter (line ≥ 3 px), light only.
// p1v4 (KITS §23): no toolpath preview by default (FabOpts.preview: true for the v3 dashes — they read the unsung
// word); after the line the mark drops to the v4 ash and goes (old 'fade', default) and the projection dies with it.
//
//   const plan = laserPlan(word, glyphSpans, text);     // glyphSpans: [x0, x1] of each letter in face-local x
//   const s = laserSpot(plan, t);                       // { x, y, on, letter, hot }
//   galvo.aim(face.localToWorld(new Vector3(s.x, s.y * capH, 0)), s.on ? 1 : 0);
//   const f = laserMark({ scene, word, method: 'F1', capH: 1.2, parent: plate, galvo });   // registered carrier
//   const p = projectWord({ scene, word, method: 'F6', capH: 0.5, parent: screen, from: new Vector3(0, 1.4, 1.2) });
import * as THREE from 'three';
import type { Word } from '../engine/lyrics';
import { Lyrics } from '../engine/lyrics';
import { F } from '../engine/type';
import { GLSL_COMMON } from '../engine/glsl/common';
import { LIN } from '../engine/palette';
import { fabText, lyricReg, sungState, SUNG_T, type SungState } from '../engine/lyricreg';
import { mat } from './_mat';
import {
  textMask, faceDecal, resolveCap, registerFab, fabLong, letterCursor, syllableParts, bevelBox, capScrew, fabV4, setFabLook, faceRefIn,
  type Fab, type FabOpts,
} from './_fab';

export interface LaserGlyph { ch: string; x0: number; x1: number; t0: number; t1: number }
export interface LaserPlan { word: Word; glyphs: LaserGlyph[]; /** face-local x of the first / last glyph edge */ x0: number; x1: number }

/**
 * B5 letter schedule of a word: letter k is marked during [t0, t1], the times the syllable-aware cursor (fab's
 * letterCursor over Lyrics.wordProgress) crosses its left and right edges.
 */
export function laserPlan(word: Word, glyphSpans: readonly [number, number][], text = ''): LaserPlan {
  const n = glyphSpans.length;
  const x0 = n ? glyphSpans[0]![0] : 0, x1 = n ? glyphSpans[n - 1]![1] : 1, W = Math.max(1e-9, x1 - x0);
  const chars = Array.from(text);
  const map = chars.length === n ? letterCursor(word, text, glyphSpans) : (p: number) => p;
  // time at which the mapped cursor reaches u (monotone): bisection over the word
  const timeAt = (u: number) => {
    if (u <= 0) return word.start;
    let lo = word.start, hi = word.end;
    for (let i = 0; i < 36; i++) { const m = (lo + hi) / 2; if (map(Lyrics.wordProgress(word, m)) < u) lo = m; else hi = m; }
    return hi;
  };
  const glyphs: LaserGlyph[] = [];
  for (let k = 0; k < n; k++) {
    const [a, b] = glyphSpans[k]!;
    glyphs.push({ ch: chars[k] ?? '', x0: a, x1: b, t0: timeAt((a - x0) / W), t1: timeAt((b - x0) / W) });
  }
  void syllableParts;
  return { word, glyphs, x0, x1 };
}

const quintic = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);

/**
 * The spot at t: face-local x, y (0..1 of the cap: hatching), whether the beam is on, the letter index (−1 idle) and the
 * white-hot level. x is the fabrication front: the F1 mark exists for every face x < spot x.
 */
export function laserSpot(plan: LaserPlan, t: number): { x: number; y: number; on: boolean; letter: number; hot: number } {
  const g = plan.glyphs;
  if (!g.length) return { x: 0, y: 0.5, on: false, letter: -1, hot: 0 };
  if (t < g[0]!.t0) return { x: g[0]!.x0, y: 0.5, on: false, letter: -1, hot: 0 };
  if (t >= g[g.length - 1]!.t1) return { x: g[g.length - 1]!.x1, y: 0.5, on: false, letter: -1, hot: 0 };
  for (let k = 0; k < g.length; k++) {
    const q = g[k]!;
    if (t < q.t1) {
      if (t < q.t0) return { x: q.x0, y: 0.5, on: false, letter: k, hot: 0 };
      const u = (t - q.t0) / Math.max(1e-6, q.t1 - q.t0);
      // hatch: ~14 passes per letter, top ↔ bottom
      const ph = u * 14;
      const y = 0.5 + 0.47 * (2 * Math.abs(ph - Math.floor(ph) - 0.5) * 2 - 1) * 0.5 * 2;
      return { x: q.x0 + (q.x1 - q.x0) * quintic(u), y: Math.max(0.03, Math.min(0.97, y)), on: true, letter: k, hot: 1 };
    }
  }
  return { x: g[g.length - 1]!.x1, y: 0.5, on: false, letter: -1, hot: 0 };
}
/** The F1 cursor (0..1 of the face width) of a plan at t: the spot's x, held at the ends. */
export function laserCursor(plan: LaserPlan, t: number): number {
  const W = Math.max(1e-9, plan.x1 - plan.x0);
  return Math.max(0, Math.min(1, (laserSpot(plan, t).x - plan.x0) / W));
}

// ---------------------------------------------------------------- the galvo head

const BEAM_FRAG = /* glsl */ `
${GLSL_COMMON}
uniform vec3 uCol; varying vec2 vUv;
void main() { float e = 1.0 - abs(vUv.x - 0.5) * 2.0; gl_FragColor = vec4(uCol * e * e * (0.35 + 0.65 * vUv.y), 1.0); }`;
const BEAM_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * A galvo scan head: a black anodised housing with heat-sink fins, a bolted mount, an F-theta lens barrel facing −Y
 * (local), the beam (a faint guide line, additive) and the white-hot spot. Place `obj` on a machine; `aim()` per frame.
 * `size` = housing length (m).
 */
export class Galvo {
  obj = new THREE.Group();
  /** world position of the spot this frame (null when off) */
  spot: THREE.Vector3 | null = null;
  power = 0;
  /** local position of the beam exit (bottom of the lens) */
  exit = new THREE.Vector3();
  private beam: THREE.Mesh;
  private beamMat: THREE.ShaderMaterial;
  private glow: THREE.Mesh;
  private glowMat: THREE.MeshBasicMaterial;
  constructor(public o: { name?: string; size?: number; hardware?: boolean } = {}) {
    this.obj.name = o.name ?? 'galvo';
    const s = o.size ?? 0.22;
    if (o.hardware !== false) {
      const anod = mat('anodInk'), steel = mat('steelGraphite'), ash = mat('brushedAsh');
      const body = new THREE.Mesh(bevelBox(s, s * 0.5, s * 0.56, s * 0.04, 3), anod);
      body.position.set(0, s * 0.25 + s * 0.12, 0);
      this.obj.add(body);
      for (let i = 0; i < 7; i++) {
        const fin = new THREE.Mesh(bevelBox(s * 0.92, s * 0.1, s * 0.022, s * 0.006, 2), anod);
        fin.position.set(0, s * 0.62 + s * 0.05, -s * 0.21 + i * s * 0.07);
        this.obj.add(fin);
      }
      // lens barrel (Ø 0.17 s, a small instrument part) with a brushed retaining ring and a dark window
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.085, s * 0.09, s * 0.14, 32), anod);
      barrel.position.set(s * 0.22, s * 0.05, 0);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.092, s * 0.092, s * 0.025, 32), ash);
      ring.position.set(s * 0.22, -s * 0.02, 0);
      const win = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.06, s * 0.06, s * 0.004, 32), mat('glass', { thickness: 0.003 }));
      win.position.set(s * 0.22, -s * 0.034, 0);
      // a bolted mounting flange on the back and a cable gland
      const flange = new THREE.Mesh(bevelBox(s * 0.34, s * 0.34, s * 0.04, s * 0.01), steel);
      flange.position.set(-s * 0.38, s * 0.37, 0); flange.rotation.y = Math.PI / 2;
      const gland = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.035, s * 0.035, s * 0.1, 16), steel);
      gland.rotation.z = Math.PI / 2; gland.position.set(-s * 0.55, s * 0.3, s * 0.12);
      this.obj.add(barrel, ring, win, flange, gland);
      for (const [y, z] of [[0.24, -0.12], [0.24, 0.12], [0.5, -0.12], [0.5, 0.12]] as [number, number][]) {
        const sc = capScrew(s * 0.04, steel, anod);
        sc.rotation.y = -Math.PI / 2; sc.position.set(-s * 0.4, s * y, s * z);
        this.obj.add(sc);
      }
      // a status window: a tiny bone indicator (on while marking)
    }
    // without hardware the head IS its parent (e.g. a glb's beam_origin): the beam leaves from the origin
    if (o.hardware === false) this.exit.set(0, 0, 0); else this.exit.set(s * 0.22, -s * 0.04, 0);
    this.beamMat = new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uCol: { value: new THREE.Vector3() } } });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0), this.beamMat);
    this.beam.frustumCulled = false; this.beam.visible = false; this.beam.renderOrder = 4;
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.glowMat);
    this.glow.visible = false; this.glow.renderOrder = 4;
    this.obj.add(this.beam, this.glow);
    this.size = s;
  }
  size: number;
  /** Point the beam at a world position with power 0..1 (0 = off); `beamK` scales the visible guide beam. */
  aim(world: THREE.Vector3 | null, power: number, beamK = 1) {
    this.spot = world && power > 0 ? world.clone() : null;
    this.power = power;
    const on = !!world && power > 0;
    this.beam.visible = on && beamK > 0; this.glow.visible = on;
    if (!on) return;
    this.obj.updateWorldMatrix(true, false);
    const local = this.obj.worldToLocal(world!.clone());
    const d = local.clone().sub(this.exit), L = d.length();
    // the beam: a thin bone guide line from the lens to the spot (additive, never magenta)
    const r = this.size * 0.004;
    this.beam.position.copy(this.exit);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    this.beam.scale.set(r, L, r);
    const k = 0.35 * power * beamK;
    (this.beamMat.uniforms.uCol!.value as THREE.Vector3).set(LIN.bone[0] * k, LIN.bone[1] * k, LIN.bone[2] * k);
    // the spot: white-hot (> 1, blooms)
    this.glow.position.copy(local);
    const ws = this.obj.getWorldScale(new THREE.Vector3()).x || 1;
    this.glow.scale.setScalar((this.size * 0.016) / ws);
    this.glowMat.color.setRGB(6 * power, 5.6 * power, 5.1 * power);
  }
  dispose() { this.beamMat.dispose(); this.glowMat.dispose(); this.obj.removeFromParent(); }
}

/**
 * One head for several words (`shared: true` on each laserMark / projectWord): aim it at the first of `fabs` whose
 * cursor (spot / trace head) is live at t, else switch it off. Order-independent: a pure function of t.
 */
export function aimFirst(galvo: Galvo, fabs: readonly Fab[], t: number, power = 1, beamK = 1) {
  let p: THREE.Vector3 | null = null;
  for (const f of fabs) { p = f.cursor(t); if (p) break; }
  galvo.aim(p, p ? power : 0, beamK);
}

// ---------------------------------------------------------------- ablation smoke (closed-form particles)

const SMOKE_VERT = /* glsl */ `
attribute float aA; attribute float aS;
uniform float uPx; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aS * uPx / max(-mv.z, 1e-3));
  vA = aA;
}`;
const SMOKE_FRAG = /* glsl */ `
uniform vec3 uCol; varying float vA;
void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q); if (r > 1.0) discard; float a = vA * (1.0 - r) * (1.0 - r); gl_FragColor = vec4(uCol * a, a); }`;

/** Fine smoke rising off the spot: N particles of fixed ages, positions a pure function of the spot path and t. */
export class LaserSmoke {
  points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private pos: Float32Array; private a: Float32Array; private sz: Float32Array;
  constructor(public n = 90, public capH = 0.2) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.a = new Float32Array(n); this.sz = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aA', new THREE.BufferAttribute(this.a, 1));
    g.setAttribute('aS', new THREE.BufferAttribute(this.sz, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false, premultipliedAlpha: true,
      uniforms: { uPx: { value: 1000 }, uCol: { value: new THREE.Vector3(0.11, 0.105, 0.12) } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.onBeforeRender = (renderer, _s, cam) => {
      const h = renderer.getRenderTarget()?.height ?? renderer.domElement.height;
      this.mat.uniforms.uPx!.value = h * (cam as THREE.PerspectiveCamera).projectionMatrix.elements[5]! * 0.5;
    };
  }
  /**
   * Emit along `spotAt(te)` (face-local point or null when off) for te ≤ t; rise along +Z of the face (out of the surface)
   * then world up (`upLocal`, the world up in face-local coordinates). `seed` decorrelates words.
   */
  update(t: number, spotAt: (te: number) => THREE.Vector3 | null, upLocal: THREE.Vector3, seed = 0) {
    const n = this.n, c = this.capH, life = 0.9;
    for (let i = 0; i < n; i++) {
      const age = ((i + 0.5) / n) * life;
      const te = t - age;
      const p = spotAt(te);
      if (!p) { this.a[i] = 0; this.pos.set([0, 0, 0], i * 3); continue; }
      const h = (k: number) => { const x = Math.sin((i + 1) * 12.9898 + k * 78.233 + seed * 37.719) * 43758.5453; return x - Math.floor(x); };
      const out = c * (0.08 + 0.7 * age), rise = c * (4.2 * age * age + 0.6 * age);
      const sw = c * 0.25 * age * (Math.sin(t * 2.1 + h(1) * 6.28) + 0.6 * Math.sin(t * 3.7 + h(2) * 6.28));
      this.pos[i * 3] = p.x + upLocal.x * rise + sw + (h(3) - 0.5) * c * 0.1 * age;
      this.pos[i * 3 + 1] = p.y + upLocal.y * rise + (h(4) - 0.5) * c * 0.06;
      this.pos[i * 3 + 2] = p.z + out * (0.6 + 0.4 * h(5)) + upLocal.z * rise;
      this.a[i] = 0.22 * Math.sin(Math.PI * Math.min(1, age / life)) ** 1.5 * (0.5 + 0.5 * h(6));
      this.sz[i] = c * (0.025 + 0.22 * age);
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aA') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aS') as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose() { this.points.geometry.dispose(); this.mat.dispose(); }
}

// ---------------------------------------------------------------- F1: galvo laser marking

/**
 * F1: a laser-marked word in the parent's black anodised face (exists only behind the spot; the 20 % graphite toolpath
 * preview before). `galvo`: the plate's head (else one is built above the word unless hardware: false). Smoke included.
 */
export function laserMark(o: FabOpts & { galvo?: Galvo; galvoAt?: THREE.Vector3; smoke?: boolean; shared?: boolean }): Fab {
  const fam = o.font ?? F.archivo(100, 700);
  const text = o.text ?? fabText(o.word.w);
  const probe = textMask(text, fam, { capPx: o.capPx, tracking: o.tracking });
  const capH = resolveCap(o, probe.width);
  const dc = faceDecal(probe, capH, { finish: 'ablate', body: [LIN.ink2[0] * 1.6, LIN.ink2[1] * 1.5, LIN.ink2[2] * 1.6], align: o.align, lit: o.lit, old: o.old, unsung: o.unsung });
  if (o.preview) setFabLook(dc.mat.uniforms, { preview: true });
  const root = new THREE.Group(); root.name = `fab_F1_${text}`;
  root.add(dc.mesh);
  const plan = laserPlan(o.word, dc.spans, text);
  const W = dc.x1 - dc.x0;
  let galvo = o.galvo ?? null;
  if (!galvo && o.hardware !== false) {
    galvo = new Galvo({ size: Math.max(0.12, capH * 0.9) });
    galvo.obj.position.copy(o.galvoAt ?? new THREE.Vector3(dc.x0 + W / 2 - galvo.exit.x, capH * 2.6, capH * 1.1));
    root.add(galvo.obj);
  }
  const smoke = o.smoke === false ? null : new LaserSmoke(90, capH);
  if (smoke) root.add(smoke.points);
  o.parent?.add(root);
  const sung = (t: number): SungState => {
    const s = sungState(o.word, t, { lineEnd: o.lineEnd, deprecateT: o.deprecateT, method: 'F1' });
    const c = laserCursor(plan, t), back = laserCursor(plan, t - SUNG_T.hot);
    s.cursor = c; s.hotW = Math.min(Math.max(0, c - back), (0.45 * capH) / Math.max(1e-6, W)); s.started = c > 0;
    return s;
  };
  const face = faceRefIn(root, text);
  const carrier = registerFab({ ...o, method: 'F1' }, text, face, dc.box, capH, sung);
  const v4 = fabV4(o, carrier, () => [dc.mat], [face]);
  const spotLocal = (t: number) => {
    const s = laserSpot(plan, t);
    return s.on ? new THREE.Vector3(s.x, s.y * capH, dc.mesh.position.z) : null;
  };
  const up = new THREE.Vector3(), q = new THREE.Quaternion();
  return {
    obj: root, carriers: [carrier], width: W, capH, method: 'F1',
    phase: v4.phase, oldAt: v4.oldAt, center: v4.center, iso: v4.iso,
    update(t) {
      const s = sung(t);
      dc.setSung(s, fabLong(o, t));
      dc.orient();
      v4.settle(s);
      const sp = spotLocal(t);
      if (galvo && !o.shared) galvo.aim(sp ? root.localToWorld(sp.clone()) : null, sp ? 1 - s.dead : 0);
      if (smoke) {
        root.updateWorldMatrix(true, false);
        root.getWorldQuaternion(q);
        up.set(0, 1, 0).applyQuaternion(q.invert());
        smoke.update(t, spotLocal, up, o.word.gi);
      }
    },
    cursor(t) { const sp = spotLocal(t); return sp ? root.localToWorld(sp) : null; },
    dispose() { root.removeFromParent(); lyricReg.unregister(carrier.id); dc.mat.dispose(); smoke?.dispose(); if (!o.galvo) galvo?.dispose(); },
  };
}

/**
 * F1 split across several faces (pre1: D-E-P-T-H burnt one letter per deck, each on its own `face_DEPTH_<L>` node):
 * ONE carrier with `parts` (lyricqa measures every part; each part's share of the word = its letter count). The
 * cursor is the word's syllable-aware letter cursor; each part is marked while the cursor crosses its letters, its
 * spot hatching it. One galvo head (`galvo`, else none) follows the active part.
 */
export function laserMarkParts(o: FabOpts & { faces: { parent: THREE.Object3D; text: string; capH?: number; align?: 'left' | 'center' | 'right' }[]; galvo?: Galvo; smoke?: boolean }): Fab {
  const fam = o.font ?? F.archivo(100, 700);
  const text = o.text ?? fabText(o.word.w);
  const N = o.faces.reduce((a, f) => a + Array.from(f.text).length, 0);
  // the word's cursor over N equal letters (syllable-aware: letterCursor over unit spans)
  const unit: [number, number][] = Array.from({ length: N }, (_, i) => [i, i + 1]);
  const map = letterCursor(o.word, o.faces.map((f) => f.text).join(''), unit);
  const parts: { root: THREE.Group; face: THREE.Group; dc: ReturnType<typeof faceDecal>; a: number; b: number; capH: number; smoke: LaserSmoke | null }[] = [];
  let acc = 0;
  for (const f of o.faces) {
    const mk = textMask(f.text, fam, { capPx: o.capPx, tracking: o.tracking });
    const capH = resolveCap({ ...o, parent: f.parent, capH: f.capH ?? o.capH }, mk.width);
    const dc = faceDecal(mk, capH, { finish: 'ablate', body: [LIN.ink2[0] * 1.6, LIN.ink2[1] * 1.5, LIN.ink2[2] * 1.6], align: f.align ?? 'left', lit: o.lit, old: o.old, unsung: o.unsung });
    if (o.preview) setFabLook(dc.mat.uniforms, { preview: true });
    const root = new THREE.Group(); root.name = `fab_F1_${text}_${f.text}`;
    root.add(dc.mesh);
    const smoke = o.smoke === false ? null : new LaserSmoke(60, capH);
    if (smoke) root.add(smoke.points);
    f.parent.add(root);
    const n = Array.from(f.text).length;
    parts.push({ root, face: faceRefIn(root, f.text), dc, a: acc / N, b: (acc + n) / N, capH, smoke });
    acc += n;
  }
  const sung = (t: number): SungState => {
    const s = sungState(o.word, t, { lineEnd: o.lineEnd, deprecateT: o.deprecateT, method: 'F1' });
    const c = map(s.cursor), back = map(Lyrics.wordProgress(o.word, t - SUNG_T.hot));
    s.cursor = c; s.hotW = Math.min(Math.max(0, c - back), 0.45 / N); s.started = c > 0;
    return s;
  };
  const local = (p: (typeof parts)[number], s: SungState): SungState => {
    const k = Math.max(0, Math.min(1, (s.cursor - p.a) / (p.b - p.a)));
    return { ...s, cursor: k, hotW: Math.min(s.hotW / (p.b - p.a), 1), started: k > 0 };
  };
  const spotOf = (p: (typeof parts)[number], t: number): THREE.Vector3 | null => {
    const s = local(p, sung(t));
    if (s.cursor <= 0 || s.cursor >= 1) return null;
    const ph = (s.cursor * 14) % 1;
    return new THREE.Vector3(p.dc.x0 + (p.dc.x1 - p.dc.x0) * s.cursor, p.capH * (0.03 + 0.94 * Math.abs(2 * ph - 1)), p.dc.mesh.position.z);
  };
  const first = parts[0]!;
  const carrier = registerFab({ ...o, method: 'F1' }, text, first.face, first.dc.box, first.capH, sung, {
    parts: parts.map((p, i) => ({ obj: p.face, face: { box: p.dc.box, capH: p.capH }, chars: o.faces[i]!.text })),
  });
  const v4 = fabV4(o, carrier, () => parts.map((p) => p.dc.mat), parts.map((p) => p.face));
  const up = new THREE.Vector3(), q = new THREE.Quaternion();
  return {
    obj: first.root, carriers: [carrier], width: first.dc.x1 - first.dc.x0, capH: first.capH, method: 'F1',
    phase: v4.phase, oldAt: v4.oldAt, center: v4.center, iso: v4.iso,
    update(t) {
      const s = sung(t), ln = fabLong(o, t);
      v4.settle(s);
      let spot: THREE.Vector3 | null = null;
      for (const p of parts) {
        p.dc.setSung(local(p, s), ln);
        p.dc.orient();
        const sp = spotOf(p, t);
        if (sp && !spot) spot = p.root.localToWorld(sp.clone());
        if (p.smoke) {
          p.root.updateWorldMatrix(true, false); p.root.getWorldQuaternion(q);
          up.set(0, 1, 0).applyQuaternion(q.invert());
          p.smoke.update(t, (te) => spotOf(p, te), up, o.word.gi);
        }
      }
      if (o.galvo) o.galvo.aim(spot, spot ? 1 - s.dead : 0);
    },
    cursor(t) { for (const p of parts) { const sp = spotOf(p, t); if (sp) return p.root.localToWorld(sp); } return null; },
    dispose() { for (const p of parts) { p.root.removeFromParent(); p.dc.mat.dispose(); p.smoke?.dispose(); } lyricReg.unregister(carrier.id); },
  };
}

// ---------------------------------------------------------------- F6: vector-laser projection

/**
 * F6: the word projected onto the parent's face by a vector-laser projector (an assembly-guide projector): glyph
 * outlines traced letter by letter (clockwise from 12 o'clock), line width `lineW` caps (default 0.075: ≥ 3 px from
 * ~40 px caps). Light only (additive): it exists only where the trace has passed. `from`: the projector's position in
 * the parent's local space (default above and in front); hardware: the projector head + its beam to the trace point.
 */
export function projectWord(o: FabOpts & { from?: THREE.Vector3; lineW?: number; galvo?: Galvo; shared?: boolean }): Fab {
  const fam = o.font ?? F.archivo(100, 700);
  const text = o.text ?? fabText(o.word.w);
  const probe = textMask(text, fam, { capPx: o.capPx, tracking: o.tracking });
  const capH = resolveCap(o, probe.width);
  const dc = faceDecal(probe, capH, { finish: 'project', align: o.align, lineW: o.lineW, lit: o.lit, old: o.old, unsung: o.unsung });
  const root = new THREE.Group(); root.name = `fab_F6_${text}`;
  root.add(dc.mesh);
  const W = dc.x1 - dc.x0;
  let head = o.galvo ?? null;
  if (!head && o.hardware !== false) {
    head = new Galvo({ size: Math.max(0.14, capH * 0.7) });
    head.obj.position.copy(o.from ?? new THREE.Vector3(dc.x0 + W / 2, capH * 3.2, capH * 2.2));
    head.obj.rotation.x = 0.5;
    root.add(head.obj);
  }
  o.parent?.add(root);
  const map = letterCursor(o.word, text, dc.spans);
  const sung = (t: number): SungState => {
    const s = sungState(o.word, t, { lineEnd: o.lineEnd, deprecateT: o.deprecateT, method: 'F6' });
    const c = map(s.cursor), back = map(Lyrics.wordProgress(o.word, t - SUNG_T.hot));
    s.cursor = c; s.hotW = Math.min(Math.max(0, c - back), (0.45 * capH) / Math.max(1e-6, W)); s.started = c > 0;
    return s;
  };
  const face = faceRefIn(root, text);
  const carrier = registerFab({ ...o, method: 'F6' }, text, face, dc.box, capH, sung);
  const v4 = fabV4(o, carrier, () => [dc.mat], [face]);
  // the trace head: on the letter being traced, at its clock angle (an ellipse inscribed in the glyph cell)
  const headAt = (s: SungState): THREE.Vector3 | null => {
    if (!s.started || s.cursor >= 1) return null;
    const ux = dc.x0 + W * s.cursor;
    for (const [a, b] of dc.spans) {
      if (ux < a || ux > b) continue;
      const fk = (ux - a) / Math.max(1e-6, b - a), ang = fk * Math.PI * 2;
      return new THREE.Vector3((a + b) / 2 + Math.sin(ang) * (b - a) * 0.42, capH * (0.5 + 0.46 * Math.cos(ang)), dc.mesh.position.z);
    }
    return null;
  };
  return {
    obj: root, carriers: [carrier], width: W, capH, method: 'F6',
    phase: v4.phase, oldAt: v4.oldAt, center: v4.center, iso: v4.iso,
    update(t) {
      const s = sung(t);
      dc.setSung(s, fabLong(o, t));
      v4.settle(s);
      const h = headAt(s);
      if (head && !o.shared) head.aim(h ? root.localToWorld(h.clone()) : null, h ? 0.6 : 0, 0.8);
    },
    cursor(t) { const h = headAt(sung(t)); return h ? root.localToWorld(h) : null; },
    dispose() { root.removeFromParent(); lyricReg.unregister(carrier.id); dc.mat.dispose(); if (!o.galvo) head?.dispose(); },
  };
}
