// Analytic lighting for THE SHAFT (TREATMENT §5.4). Owner: lookdev.
//
// The film has no three.js lights and no shadow maps: every material is a hand-written ShaderMaterial that
// includes LIGHT_GLSL and reads ONE set of global light uniforms (LIGHT_UNIFORMS). A plate owns a LightRig
// (its lighting state) and calls rig.apply() at the start of every render(): that copies the rig into the
// shared uniforms, so every material of every kit is lit by the scene that is drawing. Scenes never overlap on
// the timeline, so one global state per frame is enough.
//
// Units: every `intensity` is in "what a white matte card shows": an albedo-1 Lambert surface facing the light
// at the reference distance has linear radiance = intensity × colour. The BRDF is GGX (height-correlated Smith,
// Schlick Fresnel) + Lambert (optional wrap); area sources widen the specular lobe (Karis representative point).
//
//   key       one analytic spot work light per scene: pos, dir, cone + soft edge, 1/d² (`ref`: distance at which
//             `intensity` is reached), N·L, GGX widened by the lamp's `size`. Casts the occluders' soft shadows.
//   fill      optional second spot (same shape, never shadowed, default off): bounce / kicker
//   strips    ≤ 4 line lights (ring LED strips): closed-form line integral for the diffuse (1/d near a long
//             strip, 1/d² far away), representative point for the specular; `intensity` = at 1 m from a long strip
//   sig       the magenta light of the current SOTA lamp, a small physical emitter: `intensity` = the emitter's own
//             surface radiance (the same number as the lamp core's emission), area = size[0]·size[1], dome-shaped
//             emission (full above, none below the dome's equator: the seat hides the core), 1/d², windowed to 0 at
//             `range` ≤ 12 m. A 0.4 m lamp at intensity 6 shows ≈ 0.3 on a white card 1 m away, ≈ 0.03 at 3 m:
//             it reaches the housing it sits on and the slab beside it, subtly. Keep the lamp core's emission (and so
//             this intensity) around 2–3: above ~2 linear the engine's tone shoulder starts to whiten magenta into
//             pink (colorstat `pink`), and a large core on screen blooms into a smooth pink halo (colorstat `haze`).
//             Elongated rectangles (thin-line holders, [6, 0.05]) are integrated as a line along their long side.
//             The lamp holder calls rig.sig.set(pos, size, intensity, normal?, axis?) per frame. Every magenta on
//             floors, neighbouring slabs and sign edges comes from here; materials never tint themselves.
//   occluders ≤ 4 boxes casting analytic soft shadows of the key ("the shadow of the falling object arrives first"):
//             inner + outer penumbra (`soft` ≈ the key's angular radius), golden-section search of the closest
//             approach along the shadow ray, skipped entirely for rays that do not pass near the box.
//   ambient   hemispherical (sky above, 35 % bounce below), keep ~0.003–0.005: the film lives in ink
//   env       optional dim dome that metals and glass reflect (default 0), plus `envRings`: the shaft's ring LED strips
//             as an analytic environment (horizontal lines on a wall at `distance`, every `spacing` m between y0 and y1),
//             reflected with the same energy-correct blur as the strips, so metal and glass read in the dark
//   fog       exponential height fog (clean-room dust), NEVER magenta; `LightVolume` renders the key's beam in it
//   uv        stop's UV inspection lamp: drives the pcb silkscreen fluorescence
//
// p1v3 ("太暗了，亮一點" — brighter, richer, no grey veil), all additive:
//   spots     ≤ MAX_SPOTS practicals (work lights, floods, kickers, bulbs, contact flashes): unshadowed, key-shaped, colour
//             temperature free (never magenta), optional range window; `beam` > 0 = a visible beam in LightVolume
//   levels    light groups ('key' 'fill' 'strips' 'practical' 'rings' 'work' 'lip' 'crane' 'flood' 'flash' …): a multiplier
//             per group; rig.slam(group, t, t0, {peak, decay}) / flashEnv() for floodlights slamming on an impact;
//             rigImpact(rig, t, hits) = contact flash + group slam + dust kick in one call; kicker(subject, cam) = a rim light
//   fog.top   the lip's light pouring down: the haze's in-scatter grows toward the mouth (upper shaft glows, lower shaft
//             stays ink). Keep fog.color dark (≤ LIN.ink): a bright fog colour IS the grey veil (it lifts every black).
//
// p1v4 (TREATMENT §13.4 "sparse, focused light"; §13.5 surge → brown-out), KITS §23:
//   colour    behaviour change: kelvin() is balanced at WHITE_BALANCE_K = 4000 K with LIGHT_CHROMA = 0.15 (was 3000 K / 0.4):
//             every light on a surface is near-neutral — tungsten a hair warm (2700 K: b* +2.2 on a grey card), 4300 K
//             neutral, 5600–6500 K a hair cool (b* −1.6 … −1.9) — and every temperature keeps its p1v3 BRIGHTNESS (the
//             luminance of kelvin(k, 3000, 0.4)): the white balance changes the hue, never the exposure of a plate.
//             kelvin(k, 3000, 0.4) = the p1v3 colours exactly. Colour lives in lamp heads only: kelvin(2400, WHITE_BALANCE_K,
//             0.6) for an amber cage-lamp glass. kelvinLum(k, lum) = that hue at a given luminance.
//   SURF      neutral surface albedos (graphite #5D5D5D, ash #9B9B9B, ink/ink2 neutral, a warm-white ceramic) for every
//             library material (_mat), the slabs (_look) and the world (_shaft): the v1 palette's violet greys under light
//             were the purple cast (graphite a* +4 b* −7). Lettering stays bone (#EDEAF2, the palette's).
//   keyPool   THE KEY POOL (one per frame): the brightest light of the frame on the machine whose word is being sung —
//             keyPool(rig, { target, cam, normal, radius }) puts the key there (grazing across the lettered face, from the
//             camera's side) and takes the world's own lights ('work' 'rings' 'lip' 'crane') one stop down (envDown).
//             keyPoolFor(rig, carrier, cam) reads a registered lyric carrier.
//   surge     surgeEnv(t, t0, shape) = the v4 impact light shape: a 2–4 frame spike, a brown-out BELOW the pre-impact level,
//             a (flickering) recovery; IMPACT_SURGE = its per-level table; rigImpact(…, { shape: 'surge' }) slams the groups
//             with it (the p1v3 'slam' stays the default for the existing callers).
//   FloodRig  a set of floodlights with an event script (filament slam-on with a left → right stagger, off, surge → brown-out,
//             bus dip, bulbs blowing, flicker): levels(t) / apply(rig, t) (the floods that matter as practicals) /
//             beams(t) (the _fx hook: FxBeams-shaped beams, × the floods' live levels) / level(t). _lamp.FloodHeads draws
//             their fixtures (lens blazing in the beam, a blown bulb's one-frame flash).
//
// Using it in a material (see _mat.ts for the full library):
//   new THREE.ShaderMaterial({
//     uniforms: { ...LIGHT_UNIFORMS, uBase: { value: v } },          // spread = same uniform objects (shared)
//     vertexShader: LIT_VERT,                                          // vW, vN (world), vL, vLN (local), vAx, vAz …
//     fragmentShader: `${GLSL_COMMON}\n${LIGHT_GLSL}\n void main() {
//       vec3 P = vW, N = normalize(vN), V = normalize(cameraPosition - vW);
//       vec3 c = ltShade(P, N, V, albedo, rough, metal, ao);   // key + fill + strips + sig + ambient, key shadowed
//       gl_FragColor = vec4(ltFog(c, P), 1.0); }` });
// Material-side switches (GLSL globals, set them in main() BEFORE ltShade): LT_WRAP (diffuse wrap, ceramics),
// LT_SPEC (specular scale/occlusion), LT_T + LT_ANISO (anisotropic GGX along a world tangent, brushed metal).
// Call ltShade in uniform control flow (not inside a per-pixel `if`): it takes screen derivatives of N and P for its
// specular anti-aliasing and the curvature fade of the env rings.
// Colour: kelvin() is white-balanced at WHITE_BALANCE_K (p1v4: 4000 K, chroma 0.15): every light reads near-neutral.
// Passes: setLightQuality(0) around a Mirror pass (no micro-detail / occluder shadows / env rings there), then 1.
// Never .clone() a lit material (three's clone copies uniforms and breaks the sharing); build a new one.
import * as THREE from 'three';
import { LIN } from '../engine/palette';
import { FSPass, makeRT, W, H } from '../engine/gl';
import { hash, hexToLinear } from '../engine/util';
import type { LyricCarrier } from '../engine/lyricreg';

export type RGB = [number, number, number];
export const MAX_STRIPS = 4;
export const MAX_OCCLUDERS = 4;
/** practical spots / bulbs (rig.spots, p1v3): work lights, floods, kickers, contact flashes */
export const MAX_SPOTS = 6;
/** of those, how many the LightVolume scatters into visible beams (the ones with the largest `beam`) */
export const MAX_BEAMS = 4;
/** sig range cap (m, §5.2) */
export const SIG_RANGE_MAX = 12;
/**
 * The film's camera white balance (K). p1v4 (§13.4 "neutral, slightly warm"; behaviour change, was 3000 K): balanced at
 * 4000 K, tungsten work lights (2700–3200 K) read a hair warm, the 4300 K floods neutral, the 5600–6500 K LEDs / cold
 * cabinets a hair cool — with LIGHT_CHROMA every light on a surface stays within |b*| ≤ 2.2 of a grey card.
 */
export const WHITE_BALANCE_K = 4000;
/** p1v4: how much of a light's colour temperature survives the white balance (§13.4: lights on surfaces ≤ 0.15; was 0.4) */
export const LIGHT_CHROMA = 0.15;
/** the p1v3 colour of kelvin(): kelvin(k, KELVIN_P1V3.wb, KELVIN_P1V3.chroma) */
export const KELVIN_P1V3 = { wb: 3000, chroma: 0.4 } as const;

function blackBodyLinear(k: number): RGB {
  const t = k / 100;
  const r = t <= 66 ? 1 : Math.min(1, Math.max(0, 1.2929 * Math.pow(t - 60, -0.1332)));
  const g = t <= 66 ? Math.min(1, Math.max(0, 0.3901 * Math.log(t) - 0.6318)) : Math.min(1, 1.1299 * Math.pow(t - 60, -0.0755));
  const b = t >= 66 ? 1 : t <= 19 ? 0 : Math.min(1, Math.max(0, 0.5432 * Math.log(t - 10) - 1.1963));
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(r), lin(g), lin(b)];
}

const normMax = (v: RGB): RGB => { const m = Math.max(v[0], v[1], v[2], 1e-6); return [v[0] / m, v[1] / m, v[2] / m]; };
const lum709 = (v: RGB) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
/** white-balanced, chroma-scaled, normalised to max 1 (the p1v3 kelvin()) */
function kelvinMax(k: number, wb: number, chroma: number): RGB {
  const c = blackBodyLinear(k), w = blackBodyLinear(wb);
  const r = normMax([c[0] / Math.max(w[0], 1e-6), c[1] / Math.max(w[1], 1e-6), c[2] / Math.max(w[2], 1e-6)]);
  return normMax([1 + (r[0] - 1) * chroma, 1 + (r[1] - 1) * chroma, 1 + (r[2] - 1) * chroma]);
}
/**
 * Linear RGB of a black body at `k` kelvin as the film's camera sees it: white-balanced at `wb` (default WHITE_BALANCE_K)
 * with `chroma` of the remaining colour (default LIGHT_CHROMA), at the p1v3 brightness of that temperature (the luminance
 * of kelvin(k, 3000, 0.4), which was normalised to max 1): changing the balance changes the hue only.
 * p1v4 defaults (4000 K, 0.15): kelvin(2700) ≈ (0.99, 0.94, 0.88), kelvin(3200) ≈ (0.97, 0.93, 0.90), kelvin(4300) ≈
 * (0.80, 0.81, 0.82), kelvin(5600) ≈ (0.74, 0.77, 0.80), kelvin(6500) ≈ (0.72, 0.75, 0.80) — near-neutral.
 * kelvin(k, 3000, 0.4) = the p1v3 colours exactly (3200 K (0.92, 0.94, 1) cold white, 6500 K blue); kelvin(k, 0) is the
 * raw normalised black body (the Phase-0 stub's behaviour; strongly orange at 3200 K).
 */
