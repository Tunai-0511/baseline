// Physical displays (TREATMENT §7.1 F4): 7/14/16-segment, 5×7 dot matrix, split-flap, nixie (digits only). Owner: fab.
// A display is a machined part: a black anodised bezel with four cap screws around a smoked acrylic window; behind the
// window the cells (segments / dots / flaps / tubes) are drawn by one shader from a per-cell data texture, so a display
// of any length is a single draw call that stays crisp at any distance. Unlit segments are graphite ≈ 0.05 (visible
// through the smoke), lit ones bone 0.8 — never magenta (the SOTA lamp's 8-char status window is a DotMatrix too; its
// lamp beside it is the magenta). The acrylic reflects the scene's lights (LightRig), the cells glow softly inside it.
//
//   const ttl = new SegDisplay({ kind: 16, chars: 5, cellH: 0.5 });   ttl.setText(ttlText(9.2));   // '09.20', lit bone
//   const marquee = new DotMatrix({ chars: 8, cellH: 0.6 });          marquee.setText('YOU WERE');
//   marquee.setCell(3, [r, g, b])                                      // per-cell emission colour (linear) — or setLit(v)
//   const f = segWord({ scene, word, method: 'F4', capH: 0.6, kind: 'dot5x7' });   // a registered lyric carrier
//   const fs = segLine(line.words.slice(0, 2), { scene, method: 'F4', capH: 0.5, kind: 16, lineEnd: line.end }); // one display, one carrier per word
//
// Local frame: the window face in XY at z = 0 (normal +Z), cells left → right from x = 0, cell bottom at y = 0
// (the glyph baseline: 5×7 dots fill [0, cellH]; segment glyphs sit inside the cell's margins).
//
// p1v4 (KITS §23, TREATMENT §13.3): unlit elements are dark (`raw`, default 0.006 linear neutral — the v3 0.034 read as
// a grey 88888 wallpaper under GRADE_BRIGHT); an off split-flap cell shows a blank card (v3 drew the word's letters in
// raw: readable before it was sung); per-cell isolation (`setIso`, heroIsolate); lyric words light only at the
// fabrication front (ONE white-hot cell, the newest), a word that would light at once (a slam, `segSlam`) sweeps left →
// right over ~3 frames (FAB_V4.sweep) — never the whole board above bone 0.8; after the line the cells drop to the v4
// ash and switch off (old 'fade', default) or stay at ash ('ash'). `poster` (cellH ≥ 1.2 m in the kit's carriers):
// a stadium board's construction — LED lamps with a lens and a hot core, panel modules with seams and corner screws,
// a ±3 % module-to-module spread, segments made of LEDs — that holds up at 3–6 m caps.
import * as THREE from 'three';
import { GLSL_COMMON } from '../engine/glsl/common';
import { F } from '../engine/type';
import { LIN } from '../engine/palette';
import type { Word } from '../engine/lyrics';
import { fabText, lyricReg, sungState, SUNG_COL, SUNG_T, SUNG_GLSL, type SungState, type LyricCarrier } from '../engine/lyricreg';
import { LIGHT_GLSL, LIGHT_UNIFORMS, LIT_VERT } from './_light';
import { mat, anodInk } from './_mat';
import { textMask, registerFab, resolveCap, fabLong, letterCursor, cursorTime, bevelBox, capScrew, FAB_V4, fabFadeOf, fabPhase, fabIsoTarget, faceWorld, OLD_AFTER, type TextMask, type Fab, type FabOpts, type OldMode } from './_fab';

export type SegKind = 7 | 14 | 16 | 'dot5x7' | 'nixie' | 'flip';

export interface SegOpts {
  kind: SegKind;
  /** number of character cells */
  chars: number;
  /** cell (character) height in m; the cell width follows the kind (≈ 0.62 × height for segments) */
  cellH: number;
  /** italic slant of segment cells (default true for 7/14/16) */
  slant?: boolean;
  /** draw the bezel and screws (default true) */
  bezel?: boolean;
  /** window border around the cells (cell heights, default 0.28) */
  border?: number;
  /** cell width in m (default: the kind's aspect × cellH); a tighter dot5x7 pitch keeps its dots, closes the letter gap */
  cellW?: number;
  /** (p1v4) unlit elements' level (linear, neutral grey), default 0.006 (v3: 0.034, violet) */
  raw?: number;
  /** (p1v4) stadium-board construction for big displays: LED lamps with lenses, panel modules + seams + screws (default false) */
  poster?: boolean;
  /** (p1v4, poster) cells per panel module (default 2) */
  module?: number;
}

// ================================================================ fonts

