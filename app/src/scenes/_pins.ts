// Pin bed (TREATMENT §7.1 F5): pin-art relief, instanced, animated on the GPU. Owner: fab.
// Steel pins with ceramic-bone tips in a black anodised block drilled on a square grid. A word is pushed up as a
// height field: the pins of a letter rise (spring with a small overshoot) when the cursor reaches their column, and
// their tips light bone (raw pins sit flush, dark: the word does not exist before it is sung). After word.end the same
// bed can morph into other content: setTarget() + morph wave (chorus1: the 96 learned conv1 filters, 16th-note waves
// from noise to the trained weights — loadConv1() reads app/public/filters/conv1.png, the real filters).
// p1v4 (KITS §23): the word's pins are flush and dark until reached (unreadable); after the line its tips drop to the
// v4 ash and the pins sink back flush (old 'fade' / 'retract', default) — 'ash' keeps the relief; isolation dims the
// tips and lowers the relief (heroIsolate). (The four shading lines of PIN_FRAG — steel, tipRaw, tipLit, col — are
// patched by exact string in stack_c4.conv1Tips: keep them verbatim.)
//
//   const bed = new PinBed({ nx: 160, ny: 40, pitch: 0.06, pinD: 0.045, maxH: 0.25 });
//   bed.setHeights((ix, iy) => mask[iy * 160 + ix] * k);        // static heights 0..1 of maxH
//   const c1 = await loadConv1();  bed.setTarget((ix, iy) => c1.at(ix, iy), (ix, iy) => delay);  bed.morphAt(t0);
//   const f = pinWord({ scene, word, method: 'F5', capH: 0.6, parent });   // a registered carrier (+ f.bed)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLSL_COMMON } from '../engine/glsl/common';
import { F, font, layout } from '../engine/type';
import { LIN } from '../engine/palette';
import { fabText, lyricReg, sungState, setSungUniforms, sungUniforms, SUNG_GLSL, SUNG_T, type SungState } from '../engine/lyricreg';
import { LIGHT_GLSL, LIGHT_UNIFORMS, LIT_VERT } from './_light';
import { MAT_GLSL } from './_mat';
import { registerFab, resolveCap, letterCursor, cursorTime, capRatio, bevelBox, capScrew, fabUniforms, setFabLook, FAB_GLSL, fabV4, fabIsoTarget, type Fab, type FabOpts, type OldMode } from './_fab';
import { mat } from './_mat';

export interface PinBedOpts {
  nx: number; ny: number;
  /** pin spacing (m) */ pitch: number;
  pinD: number;
  /** full travel (m) */ maxH: number;
  /** build the drilled block around the pins (default true) */
  block?: boolean;
}

const PIN_VERT = () => LIT_VERT.replace('void main() {', /* glsl */ `
attribute vec4 aPin;   // ix, iy, static height 0..1, word mask 0..1
attribute vec4 aPin2;  // reach time (s), target height 0..1, morph delay (s), seed
uniform float uT; uniform float uMaxH; uniform float uLen; uniform float uWordK; uniform float uMorph; uniform float uMorphT0; uniform float uPitch;
uniform float uSink;   // (p1v4) 0..1 the word's relief sinks back flush (old fade / retract, isolation)
varying vec4 vPin;     // tip-ness, height 0..1, mask, column x (m)
float pinRise(float k) { return k <= 0.0 ? 0.0 : 1.0 - exp(-k / 0.05) * cos(k * 6.2831853 * 3.6); }
float pinHeight() {
  float hw = aPin.w * pinRise(uT - aPin2.x) * (1.0 - uSink);
  float h = mix(aPin.z, hw, uWordK);
  if (uMorph > 0.0) {
    float k = uT - uMorphT0 - aPin2.z;
    float noise = 0.5 + 0.45 * sin(aPin2.w * 40.0 + uT * 7.0) * sin(aPin2.w * 17.0 + uT * 3.1);
    float to = mix(noise, aPin2.y, clamp(pinRise(k - 0.06), 0.0, 1.06));
    h = mix(h, to, clamp((uT - uMorphT0 + 0.2) / 0.2, 0.0, 1.0) * uMorph);
  }
  return h;
}
void main() {`).replace('vec3 transformed = vec3(position);', /* glsl */ `vec3 transformed = vec3(position);
  float ph = pinHeight();
  transformed.z += ph * uMaxH;
  vPin = vec4(smoothstep(-0.25, 0.4, position.z / max(uLen, 1e-6) * 6.0 + 0.4), ph, aPin.w, aPin.x * uPitch);`);

