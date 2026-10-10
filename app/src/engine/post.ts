// Global post-processing: bloom + halation, chromatic aberration, the display grade (tone curve), film grain,
// vignette, fades/flash. Operates on the composited HDR (linear) frame.
import * as THREE from 'three';
import { FSPass, makeRT, W, H, SCALE } from './gl';

/** The Phase 0 tone shoulder (linear HDR -> 0..1 linear). `grade: 0` renders exactly this. */
export const SHOULDER_GLSL = /* glsl */ `
vec3 shoulder(vec3 x) {
  // identity below k, smooth exponential shoulder above; very bright values desaturate toward white
  const float k = 0.72;
  vec3 y = mix(x, k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k))), step(k, x));
  float over = max(max(x.r, x.g), x.b);
  // saturated highlights (the SOTA lamp core, #FF2E7E at 2-3 linear): compress the brightest channel and keep the
  // channel ratios, so the hue stays signal instead of drifting toward purple-pink when only R hits the shoulder.
  // Neutral highlights (bone, white-hot) keep the per-channel curve; the blend runs on saturation.
  if (over > k) {
    float so = k + (1.0 - k) * (1.0 - exp(-(over - k) / (1.0 - k)));
    float sat = (over - min(min(x.r, x.g), x.b)) / max(over, 1e-5);
    y = mix(y, x * (so / over), smoothstep(0.3, 0.8, sat));
  }
  return mix(y, vec3(1.0), smoothstep(2.0, 12.0, over) * 0.85);
}`;

/**
 * The v3 display grade (p1v3 "brighter, dense blacks"): scene-linear (× exposure) -> 0..1 display-linear.
 *   v = x · 2^ev                         exposure key (per plate / shot / frame)
 *   v = v² / (v + toe)                   soft black point: removes a veil of about `toe`, 0 stays 0 with zero slope
 *   v = v · (1 + mid · 4r / (1 + r)²)    mid lift, r = v / pivot: ×(1 + mid) at the pivot, ×1 toward black and white
 *   y = shoulder(v, knee)                exponential highlight roll-off above `knee` (the Phase 0 shape at 0.72)
 * Saturated colours (the SOTA magenta) take the curve on their brightest channel with the channel ratios kept (the
 * Phase 0 hue-preserving shoulder); very bright light desaturates toward white on its own level (ev does not burn
 * lamps). Then optional split toning and warm/cool separation on near-neutral pixels only (magenta, bone untouched),
 * and the pink guard: pale magenta (weak spill mixed with white, which the lift would make visible) goes toward grey.
 * `grade` blends from the Phase 0 shoulder (0) to this (1). Uniforms: set with setGradeUniforms().
 */
