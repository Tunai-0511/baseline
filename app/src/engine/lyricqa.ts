// In-page lyric QA (TREATMENT §7.4 readability, §7.5 anti-subtitle, R3 "no subtitles"). Owner: tooling.
//
// Driven by `bun scripts/render.ts lyricqa` inside the export page: it imports this module
// (page.evaluate(() => import('/src/engine/lyricqa.ts')), the same module instances as the app, so the same
// lyricReg), calls instrument() once, then for every sample time t:
//
//   __mv.still(t − 1/60); __lyricqa.probe(t − 1/60);    // geometry only: screen speed, camera lock, parallax
//   __mv.still(t);        __lyricqa.lyricqa(t);          // full check incl. the rendered pixels and a depth pass
//   … __lyricqa.finish()                                 // rules over time: subtitle runs (§7.5), traits
//
// What is measured (1080p logical px, window [word.start − 0.10, word.end + 0.25], carriers of entries active at t):
//   unregistered  a sung word with no registered carrier in a scene on screen (pre/post margins only while the scene
//                 that is on at word.start / word.end is still on: a plate cut is not a missing word)
//   view          the carrier's scene reported no camera (lyricReg.view) or a stale one
//   anchor        a camera among the carrier's ancestors, not in a scene graph, or its world pose rides the camera
//   billboard     the face turns with the camera (relative orientation constant while the camera rotates)
//   hidden        the carrier is invisible while its word is sung
//   size          cap height ≥ 32 px (hook words STATE BASELINE LEADERBOARD DEADLINE GONE ≥ 80 px)
//   contrast      ≥ 4.5 : 1, from the FINAL frame's pixels: glyph = p90 luminance of the settled sung part of the face
//                 (behind the cursor, past the 50 ms white-hot band), surround = median of the ring beside that part
//                 (and p20 inside it once it spans > 1.5 caps: the gaps between letters) (WCAG relative luminance);
//                 measured once ≥ 1 cap (a letter, or the whole of a narrow word) of it has settled
//   dof           circle of confusion < 1.5 px (max over the face; _look.dofCoc with the view's focus/aperture/maxR)
//   margin        ≥ 96 px from every frame edge (LEADERBOARD may bleed after its first two syllables)
//   angle         face normal vs the ray to the camera ≤ 60°
//   roll          (certify r2, director review 2 of v3) the word's baseline vs the frame's horizontal ≤ 60° (in-plane
//                 rotation: a word turned on its side or upside down by a rolling camera is not read)
//   speed         ≤ 0.5 frame widths / s on screen (not across a cut)
//   occlusion     ≤ 10 % of a 12 × 4 grid on the face behind other geometry (a depth pass of the scene root)
//   overlap       no two faces' screen quads overlap (> 2 % of the smaller)
//   subtitle      (§7.5) > 0.5 s in the bottom-centre band (y > 0.68, |x − 0.5| < 0.28) with ~0 motion relative to
//                 the camera and no parallax; ALSO any lyric drawn as screen text (Layer2D/HUD) or as camera-riding
//                 text (an unregistered text object whose pose follows the camera), e.g. tower.ts's capF
//   traits        (§7.5) at least two of perspective / occlusion / lit / dof / event (perspective, dof verified)
//   hud           any screen-space text (Layer2D composited onto the frame, the engine HUD): R3, §7.6
//   camlock       non-lyric text that rides the camera (unregistered text object)
//   r2text        visible text with R2 banned content (Fig. n, et al, AoE, SUBMISSION)
// Long notes (§7.2) may be left by the camera: from 1 s after their start, a fully off-screen long note is not
// measured (it still must exist: `hidden` applies).
//
// Everything here only READS the frame the app rendered (plus one depth-only pass into a private target); it never
// changes what the film looks like. Installs globalThis.__lyricqa.
import * as THREE from 'three';
import { lyricReg, anchorError, fabText, isLongNote, wordKey, qaWindow, HOOK_WORDS, type LyricCarrier, type ViewInfo, type FaceSpec, type CarrierTrait } from './lyricreg';
import { Layer2D, Compositor, W as FW, H as FH, PW, PH } from './gl';
import { dofCoc } from '../scenes/_look';
import type { Word } from './lyrics';

export type QaRule =
  | 'anchor' | 'billboard' | 'hidden' | 'size' | 'contrast' | 'dof' | 'margin' | 'angle' | 'roll' | 'speed' | 'occlusion' | 'overlap'
  | 'subtitle' | 'traits' | 'view' | 'unregistered' | 'hud' | 'camlock' | 'r2text';
export interface QaFail { t: number; id: string; text: string; rule: QaRule; value: number; limit: number; msg: string; scene?: string }
/** Logical-px rectangle of the 1920 × 1080 frame (x, y top-left). */
export interface ScreenRect { x: number; y: number; w: number; h: number }
/** Four screen corners (logical px, y down) of a face: baseline-left, baseline-right, cap-right, cap-left. */
export type Quad = [number, number][];

/** One face (a carrier, or one part of a split carrier) measured at one sample. null = not measurable here. */
export interface FaceMeasure {
  id: string; part: number; text: string; scene: string; word: string; t: number;
  quad: Quad | null; rect: ScreenRect | null; onScreen: boolean;
  /** sung fraction of this face (0..1) */
  cursor: number;
  cap: number; margin: number; angle: number;
  /** (certify r2) the baseline's angle to the frame's horizontal, degrees 0 … 180 (0 = upright, 180 = upside down) */
  roll: number;
  contrast: number | null; coc: number | null; speed: number | null; occl: number | null;
  /** §7.5 evidence: centre in the bottom-centre band; motion relative to the camera and parallax, per second */
  inBand: boolean; rel: number | null; par: number | null;
  depth: number; dofOn: boolean; long: boolean; fails: QaRule[];
}
export interface ScreenText { scene: string; text: string; rect: ScreenRect; lyric: string | null }
export interface LooseText { scene: string; text: string; kind: string; rect: ScreenRect; camlock: boolean; billboard: boolean; lyric: string | null }
export interface QaResult {
  t: number; checked: number; fails: QaFail[]; rects: { id: string; rect: ScreenRect }[];
  faces: FaceMeasure[]; hud: ScreenText[]; loose: LooseText[];
  /** every word whose window contains t: is it carried by a registered carrier of a scene on screen */
  words: { key: string; text: string; must: boolean; carried: boolean }[];
}
export interface QaOpts {
  /** measure contrast from the final frame (default true) */
  pixels?: boolean;
  /** depth pass for occlusion (default true) */
  occlusion?: boolean;
  /** keep this sample for finish() (default true; the overlay sheet passes false) */
  record?: boolean;
}

export const QA = {
  capMin: 32, capHook: 80, contrast: 4.5, coc: 1.5, margin: 96, angleDeg: 60, speedW: 0.5, occlusion: 0.1, subtitleS: 0.5,
  /** (certify r2) in-plane rotation of the baseline on screen */
  rollDeg: 60,
  /** §7.5 bottom-centre band (fractions of the frame) */
  bandY: 0.68, bandX: 0.28,
  /** relative motion / parallax below this (fraction of the distance per second) counts as "none" */
  still: 0.002,
  /** two faces overlap when their quads share more than this fraction of the smaller one */
  overlap: 0.02,
  /** a long note may leave the frame this long after its start */
  longGrace: 1.0,
  /** traits needed (§7.5) */
  traits: 2,
} as const;

/** R2 text that must never be on screen (anything drawn: HUD, text planes). */
const BANNED_TEXT: [RegExp, string][] = [[/\bFig\.\s*\d/, 'Fig. n'], [/\bet al\b/i, 'et al'], [/\bAoE\b/, 'AoE'], [/\bSUBMISSION\b/i, 'SUBMISSION']];

const V3 = THREE.Vector3;
const ZP = new V3(0, 0, 1), YP = new V3(0, 1, 0);
const mv = () => (globalThis as any).__mv as any;
const eng = () => mv()?.engine as any;

// ================================================================ geometry helpers (exported: seam test, tooling)

/** Project a local box of `obj` to a screen rect (logical px) with `cam`. */
export function screenRect(obj: THREE.Object3D, box: THREE.Box3, cam: THREE.Camera): ScreenRect {
  obj.updateWorldMatrix(true, false);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const p = new V3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(obj.matrixWorld).project(cam);
    const x = (p.x * 0.5 + 0.5) * FW, y = (1 - (p.y * 0.5 + 0.5)) * FH;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The face as a frame: centre of its FRONT plane, reading / up / normal unit axes, half extents (local units). */
interface FaceFrame { c: THREE.Vector3; r: THREE.Vector3; u: THREE.Vector3; n: THREE.Vector3; hr: number; hu: number }
const frames = new WeakMap<FaceSpec, FaceFrame>();
function faceFrame(f: FaceSpec): FaceFrame {
  let fr = frames.get(f);
  if (fr) return fr;
  const n = (f.normal ?? ZP).clone().normalize(), u = (f.up ?? YP).clone().normalize();
  const r = new V3().crossVectors(u, n).normalize();
  const ctr = f.box.getCenter(new V3());
  let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity, n1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const d = new V3(i & 1 ? f.box.max.x : f.box.min.x, i & 2 ? f.box.max.y : f.box.min.y, i & 4 ? f.box.max.z : f.box.min.z).sub(ctr);
    const pr = d.dot(r), pu = d.dot(u), pn = d.dot(n);
    r0 = Math.min(r0, pr); r1 = Math.max(r1, pr); u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); n1 = Math.max(n1, pn);
  }
  const c = ctr.clone().addScaledVector(r, (r0 + r1) / 2).addScaledVector(u, (u0 + u1) / 2).addScaledVector(n, n1);
  fr = { c, r, u, n, hr: (r1 - r0) / 2, hu: (u1 - u0) / 2 };
  frames.set(f, fr);
  return fr;
}
/** Local point of the face at (a along reading, b along up), both 0..1. */
const facePt = (fr: FaceFrame, a: number, b: number) => fr.c.clone().addScaledVector(fr.r, fr.hr * (2 * a - 1)).addScaledVector(fr.u, fr.hu * (2 * b - 1));