const PIN_FRAG = () => /* glsl */ `
${GLSL_COMMON}
${LIGHT_GLSL}
${SUNG_GLSL}
${FAB_GLSL()}
uniform float uWordK; uniform float uLit; uniform float uRawK;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec2 vUv; varying float vAO; varying vec3 vIC;
varying vec4 vPin;
void main() {
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float tip = vPin.x;
  Sung s = sungAt(sungU(vPin.w));
  float up = smoothstep(0.04, 0.35, vPin.y);
  float glyph = mix(up, vPin.z * up, uWordK);
  vec3 fill = fabFill(s, SUNG_RAW) * uLit * mix(1.0, fabExist(s), uWordK);
  vec3 steel = ltShade(vW, N, V, C_GRAPHITE * 1.5, 0.28, 1.0, 1.0);
  vec3 tipRaw = ltShade(vW, N, V, C_GRAPHITE * 0.5, 0.35, 0.6, 1.0);
  // (p1v4) a word's own bed: the flush idle tips go dark so the grid of tips never reads as a word before it is made
  tipRaw *= uRawK; steel *= mix(1.0, uRawK, 0.6);
  vec3 tipLit = fill + ltShade(vW, N, V, vec3(0.0), 0.25, 0.0, 1.0) * 0.5;
  vec3 col = mix(steel, mix(tipRaw, tipLit, glyph), tip);
  gl_FragColor = vec4(ltFog(col, vW), 1.0);
}`;

const BLOCK_FRAG = /* glsl */ `
${GLSL_COMMON}
${LIGHT_GLSL}
${MAT_GLSL}
uniform float uPitch; uniform float uHole; uniform vec4 uGrid;   // grid origin x, y, nx, ny
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec2 vUv; varying float vAO; varying vec3 vIC;
void main() {
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  vec3 nL = normalize(vLN);
  vec2 g = (vL.xy - uGrid.xy) / uPitch;
  vec2 c = clamp(floor(g + 0.5), vec2(0.0), uGrid.zw - 1.0);
  float d = length(g - c) * uPitch - uHole;
  float aa = max(fwidth(d), 1e-6);
  float front = smoothstep(0.8, 0.95, nL.z);
  float hole = (1.0 - smoothstep(-aa, aa, d)) * front;
  float lip = (1.0 - smoothstep(0.0, uHole * 0.35, d)) * (1.0 - hole) * front;
  float sm = vfbm(vL.xy * 3.0);
  vec3 base = vec3(0.0072, 0.0072, 0.0076) * (2.0 + 0.3 * sm);
  vec3 col = ltShade(vW, N, V, base, 0.36 - 0.12 * lip, 0.0, 1.0 - 0.5 * lip);
  col = mix(col, C_INK * 0.15, hole);
  gl_FragColor = vec4(ltFog(col, vW), 1.0);
}`;

