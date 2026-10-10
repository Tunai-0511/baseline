// Seams and the film camera (remake): designed transitions across cuts, and a camera that moves the
// composited frame (slow pushes on static plates, punches on hits). Both run per sub-frame, before the
// motion-blur average, so every warp they make is blurred like real camera motion.
import * as THREE from 'three';
import { FSPass, W, H } from './gl';
import { DEFAULT_POST, type PostParams } from './post';

/**
 * How a seam carries A into B:
 * - zoom:  the camera punches into A (towards ca) and comes out of B (from cb).
 * - whip:  a whip pan: A and B side by side along `dir`, the camera flies from one to the other.
 * - burn:  a front of fire eats A from ca outwards and leaves B behind it.
 * - slice: horizontal bands slide out of A and into B, each on its own delay (with an RGB split).
 * - swirl: A is wrung into a vortex at ca, B unwinds out of cb.
 * - luma:  B comes in through its own light, brightest parts first, while A sinks.
 * - flash: a cut with a punch on B (the flash itself is in `fx`).
 * - push:  B slides in along `dir` over A, which is pushed along and darkens.
 */
export type SeamKind = 'zoom' | 'whip' | 'burn' | 'slice' | 'swirl' | 'luma' | 'flash' | 'push';
const KINDS: SeamKind[] = ['zoom', 'whip', 'burn', 'slice', 'swirl', 'luma', 'flash', 'push'];

export interface Seam {
  /** The cut (song s): A is the image before it, B after. */
  at: number;
  /** Timeline entry ids. The same id on both sides makes a seam over a cut inside one scene. */
  a: string;
  b: string;
  /** The transition spans [at - pre, at + post]. */
  pre: number;
  post: number;
  kind: SeamKind;
  /** Centres in uv (0..1, y down like the layout: converted for GL), for A and for B (defaults: middle). */
  ca?: [number, number];
  cb?: [number, number];
  /** Direction for whip / slice / push, in screen terms (x right, y down). */
  dir?: [number, number];
  /** Kind-specific parameters (see the shader). */
  p?: [number, number, number, number];
  seed?: number;
  /**
   * A shows its own time clamped to just before the cut, B to the cut, so each side holds its last / first
   * image while it is off its own time. `run` lets a side keep playing instead (A past its end, B before
   * its start: only for scenes that look right there).
   */
  run?: { a?: boolean; b?: boolean };
  /** Post-processing of the seam: a flash and a chromatic burst at the cut, an exposure swell (bells of `width` s). */
  fx?: { flash?: number; ca?: number; exposure?: number; bloom?: number; width?: number };
  /** Where (0..1 of the seam) the post settings swap from A's to B's, and over how much of it. Default: at the cut. */
  postAt?: number;
  postW?: number;
}

/** A camera hit: a zoom punch, a roll kick and a shake, decaying exponentially from t. */
export interface Hit {
  t: number;
  /** Zoom punch (added to the zoom: 0.05 = 5 %). */
  z?: number;
  /** Roll kick (degrees). */
  r?: number;
  /** Shake amplitude (logical px). */
  shake?: number;
  /** Decay time constant (s). */
  decay?: number;
  /** Attack (s): the punch ramps in over this (a ramp blurs, a step double-exposes). */
  attack?: number;
  /** A shockwave: a ring that refracts the picture as it runs out from `at` (uv, layout y down), `shock` px deep. */
  shock?: number;
  shockSpeed?: number; // px/s
  shockAt?: [number, number];
}

/**
 * A slow camera move across a span of the song (zoom, roll in degrees, pan in logical px). With `id` it moves
 * that timeline entry's picture only, at the entry's own time (so it holds still with the entry when a seam
 * holds it); without, it moves the whole frame.
 */
export interface CamMove {
  id?: string;
  from: number;
  to: number;
  z?: [number, number];
  r?: [number, number];
  x?: [number, number];
  y?: [number, number];
  ease?: 'lin' | 'io' | 'out' | 'in';
}