export function kelvin(k: number, wb = WHITE_BALANCE_K, chroma = LIGHT_CHROMA): RGB {
  if (!(wb > 0)) return normMax(blackBodyLinear(k));
  const v = kelvinMax(k, wb, chroma);
  if (wb === KELVIN_P1V3.wb && chroma === KELVIN_P1V3.chroma) return v;
  const s = lum709(kelvinMax(k, KELVIN_P1V3.wb, KELVIN_P1V3.chroma)) / Math.max(lum709(v), 1e-6);
  return [v[0] * s, v[1] * s, v[2] * s];
}
/** p1v4: kelvin()'s hue (default balance and chroma) at Rec.709 luminance `lum` (e.g. to keep a fixed light's old level) */
export function kelvinLum(k: number, lum: number, wb = WHITE_BALANCE_K, chroma = LIGHT_CHROMA): RGB {
  const v = kelvinMax(k, wb, chroma), s = lum / Math.max(lum709(v), 1e-6);
  return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * p1v4 (§13.4) the neutral SURFACE albedos (sRGB hex): what a lit surface may be. The v1 palette (engine/palette) stays
 * the film's colour ROLES — bone lettering, the SOTA's magenta, ink night — but its greys are violet (graphite #5C5966:
 * a* +4, b* −7) and every lit grey surface carried that cast. Materials (_mat), slabs (_look) and the world (_shaft)
 * take their albedos from here: graphite #5D5D5D, ash #9B9B9B, ink #0A0A0A, ink2 #151515 (the palette's luminance), each
 * × SURF_TINT (blue 2.5 % under green, b* ≈ +1: "neutral, a hair warm"), and a warm-white technical ceramic (#EBEAE8) for
 * bone-coloured parts that are not lettering. Why not §13.4's #5D5D5F / #9B9B9D: a blue excess lets the SOTA's faint
 * magenta spill make green the LOWEST channel of a lit grey = a magenta hue, which colorstat's pink-haze test counts from
 * S 0.05 (measured 5.4 % of the frame on certify's lock panel at 44.93, 0 % on the violet palette and on the tinted greys).
 */
export const SURF_HEX = { ink: '#0A0A0A', ink2: '#151515', graphite: '#5D5D5D', ash: '#9B9B9B', bone: '#EBEAE8' } as const;
/** the greys' warm bias (linear ×): blue 2.5 % under green (b* ≈ +1): a faint magenta spill (the SOTA's sig light, R and
 *  some B) can no longer make green the lowest channel of a lit grey — that is a magenta hue, and colorstat's pink-haze
 *  test counts a smooth block of it from S 0.05 */
export const SURF_TINT: RGB = [1.006, 1, 0.975];
/** SURF_HEX in linear RGB (the greys × SURF_TINT; bone is already warm) */
export const SURF = Object.fromEntries(Object.entries(SURF_HEX).map(([k, v]) => {
  const c = hexToLinear(v);
  return [k, k === 'bone' ? c : [c[0] * SURF_TINT[0], c[1] * SURF_TINT[1], c[2] * SURF_TINT[2]]];
})) as Record<keyof typeof SURF_HEX, RGB>;
const g3 = (c: RGB) => `vec3(${c.map((x) => x.toFixed(5)).join(', ')})`;
/** GLSL constants S_INK S_INK2 S_GRAPHITE S_ASH S_BONE S_TINTN (linear) + ltNeutral(albedo) — part of LIGHT_GLSL */
export const SURF_GLSL = /* glsl */ `
const vec3 S_INK = ${g3(SURF.ink)};
const vec3 S_INK2 = ${g3(SURF.ink2)};
const vec3 S_GRAPHITE = ${g3(SURF.graphite)};
const vec3 S_ASH = ${g3(SURF.ash)};
const vec3 S_BONE = ${g3(SURF.bone)};
const vec3 S_TINTN = ${g3(SURF_TINT.map((x) => x / (0.2126 * SURF_TINT[0] + 0.7152 * SURF_TINT[1] + 0.0722 * SURF_TINT[2])) as RGB)};
/** p1v4: an albedo made neutral (SURF's warm bias) at its own luminance — the library's default for every surface */
vec3 ltNeutral(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)) * S_TINTN; }
`;

export interface KeySpot {
  pos: THREE.Vector3;
  /** unit direction the spot points along */
  dir: THREE.Vector3;
  /** half-angle of the cone (rad) */
  cone: number;
  /** penumbra as a fraction of the cone (0 hard … 1 all soft) */
  soft: number;
  color: RGB;
  /** white-card radiance reached at `ref` metres on the axis (1/d² beyond) */
  intensity: number;
  ref: number;
  /** emitter radius (m): widens highlights (default 0.25). Occluder penumbrae use each occluder's `soft`. */
  size?: number;
}

export interface StripLight { a: THREE.Vector3; b: THREE.Vector3; color: RGB; /** white-card radiance 1 m from a long strip */ intensity: number; /** diffuser width (m), default 0.03 */ width?: number; /** light group (rig.levels), default 'strips' (the shaft feeds 'rings') */ group?: string }

/**
 * A practical light (p1v3): a work light, a floodlight, a kicker/rim, a bulb, a contact flash. Same shape as the key
 * (white-card radiance `intensity` at `ref` m on the axis, 1/d² beyond, cone + soft edge, `size` widens highlights) but
 * unshadowed and cheap; up to MAX_SPOTS per frame in rig.spots. Colour temperature may vary (kelvin(2700) warm tungsten …
 * kelvin(5600) cool LED), never magenta.
 */
export interface Practical extends KeySpot {
  /** light group: rig.levels[group] scales it (default 'practical'); rig.flash/slam act on groups */
  group?: string;
  /** visible beam in the fog (LightVolume, × the fog's scatter): 0 none (default) … 1 like the key; the MAX_BEAMS largest are marched */
  beam?: number;
  /** a bulb / flash: emits all around (dir, cone, soft ignored) */
  omni?: boolean;
  /** smooth range window (m): the light is 0 beyond it (default: none, plain 1/d²) */
  range?: number;
}

/**
 * Light-group names the kits know (any string works): 'key' 'fill' 'strips' 'practical' 'rings' (shaft ring LEDs,
 * wall-washers, fed strips) 'work' (shaft catwalk work lights, warm) 'lip' (the floods pouring down from the mouth)
 * 'crane' (wall-crane trolley floods) 'flood' (machine floodlights, e.g. the crown) 'flash' (contact flashes)
 * 'keypool' (p1v4: keyPool's light when it goes to a practical slot).
 */
export type LightGroup = 'key' | 'fill' | 'strips' | 'practical' | 'rings' | 'work' | 'lip' | 'crane' | 'flood' | 'flash' | 'keypool' | (string & {});

/** Impact levels the light kit knows (p1v4 adds XXL: the chorus' NOW). */
export type ImpactLevel = 'S' | 'M' | 'L' | 'XL' | 'XXL';

/** Impact level → light response (rigImpact): contact flash radiance, group slam peak, decay (s), fog kick. */
export const IMPACT_LIGHT = {
  S: { flash: 2, slam: 0.35, decay: 0.12, fog: 0.15 },
  M: { flash: 5, slam: 0.8, decay: 0.2, fog: 0.3 },
  L: { flash: 10, slam: 1.6, decay: 0.32, fog: 0.6 },
  XL: { flash: 18, slam: 2.6, decay: 0.5, fog: 1.0 },
  XXL: { flash: 22, slam: 2.6, decay: 0.5, fog: 1.2 },
} as const;

/**
 * p1v4 (§13.5) the impact light SHAPE per level (surgeEnv; rigImpact shape 'surge'; FloodRig 'surge' events): the slammed
 * lights spike to ×(1 + peak) for `frames` frames, fall in one frame to ×(1 − brown) — below the pre-impact level, the
 * lights take the hit — hold `brownHold` s, and come back over `recover` s (`flicker` 0..1: dips on the way back).
 * The gate (KITS §22.2): frame luma +0.12…+0.20 (L) / +0.15…+0.25 (XL/XXL) above the 0.40–0.12 s pre-window for 2–4
 * frames, then ≥ 0.02 below it within 0.6 s: how much `peak` buys depends on how much of the frame the slammed lights
 * cover — calibrate per shot. Measured with the gate runner (zz_shaft 22.8–24.5, 4 floods on a 12 × 3.2 m machine that
 * fills ~40 % of a 0.27 frame, beams thin): peak 2.4 → +0.111 (fails), 3.4 → +0.134 / 3 frames / brown-out −0.12 / contact
 * p2 0.008 (passes the light rows). Shooting INTO the surging beams (camera in their cones, beams 0.3 in the haze) the
 * in-scatter helps the spike (2.8 → +0.132) but lifts the contact frames' p2 to 0.035 (> 0.03) and the blazing heads
 * out-shine the sung word (key pool): keep the lens out of the beams. KITS §23.
 */
export const IMPACT_SURGE = {
  S: { peak: 0.35, frames: 2, brown: 0, brownHold: 0, recover: 0.1, flicker: 0 },
  M: { peak: 0.9, frames: 2, brown: 0.18, brownHold: 0.06, recover: 0.25, flicker: 0 },
  L: { peak: 3.0, frames: 3, brown: 0.45, brownHold: 0.16, recover: 0.45, flicker: 0.3 },
  XL: { peak: 3.6, frames: 3, brown: 0.6, brownHold: 0.24, recover: 0.7, flicker: 0.6 },
  XXL: { peak: 3.6, frames: 2, brown: 0.65, brownHold: 0.3, recover: 0.8, flicker: 0.8 },
} as const;

/**
 * A flash envelope (pure function of t): 0 before t0, up to `peak` over `attack` s, held `hold` s, then exponential decay
 * (time constant `decay`) — a floodlight slamming on, a contact flash, a breaker kick. Returns ≥ 0.
 */
export function flashEnv(t: number, t0: number, o: { attack?: number; hold?: number; decay?: number; peak?: number } = {}): number {
  const a = o.attack ?? 0.012, h = o.hold ?? 0.016, d = o.decay ?? 0.25, p = o.peak ?? 1;
  const x = t - t0;
  if (x <= 0) return 0;
  if (x < a) { const u = x / a; return p * u * u * (3 - 2 * u); }
  if (x < a + h) return p;
  return p * Math.exp(-(x - a - h) / Math.max(d, 1e-4));
}

/** The surge → brown-out shape (IMPACT_SURGE rows; every field optional). */
export interface SurgeShape { peak?: number; frames?: number; brown?: number; brownHold?: number; recover?: number; flicker?: number; seed?: number }
const FRAME_S = 1 / 60;
const sm = (u: number) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const smr = (u: number) => { u = Math.min(1, Math.max(0, u)); return u * u * u * (u * (6 * u - 15) + 10); };
/**
 * p1v4 (§13.5) the impact light multiplier at song time t for a contact at t0 (pure): 1 before; ×(1 + peak) from a 4 ms
 * attack through `frames` frames (60 fps); one frame down to ×(1 − brown) (the brown-out, below the pre-impact level),
 * held `brownHold` s; back to 1 over `recover` s (smootherstep) with deterministic `flicker` dips (1/30 s steps,
 * thinning out). Defaults = IMPACT_SURGE.L. Multiply a light group or a flood by it (rigImpact shape 'surge', FloodRig).
 */
export function surgeEnv(t: number, t0: number, o: SurgeShape = {}): number {
  const x = t - t0;
  if (x <= 0) return 1;
  const D = IMPACT_SURGE.L;
  const peak = o.peak ?? D.peak, n = Math.max(1, o.frames ?? D.frames), brown = Math.min(0.98, Math.max(0, o.brown ?? D.brown));
  const hold = n * FRAME_S, bh = Math.max(0, o.brownHold ?? D.brownHold), rec = Math.max(1e-3, o.recover ?? D.recover);
  if (x < 0.004) return 1 + peak * sm(x / 0.004);
  if (x < hold) return 1 + peak;
  if (x < hold + FRAME_S) return 1 + peak + (1 - brown - (1 + peak)) * sm((x - hold) / FRAME_S);
  const xb = x - hold - FRAME_S;
  if (xb < bh) return 1 - brown;
  const k = (xb - bh) / rec;
  if (k >= 1) return 1;
  let v = 1 - brown + brown * smr(k);
  const fl = o.flicker ?? D.flicker;
  if (fl > 0) {
    const step = Math.floor(t * 30);
    if (hash(step, o.seed ?? 7, t0) < 0.55 * fl * (1 - k)) v *= 1 - 0.6 * brown * (0.5 + 0.5 * hash(step, 3.1, t0));
  }
  return Math.max(0, v);
}

/** The magenta SOTA light (one per frame at most, §5.2). */
export class SigLight {
  pos = new THREE.Vector3();
  /** the emitting side's normal (a dome emits into its hemisphere, half as much sideways, nothing behind) */
  normal = new THREE.Vector3(0, 1, 0);
  /** direction of size[0] (default: perpendicular to the normal, see axisOf) */
  axis: THREE.Vector3 | null = null;
  /** emitter size (m); a lamp dome is ~[0.4, 0.4], a thin-line holder e.g. [6, 0.05] */
  size: [number, number] = [0.4, 0.4];
  /** emitter surface radiance (linear, × signal colour; 0 = off). Same number as the lamp core's emission. */
  intensity = 0;
  /** ≤ SIG_RANGE_MAX */
  range = SIG_RANGE_MAX;
  /** Place the light (holder lamp per frame). */
  set(pos: THREE.Vector3, size: [number, number], intensity: number, normal?: THREE.Vector3, axis?: THREE.Vector3) {
    this.pos.copy(pos); this.size = size; this.intensity = intensity;
    if (normal) this.normal.copy(normal).normalize();
    this.axis = axis ? axis.clone().normalize() : null;
    return this;
  }
  off() { this.intensity = 0; return this; }
  /** world direction of size[0] */
  axisOf(out = new THREE.Vector3()) {
    const n = this.normal;
    if (this.axis) return out.copy(this.axis).addScaledVector(n, -this.axis.dot(n)).normalize();
    return Math.abs(n.y) < 0.99 ? out.crossVectors(new THREE.Vector3(0, 1, 0), n).normalize() : out.crossVectors(new THREE.Vector3(1, 0, 0), n).normalize();
  }
}

export interface BoxOccluder {
  center: THREE.Vector3;
  half: THREE.Vector3;
  /** world rotation of the box (default identity) */
  quat?: THREE.Quaternion;
  /** penumbra softness ≈ the key's angular radius seen from the box (rad), default 0.08 */
  soft?: number;
}

/** Ring LED strips around the reflecting point, as an analytic environment (reflections only). */
export interface EnvRings {
  /** vertical pitch of the rings (m), e.g. 12 */
  spacing: number;
  /** horizontal distance to the walls (m), e.g. 80 */
  distance: number;
  /** strip height (m), e.g. 0.06 */
  width: number;
  /** surface radiance of a strip (linear) × colour */
  radiance: number;
  color: RGB;
  /** lowest and highest ring (m) */
  y0: number;
  y1: number;
}

export interface FogSpec {
  color: RGB;
  /** extinction per metre at y = y0 */
  density: number;
  /** 1/m: density × exp(−falloff·(y − y0)) */
  falloff: number;
  y0: number;
  /** cap on fog opacity */
  max: number;
  /** LightVolume: fraction of the extinction that scatters the key into the beam (default 1) */
  scatter?: number;
  /** LightVolume: Henyey–Greenstein anisotropy (dust scatters forward, default 0.45) */
  g?: number;
  /**
   * p1v3: light pouring down from the mouth: the haze's in-scattered radiance grows toward height `y` (the lip) as
   * `radiance · exp(−(y − h)/scale)` (× color), added to `color` where the fog covers. Lifts the upper shaft into a glow
   * while the lower shaft stays dense ink (no flat grey veil). The Shaft feeds it (feed.lip); null/undefined = off.
   */
  top?: { color: RGB; radiance: number; y: number; scale: number } | null;
}

const v3 = () => new THREE.Vector3();
/** The shared light uniforms. Spread them into every lit material's uniforms (same objects, never cloned). */
export const LIGHT_UNIFORMS: Record<string, THREE.IUniform> = {
  uKeyPos: { value: new THREE.Vector3(0, 40, 20) },
  uKeyDir: { value: new THREE.Vector3(0, -1, 0) },
  uKeyCone: { value: new THREE.Vector2(Math.cos(0.6), Math.cos(0.45)) },
  uKeyCol: { value: v3() },
  uKeyRef: { value: 10 },
  uKeySize: { value: 0.25 },
  uFillPos: { value: new THREE.Vector3(0, 40, 20) },
  uFillDir: { value: new THREE.Vector3(0, -1, 0) },
  uFillCone: { value: new THREE.Vector2(Math.cos(0.6), Math.cos(0.45)) },
  uFillCol: { value: v3() },
  uFillRef: { value: 10 },
  uStripA: { value: Array.from({ length: MAX_STRIPS }, v3) },
  uStripB: { value: Array.from({ length: MAX_STRIPS }, v3) },
  uStripCol: { value: Array.from({ length: MAX_STRIPS }, v3) },
  uStripW: { value: Array.from({ length: MAX_STRIPS }, () => 0.03) },
  uStripN: { value: 0 },
  uSigPos: { value: v3() },
  uSigN: { value: new THREE.Vector3(0, 1, 0) },
  uSigSize: { value: new THREE.Vector2(0.4, 0.4) },
  uSigCol: { value: v3() },
  uSigRange: { value: SIG_RANGE_MAX },
  uSigA: { value: v3() },
  uSigB: { value: v3() },
  /** x: soft-core radius (m), y: 1 = elongated (line integral) / 0 = square (point path), z: area / length */
  uSigK: { value: new THREE.Vector3(0.2, 0, 0) },
  uOccC: { value: Array.from({ length: MAX_OCCLUDERS }, v3) },
  uOccH: { value: Array.from({ length: MAX_OCCLUDERS }, v3) },
  uOccR: { value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Matrix3()) },
  uOccSoft: { value: Array.from({ length: MAX_OCCLUDERS }, () => 0.08) },
  uOccN: { value: 0 },
  uAmb: { value: new THREE.Vector3(0.004, 0.004, 0.0042) },
  uEnv: { value: v3() },
  uEnvRing: { value: new THREE.Vector4(12, 80, 0.06, 0) },
  uEnvRingCol: { value: v3() },
  uEnvRingY: { value: new THREE.Vector2(12, 216) },
  uFogCol: { value: new THREE.Vector3(...SURF.ink) },
  uFog: { value: new THREE.Vector4(0, 0.02, 0, 0.9) },
  /** fog.top: rgb = colour × radiance, w = scale height (0 = off); uFogTopY = the lip height */
  uFogTop: { value: new THREE.Vector4(0, 0, 0, 0) },
  uFogTopY: { value: 220 },
  uSpotPos: { value: Array.from({ length: MAX_SPOTS }, v3) },
  uSpotDir: { value: Array.from({ length: MAX_SPOTS }, () => new THREE.Vector3(0, -1, 0)) },
  uSpotCone: { value: Array.from({ length: MAX_SPOTS }, () => new THREE.Vector2(-2, -1.5)) },
  uSpotCol: { value: Array.from({ length: MAX_SPOTS }, v3) },
  /** x ref, y size, z range (0 = none) */
  uSpotK: { value: Array.from({ length: MAX_SPOTS }, v3) },
  uSpotN: { value: 0 },
  /** the beams LightVolume marches (a copy of the brightest-beam spots, colour × beam) */
  uBeamPos: { value: Array.from({ length: MAX_BEAMS }, v3) },
  uBeamDir: { value: Array.from({ length: MAX_BEAMS }, () => new THREE.Vector3(0, -1, 0)) },
  uBeamCone: { value: Array.from({ length: MAX_BEAMS }, () => new THREE.Vector2(-2, -1.5)) },
  uBeamCol: { value: Array.from({ length: MAX_BEAMS }, v3) },
  uBeamRef: { value: Array.from({ length: MAX_BEAMS }, () => 1) },
  uBeamN: { value: 0 },
  uUV: { value: 0 },
  /** 1 = full shading; 0 = a reflection pass (no micro-detail, no occluder shadows, no env rings) */
  uLtQ: { value: 1 },
};

/**
 * Shading quality for the passes that follow: 1 full (default), 0 for passes nobody looks at closely (the granite's
 * mirror pass at half resolution, blurred): skips procedural micro-detail, occluder shadows, env rings, the fill
 * light and the strips' specular.
 * Call setLightQuality(0) before rendering into a Mirror and setLightQuality(1) after.
 */
export function setLightQuality(q: 0 | 1) { LIGHT_UNIFORMS.uLtQ!.value = q; }

/** A scene's lighting state. Build one in init(), animate its fields in render(), then call apply(). */
export class LightRig {
  key: KeySpot = {
    pos: new THREE.Vector3(0, 40, 20), dir: new THREE.Vector3(0, -1, 0), cone: 0.6, soft: 0.35,
    color: kelvin(3200), intensity: 0, ref: 10, size: 0.25,
  };
  /** an unshadowed second spot (bounce / kicker); off by default */
  fill: KeySpot = {
    pos: new THREE.Vector3(0, 40, 20), dir: new THREE.Vector3(0, -1, 0), cone: 0.8, soft: 0.6,
    color: kelvin(6500), intensity: 0, ref: 10,
  };
  strips: StripLight[] = [];
  sig = new SigLight();
  occluders: BoxOccluder[] = [];
  /** linear ambient from above (bounce from below is 35 % of it); keep it tiny: the film lives in ink (p1v4: neutral) */
  ambient: RGB = [0.004, 0.004, 0.0042];
  /** studio dome radiance that metals/glass reflect (0 = none: black reflections in the dark shaft) */
  env: RGB = [0, 0, 0];
  /** the shaft's ring strips as reflected environment (null = none) */
  envRings: EnvRings | null = null;
  fog: FogSpec = { color: [...SURF.ink] as RGB, density: 0, falloff: 0.02, y0: 0, max: 0.9, scatter: 1, g: 0.45 };
  /** UV inspection lamp 0..1 (stop) */
  uv = 0;
  /**
   * p1v3 practicals: ≤ MAX_SPOTS unshadowed spots/bulbs (work lights, floods, kickers, contact flashes), in addition to
   * key + fill. Rebuild per frame like `strips` (rig.spots = [] at the top of the plate's light()). See `Practical`.
   */
  spots: Practical[] = [];
  /**
   * p1v3 light groups: a multiplier per group name (default 1), applied in apply(): key × levels.key, fill × levels.fill,
   * strips × levels[strip.group ?? 'strips'], spots × levels[spot.group ?? 'practical']; the Shaft reads 'rings',
   * 'work', 'lip', 'crane' for its own lights. Set per frame (pure function of t), e.g. levels.flood = 1 + flashEnv(…).
   * Reset it at the top of the plate's light() (rig.levels = {}) like the other per-frame fields.
   */
  levels: Partial<Record<LightGroup, number>> = {};

  /** the level of a group (default 1) */
  level(g: LightGroup): number { return this.levels[g] ?? 1; }
  /** add a practical (ignored with a console-free no-op once MAX_SPOTS are in); returns it */
  addSpot(p: Practical): Practical { if (this.spots.length < MAX_SPOTS) this.spots.push(p); return p; }
  /**
   * Slam/flash a group at t: multiplies levels[group] by (1 + flashEnv(t, t0, o)). Pure function of t; call every frame
   * after setting the base levels. e.g. the crown's floods on the 47.88 contact: rig.slam('flood', t, 47.88, { peak: 2.5, decay: 0.4 }).
   */
  slam(group: LightGroup, t: number, t0: number, o: { attack?: number; hold?: number; decay?: number; peak?: number } = {}): number {
    const k = flashEnv(t, t0, o);
    this.levels[group] = this.level(group) * (1 + k);
    return k;
  }
  /**
   * p1v4: surge → brown-out a group at t (surgeEnv: a 2–4 frame spike, then below the pre-impact level, then back).
   * Multiplies levels[group]; returns the multiplier. e.g. rig.surge('flood', t, 46.273, IMPACT_SURGE.L).
   */
  surge(group: LightGroup, t: number, t0: number, o: SurgeShape = {}): number {
    const m = surgeEnv(t, t0, o);
    this.levels[group] = this.level(group) * m;
    return m;
  }

  /** Copy this rig into LIGHT_UNIFORMS (call at the top of the scene's render, before any draw). */
  apply() {
    const u = LIGHT_UNIFORMS;
    const spot = (s: KeySpot, p: string, lv: number) => {
      (u[`u${p}Pos`]!.value as THREE.Vector3).copy(s.pos);
      (u[`u${p}Dir`]!.value as THREE.Vector3).copy(s.dir).normalize();
      (u[`u${p}Cone`]!.value as THREE.Vector2).set(Math.cos(s.cone), Math.cos(s.cone * (1 - Math.min(0.999, Math.max(0, s.soft)))));
      const e = s.intensity * Math.PI * lv;
      (u[`u${p}Col`]!.value as THREE.Vector3).set(s.color[0] * e, s.color[1] * e, s.color[2] * e);
      u[`u${p}Ref`]!.value = s.ref;
    };
    spot(this.key, 'Key', this.level('key')); spot(this.fill, 'Fill', this.level('fill'));
    u.uKeySize!.value = this.key.size ?? 0.25;
    // practicals (+ the beams the LightVolume marches: the largest `beam`s)
    const ns = Math.min(MAX_SPOTS, this.spots.length);
    for (let i = 0; i < MAX_SPOTS; i++) {
      const s = i < ns ? this.spots[i] : undefined;
      if (!s) { (u.uSpotCol!.value as THREE.Vector3[])[i]!.set(0, 0, 0); continue; }
      (u.uSpotPos!.value as THREE.Vector3[])[i]!.copy(s.pos);
      (u.uSpotDir!.value as THREE.Vector3[])[i]!.copy(s.dir).normalize();
      if (s.omni) (u.uSpotCone!.value as THREE.Vector2[])[i]!.set(-2, -1.5);
      else (u.uSpotCone!.value as THREE.Vector2[])[i]!.set(Math.cos(s.cone), Math.cos(s.cone * (1 - Math.min(0.999, Math.max(0, s.soft)))));
      const e = Math.max(0, s.intensity) * Math.PI * this.level(s.group ?? 'practical');
      (u.uSpotCol!.value as THREE.Vector3[])[i]!.set(s.color[0] * e, s.color[1] * e, s.color[2] * e);
      (u.uSpotK!.value as THREE.Vector3[])[i]!.set(s.ref, s.size ?? 0.25, s.range ?? 0);
    }
    u.uSpotN!.value = ns;
    const beams = this.spots.slice(0, ns).filter((s) => (s.beam ?? 0) > 0 && s.intensity > 0).sort((a, b) => (b.beam ?? 0) - (a.beam ?? 0)).slice(0, MAX_BEAMS);
    beams.forEach((s, i) => {
      (u.uBeamPos!.value as THREE.Vector3[])[i]!.copy(s.pos);
      (u.uBeamDir!.value as THREE.Vector3[])[i]!.copy(s.dir).normalize();
      if (s.omni) (u.uBeamCone!.value as THREE.Vector2[])[i]!.set(-2, -1.5);
      else (u.uBeamCone!.value as THREE.Vector2[])[i]!.set(Math.cos(s.cone), Math.cos(s.cone * (1 - Math.min(0.999, Math.max(0, s.soft)))));
      const e = s.intensity * Math.PI * this.level(s.group ?? 'practical') * (s.beam ?? 0);
      (u.uBeamCol!.value as THREE.Vector3[])[i]!.set(s.color[0] * e, s.color[1] * e, s.color[2] * e);
      (u.uBeamRef!.value as number[])[i] = s.ref;
    });
    u.uBeamN!.value = beams.length;
    const n = Math.min(MAX_STRIPS, this.strips.length);
    for (let i = 0; i < MAX_STRIPS; i++) {
      const s = i < n ? this.strips[i] : undefined;
      (u.uStripA!.value as THREE.Vector3[])[i]!.copy(s?.a ?? ZERO);
      (u.uStripB!.value as THREE.Vector3[])[i]!.copy(s?.b ?? ZERO);
      // π·I/2: the line integral of an infinitely long strip at 1 m is 2
      const e = s ? (s.intensity * Math.PI * this.level(s.group ?? 'strips')) / 2 : 0;
      (u.uStripCol!.value as THREE.Vector3[])[i]!.set(s ? s.color[0] * e : 0, s ? s.color[1] * e : 0, s ? s.color[2] * e : 0);
      (u.uStripW!.value as number[])[i] = s?.width ?? 0.03;
    }
    u.uStripN!.value = n;
    // sig: a segment along the rectangle's long side, soft core = half the short side
    const g = this.sig;
    const ax = g.axisOf(TMP_A);
    const w0 = Math.max(1e-3, g.size[0]), w1 = Math.max(1e-3, g.size[1]);
    const along = w0 >= w1 ? ax : TMP_B.crossVectors(g.normal, ax).normalize();
    const len = Math.abs(w0 - w1), lenEff = Math.max(len, 1e-3), short = Math.min(w0, w1);
    (u.uSigPos!.value as THREE.Vector3).copy(g.pos);
    (u.uSigN!.value as THREE.Vector3).copy(g.normal);
    (u.uSigSize!.value as THREE.Vector2).set(w0, w1);
    (u.uSigA!.value as THREE.Vector3).copy(g.pos).addScaledVector(along, -lenEff / 2);
    (u.uSigB!.value as THREE.Vector3).copy(g.pos).addScaledVector(along, lenEff / 2);
    const on = g.intensity > 0 ? g.intensity : 0;
    (u.uSigCol!.value as THREE.Vector3).set(LIN.signal[0] * on, LIN.signal[1] * on, LIN.signal[2] * on);
    (u.uSigK!.value as THREE.Vector3).set(short / 2, len > 0.05 * short ? 1 : 0, (w0 * w1) / lenEff);
    u.uSigRange!.value = Math.min(SIG_RANGE_MAX, g.range);
    const m = Math.min(MAX_OCCLUDERS, this.occluders.length);
    for (let i = 0; i < MAX_OCCLUDERS; i++) {
      const o = i < m ? this.occluders[i] : undefined;
      (u.uOccC!.value as THREE.Vector3[])[i]!.copy(o?.center ?? ZERO);
      (u.uOccH!.value as THREE.Vector3[])[i]!.copy(o?.half ?? ZERO);
      // world → box rotation (inverse = transpose)
      TMP_M4.makeRotationFromQuaternion(o?.quat ?? ID_Q);
      (u.uOccR!.value as THREE.Matrix3[])[i]!.setFromMatrix4(TMP_M4).transpose();
      (u.uOccSoft!.value as number[])[i] = Math.max(1e-3, o?.soft ?? 0.08);
    }
    u.uOccN!.value = m;
    (u.uAmb!.value as THREE.Vector3).set(...this.ambient);
    (u.uEnv!.value as THREE.Vector3).set(...this.env);
    const er = this.envRings;
    (u.uEnvRing!.value as THREE.Vector4).set(er?.spacing ?? 12, er?.distance ?? 80, er?.width ?? 0.06, er && er.radiance > 0 ? 1 : 0);
    (u.uEnvRingCol!.value as THREE.Vector3).set(er ? er.color[0] * er.radiance : 0, er ? er.color[1] * er.radiance : 0, er ? er.color[2] * er.radiance : 0);
    (u.uEnvRingY!.value as THREE.Vector2).set(er?.y0 ?? 0, er?.y1 ?? 0);
    (u.uFogCol!.value as THREE.Vector3).set(...this.fog.color);
    (u.uFog!.value as THREE.Vector4).set(this.fog.density, this.fog.falloff, this.fog.y0, this.fog.max);
    const ft = this.fog.top;
    const fl = ft ? Math.max(0, ft.radiance) * this.level('lip') : 0;
    (u.uFogTop!.value as THREE.Vector4).set(ft ? ft.color[0] * fl : 0, ft ? ft.color[1] * fl : 0, ft ? ft.color[2] * fl : 0, ft && fl > 0 ? Math.max(1, ft.scale) : 0);
    u.uFogTopY!.value = ft?.y ?? 220;
    u.uUV!.value = this.uv;
  }
}

/** One impact for rigImpact (pure data; _impact.Hit fits). */
export interface ImpactLight { t: number; level: ImpactLevel; pos?: THREE.Vector3 | readonly [number, number, number]; gain?: number; shape?: SurgeShape }
/**
 * The contact light of an impact (§8.2 "contact"): call per frame with the plate's hits (pure function of t).
 *  - a contact flash: an omni practical at `pos` (white-hot → warm), radiance by level (needs a free rig.spots slot;
 *    skipped otherwise)
 *  - the groups respond:
 *      shape 'slam' (default, p1v3): `groups` (default ['flood', 'work', 'rings', 'practical']) × (1 + slam·env), env = a
 *      flash decaying over IMPACT_LIGHT.decay
 *      shape 'surge' (p1v4, §13.5): `groups` (default ['flood', 'practical']: the lights ON the subject) × surgeEnv
 *      (IMPACT_SURGE[level] ⊕ hit.shape; peak × gain): a 2–4 frame spike, then a brown-out below the pre-impact level, then
 *      the (flickering) recovery — the gate's surge → brown-out; `brownGroups` (default the world: ['work', 'rings', 'lip',
 *      'crane']) only take the brown-out (the bus drops, the walls never spike: a spiking wall wash lifts the frame's blacks
 *      — the gate wants p2 ≤ 0.03 on the contact frames); the flash is short too (its frames, 50 ms decay): a lingering
 *      flash holds the frame up and breaks the 2–4 frame spike
 *  - the fog's scatter kicks (dust shaken into the beams) and settles over ~1 s ("dust hanging in light beams")
 * Returns the strongest envelope 0..1 at t (use it for shaft.ringK kicks, sparks, mirror ripple …).
 * Never magenta: the flash colour is white-hot → warm white (p1v4: near-neutral, §13.4).
 */
export function rigImpact(rig: LightRig, t: number, hits: readonly ImpactLight[],
  o: { groups?: LightGroup[]; brownGroups?: LightGroup[]; flash?: boolean; fog?: boolean; range?: number; shape?: 'slam' | 'surge' } = {}): number {
  let best = 0;
  const surge = o.shape === 'surge';
  const groups = o.groups ?? (surge ? ['flood', 'practical'] : ['flood', 'work', 'rings', 'practical']);
  const brownGroups = surge ? (o.brownGroups ?? [...ENV_GROUPS]).filter((g) => !groups.includes(g)) : [];
  let fogK = 0;
  for (const h of hits) {
    const x = t - h.t;
    if (x <= 0 || x > 2.5) continue;
    const L = IMPACT_LIGHT[h.level] ?? IMPACT_LIGHT.L, g = h.gain ?? 1;
    let env: number;
    if (surge) {
      const S = { ...(IMPACT_SURGE[h.level] ?? IMPACT_SURGE.L), ...h.shape };
      const m = surgeEnv(t, h.t, { ...S, peak: S.peak * g, seed: S.seed ?? Math.round(h.t * 1000) });
      for (const gr of groups) rig.levels[gr] = rig.level(gr) * m;
      for (const gr of brownGroups) rig.levels[gr] = rig.level(gr) * Math.min(1, m);
      env = flashEnv(t, h.t, { attack: 0.004, hold: S.frames * FRAME_S, decay: 0.05 });
    } else {
      env = flashEnv(t, h.t, { attack: 0.006, hold: 1 / 60, decay: L.decay });
      for (const gr of groups) rig.levels[gr] = rig.level(gr) * (1 + L.slam * g * env);
    }
    best = Math.max(best, env);
    // dust: rises with the contact, hangs, settles over ~1.2 s (surge: half as much, rising over 0.15 s — the contact
    // frames stay clean, p2 ≤ 0.03: the spike is light, the haze comes after)
    fogK = Math.max(fogK, surge ? 0.5 * L.fog * g * (x < 0.15 ? x / 0.15 : Math.exp(-(x - 0.15) / 1.0)) : L.fog * g * (x < 0.05 ? x / 0.05 : Math.exp(-(x - 0.05) / 1.2)));
    if (o.flash !== false && h.pos && env > 0.01 && rig.spots.length < MAX_SPOTS) {
      const p = Array.isArray(h.pos) ? new THREE.Vector3(...(h.pos as [number, number, number])) : (h.pos as THREE.Vector3).clone();
      const hot = Math.exp(-x / 0.04);   // white-hot first, warm white as it decays
      rig.spots.push({
        pos: p, dir: new THREE.Vector3(0, -1, 0), cone: Math.PI, soft: 0, omni: true, group: 'flash',
        color: kelvin(2600 + 3400 * hot), intensity: L.flash * g * env, ref: 1, size: 0.3, range: o.range ?? 18, beam: 0,
      });
    }
  }
  if (o.fog !== false && fogK > 0) rig.fog = { ...rig.fog, scatter: (rig.fog.scatter ?? 1) * (1 + fogK) };
  return best;
}

/**
 * A practical riding a scene node (a flood's lens, a work-lamp head on a gantry): position = the node's world position
 * (+ `offset` in its local frame), beam axis = `axis` (local, default −Y) in world. Pure function of the node's current
 * matrixWorld (update it first). e.g. the crown floods: rig.addSpot(practicalAt(flood_k, { axis: [0, -0.79, 0.62], intensity: 3, group: 'flood', beam: 0.4 })).
 */
export function practicalAt(node: THREE.Object3D, o: Partial<Practical> & { axis?: [number, number, number]; offset?: [number, number, number] } = {}): Practical {
  node.updateWorldMatrix(true, false);
  const pos = new THREE.Vector3(...(o.offset ?? [0, 0, 0])).applyMatrix4(node.matrixWorld);
  const dir = new THREE.Vector3(...(o.axis ?? [0, -1, 0])).transformDirection(node.matrixWorld);
  return {
    pos, dir, cone: o.cone ?? 0.5, soft: o.soft ?? 0.5, color: o.color ?? kelvin(4300), intensity: o.intensity ?? 2, ref: o.ref ?? 6,
    size: o.size ?? 0.3, group: o.group ?? 'practical', beam: o.beam ?? 0, omni: o.omni, range: o.range,
  };
}

/**
 * A kicker / rim light (p1v3 "stronger rim/kick light on machines"): a practical placed behind the subject relative to
 * the camera, `side` (+1 camera-right, −1 left), raised `height` m, `dist` m from the subject, aimed at it — the edge of
 * the machine separates from the black. Pure function of the camera; push it every frame: rig.addSpot(kicker(…)).
 */
export function kicker(subject: THREE.Vector3, camPos: THREE.Vector3, o: { side?: number; height?: number; dist?: number; intensity?: number; kelvin?: number; cone?: number; group?: LightGroup; beam?: number } = {}): Practical {
  const back = subject.clone().sub(camPos); back.y = 0;
  if (back.lengthSq() < 1e-6) back.set(0, 0, -1);
  back.normalize();
  const right = new THREE.Vector3(-back.z, 0, back.x).multiplyScalar(o.side ?? 1);
  const d = o.dist ?? 4;
  const pos = subject.clone().addScaledVector(back, d * 0.8).addScaledVector(right, d * 0.6);
  pos.y += o.height ?? d * 0.5;
  return {
    pos, dir: subject.clone().sub(pos).normalize(), cone: o.cone ?? 0.45, soft: 0.5, color: kelvin(o.kelvin ?? 4300),
    intensity: o.intensity ?? 2.5, ref: pos.distanceTo(subject), size: 0.3, group: o.group ?? 'practical', beam: o.beam ?? 0,
  };
}

// ================================================================ p1v4 the key pool (§13.4)

/** The world's own light groups (the Shaft's work lights, ring LEDs + wash + floor throw, lip floods, crane floods). */
export const ENV_GROUPS: readonly LightGroup[] = ['work', 'rings', 'lip', 'crane'];
/**
 * p1v4: take the environment `k` × (default 0.5 = one stop down): multiplies rig.levels of `groups` (default the world's
 * own lights). Call it in the plate's light() before shaft.update (the Shaft reads the levels there). keyPool() calls it.
 */
export function envDown(rig: LightRig, k = 0.5, groups: readonly LightGroup[] = ENV_GROUPS): void {
  for (const g of groups) rig.levels[g] = rig.level(g) * k;
}

export interface KeyPoolOpts {
  /** the machine the sung word sits on (world): the pool's centre */
  target: THREE.Vector3;
  /** the camera position: the light comes from the camera's side of the face (`side`), never from behind the lens */
  cam: THREE.Vector3;
  /** the lettered face's outward normal (world, default: toward the camera) */
  normal?: THREE.Vector3;
  /** pool radius at the target (m): the cone covers it (default 2.5) */
  radius?: number;
  /** white-card radiance at the target (default 1.8: brighter than anything else in the frame) */
  intensity?: number;
  /** colour temperature (default 4300: neutral at the v4 white balance) */
  kelvin?: number;
  /**
   * 0 = frontal (along the face normal) … 1 = raking along the face plane (× 80°; default 0.85 ≈ 68° off the normal): a
   * grazing key lights the machine's top and the end toward `side`, and keeps the lettered ink face itself dark (§5.5: the
   * face within a cap of the word ≤ 0.08 display) — the faces of a dark glossy machine separate
   */
  graze?: number;
  /** instead of `graze`: the share of the key the lettered face receives (N·L, e.g. 0.3) */
  faceK?: number;
  /** which side of the frame the light comes from (+1 camera-right, default; −1 camera-left) */
  side?: 1 | -1;
  /** how far the light is raised along the face's up (rad within the graze plane, default 0.6) */
  lift?: number;
  /** light distance from the target (m, default max(6, 3 × radius)) */
  dist?: number;
  /** penumbra fraction (default 0.55) and emitter size (m, default 0.12 × dist, ≤ 1) */
  soft?: number;
  size?: number;
  /** the environment's level: every group of `envGroups` × env (default 0.5 = one stop down; 1 = untouched) */
  env?: number;
  envGroups?: readonly LightGroup[];
  /** 'key' (default: rig.key, the occluders shadow it) or 'spot' (a practical in group 'keypool', e.g. a second pool) */
  slot?: 'key' | 'spot';
  /** visible beam in the haze (spot slot only, LightVolume) */
  beam?: number;
}
const UP = new THREE.Vector3(0, 1, 0);
/**
 * p1v4 THE KEY POOL (§13.4: one per frame, on the machine whose word is being sung): places the key (default) as a
 * grazing spot on `target` from the camera's side of the lettered face, sized to `radius`, and takes the world's own
 * lights one stop down (envDown, `env`). Returns the placed light (a KeySpot; rig.key itself for slot 'key').
 * Pure function of its inputs: call it every frame in the plate's light(), before shaft.update and rig.apply.
 *   keyPool(rig, { target: depthCentre, cam: cam.position, normal: southFace, radius: 7, intensity: 2.2 });
 * The gate (KITS §22.2 "key pool"): the frame's brightest area (display luma blurred 0.03 W) must sit within 3 caps (or
 * 0.1 W) of the sung word — light the machine around the word; the word itself stays bone on its dark face.
 */
export function keyPool(rig: LightRig, o: KeyPoolOpts): KeySpot {
  const T = o.target;
  const view = o.cam.clone().sub(T);
  if (view.lengthSq() < 1e-9) view.set(0, 0, 1);
  view.normalize();
  const n = (o.normal ? o.normal.clone() : view.clone()).normalize();
  // the face's frame: tg = horizontal tangent pointing camera-right, b = along the face, upward
  const tg = new THREE.Vector3().crossVectors(UP, n);
  if (tg.lengthSq() < 1e-6) tg.crossVectors(view, n);
  if (tg.lengthSq() < 1e-6) tg.set(1, 0, 0);
  tg.normalize();
  const right = new THREE.Vector3().crossVectors(UP, view);
  if (right.lengthSq() > 1e-6 && tg.dot(right) < 0) tg.negate();
  const b = new THREE.Vector3().crossVectors(n, tg).normalize();
  if (b.y < 0) b.negate();
  const th = o.faceK !== undefined ? Math.acos(Math.min(1, Math.max(0.02, o.faceK))) : Math.min(1, Math.max(0, o.graze ?? 0.85)) * 1.4;
  const lift = o.lift ?? 0.6, side = o.side ?? 1;
  const across = tg.multiplyScalar(side * Math.cos(lift)).addScaledVector(b, Math.sin(lift)).normalize();
  const L = n.multiplyScalar(Math.cos(th)).addScaledVector(across, Math.sin(th)).normalize();
  const radius = Math.max(0.2, o.radius ?? 2.5), dist = o.dist ?? Math.max(6, 3 * radius);
  const spot: KeySpot = {
    pos: T.clone().addScaledVector(L, dist), dir: L.clone().negate(), cone: Math.min(1.25, 1.3 * Math.atan(radius / dist)),
    soft: o.soft ?? 0.55, color: kelvin(o.kelvin ?? 4300), intensity: o.intensity ?? 1.8, ref: dist, size: o.size ?? Math.min(1, 0.12 * dist),
  };
  const env = o.env ?? 0.5;
  if (env !== 1) envDown(rig, env, o.envGroups ?? ENV_GROUPS);
  if ((o.slot ?? 'key') === 'key') {
    const k = rig.key;
    k.pos.copy(spot.pos); k.dir.copy(spot.dir); k.cone = spot.cone; k.soft = spot.soft; k.color = spot.color;
    k.intensity = spot.intensity; k.ref = spot.ref; k.size = spot.size;
    return k;
  }
  rig.addSpot({ ...spot, group: 'keypool', beam: o.beam ?? 0 });
  return spot;
}
/**
 * keyPool on a registered lyric carrier (the word being sung): target = the face's centre pushed `depth` m behind it
 * (default 0: the face itself), normal = the face's normal, radius = 0.7 × the face's width (1.5 … 12 m). Pass the rest
 * of KeyPoolOpts to override. The carrier's obj must have an up-to-date matrixWorld.
 */
export function keyPoolFor(rig: LightRig, c: Pick<LyricCarrier, 'obj' | 'face'>, cam: THREE.Vector3, o: Partial<KeyPoolOpts> & { depth?: number } = {}): KeySpot {
  c.obj.updateWorldMatrix(true, false);
  const box = c.face.box, ctr = box.getCenter(new THREE.Vector3());
  const n = (c.face.normal ?? new THREE.Vector3(0, 0, 1)).clone().transformDirection(c.obj.matrixWorld);
  const target = ctr.applyMatrix4(c.obj.matrixWorld).addScaledVector(n, -(o.depth ?? 0));
  const sx = new THREE.Vector3().setFromMatrixColumn(c.obj.matrixWorld, 0).length();
  const width = (box.max.x - box.min.x) * sx;
  return keyPool(rig, { target, cam, normal: n, radius: Math.min(12, Math.max(1.5, 0.7 * width)), ...o });
}

// ================================================================ p1v4 floodlight rigs (surge / brown-out, the _fx hook)

/** One flood of a FloodRig: a fixed pose or a ride on `node` (offset / axis in its local frame, read every call). */
export interface Flood {
  pos?: THREE.Vector3;
  dir?: THREE.Vector3;
  node?: THREE.Object3D;
  offset?: [number, number, number];
  /** beam axis in the node's frame (default −Y) */
  axis?: [number, number, number];
  /** half-angle (rad, default 0.45), penumbra fraction (0.5), white-card radiance at `ref` m (2.5 at 10 m) */
  cone?: number; soft?: number; intensity?: number; ref?: number;
  /** colour temperature (default 4300: neutral) or an explicit colour */
  kelvin?: number; color?: RGB;
  /** emitter radius (m, default 0.4), smooth range window (m, default none), visible beam in the haze (default 0) */
  size?: number; range?: number; beam?: number;
  /** base level (default 1) and the order staggered events walk (default its index: build them left → right) */
  level?: number; order?: number;
}
/** A FloodRig event (song time). `only` = the flood indices it applies to (default all). */
export type FloodEvent =
  /** filament slam-on 0 → 1.25 → 0.55 → 1 over 0.22 s (TECHNIQUES C8); `stagger` s per step of `order` (e.g. a 16th) */
  | { t: number; kind: 'on'; stagger?: number; only?: number[] }
  /** snap off (filament afterglow ~40 ms) */
  | { t: number; kind: 'off'; stagger?: number; only?: number[] }
  /** impact: surgeEnv (IMPACT_SURGE[level] ⊕ the fields given): spike → brown-out → recovery */
  | ({ t: number; kind: 'surge'; level?: ImpactLevel; only?: number[] } & SurgeShape)
  /** the bus droops: × `to` (reached over `fade` s, default 0.05), held `dur` s, back over `fade` (dur Infinity = until an 'on') */
  | { t: number; kind: 'dip'; to: number; dur: number; fade?: number; only?: number[] }
  /** bulbs blow: × `peak` (default 2.5) for one frame, then dead for good; `stagger` s between them (default one frame) */
  | { t: number; kind: 'blow'; only: number[]; stagger?: number; peak?: number }
  /** deterministic flicker for `dur` s (1/30 s steps), dips of `depth` (default 0.6), thinning out */
  | { t: number; kind: 'flicker'; dur: number; depth?: number; seed?: number; only?: number[] };
/** A flood's beam in the shape _fx's FxBeams / FxLights take (BeamLight): tuples, half-tangents, white-card radiance. */
export interface FloodBeam { pos: [number, number, number]; dir: [number, number, number]; tanX: number; tanY: number; intensity: number; ref: number; color: RGB; soft?: number; range?: number }

const FILAMENT: [number, number][] = [[0, 0], [0.04, 1.25], [0.1, 0.55], [0.22, 1]];
/** the filament slam-on curve (0 → 1.25 → 0.55 → 1 over 0.22 s), `k` s after switching on */
export function filamentOn(k: number): number {
  if (k <= 0) return 0;
  for (let i = 0; i < FILAMENT.length - 1; i++) {
    const [a, va] = FILAMENT[i]!, [b, vb] = FILAMENT[i + 1]!;
    if (k < b) return va + (vb - va) * smr((k - a) / (b - a));
  }
  return 1;
}

/**
 * p1v4 a set of floodlights driven by an event script (pure function of song time): the crown's canopy floods, a
 * granite-edge grazer row, a cabinet's lamps … Levels per flood = base × on/off (filament) × surges × dips × flickers;
 * blown bulbs flash one frame then stay dark.
 *   const floods = new FloodRig(nodes.map((n, i) => ({ node: n, axis: [0, -0.79, 0.62], intensity: 3.2, kelvin: 5200, order: i })), [
 *     { t: 46.273, kind: 'surge', level: 'L', peak: 1.5 },                 // the brake: spike, then …
 *     { t: 46.33, kind: 'dip', to: 0.15, dur: 0.17 },                       // … the crown bus drops below the pre-hit level
 *     { t: 46.50, kind: 'on', stagger: 0.0575 },                            // … and the floods come back left → right on 16ths
 *     { t: 48.111, kind: 'blow', only: [1, 4] },                            // two bulbs pop, one frame apart
 *   ], { group: 'flood' });
 *   const lv = floods.apply(rig, t, { cam: cam.position, max: 3 });          // the 3 that matter as practicals (group 'flood')
 *   heads.update(lv, cam);                                                  // _lamp.FloodHeads: the visible fixtures
 *   fxBeams.lights.beams = floods.beams(t);                                 // the _fx hook: FxBeams / FxDust light up in them
 * Before its first 'on' a flood is off when the script starts with an 'on' event for it, else on.
 */
export class FloodRig {
  group: LightGroup;
  constructor(public floods: Flood[], public events: FloodEvent[] = [], o: { group?: LightGroup } = {}) {
    this.group = o.group ?? 'flood';
  }
  private applies(e: { only?: number[] }, i: number) { return !e.only || e.only.includes(i); }
  private rank(i: number) { return this.floods[i]?.order ?? i; }
  /** each flood's level at song time t (≥ 0, ~1 nominal; surges go above, a blown bulb's frame to `peak`) */
  levels(t: number): number[] {
    return this.floods.map((f, i) => {
      // on / off state: the latest switch event that reached this flood (each staggered by its order); before the first
      // one the flood is off if that first switch is an 'on'
      const sws: { t: number; on: boolean }[] = [];
      for (const e of this.events) {
        if ((e.kind === 'on' || e.kind === 'off') && this.applies(e, i)) sws.push({ t: e.t + (e.stagger ?? 0) * this.rank(i), on: e.kind === 'on' });
      }
      sws.sort((a, b) => a.t - b.t);
      let sw: { t: number; on: boolean } | null = null;
      for (const s of sws) if (s.t <= t) sw = s;
      let v = sw ? (sw.on ? filamentOn(t - sw.t) : Math.exp(-(t - sw.t) / 0.04) * (t - sw.t < 1 ? 1 : 0)) : sws[0]?.on ? 0 : 1;
      v *= f.level ?? 1;
      for (const e of this.events) {
        if (!this.applies(e, i)) continue;
        const x = t - e.t;
        if (e.kind === 'surge') {
          if (x > 0) { const S = { ...(IMPACT_SURGE[e.level ?? 'L'] ?? IMPACT_SURGE.L), ...e }; v *= surgeEnv(t, e.t, { ...S, seed: S.seed ?? i * 13 + 1 }); }
        } else if (e.kind === 'dip') {
          if (x > 0) {
            const fd = Math.max(1e-3, e.fade ?? 0.05);
            const k = x < fd ? sm(x / fd) : x < fd + e.dur ? 1 : 1 - sm((x - fd - e.dur) / fd);
            v *= 1 + (e.to - 1) * k;
          }
        } else if (e.kind === 'blow') {
          const tb = e.t + (e.stagger ?? FRAME_S) * e.only.indexOf(i);
          if (t >= tb) v = t < tb + FRAME_S ? (e.peak ?? 2.5) * (f.level ?? 1) : 0;
        } else if (e.kind === 'flicker') {
          if (x > 0 && x < e.dur) {
            const step = Math.floor(t * 30), p = 0.55 * (1 - x / e.dur);
            if (hash(step, e.seed ?? 7 + i, e.t) < p) v *= 1 - (e.depth ?? 0.6) * (0.5 + 0.5 * hash(step, 3.1 + i, e.t));
          }
        }
      }
      return Math.max(0, v);
    });
  }
  /** the rig's mean level at t (for _fx: spark / dust / beam brightness that follows the floods) */
  level(t: number): number { const l = this.levels(t); return l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0; }
  /** flood i's world pose now (node-riding floods read their node) */
  pose(i: number): { pos: THREE.Vector3; dir: THREE.Vector3 } {
    const f = this.floods[i]!;
    if (f.node) {
      f.node.updateWorldMatrix(true, false);
      return { pos: new THREE.Vector3(...(f.offset ?? [0, 0, 0])).applyMatrix4(f.node.matrixWorld), dir: new THREE.Vector3(...(f.axis ?? [0, -1, 0])).transformDirection(f.node.matrixWorld) };
    }
    return { pos: (f.pos ?? new THREE.Vector3()).clone(), dir: (f.dir ?? new THREE.Vector3(0, -1, 0)).clone().normalize() };
  }
  /**
   * Push the floods as practicals (group = this.group; rig.levels[group] still scales them): at most `max` (default 4,
   * and never past MAX_SPOTS), the ones that matter most — lit, and close to `cam` relative to their reach — else the
   * brightest. `gain` multiplies every intensity. Returns all levels (for the fixtures and the _fx hooks).
   */
  apply(rig: LightRig, t: number, o: { cam?: THREE.Vector3; max?: number; gain?: number; beam?: number } = {}): number[] {
    const lv = this.levels(t);
    const cand = this.floods.map((f, i) => {
      const p = this.pose(i), I = (f.intensity ?? 2.5) * lv[i]!;
      const aim = p.pos.clone().addScaledVector(p.dir, f.ref ?? 10);
      const d = o.cam ? Math.min(o.cam.distanceTo(aim), o.cam.distanceTo(p.pos)) : 0;
      const r = f.ref ?? 10;
      return { i, p, I, score: I / (1 + (d * d) / (4 * r * r)) };
    }).filter((c) => c.I > 1e-4).sort((a, b) => b.score - a.score);
    const room = Math.max(0, Math.min(o.max ?? 4, MAX_SPOTS - rig.spots.length));
    for (const c of cand.slice(0, room)) {
      const f = this.floods[c.i]!;
      rig.addSpot({
        pos: c.p.pos, dir: c.p.dir, cone: f.cone ?? 0.45, soft: f.soft ?? 0.5, color: f.color ?? kelvin(f.kelvin ?? 4300),
        intensity: c.I * (o.gain ?? 1), ref: f.ref ?? 10, size: f.size ?? 0.4, group: this.group, beam: o.beam ?? f.beam ?? 0, range: f.range,
      });
    }
    return lv;
  }
  /** The _fx hook: every lit flood as an FxBeams beam (BeamLight shape) at its live level × `gain`. */
  beams(t: number, o: { gain?: number; soft?: number; range?: number } = {}): FloodBeam[] {
    const lv = this.levels(t), out: FloodBeam[] = [];
    this.floods.forEach((f, i) => {
      const I = (f.intensity ?? 2.5) * lv[i]! * (o.gain ?? 1);
      if (I <= 1e-4) return;
      const p = this.pose(i), tn = Math.tan(f.cone ?? 0.45);
      out.push({ pos: [p.pos.x, p.pos.y, p.pos.z], dir: [p.dir.x, p.dir.y, p.dir.z], tanX: tn, tanY: -1, intensity: I, ref: f.ref ?? 10, color: f.color ?? kelvin(f.kelvin ?? 4300), soft: o.soft ?? f.soft ?? 0.3, range: o.range ?? f.range ?? 60 });
    });
    return out;
  }
}
const ZERO = new THREE.Vector3();
const ID_Q = new THREE.Quaternion();
const TMP_M4 = new THREE.Matrix4();
const TMP_A = new THREE.Vector3();
const TMP_B = new THREE.Vector3();

/**
 * Vertex shader for lit materials: world position/normal (vW, vN), local position/normal (vL, vLN), uv (vUv), AO (vAO),
 * instance colour (vIC; vICk = 1 when the mesh has one: three defines USE_INSTANCING_COLOR only in the vertex stage), the object's world X/Z axes with their scale (vAx, vAz: anisotropy tangents) and a per-object
 * / per-instance random (vSeed). Supports InstancedMesh, baked AO (define USE_AO_ATTR: COLOR_0.r) and glTF morph
 * targets (Blender shape keys, e.g. deepnet's `abstract`: three defines USE_MORPHTARGETS/USE_MORPHNORMALS).
 * Normals use the cofactor matrix: correct under non-uniform (instance) scale and mirroring.
 */
export const LIT_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec2 vUv; varying float vAO; varying vec3 vIC;
varying vec3 vAx; varying vec3 vAz; varying float vSeed; varying float vICk;
#ifdef USE_AO_ATTR
attribute vec4 color;
#endif
#include <morphtarget_pars_vertex>
void main() {
  vec3 transformed = vec3(position);
  vec3 objectNormal = vec3(normal);
  #include <morphnormal_vertex>
  #include <morphtarget_vertex>
  vL = transformed; vLN = objectNormal; vUv = uv;
  mat4 im = mat4(1.0);
  #ifdef USE_INSTANCING
  im = instanceMatrix;
  #endif
  mat4 M = modelMatrix * im;
  vec4 wp = M * vec4(transformed, 1.0);
  vW = wp.xyz;
  mat3 m3 = mat3(M);
  mat3 cof = mat3(cross(m3[1], m3[2]), cross(m3[2], m3[0]), cross(m3[0], m3[1]));
  float det = dot(cross(m3[0], m3[1]), m3[2]);
  vN = normalize(cof * objectNormal) * (det < 0.0 ? -1.0 : 1.0);
  vAx = m3[0]; vAz = m3[2];
  vSeed = fract(sin(dot(M[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vAO = 1.0;
  #ifdef USE_AO_ATTR
  vAO = color.r;
  #endif
  vIC = vec3(0.0); vICk = 0.0;
  #ifdef USE_INSTANCING_COLOR
  vIC = instanceColor; vICk = 1.0;
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/**
 * The shared lighting chunk (GLSL ES 3.0 for three's ShaderMaterial; needs GLSL_COMMON first). Functions (prefix `lt`):
 *   vec3  ltShade(P, N, V, albedo, rough, metal, ao)   everything: key (shadowed) + fill + strips + sig + ambient + env
 *   vec3  ltKey(P, N, V, albedo, rough, metal)         key spot only (multiply by ltKeyVis(P) for the shadows)
 *   float ltKeyVis(P)                                  0..1 soft shadow of the occluder boxes toward the key
 *   vec3  ltStrips(P, N, V, albedo, rough, metal)
 *   vec3  ltSig(P, N, V, albedo, rough)                the magenta lamp light (0 when no holder)
 *   vec3  ltAmbient(P, N, V, albedo, rough, metal, ao) hemispherical ambient + env reflection
 *   vec3  ltBrdf(N, V, L, albedo, rough, metal)        GGX + Lambert, × N·L (point source)
 *   vec3  ltFog(col, P)                                height fog between the camera and P
 *   float uUV                                          UV inspection lamp level (pcb silkscreen)
 *   S_INK S_INK2 S_GRAPHITE S_ASH S_BONE               p1v4 neutral surface albedos (SURF, linear)
 * Globals a material may set in main() before shading: LT_WRAP, LT_SPEC, LT_T (+ LT_ANISO).
 */
export const LIGHT_GLSL = /* glsl */ `${SURF_GLSL}
uniform vec3 uKeyPos; uniform vec3 uKeyDir; uniform vec2 uKeyCone; uniform vec3 uKeyCol; uniform float uKeyRef; uniform float uKeySize;
uniform vec3 uFillPos; uniform vec3 uFillDir; uniform vec2 uFillCone; uniform vec3 uFillCol; uniform float uFillRef;
uniform vec3 uStripA[${MAX_STRIPS}]; uniform vec3 uStripB[${MAX_STRIPS}]; uniform vec3 uStripCol[${MAX_STRIPS}]; uniform float uStripW[${MAX_STRIPS}]; uniform int uStripN;
uniform vec3 uSigPos; uniform vec3 uSigN; uniform vec2 uSigSize; uniform vec3 uSigCol; uniform float uSigRange;
uniform vec3 uSigA; uniform vec3 uSigB; uniform vec3 uSigK;
uniform vec3 uOccC[${MAX_OCCLUDERS}]; uniform vec3 uOccH[${MAX_OCCLUDERS}]; uniform mat3 uOccR[${MAX_OCCLUDERS}]; uniform float uOccSoft[${MAX_OCCLUDERS}]; uniform int uOccN;
uniform vec3 uAmb; uniform vec3 uEnv; uniform vec3 uFogCol; uniform vec4 uFog; uniform float uUV;
uniform vec4 uEnvRing; uniform vec3 uEnvRingCol; uniform vec2 uEnvRingY; uniform float uLtQ;
uniform vec4 uFogTop; uniform float uFogTopY;
uniform vec3 uSpotPos[${MAX_SPOTS}]; uniform vec3 uSpotDir[${MAX_SPOTS}]; uniform vec2 uSpotCone[${MAX_SPOTS}]; uniform vec3 uSpotCol[${MAX_SPOTS}]; uniform vec3 uSpotK[${MAX_SPOTS}]; uniform int uSpotN;

float LT_WRAP = 0.0;          // diffuse wrap: 0 Lambert … 0.4 soft translucent ceramic
float LT_SPEC = 1.0;          // specular scale (occlusion in cavities, scratches > 1)
vec3 LT_T = vec3(0.0);        // anisotropy: world tangent of the grooves (unit) …
float LT_ANISO = 0.0;         // … and amount 0..0.95 (highlight stretched across the grooves)
float LT_PXA = 0.0;           // specular anti-aliasing: the normal's change across one pixel (set by ltShade)
float LT_CURV = 0.0;          // surface curvature (1/m, set by ltShade): env rings fade on curved parts (R1: a dome
                              // or a cylinder would mirror the horizontal rings as concentric arcs)

float ltD(float NoH, float a) { float a2 = a * a; float d = NoH * NoH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float ltDAniso(vec3 N, vec3 H, float a) {
  vec3 T = LT_T - N * dot(N, LT_T); float tl = length(T);
  if (tl < 1e-4) return ltD(max(dot(N, H), 0.0), a);
  T /= tl; vec3 B = cross(N, T);
  float at = max(a * (1.0 - LT_ANISO), 0.002), ab = a;   // along the grooves: sharp; across: rough
  float th = dot(T, H) / at, bh = dot(B, H) / ab, nh = dot(N, H);
  float d = th * th + bh * bh + nh * nh;
  return 1.0 / (PI * at * ab * d * d);
}
/** GGX + Lambert(wrap) for a source of angular radius sa (rad), times N·L. Point source: sa = 0. */
vec3 ltBrdfS(vec3 N, vec3 V, vec3 L, vec3 albedo, float rough, float metal, float sa) {
  float NoLr = dot(N, L);
  float wl = (NoLr + LT_WRAP) / (1.0 + LT_WRAP);
  if (wl <= 0.0) return vec3(0.0);
  float NoL = max(NoLr, 0.0);
  float r = clamp(rough, 0.025, 1.0);
  float a = sqrt(r * r * r * r + LT_PXA * LT_PXA), aw = min(a + 0.5 * sa, 1.0);
  vec3 H = normalize(L + V);
  float NoV = max(dot(N, V), 1e-3), NoH = max(dot(N, H), 0.0), VoH = max(dot(V, H), 0.0);
  float D = (LT_ANISO > 0.0 ? ltDAniso(N, H, aw) : ltD(NoH, aw)) * (a * a) / (aw * aw);
  float Vis = 0.5 / max(mix(2.0 * NoL * NoV, NoL + NoV, aw), 1e-4);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 F = f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
  vec3 spec = F * min(D * Vis, 400.0) * NoL * LT_SPEC;
  vec3 diff = albedo * (1.0 - metal) * (1.0 / PI) * wl;
  return diff + spec;
}
vec3 ltBrdf(vec3 N, vec3 V, vec3 L, vec3 albedo, float rough, float metal) { return ltBrdfS(N, V, L, albedo, rough, metal, 0.0); }

// ---------------------------------------------------------------- occluder soft shadows
float ltBoxSd(vec3 p, vec3 h) { vec3 q = abs(p) - h; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
/** visibility of the segment P → P + D·dl through the occluder boxes (inner + outer penumbra) */
float ltOccVis(vec3 P, vec3 D, float dl) {
  float vis = 1.0;
  for (int i = 0; i < ${MAX_OCCLUDERS}; i++) {
    if (i >= uOccN) break;
    vec3 o = uOccR[i] * (P - uOccC[i]), d = uOccR[i] * D, h = uOccH[i];
    float k = uOccSoft[i];
    // the ray can only be in this box's penumbra while within the box grown by k·dl
    vec3 he = h + k * dl;
    vec3 inv = 1.0 / (abs(d) + 1e-6) * sign(d + 1e-12);
    vec3 t0 = (-he - o) * inv, t1 = (he - o) * inv;
    float tn = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
    float tf = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
    tn = max(tn, 0.02); tf = min(tf, dl);
    if (tf <= tn) continue;
    // golden-section search of min sd(t) / (k t): the closest approach in units of the penumbra cone
    float a = tn, b = tf;
    float c = b - 0.618034 * (b - a), e = a + 0.618034 * (b - a);
    float fc = ltBoxSd(o + d * c, h) / (k * c), fe = ltBoxSd(o + d * e, h) / (k * e);
    for (int s = 0; s < 9; s++) {
      if (fc < fe) { b = e; e = c; fe = fc; c = b - 0.618034 * (b - a); fc = ltBoxSd(o + d * c, h) / (k * c); }
      else { a = c; c = e; fc = fe; e = a + 0.618034 * (b - a); fe = ltBoxSd(o + d * e, h) / (k * e); }
    }
    float res = clamp(min(fc, fe), -1.0, 1.0);
    vis = min(vis, 0.25 * (1.0 + res) * (1.0 + res) * (2.0 - res));
  }
  return vis;
}
float ltKeyVis(vec3 P) {
  if (uOccN == 0 || uLtQ < 0.5) return 1.0;
  vec3 toL = uKeyPos - P; float dl = length(toL);
  return ltOccVis(P, toL / max(dl, 1e-4), dl);
}

// ---------------------------------------------------------------- spots
vec3 ltSpot(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float metal, vec3 pos, vec3 dir, vec2 cone, vec3 col, float ref, float size) {
  if (dot(col, col) <= 0.0) return vec3(0.0);
  vec3 toL = pos - P; float d2 = max(dot(toL, toL), 1e-4); float d = sqrt(d2); vec3 L = toL / d;
  float c = smoothstep(cone.x, cone.y, dot(-L, dir));
  if (c <= 0.0) return vec3(0.0);
  return col * (ref * ref / d2) * c * ltBrdfS(N, V, L, albedo, rough, metal, size / d);
}
vec3 ltKey(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float metal) {
  return ltSpot(P, N, V, albedo, rough, metal, uKeyPos, uKeyDir, uKeyCone, uKeyCol, uKeyRef, uKeySize);
}
vec3 ltFill(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float metal) {
  return ltSpot(P, N, V, albedo, rough, metal, uFillPos, uFillDir, uFillCone, uFillCol, uFillRef, 0.5);
}
/** the practicals (rig.spots): unshadowed spots / bulbs, each with an optional smooth range window */
vec3 ltSpots(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float metal) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < ${MAX_SPOTS}; i++) {
    if (i >= uSpotN) break;
    vec3 k = uSpotK[i];
    vec3 c = ltSpot(P, N, V, albedo, rough, metal, uSpotPos[i], uSpotDir[i], uSpotCone[i], uSpotCol[i], k.x, k.y);
    if (k.z > 0.0) { float w = 1.0 - pow(min(length(P - uSpotPos[i]) / k.z, 1.0), 4.0); c *= w * w; }
    acc += c;
  }
  return acc;
}

// ---------------------------------------------------------------- line sources
/** ∫ N·(X(s) − P) / |X(s) − P|³ ds over the segment A→B (clipped to the surface's upper side), soft core r */
float ltLineE(vec3 P, vec3 N, vec3 A, vec3 B, float r) {
  vec3 AB = B - A; float len = length(AB);
  vec3 T = len > 1e-5 ? AB / len : vec3(1.0, 0.0, 0.0);
  vec3 PA = A - P;
  float sA = dot(PA, T);
  vec3 D = PA - T * sA;
  float s0 = sA, s1 = sA + len;
  float nd = dot(N, D), nt = dot(N, T);
  if (abs(nt) > 1e-5) { float sc = -nd / nt; if (nt > 0.0) s0 = max(s0, sc); else s1 = min(s1, sc); }
  else if (nd <= 0.0) return 0.0;
  if (s1 <= s0) return 0.0;
  float k2 = dot(D, D) + r * r;
  float q0 = inversesqrt(k2 + s0 * s0), q1 = inversesqrt(k2 + s1 * s1);
  return max(nd * (s1 * q1 - s0 * q0) / k2 + nt * (q0 - q1), 0.0);
}
/** closest point of segment A→B to the ray P + R·t (Karis' representative point) */
vec3 ltLineRep(vec3 P, vec3 R, vec3 A, vec3 B) {
  vec3 L0 = A - P, Ld = B - A;
  float rl = dot(R, Ld), den = dot(Ld, Ld) - rl * rl;
  float t = den > 1e-6 ? clamp((dot(R, L0) * rl - dot(L0, Ld)) / den, 0.0, 1.0) : 0.5;
  return L0 + Ld * t;
}
/**
 * Glossy reflection of a strip of surface radiance Le and width w, seen along R at the representative point Lv:
 * the reflected strip blurred by the lobe (Gaussian of width σ ≈ 2α across the strip), energy-correct:
 * a mirror shows exactly F·Le inside the strip, a rough surface a dimmer, wider band with the same total.
 */
vec3 ltLineSpec(vec3 N, vec3 V, vec3 R, vec3 Lv, vec3 albedo, float rough, float metal, float width, vec3 Le) {
  float d = max(length(Lv), 1e-3); vec3 L = Lv / d;
  float NoL = dot(N, L); if (NoL <= 0.0) return vec3(0.0);
  float r = clamp(rough, 0.025, 1.0); float a = r * r * (1.0 + 0.8 * LT_ANISO);
  float om = width / d;                                    // angular width of the strip
  float sig = max(2.0 * a, 1e-3);
  float th2 = 2.0 * (1.0 - clamp(dot(R, L), -1.0, 1.0));   // θ² (small-angle identity, no acos)
  float s2 = sig * sig + om * om / 12.0 + 4.0 * LT_PXA * LT_PXA;
  float g = min(om / (2.5066 * sqrt(s2)), 1.0) * exp(-0.5 * th2 / s2);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 F = f0 + (1.0 - f0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  return F * Le * g * smoothstep(0.0, 0.15, NoL) * LT_SPEC;
}
/** specular of a small sphere-ish source of radiance Le, angular radius rho, at direction L (GGX widened by rho) */
vec3 ltSpecS(vec3 N, vec3 V, vec3 L, vec3 albedo, float rough, float metal, float rho, vec3 E, vec3 Le) {
  float NoL = dot(N, L); if (NoL <= 0.0) return vec3(0.0);
  float r = clamp(rough, 0.025, 1.0); float a = sqrt(r * r * r * r + LT_PXA * LT_PXA), aw = min(a + 0.5 * rho, 1.0);
  vec3 H = normalize(L + V);
  float NoV = max(dot(N, V), 1e-3), NoH = max(dot(N, H), 0.0), VoH = max(dot(V, H), 0.0);
  float D = (LT_ANISO > 0.0 ? ltDAniso(N, H, aw) : ltD(NoH, aw)) * (a * a) / (aw * aw);
  float Vis = 0.5 / max(mix(2.0 * NoL * NoV, NoL + NoV, aw), 1e-4);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 F = f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
  return F * min(min(D * Vis, 400.0) * NoL * E, Le) * LT_SPEC;
}
vec3 ltStrips(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float metal) {
  vec3 acc = vec3(0.0);
  vec3 R = reflect(-V, N);
  for (int i = 0; i < ${MAX_STRIPS}; i++) {
    if (i >= uStripN) break;
    vec3 A = uStripA[i], B = uStripB[i], col = uStripCol[i];
    float w = uStripW[i];
    float e = ltLineE(P, N, A, B, w);
    acc += col * e * albedo * (1.0 - metal) * (1.0 / PI);
    // specular: the strip mirrored in the surface, blurred by the roughness (surface radiance Le = 2I/w = 4·col/(π w))
    if (uLtQ > 0.5) acc += ltLineSpec(N, V, R, ltLineRep(P, R, A, B), albedo, rough, metal, w, col * (4.0 / (PI * w)));
  }
  return acc;
}

// ---------------------------------------------------------------- the magenta lamp
vec3 ltSigM(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float metal) {
  if (dot(uSigCol, uSigCol) <= 0.0) return vec3(0.0);
  vec3 rel = P - uSigPos; float d = length(rel);
  if (d >= uSigRange) return vec3(0.0);
  float win = 1.0 - pow(d / uSigRange, 4.0); win *= win;
  // dome emission: full along the normal, fading to 0 just below the dome's equator (the seat hides the core there)
  float ce = dot(uSigN, rel / max(d, 1e-4));
  float em = smoothstep(-0.5, 0.3, ce) * (0.55 + 0.45 * max(ce, 0.0)) * win;
  if (em <= 0.0) return vec3(0.0);
  float r = uSigK.x;
  vec3 c, Lv;
  if (uSigK.y > 0.5) {
    // elongated: area/length × the line integral; specular at the representative point
    float e = uSigK.z * ltLineE(P, N, uSigA, uSigB, r) * em;
    c = uSigCol * e * albedo * (1.0 - metal) * (1.0 / PI);
    Lv = ltLineRep(P, reflect(-V, N), uSigA, uSigB);
  } else {
    // square (a lamp dome): a small sphere-ish emitter at its centre, soft core r
    Lv = -rel;
    float NoL = max(dot(N, Lv) / max(d, 1e-4), 0.0);
    c = uSigCol * (4.0 * r * r * NoL / (d * d + r * r)) * em * albedo * (1.0 - metal) * (1.0 / PI);
  }
  // specular: a square patch (short side) of the emitter at Lv, GGX widened by its size, never brighter than it
  float dl = max(length(Lv), 1e-3);
  vec3 Es = uSigCol * (4.0 * r * r / (dl * dl + r * r)) * em;
  c += ltSpecS(N, V, Lv / dl, albedo, rough, metal, r / dl, Es, uSigCol);
  return c;
}
vec3 ltSig(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough) { return ltSigM(P, N, V, albedo, rough, 0.0); }

// ---------------------------------------------------------------- ambient
vec3 ltSky(vec3 D) { return mix(0.35, 1.0, clamp(D.y * 0.5 + 0.5, 0.0, 1.0)) * uAmb; }
vec3 ltEnvRad(vec3 R, float rough) {
  // dim studio dome: brighter overhead, a soft horizon band, dark below; blurred by roughness
  float up = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
  float band = exp(-R.y * R.y * mix(18.0, 3.0, rough));
  return uEnv * (0.15 + 0.85 * up * up + 0.35 * band) + ltSky(R) * 0.5;
}
/** the ring strips seen along R from P (radiance): lines on a wall at distance d, blurred by the lobe, energy-correct */
vec3 ltEnvRings(vec3 P, vec3 R, float rough) {
  if (uEnvRing.w <= 0.0 || uLtQ < 0.5) return vec3(0.0);
  float hz = max(length(R.xz), 1e-3);
  float cosEl = hz / max(length(R), 1e-4);
  float h = P.y + uEnvRing.y * R.y / hz;                    // where the reflected ray meets the wall
  if (h < uEnvRingY.x - uEnvRing.x * 0.5 || h > uEnvRingY.y + uEnvRing.x * 0.5) return vec3(0.0);
  float sp = uEnvRing.x;
  float dm = abs(fract((h - uEnvRingY.x) / sp + 0.5) - 0.5) * sp;
  float dist = uEnvRing.y / max(cosEl, 0.05);
  float ang = dm * cosEl * cosEl / uEnvRing.y;
  float a = clamp(rough, 0.025, 1.0); a *= a * (1.0 + 0.8 * LT_ANISO);
  float om = uEnvRing.z / dist;
  float s2 = 4.0 * a * a + 1e-6 + om * om / 12.0 + 4.0 * LT_PXA * LT_PXA;
  float flat_ = 1.0 - smoothstep(0.4, 1.5, LT_CURV);
  return uEnvRingCol * min(om / (2.5066 * sqrt(s2)), 1.0) * exp(-0.5 * ang * ang / s2) * flat_;
}
vec3 ltAmbient(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float metal, float ao) {
  float NoV = max(dot(N, V), 1e-3);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  float r = clamp(rough, 0.025, 1.0);
  vec3 Fa = f0 + (max(vec3(1.0 - r), f0) - f0) * pow(1.0 - NoV, 5.0);   // roughness-aware Schlick
  vec3 R = reflect(-V, N);
  return ltSky(N) * albedo * (1.0 - metal) * ao + Fa * (ltEnvRad(R, r) + ltEnvRings(P, R, r)) * ao * LT_SPEC;
}

vec3 ltShade(vec3 P, vec3 N, vec3 V, vec3 albedo, float rough, float metal, float ao) {
  LT_PXA = min(length(fwidth(N)), 0.5);
  LT_CURV = length(fwidth(N)) / max(length(fwidth(P)), 1e-5);
  vec3 k = ltKey(P, N, V, albedo, rough, metal);
  if (dot(k, k) > 0.0) k *= ltKeyVis(P);
  vec3 c = k;
  if (uLtQ > 0.5) c += ltFill(P, N, V, albedo, rough, metal);
  c += ltSpots(P, N, V, albedo, rough, metal);
  c += ltStrips(P, N, V, albedo, rough, metal);
  c += ltSigM(P, N, V, albedo, rough, metal);
  c *= mix(1.0, ao, 0.6);   // baked AO darkens direct light a little (contact), ambient fully
  return c + ltAmbient(P, N, V, albedo, rough, metal, ao);
}
/** the fog's in-scattered radiance seen toward P: uFogCol + the lip's glow (fog.top), evaluated 65 % along the ray */
vec3 ltFogIn(vec3 P) {
  if (uFogTop.w <= 0.0) return uFogCol;
  float ye = min(mix(cameraPosition.y, P.y, 0.65), uFogTopY);
  return uFogCol + uFogTop.rgb * exp(-(uFogTopY - ye) / uFogTop.w);
}
vec3 ltFog(vec3 col, vec3 P) {
  if (uFog.x <= 0.0) return col;
  vec3 ray = P - cameraPosition; float dist = length(ray);
  float f = uFog.y, dy = ray.y;
  float base = uFog.x * exp(-f * (cameraPosition.y - uFog.z));
  float k = abs(f * dy) > 1e-4 ? (1.0 - exp(-f * dy)) / (f * dy) : 1.0;
  float amt = min(uFog.w, 1.0 - exp(-base * k * dist));
  return mix(col, ltFogIn(P), amt);
}`;

// ================================================================ the key's beam in the fog

/**
 * The visible beam of the key work light in the height fog (§5.4 "volumetric light"): single scattering of the
 * key spot (cone, 1/d², occluder shadows), Henyey–Greenstein phase, height-fog density and transmittance, ray-marched
 * from the camera to the depth buffer at half resolution, jittered by song time (deterministic; sub-frames average
 * the noise). NEVER magenta: only the key and the practicals scatter.
 * p1v3: also the beams of up to MAX_BEAMS practicals (rig.spots with `beam` > 0, unshadowed); it runs when the key is
 * off but a beam is on (a plate that guards `vol.render` with `rig.key.intensity > 0` should also check rig.spots).
 *
 *   const vol = new LightVolume();
 *   … render the opaque pass into dof.rt (which has a depthTexture) …
 *   vol.render(renderer, dof.rt, cam, t, { strength: 1 });   // reads LIGHT_UNIFORMS (call after rig.apply())
 *   vol.composite(renderer, dof.rt);                           // additive, before glass / DoF
 */
export class LightVolume {
  rt = makeRT(W / 2, H / 2, { depthBuffer: false });
  pass: FSPass;
  add: FSPass;
  constructor(public steps = 28) {
    this.pass = new FSPass(/* glsl */ `
      uniform sampler2D dep; uniform mat4 invVP; uniform vec3 camPos; uniform float near, far, tJit, strength, maxDist, g, scatter;
      uniform vec3 uKeyPos; uniform vec3 uKeyDir; uniform vec2 uKeyCone; uniform vec3 uKeyCol; uniform float uKeyRef;
      uniform vec3 uOccC[${MAX_OCCLUDERS}]; uniform vec3 uOccH[${MAX_OCCLUDERS}]; uniform mat3 uOccR[${MAX_OCCLUDERS}]; uniform int uOccN;
      uniform vec4 uFog;
      uniform vec3 uBeamPos[${MAX_BEAMS}]; uniform vec3 uBeamDir[${MAX_BEAMS}]; uniform vec2 uBeamCone[${MAX_BEAMS}]; uniform vec3 uBeamCol[${MAX_BEAMS}]; uniform float uBeamRef[${MAX_BEAMS}]; uniform int uBeamN;
      float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      float occ(vec3 x) {
        vec3 toL = uKeyPos - x; float dl = length(toL); vec3 D = toL / max(dl, 1e-4);
        for (int i = 0; i < ${MAX_OCCLUDERS}; i++) {
          if (i >= uOccN) break;
          vec3 o = uOccR[i] * (x - uOccC[i]), d = uOccR[i] * D, h = uOccH[i];
          vec3 inv = 1.0 / (abs(d) + 1e-6) * sign(d + 1e-12);
          vec3 t0 = (-h - o) * inv, t1 = (h - o) * inv;
          float tn = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
          float tf = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
          if (tf > max(tn, 0.0) && tn < dl) return 0.0;
        }
        return 1.0;
      }
      float dens(float y) { return uFog.x * exp(-uFog.y * (y - uFog.z)); }
      void main() {
        bool keyOn = dot(uKeyCol, uKeyCol) > 0.0;
        if (uFog.x <= 0.0 || (!keyOn && uBeamN == 0)) { fragColor = vec4(0.0); return; }
        float z = texture(dep, vUv).r;
        vec4 wp = invVP * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0); wp /= wp.w;
        vec3 ray = wp.xyz - camPos; float dist = length(ray); vec3 rd = ray / max(dist, 1e-4);
        dist = min(z >= 0.99999 ? maxDist : dist, maxDist);
        float j = ign(gl_FragCoord.xy + 37.0 * fract(tJit * 7.31));
        float ds = dist / float(${steps});
        vec3 acc = vec3(0.0); vec3 accB = vec3(0.0); float od = 0.0;
        float base = dens(camPos.y);
        for (int i = 0; i < ${steps}; i++) {
          float s = (float(i) + j) * ds;
          vec3 x = camPos + rd * s;
          float sig = dens(x.y);
          float tr = exp(-od) * sig * scatter * ds;
          if (keyOn) {
            vec3 toL = uKeyPos - x; float d2 = max(dot(toL, toL), 1e-2); vec3 L = toL * inversesqrt(d2);
            float c = smoothstep(uKeyCone.x, uKeyCone.y, dot(-L, uKeyDir));
            if (c > 0.0) {
              float mu = dot(rd, L);
              float ph = (1.0 - g * g) / (4.0 * PI * pow(max(1.0 + g * g - 2.0 * g * mu, 1e-4), 1.5));
              acc += uKeyCol * (tr * ph * c * (uKeyRef * uKeyRef / d2) * occ(x));
            }
          }
          // the practicals' beams (unshadowed; rig.spots with beam > 0)
          for (int b = 0; b < ${MAX_BEAMS}; b++) {
            if (b >= uBeamN) break;
            vec3 toB = uBeamPos[b] - x; float e2 = max(dot(toB, toB), 0.04); vec3 Lb = toB * inversesqrt(e2);
            float cb = smoothstep(uBeamCone[b].x, uBeamCone[b].y, dot(-Lb, uBeamDir[b]));
            if (cb <= 0.0) continue;
            float mub = dot(rd, Lb);
            float phb = (1.0 - g * g) / (4.0 * PI * pow(max(1.0 + g * g - 2.0 * g * mub, 1e-4), 1.5));
            accB += uBeamCol[b] * (tr * phb * cb * (uBeamRef[b] * uBeamRef[b] / e2));
          }
          od += sig * ds;
        }
        fragColor = vec4((acc + accB) * strength, 1.0);
      }`, {
      dep: { value: null }, invVP: { value: new THREE.Matrix4() }, camPos: { value: new THREE.Vector3() },
      near: { value: 0.1 }, far: { value: 600 }, tJit: { value: 0 }, strength: { value: 1 }, maxDist: { value: 80 }, g: { value: 0.45 }, scatter: { value: 1 },
      uKeyPos: LIGHT_UNIFORMS.uKeyPos!, uKeyDir: LIGHT_UNIFORMS.uKeyDir!, uKeyCone: LIGHT_UNIFORMS.uKeyCone!, uKeyCol: LIGHT_UNIFORMS.uKeyCol!, uKeyRef: LIGHT_UNIFORMS.uKeyRef!,
      uOccC: LIGHT_UNIFORMS.uOccC!, uOccH: LIGHT_UNIFORMS.uOccH!, uOccR: LIGHT_UNIFORMS.uOccR!, uOccN: LIGHT_UNIFORMS.uOccN!, uFog: LIGHT_UNIFORMS.uFog!,
      uBeamPos: LIGHT_UNIFORMS.uBeamPos!, uBeamDir: LIGHT_UNIFORMS.uBeamDir!, uBeamCone: LIGHT_UNIFORMS.uBeamCone!, uBeamCol: LIGHT_UNIFORMS.uBeamCol!, uBeamRef: LIGHT_UNIFORMS.uBeamRef!, uBeamN: LIGHT_UNIFORMS.uBeamN!,
    });
    this.add = new FSPass(/* glsl */ `uniform sampler2D src; void main() { fragColor = vec4(texture(src, vUv).rgb, 1.0); }`,
      { src: { value: this.rt.texture } }, { blending: THREE.AdditiveBlending, transparent: true });
  }
  /** March the beam for camera `cam` against `target.depthTexture`. `t` (song time) only seeds the jitter. */
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, cam: THREE.PerspectiveCamera, t: number, o: { strength?: number; maxDist?: number; rig?: LightRig } = {}) {
    const u = this.pass.u;
    u.dep!.value = target.depthTexture;
    (u.invVP!.value as THREE.Matrix4).multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
    (u.camPos!.value as THREE.Vector3).setFromMatrixPosition(cam.matrixWorld);
    u.tJit!.value = t;
    u.strength!.value = o.strength ?? 1;
    u.maxDist!.value = o.maxDist ?? 80;
    u.g!.value = o.rig?.fog.g ?? 0.45;
    u.scatter!.value = o.rig?.fog.scatter ?? 1;
    this.pass.render(renderer, this.rt);
    return this.rt.texture;
  }
  /** true when this frame has anything to scatter: the key or a practical's beam (guard vol.render with it) */
  static wanted(rig: LightRig): boolean {
    return (rig.key.intensity > 0 && rig.level('key') > 0) || rig.spots.some((s) => (s.beam ?? 0) > 0 && s.intensity > 0);
  }
  /** Add the beam onto `target` (full resolution, bilinear). */
  composite(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
    this.add.render(renderer, target);
  }
  dispose() { this.rt.dispose(); this.pass.mat.dispose(); this.add.mat.dispose(); }
}
