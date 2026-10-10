// The material library of THE SHAFT (TREATMENT §2.3). Owner: lookdev.
//
// Every material is a ShaderMaterial on LIT_VERT + GLSL_COMMON + LIGHT_GLSL (+ SUNG_GLSL for lyric faces): lit only
// by the scene's LightRig (_light.ts), never by three.js lights. Colours are linear and come from palette roles.
// Procedural micro-detail (filtered by the pixel footprint, so it never shimmers) keeps big planes from reading as
// flat boxes; detail lives in the object's LOCAL metres (moves with the part), except castConcrete (cast in place:
// WORLD metres, so seams line up across wall boxes).
//
//   anodInk        black anodised ink2: bead-blast grain, handling smudges, hairline scratches that expose metal
//   brushedAsh     brushed aluminium (ash): streaks along the part's local X (Z on ±X faces), anisotropic GGX
//   castConcrete   graphite fair-faced concrete: 2.4 × 1.2 m formwork panels (tone per panel), joint lips, 4 tie
//                  holes per panel with plugs, seepage streaks below holes and joints, pores, ply imprint
//   granite        polished ink2 black granite: mineral flecks, sparkle grains, reads a `_look.Mirror` (Schlick,
//                  strength GRANITE_MIRROR.strength at normal incidence, blur GRANITE_MIRROR.blur texels)
//   pcb            ink2 solder mask (glossy; copper under it reads lighter and raised) + HASL pads (ash, metallic) +
//                  bone silkscreen (outlines, pin-1 marks, designators in a 3×5 font) + drills; uUV = fluorescence.
//                  Procedural layout on a routing grid of `scale` m (default 0.025), or `map` (RGBA = copper, silk,
//                  exposed pad, drill; read with the mesh uv) for a drawn board such as THE BOARD's real designators
//   ceramic        bone technical ceramic: satin, wrap-lit (translucent terminator), fine pores
//   steelGraphite  ground steel (graphite): fine grinding lines, temper blotches, mild anisotropy
//   glass          fresnel reflections (all lights + env) + light piped to the grazing edges, over a thickness-tinted
//                  transmission; premultiplied blending (result = glass + behind × T), so stacked panes composite.
//                  With a `map` (a Backdrop of the opaque pass, uMapK = 1) the straight-through backdrop is swapped
//                  for a normal-offset one = fake refraction, tinted per channel; without one, plain blending.
//                  Render glass after the opaques, in its own scene/pass (depthWrite off). No transmission pass.
//   phosphor       oscilloscope phosphor (bone) behind a dark faceplate: trace = uMap.r × uMapK, persistence halo,
//                  faint 10 × 8 graticule
//   led            segment/dot emitter behind a smoked cover: lit = uEmitK (× instanceColor.r when instanced),
//                  colour uEmit (default bone at 0.8 peak); unlit segments graphite ≈ 0.05, visible
//
//   const m = mat('anodInk', { ao: true });                    // or the named helpers: anodInk({ ao: true })
//   const f = mat('led', { face: true });                      // lyric face: has sung uniforms (setSungUniforms)
//   loadGLTF(url, { restyle: gltfRestyle })                    // Blender material names → this library
//   setGrey(m, 1)                                              // deprecated → graphite (uniform uGrey)
//   const bd = new Backdrop(); bd.bind(glassMat); … opaque pass into rt …; bd.capture(renderer, rt); … glass pass into rt
//   (Backdrop(res = 0.5): half resolution is plenty, the glass only shows it offset and softened)
//
// p1v4 (§13.4, KITS §23): every albedo is neutral. The defaults are _light's SURF colours (graphite #5D5D5D, ash #9B9B9B,
// neutral inks, a warm-white ceramic, all a hair warm), and any `base` a plate passes is neutralised in the shader at its own
// luminance (MatOpts.hue keeps a deliberate colour; glass keeps its tint): the v1 palette's violet greys were the purple
// cast. heroInk() / MAT_PRESETS.hero = the dark glossy anodised finish of a hero machine (ink2 × 0.55 under a clear coat,
// little wear): it reads by its reflections and a grazing key (keyPool). MatOpts.wear / coat / hue are new. Lettering
// stays bone.
//
// Common uniforms on every material: uBase (albedo), uRough, uMetal, uEmit (linear emission colour), uEmitK,
// uGrey (0..1 → graphite), uAOk (baked AO weight), uOpacity, uScale (detail scale), uDetail (micro-detail amount), uWear (p1v4)
// + the shared LIGHT_UNIFORMS. Face materials add the sung block (the lettering is self-lit by sungFill and still
// catches the scene's specular highlights). Micro-detail is skipped entirely in a setLightQuality(0) pass.
import * as THREE from 'three';
import { GLSL_COMMON } from '../engine/glsl/common';
import { FSPass, makeRT, W, H } from '../engine/gl';
import { SUNG_GLSL, sungUniforms } from '../engine/lyricreg';
import { LIGHT_GLSL, LIGHT_UNIFORMS, LIT_VERT, SURF, type RGB } from './_light';
export { SURF } from './_light';
import { GRANITE_MIRROR, type Mirror } from './_look';

export type MatName = 'anodInk' | 'brushedAsh' | 'castConcrete' | 'granite' | 'pcb' | 'ceramic' | 'steelGraphite' | 'glass' | 'phosphor' | 'led';
export const MAT_NAMES: readonly MatName[] = ['anodInk', 'brushedAsh', 'castConcrete', 'granite', 'pcb', 'ceramic', 'steelGraphite', 'glass', 'phosphor', 'led'];