interface Proj { x: number; y: number; depth: number; ok: boolean }
function project(pw: THREE.Vector3, cam: THREE.Camera): Proj {
  const depth = -pw.clone().applyMatrix4(cam.matrixWorldInverse).z;
  const p = pw.clone().project(cam);
  return { x: (p.x * 0.5 + 0.5) * FW, y: (1 - (p.y * 0.5 + 0.5)) * FH, depth, ok: depth > ((cam as THREE.PerspectiveCamera).near ?? 0) };
}

/** Projected cap height (px) of a carrier: its local capH along the face's up axis at the face centre. */
export function capPx(c: LyricCarrier, cam: THREE.Camera, face: FaceSpec = c.face, obj: THREE.Object3D = c.obj): number {
  const fr = faceFrame(face);
  obj.updateWorldMatrix(true, false);
  const a = project(fr.c.clone().addScaledVector(fr.u, -face.capH / 2).applyMatrix4(obj.matrixWorld), cam);
  const b = project(fr.c.clone().addScaledVector(fr.u, face.capH / 2).applyMatrix4(obj.matrixWorld), cam);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Angle (deg) between the face normal and the ray from the face to the camera. */
export function faceAngle(c: LyricCarrier, cam: THREE.Camera, face: FaceSpec = c.face, obj: THREE.Object3D = c.obj): number {
  const fr = faceFrame(face);
  obj.updateWorldMatrix(true, false);
  const n = fr.n.clone().transformDirection(obj.matrixWorld);
  const ctr = fr.c.clone().applyMatrix4(obj.matrixWorld);
  const v = cam.getWorldPosition(new V3()).sub(ctr).normalize();
  return (Math.acos(Math.max(-1, Math.min(1, n.dot(v)))) * 180) / Math.PI;
}

/** Screen quad of the face's reading span [a0, a1] (fractions along the reading axis). */
function faceQuad(fr: FaceFrame, obj: THREE.Object3D, cam: THREE.Camera, a0 = 0, a1 = 1): { q: Quad; ok: boolean; depths: number[] } {
  const pts = [facePt(fr, a0, 0), facePt(fr, a1, 0), facePt(fr, a1, 1), facePt(fr, a0, 1)].map((p) => project(p.applyMatrix4(obj.matrixWorld), cam));
  return { q: pts.map((p) => [p.x, p.y] as [number, number]), ok: pts.every((p) => p.ok), depths: pts.map((p) => p.depth) };
}
const quadRect = (q: Quad): ScreenRect => {
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
};
const quadArea = (q: Quad) => { let a = 0; for (let i = 0; i < q.length; i++) { const p = q[i]!, n = q[(i + 1) % q.length]!; a += p[0] * n[1] - n[0] * p[1]; } return a / 2; };
const ccw = (q: Quad): Quad => (quadArea(q) < 0 ? [...q].reverse() : q);
/** Signed distances (px, + inside) of a point to the edges of a convex polygon; min over the edges. */
function insideDist(q: Quad, x: number, y: number): number {
  const p = ccw(q);
  let m = Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!;
    const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
    // (screen y is down: a ccw polygon in this frame has its inside on the left of each edge in math terms)
    m = Math.min(m, ((x - a[0]) * ey - (y - a[1]) * ex) / L * -1);
  }
  return m;
}
/** Area of the intersection of two convex polygons (Sutherland–Hodgman). */
function clipArea(a: Quad, b: Quad): number {
  let out: Quad = ccw(a);
  const c = ccw(b);
  for (let i = 0; i < c.length && out.length; i++) {
    const p = c[i]!, q = c[(i + 1) % c.length]!;
    const side = (v: [number, number]) => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]);
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const s = inp[j]!, e = inp[(j + 1) % inp.length]!;
      const ss = side(s), se = side(e);
      if (se >= 0) {
        if (ss < 0) { const k = ss / (ss - se); out.push([s[0] + (e[0] - s[0]) * k, s[1] + (e[1] - s[1]) * k]); }
        out.push(e);
      } else if (ss >= 0) { const k = ss / (ss - se); out.push([s[0] + (e[0] - s[0]) * k, s[1] + (e[1] - s[1]) * k]); }
    }
  }
  return out.length >= 3 ? Math.abs(quadArea(out)) : 0;
}
const rectsMeet = (a: ScreenRect, b: ScreenRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const onFrame = (r: ScreenRect) => rectsMeet(r, { x: 0, y: 0, w: FW, h: FH });

// ================================================================ the scenes on screen

/** Timeline entries active at t (what the engine composites at t). */
export function activeAt(t: number): string[] {
  const e = eng();
  return e ? (e.timeline as { id: string; start: number; end: number }[]).filter((x) => t >= x.start && t < x.end).map((x) => x.id) : [...new Set(lyricReg.all().map((c) => c.scene))];
}
const sceneOf = (id: string): any => eng()?.loaded?.get(id)?.scene ?? null;
const rootOf = (o: THREE.Object3D) => { let r = o; while (r.parent) r = r.parent; return r; };
const visibleChain = (o: THREE.Object3D) => { for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false; return true; };
/** A camera field of a scene instance (for scenes that do not report a view: v1 plates). */
function sceneCam(s: any): THREE.PerspectiveCamera | null {
  if (!s) return null;
  for (const k of Object.keys(s)) { const v = s[k]; if (v?.isPerspectiveCamera) return v; }
  return null;
}

/** Faces of a carrier: the carrier itself, or its parts with their share of the reading span. */
function facesOf(c: LyricCarrier): { obj: THREE.Object3D; face: FaceSpec; u0: number; u1: number; k: number }[] {
  if (!c.parts?.length) return [{ obj: c.obj, face: c.face, u0: 0, u1: 1, k: 0 }];
  const total = c.parts.reduce((s, p) => s + Math.max(1, p.chars.length), 0);
  let acc = 0;
  return c.parts.map((p, k) => { const u0 = acc / total; acc += Math.max(1, p.chars.length); return { obj: p.obj, face: p.face, u0, u1: acc / total, k }; });
}

/** LEADERBOARD may bleed after its first two syllables (§7.4.5): explicit bleedAfter, else syl[1] end, else 2/3. */
function bleedAfter(c: LyricCarrier): number | undefined {
  if (c.bleedAfter !== undefined) return c.bleedAfter;
  if (c.text !== 'LEADERBOARD') return undefined;
  const s = c.word.syl;
  return s && s.length >= 2 ? s[1]![1] : c.word.start + (2 / 3) * (c.word.end - c.word.start);
}

// ================================================================ screen-space text instrumentation (Layer2D / HUD)

interface TextRec { text: string; corners: [number, number][] }
interface Instr {
  texts: Map<object, TextRec[]>;
  /** screen texts of the frame being rendered: who composited which canvas */
  screen: { scene: string; canvas: object }[];
  cur: string;
  wrapped: WeakSet<object>;
}
let I: Instr | null = null;

/**
 * Hook Canvas2D text drawing and the paths by which a canvas reaches the frame in screen space (Compositor.draw of a
 * canvas texture by a scene, the engine HUD), and attribute them to the scene rendering. Idempotent.
 */
export function instrument() {
  const e = eng();
  if (!I) {
    const st: Instr = { texts: new Map(), screen: [], cur: 'engine', wrapped: new WeakSet() };
    I = st;
    const protos: any[] = [(globalThis as any).CanvasRenderingContext2D?.prototype, (globalThis as any).OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean);
    for (const P of protos) {
      for (const fn of ['fillText', 'strokeText'] as const) {
        const orig = P[fn];
        P[fn] = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, ...rest: unknown[]) {
          try {
            const s = String(text);
            if (s.trim()) {
              const m = this.measureText(s), size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? '16');
              const w = m.width, al = this.textAlign;
              const xa = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;
              const T = this.getTransform();
              const sx = FW / ((this.canvas as HTMLCanvasElement).width || FW);
              const corners = ([[xa, y - 0.8 * size], [xa + w, y - 0.8 * size], [xa + w, y + 0.22 * size], [xa, y + 0.22 * size]] as [number, number][])
                .map(([px, py]) => [(T.a * px + T.c * py + T.e) * sx, (T.b * px + T.d * py + T.f) * sx] as [number, number]);
              let arr = st.texts.get(this.canvas);
              if (!arr) st.texts.set(this.canvas, (arr = []));
              arr.push({ text: s, corners });
              if (arr.length > 400) arr.splice(0, arr.length - 400);
            }
          } catch { /* measuring must never break drawing */ }
          return (orig as (...a: unknown[]) => void).call(this, text, x, y, ...rest);
        };
      }
    }
    const clear = Layer2D.prototype.clear;
    Layer2D.prototype.clear = function (this: Layer2D, color?: string) { st.texts.delete(this.canvas); return clear.call(this, color); };
    const draw = Compositor.prototype.draw;
    Compositor.prototype.draw = function (this: Compositor, ...a: Parameters<Compositor['draw']>) {
      const img = (a[1] as THREE.Texture | null)?.image;
      if (img && st.texts.get(img)?.length) st.screen.push({ scene: st.cur, canvas: img });
      return draw.apply(this, a);
    };
  }
  const st = I;
  if (e && !st.wrapped.has(e)) {
    st.wrapped.add(e);
    const render = e.render.bind(e);
    e.render = (...a: unknown[]) => { st.screen = []; return render(...a); };
    if (e.hud && !st.wrapped.has(e.hud)) {
      st.wrapped.add(e.hud);
      const hd = e.hud.draw.bind(e.hud);
      e.hud.draw = (...a: unknown[]) => {
        const tex = hd(...a);
        const cv = e.hud.layer?.canvas;
        if (cv && st.texts.get(cv)?.length) st.screen.push({ scene: 'engine.hud', canvas: cv });
        return tex;
      };
    }
  }
  // attribute draws to the scene rendering (each loaded scene's render, wrapped once)
  for (const [id, rec] of (e?.loaded ?? new Map()) as Map<string, { scene: any }>) {
    const s = rec.scene;
    if (!s || st.wrapped.has(s)) continue;
    st.wrapped.add(s);
    const r = s.render.bind(s);
    s.render = (...a: unknown[]) => { const prev = st.cur; st.cur = id; try { return r(...a); } finally { st.cur = prev; } };
  }
}

