// Look development shared by the 3D plates: the leaderboard slab material, a mirror floor and a
// depth-of-field pass. (The engine's own post adds bloom, halation, streaks, grain on top.) Owner: lookdev.
// v2 (THE SHAFT): the material library is _mat.ts and the lighting _light.ts; this file keeps slabMaterial
// (gains SlabOpts), Mirror, Dof, plus GRANITE_MIRROR and dofCoc. tower.ts must keep compiling and rendering.
//
//  - slabMaterial: ceramic slabs for instanced boxes: panel seams, a groove along the top front edge, a lit
//    bevelled lip, contact darkening. The shader always includes the _light chunk.
//      v2 (`lit: true`): bone technical ceramic lit by the scene's LightRig (key + shadows, strips, the lamp's sig,
//        fog); instanceColor.x = the panel's own bone backlight (0..1, ≤ 0.5 linear), .y = a kick pulse on it.
//        p1v4: the ceramic and its backlight are the neutral warm-white SURF.bone (the violet bone was the purple cast).
//        No magenta in the material at all: magenta on a slab is only ever the sig light falling on it.
//      v1 (default, tower.ts): the fixed key, a black slab whose instanceColor.x lights the front as a signal light
//        box. v2 defaults: spill 0.35 → 0.12, the magenta rim removed (`rim: true` restores it).
//  - Mirror: renders the scene from the camera reflected in a horizontal plane into a half-res target (oblique
//    near plane = the mirror plane, so nothing below it shows; follows the camera's lens shift); the v1 floor
//    material reads it back (blurred, fresnel-weighted); `_mat.granite({ mirror })` reads it too.
//  - Dof: the plate renders into its colour+depth target; resolve() blurs by circle of confusion into `out`.
import * as THREE from 'three';
import { FSPass, makeRT, W, H } from '../engine/gl';
import { LIN } from '../engine/palette';
import { GLSL_COMMON } from '../engine/glsl/common';
import { LIGHT_GLSL, LIGHT_UNIFORMS, SURF, type RGB } from './_light';

const v3 = (c: readonly number[], s = 1) => new THREE.Vector3(c[0]! * s, c[1]! * s, c[2]! * s);

// ---------------------------------------------------------------- slab material
const SLAB_VERT = /* glsl */ `
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying vec3 vNw; varying vec3 vC;
void main() {
  vP = position; vN = normal;
  mat4 im = mat4(1.0);
  #ifdef USE_INSTANCING
  im = instanceMatrix;
  #endif
  vec4 wp = modelMatrix * im * vec4(position, 1.0);
  vW = wp.xyz;
  vNw = normalize(mat3(modelMatrix * im) * normal);
  vC = vec3(0.0);
  #ifdef USE_INSTANCING_COLOR
  vC = instanceColor;
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SLAB_FRAG = /* glsl */ `
// (uFogCol comes from LIGHT_GLSL: the rig's fog in the lit path, the slab's own ink in the v1 path)
uniform vec3 uHalf; uniform vec3 uLight; uniform float uFogNear; uniform float uFogFar;
uniform vec3 uSig; uniform vec3 uBase; uniform float uSotaY; uniform float uSpill; uniform float uClipY; uniform float uRough;
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying vec3 vNw; varying vec3 vC;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  if (vW.y < uClipY) discard;
  vec3 N = normalize(vNw), V = normalize(cameraPosition - vW), L = normalize(uLight);
  float sota = vC.x, pulse = vC.y;
  float front = step(0.5, vN.z), top = step(0.5, vN.y), bottom = step(0.5, -vN.y), side = step(0.5, abs(vN.x)), back = step(0.5, -vN.z);
  // ceramic: a faint speckle, panel seams on the front, a groove along the top front edge
  float speck = h21(floor(vP.xy * 90.0) + floor(vP.z * 90.0)) * 0.06;
  vec3 albedo = uBase * (0.94 + speck);
#ifdef SLAB_LIT
  albedo = ltNeutral(albedo);   // p1v4: the lit slab's ceramic is neutral whatever base the plate passes (§13.4)
#endif
  float seamX = abs(fract(vP.x / 2.4 + 0.5) - 0.5) * 2.4;
  float seam = (1.0 - smoothstep(0.012, 0.03, seamX)) * front;
  float groove = (1.0 - smoothstep(0.01, 0.025, abs(vP.y - uHalf.y + 0.12))) * front;
  float lip = (1.0 - smoothstep(0.0, 0.05, uHalf.z - vP.z)) * top;  // bevelled lip catches the light