export interface Direction {
  seams: Seam[];
  hits: Hit[];
  moves: CamMove[];
}

export interface Cam {
  z: number;
  ang: number; // radians
  ox: number; // uv units
  oy: number;
  /** The strongest shockwave ring on screen: centre (uv, y down), radius and depth (logical px); depth 0 = none. */
  shock: { cx: number; cy: number; r: number; amp: number };
}

const easeFn = (e: CamMove['ease'], u: number) => {
  u = Math.min(1, Math.max(0, u));
  if (e === 'lin') return u;
  if (e === 'out') return 1 - (1 - u) ** 3;
  if (e === 'in') return u ** 3;
  return u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
};

/**
 * The camera that `moves` and `hits` make at t (identity when nothing moves it). `hold`: moves hold their end
 * values outside their span (an entry's own move, when a seam plays the entry past its end).
 */
export function camAt(moves: CamMove[], hits: Hit[], t: number, hold = false): Cam {
  let z = 1, ang = 0, x = 0, y = 0;
  const shock = { cx: 0.5, cy: 0.5, r: 0, amp: 0 };
  for (const h of hits) {
    if (!h.shock) continue;
    const dt = t - h.t, sp = h.shockSpeed ?? 2600;
    if (dt < 0 || dt > 1.4) continue;
    const amp = h.shock * Math.exp(-dt / 0.35);
    if (amp > shock.amp && amp > 0.3) Object.assign(shock, { cx: h.shockAt?.[0] ?? 0.5, cy: h.shockAt?.[1] ?? 0.5, r: dt * sp, amp });
  }
  for (const m of moves) {
    if (!hold && (t < m.from - 1e-6 || t > m.to + 1e-6)) continue;
    const u = easeFn(m.ease, (t - m.from) / Math.max(1e-6, m.to - m.from));
    if (m.z) z *= m.z[0] + (m.z[1] - m.z[0]) * u;
    if (m.r) ang += ((m.r[0] + (m.r[1] - m.r[0]) * u) * Math.PI) / 180;
    if (m.x) x += m.x[0] + (m.x[1] - m.x[0]) * u;
    if (m.y) y += m.y[0] + (m.y[1] - m.y[0]) * u;
  }
  for (const h of hits) {
    const dt = t - h.t;
    const decay = h.decay ?? 0.2;
    if (dt < -(h.attack ?? 0.02) || dt > decay * 7) continue;
    const at = h.attack ?? 0.02;
    const env = dt < 0 ? 1 + dt / at : Math.exp(-dt / decay);
    // (a hit's tail is dropped once it moves the picture less than about a pixel: resampling the frame
    // for nothing would only soften its hairlines)
    if ((h.z ?? 0) * env < 8e-4 && (h.shake ?? 0) * env < 0.4 && Math.abs(h.r ?? 0) * env < 0.03) continue;
    if (h.z) z *= 1 + h.z * env;
    if (h.r) ang += ((h.r * Math.PI) / 180) * env * Math.cos(dt * 22);
    if (h.shake) {
      // (a smooth deterministic wobble: sub-frames blur it like a real shake)
      const s = h.shake * env;
      x += s * (Math.sin(dt * 71 + h.t * 13) * 0.6 + Math.sin(dt * 43 + h.t * 7) * 0.4);
      y += s * (Math.sin(dt * 59 + h.t * 5) * 0.6 + Math.sin(dt * 37 + h.t * 11) * 0.4);
    }
  }
  const ox = x / W, oy = y / H;
  // never show past the frame's edge: the zoom covers the roll and the pan
  const a = W / H, c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang));
  const zmin = Math.max((a / 2 * c + 0.5 * s) / Math.max(1e-3, a / 2 - Math.abs(ox) * a), (a / 2 * s + 0.5 * c) / Math.max(1e-3, 0.5 - Math.abs(oy)));
  return { z: Math.max(z, zmin), ang, ox, oy, shock };
}