/** Local frame: bed in XY (x right, y up), pins push out along +Z (toward the viewer). Origin at the bed's lower-left pin. */
export class PinBed {
  obj = new THREE.Group();
  mesh: THREE.InstancedMesh;
  heights: Float32Array;
  mat: THREE.ShaderMaterial;
  private aPin: THREE.InstancedBufferAttribute;
  private aPin2: THREE.InstancedBufferAttribute;
  constructor(public o: PinBedOpts) {
    const n = o.nx * o.ny, r = o.pinD / 2, L = o.maxH * 1.25 + r;
    this.heights = new Float32Array(n);
    // a pin: a shaft (back to −L) with a rounded tip whose apex sits at z = 0.25 r when flush
    const shaft = new THREE.CylinderGeometry(r, r, L, 10, 1, true); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -L / 2);
    const tip = new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); tip.rotateX(Math.PI / 2); tip.scale(1, 1, 0.55);
    for (const g of [shaft, tip]) { g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2)); }
    const geo = mergeGeometries([shaft.toNonIndexed(), tip.toNonIndexed()])!;
    geo.translate(0, 0, -r * 0.3);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PIN_VERT(), fragmentShader: PIN_FRAG(),
      uniforms: {
        ...LIGHT_UNIFORMS, ...sungUniforms(), ...fabUniforms(),
        uT: { value: 0 }, uMaxH: { value: o.maxH }, uLen: { value: r }, uWordK: { value: 0 }, uMorph: { value: 0 }, uMorphT0: { value: 0 }, uPitch: { value: o.pitch }, uLit: { value: 1 },
        uSink: { value: 0 },
        uRawK: { value: 1 },
      },
    });
    this.mat.name = 'pins';
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.aPin = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.aPin2 = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute('aPin', this.aPin); geo.setAttribute('aPin2', this.aPin2);
    const m = new THREE.Matrix4();
    for (let iy = 0; iy < o.ny; iy++) for (let ix = 0; ix < o.nx; ix++) {
      const i = iy * o.nx + ix;
      this.mesh.setMatrixAt(i, m.makeTranslation(ix * o.pitch, iy * o.pitch, 0));
      this.aPin.setXYZW(i, ix, iy, 0, 0);
      const h = Math.sin((ix + 1) * 12.9898 + (iy + 1) * 78.233) * 43758.5453;
      this.aPin2.setXYZW(i, 1e9, 0, 0, h - Math.floor(h));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.frustumCulled = false;
    this.obj.add(this.mesh);
    if (o.block !== false) {
      const mg = o.pitch * 1.6, W = (o.nx - 1) * o.pitch + 2 * mg, H = (o.ny - 1) * o.pitch + 2 * mg, T = Math.max(o.maxH * 1.4, o.pitch * 3);
      const bm = new THREE.ShaderMaterial({
        vertexShader: LIT_VERT, fragmentShader: BLOCK_FRAG,
        uniforms: { ...LIGHT_UNIFORMS, uPitch: { value: o.pitch }, uHole: { value: r * 1.18 }, uGrid: { value: new THREE.Vector4(0, 0, o.nx, o.ny) } },
      });
      const block = new THREE.Mesh(new THREE.BoxGeometry(W, H, T), bm);
      block.position.set(((o.nx - 1) * o.pitch) / 2, ((o.ny - 1) * o.pitch) / 2, -T / 2);
      // the block's local frame must equal the bed's for the hole grid: shift the geometry instead of the mesh
      block.geometry.translate(block.position.x, block.position.y, block.position.z);
      block.position.set(0, 0, 0);
      this.obj.add(block);
      // a machined steel frame around the block, bolted
      const fr = mat('steelGraphite'), fw = o.pitch * 0.9;
      for (const [w, h, x, y] of [[W + 2 * fw, fw, ((o.nx - 1) * o.pitch) / 2, -mg - fw / 2], [W + 2 * fw, fw, ((o.nx - 1) * o.pitch) / 2, (o.ny - 1) * o.pitch + mg + fw / 2],
        [fw, H, -mg - fw / 2, ((o.ny - 1) * o.pitch) / 2], [fw, H, (o.nx - 1) * o.pitch + mg + fw / 2, ((o.ny - 1) * o.pitch) / 2]] as [number, number, number, number][]) {
        const b = new THREE.Mesh(bevelBox(w, h, fw * 1.1, fw * 0.18, 3), fr);
        b.position.set(x, y, fw * 0.3);
        this.obj.add(b);
      }
      const ink = mat('anodInk');
      for (const sx of [0, 1]) for (const sy of [0, 1]) {
        const s = capScrew(fw * 0.55, fr, ink);
        s.position.set(sx ? (o.nx - 1) * o.pitch + mg + fw / 2 : -mg - fw / 2, sy ? (o.ny - 1) * o.pitch + mg + fw / 2 : -mg - fw / 2, fw * 0.85);
        this.obj.add(s);
      }
    }
  }
  /** Set every pin's static height 0..1 (fraction of maxH) from a function of its cell. */
  setHeights(fn: (ix: number, iy: number) => number) {
    for (let iy = 0; iy < this.o.ny; iy++) for (let ix = 0; ix < this.o.nx; ix++) {
      const i = iy * this.o.nx + ix, h = fn(ix, iy);
      this.heights[i] = h;
      this.aPin.setZ(i, h);
    }
    this.aPin.needsUpdate = true;
    this.mat.uniforms.uWordK!.value = 0;
  }
  /** Word mode: per-pin glyph mask 0..1 and the time each pin's column is reached (the pin rises then). */
  setWord(mask: (ix: number, iy: number) => number, reachT: (ix: number, iy: number) => number) {
    for (let iy = 0; iy < this.o.ny; iy++) for (let ix = 0; ix < this.o.nx; ix++) {
      const i = iy * this.o.nx + ix;
      this.aPin.setW(i, mask(ix, iy));
      this.aPin2.setX(i, reachT(ix, iy));
    }
    this.aPin.needsUpdate = true; this.aPin2.needsUpdate = true;
    this.mat.uniforms.uWordK!.value = 1;
  }
  /** Morph target (0..1 heights) and per-pin delay (s) of the wave that turns noise into it from morphAt(t0). */
  setTarget(fn: (ix: number, iy: number) => number, delay?: (ix: number, iy: number) => number) {
    for (let iy = 0; iy < this.o.ny; iy++) for (let ix = 0; ix < this.o.nx; ix++) {
      const i = iy * this.o.nx + ix;
      this.aPin2.setY(i, fn(ix, iy));
      this.aPin2.setZ(i, delay ? delay(ix, iy) : 0);
    }
    this.aPin2.needsUpdate = true;
  }
  /** Start the morph at song time t0 (Infinity = off). */
  morphAt(t0: number) { this.mat.uniforms.uMorphT0!.value = t0; this.mat.uniforms.uMorph!.value = Number.isFinite(t0) ? 1 : 0; }
  /** Song time (heights are closed forms of it) and the word's sung state (tips' colour), span in bed-local x. */
  update(t: number, s?: SungState, span?: [number, number, number], sink = 0) {
    this.mat.uniforms.uT!.value = t;
    this.mat.uniforms.uSink!.value = sink;
    if (s) setSungUniforms(this.mat.uniforms, s, { existMode: 1, hotGain: 4, span });
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.obj.removeFromParent(); }
}