export const GRADE_GLSL = /* glsl */ `
${SHOULDER_GLSL}
uniform float grMix, grEV, grToe, grMid, grPivot, grKnee, grSplit, grWarmCool, grPinkGuard;
uniform vec3 grTintS, grTintH;
float grCurve(float v) {
  v = max(v, 0.0);
  v = v * v / max(v + grToe, 1e-8);
  float r = v / grPivot;
  v *= 1.0 + grMid * 4.0 * r / ((1.0 + r) * (1.0 + r));
  return v < grKnee ? v : grKnee + (1.0 - grKnee) * (1.0 - exp(-(v - grKnee) / (1.0 - grKnee)));
}
vec3 grade(vec3 x) {
  vec3 p0 = shoulder(x);
  if (grMix <= 0.0) return p0;
  vec3 xs = max(x, 0.0) * exp2(grEV);
  float over = max(max(xs.r, xs.g), xs.b);
  vec3 y = vec3(grCurve(xs.r), grCurve(xs.g), grCurve(xs.b));
  float sat = (over - min(min(xs.r, xs.g), xs.b)) / max(over, 1e-5);
  y = mix(y, xs * (grCurve(over) / max(over, 1e-5)), smoothstep(0.3, 0.8, sat));
  y = mix(y, vec3(1.0), smoothstep(2.0, 12.0, over * exp2(-grEV)) * 0.85);
  if (grSplit > 0.0 || grWarmCool != 0.0) {
    float mx = max(max(y.r, y.g), y.b), mn = min(min(y.r, y.g), y.b);
    float neutral = 1.0 - smoothstep(0.12, 0.45, (mx - mn) / max(mx, 1e-5)); // magenta and any saturated colour untouched
    // warm/cool by light colour: gain on the yellow-blue (tungsten-LED) axis; luminance and the magenta-green axis kept
    float T = 0.5 * (y.r + y.g) - y.b;
    y += grWarmCool * neutral * (T / 1.3154) * vec3(0.7538, -0.1231, -1.0);
    // split tone: shadows toward tintS, upper mids toward tintH, never the whites (bone stays bone) nor black
    float Y = luma(y);
    float ws = (1.0 - smoothstep(0.02, 0.25, Y)) * smoothstep(0.0, 0.01, Y), wh = smoothstep(0.15, 0.5, Y) * (1.0 - smoothstep(0.7, 0.92, Y));
    vec3 tint = mix(vec3(1.0), grTintS, ws * grSplit * neutral) * mix(vec3(1.0), grTintH, wh * grSplit * neutral);
    y = max(y * tint / max(luma(tint), 1e-4), 0.0);
  }
  if (grPinkGuard > 0.0) {
    // pink guard: the lift must not turn weak magenta spill mixed with white light into pale pink (§5.2: magenta is
    // signal or nothing). Pixels of magenta hue (R max, G min, 305-355 deg) at pale saturations (display S 0.12-0.45)
    // go toward grey; saturated magenta (the lamp, its direct spill, S > 0.55) is untouched.
    vec3 e = pow(max(y, 0.0), vec3(1.0 / 2.2));
    float mx = max(max(e.r, e.g), e.b), mn = min(min(e.r, e.g), e.b);
    float q = (e.b - e.g) / max(e.r - e.g, 1e-5), sv = (mx - mn) / max(mx, 1e-5);
    float w = (e.r >= mx && e.g <= mn ? 1.0 : 0.0) * smoothstep(0.04, 0.12, q) * smoothstep(0.06, 0.12, sv) * (1.0 - smoothstep(0.45, 0.55, sv));
    y = mix(y, vec3(luma(y)), 0.8 * grPinkGuard * w);
  }
  return mix(p0, y, grMix);
}`;

/**
 * Grade presets (spread into a scene's PostOverrides; any key can be keyed per shot / per frame).
 * BRIGHT is the default look. LEGIBLE lifts less above the low mids: a bone word on a lit face (scene ~0.05–0.14)
 * keeps WCAG 4.5:1 where BRIGHT gives ~2–3:1 (lyricqa contrast spans on the slice: Phase 0 1, LEGIBLE 5, BRIGHT 16),
 * at mean luma 0.208 instead of 0.252. P0 is the Phase 0 tone exactly.
 */
export const GRADE_BRIGHT = { grade: 1, ev: 0.5, toe: 0.005, mid: 2.0, pivot: 0.05, knee: 0.7 } as const satisfies Partial<PostParams>;
export const GRADE_LEGIBLE = { grade: 1, ev: 0.25, toe: 0.005, mid: 1.5, pivot: 0.01, knee: 0.8 } as const satisfies Partial<PostParams>;
export const GRADE_P0 = { grade: 0 } as const satisfies Partial<PostParams>;

/** Uniform objects for GRADE_GLSL (spread into an FSPass's uniforms). */
export function gradeUniforms(): Record<string, THREE.IUniform> {
  return {
    grMix: { value: 0 }, grEV: { value: 0 }, grToe: { value: 0 }, grMid: { value: 0 }, grPivot: { value: 0.18 }, grKnee: { value: 0.72 },
    grSplit: { value: 0 }, grWarmCool: { value: 0 }, grPinkGuard: { value: 0 }, grTintS: { value: new THREE.Vector3(1, 1, 1) }, grTintH: { value: new THREE.Vector3(1, 1, 1) },
  };
}