/** (under ~0.2 px of movement anywhere in the frame counts as still: the frame isn't resampled) */
export const camIsIdentity = (c: Cam) => Math.abs(c.z - 1) < 2e-4 && Math.abs(c.ang) < 2e-4 && Math.abs(c.ox) < 1e-4 && Math.abs(c.oy) < 2e-4 && c.shock.amp === 0;

/** The seam's post: A's settings before the swap, B's after, continuous ones blended; plus the seam's own fx. */
export function seamPost(s: Seam, k: number, a: PostParams, b: PostParams): PostParams {
  const ks = s.pre / (s.pre + s.post);
  const at = s.postAt ?? ks, w = s.postW ?? 0.08;
  const u = Math.min(1, Math.max(0, (k - (at - w)) / (2 * w)));
  const m = u * u * (3 - 2 * u);
  const side = k < at ? a : b;
  const out: PostParams = { ...side };
  const blend: (keyof PostParams)[] = ['exposure', 'bloom', 'bloomThreshold', 'bloomKnee', 'bloomRadius', 'halation', 'ca', 'grain', 'vignette', 'hud', 'fade', 'flash'];
  for (const key of blend) {
    const va = (a[key] ?? DEFAULT_POST[key]) as number, vb = (b[key] ?? DEFAULT_POST[key]) as number;
    (out as any)[key] = va + (vb - va) * m;
  }
  const fx = s.fx;
  if (fx) {
    const span = s.pre + s.post, dt = (k - ks) * span, wd = fx.width ?? 0.12;
    const bell = Math.exp(-((dt / wd) ** 2));
    if (fx.flash) out.flash = (out.flash ?? 0) + fx.flash * bell;
    if (fx.ca) out.ca = (out.ca ?? 0) + fx.ca * bell;
    if (fx.exposure) out.exposure = (out.exposure ?? 1) * (1 + fx.exposure * bell);
    if (fx.bloom) out.bloom = (out.bloom ?? 0) + fx.bloom * bell;
  }
  return out;
}