// ================================================================ text objects nobody registered (v1 TextPlane/Type3D…)

interface Loose { scene: string; text: string; obj: THREE.Object3D; kind: string }
const looseCache = new WeakMap<object, Loose[]>();
/** Duck-typed text objects ({text: string, mesh|group: Object3D}) held by a scene instance, up to 3 levels deep. */
function looseTexts(id: string, s: any): Loose[] {
  let out = looseCache.get(s);
  if (out) return out;
  out = [];
  const seen = new Set<object>();
  const walk = (v: any, d: number) => {
    if (!v || typeof v !== 'object' || d > 3 || seen.has(v)) return;
    seen.add(v);
    if (v.isObject3D || v.isMaterial || v.isTexture || v.isBufferGeometry || v.isWebGLRenderTarget || ArrayBuffer.isView(v) || (typeof Node !== 'undefined' && v instanceof Node)) return;
    if (typeof v.text === 'string' && (v.mesh?.isObject3D || v.group?.isObject3D)) {
      const cn: string = v.constructor?.name ?? '';
      out!.push({ scene: id, text: v.text, obj: v.mesh?.isObject3D ? v.mesh : v.group, kind: cn && cn !== 'Object' ? cn : 'text object' });
      return;
    }
    if (v instanceof Map || v instanceof Set) { for (const x of v.values()) walk(x, d + 1); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, d + 1); return; }
    for (const k of Object.keys(v)) if (k !== 'ctx') walk(v[k], d + 1);
  };
  walk(s, 0);
  looseCache.set(s, out);
  return out;
}
const opacityOf = (o: THREE.Object3D): number => {
  let m = 0;
  o.traverse((x) => {
    const mats = (x as THREE.Mesh).material;
    if (!mats || !x.visible) return;
    for (const mt of Array.isArray(mats) ? mats : [mats]) {
      const u = (mt as THREE.ShaderMaterial).uniforms;
      const a = (u?.opacity?.value as number) ?? (u?.uOpacity?.value as number) ?? mt.opacity ?? 1;
      if (mt.visible !== false) m = Math.max(m, a);
    }
  });
  return m;
};

// ================================================================ the probe (previous frame) and history

interface ProbeFace { t: number; camSpace: THREE.Matrix4; camWorld: THREE.Matrix4; centre: [number, number] | null; depth: number; camLocal: THREE.Vector3; cut?: number; scene: string }
interface Probe { t: number; faces: Map<string, ProbeFace>; loose: Map<string, ProbeFace> }
let prev: Probe | null = null;
const history = new Map<string, FaceMeasure[]>();
const carrierInfo = new Map<string, { text: string; scene: string; traits: CarrierTrait[] }>();

function poseOf(obj: THREE.Object3D, cam: THREE.Camera, t: number, scene: string, centre: [number, number] | null, depth: number, cut?: number): ProbeFace {
  obj.updateWorldMatrix(true, false);
  const camSpace = new THREE.Matrix4().multiplyMatrices(cam.matrixWorldInverse, obj.matrixWorld);
  const camLocal = cam.getWorldPosition(new V3()).applyMatrix4(obj.matrixWorld.clone().invert());
  return { t, camSpace, camWorld: cam.matrixWorld.clone(), centre, depth, camLocal, cut, scene };
}
interface Motion { dt: number; speed: number | null; rel: number; par: number; camMoved: boolean; camTurned: boolean; locked: boolean; turnsWith: boolean }
/** Motion of a pose between the probe and now; null across a cut / scene change / camera jump. */
function motion(p: ProbeFace | undefined, now: ProbeFace, t: number): Motion | null {
  if (!p) return null;
  const dt = t - p.t;
  if (!(dt > 1e-5 && dt <= 0.051)) return null;
  if ((now.cut !== undefined && now.cut > p.t + 1e-6) || p.scene !== now.scene) return null;
  const cp = new V3(), cq = new THREE.Quaternion(), cs = new V3(), pp = new V3(), pq = new THREE.Quaternion();
  now.camWorld.decompose(cp, cq, cs); p.camWorld.decompose(pp, pq, cs);
  const dCam = cp.distanceTo(pp), dRot = cq.angleTo(pq);
  // a camera that jumps (> 60 m/s or > 1200 °/s) has cut, whatever the plate says
  if (dCam / dt > 60 || (dRot * 180) / Math.PI / dt > 1200) return null;
  const a = new V3(), aq = new THREE.Quaternion(), b = new V3(), bq = new THREE.Quaternion();
  now.camSpace.decompose(a, aq, cs); p.camSpace.decompose(b, bq, cs);
  const dist = Math.max(1e-3, now.depth);
  const dPos = a.distanceTo(b) / dist, dAng = aq.angleTo(bq);
  const par = now.camLocal.distanceTo(p.camLocal) / dist;
  const speed = now.centre && p.centre ? Math.hypot(now.centre[0] - p.centre[0], now.centre[1] - p.centre[1]) / dt / FW : null;
  const camMoved = dCam > 1e-3 || dRot > 2e-4, camTurned = dRot > 2e-4;
  return {
    dt, speed, rel: Math.max(dPos, dAng) / dt, par: par / dt, camMoved, camTurned,
    locked: camMoved && dPos < 2e-5 && dAng < 2e-5,
    turnsWith: camTurned && dAng < 2e-5,
  };
}

/** Record the geometry of every registered face and loose text of the scenes on screen (call right after still(t)). */
export function probe(t: number, scenes?: string[]) {
  const active = scenes ?? activeAt(t);
  const P: Probe = { t, faces: new Map(), loose: new Map() };
  for (const c of lyricReg.all()) {
    if (!active.includes(c.scene)) continue;
    const v = lyricReg.viewOf(c.scene);
    if (!v) continue;
    for (const f of facesOf(c)) {
      const fr = faceFrame(f.face);
      f.obj.updateWorldMatrix(true, false);
      const pc = project(fr.c.clone().applyMatrix4(f.obj.matrixWorld), v.cam);
      P.faces.set(`${c.id}#${f.k}`, poseOf(f.obj, v.cam, t, c.scene, pc.ok ? [pc.x, pc.y] : null, pc.depth, v.cut));
    }
  }
  for (const id of active) {
    const s = sceneOf(id), cam = lyricReg.viewOf(id)?.cam ?? sceneCam(s);
    if (!s || !cam) continue;
    for (const L of looseTexts(id, s)) {
      const ctr = new THREE.Box3().setFromObject(L.obj).getCenter(new V3());
      const pc = project(ctr, cam);
      P.loose.set(L.obj.uuid, poseOf(L.obj, cam, t, id, pc.ok ? [pc.x, pc.y] : null, pc.depth));
    }
  }
  prev = P;
}

/** Forget the probe and the history (a new run). */
export function reset() { prev = null; history.clear(); carrierInfo.clear(); }

// ================================================================ pixels: contrast

let sRGB2lin: Float32Array | null = null;
function lum(r: number, g: number, b: number) {
  if (!sRGB2lin) { sRGB2lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; sRGB2lin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; } }
  return 0.2126 * sRGB2lin[r]! + 0.7152 * sRGB2lin[g]! + 0.0722 * sRGB2lin[b]!;
}
const pct = (a: number[], p: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1) + 0.5)))]!; };

/**
 * WCAG contrast of the SETTLED sung part of a face (bone: behind the cursor and past the 50 ms white-hot band, whose
 * bloom is a designed flash) against its surround, from the final (displayed) frame. Pixels are located on the face by
 * the affine inverse of its screen quad (a along reading, b along up): glyph = a ∈ [0, settled], b ∈ [0, 1]; surround =
 * outside the face (> 2 px) beside that part (a ∈ [−0.1, settled + 0.02]), within 0.35 cap of it; glyph luminance =
 * p90, background = the surround's median, raised to the part's own p20 when it spans > 1.5 caps (gaps between letters).
 */
function contrastOf(full: Quad, settled: number, cap: number): number | null {
  const e = eng();
  const rt: THREE.WebGLRenderTarget | undefined = e?.finalRT;
  if (!e || !rt) return null;
  const ring = Math.max(6, 0.35 * cap);
  const R = quadRect(full);
  const x0 = Math.max(0, Math.floor(R.x - ring)), y0 = Math.max(0, Math.floor(R.y - ring));
  const x1 = Math.min(FW, Math.ceil(R.x + R.w + ring)), y1 = Math.min(FH, Math.ceil(R.y + R.h + ring));
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  // affine frame of the face on screen: p = q0 + a·(q1 − q0) + b·(q3 − q0)
  const [q0, q1, , q3] = full as [[number, number], [number, number], [number, number], [number, number]];
  const ux = q1[0] - q0[0], uy = q1[1] - q0[1], vx = q3[0] - q0[0], vy = q3[1] - q0[1];
  const det = ux * vy - uy * vx;
  if (Math.abs(det) < 1e-6) return null;
  const S = PW / FW;
  const px0 = Math.floor(x0 * S), py0 = Math.floor(y0 * S), pw = Math.max(1, Math.floor((x1 - x0) * S)), ph = Math.max(1, Math.floor((y1 - y0) * S));
  const buf = new Uint8Array(pw * ph * 4);
  e.renderer.readRenderTargetPixels(rt, px0, PH - (py0 + ph), pw, ph, buf);
  const glyph: number[] = [], sur: number[] = [];
  const step = Math.max(1, Math.round(S));
  for (let yy = 0; yy < ph; yy += step) for (let xx = 0; xx < pw; xx += step) {
    const lx = (px0 + xx + 0.5) / S, ly = (py0 + yy + 0.5) / S;
    const dx = lx - q0[0], dy = ly - q0[1];
    const a = (dx * vy - dy * vx) / det, b = (ux * dy - uy * dx) / det;
    const i = ((ph - 1 - yy) * pw + xx) * 4; // rows come bottom-up
    if (a >= 0 && a <= settled && b >= 0 && b <= 1) glyph.push(lum(buf[i]!, buf[i + 1]!, buf[i + 2]!));
    else if (a >= -0.1 && a <= settled + 0.02 && insideDist(full, lx, ly) < -2) sur.push(lum(buf[i]!, buf[i + 1]!, buf[i + 2]!));
  }
  if (glyph.length < 20 || sur.length < 20) return null;
  const Lg = pct(glyph, 0.9);
  // inside the part, the dark between the strokes is background too, once the part spans more than a letter
  const wide = settled * Math.hypot(ux, uy) >= 1.5 * cap;
  const Lb = Math.max(pct(sur, 0.5), wide ? pct(glyph, 0.2) : 0);
  return (Lg + 0.05) / (Lb + 0.05);
}