export interface MatOpts {
  /** read baked AO from COLOR_0 (Blender _kit.bake_ao) */
  ao?: boolean;
  /** lyric face: adds the sung uniform block; the face (local +Z normal, or all if `faceAll`) shows sungFill() */
  face?: boolean;
  /** with `face`: the whole mesh is lettering (default: only fragments whose LOCAL normal is ≈ +Z) */
  faceAll?: boolean;
  /** override albedo (linear); glass: transmittance of one wall at normal incidence */
  base?: RGB;
  rough?: number;
  metal?: number;
  /** self-emission (linear colour × emitK); led: the lit colour */
  emit?: RGB;
  emitK?: number;
  side?: THREE.Side;
  /** granite: the planar reflection to read */
  mirror?: Mirror;
  /** glass: backdrop (Backdrop.texture); phosphor: the trace image (R); pcb: layer map (RGBA copper/silk/pad/drill) */
  map?: THREE.Texture | null;
  transparent?: boolean;
  /** procedural detail scale (1 = the defaults below, in metres); pcb: the routing pitch in metres */
  scale?: number;
  /** micro-detail amount 0..1 (scratches, streaks, sparkle); default 1 */
  detail?: number;
  /** glass: wall thickness (m), default 0.03 */
  thickness?: number;
  /**
   * p1v4: wear 0..1 (default 1): the scratches that expose bare metal (anodInk, brushedAsh, steelGraphite) and the anodInk
   * handling wipes. On a near-black finish a bright hairline is ~18× the dye, so at 1 a dark part reads matte grey from
   * 10 m; the hero finish uses 0.12 (a few fine scratches, a deep glossy black).
   */
  wear?: number;
  /**
   * p1v4: clear coat 0..1 (default 0 = none, no cost): a sharp second specular layer (roughness `coatR`, default 0.07)
   * over the finish — every light, strip and env ring mirrored crisply on a dark part (the hero finish uses 0.8). Costs one
   * more ltShade per fragment of that material (compiled in only when coat > 0).
   */
  coat?: number;
  coatR?: number;
  /**
   * p1v4: keep the base albedo's hue (default false: the library neutralises every albedo to SURF's warm-neutral at the
   * same luminance — §13.4 "surfaces are neutral" — so a plate's `base: LIN.ink2 × k` stops being violet without touching
   * the plate; true for a deliberately coloured surface. Glass keeps its tint by default.)
   */
  hue?: boolean;
}

interface Def { base: RGB; rough: number; metal: number; define: string; scale?: number }
const k = (c: readonly number[], s: number): RGB => [c[0]! * s, c[1]! * s, c[2]! * s];
/** Per-material defaults (lookdev tunes these). p1v4: neutral SURF albedos (were the violet palette greys / inks). */
export const MAT_DEFAULTS: Record<MatName, Def> = {
  anodInk: { base: k(SURF.ink2, 1.9), rough: 0.34, metal: 0, define: 'M_ANOD' },
  brushedAsh: { base: k(SURF.ash, 1.15), rough: 0.3, metal: 1.0, define: 'M_BRUSHED' },
  castConcrete: { base: k(SURF.graphite, 0.85), rough: 0.9, metal: 0, define: 'M_CONCRETE' },
  granite: { base: k(SURF.ink2, 1.15), rough: 0.11, metal: 0, define: 'M_GRANITE' },
  pcb: { base: k(SURF.ink2, 1.25), rough: 0.3, metal: 0, define: 'M_PCB', scale: 0.025 },
  ceramic: { base: k(SURF.bone, 0.82), rough: 0.48, metal: 0, define: 'M_CERAMIC' },
  steelGraphite: { base: k(SURF.graphite, 1.6), rough: 0.3, metal: 1.0, define: 'M_STEEL' },
  glass: { base: [0.885, 0.9, 0.905], rough: 0.04, metal: 0, define: 'M_GLASS' },
  phosphor: { base: k(SURF.ink2, 1.0), rough: 0.06, metal: 0, define: 'M_PHOSPHOR' },
  led: { base: k(SURF.ink, 1.6), rough: 0.28, metal: 0, define: 'M_LED' },
};
/**
 * p1v4 (§12.4 v4 world change 8, §13.4) named finishes: `hero` = the dark glossy anodised body of a hero machine (DEPTH, the
 * lock, the crown): albedo ink2 × 0.55 under a clear coat (0.8, rough 0.07) over a 0.2 satin, little wear — near-black faces
 * that read by their reflections (env rings, the practicals, the key's streak on the bevels) and by a GRAZING key (keyPool),
 * each face a different value; no front fill. `satin` = the default anodInk.
 */
export const MAT_PRESETS = {
  hero: { base: k(SURF.ink2, 0.55), rough: 0.2, detail: 0.6, wear: 0.12, coat: 0.8, coatR: 0.07 },
  satin: { base: k(SURF.ink2, 1.9), rough: 0.34 },
} as const satisfies Record<string, MatOpts>;