/** 16-segment layout bits: a1 a2 b c d1 d2 e f g1 g2 h i j k l m, dp = 16. */
const S16 = ['a1', 'a2', 'b', 'c', 'd1', 'd2', 'e', 'f', 'g1', 'g2', 'h', 'i', 'j', 'k', 'l', 'm', 'dp'];
const F16: Record<string, string> = {
  A: 'a1 a2 b c e f g1 g2', B: 'a1 a2 b c d1 d2 g2 i l', C: 'a1 a2 d1 d2 e f', D: 'a1 a2 b c d1 d2 i l', E: 'a1 a2 d1 d2 e f g1 g2',
  F: 'a1 a2 e f g1', G: 'a1 a2 c d1 d2 e f g2', H: 'b c e f g1 g2', I: 'a1 a2 d1 d2 i l', J: 'b c d1 d2 e', K: 'e f g1 j m',
  L: 'd1 d2 e f', M: 'b c e f h j', N: 'b c e f h m', O: 'a1 a2 b c d1 d2 e f', P: 'a1 a2 b e f g1 g2', Q: 'a1 a2 b c d1 d2 e f m',
  R: 'a1 a2 b e f g1 g2 m', S: 'a1 a2 c d1 d2 f g1 g2', T: 'a1 a2 i l', U: 'b c d1 d2 e f', V: 'e f k j', W: 'b c e f k m',
  X: 'h j k m', Y: 'h j l', Z: 'a1 a2 d1 d2 j k',
  '0': 'a1 a2 b c d1 d2 e f j k', '1': 'b c j', '2': 'a1 a2 b d1 d2 e g1 g2', '3': 'a1 a2 b c d1 d2 g2', '4': 'b c f g1 g2',
  '5': 'a1 a2 c d1 d2 f g1 g2', '6': 'a1 a2 c d1 d2 e f g1 g2', '7': 'a1 a2 b c', '8': 'a1 a2 b c d1 d2 e f g1 g2', '9': 'a1 a2 b c d1 d2 f g1 g2',
  '-': 'g1 g2', '−': 'g1 g2', _: 'd1 d2', '/': 'j k', '\\': 'h m', '+': 'g1 g2 i l', '*': 'g1 g2 h i j k l m', "'": 'j', '’': 'j', '‘': 'h',
  '"': 'f i', '“': 'f i', '”': 'b i', '.': 'dp', ',': 'k', '=': 'g1 g2 d1 d2', '<': 'j m', '>': 'h k', '(': 'j m', ')': 'h k', '[': 'a1 d1 e f i l',
  ']': 'a2 d2 b c i l', '?': 'a1 a2 b g2 l dp', '!': 'b c dp', '%': 'a1 f g1 g2 c d2 i l j k', ':': 'i l', '·': 'dp', '|': 'i l', '$': 'a1 a2 f g1 g2 c d1 d2 i l',
};
const F7: Record<string, string> = {
  '0': 'a b c d e f', '1': 'b c', '2': 'a b d e g', '3': 'a b c d g', '4': 'b c f g', '5': 'a c d f g', '6': 'a c d e f g', '7': 'a b c', '8': 'a b c d e f g', '9': 'a b c d f g',
  A: 'a b c e f g', B: 'c d e f g', C: 'a d e f', D: 'b c d e g', E: 'a d e f g', F: 'a e f g', G: 'a c d e f', H: 'b c e f g', I: 'e f', J: 'b c d e',
  K: 'b c e f g', L: 'd e f', M: 'a b c e f', N: 'c e g', O: 'a b c d e f', P: 'a b e f g', Q: 'a b c f g', R: 'e g', S: 'a c d f g', T: 'd e f g',
  U: 'b c d e f', V: 'b c d e f', W: 'b c d e f', X: 'b c e f g', Y: 'b c d f g', Z: 'a b d e g', '-': 'g', '−': 'g', _: 'd', '.': 'dp', "'": 'b', '’': 'b', '=': 'd g',
};
const S7 = { a: ['a1', 'a2'], b: ['b'], c: ['c'], d: ['d1', 'd2'], e: ['e'], f: ['f'], g: ['g1', 'g2'], dp: ['dp'] } as Record<string, string[]>;
/** 5×7 dot font (rows top → bottom, '1' = dot), lower case maps to upper. */
const D57: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110', C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11100 10010 10001 10001 10001 10010 11100', E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001', I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100', K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000', Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100', U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100', W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110', '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11111 00010 00100 00010 00001 10001 01110', '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000', '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
  "'": '01100 00100 01000 00000 00000 00000 00000', '’': '01100 00100 01000 00000 00000 00000 00000', '‘': '00110 00100 00010 00000 00000 00000 00000',
  '-': '00000 00000 00000 11111 00000 00000 00000', '−': '00000 00000 00000 11111 00000 00000 00000', '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000', ':': '00000 01100 01100 00000 01100 01100 00000', '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100', '/': '00000 00001 00010 00100 01000 10000 00000', '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000', '+': '00000 00100 00100 11111 00100 00100 00000', '=': '00000 00000 11111 00000 11111 00000 00000',
  '<': '00010 00100 01000 10000 01000 00100 00010', '>': '01000 00100 00010 00001 00010 00100 01000', '%': '11000 11001 00010 00100 01000 10011 00011',
  '#': '01010 01010 11111 01010 11111 01010 01010', '·': '00000 00000 00000 00100 00000 00000 00000', '*': '00000 00100 10101 01110 10101 00100 00000',
  _: '00000 00000 00000 00000 00000 00000 11111', '"': '01010 01010 01010 00000 00000 00000 00000', '“': '01010 01010 01010 00000 00000 00000 00000',
  '”': '01010 01010 01010 00000 00000 00000 00000', '&': '01100 10010 10100 01000 10101 10010 01101', '@': '01110 10001 00001 01101 10101 10101 01110',
  '|': '00100 00100 00100 00100 00100 00100 00100', '[': '01110 01000 01000 01000 01000 01000 01110', ']': '01110 00010 00010 00010 00010 00010 01110',
  '≤': '00010 00100 01000 00100 00010 00000 01110', '≥': '01000 00100 00010 00100 01000 00000 01110', '∞': '00000 00000 01010 10101 01010 00000 00000',
};

const bitsOf = (names: string): number => names.split(/\s+/).filter(Boolean).reduce((m, n) => { const i = S16.indexOf(n); return i >= 0 ? m | (1 << i) : m; }, 0);
const up = (ch: string) => (/[a-z]/.test(ch) ? ch.toUpperCase() : ch);

/**
 * Segment bitmask of a character (0 = blank / unsupported). The bits use the 16-segment layout (a1 a2 b c d1 d2 e f
 * g1 g2 h i j k l m, dp = bit 16); 14-segment glyphs light a1+a2 / d1+d2 together, 7-segment ones a, b, c, d, e, f, g, dp.
 */
export function segMask(ch: string, kind: 7 | 14 | 16): number {
  const c = up(ch);
  if (kind === 7) {
    const s = F7[c];
    if (!s) return 0;
    return s.split(' ').reduce((m, n) => m | bitsOf((S7[n] ?? []).join(' ')), 0);
  }
  return bitsOf(F16[c] ?? '');
}
/** 5×7 dot pattern of a character as two 20/15-bit words (rows 0–3, rows 4–6; bit = row·5 + column, column 0 = left). */
export function dotMask(ch: string): [number, number] {
  const s = D57[up(ch)];
  if (!s) return [0, 0];
  const rows = s.split(' ');
  let a = 0, b = 0;
  rows.forEach((r, ri) => { for (let c = 0; c < 5; c++) if (r[c] === '1') { if (ri < 4) a |= 1 << (ri * 5 + c); else b |= 1 << ((ri - 4) * 5 + c); } });
  return [a, b];
}