#ifdef SLAB_LIT
  {
    // v2: bone ceramic lit by the scene's LightRig; the seams and groove are real recesses (cavity + bent normal)
    float sx = sign(fract(vP.x / 2.4 + 0.5) - 0.5);
    vec3 Nb = normalize(N + vec3(sx, 0.0, 0.0) * seam * 0.6 + vec3(0.0, sign(vP.y - uHalf.y + 0.12), 0.0) * groove * 0.6);
    float cav = 1.0 - 0.8 * max(seam, groove);
    float contact = mix(0.45, 1.0, smoothstep(-uHalf.y, -uHalf.y + 0.4, vP.y) + top);
    float ao = cav * contact;
    LT_WRAP = 0.3;
    vec3 c = ltShade(vW, Nb, V, albedo, uRough - 0.15 * lip, 0.0, ao);
    // the panel's own bone backlight: the front field glows through the ceramic (no magenta here, ever)
    vec2 q = vP.xy / uHalf.xy;
    float inside = (1.0 - smoothstep(0.96, 0.985, abs(q.x))) * (1.0 - smoothstep(0.8, 0.86, abs(q.y)));
    c += S_BONE * 0.5 / S_BONE.r * front * inside * sota * (0.85 + 0.15 * pulse) * (0.92 + 0.08 * smoothstep(-1.0, 1.0, q.y)) * cav;
    gl_FragColor = vec4(ltFog(c, vW), 1.0);
    return;
  }
#endif
  float ndl = max(dot(N, L), 0.0), wrap = max(dot(N, L) * 0.5 + 0.5, 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 48.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 col = albedo * (0.16 + 0.75 * ndl + 0.18 * wrap) + vec3(0.85, 0.82, 0.92) * spec * 0.22 + vec3(0.6, 0.6, 0.75) * fres * 0.06;
  col += vec3(0.7) * lip * 0.18;
  col *= 1.0 - 0.75 * max(seam, groove);
  // contact darkening near the bottom of each face
  col *= mix(0.55, 1.0, smoothstep(-uHalf.y, -uHalf.y + 0.45, vP.y) + top);
  // the reigning #1: the front is a light box (scanlines, a brighter border), the other faces glow at the rim
  if (sota > 0.001) {
    vec2 q = vP.xy / uHalf.xy;
    float inside = (1.0 - smoothstep(0.975, 0.99, abs(q.x))) * (1.0 - smoothstep(0.86, 0.9, abs(q.y)));
    float border = (1.0 - inside) * front;
    float scan = 0.9 + 0.1 * sin(vP.y * 90.0);
    vec3 em = uSig * (0.85 + 0.5 * pulse) * scan * (0.9 + 0.1 * smoothstep(-1.0, 1.0, q.y));
    col = mix(col, em, front * inside * sota);
    col += uSig * 1.8 * border * sota;
#ifdef SLAB_RIM
    float rim = 1.0 - smoothstep(0.0, 0.25, uHalf.z - abs(vP.z));
    col += uSig * sota * (0.12 + 0.25 * rim) * (top + bottom + side);
#endif
  }
  // light spilled by the lit slab onto its neighbours
  float dy = vW.y - uSotaY;
  col += uSig * uSpill * (1.0 - sota) * exp(-abs(dy) * 0.9) * (0.25 + 0.75 * (top * step(dy, 0.0) + bottom * step(0.0, dy))) * (1.0 - back);
  float d = length(vW - cameraPosition);
  col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar, d));
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * v2 options (TREATMENT §2.3 / D.4), all optional:
 *  - lit: light the slab with the scene's LightRig (_light: key + occluder shadows, strips, the lamp's sig, fog) as bone
 *    technical ceramic; instanceColor.x = bone backlight of the front panel. Call rig.apply() before drawing.
 *  - spill: v1 path only: magenta spill onto neighbouring slabs (default 0.12, was 0.35). In the lit path the spill IS
 *    the sig light, so set rig.sig on the holder's lamp instead.
 *  - rim: v1 path only: the magenta rim on the reigning slab (default false: magenta lives only in the lamp)
 *  - base: albedo (linear); default ink2×2 (v1 black) or bone×0.82 (lit)
 *  - rough: lit path roughness (default 0.5)
 */