const SEAM_FRAG = /* glsl */ `
uniform sampler2D A; uniform sampler2D B;
uniform float k, ks, aspect, seed;
uniform int kind;
uniform vec2 ca, cb, dir;
uniform vec4 p;
const vec2 RES = vec2(${W}.0, ${H}.0);

// a frame's texel, ink outside it (with a 1.5 px soft edge so a moving frame's border doesn't stair-step)
vec3 tapE(sampler2D s, vec2 uv) {
  vec2 e = min(uv, 1.0 - uv) * RES;
  float m = smoothstep(-0.75, 0.75, min(e.x, e.y));
  if (m <= 0.0) return C_INK;
  return mix(C_INK, texture(s, clamp(uv, 0.0, 1.0)).rgb, m);
}
float inFrame(vec2 uv) { vec2 e = min(uv, 1.0 - uv) * RES; return smoothstep(-0.75, 0.75, min(e.x, e.y)); }
vec2 asp(vec2 v) { return v * vec2(aspect, 1.0); }
vec2 unasp(vec2 v) { return v / vec2(aspect, 1.0); }
// zoom by z and roll by ang about c
vec2 zr(vec2 uv, vec2 c, float z, float ang) { return c + unasp(rot2(ang) * asp(uv - c) / z); }
float easeIn(float u, float n) { return pow(clamp(u, 0.0, 1.0), n); }

void main() {
  vec2 uv = vUv;
  float pre = max(ks, 1e-4), post = max(1.0 - ks, 1e-4);
  vec3 col;

  if (kind == 0) {
    // ZOOM. p: A's zoom at the cut, B's zoom at the cut (>1 pulls back out of B, <1 flies up to it), ease power, roll (rad) at the cut
    if (k < ks) {
      float e = easeIn(k / pre, p.z);
      col = tapE(A, zr(uv, ca, exp(log(p.x) * e), p.w * e));
    } else {
      float e = easeIn(1.0 - (k - ks) / post, p.z);
      col = tapE(B, zr(uv, cb, exp(log(p.y) * e), -p.w * e));
    }
  } else if (kind == 1) {
    // WHIP. p: gap between the frames (in frames), ease power, pull-back mid-whip, roll (rad) mid-whip
    float o = k < ks ? 0.5 * easeIn(k / pre, p.y) : 1.0 - 0.5 * easeIn((1.0 - k) / post, p.y);
    float mid = sin(PI * o);
    vec2 fs = vec2(aspect, 1.0);
    vec2 v = rot2(p.w * mid) * asp(uv - 0.5) / (1.0 - p.z * mid);
    vec2 sh = dir * fs * (1.0 + p.x) * o;
    vec2 ua = (v + sh) / fs + 0.5;
    vec2 ub = (v + sh - dir * fs * (1.0 + p.x)) / fs + 0.5;
    col = C_INK;
    col = mix(col, texture(A, clamp(ua, 0.0, 1.0)).rgb, inFrame(ua));
    col = mix(col, texture(B, clamp(ub, 0.0, 1.0)).rgb, inFrame(ub));
  } else if (kind == 2) {
    // BURN. p: noise scale, noise share of the front (0..1), edge width, glow
    vec2 far = max(ca, 1.0 - ca);
    float f = length(asp(uv - ca)) / length(asp(far));
    float n = fbm(asp(uv) * p.x + seed * 7.13, 5) * 0.5 + 0.5;
    float field = mix(f, n, p.y);
    float kk = k * k * (3.0 - 2.0 * k);
    float th = mix(-p.z * 4.0, 1.0 + p.z * 4.0, kk);
    float d = field - th; // < 0: burnt through to B
    vec3 a = texture(A, uv).rgb, b = texture(B, uv).rgb;
    float aw = fwidth(d) * 1.5 + 1e-4;
    float onA = smoothstep(-aw, aw, d);
    // A scorches ahead of the front; B is warm for a moment behind it
    vec3 aSide = a * smoothstep(0.0, p.z * 3.0, d) + C_BLOOD * 0.05 * smoothstep(p.z * 3.0, 0.0, d);
    vec3 bSide = b * (1.0 + 0.6 * exp(d / (p.z * 2.0)) * vec3(1.0, 0.55, 0.3));
    col = mix(bSide, aSide, onA);
    float glow = exp(-abs(d) / p.z);
    col += mix(C_BLOOD, C_EMBER, glow) * glow * p.w;
    // embers lifting off the front
    vec2 cell = floor(uv * RES / 5.0);
    float h = hash12(cell + floor(seed * 91.0));
    float ember = step(0.992, h) * exp(-abs(d - 0.02 * h) / (p.z * 0.6));
    col += C_EMBER * ember * p.w * 1.5;
  } else if (kind == 3) {
    // SLICE. p: bands, delay spread (0..0.8), RGB split (uv), band irregularity
    float yy = uv.y * p.x;
    yy += p.w * 0.45 * sin(uv.y * p.x * 0.61 + seed * 3.1);
    float band = floor(yy);
    float di = hash11(band * 1.37 + seed * 17.0) * p.y;
    float l = clamp((k - di) / (1.0 - p.y), 0.0, 1.0);
    float o = l < 0.5 ? 4.0 * l * l * l : 1.0 - pow(-2.0 * l + 2.0, 3.0) / 2.0;
    float spd = 6.0 * l * (1.0 - l); // ~ the band's speed, 0 at rest
    float sgn = mod(band, 2.0) < 1.0 ? 1.0 : -1.0;
    vec2 d2 = vec2(dir.x * sgn, 0.0);
    vec2 ua = uv + d2 * o * 1.04;
    vec2 ub = uv + d2 * (o - 1.0) * 1.04;
    vec2 sp = d2 * spd * p.z;
    vec3 a = vec3(texture(A, clamp(ua + sp, 0.0, 1.0)).r, texture(A, clamp(ua, 0.0, 1.0)).g, texture(A, clamp(ua - sp, 0.0, 1.0)).b);
    vec3 b = vec3(texture(B, clamp(ub + sp, 0.0, 1.0)).r, texture(B, clamp(ub, 0.0, 1.0)).g, texture(B, clamp(ub - sp, 0.0, 1.0)).b);
    col = C_INK;
    col = mix(col, a, inFrame(ua));
    col = mix(col, b, inFrame(ub));
    // a hot scanline along the moving band edges
    float edge = 1.0 - smoothstep(0.0, 0.03, min(fract(yy), 1.0 - fract(yy)));
    col += C_SIGNAL * edge * spd * 0.35;
  } else if (kind == 4) {
    // SWIRL. p: turns at the cut, zoom at the cut, ease power, dark core radius
    vec2 c = k < ks ? ca : cb;
    float e = k < ks ? easeIn(k / pre, p.z) : easeIn(1.0 - (k - ks) / post, p.z);
    float sg = k < ks ? 1.0 : -1.0;
    vec2 v = asp(uv - c);
    float r = length(v);
    float ang = sg * p.x * TAU * e * exp(-r * 1.6);
    float z = exp(log(p.y) * e);
    vec2 s = c + unasp(rot2(ang) * v / z);
    col = k < ks ? tapE(A, s) : tapE(B, s);
    col *= smoothstep(p.w * e * 0.4, p.w * e, r);
  } else if (kind == 5) {
    // LUMA. p: softness, noise share, A's sink, -
    float kk = k * k * (3.0 - 2.0 * k);
    vec3 a = texture(A, uv).rgb, b = texture(B, uv).rgb;
    float key = mix(sat(luma(b) * 1.6), fbm(uv * 3.0 + seed, 3) * 0.5 + 0.5, p.y);
    float th = mix(1.0 + p.x, -p.x, kk);
    float m = smoothstep(th - p.x, th + p.x, key);
    col = mix(a * (1.0 - p.z * kk), b, max(m, smoothstep(0.8, 1.0, kk)));
  } else if (kind == 6) {
    // FLASH. p: B's punch zoom at the cut, its decay power
    if (k < ks) col = texture(A, uv).rgb;
    else col = tapE(B, zr(uv, cb, 1.0 + p.x * easeIn(1.0 - (k - ks) / post, p.y), 0.0));
  } else {
    // PUSH. p: A's share of the motion, ease power, overshoot, B's roll (rad) on entry
    float l = clamp(k, 0.0, 1.0);
    float o = 1.0 - pow(1.0 - l, p.y);
    o += p.z * sin(PI * clamp((l - 0.55) / 0.45, 0.0, 1.0)) * (1.0 - l);
    // (B starts far enough out that its rolled corners are off screen too)
    vec2 ub = uv - 0.5 + dir * (1.0 - o) * (1.0 + abs(p.w) * 1.4);
    ub = 0.5 + unasp(rot2(p.w * (1.0 - o)) * asp(ub));
    vec2 ua = uv - dir * o * p.x;
    vec3 a = tapE(A, ua) * (1.0 - 0.65 * o);
    // B's leading edge throws a soft shadow over A
    vec2 eb = min(ub, 1.0 - ub);
    float sh = 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.08, -min(eb.x, eb.y))) * step(min(eb.x, eb.y), 0.0);
    col = mix(a * sh, texture(B, clamp(ub, 0.0, 1.0)).rgb, inFrame(ub));
  }
  fragColor = vec4(col, 1.0);
}`;