/** Set GRADE_GLSL's uniforms from post parameters (missing keys fall back to DEFAULT_POST). */
export function setGradeUniforms(u: Record<string, THREE.IUniform>, p: Partial<PostParams>) {
  const d = DEFAULT_POST, g = <K extends keyof PostParams>(k: K) => (p[k] ?? d[k]) as PostParams[K];
  u.grMix!.value = Math.min(1, Math.max(0, g('grade')));
  u.grEV!.value = g('ev');
  u.grToe!.value = Math.max(0, g('toe'));
  u.grMid!.value = Math.max(0, g('mid'));
  u.grPivot!.value = Math.max(1e-4, g('pivot'));
  u.grKnee!.value = Math.min(0.98, Math.max(0.05, g('knee')));
  u.grSplit!.value = Math.min(1, Math.max(0, g('splitTone')));
  u.grWarmCool!.value = g('warmCool');
  u.grPinkGuard!.value = Math.min(1, Math.max(0, g('pinkGuard')));
  (u.grTintS!.value as THREE.Vector3).set(...g('tintShadow'));
  (u.grTintH!.value as THREE.Vector3).set(...g('tintHigh'));
}

/** CPU reference of GRADE_GLSL's curve for one neutral channel value (tools, tests; the shader is the truth). */
export function gradeCurve(x: number, p: Partial<PostParams> = {}): number {
  const d = DEFAULT_POST, g = <K extends keyof PostParams>(k: K) => (p[k] ?? d[k]) as number;
  const shoulder0 = (v: number, k: number) => (v < k ? v : k + (1 - k) * (1 - Math.exp(-(v - k) / (1 - k))));
  const toe = Math.max(0, g('toe')), mid = Math.max(0, g('mid')), piv = Math.max(1e-4, g('pivot')), knee = Math.min(0.98, Math.max(0.05, g('knee')));
  let v = Math.max(0, x) * 2 ** g('ev');
  v = (v * v) / Math.max(v + toe, 1e-8);
  const r = v / piv;
  v *= 1 + (mid * 4 * r) / ((1 + r) * (1 + r));
  const y = shoulder0(v, knee), w = Math.min(1, Math.max(0, g('grade')));
  return shoulder0(Math.max(0, x), 0.72) * (1 - w) + y * w;
}

export interface PostParams {
  exposure: number;
  bloom: number; // bloom strength
  bloomThreshold: number; // linear luminance where bloom starts
  bloomKnee: number; // soft knee width
  bloomRadius: number; // 0..1 upsample spread
  halation: number; // film halation around highlights (strength)
  /** Linear RGB tint of the halation. Default warm-neutral (1, 0.9, 0.8) per TREATMENT §5.5 — never magenta in v2. */
  halationColor: [number, number, number];
  ca: number; // chromatic aberration in px at the frame edge (v2 plates keep it ≤ 0.3 outside impacts)
  grain: number; // grain amplitude (sRGB units), ~0.04-0.1
  vignette: number; // 0..1
  hud: number; // HUD opacity multiplier (crop marks, readout)
  /** 0..1: the crop-mark frame (1 = in place, 0 = flown out past the edges). Only the bookends use it: the opening's sheet and the outro's regenerate/loop. */
  frame: number;
  /** Opacity of the corner P(doom) readout — 0 by default; P(doom) is staged inside plates. */
  pdoom: number;
  /** 0..1: the frame is light (bone paper) — the HUD switches captions and crop marks to ink. */
  paper: number;
  fade: number; // fade to black 0..1
  flash: number; // additive bone-white flash 0..1+
  shake: [number, number]; // frame offset in px
  zoom: number; // frame zoom (1 = none), for punch-ins on hits
  invert: number; // 0..1 invert (ink <-> bone), applied before grain
  /** 0..~0.2: radial zoom blur toward the frame centre (whips, slams). */
  radial: number;
  /** Horizontal RGB split in px (red right, blue left) for hits. */
  split: number;
  /** Anamorphic streaks: horizontal flares from the bloom (0 = off). */
  streak: number;
  /** Replace the HUD P(doom) digits (e.g. 'NaN'). */
  pdoomText?: string;
  /** 0..1 glitch the HUD readout. */
  hudCorruption?: number;
  // ---- the v3 display grade (GRADE_GLSL; p1v3 targets replace TREATMENT §5.5/§5.6 where they conflict) ----
  /** 0 = the Phase 0 shoulder exactly (A/B), 1 = the v3 grade; in between blends them. */
  grade: number;
  /** exposure key in stops (per plate / per shot, any frame), applied with `exposure` before the curve */
  ev: number;
  /** soft black point, scene-linear after ev: v²/(v + toe) removes a veil of about `toe`, blacks stay dense (0 = off) */
  toe: number;
  /** mid lift: ×(1 + mid) at `pivot` (scene-linear after ev and toe), fading to ×1 at black and in the highlights */
  mid: number;
  pivot: number;
  /** highlight shoulder: the display-linear level where the roll-off to white starts (Phase 0: 0.72) */
  knee: number;
  /** 0..1 split toning on near-neutral pixels: shadows × tintShadow, upper mids × tintHigh (black, whites, bone, magenta untouched) */
  splitTone: number;
  tintShadow: [number, number, number];
  tintHigh: [number, number, number];
  /** warm/cool separation by light colour: gain on the yellow–blue (tungsten–LED) axis of near-neutral pixels, luminance and magenta–green kept (0 = off, 0.2–0.4 subtle, < 0 flattens) */
  warmCool: number;
  /** 0..1 pink guard: pale magenta (weak spill mixed with white light, display S 0.12–0.45) is pulled toward grey; saturated magenta untouched */
  pinkGuard: number;
  /** 0..1 the film's one look (v4, 2026-10-10 「風格統一」): every hue but the magenta family goes to the ink→bone ramp at its own luminance */
  unify: number;
}