/** Height mask (0..1, row-major ny × nx, row 0 at the bottom) of text rasterised onto an nx × ny pin grid (cap = 70 % of ny, centred). */
export function pinTextMask(text: string, family: string, nx: number, ny: number, o: { cap?: number; x0?: number; y0?: number } = {}): Float32Array {
  const S = 8;
  const cv = document.createElement('canvas');
  cv.width = nx * S; cv.height = ny * S;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  const capCells = o.cap ?? ny * 0.7;
  const size = (capCells * S) / capRatio(family);
  c.fillStyle = '#fff'; c.font = font(family, size); c.textBaseline = 'alphabetic';
  const lay = layout(text, family, size);
  const x0 = o.x0 !== undefined ? o.x0 * S : (nx * S - lay.width) / 2;
  const base = ny * S - (o.y0 !== undefined ? o.y0 * S : (ny - capCells) / 2 * S);
  for (const g of lay.glyphs) c.fillText(g.ch, x0 + g.x, base);
  const img = c.getImageData(0, 0, nx * S, ny * S).data;
  const out = new Float32Array(nx * ny);
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    let a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) a += img[(((ny - 1 - iy) * S + sy) * nx * S + ix * S + sx) * 4 + 3]!;
    out[iy * nx + ix] = a / (S * S * 255);
  }
  return out;
}