/** Procedural helpers shared by the library (GLSL; needs GLSL_COMMON). Other kits may include it too. */
export const MAT_GLSL = /* glsl */ `
// amplitude of a pattern whose frequency (cycles per pixel) is fpx: fades out before it aliases
float mAA(float fpx) { return 1.0 - smoothstep(0.22, 0.65, fpx); }
// cheap value noise in -1..1 (smoothstep-interpolated hashes) and a 2-octave fbm of it
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}
float vfbm(vec2 p) { return 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.13 + 7.7); }
// face coordinates from the dominant axis of the normal, reading correctly from outside the face:
// x = "along" (X, or Z on ±X faces), y = "across" (Y on side faces, −Z on top: text faces north-up from the south)
vec2 mFaceUV(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.x >= a.y && a.x >= a.z) return vec2(n.x > 0.0 ? -p.z : p.z, p.y);
  if (a.y >= a.z) return vec2(p.x, n.y > 0.0 ? -p.z : p.z);
  return vec2(n.z > 0.0 ? p.x : -p.x, p.y);
}
float mFaceId(vec3 n) { vec3 a = abs(n); return a.x >= a.y && a.x >= a.z ? (n.x > 0.0 ? 1.0 : 2.0) : (a.y >= a.z ? (n.y > 0.0 ? 3.0 : 4.0) : (n.z > 0.0 ? 5.0 : 6.0)); }
// perturb N by a height field h (world metres) through screen derivatives (Mikkelsen)
vec3 mBump(vec3 P, vec3 N, float h) {
  vec3 dpdx = dFdx(P), dpdy = dFdy(P);
  float dhdx = dFdx(h), dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
  float det = dot(dpdx, r1);
  vec3 g = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * N - g);
}
float mSpeckle(vec2 p, float f) { return (hash12(floor(p * f)) - 0.5) * mAA(length(fwidth(p)) * f); }
// hairline scratches in face coords (m): coverage 0..1 (sub-pixel lines keep their ink as faint coverage)
float mScratches(vec2 p, float cell, float density, float seed) {
  float px = max(length(fwidth(p)), 1e-6);
  float fade = smoothstep(4.0, 14.0, cell / px);
  if (fade <= 0.0) return 0.0;
  // the 2 x 2 cells around p (scratches are at most ~1 cell long, so this covers them)
  vec2 ip = floor(p / cell - 0.5);
  float best = 0.0;
  for (int j = 0; j <= 1; j++) for (int i = 0; i <= 1; i++) {
    vec2 c = ip + vec2(float(i), float(j));
    vec3 h = hash33(vec3(c, seed));
    if (h.x > density) continue;
    vec2 ctr = (c + 0.5 + (hash22(c + seed * 7.13) - 0.5)) * cell;
    float fam = floor(h.y * 3.0);
    float ang = fam * 1.047 + 0.35 + (h.z - 0.5) * 0.45;
    vec2 d = vec2(cos(ang), sin(ang));
    float len = cell * (0.5 + 0.9 * fract(h.z * 7.31));
    vec2 q = p - ctr;
    float al = dot(q, d), ac = abs(dot(q, vec2(-d.y, d.x)));
    float ends = 1.0 - smoothstep(0.25 * len, 0.5 * len, abs(al));
    float w = cell * 0.0022 * (0.4 + h.y);
    float cov = min(w / px, 1.0) * (1.0 - smoothstep(0.0, max(px, w), ac));
    best = max(best, cov * ends * (0.3 + 0.7 * fract(h.x * 13.7)));
  }
  return best * fade;
}
// brushed / ground streaks: uv.x along the grain, uv.y across (m); about -1..1
float mStreaks(vec2 uv, float seed, float f) {
  vec2 fw = fwidth(uv);
  float a = 0.0, k;
  k = mAA(fw.y * 1700.0 * f); if (k > 0.0) a += vnoise(vec2(uv.y * 1700.0 * f, uv.x * 2.5 + seed)) * 0.5 * k;
  k = mAA(fw.y * 380.0 * f); if (k > 0.0) a += vnoise(vec2(uv.y * 380.0 * f, uv.x * 0.9 + seed * 2.1)) * 0.35 * k;
  k = mAA(fw.y * 60.0 * f); if (k > 0.0) a += vnoise(vec2(uv.y * 60.0 * f, uv.x * 0.25 + seed * 3.7)) * 0.3 * k;
  return a;
}`;

/** PCB layers on a routing grid (units = pitch): x copper under mask, y silkscreen, z exposed pad (HASL), w drill. */
const PCB_GLSL = /* glsl */ `
float pcbBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
// 3x5 silkscreen font: 0-9, U R C J D Q (15 bits, rows top→bottom, 3 bits each, MSB left)
const int PCB_FONT[16] = int[16](31599, 11415, 29671, 29647, 23497, 31183, 31215, 29266, 31727, 31695, 23407, 27565, 31015, 4719, 27502, 31609);
float pcbGlyph(vec2 g, int ch, float aa) {   // g in glyph units: 0..3 x 0..5
  if (g.x < 0.0 || g.y < 0.0 || g.x >= 3.0 || g.y >= 5.0) return 0.0;
  ivec2 c = ivec2(floor(g));
  int bit = (PCB_FONT[ch] >> (c.y * 3 + (2 - c.x))) & 1;
  vec2 f = fract(g) - 0.5;
  return float(bit) * (1.0 - smoothstep(0.5 - aa, 0.5 + aa, max(abs(f.x), abs(f.y))));
}
// a designator like U12 at p (grid units, origin = lower left), glyph cell 0.2 units
float pcbRef(vec2 p, int letter, int num, float aa) {
  vec2 g = p / 0.2;
  float gi = floor(g.x / 4.0);
  if (gi < 0.0 || gi > 2.0) return 0.0;
  int d1 = num / 10, d0 = num - d1 * 10;
  int ch = gi < 0.5 ? letter : (gi < 1.5 ? (num >= 10 ? d1 : d0) : (num >= 10 ? d0 : -1));
  if (ch < 0) return 0.0;
  return pcbGlyph(vec2(g.x - gi * 4.0, g.y), ch, aa * 5.0);
}
vec4 pcbLayers(vec2 q, float aa) {
  vec4 L = vec4(0.0);
  vec2 bid = floor(q / 12.0);
  vec2 l = q - bid * 12.0;
  vec4 hb = vec4(hash22(bid + 1.37), hash22(bid + 7.91));
  if (hb.y < 0.3) {
    // an IC: two rows of pads, straight staggered fan-out to vias, outline, pin-1 mark, designator
    vec2 p = l - 6.0;
    if (hb.x < 0.5) p = vec2(p.y, -p.x);
    vec2 ich = vec2(2.0 + floor(hb.z * 3.0), 1.2 + floor(hb.w * 2.0));
    float sd = p.y >= 0.0 ? 1.0 : -1.0;
    float py = sd * (ich.y + 0.55);
    for (int k = -1; k <= 1; k++) {
      float col = floor(p.x) + 0.5 + float(k);
      if (abs(col) > ich.x) continue;
      float pad = 1.0 - smoothstep(-aa, aa, pcbBox(p - vec2(col, py), vec2(0.17, 0.34)));
      float hc = hash12(vec2(col * 3.1 + sd, 5.0) + bid);
      float len = 1.2 + mod(col + 0.5, 2.0) + floor(hc * 2.5);
      vec2 a = vec2(col, py), b = vec2(col, py + sd * len);
      float tr = 1.0 - smoothstep(0.11 - aa, 0.11 + aa, sdSegment(p, a, b));
      float dv = length(p - b);
      float via = 1.0 - smoothstep(0.29 - aa, 0.29 + aa, dv);
      float drl = 1.0 - smoothstep(0.11 - aa, 0.11 + aa, dv);
      L.x = max(L.x, max(tr, via)); L.z = max(L.z, max(pad, via * (1.0 - drl))); L.w = max(L.w, drl);
    }
    float ob = abs(pcbBox(p, vec2(ich.x + 0.25, ich.y - 0.05)));
    L.y = max(L.y, 1.0 - smoothstep(0.045 - aa, 0.045 + aa, ob));
    L.y = max(L.y, 1.0 - smoothstep(0.12 - aa, 0.12 + aa, length(p - vec2(-ich.x + 0.45, -ich.y + 0.5))));
    int num = 1 + int(hash12(bid + 3.3) * 38.0);
    L.y = max(L.y, pcbRef(p - vec2(-ich.x + 0.9, -0.5), 10, num, aa));
  } else if (hb.y < 0.42) {
    // ground pour: copper under mask with a clearance frame and a grid of stitching vias
    float pour = 1.0 - smoothstep(-aa, aa, pcbBox(l - 6.0, vec2(5.3)));
    vec2 sv = (fract(l / 1.5) - 0.5) * 1.5;
    float dv = length(sv);
    float drl = (1.0 - smoothstep(0.09 - aa, 0.09 + aa, dv)) * pour;
    L.x = max(L.x, pour * (1.0 - drl));
    L.w = max(L.w, drl);
    // corner marks on the pour
    vec2 cm = abs(l - 6.0) - 5.65;
    float corner = step(-0.9, max(cm.x, cm.y)) * (1.0 - smoothstep(0.04 - aa, 0.04 + aa, min(abs(cm.x), abs(cm.y)))) * step(max(cm.x, cm.y), 0.05) * step(-0.9, min(cm.x, cm.y));
    L.y = max(L.y, corner);
  } else {
    // a bus: parallel lanes, each a trace from via to via (some are wider power traces)
    bool vert = hb.x < 0.5;
    vec2 m = vert ? l.yx : l;
    float lane = floor(m.y);
    float ly = m.y - lane - 0.5;
    vec3 hl = hash33(vec3(bid * 1.7, lane + (vert ? 31.0 : 0.0)));
    float on = step(hl.x, 0.62);
    float a = floor(hl.y * 5.0) + 0.5, b = 11.5 - floor(hl.z * 5.0);
    float w = hl.y > 0.86 ? 0.3 : 0.14;
    float dx = max(max(a - m.x, m.x - b), 0.0);
    float tr = on * (1.0 - smoothstep(w - aa, w + aa, length(vec2(dx, ly))));
    float dv = min(length(vec2(m.x - a, ly)), length(vec2(m.x - b, ly)));
    float via = on * (1.0 - smoothstep(0.3 - aa, 0.3 + aa, dv));
    float drl = on * (1.0 - smoothstep(0.11 - aa, 0.11 + aa, dv));
    L.x = max(L.x, max(tr, via)); L.z = max(L.z, via * (1.0 - drl) * 0.0); L.w = max(L.w, drl);
    // a few resistor/capacitor designators in the free lanes
    if (on < 0.5 && hl.z > 0.6) {
      int letter = hl.y > 0.5 ? 11 : 12;
      L.y = max(L.y, pcbRef(vec2(m.x - 3.0 - floor(hl.y * 4.0), m.y - lane - 0.25), letter, 1 + int(hl.z * 90.0), aa));
    }
  }
  // drills and via rings (~0.1 unit) melt into the copper once they are about a pixel; then all fine structure
  // fades to its average once the grid itself is sub-pixel
  float fine = 1.0 - smoothstep(0.045, 0.11, aa);
  L.w *= fine; L.z = mix(L.z * 0.5, L.z, fine);
  return mix(L, vec4(0.38, 0.03, 0.04, 0.02), smoothstep(0.25, 0.9, aa));
}`;