// ================================================================ depth pass: occlusion

class DepthProbe {
  /** (p1v4 gates) target size in px: half res by default (occlusion), quarter res for the gate runner's depth bands */
  readonly w: number;
  readonly h: number;
  rt: THREE.WebGLRenderTarget;
  mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking, side: THREE.DoubleSide });
  buf: Float32Array;
  constructor(w = FW / 2, h = FH / 2) {
    this.w = w; this.h = h;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.buf = new Float32Array(w * h * 4);
  }
  key = '';
  cam: THREE.Camera | null = null;
  /** Depth-only render of `roots` as seen by `cam`, without `hide` and without non-occluding geometry (no depth write, lines, points). */
  render(renderer: THREE.WebGLRenderer, roots: THREE.Object3D[], cam: THREE.Camera, hide: THREE.Object3D[], key: string) {
    if (key === this.key) return;
    this.key = key; this.cam = cam;
    const hidden: THREE.Object3D[] = [];
    const off = (o: THREE.Object3D) => { if (o.visible) { o.visible = false; hidden.push(o); } };
    for (const h of hide) off(h);
    for (const r of roots) r.traverse((o) => {
      if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) { off(o); return; }
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      const ms = Array.isArray(m) ? m : [m];
      if (ms.every((x) => x.depthWrite === false || (x.transparent && x.opacity < 0.5) || x.visible === false)) off(o);
    });
    const prevRT = renderer.getRenderTarget(), prevCC = renderer.getClearColor(new THREE.Color()), prevCA = renderer.getClearAlpha();
    const saved = roots.map((r) => [(r as THREE.Scene).overrideMaterial, (r as THREE.Scene).background] as const);
    renderer.setRenderTarget(this.rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    for (const r of roots) {
      const s = r as THREE.Scene;
      if (s.isScene) { s.overrideMaterial = this.mat; s.background = null; renderer.render(s, cam); }
      else { const tmp = new THREE.Scene(); tmp.overrideMaterial = this.mat; const p = r.parent; tmp.add(r); renderer.render(tmp, cam); tmp.remove(r); if (p) p.add(r); }
    }
    roots.forEach((r, i) => { const s = r as THREE.Scene; if (s.isScene) { s.overrideMaterial = saved[i]![0]; s.background = saved[i]![1]; } });
    renderer.readRenderTargetPixels(this.rt, 0, 0, this.w, this.h, this.buf);
    renderer.setRenderTarget(prevRT);
    renderer.setClearColor(prevCC, prevCA);
    for (const o of hidden) o.visible = true;
  }
  /** View depth (m) of the nearest occluder at a logical px, Infinity if nothing. */
  depthAt(x: number, y: number): number {
    const cam = this.cam as THREE.PerspectiveCamera | null;
    if (!cam) return Infinity;
    const ix = Math.floor((x * this.w) / FW), iy = Math.floor(((FH - y) * this.h) / FH);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return Infinity;
    return this.depthIdx(iy * this.w + ix);
  }
  /** (p1v4 gates) View depth (m) at texel `i` of the target (rows bottom-up), Infinity if nothing there. */
  depthIdx(i: number): number {
    const cam = this.cam as THREE.PerspectiveCamera | null;
    if (!cam) return Infinity;
    const d = 1 - this.buf[i * 4]!;
    if (d >= 0.999999) return Infinity;
    const te = cam.projectionMatrix.elements;
    return te[14]! / (2 * d - 1 + te[10]!);
  }
}
let depthProbe: DepthProbe | null = null;

// ================================================================ the check

const lyricTokens = (s: string) => s.split(/[\s·,;:/|]+/).map(fabText).filter(Boolean);
/** Which of the in-window words a piece of screen text spells (≥ 2 consecutive line words, or one of ≥ 4 letters). */
function lyricIn(text: string, inWin: Word[]): string | null {
  const toks = lyricTokens(text);
  if (!toks.length) return null;
  const hit = inWin.filter((w) => toks.includes(fabText(w.w)));
  if (hit.some((w) => fabText(w.w).length >= 4) || hit.length >= 2) return hit.map((w) => fabText(w.w)).join(' ');
  return null;
}
function bannedIn(text: string): string | null { const hit = BANNED_TEXT.filter(([re]) => re.test(text)).map(([, n]) => n); return hit.length ? hit.join(', ') : null; }

/**
 * Check every carrier whose window contains t (scenes = the timeline entries active at t), the words that should be
 * carried, the screen-space text drawn this frame and the unregistered text objects of the scenes on screen.
 * Call right after `__mv.still(t)` (and `probe(t − 1/60)` before it, for speed / camera lock / parallax).
 */