export class SeamPass {
  pass = new FSPass(SEAM_FRAG, {
    A: { value: null }, B: { value: null }, k: { value: 0 }, ks: { value: 0.5 }, aspect: { value: W / H }, seed: { value: 0 },
    kind: { value: 0 }, ca: { value: new THREE.Vector2(0.5, 0.5) }, cb: { value: new THREE.Vector2(0.5, 0.5) },
    dir: { value: new THREE.Vector2(1, 0) }, p: { value: new THREE.Vector4() },
  });
  /** Default parameters per kind (Seam.p overrides). */
  static DEFAULTS: Record<SeamKind, [number, number, number, number]> = {
    zoom: [5, 2.5, 2.4, 0],
    whip: [0.08, 3, 0.12, 0.05],
    burn: [2.6, 0.38, 0.035, 5],
    slice: [14, 0.45, 0.012, 1],
    swirl: [0.6, 3, 2.2, 0.3],
    luma: [0.25, 0.25, 0.8, 0],
    flash: [0.08, 3, 0, 0],
    push: [0.35, 3.2, 0.04, 0.06],
  };
  render(renderer: THREE.WebGLRenderer, s: Seam, k: number, a: THREE.Texture, b: THREE.Texture, out: THREE.WebGLRenderTarget) {
    const u = this.pass.u;
    u.A!.value = a; u.B!.value = b;
    u.k!.value = k; u.ks!.value = s.pre / (s.pre + s.post);
    u.kind!.value = KINDS.indexOf(s.kind);
    u.seed!.value = s.seed ?? (s.at * 7.31) % 13;
    // (layout uv is y down, GL's is y up)
    const ca = s.ca ?? [0.5, 0.5], cb = s.cb ?? ca, dir = s.dir ?? [1, 0];
    (u.ca!.value as THREE.Vector2).set(ca[0], 1 - ca[1]);
    (u.cb!.value as THREE.Vector2).set(cb[0], 1 - cb[1]);
    (u.dir!.value as THREE.Vector2).set(dir[0], -dir[1]);
    const p = s.p ?? SeamPass.DEFAULTS[s.kind];
    (u.p!.value as THREE.Vector4).set(...p);
    this.pass.render(renderer, out);
  }
}