/**
 * Supported injection point (world's ring light, any plate that adds a light term): every non-glass library fragment
 * contains this exact line once, inside main(), after `albedo/rough/metal/ao/P/N/V` are final. String-replace it with
 * `${MAT_SHADE_LINE}\n  col += myTerm(...);` (and put your declarations before `void main() {`). Kept stable by
 * contract (KITS §4); _mat interpolates this constant itself, so the two can never drift apart.
 */
export const MAT_SHADE_LINE = 'vec3 col = ltShade(P, N, V, albedo, rough, metal, ao);';

const FRAG = /* glsl */ `
uniform vec3 uBase; uniform float uRough; uniform float uMetal; uniform vec3 uEmit; uniform float uEmitK;
uniform float uGrey; uniform float uAOk; uniform float uOpacity; uniform float uScale; uniform float uDetail; uniform float uWear;
uniform float uMatCoat; uniform float uMatCoatR; uniform float uHue;
#ifdef M_GRANITE
uniform sampler2D uRefl; uniform mat4 uMirrorVP; uniform float uReflK; uniform vec2 uTexel; uniform float uReflBlur;
#endif
#if defined(M_PHOSPHOR) || defined(M_GLASS) || defined(M_PCB)
uniform sampler2D uMap; uniform float uMapK;
#endif
#ifdef M_GLASS
uniform float uThick; uniform float uRefr; uniform mat4 projectionMatrix;
#endif
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec2 vUv; varying float vAO; varying vec3 vIC;
varying vec3 vAx; varying vec3 vAz; varying float vSeed; varying float vICk;
void main() {
  vec3 P = vW, N = normalize(vN), V = normalize(cameraPosition - vW);
  if (!gl_FrontFacing) N = -N;
  vec3 nL = normalize(vLN);
  // p1v4: the albedo's hue neutralised (SURF's warm bias, same luminance) unless the material keeps it (MatOpts.hue)
  vec3 baseN = mix(ltNeutral(uBase), uBase, uHue);
  vec3 albedo = baseN; float rough = uRough, metal = uMetal;
  float ao = mix(1.0, vAO, uAOk);
  vec3 emit = uEmit * uEmitK;
  float alpha = uOpacity;
  float S = max(uScale, 1e-4), DT = uDetail * uLtQ;
  vec2 fuv = mFaceUV(vL, nL) / S;
  vec3 Tw = normalize(abs(nL.x) > 0.7 ? vAz : vAx);
  float fid = mFaceId(nL);
#ifdef M_ANOD
  if (DT > 0.0) {
    // handling wipes (roughness), bead-blast grain, the faint machining grain of the metal under the dye, scratches
    float sm = vfbm(fuv * 1.6 + vSeed * 13.0 + fid);
    float wipe = smoothstep(0.1, 0.7, vfbm(fuv * vec2(0.9, 3.2) + vSeed * 7.0 + fid * 3.0)) * uWear;
    float grain = mStreaks(fuv, vSeed * 11.0 + fid, 0.7) * 0.06 * DT;
    albedo *= 1.0 + 0.2 * mSpeckle(fuv + vSeed, 1100.0) * DT + 0.16 * sm + grain;
    rough = clamp(rough + 0.06 * sm - 0.1 * wipe * DT + grain, 0.05, 1.0);
    float scr = mScratches(fuv, 0.06, 0.6 * uWear, vSeed * 31.0 + fid) * DT * min(1.0, uWear * 2.0);
    albedo = mix(albedo, S_ASH * 0.35, scr * 0.85);
    rough = mix(rough, 0.14, scr);
    LT_SPEC = 1.0 + 2.5 * scr;
  }
#endif
#ifdef M_BRUSHED
  LT_T = Tw; LT_ANISO = 0.8;
  if (DT > 0.0) {
    float st = mStreaks(fuv, vSeed * 17.0 + fid, 1.0) * DT;
    float sm = vfbm(fuv * 1.3 + vSeed * 5.0);
    albedo *= 1.0 + 0.11 * st + 0.06 * sm;
    rough = clamp(rough + 0.05 * st + 0.04 * sm, 0.05, 1.0);
    float scr = mScratches(fuv, 0.12, 0.2 * uWear, vSeed * 23.0 + fid) * DT;
    albedo *= 1.0 + 0.35 * scr; rough = mix(rough, 0.1, scr);
  }
#endif
#ifdef M_STEEL
  LT_T = Tw; LT_ANISO = 0.5;
  if (DT > 0.0) {
    float st = mStreaks(fuv * vec2(1.0, 0.8), vSeed * 5.0 + fid, 1.6) * DT;
    float ox = vfbm(fuv * 0.9 + vSeed * 3.0);
    albedo *= 1.0 + 0.07 * st + 0.14 * ox;
    rough = clamp(rough + 0.05 * st + 0.07 * ox, 0.05, 1.0);
    float scr = mScratches(fuv, 0.1, 0.25 * uWear, vSeed * 19.0 + fid) * DT;
    albedo *= 1.0 + 0.4 * scr; rough = mix(rough, 0.12, scr);
  }
#endif
#ifdef M_CONCRETE
  {
    vec3 aN = abs(N);
    bool wall = aN.y < 0.6;
    vec2 q = (aN.x >= aN.z && aN.x >= aN.y) ? P.zy : (aN.y >= aN.z ? P.xz : P.xy);
    q /= S;
    float px = max(length(fwidth(q)), 1e-5);
    vec2 panel = vec2(2.4, 1.2);
    vec2 pid = floor(q / panel);
    vec2 f = q - pid * panel;
    float hp = hash12(pid + 7.7);
    float edge = min(min(f.x, panel.x - f.x), min(f.y, panel.y - f.y));
    float vis = mAA(px / 0.02);
    float seam = (1.0 - smoothstep(0.004, 0.004 + max(px, 0.003), edge)) * vis;
    float lip = ((1.0 - smoothstep(0.01, 0.026 + px, edge)) - seam) * vis;
    vec2 th = vec2(f.x < 1.2 ? 0.6 : 1.8, f.y < 0.6 ? 0.3 : 0.9);
    float td = length(f - th);
    float hvis = mAA(px / 0.012);
    float hole = (1.0 - smoothstep(0.011, 0.013 + px, td)) * hvis;
    float plug = (1.0 - smoothstep(0.017, 0.021 + px, td)) * (1.0 - hole) * hvis;
    // seepage: streaks hanging below each tie hole and from the horizontal joints (walls only)
    float wet = 0.0;
    if (wall) {
      float below = th.y - f.y;
      float sx = (f.x - th.x) / (0.012 + 0.02 * smoothstep(0.0, 0.5, below));
      float tie = exp(-sx * sx) * smoothstep(0.0, 0.03, below) * exp(-below * (1.4 + 2.0 * hash12(pid + th)));
      float dr = smoothstep(0.35, 0.95, vnoise(vec2(q.x * 2.3, pid.y * 1.7 + 0.3))) * exp(-(panel.y - f.y) * (2.0 + 3.0 * hp));
      float brk = 0.55 + 0.45 * vnoise(vec2(q.x * 30.0, q.y * 2.0));
      wet = clamp((tie * 0.9 + dr * 0.55) * brk, 0.0, 1.0);
    }
    float bl = vfbm(q * 0.33 + 3.0) * 0.8 + 0.25 * vnoise(q * 1.9 + 1.3);
    float tone = 0.84 + 0.3 * hp + 0.2 * bl;
    float pores = mSpeckle(q, 260.0) * DT;
    vec2 bg = floor(q * 22.0);
    vec2 bc = (bg + 0.5 + (hash22(bg + 0.7) - 0.5) * 0.6) / 22.0;
    float bug = step(0.86, hash12(bg + 4.1)) * (1.0 - smoothstep(0.0025, 0.004 + px, length(q - bc))) * mAA(px / 0.006) * DT;
    float ply = DT > 0.0 ? vnoise(vec2(f.x * 1.3 + hp * 10.0, f.y * 70.0)) * mAA(px * 70.0) * DT * smoothstep(-0.2, 0.6, vnoise(q * 1.7 + hp * 4.0)) : 0.0;
    albedo *= tone * (1.0 + 0.14 * pores + 0.025 * ply) * (1.0 - 0.55 * seam) * (1.0 + 0.12 * lip) * (1.0 - 0.85 * hole) * (1.0 + 0.08 * plug) * (1.0 - 0.6 * bug);
    albedo *= 1.0 - 0.4 * wet;
    rough = clamp(rough - 0.35 * wet + 0.05 * bl, 0.2, 1.0);
    ao *= 1.0 - 0.5 * seam - 0.6 * hole;
    float h = -0.006 * seam + 0.0015 * lip - 0.012 * hole - 0.002 * bug + 0.00012 * ply;
    N = mBump(P, N, h * S);
  }
#endif
#ifdef M_GRANITE
  float gpx = max(length(fwidth(fuv)), 1e-6);
  vec2 gid = floor(fuv * 240.0);
  float a1 = mAA(gpx * 240.0), a2 = mAA(gpx * 70.0);
  float g2 = hash12(floor(fuv * 70.0 + 3.1)) - 0.5;
  float fleck = smoothstep(0.8, 0.97, hash12(gid)) * a1;
  float cloud = vfbm(fuv * 0.7 + vSeed * 9.0) + 0.3 * vnoise(fuv * 3.1);
  albedo *= 0.9 + 0.35 * g2 * a2 * DT + 0.25 * cloud;
  albedo = mix(albedo, S_GRAPHITE * 0.16, fleck * 0.55 * DT);
  rough = clamp(rough + 0.035 * cloud + 0.05 * fleck, 0.04, 1.0);
  float spk = step(0.955, hash12(gid + 9.1)) * a1 * DT;
  LT_SPEC = 0.85;  // the planar mirror carries the sharp part of the reflections (p1v3: 0.6 → 0.85, the practicals glint on the polish)
#endif
#ifdef M_PCB
  vec2 qg = mFaceUV(vL, nL) / S;
  vec4 Ly = uMapK > 0.5 ? texture2D(uMap, vUv) : (uLtQ > 0.5 ? pcbLayers(qg, clamp(length(fwidth(qg)) * 0.7, 0.008, 2.0)) : vec4(0.38, 0.03, 0.04, 0.03));
  float cu = Ly.x, silk = Ly.y, pad = Ly.z, drill = Ly.w;
  float om = mSpeckle(qg * 0.05, 300.0) * DT;          // orange-peel of the mask
  albedo = baseN * mix(1.0, 2.6, cu) * (1.0 + 0.1 * om);
  rough = mix(uRough, uRough * 0.85, cu) + 0.03 * om;
  metal = 0.0;
  albedo = mix(albedo, S_ASH * 0.95, pad); metal = mix(metal, 1.0, pad); rough = mix(rough, 0.24, pad);
  albedo = mix(albedo, S_BONE * 0.7, silk); rough = mix(rough, 0.72, silk); metal *= 1.0 - silk;
  albedo = mix(albedo, vec3(0.0015), drill); rough = mix(rough, 0.9, drill);
  ao *= 1.0 - 0.7 * drill;
  float h = (0.035 * cu + 0.05 * pad + 0.025 * silk - 0.3 * drill) * S;
  N = mBump(P, N, h);
  emit += C_BONE * 0.78 * silk * uUV * (1.0 - drill);
  emit += C_INK2 * 0.6 * uUV * (1.0 - silk);            // the mask's own faint fluorescence
#endif
#ifdef M_CERAMIC
  float tone = vfbm(fuv * 1.1 + vSeed * 5.0);
  float pore = smoothstep(0.93, 1.0, hash12(floor(fuv * 420.0))) * mAA(length(fwidth(fuv)) * 420.0) * DT;
  albedo *= (1.0 + 0.05 * mSpeckle(fuv + vSeed, 800.0) * DT + 0.05 * tone) * (1.0 - 0.3 * pore);
  rough = clamp(rough + 0.06 * tone, 0.05, 1.0);
  LT_WRAP = 0.3;
#endif
#ifdef M_LED
  float lit = uEmitK * mix(1.0, vIC.r, vICk);
  vec3 ec = dot(uEmit, uEmit) > 0.0 ? uEmit : vec3(0.763, 0.741, 0.800);
  float grain = 1.0 + 0.06 * mSpeckle(fuv + vSeed, 600.0);
  // unlit segments stay visible as graphite but dim (p1v3: 0.45 → 0.25 — under the display grade's mid lift 0.45 read as lit: '09.20' → '88.88')
  emit = ec * lit * grain + S_GRAPHITE * 0.25 * (1.0 - clamp(lit, 0.0, 1.0));
#endif
  // deprecated parts go graphite and dark
  albedo = mix(albedo, S_GRAPHITE, uGrey);
  emit *= 1.0 - uGrey;
#if defined(M_GLASS)
  vec3 col;
  {
    float NoV = max(dot(N, V), 1e-3);
    float F = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
    vec3 refl = ltShade(P, N, V, vec3(0.0), max(rough, 0.03), 0.0, 1.0);
    // light piped through the thickness glows at the grazing edges (fakes the internal bounces)
    refl += pow(1.0 - NoV, 3.0) * 0.35 * ltShade(P, N, V, albedo * 0.5, 0.6, 0.0, 1.0);
    float path = 1.0 / max(NoV, 0.12);                        // walls crossed at this angle, in wall thicknesses
    vec3 Tr = (1.0 - F) * pow(albedo, vec3(path)) * (1.0 - uGrey * 0.5);
    // premultiplied output, blended (One, 1 − α): result = col + behind · tl
    float tl = clamp(dot(Tr, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
    alpha = 1.0 - tl;
    col = refl;
    if (uMapK > 0.5) {
      // fake refraction: swap the straight-through backdrop for a normal-offset one (and tint it per channel);
      // where another glass layer lies in between, its contribution passes through unshifted
      vec4 c4 = projectionMatrix * viewMatrix * vec4(P, 1.0);
      vec2 suv = c4.xy / c4.w * 0.5 + 0.5;
      vec3 Nv = (viewMatrix * vec4(N, 0.0)).xyz;
      vec2 off = Nv.xy * uRefr * (uThick / 0.03) * path * 0.5;
      vec3 bgO = texture2D(uMap, suv - off).rgb * 0.5 + texture2D(uMap, suv - off * 1.15).rgb * 0.25 + texture2D(uMap, suv - off * 0.85).rgb * 0.25;
      vec3 bg0 = texture2D(uMap, suv).rgb;
      col += Tr * bgO - tl * bg0;
    }
    col *= uOpacity; alpha *= uOpacity;
  }
#else
  ${MAT_SHADE_LINE}
#endif
#ifdef M_COAT
  // p1v4 clear coat: a sharp second specular layer over the finish (every light mirrored crisply on a dark hero part)
  col += uMatCoat * ltShade(P, N, V, vec3(0.0), uMatCoatR, 0.0, ao);
#endif
#if defined(M_BRUSHED) || defined(M_STEEL)
  // p1v3 glints: sparse micro-facets of the grain (1 cell in ~70) tilted at random catch the key and the practicals as
  // pin-point sparkles that twinkle as the camera flies; filtered away once a cell is sub-pixel
  if (DT > 0.0) {
    vec2 gq = fuv * 220.0;
    float gpx = length(fwidth(gq));
    float ga = 1.0 - smoothstep(0.35, 0.9, gpx);
    vec2 gc = floor(gq);
    vec3 gh = hash33(vec3(gc, vSeed * 31.0 + fid));
    if (ga > 0.0 && gh.x > 0.986) {
      vec2 gf = fract(gq) - 0.5;
      float dot_ = 1.0 - smoothstep(0.18, 0.42, length(gf));
      // (certify p1v3: guarded — a face whose normal is parallel to the object's X axis made cross() = 0 → NaN glints
      // that bloomed into white blots with black dots, e.g. the pogo pins and every box's ±X faces up close)
      vec3 gt = normalize(vAx + vec3(1e-5)), gx = cross(N, gt);
      if (dot(gx, gx) < 1e-6) gx = cross(N, abs(N.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0));
      vec3 gb = normalize(gx);
      vec3 Ng = normalize(N + (gt * (gh.y - 0.5) + gb * (gh.z - 0.5)) * 0.7);
      vec3 gl = ltKey(P, Ng, V, vec3(0.92), 0.05, 1.0) * ltKeyVis(P) + ltSpots(P, Ng, V, vec3(0.92), 0.05, 1.0);
      col += gl * dot_ * ga * 0.5 * DT;
    }
  }
#endif
#ifdef M_GRANITE
  if (spk > 0.0) {
    // a mica grain: a tilted micro-mirror that catches the key
    vec3 hn = hash33(vec3(gid, 3.7)) - 0.5;
    vec3 Nt = normalize(N + vec3(hn.x, 0.0, hn.z) * 0.5);
    col += spk * (ltKey(P, Nt, V, vec3(0.0), 0.06, 0.0) * ltKeyVis(P) + ltSpots(P, Nt, V, vec3(0.0), 0.06, 0.0)) * 0.6;
  }
  // the planar reflection: only on the polished top (faces looking up), blurred through the mirror's mip chain
  // (wider with the roughness, smeared along the view like any rough mirror)
  float up = smoothstep(0.92, 0.985, N.y);
  if (uReflK > 0.0 && up > 0.0) {
    vec4 c4 = uMirrorVP * vec4(P, 1.0);
    vec2 ruv = c4.xy / c4.w * 0.5 + 0.5;
    ruv += vec2(N.x, N.z) * 0.006;                           // polish ripple from the micro-normal
    float r = uReflBlur * (1.0 + 0.6 * max(rough - 0.11, 0.0) / 0.11);
    float lod = log2(max(r, 1.0)) - 0.5;
    vec3 refl = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      float o = (float(i) - 2.0) / 2.0;
      refl += textureLod(uRefl, ruv + vec2(0.0, o * r * 1.6) * uTexel, lod).rgb * (1.0 - 0.15 * abs(o));
    }
    refl /= 4.4;
    float NoV = max(dot(N, V), 0.0);
    float fres = uReflK + (1.0 - uReflK) * pow(1.0 - NoV, 5.0);
    col += refl * fres * up;
  }
#endif
#ifdef M_PHOSPHOR
  {
    float tr = texture2D(uMap, vUv).r;
    vec2 tx = 1.0 / vec2(textureSize(uMap, 0));
    float halo = 0.0;
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; halo += texture2D(uMap, vUv + vec2(cos(a), sin(a)) * tx * 3.5).r; }
    halo /= 8.0;
    float g = (tr + 0.4 * halo) * uMapK;
    vec2 gq = vUv * vec2(10.0, 8.0);
    vec2 gw = fwidth(gq);
    vec2 gd = abs(fract(gq + 0.5) - 0.5) / max(gw, 1e-4);
    float grat = 1.0 - smoothstep(0.5, 1.5, min(gd.x, gd.y));
    vec2 ax = abs(vUv - 0.5) / max(fwidth(vUv), 1e-5);
    vec2 tk = abs(fract(vUv * vec2(50.0, 40.0) + 0.5) - 0.5) / max(fwidth(vUv * vec2(50.0, 40.0)), 1e-4);
    float ticks = (1.0 - smoothstep(0.5, 1.5, ax.y)) * (1.0 - smoothstep(0.5, 1.5, tk.x)) * step(abs(fract(vUv.y * 40.0 + 0.5) - 0.5) * 40.0, 1.0)
                + (1.0 - smoothstep(0.5, 1.5, ax.x)) * (1.0 - smoothstep(0.5, 1.5, tk.y));
    float off = 0.6 + 0.4 * smoothstep(0.7, 0.4, length(vUv - 0.5));
    emit += C_BONE * (min(g, 1.2) * 0.85 + (grat + 0.6 * clamp(ticks, 0.0, 1.0)) * 0.012 * off) * (1.0 - uGrey);
  }
#endif
#ifdef M_FACE
  float fm = 1.0;
#ifndef M_FACE_ALL
  fm = smoothstep(0.55, 0.9, nL.z);
#endif
  Sung s = sungAt(sungU(vL.x));
  vec3 fill = sungFill(s, SUNG_RAW);
  // lettering is self-lit (readable in any light) and still catches the scene's highlights
  vec3 hl = ltShade(P, N, V, vec3(0.0), 0.35, 0.0, 1.0);
  col = mix(col, fill + hl, fm * s.exist);
  col = mix(col, SUNG_PREVIEW, fm * s.preview * step(0.5, fract(vL.x * 8.0)));
#endif
  col += emit;
  gl_FragColor = vec4(ltFog(col, P), alpha);
}`;