export function lyricqa(t: number, scenes?: string[], o: QaOpts = {}): QaResult {
  const active = scenes ?? activeAt(t);
  const res: QaResult = { t, checked: 0, fails: [], rects: [], faces: [], hud: [], loose: [], words: [] };
  const fail = (id: string, text: string, rule: QaRule, value: number, limit: number, msg: string, scene?: string) =>
    res.fails.push({ t, id, text, rule, value, limit, msg, scene });
  const e = eng();
  const P: Probe = { t, faces: new Map(), loose: new Map() };
  const words: Word[] = e?.lyrics?.words ?? [];
  const inWin = words.filter((w) => { const [a, b] = qaWindow(w); return t >= a && t <= b; });
  const lines = e?.lyrics?.lines ?? [];
  const near: Word[] = lines.filter((l: { start: number; end: number }) => l.end > t - 6 && l.start < t + 6).flatMap((l: { words: Word[] }) => l.words);

  // ---- registered carriers
  const measured: { c: LyricCarrier; f: ReturnType<typeof facesOf>[number]; m: FaceMeasure; v: ViewInfo }[] = [];
  for (const c of lyricReg.at(t, active)) {
    res.checked++;
    carrierInfo.set(c.id, { text: c.text, scene: c.scene, traits: c.traits ?? [] });
    const v = lyricReg.viewOf(c.scene);
    if (!v) { fail(c.id, c.text, 'view', 0, 1, `scene ${c.scene} reported no camera (lyricReg.view)`, c.scene); continue; }
    if (v.t !== undefined && Math.abs(v.t - t) > 1e-3) fail(c.id, c.text, 'view', v.t, t, `stale view: reported at ${v.t.toFixed(3)}`, c.scene);
    const sung = c.sung(t);
    const long = isLongNote(c.word);
    for (const f of facesOf(c)) {
      const key = `${c.id}#${f.k}`;
      const ae = anchorError(f.obj);
      if (ae) fail(c.id, c.text, 'anchor', 1, 0, ae, c.scene);
      if (!(rootOf(f.obj) as THREE.Scene).isScene) fail(c.id, c.text, 'anchor', 1, 0, 'carrier is not in a scene graph', c.scene);
      if (!visibleChain(f.obj) && t >= c.word.start && t <= c.word.end) fail(c.id, c.text, 'hidden', 1, 0, 'carrier invisible while its word is sung', c.scene);
      const fr = faceFrame(f.face);
      f.obj.updateWorldMatrix(true, false);
      const cursor = Math.max(0, Math.min(1, (sung.cursor - f.u0) / Math.max(1e-6, f.u1 - f.u0)));
      const full = faceQuad(fr, f.obj, v.cam);
      const rect = quadRect(full.q);
      const onScreen = full.ok && onFrame(rect);
      const pc = project(fr.c.clone().applyMatrix4(f.obj.matrixWorld), v.cam);
      const cap = capPx(c, v.cam, f.face, f.obj);
      const margin = Math.min(rect.x, rect.y, FW - (rect.x + rect.w), FH - (rect.y + rect.h));
      const angle = faceAngle(c, v.cam, f.face, f.obj);
      // (certify r2) the baseline on screen (baseline-left → baseline-right), vs the frame's horizontal
      const roll = (Math.abs(Math.atan2(full.q[1]![1] - full.q[0]![1], full.q[1]![0] - full.q[0]![0])) * 180) / Math.PI;
      const dofOn = !!(v.aperture && v.focus && v.aperture > 0);
      let coc: number | null = null;
      if (dofOn) coc = Math.max(...[...full.depths, pc.depth].map((z) => dofCoc(Math.max(1e-3, z), v.focus!, v.aperture!, v.maxR ?? 14)));
      const now = poseOf(f.obj, v.cam, t, c.scene, pc.ok ? [pc.x, pc.y] : null, pc.depth, v.cut);
      P.faces.set(key, now);
      const mo = motion(prev?.faces.get(key), now, t);
      const inBand = pc.ok && pc.y / FH > QA.bandY && Math.abs(pc.x / FW - 0.5) < QA.bandX;
      const m: FaceMeasure = {
        id: c.id, part: f.k, text: c.text, scene: c.scene, word: c.word.w, t, quad: full.q, rect, onScreen, cursor, cap, margin, angle, roll,
        contrast: null, coc, speed: mo?.speed ?? null, occl: null, inBand, rel: mo ? mo.rel : null, par: mo ? mo.par : null,
        depth: pc.depth, dofOn, long, fails: [],
      };
      res.faces.push(m);
      res.rects.push({ id: c.id, rect });
      if (mo?.locked) { fail(c.id, c.text, 'anchor', 1, 0, 'world pose follows the camera (camera-locked)', c.scene); m.fails.push('anchor'); }
      else if (mo?.turnsWith) { fail(c.id, c.text, 'billboard', 1, 0, 'face turns with the camera (billboard)', c.scene); m.fails.push('billboard'); }
      // a long note may be left by the camera once read (§7.2)
      if (long && t > c.word.start + QA.longGrace && !onScreen) continue;
      // contrast of the settled sung part (bone, past the white-hot band): needs ≥ ~1 cap (a letter) of it on screen
      const settled = Math.max(0, Math.min(1, (sung.cursor - sung.hotW - f.u0) / Math.max(1e-6, f.u1 - f.u0)));
      const settledPx = settled * Math.hypot(full.q[1]![0] - full.q[0]![0], full.q[1]![1] - full.q[0]![1]);
      if (o.pixels !== false && onScreen && settledPx >= Math.min(1.0 * cap, 0.9 * quadRect(full.q).w)) m.contrast = contrastOf(full.q, settled, cap);
      measured.push({ c, f, m, v });
    }
  }

  // ---- occlusion: one depth pass per (camera, roots), every carrier hidden (word-on-word is the overlap rule)
  if (o.occlusion !== false && e && measured.length) {
    depthProbe ??= new DepthProbe();
    const groups = new Map<string, typeof measured>();
    for (const x of measured) {
      if (!x.m.onScreen) continue;
      const roots = [...new Set([rootOf(x.f.obj), ...(x.v.roots ?? [])])];
      const k = `${t}|${x.v.cam.uuid}|${roots.map((r) => r.uuid).join(',')}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(x);
    }
    const hide = lyricReg.all().filter((c) => active.includes(c.scene)).flatMap((c) => facesOf(c).map((f) => f.obj));
    for (const [k, xs] of groups) {
      const roots = [...new Set([rootOf(xs[0]!.f.obj), ...(xs[0]!.v.roots ?? [])])];
      depthProbe.render(e.renderer, roots, xs[0]!.v.cam, hide, k);
      for (const x of xs) {
        const fr = faceFrame(x.f.face);
        let n = 0, occ = 0;
        for (let i = 0; i < 12; i++) for (let j = 0; j < 4; j++) {
          const p = project(facePt(fr, 0.04 + (0.92 * (i + 0.5)) / 12, 0.08 + (0.84 * (j + 0.5)) / 4).applyMatrix4(x.f.obj.matrixWorld), x.v.cam);
          if (!p.ok || p.x < 0 || p.y < 0 || p.x >= FW || p.y >= FH) continue;
          n++;
          if (depthProbe.depthAt(p.x, p.y) < p.depth - Math.max(0.02, 0.01 * p.depth)) occ++;
        }
        x.m.occl = n ? occ / n : null;
      }
    }
  }

  // ---- per-face rules
  for (const { c, m } of measured) {
    const F = (rule: QaRule, value: number, limit: number, msg: string) => { fail(c.id, c.text, rule, value, limit, msg, c.scene); m.fails.push(rule); };
    const need = c.hook ? QA.capHook : QA.capMin;
    if (!m.onScreen) { F('margin', m.margin, QA.margin, 'face off screen'); continue; }
    if (m.cap < need) F('size', m.cap, need, `cap ${m.cap.toFixed(0)} px < ${need}${c.hook ? ' (hook)' : ''}`);
    const ba = bleedAfter(c);
    if (m.margin < QA.margin && !(ba !== undefined && t >= ba)) F('margin', m.margin, QA.margin, `${m.margin.toFixed(0)} px from the frame edge`);
    if (m.angle > QA.angleDeg) F('angle', m.angle, QA.angleDeg, `face at ${m.angle.toFixed(0)}° to the view`);
    if (m.roll > QA.rollDeg) F('roll', m.roll, QA.rollDeg, `baseline at ${m.roll.toFixed(0)}° to the frame's horizontal`);
    if (m.coc !== null && m.coc >= QA.coc) F('dof', m.coc, QA.coc, `circle of confusion ${m.coc.toFixed(2)} px`);
    if (m.contrast !== null && m.contrast < QA.contrast) F('contrast', m.contrast, QA.contrast, `contrast ${m.contrast.toFixed(2)}:1`);
    if (m.speed !== null && m.speed > QA.speedW) F('speed', m.speed, QA.speedW, `${m.speed.toFixed(2)} frame widths/s on screen`);
    if (m.occl !== null && m.occl > QA.occlusion) F('occlusion', m.occl, QA.occlusion, `${(m.occl * 100).toFixed(0)} % of the face hidden`);
  }
  // ---- overlap between faces (parts of one carrier excepted)
  const on = measured.filter((x) => x.m.onScreen && x.m.quad);
  for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
    const a = on[i]!, b = on[j]!;
    if (a.c.id === b.c.id || !rectsMeet(a.m.rect!, b.m.rect!)) continue;
    const ar = clipArea(a.m.quad!, b.m.quad!), small = Math.min(Math.abs(quadArea(a.m.quad!)), Math.abs(quadArea(b.m.quad!)));
    if (small > 0 && ar / small > QA.overlap) {
      fail(a.c.id, a.c.text, 'overlap', ar / small, QA.overlap, `overlaps ${b.c.text} (${((ar / small) * 100).toFixed(0)} %)`, a.c.scene);
      a.m.fails.push('overlap'); b.m.fails.push('overlap');
    }
  }

  // ---- screen-space text this frame (Layer2D composited by a scene, the engine HUD)
  if (I) {
    const seen = new Set<string>();
    for (const sc of I.screen) for (const r of I.texts.get(sc.canvas) ?? []) {
      const k = `${sc.scene}|${r.text}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const rect = quadRect(r.corners);
      if (!onFrame(rect)) continue;
      const lyric = lyricIn(r.text, inWin);
      res.hud.push({ scene: sc.scene, text: r.text, rect, lyric });
      const id = `${sc.scene}/screen`;
      fail(id, r.text, 'hud', 1, 0, `screen-space text through ${sc.scene === 'engine.hud' ? 'the engine HUD' : 'Layer2D'}: "${r.text}"`, sc.scene);
      if (lyric) fail(id, lyric, 'subtitle', 1, 0, `lyric "${lyric}" drawn as screen text (Layer2D) by ${sc.scene}`, sc.scene);
      const ban = bannedIn(r.text);
      if (ban) fail(id, r.text, 'r2text', 1, 0, `R2 banned text on screen (${ban}): "${r.text}"`, sc.scene);
    }
  }

  // ---- text objects nobody registered: camera-riding captions, banned labels, lyrics outside the registry
  const carriedObjs = lyricReg.all().flatMap((c) => facesOf(c).map((f) => f.obj));
  const isCarrier = (x: THREE.Object3D) => carriedObjs.some((c) => { for (let y: THREE.Object3D | null = x; y; y = y.parent) if (y === c) return true; let r = false; c.traverseAncestors((a) => { if (a === x) r = true; }); return r; });
  const lyricLoose = new Map<string, string>(); // word key -> who draws it
  for (const id of active) {
    const s = sceneOf(id), cam = lyricReg.viewOf(id)?.cam ?? sceneCam(s);
    if (!s || !cam) continue;
    for (const L of looseTexts(id, s)) {
      if (!visibleChain(L.obj) || !(rootOf(L.obj) as THREE.Scene).isScene || opacityOf(L.obj) < 0.02 || isCarrier(L.obj)) continue;
      const box = new THREE.Box3().setFromObject(L.obj);
      if (box.isEmpty()) continue;
      const ctr = box.getCenter(new V3());
      const pc = project(ctr, cam);
      if (!pc.ok) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        const p = project(new V3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z), cam);
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      }
      const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      if (!onFrame(rect)) continue;
      const now = poseOf(L.obj, cam, t, id, [pc.x, pc.y], pc.depth);
      P.loose.set(L.obj.uuid, now);
      const mo = motion(prev?.loose.get(L.obj.uuid), now, t);
      const lyric = lyricIn(L.text, inWin) ?? (inWin.some((w) => fabText(w.w) === fabText(L.text)) ? fabText(L.text) : null);
      // lyric content at all (a word of a line sung around now): a camera-riding caption is one before and after its word too
      const lyricNear = lyric ?? (near.some((w) => fabText(w.w) === fabText(L.text)) ? fabText(L.text) : null);
      const camlock = !!mo?.locked, billboard = !!mo?.turnsWith && !camlock;
      res.loose.push({ scene: id, text: L.text, kind: L.kind, rect, camlock, billboard, lyric });
      const lid = `${id}/~${L.kind}`;
      if (lyric) for (const w of inWin) if (lyricTokens(L.text).includes(fabText(w.w))) lyricLoose.set(wordKey(w), `${L.kind} "${L.text}" in ${id}${camlock ? ' (camera-locked)' : billboard ? ' (billboard)' : ''}`);
      if (camlock || billboard) {
        const how = camlock ? 'rides the camera' : 'turns with the camera (billboard)';
        if (lyricNear) fail(lid, L.text, 'subtitle', 1, 0, `lyric "${L.text}" ${how}: an unregistered ${L.kind} in ${id} (camera-riding caption)`, id);
        else fail(lid, L.text, 'camlock', 1, 0, `text "${L.text}" ${how}: an unregistered ${L.kind} in ${id}`, id);
      }
      const ban = bannedIn(L.text);
      if (ban) fail(lid, L.text, 'r2text', 1, 0, `R2 banned text visible (${ban}): "${L.text}" (${L.kind} in ${id})`, id);
    }
  }

  // ---- every sung word must be carried (pre/post margins only while the same scene is on)
  const same = (a: number, b: number) => { const A = activeAt(a), B = new Set(activeAt(b)); return A.some((x) => B.has(x)); };
  for (const w of inWin) {
    // a word that ends ≤ 1/60 s after a plate cut belongs to the plate before the cut (KITS §15.3): from the cut on it is
    // checked only while that plate is still on (e.g. GUARANTEED ends 45.820, 8 ms after the H02 cut at 45.812)
    const owner = Math.max(w.start, w.end - 1 / 60 - 1e-3);
    const must = (t >= w.start && t <= w.end && (t <= owner || same(t, owner))) || (t < w.start && same(t, w.start)) || (t > w.end && same(t, owner));
    const carried = lyricReg.ofWord(w, active).length > 0;
    res.words.push({ key: wordKey(w), text: fabText(w.w), must, carried });
    if (must && !carried) {
      const by = lyricLoose.get(wordKey(w));
      fail(`word/${wordKey(w)}`, fabText(w.w), 'unregistered', 0, 1, `sung word "${w.w}" has no registered carrier${by ? `; drawn by ${by}` : ` in ${active.join(', ') || 'no scene'}`}`, active[0]);
    }
  }

  // ---- keep this frame's geometry as the probe for the next sample (consecutive frames chain)
  prev = P;
  if (o.record !== false) for (const m of res.faces) {
    const k = `${m.id}#${m.part}`;
    (history.get(k) ?? history.set(k, []).get(k)!).push(m);
  }
  return res;
}

/**
 * Rules over time, from the samples recorded since reset(): the §7.5 subtitle run (> 0.5 s in the bottom-centre band
 * with ~zero relative motion and no parallax) and the §7.5 traits (≥ 2 of perspective/occlusion/lit/dof/event).
 */
export function finish(): QaFail[] {
  const out: QaFail[] = [];
  const byCarrier = new Map<string, FaceMeasure[]>();
  for (const [, hs] of history) {
    const s = [...hs].sort((a, b) => a.t - b.t);
    // subtitle runs
    let run: FaceMeasure[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const span = run[run.length - 1]!.t - run[0]!.t;
        if (span >= QA.subtitleS) {
          const m = run[0]!;
          out.push({ t: m.t, id: m.id, text: m.text, rule: 'subtitle', value: span, limit: QA.subtitleS, scene: m.scene,
            msg: `${span.toFixed(2)} s in the bottom-centre band with no motion relative to the camera and no parallax (${run[0]!.t.toFixed(2)}–${run[run.length - 1]!.t.toFixed(2)})` });
        }
      }
      run = [];
    };
    for (const m of s) {
      const like = m.inBand && m.rel !== null && m.par !== null && m.rel < QA.still && m.par < QA.still;
      if (like && (!run.length || m.t - run[run.length - 1]!.t <= 0.21)) run.push(m);
      else { flush(); if (like) run.push(m); }
    }
    flush();
    for (const m of s) (byCarrier.get(m.id) ?? byCarrier.set(m.id, []).get(m.id)!).push(m);
  }
  // traits
  for (const [id, ms] of byCarrier) {
    const info = carrierInfo.get(id);
    const declared = new Set(info?.traits ?? []);
    const persp = ms.some((m) => m.angle >= 5) || ms.some((m) => (m.par ?? 0) > 0.01);
    const dof = ms.some((m) => m.dofOn);
    const ok = new Set<CarrierTrait>();
    for (const tr of declared) if ((tr === 'perspective' && persp) || (tr === 'dof' && dof) || tr === 'lit' || tr === 'occlusion' || tr === 'event') ok.add(tr);
    if (persp) ok.add('perspective');
    if (dof) ok.add('dof');
    if (ok.size < QA.traits) {
      const m = ms[0]!;
      const unver = [...declared].filter((x) => !ok.has(x));
      out.push({ t: m.t, id, text: m.text, rule: 'traits', value: ok.size, limit: QA.traits, scene: m.scene,
        msg: `only ${ok.size} anti-subtitle trait(s) [${[...ok].join(', ') || 'none'}]${unver.length ? `; claimed but not seen: ${unver.join(', ')}` : ''}${declared.size ? '' : ' (declare traits on the carrier)'}` });
    }
  }
  return out;
}