/** TTL readout 'SS.cc' (e.g. 9.2 → '09.20'), clamped at 0 ('00.00'); negative LATE times as '-SS.cc' (bridge). */
export function ttlText(sec: number, allowNegative = false): string {
  const v = allowNegative ? sec : Math.max(0, sec);
  const a = Math.abs(v), s = Math.floor(a), c = Math.floor((a - s) * 100 + 1e-6);
  return `${v < 0 ? '-' : ''}${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

// ================================================================ the face shader

const KIND_ID = (k: SegKind) => (k === 'dot5x7' ? 35 : k === 'nixie' ? 1 : k === 'flip' ? 2 : k);
const ATLAS_N = 48;

const SEG_FRAG = (kind: number) => /* glsl */ `
${GLSL_COMMON}
${LIGHT_GLSL}
#define KIND ${kind}
uniform sampler2D uData; uniform vec4 uCell;          // cell w, cell h, slant, chars
uniform vec4 uSeg;                                     // half width, gap, glow radius, dot radius (cell-h units)
uniform vec3 uRaw; uniform float uSmoke; uniform vec4 uWin; // window x0, y0, x1, y1 (local m)
uniform sampler2D uAtlas; uniform vec4 uAtlasK;        // metres per encoded unit / atlas cap px, atlas cap (px), atlas w, h (px)
uniform vec4 uAtlasSpan[${ATLAS_N}];                   // x0, x1 (px), baseline y (px from top), 0
uniform vec4 uPoster;                                  // (p1v4) poster on, cells per module, 0, 0
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec2 vUv; varying float vAO; varying vec3 vIC;
varying vec3 vAx; varying vec3 vAz;

float segD(vec2 p, vec2 a, vec2 b, float hw) {
  vec2 ba = b - a; float L = max(length(ba), 1e-6); vec2 d = ba / L; vec2 q = p - (a + b) * 0.5;
  float al = abs(dot(q, d)), pe = abs(dot(q, vec2(-d.y, d.x)));
  return max(pe - hw, al + pe - L * 0.5);
}
// segment i of the 16-segment layout in cell units (x 0..cw, y 0..ch)
void segEnds(int i, float cw, float ch, float g, out vec2 a, out vec2 b) {
  float x0 = 0.17 * cw, x1 = 0.83 * cw, xm = 0.5 * cw, y0 = 0.07 * ch, y1 = 0.93 * ch, ym = 0.5 * ch;
  float gd = g * 0.9;
  bool full = KIND != 16;
  if (i == 0) { a = vec2(x0 + g, y1); b = vec2(full ? x1 - g : xm - g, y1); }
  else if (i == 1) { a = vec2(xm + g, y1); b = vec2(x1 - g, y1); }
  else if (i == 2) { a = vec2(x1, y1 - g); b = vec2(x1, ym + g); }
  else if (i == 3) { a = vec2(x1, ym - g); b = vec2(x1, y0 + g); }
  else if (i == 4) { a = vec2(x0 + g, y0); b = vec2(full ? x1 - g : xm - g, y0); }
  else if (i == 5) { a = vec2(xm + g, y0); b = vec2(x1 - g, y0); }
  else if (i == 6) { a = vec2(x0, ym - g); b = vec2(x0, y0 + g); }
  else if (i == 7) { a = vec2(x0, y1 - g); b = vec2(x0, ym + g); }
  else if (i == 8) { a = vec2(x0 + g, ym); b = vec2(KIND == 7 ? x1 - g : xm - g, ym); }
  else if (i == 9) { a = vec2(xm + g, ym); b = vec2(x1 - g, ym); }
  else if (i == 10) { a = vec2(x0 + gd * 1.6, y1 - gd * 1.6); b = vec2(xm - gd, ym + gd * 1.6); }
  else if (i == 11) { a = vec2(xm, y1 - g); b = vec2(xm, ym + g); }
  else if (i == 12) { a = vec2(x1 - gd * 1.6, y1 - gd * 1.6); b = vec2(xm + gd, ym + gd * 1.6); }
  else if (i == 13) { a = vec2(x0 + gd * 1.6, y0 + gd * 1.6); b = vec2(xm - gd, ym - gd * 1.6); }
  else if (i == 14) { a = vec2(xm, ym - g); b = vec2(xm, y0 + g); }
  else { a = vec2(x1 - gd * 1.6, y0 + gd * 1.6); b = vec2(xm + gd, ym - gd * 1.6); }
}
bool segUsed(int i) {
  if (KIND == 16) return true;
  if (KIND == 14) return i != 1 && i != 5;
  return i == 0 || i == 2 || i == 3 || i == 4 || i == 6 || i == 7 || i == 8;   // 7-segment
}
float atlasD(vec2 q, int ci, float capPx) {
  // q: cell-local metres, glyph cap of capPx atlas px fills 0.74 of the cell height, centred
  vec4 sp = uAtlasSpan[ci];
  float s = uAtlasK.y / (0.74 * uCell.y);                  // atlas px per metre
  vec2 px = vec2(0.5 * (sp.x + sp.y) + (q.x - 0.5 * uCell.x) * s, sp.z - (q.y - 0.13 * uCell.y) * s);
  vec2 uv = vec2(px.x / uAtlasK.z, 1.0 - px.y / uAtlasK.w);
  if (px.x < sp.x - 4.0 || px.x > sp.y + 4.0) return 1e3;
  return (texture2D(uAtlas, uv).r - 0.5) * uAtlasK.x;
}
void main() {
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  vec2 p = vL.xy;
  float cw = uCell.x, ch = uCell.y;
  float ci = clamp(floor(p.x / cw), 0.0, uCell.w - 1.0);
  vec4 d0 = texelFetch(uData, ivec2(int(ci), 0), 0);
  vec4 d1 = texelFetch(uData, ivec2(int(ci), 1), 0);
  vec4 d2 = texelFetch(uData, ivec2(int(ci), 2), 0);
  vec2 q = vec2(p.x - ci * cw, p.y);
  float inCells = step(0.0, p.x) * step(p.x, uCell.w * cw) * step(0.0, p.y) * step(p.y, ch);
  q.x -= uCell.z * (q.y - 0.5 * ch);
  float aa = max(length(fwidth(p)), 1e-6);
  // (p1v4) the cell's isolation (heroIsolate / setIso): 0 = switched off (raw), else × its light
  float isoK = d2.y;
  float on = step(0.5, d1.a) * step(0.001, isoK);     // cell switched on (else every element shows raw)
  float poster = uPoster.x;
  float dl = 1e3, du = 1e3;                 // nearest lit / any element (m)
  vec2 nctr = vec2(-1e3); float nlit = 0.0; float pit = ch / 7.0;
#if KIND == 7 || KIND == 14 || KIND == 16
  int mask = int(d0.x + 0.5);
  float hw = uSeg.x * ch, g = uSeg.y * ch;
  for (int i = 0; i < 16; i++) {
    if (!segUsed(i)) continue;
    vec2 a, b; segEnds(i, cw, ch, g, a, b);
    float d = segD(q, a, b, (i >= 10 && i != 11 && i != 14) ? hw * 0.8 : hw);
    du = min(du, d);
    if (((mask >> i) & 1) == 1) dl = min(dl, d);
  }
  float dp = length(q - vec2(0.83 * cw + hw * 2.6, 0.07 * ch)) - hw * 1.15;
  du = min(du, dp);
  if (((mask >> 16) & 1) == 1) dl = min(dl, dp);
#elif KIND == 35
  int ma = int(d0.x + 0.5), mb = int(d0.y + 0.5);
  vec2 g = q / pit;                                 // dot grid: 5 columns from x = 0.5 pitch
  vec2 cidx = floor(vec2(g.x - 0.5, g.y));
  float dmin = 1e3;
  for (int dy = 0; dy <= 1; dy++) for (int dx = 0; dx <= 1; dx++) {
    vec2 c = cidx + vec2(float(dx), float(dy));
    if (c.x < 0.0 || c.x > 4.0 || c.y < 0.0 || c.y > 6.0) continue;
    vec2 ctr = (c + vec2(1.0, 0.5)) * pit;
    float d = length(q - ctr) - uSeg.w * pit;
    du = min(du, d);
    int row = 6 - int(c.y), col = int(c.x);
    int bit = row < 4 ? ((ma >> (row * 5 + col)) & 1) : ((mb >> ((row - 4) * 5 + col)) & 1);
    if (bit == 1) dl = min(dl, d);
    if (d < dmin) { dmin = d; nctr = ctr; nlit = float(bit); }
  }
#elif KIND == 1
  // nixie: all ten wire numerals stacked (faint), the lit one glowing; a hex anode mesh in front
  int dig = int(d0.z + 0.5);
  float wire = uSeg.x * ch;
  for (int k = 0; k < 10; k++) {
    float d = abs(atlasD(q, k, uAtlasK.y)) - wire;
    du = min(du, d + (k == dig ? 0.0 : wire * 0.4));
    if (k == dig && d0.z >= -0.5) dl = min(dl, d);
  }
#elif KIND == 2
  // split flap: the card, its split line, the character (new on top, old below until the flap lands)
  int cNew = int(d0.z + 0.5), cOld = int(d2.x + 0.5);
  float fp = d0.w;                                   // 0..1 flap fall
  float ym = 0.5 * ch;
  float th = fp * PI;
  bool top = q.y >= ym;
  float yy = q.y;
  int show = top ? cNew : (fp >= 1.0 ? cNew : cOld);
  float shade = 1.0;
  // the falling flap (foreshortened by cos θ)
  float ct = cos(th);
  if (fp > 0.0 && fp < 1.0) {
    if (ct > 0.0 && top && q.y - ym <= ct * ym) { yy = ym + (q.y - ym) / max(ct, 1e-3); show = cOld; shade = 0.65 + 0.35 * ct; }
    if (ct < 0.0 && !top && ym - q.y <= -ct * ym) { yy = ym - (ym - q.y) / max(-ct, 1e-3); show = cNew; shade = 0.55 + 0.45 * (-ct); }
  }
  float d = show >= 0 ? atlasD(vec2(q.x, yy), show, uAtlasK.y) : 1e3;
  // (p1v4) an off cell shows a blank card: the word is not on the flaps before it is sung
  dl = -d; du = on > 0.5 ? dl : 1e3;
  float card = step(abs(q.x - 0.5 * cw), 0.46 * cw) * step(abs(q.y - ym), 0.47 * ch);
  float split = 1.0 - smoothstep(0.0, aa * 1.5, abs(q.y - ym) - ch * 0.006);
#endif
  float cover = 1.0 - smoothstep(-aa, aa, dl);
  float any = 1.0 - smoothstep(-aa, aa, du);
  vec3 lit = d1.rgb * isoK;
  cover *= on;
  // (p1v4 poster) an LED board up close: lamps with a hot core and a lens rim, segments made of LEDs
  float coreK = 1.0;
  vec3 lens = vec3(0.0);
  if (poster > 0.5) {
#if KIND == 35
    float r = uSeg.w * pit;
    vec2 dq = (q - nctr) / max(r, 1e-6);
    float rr = length(dq);
    float detail = 1.0 - smoothstep(0.08, 0.2, aa / max(r, 1e-6));     // a lamp ≥ ~10 px across
    coreK = mix(1.0, 1.3 - 0.45 * smoothstep(0.0, 0.95, rr) - 0.35 * smoothstep(0.86, 1.0, rr), detail);
    // the dark lens of an unlit lamp catches the lights: a dome normal in the panel's frame
    vec3 Tx = normalize(vAx), Tz = normalize(vAz), Ty = normalize(cross(Tz, Tx));
    vec2 dn = dq * 0.85;
    vec3 Nl = normalize(Tx * dn.x + Ty * dn.y + Tz * sqrt(max(0.0, 1.0 - dot(dn, dn))));
    lens = ltShade(vW, Nl, V, vec3(0.0), 0.16, 0.0, 1.0) * 0.55 * (1.0 - smoothstep(0.85, 1.0, rr)) * step(rr, 1.0) * detail * (1.0 - nlit * on);
#elif KIND == 7 || KIND == 14 || KIND == 16
    float lp = uSeg.x * ch * 0.9;
    vec2 lq = fract(q / lp) - 0.5;
    float detail = 1.0 - smoothstep(0.1, 0.25, aa / lp);
    coreK = mix(1.0, 0.45 + 0.75 * exp(-dot(lq, lq) * 9.0), detail);
#endif
  }
  vec3 em = lit * cover * coreK;
  em += uRaw * (any - cover) * step(0.5, inCells);
  // light diffusing inside the smoked acrylic: a soft halo around lit elements
  em += lit * on * 0.06 * exp(-max(dl, 0.0) / max(uSeg.z * ch, 1e-5)) * (1.0 - cover) * (1.0 - 0.7 * any);
#if KIND == 2
  vec3 cardC = ltShade(vW, N, V, C_INK2 * 2.2, 0.5, 0.0, 1.0) * card * shade;
  em = em * shade + cardC * (1.0 - cover) - cardC * split * 0.8;
#endif
  em *= inCells;
  // the smoked acrylic window: transmission + its own reflections (sharp, low roughness)
  vec3 refl = ltShade(vW, N, V, vec3(0.0), 0.07, 0.0, 1.0);
  vec3 col = em * uSmoke + refl + C_INK * 0.25 + lens * inCells;
  if (poster > 0.5) {
    // panel modules: a seam every uPoster.y cells (and along the window's edges), corner screws, a ±3 % spread per module
    float mw = max(1.0, uPoster.y) * cw;
    float mi = floor(p.x / mw);
    float sx = abs(p.x - floor(p.x / mw + 0.5) * mw);
    float seamW = 0.008 * ch + aa;
    float seam = (1.0 - smoothstep(seamW * 0.5, seamW, sx)) * step(-0.18 * ch, p.y) * step(p.y, ch * 1.18);
    vec2 sc = vec2(sx, min(abs(p.y + 0.11 * ch), abs(p.y - ch * 1.11)));
    float screw = 1.0 - smoothstep(0.016 * ch, 0.016 * ch + aa, length(sc));
    col *= 1.0 + 0.03 * (hash11(mi * 7.31 + 1.7) - 0.5) * 2.0 * inCells;
    col = mix(col, C_INK * 0.1, seam * 0.85);
    col = mix(col, ltShade(vW, N, V, vec3(0.06), 0.3, 0.9, 1.0), screw);
  }
  gl_FragColor = vec4(ltFog(col, vW), 1.0);
}`;

let atlasCache: Map<string, { mask: TextMask; idx: Map<string, number> }> | null = null;
/** Glyph atlas (signed distance) for flip / nixie cells. */
function atlasFor(kind: SegKind): { mask: TextMask; idx: Map<string, number> } {
  atlasCache ??= new Map();
  const key = String(kind);
  const hit = atlasCache.get(key);
  if (hit) return hit;
  const chars = kind === 'nixie' ? '0123456789' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-’.,!?:/+=%&()';
  const fam = kind === 'nixie' ? F.archivo(75, 300) : F.archivo(87.5, 700);
  // wide tracking so glyph fields never meet
  const mask = textMask(chars.split('').join(' '), fam, { capPx: 96, tracking: 0.25, range: 12 });
  const idx = new Map<string, number>();
  let k = 0;
  Array.from(chars).forEach((c) => idx.set(c, k++));
  const res = { mask, idx };
  atlasCache.set(key, res);
  return res;
}

// ================================================================ the display

const CELL_ASPECT: Record<string, number> = { 7: 0.62, 14: 0.7, 16: 0.7, dot5x7: 6 / 7, nixie: 0.6, flip: 0.72 };

/** A display panel. Local frame: face in XY at z = 0 (normal +Z), cells left → right from x = 0, cell bottom y = 0. */
export class SegDisplay {
  obj = new THREE.Group();
  text = '';
  /** per-cell brightness 0..1 (1 = bone 0.8 lit, 0 = graphite 0.05) */
  lit: number[];
  /** (p1v4) per-cell isolation 0..1 (heroIsolate / setIso): × the lit cells' light, 0 = off */
  iso: number[];
  readonly width: number;
  readonly cellW: number;
  readonly cellH: number;
  /** cap height of the glyphs and their bottom (local y): what a lyric carrier registers */
  readonly capH: number;
  readonly capY: number;
  face: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  private data: THREE.DataTexture;
  private buf: Float32Array;
  private colors: ([number, number, number] | null)[];
  private flips: { from: string; to: string; t0: number }[] = [];
  private atlas: { mask: TextMask; idx: Map<string, number> } | null = null;
  private dps: boolean[] = [];
  constructor(public o: SegOpts) {
    const n = Math.max(1, o.chars);
    this.lit = new Array(n).fill(1);
    this.iso = new Array(n).fill(1);
    this.colors = new Array(n).fill(null);
    this.cellH = o.cellH;
    this.cellW = o.cellW ?? o.cellH * (CELL_ASPECT[String(o.kind)] ?? 0.62);
    this.width = n * this.cellW;
    const seg = o.kind === 7 || o.kind === 14 || o.kind === 16;
    this.capH = o.kind === 'dot5x7' ? o.cellH : seg ? o.cellH * 0.86 : o.cellH * 0.74;
    this.capY = o.kind === 'dot5x7' ? 0 : seg ? o.cellH * 0.07 : o.cellH * 0.13;
    this.buf = new Float32Array(n * 3 * 4);
    this.data = new THREE.DataTexture(this.buf, n, 3, THREE.RGBAFormat, THREE.FloatType);
    this.data.minFilter = this.data.magFilter = THREE.NearestFilter;
    this.data.needsUpdate = true;
    if (o.kind === 'nixie' || o.kind === 'flip') this.atlas = atlasFor(o.kind);
    const am = this.atlas?.mask;
    const spans = Array.from({ length: ATLAS_N }, () => new THREE.Vector4());
    if (am) {
      // atlas glyph spans (px): the mask's spans are in caps from its ink left; glyphs are every other char ('A B C …')
      const cs = am.spans.filter((_, i) => i % 2 === 0);
      cs.slice(0, ATLAS_N).forEach(([a, b], i) => spans[i]!.set(am.padL + a * am.capPx, am.padL + b * am.capPx, am.baseY, 0));
    }
    const border = (o.border ?? 0.28) * o.cellH;
    const win = { x0: -border, y0: -border, x1: this.width + border, y1: o.cellH + border };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: LIT_VERT, fragmentShader: SEG_FRAG(KIND_ID(o.kind)),
      uniforms: {
        ...LIGHT_UNIFORMS,
        uData: { value: this.data },
        uCell: { value: new THREE.Vector4(this.cellW, o.cellH, (o.slant ?? seg) && seg ? 0.09 : 0, n) },
        uSeg: { value: new THREE.Vector4(o.kind === 'nixie' ? 0.012 : 0.04, 0.03, o.kind === 'dot5x7' ? 0.035 : 0.035, 0.41) },
        // (p1v4) unlit elements: a dark neutral (v3: SUNG_COL.raw × 0.7 = 0.034 violet — a grey 88888 under GRADE_BRIGHT)
        uRaw: { value: new THREE.Vector3(o.raw ?? 0.006, o.raw ?? 0.006, (o.raw ?? 0.006) * 1.04) },
        uSmoke: { value: 0.82 },
        uWin: { value: new THREE.Vector4(win.x0, win.y0, win.x1, win.y1) },
        uAtlas: { value: am?.tex ?? null },
        uAtlasK: { value: new THREE.Vector4(am ? 2 * am.range * (0.74 * o.cellH / am.capPx) : 1, am?.capPx ?? 1, am?.pxW ?? 1, am?.pxH ?? 1) },
        uAtlasSpan: { value: spans },
        uPoster: { value: new THREE.Vector4(o.poster ? 1 : 0, o.module ?? 2, 0, 0) },
      },
    });
    this.mat.name = `seg_${o.kind}`;
    const fg = new THREE.PlaneGeometry(win.x1 - win.x0, win.y1 - win.y0);
    fg.translate((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, 0);
    this.face = new THREE.Mesh(fg, this.mat);
    this.face.name = 'seg_window';
    this.face.userData.segDisplay = this;
    this.obj.add(this.face);
    if (o.bezel !== false) this.buildBezel(win, o.cellH);
    if (o.kind === 'nixie') this.buildTubes();
    this.obj.name = `seg${o.kind}x${n}`;
    this.write();
  }

  private buildBezel(win: { x0: number; y0: number; x1: number; y1: number }, ch: number) {
    const b = ch * 0.2, d = ch * 0.09, ww = win.x1 - win.x0, wh = win.y1 - win.y0;
    const anod = anodInk(), steel = mat('steelGraphite'), dark = mat('anodInk', { base: [LIN.ink[0], LIN.ink[1], LIN.ink[2]] });
    const cx = (win.x0 + win.x1) / 2, cy = (win.y0 + win.y1) / 2;
    const bars: [number, number, number, number][] = [
      [cx, win.y1 + b / 2, ww + 2 * b, b], [cx, win.y0 - b / 2, ww + 2 * b, b], [win.x0 - b / 2, cy, b, wh], [win.x1 + b / 2, cy, b, wh],
    ];
    for (const [x, y, w, h] of bars) {
      const m = new THREE.Mesh(bevelBox(w, h, d, Math.min(b, d) * 0.35, 3), anod);
      m.position.set(x, y, d / 2 - d * 0.35);
      this.obj.add(m);
    }
    // the window's inner lip (a dark chamfer between bezel and acrylic) and the housing behind
    const back = new THREE.Mesh(bevelBox(ww + 2 * b, wh + 2 * b, ch * 0.5, ch * 0.04, 3), dark);
    back.position.set(cx, cy, -ch * 0.25 - d * 0.36);
    this.obj.add(back);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const s = capScrew(b * 0.42, steel, anod);
      s.position.set(cx + sx * (ww / 2 + b / 2), cy + sy * (wh / 2 + b / 2), d * 0.65);
      this.obj.add(s);
    }
  }

  private buildTubes() {
    // a glass tube per cell (Ø < cell width), a socket ring under it; the numerals glow inside
    const gl = mat('glass', { thickness: 0.002 }), sock = anodInk();
    const r = this.cellW * 0.46, h = this.cellH * 1.12;
    for (let k = 0; k < this.o.chars; k++) {
      const x = (k + 0.5) * this.cellW;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40, 1, true), gl);
      tube.position.set(x, this.cellH / 2, r * 0.2);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), gl);
      cap.scale.y = 0.4; cap.position.set(x, this.cellH / 2 + h / 2, r * 0.2);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.1, this.cellH * 0.16, 32), sock);
      base.position.set(x, -this.cellH * 0.12, r * 0.2);
      tube.renderOrder = cap.renderOrder = 1;
      this.obj.add(tube, cap, base);
    }
  }

  /**
   * Characters shown (right-padded to `chars`). Split-flap: `flip` = the text shown before and the time t0 the new one
   * lands (each changed cell's flap falls over the 90 ms before t0); pure: nothing depends on the previous call.
   */
  setText(s: string, flip?: { from: string; t0: number }) {
    const n = this.o.chars;
    const k = this.o.kind;
    // segment displays carry the decimal point on the previous cell (09.20 = four cells)
    this.dps = [];
    let src = Array.from(s);
    if (k === 7 || k === 14 || k === 16) {
      const out: string[] = [];
      for (const c of src) { if ((c === '.' || c === ',') && out.length && !/[.,]/.test(out[out.length - 1]!)) this.dps[out.length - 1] = true; else out.push(c); }
      src = out;
    }
    const next = src.slice(0, n).join('').padEnd(n, ' ');
    this.flips = [];
    if (this.o.kind === 'flip' && flip) {
      const prev = Array.from(flip.from.padEnd(n, ' '));
      Array.from(next).forEach((c, k) => { if (prev[k] !== c) this.flips[k] = { from: prev[k] ?? ' ', to: c, t0: flip.t0 }; });
    }
    this.text = next;
    this.write();
  }
  /** Brightness per cell (e.g. from a word's sung cursor), or one value for all (bone 0.8 at 1). */
  setLit(v: number | number[]) {
    this.lit = typeof v === 'number' ? this.lit.map(() => v) : v.slice(0, this.o.chars);
    this.colors.fill(null);
    this.write();
  }
  /** (p1v4) Isolation of cells [k0, k1): × their light (heroIsolate sets it every frame; 0 = off, elements raw). */
  setIso(k0: number, k1: number, k: number) {
    let dirty = false;
    for (let i = Math.max(0, k0); i < Math.min(this.o.chars, k1); i++) if (this.iso[i] !== k) { this.iso[i] = k; this.buf[(2 * this.o.chars + i) * 4 + 1] = k; dirty = true; }
    if (dirty) this.data.needsUpdate = true;
  }
  /** Emission colour (linear RGB) of one cell's lit elements; null = bone × lit. */
  setCell(k: number, rgb: [number, number, number] | null) {
    if (k < 0 || k >= this.o.chars) return;
    this.colors[k] = rgb;
    this.writeCell(k);
    this.data.needsUpdate = true;
  }
  /** Flip schedule: cell k shows `to` from t (flap falls over 90 ms before it). */
  flipCell(k: number, from: string, to: string, t0: number) { this.flips[k] = { from, to, t0 }; }
  update(t: number) {
    if (this.o.kind !== 'flip') return;
    let dirty = false;
    this.flips.forEach((f, k) => {
      if (!f) return;
      const p = Math.max(0, Math.min(1, (t - (f.t0 - 0.09)) / 0.09));
      const i = k * 4;
      const ix = (c: string) => this.atlas?.idx.get(up(c)) ?? -1;
      this.buf[i + 2] = p > 0 ? ix(f.to) : ix(f.from);
      this.buf[i + 3] = p > 0 && p < 1 ? p : p >= 1 ? 1 : 0;
      this.buf[((2 * this.o.chars + k) * 4)] = ix(f.from);
      if (p <= 0) this.buf[i + 3] = 1, this.buf[i + 2] = ix(f.from);
      dirty = true;
    });
    if (dirty) this.data.needsUpdate = true;
  }
  private writeCell(k: number) {
    const n = this.o.chars, ch = Array.from(this.text)[k] ?? ' ';
    const i0 = k * 4, i1 = (n + k) * 4, i2 = (2 * n + k) * 4;
    const kind = this.o.kind;
    if (kind === 'dot5x7') { const [a, b] = dotMask(ch); this.buf[i0] = a; this.buf[i0 + 1] = b; }
    else if (kind === 7 || kind === 14 || kind === 16) this.buf[i0] = segMask(ch, kind) | (this.dps[k] ? 1 << 16 : 0);
    else if (kind === 'nixie') this.buf[i0 + 2] = /[0-9]/.test(ch) ? +ch : -1;
    else if (kind === 'flip') { const ix = this.atlas?.idx.get(up(ch)) ?? -1; this.buf[i0 + 2] = ix; this.buf[i0 + 3] = 1; this.buf[i2] = ix; }
    this.buf[i2 + 1] = this.iso[k] ?? 1;
    const c = this.colors[k];
    const l = this.lit[k] ?? 0;
    const bone = SUNG_COL.bone;
    const rgb = c ?? [bone[0] * l, bone[1] * l, bone[2] * l];
    this.buf[i1] = rgb[0]; this.buf[i1 + 1] = rgb[1]; this.buf[i1 + 2] = rgb[2];
    this.buf[i1 + 3] = rgb[0] + rgb[1] + rgb[2] > 1e-5 ? 1 : 0;
  }
  private write() {
    for (let k = 0; k < this.o.chars; k++) this.writeCell(k);
    this.data.needsUpdate = true;
  }
  dispose() { this.mat.dispose(); this.data.dispose(); this.obj.removeFromParent(); }
}

/** 5×7 dot matrix (marquees, the lamp status window, nameplates). */
export class DotMatrix extends SegDisplay {
  constructor(o: Omit<SegOpts, 'kind'>) { super({ ...o, kind: 'dot5x7' }); }
}

// ================================================================ F4 lyric carriers

/** Options of cellColor (p1v4): a slam's sweep, the front-only white-hot, the old mode. */
export interface CellOpts {
  /** this cell's index in the word and the word's cell count: a slam (every cell reached at once) sweeps left → right */
  j?: number; n?: number;
  /** sweep duration (s), default FAB_V4.sweep (3 frames) */
  sweep?: number;
  /** this cell is the fabrication front (the newest lit cell): only the front is white-hot; default = (j === undefined) (v3: every cell for 50 ms) */
  front?: boolean;
  /** after the line: 'fade' (default FAB_V4.old: ash, then off) or 'ash' (stays at the v4 ash) */
  old?: OldMode;
}

/**
 * Colour of a cell for a sung state: raw → white-hot (50 ms from `reachT`) → bone × glow → ash → graphite (linear RGB,
 * [0, 0, 0] = the cell off). p1v4: the v4 ash / dead levels and the old fade (the cell switches off by the line's end
 * + 0.7 s); with `o.j / o.n` the word sweeps on left → right over `o.sweep` (cell j at reachT + sweep · j / (n − 1)),
 * white-hot one frame and only at the front — a slammed word never flashes the whole board above bone 0.8.
 */
export function cellColor(s: SungState, lit: boolean, reachT: number, t: number, hotGain = 5, o: CellOpts = {}): [number, number, number] {
  if (!lit) return [0, 0, 0];
  const sweep = o.j !== undefined && o.n !== undefined && o.n > 1;
  const tOn = sweep ? reachT + (o.sweep ?? FAB_V4.sweep) * (o.j! / (o.n! - 1)) : reachT;
  if (sweep && t < tOn) return [0, 0, 0];
  const fixed = s.t === 0;
  const mode = o.old ?? FAB_V4.old;
  const fade = fixed ? 0 : fabFadeOf(s, mode);
  if (fade >= 1) return [0, 0, 0];
  const bone = SUNG_COL.bone, hot = SUNG_COL.hot;
  const ash = fixed ? SUNG_COL.ash : FAB_V4.ash, dead = fixed ? SUNG_COL.dead : FAB_V4.dead;
  const g = s.glow;
  // (v4 fade: the colour reaches ash at 60 % of the line-end ramp, then the cell goes off)
  const ak = fixed || (mode !== 'fade' && mode !== 'retract') ? s.ash : Math.min(1, s.ash / 0.6);
  let c: [number, number, number] = [bone[0] * g, bone[1] * g, bone[2] * g];
  c = [c[0] + (ash[0] - c[0]) * ak, c[1] + (ash[1] - c[1]) * ak, c[2] + (ash[2] - c[2]) * ak];
  // retired: graphite (v4: below legibility on the board)
  const dk = fixed ? 0.9 : 1;
  c = [c[0] + (dead[0] * dk - c[0]) * s.dead, c[1] + (dead[1] * dk - c[1]) * s.dead, c[2] + (dead[2] * dk - c[2]) * s.dead];
  const front = o.front ?? !sweep;
  const hotDur = sweep ? 1 / 60 : SUNG_T.hot;
  if (front && t - tOn < hotDur && s.dead < 1) { const k = 1 - s.dead; c = [hot[0] * hotGain * k + c[0] * (1 - k), hot[1] * hotGain * k + c[1] * (1 - k), hot[2] * hotGain * k + c[2] * (1 - k)]; }
  const f = 1 - fade;
  return [c[0] * f, c[1] * f, c[2] * f];
}

/** (p1v4) A slam's cell schedule: cell j of n switches on at t0 + sweep · j / (n − 1); `front` = the newest one (white-hot for one frame). */
export function slamCells(n: number, t0: number, t: number, sweep: number = FAB_V4.sweep): { on: boolean[]; front: number } {
  const on: boolean[] = [];
  let front = -1;
  for (let j = 0; j < n; j++) { const tj = t0 + (n > 1 ? sweep * (j / (n - 1)) : 0); on.push(t >= tj); if (t >= tj && t - tj < 1 / 60) front = j; }
  return { on, front };
}

/**
 * F4: words on ONE display, one carrier per word (marquee 'YOU WERE', TTL 'UNTIL THE NEXT'): cells light one by one as
 * each word's cursor reaches them (the white-hot is the cell switching on). Hardware: the bezel (and tubes).
 * p1v4: only the newest cell is white-hot (≤ 50 ms); a word whose cells would all light within FAB_V4.sweep (or
 * `slam`: every cell at the word's start / at `slam` s) sweeps left → right over it; old 'fade' (default) / 'ash';
 * per-word isolation (heroIsolate); `poster` (default: cellH ≥ 1.2 m) = the stadium-board construction.
 */
export function segLine(words: readonly Word[], o: Omit<FabOpts, 'word'> & { kind?: SegKind; texts?: string[]; pad?: number; display?: SegDisplay; slam?: boolean | number; sweep?: number; module?: number; cellW?: number }): Fab & { display: SegDisplay } {
  const kind = o.kind ?? 'dot5x7';
  const texts = words.map((w, i) => o.texts?.[i] ?? fabText(w.w));
  const pad = o.pad ?? 0;
  const full = ' '.repeat(pad) + texts.join(' ');
  const n = Array.from(full).length + pad;
  // (p1v4) `cellW` (× cellH when ≤ 2, else metres): a tighter cell pitch for a poster word that must fit the frame
  const aspect0 = CELL_ASPECT[String(kind)] ?? 0.62;
  const capK = kind === 'dot5x7' ? 1 : kind === 7 || kind === 14 || kind === 16 ? 0.86 : 0.74;
  const fake: FabOpts = { ...(o as FabOpts), word: words[0]! };
  const aspect = o.cellW !== undefined && o.cellW <= 2 ? o.cellW : aspect0;
  const cellH = resolveCap(fake, (n * aspect) / capK) / capK;
  const cellW = o.cellW === undefined ? undefined : o.cellW <= 2 ? o.cellW * cellH : o.cellW;
  const disp = o.display ?? new SegDisplay({ kind, chars: n, cellH, cellW, bezel: o.hardware !== false, poster: o.poster ?? cellH >= 1.2, module: o.module });
  disp.setText(full);
  disp.setLit(0);
  const root = new THREE.Group(); root.name = `fab_F4_${texts.join('_')}`;
  const ax = o.align === 'center' ? -disp.width / 2 : o.align === 'right' ? -disp.width : 0;
  disp.obj.position.x = ax;
  root.add(disp.obj);
  o.parent?.add(root);
  const carriers: LyricCarrier[] = [];
  const sweep = o.sweep ?? FAB_V4.sweep;
  const mode = o.old ?? FAB_V4.old;
  const items: { w: Word; k0: number; k1: number; sung: (t: number) => SungState; reach: number[] }[] = [];
  let k = pad;
  words.forEach((w, i) => {
    const len = Array.from(texts[i]!).length;
    const k0 = k, k1 = k + len;
    k = k1 + 1;
    const spans: [number, number][] = Array.from({ length: len }, (_, j) => [j, j + 1]);
    const map = letterCursor(w, texts[i]!, spans);
    const capH = disp.capH;
    const base = (t: number): SungState => {
      const s = sungState(w, t, { lineEnd: o.lineEnd, deprecateT: o.deprecateT, method: 'F4', pitch: o.pitch });
      // cells switch on whole: the cursor is quantised to the cells that are on
      const c = map(s.cursor);
      const cells = Math.min(len, Math.ceil(c * len - 1e-9));
      s.cursor = c >= 1 ? 1 : cells / len;
      s.started = s.cursor > 0;
      return s;
    };
    // the cell schedule: the cursor's reach times; a slam (or cells within one sweep) spreads left → right over `sweep`
    let reach = Array.from({ length: len }, (_, j) => cursorTime(base, w, (j + 0.5) / len));
    const t0 = typeof o.slam === 'number' ? o.slam : reach[0]!;
    if (o.slam !== undefined && o.slam !== false) reach = reach.map((_, j) => t0 + (len > 1 ? sweep * (j / (len - 1)) : 0));
    else if (len > 1 && reach[len - 1]! - reach[0]! < sweep) reach = reach.map((_, j) => reach[0]! + sweep * (j / (len - 1)));
    const litAt = (t: number) => { let c = 0; for (const r of reach) if (t >= r) c++; return c; };
    const sung = (t: number): SungState => {
      const s = sungState(w, t, { lineEnd: o.lineEnd, deprecateT: o.deprecateT, method: 'F4', pitch: o.pitch });
      const cq = t >= w.end ? 1 : litAt(t) / len;
      s.cursor = cq;
      s.hotW = Math.max(0, cq - (t - SUNG_T.hot >= w.end ? 1 : litAt(t - SUNG_T.hot) / len));
      s.started = cq > 0;
      return s;
    };
    const box = new THREE.Box3(new THREE.Vector3(k0 * disp.cellW, disp.capY, 0), new THREE.Vector3(k1 * disp.cellW, disp.capY + capH, 0));
    const c = registerFab({ ...(o as FabOpts), word: w, method: 'F4', text: texts[i], id: o.id && words.length === 1 ? o.id : undefined }, texts[i]!, disp.obj, box, capH, sung);
    fabIsoTarget(c.id, (kk) => disp.setIso(k0, k1, kk));
    carriers.push(c);
    items.push({ w, k0, k1, sung, reach });
  });
  const lineEnd0 = Math.max(o.lineEnd ?? words[0]!.end, words[0]!.end);
  return {
    obj: root, carriers, display: disp, width: disp.width, capH: disp.capH, method: 'F4',
    phase: (t) => fabPhase(words[0]!, t, lineEnd0),
    oldAt: lineEnd0 + OLD_AFTER,
    center: (out = new THREE.Vector3()) => out.copy(faceWorld(carriers[0]!)?.center ?? out),
    iso: (kk) => { for (const it of items) disp.setIso(it.k0, it.k1, kk); },
    update(t) {
      for (const it of items) {
        const s = it.sung(t);
        const len = it.k1 - it.k0;
        // the fabrication front: the newest lit cell (only it is white-hot)
        let front = -1, tf = -Infinity;
        for (let j = 0; j < len; j++) if (t >= it.reach[j]! && it.reach[j]! >= tf) { tf = it.reach[j]!; front = j; }
        for (let j = 0; j < len; j++) disp.setCell(it.k0 + j, cellColor(s, t >= it.reach[j]! || t >= it.w.end, it.reach[j]!, t, 5, { front: j === front, old: mode }));
      }
      disp.update(t);
    },
    cursor(t) {
      for (const it of items) { const s = it.sung(t); if (s.started && !s.done) return disp.obj.localToWorld(new THREE.Vector3((it.k0 + (it.k1 - it.k0) * s.cursor) * disp.cellW, disp.capY + disp.capH / 2, 0)); }
      return null;
    },
    dispose() { root.removeFromParent(); for (const c of carriers) lyricReg.unregister(c.id); if (!o.display) disp.dispose(); },
  };
}

/** F4: a sung word on a display (one carrier): a display sized to the word (`pad` blank cells each side). */
export function segWord(o: FabOpts & { kind?: SegKind; pad?: number; slam?: boolean | number; sweep?: number; module?: number; cellW?: number }): Fab {
  const f = segLine([o.word], { ...o, texts: o.text ? [o.text] : undefined });
  void fabLong;
  return f;
}

/**
 * (p1v4) F4 slammed on (§12.4 DEADLINE “砸亮”, a hook word struck on its hit): the whole word strikes at the word's
 * start (or at `at` s) as a left → right sweep over FAB_V4.sweep (3 frames), white-hot one frame at the front only,
 * then bone; poster by default (a stadium board: LED lamps, panel modules). One display, one carrier.
 */
export function segSlam(o: FabOpts & { kind?: SegKind; pad?: number; at?: number; sweep?: number; module?: number; cellW?: number }): Fab & { display: SegDisplay } {
  return segLine([o.word], { ...o, texts: o.text ? [o.text] : undefined, slam: o.at ?? true, poster: o.poster ?? true });
}