/** A library material. Each call returns a NEW material (its own non-light uniforms; light uniforms are shared). */
export function mat(name: MatName, o: MatOpts = {}): THREE.ShaderMaterial {
  const d = MAT_DEFAULTS[name];
  const defines: Record<string, string> = { [d.define]: '' };
  if (o.ao) defines.USE_AO_ATTR = '';
  if (o.face) defines.M_FACE = '';
  if (o.face && o.faceAll) defines.M_FACE_ALL = '';
  if ((o.coat ?? 0) > 0 && name !== 'glass') defines.M_COAT = '';
  const uniforms: Record<string, THREE.IUniform> = {
    ...LIGHT_UNIFORMS,
    uBase: { value: new THREE.Vector3(...(o.base ?? d.base)) },
    uRough: { value: o.rough ?? d.rough },
    uMetal: { value: o.metal ?? d.metal },
    uEmit: { value: new THREE.Vector3(...(o.emit ?? [0, 0, 0])) },
    uEmitK: { value: o.emitK ?? 0 },
    uGrey: { value: 0 },
    uAOk: { value: o.ao ? 1 : 0 },
    uOpacity: { value: 1 },
    uScale: { value: o.scale ?? d.scale ?? 1 },
    uDetail: { value: o.detail ?? 1 },
    uWear: { value: o.wear ?? 1 },
    uMatCoat: { value: o.coat ?? 0 },
    uHue: { value: (o.hue ?? name === 'glass') ? 1 : 0 },
    uMatCoatR: { value: o.coatR ?? 0.07 },
    ...(o.face ? sungUniforms() : {}),
  };
  if (name === 'granite') {
    uniforms.uRefl = { value: o.mirror?.rt.texture ?? null };
    uniforms.uMirrorVP = { value: o.mirror ? (o.mirror.mat.uniforms.uMirrorVP!.value as THREE.Matrix4) : new THREE.Matrix4() };
    uniforms.uReflK = { value: o.mirror ? GRANITE_MIRROR.strength : 0 };
    // blur is specified in half-res texels; keep the same on-screen width at any mirror resolution
    uniforms.uReflBlur = { value: GRANITE_MIRROR.blur * ((o.mirror?.res ?? 0.5) / 0.5) };
    uniforms.uTexel = { value: o.mirror ? o.mirror.texel : new THREE.Vector2(2 / W, 2 / H) };
  }
  if (name === 'glass' || name === 'phosphor' || name === 'pcb') { uniforms.uMap = { value: o.map ?? null }; uniforms.uMapK = { value: o.map ? (name === 'phosphor' ? 1 : 1) : 0 }; }
  if (name === 'glass') { uniforms.uThick = { value: o.thickness ?? 0.03 }; uniforms.uRefr = { value: 0.018 }; }
  const m = new THREE.ShaderMaterial({
    vertexShader: LIT_VERT,
    fragmentShader: `${GLSL_COMMON}\n${LIGHT_GLSL}\n${MAT_GLSL}\n${name === 'pcb' ? PCB_GLSL : ''}\n${o.face ? SUNG_GLSL : ''}\n${FRAG}`,
    uniforms, defines,
    side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? name === 'glass',
    depthWrite: name !== 'glass',
    premultipliedAlpha: name === 'glass',
  });
  m.name = name;
  m.userData.mat = name;
  return m;
}