// ================================================================ v4 gate runner (render.ts gates, KITS §22): per-frame geometry

/** A lyric face's place in the song at t: being sung, sung on the current line, an earlier line (→ ash, soft), not yet sung. */
export type GateState = 'current' | 'sung' | 'old' | 'unsung';
/** One lyric face as the gate runner sees it (geometry only: scripts/gates.py reads the pixels under `q`). */
export interface GateFace {
  id: string; k: number; text: string; word: string; state: GateState;
  /** screen quad (logical px): baseline-left, baseline-right, cap-right, cap-left */
  q: Quad; cap: number; ang: number;
  /** screen speed of the face centre since the previous gateFrame (W/s; null across a cut or on the first frame) */
  spd: number | null; coc: number | null; on: boolean; hook: boolean; subject: boolean;
  /** the carrier's fabrication method (F4 displays show every segment raw before a word: no letter shapes to read) */
  method: string;
  /** inside the carrier's QA window (§7.4) and, for a long note, within QA.longGrace of its start (the camera may leave it then) */
  inqa: boolean;
}
/** A non-lyric text on screen: a registered label, an unregistered fab_ text object, a board designator, a loose text object. */
export interface GateLabel { id: string; text: string; src: 'reg' | 'fab' | 'silk' | 'loose'; q: Quad; cap: number; on: boolean }
/** Board designators to project (render.ts passes `_shaft.BOARD_SILK` for plates whose world has the board). */
export interface GateSilk { scene: string; entries: { text: string; rect: [number, number, number, number]; capH: number }[]; fade: [number, number]; k: number }
export interface GateFrame {
  t: number; faces: GateFace[]; labels: GateLabel[];
  /**
   * share of the frame whose nearest geometry is 1–4 m / 2–4 m from the lens, the 2–4 m blobs (≥ 0.05 % each), and `m`:
   * the 1–4 m band as a 96 × 54 bitmap (rows top-down, base64 of packed bits; a cell is set when ≥ 30 % of it is in the band)
   */
  fg: { b14: number; b24: number; n24: number; m: string } | null;
}

const gatePrev = new Map<string, { t: number; c: [number, number]; scene: string }>();
const gateCam = new Map<string, { t: number; m: THREE.Matrix4; cut?: number }>();
let gateDepth: DepthProbe | null = null;
let gateCalls = 0;
const fabCache = new WeakMap<THREE.Object3D, { n: number; list: THREE.Object3D[] }>();
const r1 = (x: number) => Math.round(x * 10) / 10;
const qRound = (q: Quad): Quad => q.map(([x, y]) => [r1(x), r1(y)] as [number, number]);

/** The scene-graph roots of an active entry: the THREE.Scene fields of its instance and the roots of its carriers. */
function rootsOf(id: string): THREE.Object3D[] {
  const out = new Set<THREE.Object3D>();
  const s = sceneOf(id);
  if (s) for (const k of Object.keys(s)) { const o = s[k]; if (o && o.isObject3D) { const r = rootOf(o); if ((r as THREE.Scene).isScene) out.add(r); } }
  for (const c of lyricReg.forScene(id)) { const r = rootOf(c.obj); if ((r as THREE.Scene).isScene) out.add(r); }
  return [...out];
}
/** Cap height (px) of a face spec on `obj` (capPx without a carrier). */
function faceCap(face: FaceSpec, obj: THREE.Object3D, cam: THREE.Camera): number {
  const fr = faceFrame(face);
  obj.updateWorldMatrix(true, false);
  const a = project(fr.c.clone().addScaledVector(fr.u, -face.capH / 2).applyMatrix4(obj.matrixWorld), cam);
  const b = project(fr.c.clone().addScaledVector(fr.u, face.capH / 2).applyMatrix4(obj.matrixWorld), cam);
  return Math.hypot(b.x - a.x, b.y - a.y);
}
/** Unregistered text objects of a root, by the fab kits' naming (`fab_<method|finish>_<text>`, `fab_<text>`): outermost only. */
function fabTexts(root: THREE.Object3D): THREE.Object3D[] {
  const ent = fabCache.get(root);
  if (ent && gateCalls - ent.n < 120) return ent.list;
  const list: THREE.Object3D[] = [];
  const walk = (o: THREE.Object3D) => {
    if (typeof o.name === 'string' && o.name.startsWith('fab_')) { list.push(o); return; }
    for (const ch of o.children) walk(ch);
  };
  walk(root);
  fabCache.set(root, { n: gateCalls, list });
  return list;
}
const fabTextOf = (name: string) => /^fab_(?:F\d+[A-Z]?|groove|inlay|silk|project|ablate|laser|etch)_(.*)$/.exec(name)?.[1] ?? name.slice(4);
/** A sung word's state at t (§7.2: bone until the line's end + 0.3 s, then a 0.4 s fade to ash = `oldAfter` 0.7 s). */
function gateState(w: Word, t: number, lineEnd: number, lead: number, oldAfter: number): GateState {
  if (t < w.start - lead) return 'unsung';
  if (t <= w.end) return 'current';
  return t > Math.max(lineEnd, w.end) + oldAfter ? 'old' : 'sung';
}

/**
 * The gate runner's per-frame geometry (call right after `__mv.still(t)` / `engine.render(t)`, consecutive frames for
 * speeds): every face of every carrier of the entries on screen with its state (not only the words in their QA window),
 * the non-lyric texts on screen (registered labels, unregistered `fab_` text objects, `opts.silk` board designators,
 * loose text objects; occlusion-tested against a depth pass), and the share of the frame filled by geometry 1–4 m from
 * the lens (the foreground-wipe and near-lens-fragment proxies). Reads only; never changes the frame.
 */