export const DEFAULT_POST: PostParams = {
  exposure: 1,
  bloom: 0.55,
  bloomThreshold: 0.85,
  bloomKnee: 0.5,
  bloomRadius: 0.75,
  halation: 0.25,
  halationColor: [1, 0.9, 0.8],
  ca: 0.3,
  grain: 0.055,
  vignette: 0.35,
  hud: 1,
  frame: 0,
  pdoom: 0,
  paper: 0,
  fade: 0,
  flash: 0,
  shake: [0, 0],
  zoom: 1,
  invert: 0,
  radial: 0,
  split: 0,
  streak: 0,
  // v3 grade = GRADE_BRIGHT (pre1 + chorus1 as of p1v3, vs the Phase 0 tone: mean display luma 0.158 -> 0.252,
  // p99 >= 0.85 in 120 -> 216 of 221 frames, grey veil 36 % -> 16 %, p2 median 0.013 -> 0.004). It costs lyric contrast
  // where a sung word sits on a lit face: such shots key GRADE_LEGIBLE (or a lower `mid`) while the word is sung.
  grade: 1,
  ev: 0.5,
  toe: 0.005,
  mid: 2.0,
  pivot: 0.05,
  knee: 0.7,
  splitTone: 0,
  tintShadow: [0.94, 0.98, 1.08],
  tintHigh: [1.05, 1.0, 0.94],
  warmCool: 0,
  pinkGuard: 1,
  unify: 1,
};

const MIPS = 7;

export class Post {
  private prefilter: FSPass;
  private down: FSPass;
  private up: FSPass;
  private final: FSPass;
  private mips: THREE.WebGLRenderTarget[] = [];
  private ups: THREE.WebGLRenderTarget[] = [];