export const anodInk = (o?: MatOpts) => mat('anodInk', o);
/** p1v4: the hero finish (MAT_PRESETS.hero): dark glossy anodised ink — light it with a grazing keyPool, no front fill */
export const heroInk = (o?: MatOpts) => mat('anodInk', { ...MAT_PRESETS.hero, ...o });
export const brushedAsh = (o?: MatOpts) => mat('brushedAsh', o);
export const castConcrete = (o?: MatOpts) => mat('castConcrete', o);
export const granite = (o?: MatOpts) => mat('granite', o);
export const pcb = (o?: MatOpts) => mat('pcb', o);
export const ceramic = (o?: MatOpts) => mat('ceramic', o);
export const steelGraphite = (o?: MatOpts) => mat('steelGraphite', o);
export const glass = (o?: MatOpts) => mat('glass', o);
export const phosphor = (o?: MatOpts) => mat('phosphor', o);
export const led = (o?: MatOpts) => mat('led', o);

/** Deprecate a library material toward graphite (0 live … 1 graphite). */
export function setGrey(m: THREE.Material, k: number) {
  const u = (m as THREE.ShaderMaterial).uniforms?.uGrey;
  if (u) u.value = k;
}

/**
 * The opaque pass behind the glass, for its fake refraction: render opaques into `rt`, capture, then draw the glass
 * (material uMap = backdrop.texture, uMapK = 1) into the same `rt`. One per plate; the copy is a single fullscreen pass.
 */