export function gateFrame(t: number, o: { fps?: number; oldAfter?: number; depth?: boolean; labels?: boolean; silk?: GateSilk[]; scenes?: string[] } = {}): GateFrame {
  gateCalls++;
  const fps = o.fps ?? 60, oldAfter = o.oldAfter ?? 0.7;
  const active = o.scenes ?? activeAt(t);
  const e = eng();
  const lines: { end: number }[] = e?.lyrics?.lines ?? [];
  const faces: GateFace[] = [];
  // a camera that jumps (> 60 m/s or > 1200 °/s) has cut, whatever the plate reports (as lyricqa's motion())
  const jumped = new Map<string, boolean>();
  for (const id of active) {
    const v = lyricReg.viewOf(id);
    if (!v) continue;
    v.cam.updateMatrixWorld();
    const p = gateCam.get(id);
    let j = !p || t - p.t > 0.051 || t <= p.t || (v.cut !== undefined && v.cut > p.t + 1e-6);
    if (!j && p) {
      const a = new V3(), aq = new THREE.Quaternion(), b = new V3(), bq = new THREE.Quaternion(), s = new V3();
      v.cam.matrixWorld.decompose(a, aq, s); p.m.decompose(b, bq, s);
      const dt = t - p.t;
      j = a.distanceTo(b) / dt > 60 || (aq.angleTo(bq) * 180) / Math.PI / dt > 1200;
    }
    jumped.set(id, j);
    gateCam.set(id, { t, m: v.cam.matrixWorld.clone(), cut: v.cut });
  }
  for (const c of lyricReg.all()) {
    if (!active.includes(c.scene)) continue;
    const v = lyricReg.viewOf(c.scene);
    if (!v) continue;
    const st = gateState(c.word, t, lines[c.word.line]?.end ?? c.word.end, 0.5 / fps, oldAfter);
    for (const f of facesOf(c)) {
      const key = `${c.id}#${f.k}`;
      if (!visibleChain(f.obj) || !(rootOf(f.obj) as THREE.Scene).isScene) { gatePrev.delete(key); continue; }
      const fr = faceFrame(f.face);
      f.obj.updateWorldMatrix(true, false);
      const full = faceQuad(fr, f.obj, v.cam);
      const pc = project(fr.c.clone().applyMatrix4(f.obj.matrixWorld), v.cam);
      if (!full.ok || !pc.ok) { gatePrev.delete(key); continue; }
      const on = onFrame(quadRect(full.q));
      const p = gatePrev.get(key);
      let spd: number | null = null;
      if (p && !jumped.get(c.scene) && p.scene === c.scene) {
        const dt = t - p.t;
        if (dt > 1e-5 && dt <= 0.051) spd = Math.hypot(pc.x - p.c[0], pc.y - p.c[1]) / dt / FW;
      }
      gatePrev.set(key, { t, c: [pc.x, pc.y], scene: c.scene });
      if (!on) continue;
      let coc: number | null = null;
      if (v.aperture && v.focus && v.aperture > 0) coc = Math.max(...[...full.depths, pc.depth].map((z) => dofCoc(Math.max(1e-3, z), v.focus!, v.aperture!, v.maxR ?? 14)));
      faces.push({
        id: c.id, k: f.k, text: c.parts?.[f.k]?.chars ?? c.text, word: wordKey(c.word), state: st, q: qRound(full.q),
        cap: r1(capPx(c, v.cam, f.face, f.obj)), ang: r1(faceAngle(c, v.cam, f.face, f.obj)),
        spd: spd === null ? null : Math.round(spd * 1000) / 1000, coc: coc === null ? null : Math.round(coc * 100) / 100,
        on, hook: c.hook, subject: c.subject ?? true, method: c.method,
        inqa: t >= lyricReg.window(c)[0] && t <= lyricReg.window(c)[1] && !(isLongNote(c.word) && t > c.word.start + QA.longGrace),
      });
    }
  }

  // ---- one depth pass of the top entry's world (all geometry that writes depth): foreground bands + label occlusion
  const top = [...active].reverse().find((id) => lyricReg.viewOf(id));
  const tv = top ? lyricReg.viewOf(top) : undefined;
  let fg: GateFrame['fg'] = null;
  let depthOk = false;
  if (o.depth !== false && e && tv) {
    const roots = rootsOf(top!);
    if (roots.length) {
      gateDepth ??= new DepthProbe(FW / 4, FH / 4);
      gateDepth.render(e.renderer, roots, tv.cam, [], `${t}|gate|${tv.cam.uuid}`);
      depthOk = true;
      const W4 = gateDepth.w, H4 = gateDepth.h, n = W4 * H4;
      const m24 = new Uint8Array(n);
      const CW = 96, CH = 54, cell = new Uint16Array(CW * CH), cx = W4 / CW, cy = H4 / CH;
      let k14 = 0, k24 = 0;
      for (let i = 0; i < n; i++) {
        const d = gateDepth.depthIdx(i);
        if (d >= 1 && d <= 4) {
          k14++;
          const x = i % W4, y = (i - x) / W4;
          cell[(CH - 1 - Math.floor(y / cy)) * CW + Math.floor(x / cx)]++;
          if (d >= 2) { k24++; m24[i] = 1; }
        }
      }
      const bits = new Uint8Array((CW * CH) / 8), need = 0.3 * cx * cy;
      for (let j = 0; j < CW * CH; j++) if (cell[j]! >= need) bits[j >> 3]! |= 128 >> (j & 7);
      let bs = '';
      for (let j = 0; j < bits.length; j++) bs += String.fromCharCode(bits[j]!);
      // blobs of the 2–4 m band (4-connected), ≥ 0.05 % of the frame each: thick fragments / structure near the lens
      let blobs = 0;
      const minA = Math.max(4, Math.round(0.0005 * n)), stack: number[] = [];
      for (let i = 0; i < n; i++) {
        if (m24[i] !== 1) continue;
        let a = 0; m24[i] = 2; stack.push(i);
        while (stack.length) {
          const j = stack.pop()!; a++;
          const x = j % W4, y = (j - x) / W4;
          if (x > 0 && m24[j - 1] === 1) { m24[j - 1] = 2; stack.push(j - 1); }
          if (x < W4 - 1 && m24[j + 1] === 1) { m24[j + 1] = 2; stack.push(j + 1); }
          if (y > 0 && m24[j - W4] === 1) { m24[j - W4] = 2; stack.push(j - W4); }
          if (y < H4 - 1 && m24[j + W4] === 1) { m24[j + W4] = 2; stack.push(j + W4); }
        }
        if (a >= minA) blobs++;
      }
      fg = { b14: Math.round((k14 / n) * 1e4) / 1e4, b24: Math.round((k24 / n) * 1e4) / 1e4, n24: blobs, m: btoa(bs) };
    }
  }
  /** visible unless the depth pass has nearer geometry at ≥ 2 of the 3 sample points (screen px + their view depth) */
  const visible = (pts: { x: number; y: number; depth: number }[], slack: number) => {
    if (!depthOk || !gateDepth) return true;
    let hidden = 0;
    for (const p of pts) if (gateDepth.depthAt(p.x, p.y) < p.depth - slack - 0.02 * p.depth) hidden++;
    return hidden < 2;
  };

  // ---- non-lyric texts
  const labels: GateLabel[] = [];
  if (o.labels !== false) {
    const carried = new Set<THREE.Object3D>();
    for (const c of lyricReg.all()) for (const f of facesOf(c)) carried.add(f.obj);
    const isCarrier = (x: THREE.Object3D) => {
      for (let y: THREE.Object3D | null = x; y; y = y.parent) if (carried.has(y)) return true;
      let r = false;
      x.traverse((d) => { if (!r && carried.has(d)) r = true; });
      return r;
    };
    const push = (L: GateLabel) => { if (L.on && L.cap >= 6) labels.push({ ...L, q: qRound(L.q), cap: r1(L.cap) }); };
    for (const L of lyricReg.labels.values()) {
      if (!active.includes(L.scene) || !visibleChain(L.obj)) continue;
      const v = lyricReg.viewOf(L.scene);
      if (!v) continue;
      const fr = faceFrame(L.face);
      const full = faceQuad(fr, L.obj, v.cam);
      if (!full.ok) continue;
      const pc = project(fr.c.clone().applyMatrix4(L.obj.matrixWorld), v.cam);
      const on = onFrame(quadRect(full.q)) && visible([pc, ...[0, 1].map((i) => ({ x: full.q[i * 2]![0], y: full.q[i * 2]![1], depth: full.depths[i * 2]! }))], 0.05);
      push({ id: L.id, text: L.text, src: 'reg', q: full.q, cap: faceCap(L.face, L.obj, v.cam), on });
    }
    const regObjs = new Set([...lyricReg.labels.values()].map((L) => L.obj));
    for (const id of active) {
      const v = lyricReg.viewOf(id);
      if (!v) continue;
      for (const root of rootsOf(id)) for (const obj of fabTexts(root)) {
        if (!visibleChain(obj) || regObjs.has(obj) || opacityOf(obj) < 0.02 || isCarrier(obj)) continue;
        const mesh = obj as THREE.Mesh, mat = mesh.material as THREE.ShaderMaterial | undefined;
        const capH = (mat?.uniforms?.uCapH?.value as number | undefined) ?? null;
        let q: Quad, cap: number, pts: { x: number; y: number; depth: number }[], slack = 0.05;
        if (mesh.isMesh && capH && mesh.geometry) {
          // a lettering decal: the plane's extent, cap = capH along local +Y
          mesh.geometry.boundingBox ?? mesh.geometry.computeBoundingBox();
          const bb = mesh.geometry.boundingBox!;
          obj.updateWorldMatrix(true, false);
          const z = (bb.min.z + bb.max.z) / 2, cy = (bb.min.y + bb.max.y) / 2, cx = (bb.min.x + bb.max.x) / 2;
          const P = [[bb.min.x, bb.min.y], [bb.max.x, bb.min.y], [bb.max.x, bb.max.y], [bb.min.x, bb.max.y]].map(([x, y]) => project(new V3(x, y, z).applyMatrix4(obj.matrixWorld), v.cam));
          if (!P.every((p) => p.ok)) continue;
          q = P.map((p) => [p.x, p.y] as [number, number]);
          const a = project(new V3(cx, cy - capH / 2, z).applyMatrix4(obj.matrixWorld), v.cam), b = project(new V3(cx, cy + capH / 2, z).applyMatrix4(obj.matrixWorld), v.cam);
          cap = Math.hypot(b.x - a.x, b.y - a.y);
          pts = [project(new V3(cx, cy, z).applyMatrix4(obj.matrixWorld), v.cam), P[0]!, P[2]!];
        } else {
          // a text object (extruded / pins / tiles / segments): its world box; cap ≈ 0.7 of the box's screen height
          const box = new THREE.Box3().setFromObject(obj);
          if (box.isEmpty()) continue;
          const P = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => project(new V3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z), v.cam));
          if (!P.every((p) => p.ok)) continue;
          const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
          const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          q = [[x0, y1], [x1, y1], [x1, y0], [x0, y0]];
          cap = 0.7 * (y1 - y0);
          const dmin = Math.min(...P.map((p) => p.depth));
          pts = [{ x: (x0 + x1) / 2, y: (y0 + y1) / 2, depth: dmin }, { x: x0 + 0.25 * (x1 - x0), y: (y0 + y1) / 2, depth: dmin }, { x: x0 + 0.75 * (x1 - x0), y: (y0 + y1) / 2, depth: dmin }];
          slack = 0.1;
        }
        push({ id: `${id}/${obj.name}`, text: fabTextOf(obj.name), src: 'fab', q, cap, on: onFrame(quadRect(q)) && visible(pts, slack) });
      }
      for (const L of looseTexts(id, sceneOf(id))) {
        if (!visibleChain(L.obj) || opacityOf(L.obj) < 0.02 || isCarrier(L.obj) || regObjs.has(L.obj) || L.obj.name.startsWith('fab_')) continue;
        const box = new THREE.Box3().setFromObject(L.obj);
        if (box.isEmpty()) continue;
        const P = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => project(new V3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z), v.cam));
        if (!P.every((p) => p.ok)) continue;
        const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const q: Quad = [[x0, y1], [x1, y1], [x1, y0], [x0, y0]];
        push({ id: `${id}/~${L.kind}`, text: L.text, src: 'loose', q, cap: 0.7 * (y1 - y0), on: onFrame(quadRect(q)) && visible([{ x: (x0 + x1) / 2, y: (y0 + y1) / 2, depth: Math.min(...P.map((p) => p.depth)) }], 0.1) });
      }
    }
    for (const S of o.silk ?? []) {
      if (!active.includes(S.scene)) continue;
      const v = lyricReg.viewOf(S.scene);
      if (!v) continue;
      for (const en of S.entries) {
        // silkscreen lies on the board (y = 0), reading along +x, cap toward −z; rect = [x0, z0, x1, z1] (0.4 m margin)
        const [x0, z0, x1, z1] = en.rect, zb = z1 - 0.4, zc = zb - en.capH, y = 0.002;
        const P = [[x0 + 0.4, zb], [x1 - 0.4, zb], [x1 - 0.4, zc], [x0 + 0.4, zc]].map(([x, z]) => project(new V3(x, y, z), v.cam));
        if (!P.every((p) => p.ok)) continue;
        const q = P.map((p) => [p.x, p.y] as [number, number]) as Quad;
        const xm = (x0 + x1) / 2;
        const a = project(new V3(xm, y, zb), v.cam), b = project(new V3(xm, y, zc), v.cam);
        const cap = Math.hypot(b.x - a.x, b.y - a.y);
        // erased by the plate's silk fade (shaft.silkFade over silkFadePx with silkFadeK ≤ 0.1): not readable
        if (S.fade[0] > 0.5 && cap > S.fade[1] && S.k <= 0.1) continue;
        push({ id: `${S.scene}/silk/${en.text}`, text: en.text, src: 'silk', q, cap, on: onFrame(quadRect(q)) && visible([project(new V3(xm, y, (zb + zc) / 2), v.cam), P[0]!, P[2]!], 0.05) });
      }
    }
  }
  return { t, faces, labels, fg };
}
/** Forget the gate runner's previous frame (a new run). */
export function gateReset() { gatePrev.clear(); gateCam.clear(); }