export class CameraPass {
  pass = new FSPass(/* glsl */ `
    uniform sampler2D src; uniform float z, ang, aspect; uniform vec2 off; uniform vec4 shock; // centre uv (GL), radius px, depth px
    void main() {
      vec2 uv = vUv;
      if (shock.w > 0.0) {
        // the ring refracts: a radial push in and out across its width (and a little colour split)
        vec2 d = (uv - shock.xy) * vec2(${W}.0, ${H}.0);
        float r = length(d), w = 70.0 + shock.z * 0.06;
        float x = (r - shock.z) / w;
        float prof = -x * exp(-x * x * 2.0);
        uv -= (d / max(r, 1.0)) * prof * shock.w / vec2(${W}.0, ${H}.0);
      }
      vec2 v = rot2(ang) * ((uv - 0.5) * vec2(aspect, 1.0)) / z;
      fragColor = vec4(texture(src, clamp(v / vec2(aspect, 1.0) + 0.5 - off, 0.0, 1.0)).rgb, 1.0);
    }`, { src: { value: null }, z: { value: 1 }, ang: { value: 0 }, aspect: { value: W / H }, off: { value: new THREE.Vector2() }, shock: { value: new THREE.Vector4() } });
  render(renderer: THREE.WebGLRenderer, c: Cam, src: THREE.Texture, out: THREE.WebGLRenderTarget) {
    const u = this.pass.u;
    u.src!.value = src; u.z!.value = c.z; u.ang!.value = c.ang;
    // (layout y down: a positive y pan moves the picture down)
    (u.off!.value as THREE.Vector2).set(c.ox, -c.oy);
    (u.shock!.value as THREE.Vector4).set(c.shock.cx, 1 - c.shock.cy, c.shock.r, c.shock.amp);
    this.pass.render(renderer, out);
  }
}