export interface SlabOpts { lit?: boolean; spill?: number; rim?: boolean; base?: RGB; rough?: number }

export function slabMaterial(half: THREE.Vector3, o: SlabOpts = {}) {
  const defines: Record<string, string> = {};
  if (o.lit) defines.SLAB_LIT = '';
  if (o.rim) defines.SLAB_RIM = '';
  return new THREE.ShaderMaterial({
    vertexShader: SLAB_VERT, fragmentShader: `${GLSL_COMMON}\n${LIGHT_GLSL}\n${SLAB_FRAG}`, defines,
    uniforms: {
      ...LIGHT_UNIFORMS,
      uHalf: { value: half }, uLight: { value: new THREE.Vector3(-0.5, 0.8, 0.55).normalize() },
      ...(o.lit ? {} : { uFogCol: { value: v3(LIN.ink) } }), uFogNear: { value: 20 }, uFogFar: { value: 90 },
      uSig: { value: v3(LIN.signal, 1.25) }, uBase: { value: o.base ? v3(o.base) : o.lit ? v3(SURF.bone, 0.82) : v3(LIN.ink2, 2.0) },
      uSotaY: { value: 0 }, uSpill: { value: o.spill ?? 0.12 }, uClipY: { value: -1e9 }, uRough: { value: o.rough ?? 0.5 },
    },
  });
}

/** Planar-reflection settings for the granite metrology table (§2.1: strength 0.10–0.14, rough blur; p1v3 brighter world: 0.15). */
export const GRANITE_MIRROR = { strength: 0.12, blur: 3.0 } as const;   // p1v3: blur 3.5 → 3.0 (sharper lights in the polish; 0.15 strength smeared the lamp core + its bone ring into pink)

/**
 * CPU twin of the Dof shader's circle of confusion, in logical px (lyricqa §7.4.4 checks the sung word < 1.5 px).
 * z, focus in world units along the view; aperture and maxR as passed to Dof.resolve.
 */
export function dofCoc(z: number, focus: number, aperture: number, maxR = 14): number {
  return Math.min(1, Math.max(0, aperture * Math.abs(1 / focus - 1 / z) * focus)) * maxR;
}