// ================================================================ seams (render.ts seam --cut <id>)

/** Screen rect of a registered seam object (for `render.ts seam --cut <id>`), or null if not registered / no view. */
export function seamRect(cut: string, side: 'out' | 'in'): ScreenRect | null {
  const h = lyricReg.handoffOf(cut, side);
  const v = h && lyricReg.viewOf(h.scene);
  return h && v ? screenRect(h.obj, h.box, v.cam) : null;
}
/** Everything the seam test reports about one side at the current frame. */
export function seamInfo(cut: string, side: 'out' | 'in') {
  const h = lyricReg.handoffOf(cut, side);
  const v = h ? lyricReg.viewOf(h.scene) : undefined;
  return { registered: !!h, scene: h?.scene ?? null, t: h?.t ?? null, viewT: v?.t ?? null, rect: h && v ? screenRect(h.obj, h.box, v.cam) : null };
}

/** The registered carriers (JSON): for picking a QA range when a test scene plays alone. */
export function registered() {
  return lyricReg.all().map((c) => ({ id: c.id, scene: c.scene, text: c.text, method: c.method, word: wordKey(c.word), window: lyricReg.window(c), hook: c.hook || HOOK_WORDS.has(c.text) }));
}

// ================================================================ overlay (QA sheets only: never part of the film)

/** Draw a QA result over a frame drawn at scale `s` (canvas px per logical px) at (ox, oy). */
export function drawOverlay(c: CanvasRenderingContext2D, r: QaResult, s: number, ox = 0, oy = 0) {
  const X = (x: number) => ox + x * s, Y = (y: number) => oy + y * s;
  const failed = new Set(r.fails.map((f) => f.id));
  c.save();
  c.lineWidth = Math.max(2, 2 * s);
  const fs = Math.max(13, Math.round(22 * s));
  c.font = `${fs}px monospace`;
  for (const m of r.faces) {
    if (!m.quad) continue;
    const bad = m.fails.length > 0 || failed.has(m.id);
    c.strokeStyle = bad ? '#ff4040' : '#40ff70';
    c.beginPath();
    m.quad.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1]))));
    c.closePath(); c.stroke();
    const lab = `${m.text} ${m.cap.toFixed(0)}px${m.contrast !== null ? ` ${m.contrast.toFixed(1)}:1` : ''}${m.fails.length ? ' ✗' + [...new Set(m.fails)].join(',') : ''}`;
    c.fillStyle = 'rgba(0,0,0,0.6)';
    const tx = X(Math.min(...m.quad.map((p) => p[0]))), ty = Y(Math.min(...m.quad.map((p) => p[1]))) - 4;
    c.fillRect(tx - 2, ty - fs, c.measureText(lab).width + 4, fs + 4);
    c.fillStyle = bad ? '#ff8080' : '#a0ffb0';
    c.fillText(lab, tx, ty);
  }
  for (const h of r.hud) {
    c.strokeStyle = h.lyric ? '#ff4040' : '#ffb030';
    c.setLineDash([6, 4]);
    c.strokeRect(X(h.rect.x), Y(h.rect.y), h.rect.w * s, h.rect.h * s);
    c.setLineDash([]);
    c.fillStyle = h.lyric ? '#ff8080' : '#ffc060';
    c.fillText(h.lyric ? 'SUBTITLE (Layer2D)' : 'HUD', X(h.rect.x), Y(h.rect.y + h.rect.h) + fs);
  }
  // camera-riding texts: each outlined, one label per scene over their union
  const riders = new Map<string, { x0: number; y0: number; lyric: boolean }>();
  for (const L of r.loose) {
    if (!L.camlock && !L.billboard && !L.lyric && !bannedIn(L.text)) continue;
    c.strokeStyle = L.camlock || L.billboard ? '#ff4040' : '#ffb030';
    c.setLineDash([3, 3]);
    c.strokeRect(X(L.rect.x), Y(L.rect.y), L.rect.w * s, L.rect.h * s);
    c.setLineDash([]);
    if (L.camlock || L.billboard) {
      const u = riders.get(L.scene) ?? { x0: Infinity, y0: Infinity, lyric: false };
      riders.set(L.scene, { x0: Math.min(u.x0, L.rect.x), y0: Math.min(u.y0, L.rect.y), lyric: u.lyric || !!L.lyric });
    } else if (bannedIn(L.text)) { c.fillStyle = '#ffc060'; c.fillText('R2', X(L.rect.x), Y(L.rect.y) - 4); }
  }
  for (const [, u] of riders) { c.fillStyle = '#ff8080'; c.fillText(u.lyric ? 'CAMERA-RIDING CAPTION' : 'CAMERA-LOCKED TEXT', X(u.x0), Y(u.y0) - 6); }
  const rules = [...new Set(r.fails.map((f) => f.rule))];
  const un = r.fails.filter((f) => f.rule === 'unregistered').map((f) => f.text);
  const lines = [`t ${r.t.toFixed(2)}  ${rules.length ? 'FAIL ' + rules.join(' ') : 'pass'}`, ...(un.length ? [`unregistered: ${un.join(' ')}`] : [])];
  const hs = Math.max(14, Math.round(26 * s));
  c.font = `${hs}px monospace`;
  lines.forEach((l, i) => {
    const y = oy + 8 + (i + 1) * (hs + 6);
    c.fillStyle = 'rgba(0,0,0,0.72)'; c.fillRect(ox + 6, y - hs, c.measureText(l).width + 10, hs + 6);
    c.fillStyle = rules.length ? '#ff8080' : '#a0ffb0'; c.fillText(l, ox + 11, y);
  });
  c.restore();
}

(globalThis as any).__lyricqa = { lyricqa, probe, finish, reset, instrument, seamRect, seamInfo, screenRect, registered, drawOverlay, activeAt, QA, gateFrame, gateReset };