export class Backdrop {
  rt: THREE.WebGLRenderTarget;
  /** res: fraction of the frame (default 0.5: the glass only ever shows it offset and softened) */
  constructor(res = 0.5) { this.rt = makeRT(W * res, H * res, { depthBuffer: false }); }
  private copy = new FSPass(/* glsl */ `uniform sampler2D src; void main() { fragColor = texture(src, vUv); }`, { src: { value: null } });
  get texture() { return this.rt.texture; }
  capture(renderer: THREE.WebGLRenderer, src: THREE.WebGLRenderTarget) {
    this.copy.u.src!.value = src.texture;
    this.copy.render(renderer, this.rt);
  }
  /** point a glass material at this backdrop */
  bind(m: THREE.ShaderMaterial) { if (m.uniforms.uMap) { m.uniforms.uMap.value = this.rt.texture; m.uniforms.uMapK!.value = 1; } return m; }
  dispose() { this.rt.dispose(); this.copy.mat.dispose(); }
}

/** Colour role → default library material (Blender material named by role only). */
export const ROLE_MAT: Record<string, MatName> = {
  ink: 'anodInk', ink2: 'anodInk', graphite: 'steelGraphite', ash: 'brushedAsh', bone: 'ceramic', glass: 'glass',
};

/**
 * Library material for a Blender material name: '<role>' or '<role>_<MatName>' (e.g. 'ink2_pcb', 'bone_ceramic',
 * 'graphite_castConcrete'); a trailing '_face' makes it a lyric face. 'signal…' / 'lamp…' are the SOTA lamp core:
 * built by _lamp.ts (magenta only through the lamp), here they get a dark glass stand-in.
 */
export function matForName(name: string, o: MatOpts = {}): THREE.ShaderMaterial {
  const parts = name.split(/[_.]/);
  const role = (parts[0] ?? '').toLowerCase();
  const named = parts.find((p) => (MAT_NAMES as readonly string[]).includes(p)) as MatName | undefined;
  const face = parts.includes('face');
  if (role === 'signal' || role === 'lamp') return mat('glass', o);
  return mat(named ?? ROLE_MAT[role] ?? 'anodInk', { ...o, face: o.face ?? face });
}

const restyleCache = new Map<string, THREE.ShaderMaterial>();
/** `loadGLTF(url, { restyle: gltfRestyle })`: library materials by Blender name, cached per (name, AO). Faces are never cached. */
export function gltfRestyle(mesh: THREE.Mesh, srcName: string): THREE.Material {
  const ao = !!mesh.geometry.getAttribute('color');
  const key = `${srcName}|${ao}`;
  if (/(^|_)face($|_)/.test(srcName)) return matForName(srcName, { ao });
  let m = restyleCache.get(key);
  if (!m) { m = matForName(srcName, { ao }); restyleCache.set(key, m); }
  return m;
}