// ---------------------------------------------------------------- the real conv1 filters

export interface Conv1 {
  n: number; size: number; cols: number; rows: number;
  /** luminance 0..1 of filter k at (x, y) (y = 0 at the bottom row of the filter) */
  lum(k: number, x: number, y: number): number;
  /** the sheet as a pin height field: (ix, iy) on a cols·pitch × rows·pitch grid (gutters = 0) */
  at(ix: number, iy: number): number;
}
let conv1P: Promise<Conv1 | null> | null = null;
/** app/public/filters/conv1.png (+ conv1.json layout): 96 filters 11 × 11 on a 12 × 8 sheet, pitch 13 px, 1 px offset. */
export function loadConv1(): Promise<Conv1 | null> {
  conv1P ??= (async () => {
    try {
      const j = await (await fetch('filters/conv1.json')).json() as { layout: { cols: number; rows: number; cell: number; pitch: number; offset: number; size: [number, number] } };
      const img = await createImageBitmap(await (await fetch('filters/conv1.png')).blob());
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const c = cv.getContext('2d', { willReadFrequently: true })!; c.drawImage(img, 0, 0);
      const d = c.getImageData(0, 0, img.width, img.height).data;
      const L = j.layout, Wp = img.width, Hp = img.height;
      const lumAt = (px: number, py: number) => { const i = (py * Wp + px) * 4; return (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255; };
      return {
        n: L.cols * L.rows, size: L.cell, cols: L.cols, rows: L.rows,
        lum: (k, x, y) => { const cx = k % L.cols, cy = Math.floor(k / L.cols); return lumAt(cx * L.pitch + L.offset + x, cy * L.pitch + L.offset + (L.cell - 1 - y)); },
        at: (ix, iy) => { const py = Hp - 1 - iy; return ix >= 0 && ix < Wp && py >= 0 && py < Hp ? lumAt(ix, py) : 0; },
      };
    } catch { return null; }
  })();
  return conv1P;
}

// ---------------------------------------------------------------- F5

/**
 * F5: the word pushed up in a pin bed built to fit it (`capPins` pins per cap height, default 13): each letter's pins
 * rise when the cursor reaches their column and their tips light bone. Hardware: the drilled block and its frame.
 * `bed`: drive an existing bed instead (the word is laid out on it at `at` [ix, iy] with cap `capPins`).
 */
export function pinWord(o: FabOpts & { bed?: PinBed; capPins?: number; at?: [number, number] }): Fab {
  const fam = o.font ?? F.archivo(100, 900);
  const text = o.text ?? fabText(o.word.w);
  const capPins = o.capPins ?? 13;
  const lay = layout(text, fam, 100);
  const wCaps = lay.width / (100 * capRatio(fam));
  const capH = resolveCap(o, wCaps);
  const pitch = capH / capPins;
  const margin = 3;
  const nx = o.bed ? o.bed.o.nx : Math.ceil(wCaps * capPins) + 2 * margin, ny = o.bed ? o.bed.o.ny : capPins + 2 * margin;
  const bed = o.bed ?? new PinBed({ nx, ny, pitch, pinD: pitch * 0.72, maxH: Math.max(pitch * 2.6, capH * 0.22) });
  // (p1v4) the bed's idle tips go dark under a word (0.22 on a bed built for it, 0.35 on a plate's shared bed): the grid
  // of tips is not a word before the word is made (§13.3 'pistons retracted'); a plate may set uRawK back
  bed.mat.uniforms.uRawK!.value = o.bed ? Math.min(bed.mat.uniforms.uRawK!.value as number, 0.35) : 0.22;
  const [gx, gy] = o.at ?? [margin, margin];
  const p = bed.o.pitch;
  // the glyph mask on the grid: cap = capPins rows from row gy, left at column gx (pin centres at cell centres)
  const mask = pinTextMask(text, fam, bed.o.nx, bed.o.ny, { cap: capPins, x0: gx - 0.5, y0: gy - 0.5 });
  const root = new THREE.Group(); root.name = `fab_F5_${text}`;
  const ax = o.align === 'center' ? -(wCaps * capPins * p) / 2 : o.align === 'right' ? -(wCaps * capPins * p) : 0;
  // bed-local: the glyph box starts at column gx − 0.5 → shift so the face's left end is the origin
  bed.obj.position.set(ax - (gx - 0.5) * p, -(gy - 0.5) * p, 0);
  if (!o.bed) root.add(bed.obj);
  o.parent?.add(root);
  // per-character spans (bed-local metres) for the letter cursor
  const sc = (capPins * p) / (100 * capRatio(fam));
  const spans: [number, number][] = lay.glyphs.map((g) => [(gx - 0.5) * p + g.x * sc, (gx - 0.5) * p + (g.x + g.w) * sc]);
  const X0 = spans[0]?.[0] ?? 0, X1 = spans[spans.length - 1]?.[1] ?? 1;
  const map = letterCursor(o.word, text, spans);
  const sung = (t: number): SungState => {
    const s = sungState(o.word, t, { lineEnd: o.lineEnd, deprecateT: o.deprecateT, method: 'F5' });
    const c = map(s.cursor), back = map(sungState(o.word, t - SUNG_T.hot).cursor);
    s.cursor = c; s.hotW = Math.min(Math.max(0, c - back), (0.45 * capH) / Math.max(1e-6, X1 - X0)); s.started = c > 0;
    return s;
  };
  const colReach: number[] = [];
  for (let ix = 0; ix < bed.o.nx; ix++) colReach.push(cursorTime(sung, o.word, Math.max(0, Math.min(1, (ix * p - X0) / (X1 - X0)))));
  bed.setWord((ix, iy) => mask[iy * bed.o.nx + ix]!, (ix) => colReach[ix]!);
  // the registered face: the pin tips' plane at full rise
  const faceRef = new THREE.Group(); faceRef.name = `face_${text}`; faceRef.userData.fabRef = true;
  faceRef.position.copy(bed.obj.position);
  (o.bed ? bed.obj : root).add(faceRef);
  if (o.bed) faceRef.position.set(0, 0, 0);
  const maxH = bed.o.maxH;
  const box = new THREE.Box3(new THREE.Vector3(X0, (gy - 0.5) * p, maxH), new THREE.Vector3(X1, (gy - 0.5 + capPins) * p, maxH));
  const carrier = registerFab({ ...o, method: 'F5' }, text, faceRef, box, capH, sung);
  const mode: OldMode = o.old ?? 'retract';
  setFabLook(bed.mat.uniforms, { old: mode === 'retract' ? 'fade' : mode, unsung: o.unsung });
  let isoK = 1;
  const v4 = fabV4(o, carrier, () => [bed.mat], [faceRef], mode);
  const iso = (k: number) => { isoK = k; v4.iso!(k); };
  fabIsoTarget(carrier.id, iso);
  return Object.assign({
    obj: root, carriers: [carrier], width: X1 - X0, capH, method: 'F5' as const,
    phase: v4.phase, oldAt: v4.oldAt, center: v4.center, iso,
    update(t: number) {
      const s = sung(t);
      v4.settle(s);
      // (p1v4) after the line the relief sinks back flush with the bed (fade / retract), as the tips drop to ash
      const x = Math.max(0, Math.min(1, (s.ash - 0.55) / 0.45)), sink = mode === 'ash' || mode === 'soft' || s.t === 0 ? 0 : x * x * (3 - 2 * x);
      bed.update(t, s, [X0, X1, capH], Math.max(sink, 1 - isoK));
    },
    cursor(t: number) { const s = sung(t); return !s.started || s.done ? null : faceRef.localToWorld(new THREE.Vector3(X0 + (X1 - X0) * s.cursor, (gy - 0.5 + capPins / 2) * p, maxH)); },
    dispose() { root.removeFromParent(); lyricReg.unregister(carrier.id); if (!o.bed) bed.dispose(); },
  }, { bed });
}
void LIN;