  constructor() {
    // the bloom pyramid stays at the logical resolution at every output scale (same radii, same look)
    let w = W >> 1, h = H >> 1;
    for (let i = 0; i < MIPS; i++) {
      this.mips.push(makeRT(Math.max(2, w), Math.max(2, h), { depthBuffer: false, pxScale: 1 }));
      this.ups.push(makeRT(Math.max(2, w), Math.max(2, h), { depthBuffer: false, pxScale: 1 }));
      w >>= 1; h >>= 1;
    }
    this.prefilter = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform vec2 texel; uniform float threshold, knee;
      void main() {
        // 4-tap box downsample + soft threshold on luminance
        vec3 c = vec3(0.0);
${SCALE === 1 ? `        c += texture(src, vUv + texel * vec2(-1, -1)).rgb; c += texture(src, vUv + texel * vec2(1, -1)).rgb;
        c += texture(src, vUv + texel * vec2(-1, 1)).rgb;  c += texture(src, vUv + texel * vec2(1, 1)).rgb;
        c *= 0.25;` : `        // output scale > 1: the same 4x4-logical-px box from a SCALE x larger source, as 2x2-texel bilinear taps
        const int N = ${SCALE * 2};
        for (int j = 0; j < N; j++) for (int i = 0; i < N; i++)
          c += texture(src, vUv + texel * (vec2(float(i), float(j)) * 2.0 - float(N - 1)) / PX_SCALE).rgb;
        c /= float(N * N);`}
        c = min(c, vec3(40.0));
        float l = max(c.r, max(c.g, c.b));
        float rq = clamp(l - threshold + knee, 0.0, 2.0 * knee);
        rq = rq * rq / (4.0 * knee + 1e-5);
        float w = max(rq, l - threshold) / max(l, 1e-5);
        fragColor = vec4(c * w, 1.0);
      }`, { src: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, knee: { value: 0.5 } });
    this.down = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform vec2 texel;
      void main() {
        // 13-tap downsample (Jimenez 2014)
        vec3 a = texture(src, vUv + texel * vec2(-2, -2)).rgb, b = texture(src, vUv + texel * vec2(0, -2)).rgb, c = texture(src, vUv + texel * vec2(2, -2)).rgb;
        vec3 d = texture(src, vUv + texel * vec2(-1, -1)).rgb, e = texture(src, vUv + texel * vec2(1, -1)).rgb;
        vec3 f = texture(src, vUv + texel * vec2(-2, 0)).rgb, g = texture(src, vUv).rgb, h = texture(src, vUv + texel * vec2(2, 0)).rgb;
        vec3 i = texture(src, vUv + texel * vec2(-1, 1)).rgb, j = texture(src, vUv + texel * vec2(1, 1)).rgb;
        vec3 k = texture(src, vUv + texel * vec2(-2, 2)).rgb, l = texture(src, vUv + texel * vec2(0, 2)).rgb, m = texture(src, vUv + texel * vec2(2, 2)).rgb;
        vec3 o = (d + e + i + j) * 0.125 + (a + b + g + f) * 0.03125 + (b + c + h + g) * 0.03125 + (f + g + l + k) * 0.03125 + (g + h + m + l) * 0.03125;
        fragColor = vec4(o, 1.0);
      }`, { src: { value: null }, texel: { value: new THREE.Vector2() } });
    this.up = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform sampler2D prev; uniform vec2 texel; uniform float radius;
      void main() {
        // 9-tap tent upsample of the smaller level, added to this level
        vec2 o = texel * radius;
        vec3 s = texture(src, vUv - o).rgb + 2.0 * texture(src, vUv + vec2(0, -o.y)).rgb + texture(src, vUv + vec2(o.x, -o.y)).rgb
          + 2.0 * texture(src, vUv + vec2(-o.x, 0)).rgb + 4.0 * texture(src, vUv).rgb + 2.0 * texture(src, vUv + vec2(o.x, 0)).rgb
          + texture(src, vUv + vec2(-o.x, o.y)).rgb + 2.0 * texture(src, vUv + vec2(0, o.y)).rgb + texture(src, vUv + o).rgb;
        fragColor = vec4(texture(prev, vUv).rgb + s / 16.0, 1.0);
      }`, { src: { value: null }, prev: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    this.final = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform sampler2D bloomTex; uniform sampler2D haloTex; uniform sampler2D hudTex;
      uniform vec3 halationColor;
      uniform float exposure, bloom, halation, ca, grain, vignette, hud, fade, flash, time, zoom, invert, radial, split, streak, unify;
      uniform vec2 shake; uniform vec2 res;
      ${GRADE_GLSL}
      // v4 one-look: hues outside the magenta family collapse onto the ink→bone ramp (same luminance, bone's cool tint);
      // magenta, pink and the reds next to it keep their colour
      vec3 unifyCol(vec3 y) {
        vec3 e = pow(max(y, 0.0), vec3(1.0 / 2.2));
        float mx = max(max(e.r, e.g), e.b), mn = min(min(e.r, e.g), e.b), d = mx - mn;
        float sv = d / max(mx, 1e-5);
        float h = 0.0;
        if (d > 1e-5) {
          if (mx == e.r) h = mod((e.g - e.b) / d, 6.0);
          else if (mx == e.g) h = (e.b - e.r) / d + 2.0;
          else h = (e.r - e.g) / d + 4.0;
          h *= 60.0;
        }
        float dh = min(abs(h - 338.0), 360.0 - abs(h - 338.0));
        float keep = (1.0 - smoothstep(24.0, 42.0, dh)) * smoothstep(0.10, 0.28, sv);
        vec3 n = vec3(luma(y)) * vec3(1.015, 0.985, 1.075);
        return mix(n, y, keep);
      }
      void main() {
        vec2 uv = (vUv - 0.5) / zoom + 0.5 - shake / res;
        vec2 dc = uv - 0.5;
        float r2 = dot(dc * vec2(res.x / res.y, 1.0), dc * vec2(res.x / res.y, 1.0));
        vec2 off = dc * r2 * ca / res.x * 4.0;
        vec3 col = vec3(0.0);
        vec2 sp = vec2(split / res.x, 0.0);
        // radial zoom blur: average taps along the ray to the centre (one tap when radial = 0)
        int taps = radial > 0.001 ? 12 : 1;
        for (int k = 0; k < 12; k++) {
          if (k >= taps) break;
          float s = 1.0 - radial * float(k) / 11.0;
          vec2 u = 0.5 + (uv - 0.5) * s;
          col.r += texture(src, u + off + sp).r;
          col.g += texture(src, u).g;
          col.b += texture(src, u - off - sp).b;
        }
        col /= float(taps);
        vec3 bl = texture(bloomTex, uv).rgb;
        vec3 ha = texture(haloTex, uv).rgb;
        col += bl * bloom;
        if (streak > 0.0) {
          vec3 st = vec3(0.0);
          for (int k = 1; k <= 16; k++) {
            float o = float(k) * 0.0095, w = exp(-float(k) * 0.2);
            st += (texture(bloomTex, uv + vec2(o, 0.0)).rgb + texture(bloomTex, uv - vec2(o, 0.0)).rgb) * w;
          }
          col += st * streak * vec3(0.8, 0.72, 1.0);
        }
        col += halationColor * luma(ha) * halation; // film halation (warm-neutral by default, §5.5)
        col *= exposure;
        // HUD is composited in linear space before the shoulder so it gets grain & vignette too
        vec4 h = texture(hudTex, vUv);
        col = mix(col, h.rgb / max(h.a, 1e-4), h.a * hud);
        col = grade(col);
        if (unify > 0.0) col = mix(col, unifyCol(col), unify);
        col = mix(col, vec3(0.8515) - col * 0.84, invert); // ink<->bone in linear-ish space
        col += C_BONE * flash;
        // vignette
        float v = smoothstep(0.95, 0.25, length(dc * vec2(1.0, 0.8)));
        col *= mix(1.0, v, vignette);
        col *= (1.0 - fade);
        vec3 s = toSRGB(sat(col));
        // film grain: two scales, stronger in mid-tones
${SCALE === 1 ? `        float g1 = hash12(gl_FragCoord.xy + fract(time * 13.37) * 1000.0) - 0.5;
        float g2 = hash12(floor(gl_FragCoord.xy / 2.0) + fract(time * 7.13) * 1000.0) - 0.5;` : `        // output scale > 1: the fine grain is per physical px with its amplitude raised by PX_SCALE so its
        // power per logical px (what survives a downscale) matches 1x; the coarse grain keeps 2x2-logical-px cells
        float g1 = (hash12(gl_FragCoord.xy + fract(time * 13.37) * 1000.0) - 0.5) * PX_SCALE;
        float g2 = hash12(floor(FRAG_PX / 2.0) + fract(time * 7.13) * 1000.0) - 0.5;`}
        float lm = luma(s);
        // (the v3 grade keeps blacks dense: less grain in the deep shadows, the same from the low mids up)
        float amt = grain * (mix(0.55, 0.2 + 0.35 * smoothstep(0.0, 0.12, lm), grMix) + 1.2 * lm * (1.0 - lm));
        s += (g1 * 0.6 + g2 * 0.4) * amt;
        s += (hash12(gl_FragCoord.xy * 1.37 + time) - 0.5) / 255.0; // dither
        fragColor = vec4(sat(s), 1.0);
      }`, {
      src: { value: null }, bloomTex: { value: null }, haloTex: { value: null }, hudTex: { value: null },
      exposure: { value: 1 }, bloom: { value: 0.5 }, halation: { value: 0.2 }, halationColor: { value: new THREE.Vector3(1, 0.9, 0.8) }, ca: { value: 1 }, grain: { value: 0.05 },
      vignette: { value: 0.3 }, hud: { value: 1 }, fade: { value: 0 }, flash: { value: 0 }, time: { value: 0 },
      zoom: { value: 1 }, invert: { value: 0 }, radial: { value: 0 }, split: { value: 0 }, streak: { value: 0 }, unify: { value: 1 }, shake: { value: new THREE.Vector2() }, res: { value: new THREE.Vector2(W, H) },
      ...gradeUniforms(),
    });
  }

  /** Apply the chain: src (HDR linear) -> out (sRGB 8-bit target or screen). */
  render(renderer: THREE.WebGLRenderer, src: THREE.Texture, hud: THREE.Texture, out: THREE.WebGLRenderTarget | null, p: PostParams, time: number) {
    // bloom pyramid
    this.prefilter.u.src!.value = src;
    (this.prefilter.u.texel!.value as THREE.Vector2).set(1 / W, 1 / H);
    this.prefilter.u.threshold!.value = p.bloomThreshold;
    this.prefilter.u.knee!.value = p.bloomKnee;
    this.prefilter.render(renderer, this.mips[0]!);
    for (let i = 1; i < MIPS; i++) {
      const s = this.mips[i - 1]!;
      this.down.u.src!.value = s.texture;
      (this.down.u.texel!.value as THREE.Vector2).set(1 / s.width, 1 / s.height);
      this.down.render(renderer, this.mips[i]!);
    }
    // upsample: ups[i] = mips[i] + up(ups[i+1])
    let prevTex = this.mips[MIPS - 1]!.texture;
    for (let i = MIPS - 2; i >= 0; i--) {
      const small = i === MIPS - 2 ? this.mips[MIPS - 1]! : this.ups[i + 1]!;
      this.up.u.src!.value = prevTex;
      this.up.u.prev!.value = this.mips[i]!.texture;
      (this.up.u.texel!.value as THREE.Vector2).set(1 / small.width, 1 / small.height);
      this.up.u.radius!.value = 0.5 + p.bloomRadius;
      this.up.render(renderer, this.ups[i]!);
      prevTex = this.ups[i]!.texture;
    }
    const f = this.final.u;
    f.src!.value = src;
    f.bloomTex!.value = this.ups[0]!.texture;
    f.haloTex!.value = this.ups[3]!.texture;
    f.hudTex!.value = hud;
    f.exposure!.value = p.exposure;
    f.bloom!.value = p.bloom / 3; // pyramid sums ~MIPS levels; normalize
    f.halation!.value = p.halation;
    const hc = p.halationColor ?? DEFAULT_POST.halationColor;
    (f.halationColor!.value as THREE.Vector3).set(hc[0], hc[1], hc[2]);
    f.radial!.value = p.radial;
    f.split!.value = p.split;
    f.streak!.value = p.streak;
    f.ca!.value = p.ca;
    f.grain!.value = p.grain;
    f.vignette!.value = p.vignette;
    f.hud!.value = p.hud;
    f.fade!.value = p.fade;
    f.flash!.value = p.flash;
    f.time!.value = time;
    f.zoom!.value = p.zoom;
    f.invert!.value = p.invert;
    f.unify!.value = p.unify ?? 1;
    (f.shake!.value as THREE.Vector2).set(p.shake[0], p.shake[1]);
    setGradeUniforms(f, p);
    this.final.render(renderer, out);
  }
}