// ---------------------------------------------------------------- mirror floor
const FLOOR_VERT = /* glsl */ `
varying vec3 vW;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const FLOOR_FRAG = /* glsl */ `
uniform sampler2D uRefl; uniform mat4 uMirrorVP; uniform vec2 uTexel; uniform float uStrength; uniform float uBlur;
uniform vec3 uBase; uniform vec3 uFogCol; uniform float uFogNear; uniform float uFogFar;
varying vec3 vW;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec4 c = uMirrorVP * vec4(vW, 1.0);
  vec2 uv = c.xy / c.w * 0.5 + 0.5;
  // rough mirror: a small rotated-grid blur, wider with distance
  float d = length(vW - cameraPosition);
  float r = uBlur * (1.0 + d * 0.04);
  vec3 refl = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.39996, rr = sqrt((float(i) + 0.5) / 12.0) * r;
    vec2 o = vec2(cos(a), sin(a)) * rr * uTexel;
    o.y *= 2.2; // stretched along the view (wet-floor smear)
    refl += texture2D(uRefl, uv + o).rgb;
    wsum += 1.0;
  }
  refl /= wsum;
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.18 + 0.82 * pow(1.0 - max(V.y, 0.0), 5.0);
  float grain = h21(floor(vW.xz * 40.0)) * 0.03;
  vec3 col = uBase * (0.9 + grain) + refl * uStrength * fres;
  col = mix(col, uFogCol, smoothstep(uFogNear, uFogFar, d));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Mirror {
  /** mipmapped (granite blurs through the mip chain; three regenerates mips after each render into it) */
  rt: THREE.WebGLRenderTarget;
  cam = new THREE.PerspectiveCamera();
  mat: THREE.ShaderMaterial;
  /** uv size of one texel of `rt` (the granite's blur unit) */
  texel: THREE.Vector2;
  /** fraction of the logical frame the reflection is rendered at (default 0.5; 0.25 is plenty under rough granite) */
  res: number;
  constructor(public y: number, o: { res?: number } = {}) {
    this.res = o.res ?? 0.5;
    this.rt = makeRT(W * this.res, H * this.res, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.texel = new THREE.Vector2(1 / this.rt.width, 1 / this.rt.height);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG,
      uniforms: {
        uRefl: { value: this.rt.texture }, uMirrorVP: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2(1 / (W * this.res), 1 / (H * this.res)) },
        uStrength: { value: 0.85 }, uBlur: { value: 2.5 }, uBase: { value: v3(LIN.ink, 0.6) },
        uFogCol: { value: v3(LIN.ink) }, uFogNear: { value: 20 }, uFogFar: { value: 90 },
      },
    });
  }
  /** clip offset above the plane (m): nothing closer to the plane than this shows in the reflection */
  clipBias = 0.002;
  /**
   * Mirror `src` in the plane; call before rendering into `rt`. The mirror camera's near plane is the mirror plane
   * (Lengyel's oblique clipping), so geometry below the plane never shows in the reflection, and it carries the
   * source's lens shift (mirrored horizontally, as the reflected image is).
   */
  update(src: THREE.PerspectiveCamera) {
    const c = this.cam;
    c.fov = src.fov; c.aspect = src.aspect; c.near = src.near; c.far = src.far;
    src.updateMatrixWorld();
    const fwd = new THREE.Vector3(); src.getWorldDirection(fwd);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(src.getWorldQuaternion(new THREE.Quaternion()));
    const sp = new THREE.Vector3().setFromMatrixPosition(src.matrixWorld);
    c.position.set(sp.x, 2 * this.y - sp.y, sp.z);
    c.up.set(up.x, -up.y, up.z);
    c.lookAt(c.position.clone().add(new THREE.Vector3(fwd.x, -fwd.y, fwd.z)));
    const v = src.view;
    if (v && v.enabled) c.setViewOffset(v.fullWidth, v.fullHeight, v.fullWidth - v.offsetX - v.width, v.offsetY, v.width, v.height);
    else c.clearViewOffset();
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    // oblique near plane = the mirror plane (keep y > plane)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.y + this.clipBias)).applyMatrix4(c.matrixWorldInverse);
    const C = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = c.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(C.x) + e[8]!) / e[0]!, (Math.sign(C.y) + e[9]!) / e[5]!, -1, (1 + e[10]!) / e[14]!);
    C.multiplyScalar(2 / C.dot(q));
    e[2] = C.x; e[6] = C.y; e[10] = C.z + 1; e[14] = C.w;
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    (this.mat.uniforms.uMirrorVP!.value as THREE.Matrix4).multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  }
}

// ---------------------------------------------------------------- depth of field
/**
 * Depth of field by circle of confusion (logical px). The plate renders into `rt` (colour + depth); resolve():
 *   1. down:   full → half res: colour (2×2 box) + signed CoC s = aperture·(1 − focus/z)·maxR of the nearest depth
 *              (s < 0 in front of the focus; s is monotonic in z, so "in front of" is just s < s0)
 *   2. gather: half res, golden-angle spiral of `taps` samples; a sample counts if its own blur reaches here and, for
 *              background samples, only up to this pixel's blur (sharp edges never bleed into the background);
 *              alpha = how blurred the result is (own CoC, or the share of a blurred foreground spilling over it)
 *   3. comp:   full res: the sharp pixel where the CoC is under ~1.2 px, the half-res blur from ~2.6 px (bilinear), plus an
 *              optional additive texture (e.g. LightVolume's beam) in the same pass.
 * ~6× fewer texture fetches than a full-res gather; in-focus detail stays full resolution.
 */
export class Dof {
  rt: THREE.WebGLRenderTarget;
  /** the gather pass (kept as `pass` for v1 callers) */
  pass: FSPass;
  half = makeRT(W / 2, H / 2, { depthBuffer: false });
  blur = makeRT(W / 2, H / 2, { depthBuffer: false });
  down: FSPass;
  comp: FSPass;
  private static BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  /** taps: gather samples at half resolution (40 = the original count) */
  constructor(taps = 40) {
    this.rt = makeRT(W, H);
    this.rt.depthTexture = new THREE.DepthTexture(this.rt.width, this.rt.height, THREE.FloatType);
    Dof.BLACK.needsUpdate = true;
    const common = /* glsl */ `
      uniform float near; uniform float far; uniform float focus; uniform float aperture; uniform float maxR; uniform vec2 texel;
      float lin(float d) { return near * far / (far - d * (far - near)); }
      float scoc(float z) { return clamp(aperture * (1.0 - focus / z), -1.0, 1.0) * maxR; }`;
    const u = () => ({
      near: { value: 0.1 }, far: { value: 600 }, focus: { value: 20 }, aperture: { value: 0.8 }, maxR: { value: 14 },
      texel: { value: new THREE.Vector2(1 / W, 1 / H) },
    });
    this.down = new FSPass(/* glsl */ `${common}
      uniform sampler2D col; uniform sampler2D dep;
      void main() {
        vec2 o = texel * 0.5;
        vec2 a = vUv + vec2(-o.x, -o.y), b = vUv + vec2(o.x, -o.y), c = vUv + vec2(-o.x, o.y), d = vUv + vec2(o.x, o.y);
        vec3 rgb = (texture(col, a).rgb + texture(col, b).rgb + texture(col, c).rgb + texture(col, d).rgb) * 0.25;
        float z = min(min(texture(dep, a).r, texture(dep, b).r), min(texture(dep, c).r, texture(dep, d).r));
        fragColor = vec4(rgb, scoc(lin(z)));
      }`, { ...u(), col: { value: this.rt.texture }, dep: { value: this.rt.depthTexture } });
    this.pass = new FSPass(/* glsl */ `${common}
      uniform sampler2D src;
      void main() {
        vec4 m = texture(src, vUv);
        float s0 = m.a, c0 = abs(s0);
        vec3 acc = m.rgb; float wsum = 1.0, fg = 0.0;
        for (int i = 1; i < ${taps}; i++) {
          float fi = float(i);
          float r = sqrt(fi / ${taps}.0) * maxR;
          float a = fi * 2.39996;
          vec4 q = texture(src, vUv + vec2(cos(a), sin(a)) * r * texel);
          float c = abs(q.a);
          bool front = q.a < s0;
          float w = smoothstep(r - 1.0, r + 1.0, front ? c : min(c, c0));
          acc += q.rgb * w; wsum += w;
          if (front && c > c0 + 1.0) fg += w;
        }
        fragColor = vec4(acc / wsum, max(c0, fg / wsum * 2.0 * maxR));
      }`, { ...u(), src: { value: this.half.texture } });
    this.comp = new FSPass(/* glsl */ `${common}
      uniform sampler2D col; uniform sampler2D dep; uniform sampler2D blurT; uniform sampler2D addT; uniform float addK;
      void main() {
        vec3 sharp = texture(col, vUv).rgb;
        float c0 = abs(scoc(lin(texture(dep, vUv).r)));
        vec4 b = texture(blurT, vUv);
        // CoC < ~1.2 px stays full-res sharp (lyricqa's legibility limit is 1.5 px); the half-res blur takes over by 2.6 px
        float k = smoothstep(1.2, 2.6, max(c0, b.a));
        vec3 o = mix(sharp, b.rgb, k);
        if (addK > 0.0) o += texture(addT, vUv).rgb * addK;
        fragColor = vec4(o, 1.0);
      }`, { ...u(), col: { value: this.rt.texture }, dep: { value: this.rt.depthTexture }, blurT: { value: this.blur.texture }, addT: { value: Dof.BLACK }, addK: { value: 0 } });
  }
  /**
   * Blur `rt` by depth into `out`. focus: distance (world units) in focus; aperture 0..~2; maxR in logical px.
   * `add`: an optional texture added on top (unblurred), e.g. LightVolume.rt.texture, × `addK` (default 1).
   */
  resolve(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, cam: THREE.PerspectiveCamera, focus: number, aperture: number, maxR = 14, add?: THREE.Texture | null, addK = 1) {
    for (const p of [this.down, this.pass, this.comp]) {
      const u = p.u;
      u.near!.value = cam.near; u.far!.value = cam.far; u.focus!.value = focus; u.aperture!.value = aperture; u.maxR!.value = maxR;
    }
    this.comp.u.addT!.value = add ?? Dof.BLACK;
    this.comp.u.addK!.value = add ? addK : 0;
    this.down.render(renderer, this.half);
    this.pass.render(renderer, this.blur);
    this.comp.render(renderer, out);
  }
}
