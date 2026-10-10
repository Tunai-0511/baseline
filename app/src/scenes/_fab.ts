// Lyric fabrication (TREATMENT §7.1–§7.3, v4 §13.2–§13.3): every sung word is MADE by a machine in the 3D world. Owner: fab.
//
//   F1 galvo laser mark (_laser)      F2 V-groove light guide (here)   F3 extruded solid type (here)
//   F4 physical display (_seg)        F5 pin-bed relief (_pins)        F6 vector-laser projection (_laser)
//   F7 token tiles (_tiles)           F8 silkscreen + UV scan (here)   F9 print on valve glass (here)
//   F10 machined nameplate / tag (here)
//
// One call per sung word; the result is a child of some machine part (never of a camera, never a billboard, never
// Layer2D), lit by the scene's LightRig, and registered in lyricReg so lyricqa can measure it:
//
//   // init(): once per plate (syllables → B5 letter timing, pitch tracks → long notes, BPE tokens → F7)
//   await fabInit(this.ctx.lyrics);
//   const line = this.ctx.lyrics.get('the abstract guaranteed'), w = line.words[2]!;
//   this.g = fabricate({ scene: this.ctx.id, word: w, method: 'F2', capH: 0.85, lineEnd: line.end,
//                        parent: lever.node('face_GUARANTEED'), beats: this.ctx.audio.beats });
//   // render(): after rig.apply()
//   this.g.update(t);                    // pure function of t: sung state §7.2, long notes §7.3, the method's motion
//   this.g.cursor(t)                     // world position of the fabrication point (focus pulls, light, smoke)
//
// Face convention: the lettering lies in the parent's LOCAL XY plane at z = 0, normal +Z, reading +X, glyph up +Y,
// origin at the left end of the baseline (align 'left'; 'center' / 'right' move the origin). A glb marks where a word
// goes with an Empty `face_<WORD>` whose scale is (face width, cap height, 1): fabricate() reads that scale (capH ≤ 0
// → the node's cap; the word shrinks to fit the node's width) and resets it to 1. Lettering is never baked into a glb.
//
// Sung state (§7.2) for every method, v4 (§13.3, p1v4 2026-10-09):
//   unsung   NOT MADE YET. 'deadfront' (default): nothing of the word shows before the cursor reaches it — a dead-front
//            light guide, invisible UV ink, a blank tag, letters of matte ink that take no grazing light, pins flush,
//            displays off — so an unsung word is unreadable (contrast 1 : 1, gate: ≤ 1.5 : 1). FabOpts.unsung 'raw' = v3.
//   current  white-hot 50 ms at the fabrication point (≤ 0.45 cap wide: a point, not a smear) → bone 0.8 linear.
//   sung     bone, held until the line's end + 0.3 s.
//   old      the line's end + 0.3 → + 0.7 s (the gate's 'old' starts at + 0.7): FabOpts.old, default 'fade' — drops to the
//            v4 ash (FAB_V4.ash ≈ 0.020 linear, display ≈ 0.30 under GRADE_BRIGHT) and then goes back to dead-front, so
//            it is unreadable whatever the plate's focus; 'ash' stays at ash (the plate must defocus it: CoC ≥ 1.5 px,
//            see oldFaces / cocAt); 'soft' stays at ash and dissolves like a defocused word (decals); 'retract' fades
//            and pulls the part back into its machine (F3 letters sink, F5 pins drop).
//   dead     the owning machine deprecated (`deprecateT`): graphite FAB_V4.dead (≈ 0.0085, below legibility).
// A fixed state (t = 0: engraved labels, ratings) keeps the v3 ash. The cursor is letter-and-syllable aware: with
// syl.json loaded (fabInit), each syllable's letters are made during that syllable (B5 schedule). Meaning-actions
// (crush, fall, shatter) only after word.end (lyricreg.afterWord).
//
// p1v4 helpers (KITS §23): heroIsolate() (one hero word per frame: the other lines' carriers go dark), fabPhase() /
// Fab.phase(t) / Fab.oldAt (the gate's four states), oldFaces() + cocAt() (old faces still sharp → push the focus),
// capPxFor / distForPx / focalForPx / capForPx / capPxOf (poster framing: STATE 160, NOW 200 … px at onset), poster
// solid type (F3 ≥ 1.5 m cap: channel letters with a trim cap, panel seams + screws on the returns, a diffuser with
// its inner light) and poster displays (_seg).
//
// Shared pieces other kits and plates may use: textMask() (signed-distance text masks), faceDecal() (the lettering
// finishes as one lit shader: groove / ablate / silk / print / inlay / project), fabSung() (the registered sung
// state), registerFab(), extrudedText() (lit solid glyphs), bevelBox() / capScrew() (machined-part geometry).
// Method kits import these functions from here and only call them at runtime (ESM cycle-safe: no top-level use).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Word, Lyrics } from '../engine/lyrics';
import { Lyrics as LyricsCls } from '../engine/lyrics';
import { F, font, layout, ot } from '../engine/type';
import { GLSL_COMMON } from '../engine/glsl/common';
import { LIN } from '../engine/palette';
import {
  fabText, lyricReg, sungState, setSungUniforms, sungUniforms, longNote, loadPitch, pitchKey, fetchData,
  HOOK_WORDS, EXISTS_ONLY_BEHIND_CURSOR, SUNG_GLSL, SUNG_T, isLongNote, LONG_WIDTHS,
  type FabMethod, type LyricCarrier, type PitchTrack, type CarrierTrait, type SungState, type PitchBank, type LongNote, type FaceSpec,
} from '../engine/lyricreg';
import { LIGHT_GLSL, LIGHT_UNIFORMS, LIT_VERT, SURF } from './_light';
import { mat, MAT_GLSL } from './_mat';
import { laserMark, projectWord } from './_laser';
import { segWord } from './_seg';
import { tileWord, loadBPE } from './_tiles';
import { pinWord } from './_pins';

export type { FabMethod };

export interface FabOpts {
  /** ctx.id of the owning timeline entry */
  scene: string;
  /** the sung word (from ctx.lyrics) */
  word: Word;
  method: FabMethod;
  /** letters made (default fabText(word.w): upper case, no trailing punctuation) */
  text?: string;
  /** cap height (m); ≤ 0 with a `face_*` parent = the node's cap height */
  capH: number;
  /** end of the word's line (bone holds until lineEnd + 0.3 s, then ash); default word.end */
  lineEnd?: number;
  /** owning machine deprecated → graphite (from the _machine ledger) */
  deprecateT?: number;
  /** hook word (≥ 80 px); default HOOK_WORDS.has(text) */
  hook?: boolean;
  /** font family (engine/type F.*): default Archivo 100/900 (F2, F3), Archivo 100/700 (F1, F6, F9, F10), Plex Mono 600 (F7, F8) */
  font?: string;
  align?: 'left' | 'center' | 'right';
  /** parent object (machine part, glb `face_*` node); the face lies in its local XY plane */
  parent?: THREE.Object3D;
  /** depth of solid type / engraving (m) */
  depth?: number;
  /** long-note pitch track (default: from fabInit's bank when the word is a long note) */
  pitch?: PitchTrack | null;
  /** AudioData.beats, for the long-note width ladder (F3) and display flicker */
  beats?: readonly number[];
  /** LEADERBOARD: song time after which bleed past the frame edge is allowed */
  bleedAfter?: number;
  traits?: CarrierTrait[];
  /** carrier id (default `${scene}/${text}@${word.gi}`) */
  id?: string;
  // ---- additive (Phase 0 fab) ----
  /** fit the word into this width (m): shrinks capH if the word is wider (default: a face_* node's width) */
  width?: number;
  /** build the method's own hardware (galvo head, scanner, tag hinge, valve, tile track …); default true */
  hardware?: boolean;
  /** mask resolution: px per cap height of the text mask (default 160; raise for faces > 200 px cap on screen) */
  capPx?: number;
  /** extra letter spacing (em) */
  tracking?: number;
  /** fill brightness multiplier (default 1); never above 1 for lettering (bone peaks at 0.8 linear) */
  lit?: number;
  /** override the carrier's lyricqa window (default [word.start − 0.10, word.end + 0.25]) */
  qa?: [number, number];
  // ---- additive (p1v4 fab, KITS §23) ----
  /** after the line (line end + 0.3 → + 0.7 s): 'fade' (default: ash, then back to dead-front), 'ash', 'soft', 'retract' */
  old?: OldMode;
  /** before the cursor: 'deadfront' (default: not made, unreadable) or 'raw' (the v3 raw state: dark but present) */
  unsung?: UnsungMode;
  /** F1: the 20 % graphite toolpath preview before the mark (v3); default false in v4 (it made unsung words readable) */
  preview?: boolean;
  /** F3: poster construction (channel letters: trim cap, panel seams + screws, the diffuser's inner light); default auto (cap ≥ 1.5 m) */
  poster?: boolean;
  /** the gate's subject flag (lyricReg.mark): false = the onset cap target does not apply (a small word riding a wide) */
  subject?: boolean;
}

/** A fabricated word (or line of words). */
export interface Fab {
  /** root object: added to `parent` if given, else add it yourself */
  obj: THREE.Object3D;
  /** the registered lyric carriers (one per word) */
  carriers: LyricCarrier[];
  /** set everything for song time t (sung state, cursor, long-note width/bend, method animation) */
  update(t: number): void;
  /** world position of the fabrication cursor at t (laser spot, light-guide front …), null when idle — focus pulls and lights read it */
  cursor(t: number): THREE.Vector3 | null;
  /** remove from the scene graph and unregister */
  dispose(): void;
  /** face width (m, local) and cap height actually used (additive) */
  width?: number;
  capH?: number;
  method?: FabMethod;
  // ---- additive (p1v4) ----
  /** the gate's state of the (first) word at t: unsung · current · sung · old (fabPhase) */
  phase?(t: number): FabPhase;
  /** song time the word becomes 'old' (its line's end + 0.7 s): from here it must be ash + out of focus, or gone */
  oldAt?: number;
  /** world centre of the (first) face — aim / focus target */
  center?(out?: THREE.Vector3): THREE.Vector3;
  /** hero isolation: the light of this fab's lettering (1 = full, 0 = dark / not shown); heroIsolate() sets it every frame */
  iso?(k: number): void;
}

// ================================================================ p1v4: the v4 lettering (TREATMENT §13.3)

/** What a word does after its line (line end + 0.3 → + 0.7 s): see the header. */
export type OldMode = 'fade' | 'ash' | 'soft' | 'retract';
/** What a word shows before its cursor: 'deadfront' (nothing: unreadable) or 'raw' (v3: dark but present). */
export type UnsungMode = 'deadfront' | 'raw';
const OLD_ID: Record<OldMode, number> = { fade: 0, ash: 1, soft: 2, retract: 3 };

/** Neutral surface greys (linear RGB) = _light's SURF (graphite #5D5D5D, ash #9B9B9B, ink #0A0A0A with its warm bias, KITS
 *  §23.1): the fab's own surfaces (plates, tiles, valve parts, trim caps) — the v1 palette's graphite #5C5966 is the violet cast. */
export const NEUTRAL = {
  get graphite() { return SURF.graphite as [number, number, number]; },
  get ash() { return SURF.ash as [number, number, number]; },
  get ink() { return SURF.ink as [number, number, number]; },
};

/**
 * The v4 levels of lyric lettering (linear RGB; display value under GRADE_BRIGHT in brackets). Baked into the shaders
 * when a material is built: change them before the plate builds its words (A/B only).
 */
export const FAB_V4 = {
  /** old lines: ash (≈ 0.30 display: the gate's ash ≤ 0.35) */
  ash: [0.0200, 0.0200, 0.0204] as [number, number, number],
  /** retired (deprecated machine): graphite below legibility on an ink face (≈ 0.15) */
  dead: [0.0085, 0.0085, 0.0087] as [number, number, number],
  /** default old mode / unsung mode of every fab (FabOpts.old / .unsung override per word) */
  old: 'fade' as OldMode,
  unsung: 'deadfront' as UnsungMode,
  /** 'soft': blur radius (caps) of the dissolve, and its light × (a defocused word spreads its light) */
  softCaps: 0.45,
  softK: 0.7,
  /** F4 slam: a word that would light at once sweeps left → right over this (s) */
  sweep: 3 / 60,
};

const f5 = (x: number) => x.toFixed(5);
const v3s = (c: readonly number[]) => `vec3(${f5(c[0]!)}, ${f5(c[1]!)}, ${f5(c[2]!)})`;

/**
 * The v4 sung-state chunk for every lyric-face shader: include AFTER SUNG_GLSL. Per material uniforms (fabUniforms()):
 *   uFab  = (iso: the lettering's light, 1 = full | soft 0..1 (extra, on top of the 'soft' mode) | unsung raw (0 dead-front,
 *            1 the v3 raw) | static (1: a fixed state — a label: v3 ash, no v4 old))
 *   uFabB = (old mode 0 fade · 1 ash · 2 soft · 3 retract | ash level ×, 1 | F1 toolpath preview (v4 off) | 0)
 *   vec3  fabFill(Sung s, vec3 raw)  the lettering's colour (v4 ash / dead)
 *   float fabExist(Sung s)           0..1 how much of the lettering is made here (dead-front, old fade, isolation)
 *   float fabFade()  fabSoft()  fabAshC()   the old mode's amounts (from the sung state's ash progress uSungA.z)
 */
export const FAB_GLSL = () => /* glsl */ `
uniform vec4 uFab; uniform vec4 uFabB;
const vec3 FAB_ASH = ${v3s(FAB_V4.ash)};
const vec3 FAB_DEAD = ${v3s(FAB_V4.dead)};
const vec3 FAB_STEEL = ${v3s(NEUTRAL.ash)};
const vec3 FAB_INK = ${v3s(NEUTRAL.ink)};
float fabOldA() { return uFab.w > 0.5 ? 0.0 : clamp(uSungA.z, 0.0, 1.0); }
bool fabFadeMode() { return uFabB.x < 0.5 || uFabB.x > 2.5; }
float fabFade() { return fabFadeMode() ? smoothstep(0.55, 1.0, fabOldA()) : 0.0; }
float fabSoft() { return clamp(max(uFab.y, (uFabB.x > 1.5 && uFabB.x < 2.5) ? fabOldA() : 0.0), 0.0, 1.0); }
float fabAshC() { float a = clamp(uSungA.z, 0.0, 1.0); return uFab.w > 0.5 ? a : (fabFadeMode() ? min(1.0, a / 0.6) : a); }
vec3 fabFill(Sung s, vec3 rawCol) {
  vec3 ash = mix(FAB_ASH * uFabB.y * mix(1.0, ${f5(FAB_V4.softK)}, fabSoft()), SUNG_ASH, uFab.w);
  vec3 dead = mix(FAB_DEAD, SUNG_DEAD, uFab.w);
  vec3 c = mix(rawCol, SUNG_BONE * uSungB.x, s.passed);
  c = mix(c, ash, fabAshC() * s.passed);
  c = mix(c, dead, s.dead);
  return mix(c, SUNG_HOT * uSungB.w, s.hot * (1.0 - s.dead));
}
float fabExist(Sung s) {
  float e = mix(s.passed, s.exist, max(uFab.z, uFab.w));
  return e * (1.0 - fabFade()) * uFab.x;
}`;

/** Fresh v4 uniforms for one lyric material (not shared). Defaults: FAB_V4.old / .unsung, iso 1. */
export function fabUniforms(o: FabLook = {}): Record<string, THREE.IUniform> {
  const u: Record<string, THREE.IUniform> = { uFab: { value: new THREE.Vector4(1, 0, FAB_V4.unsung === 'raw' ? 1 : 0, 0) }, uFabB: { value: new THREE.Vector4(OLD_ID[FAB_V4.old], 1, 0, 0) } };
  setFabLook(u, o);
  return u;
}
export interface FabLook { old?: OldMode; unsung?: UnsungMode; iso?: number; soft?: number; ash?: number; static?: boolean; /** F1: the toolpath preview before the mark */ preview?: boolean }
/** Set the v4 look of a lyric material (or anything holding fabUniforms): old / unsung mode, isolation, extra soft, ash level. */
export function setFabLook(u: Record<string, THREE.IUniform> | undefined, o: FabLook) {
  const a = u?.uFab?.value as THREE.Vector4 | undefined, b = u?.uFabB?.value as THREE.Vector4 | undefined;
  if (!a || !b) return;
  if (o.iso !== undefined) a.x = Math.max(0, o.iso);
  if (o.soft !== undefined) a.y = Math.max(0, Math.min(1, o.soft));
  if (o.unsung !== undefined) a.z = o.unsung === 'raw' ? 1 : 0;
  if (o.static !== undefined) a.w = o.static ? 1 : 0;
  if (o.old !== undefined) b.x = OLD_ID[o.old];
  if (o.ash !== undefined) b.y = o.ash;
  if (o.preview !== undefined) b.z = o.preview ? 1 : 0;
}
/** CPU twin of fabFade(): 0..1 how far a word has gone back to dead-front after its line ('fade' / 'retract'). */
export function fabFadeOf(s: SungState, mode: OldMode = FAB_V4.old): number {
  if (s.t === 0 || (mode !== 'fade' && mode !== 'retract')) return 0;
  const x = Math.max(0, Math.min(1, (s.ash - 0.55) / 0.45));
  return x * x * (3 - 2 * x);
}
/** The old mode a method uses by default (F6 light dies, F8 fluorescence decays, F9 the filament cools: all 'fade'). */
export const oldModeOf = (o: Pick<FabOpts, 'old'>): OldMode => o.old ?? FAB_V4.old;

// ================================================================ p1v4: the gate's four states, isolation, framing

/** The gate's state of a word at t (lyricqa.gateFrame): unsung · current (start − ½ frame … end) · sung · old (line end + 0.7 s). */
export type FabPhase = 'unsung' | 'current' | 'sung' | 'old';
/** A word is 'old' this long after its line's end (SUNG_T.hold + SUNG_T.fade = 0.7 s). */
export const OLD_AFTER = SUNG_T.hold + SUNG_T.fade;
export function fabPhase(w: Pick<Word, 'start' | 'end'>, t: number, lineEnd = w.end, fps = 60): FabPhase {
  if (t < w.start - 0.5 / fps) return 'unsung';
  if (t <= w.end) return 'current';
  return t > Math.max(lineEnd, w.end) + OLD_AFTER ? 'old' : 'sung';
}

interface IsoTarget { apply(k: number): void; mats?: THREE.ShaderMaterial[] }
const isoTargets = new Map<string, IsoTarget>();
const isoCache = new Map<string, { obj: THREE.Object3D; t: IsoTarget }>();
/** Nothing under `o` but the kit's lettering (meshes whose material carries the v4 uniforms), or nothing at all. */
const lettersOnly = (o: THREE.Object3D) => {
  let ok = true;
  o.traverse((x) => { if ((x as THREE.Mesh).isMesh || (x as THREE.Points).isPoints) { const m = (x as THREE.Mesh).material as THREE.ShaderMaterial | undefined; if (!m?.uniforms?.uFab) ok = false; } });
  return ok;
};
/** A custom carrier's lettering is gone: every v4 material of it in a fade mode, past its line's end + 0.7 s (or isolated to 0). */
const fadedOut = (mats: readonly THREE.ShaderMaterial[]) => mats.length > 0 && mats.every((m) => {
  const a = m.uniforms.uFab!.value as THREE.Vector4, b = m.uniforms.uFabB!.value as THREE.Vector4, sa = m.uniforms.uSungA?.value as THREE.Vector4 | undefined;
  return a.x <= 0.01 || (a.w < 0.5 && (b.x < 0.5 || b.x > 2.5) && !!sa && sa.z >= 0.999);
});
/** Register how a carrier's lettering is dimmed (the fab kits do it; plates may for their own carriers). */
export function fabIsoTarget(carrierId: string, apply: (k: number) => void) { isoTargets.set(carrierId, { apply }); }
/** Find the lettering materials of a carrier by itself: its nearest `fab_*` root (≤ 4 levels up), every uFab material in it. */
function autoIso(c: LyricCarrier): IsoTarget {
  const hit = isoCache.get(c.id);
  if (hit && hit.obj === c.obj) return hit.t;
  const roots: THREE.Object3D[] = [];
  for (const o0 of [c.obj, ...(c.parts ?? []).map((p) => p.obj)]) {
    let root: THREE.Object3D = o0, o: THREE.Object3D | null = o0;
    for (let i = 0; o && i < 5; i++, o = o.parent) if (typeof o.name === 'string' && o.name.startsWith('fab_')) { root = o; break; }
    roots.push(root);
  }
  const mats = new Set<THREE.ShaderMaterial>();
  const segs: { d: { setIso(k0: number, k1: number, k: number): void; cellW: number }; k0: number; k1: number }[] = [];
  for (const r of roots) r.traverse((x) => {
    const m = (x as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (m && (m as THREE.ShaderMaterial).uniforms?.uFab) mats.add(m);
    const d = x.userData?.segDisplay as { setIso(k0: number, k1: number, k: number): void; cellW: number; obj: THREE.Object3D } | undefined;
    if (d && !segs.some((s) => s.d === d)) {
      // the carrier's cells: its face box in the display's frame
      const k0 = Math.max(0, Math.round(c.face.box.min.x / d.cellW)), k1 = Math.max(k0 + 1, Math.round(c.face.box.max.x / d.cellW));
      segs.push({ d, k0, k1 });
    }
  });
  const t: IsoTarget = { mats: [...mats], apply(k) { for (const m of mats) (m.uniforms.uFab!.value as THREE.Vector4).x = k; for (const s of segs) s.d.setIso(s.k0, s.k1, k); } };
  isoCache.set(c.id, { obj: c.obj, t });
  return t;
}
/** Set the light of one carrier's lettering (1 = full, 0 = gone): the fab kits' carriers and the plates' custom ones built on them. */
export function setIso(c: LyricCarrier | string, k: number) {
  const car = typeof c === 'string' ? lyricReg.carriers.get(c) : c;
  if (!car) return;
  (isoTargets.get(car.id) ?? autoIso(car)).apply(k);
}

export interface HeroOpts {
  /** 'line' (default): every word of the current line keeps its light (up to `max`); 'word': only the current word (+ the words still in their QA window) */
  keep?: 'line' | 'word';
  /** light of the carriers that are not kept (default 0: dark — unsung ones are dead-front anyway, old ones go) */
  others?: number;
  /** light of the current line's sung words (default 1; 0.5 = one stop down, §13.4) */
  sung?: number;
  /** at most this many lit carriers of the current line: the current word + the latest sung ones (default 3, §13.3) */
  max?: number;
  /** a carrier that loses its light fades over this long (s, default 0.25) from the moment it was pushed out */
  ramp?: number;
  /** carriers never touched (ids) */
  except?: readonly string[];
  /** the frame rate the gate measures at (½ frame lead of 'current'), default 60 */
  fps?: number;
}
/**
 * One hero word per frame (§13.3): the current line's carriers keep their light — at most `max` of them, the current
 * word and the latest sung ones — and every other carrier of the scene goes to `others` (default 0: dark), fading over
 * `ramp` from the moment it was pushed out (a new word of the line, a new line). A carrier inside its lyricqa window
 * is never dimmed. Pure: call it EVERY frame after the fabs' update (it sets every carrier of the scene) —
 * `heroIsolate(scene, null)` gives every carrier its light back. Returns the current line (−1 before the first) and the
 * ids still lit (> 0.5).
 */
export function heroIsolate(scene: string, t: number | null, o: HeroOpts = {}): { line: number; lit: string[] } {
  const cs = lyricReg.forScene(scene);
  if (t === null) { for (const c of cs) setIso(c, 1); return { line: -1, lit: cs.map((c) => c.id) }; }
  const lead = 0.5 / (o.fps ?? 60), RAMP = Math.max(1e-3, o.ramp ?? 0.25);
  const fall = (t0: number) => { const x = Math.max(0, Math.min(1, (t - t0) / RAMP)); return 1 - x * x * (3 - 2 * x); };
  const ly = fabLyrics();
  let line = -1, lineT = -Infinity;
  if (ly) { for (const L of ly.lines) if (L.words.length && L.words[0]!.start - lead <= t) { line = L.i; lineT = L.words[0]!.start - lead; } }
  else for (const c of cs) if (c.word.start - lead <= t && c.word.line >= line) { if (c.word.line > line) lineT = Infinity; line = c.word.line; lineT = Math.min(lineT, c.word.start - lead); }
  const except = new Set(o.except ?? []);
  const others = o.others ?? 0, sungK = o.sung ?? 1, max = Math.max(1, o.max ?? 3);
  // per line: the made (started) carriers, latest first
  const byLine = new Map<number, LyricCarrier[]>();
  for (const c of cs) if (c.word.start - lead <= t) { const a = byLine.get(c.word.line) ?? []; a.push(c); byLine.set(c.word.line, a); }
  for (const a of byLine.values()) a.sort((x, y) => y.word.start - x.word.start);
  const lit: string[] = [];
  for (const c of cs) {
    if (except.has(c.id)) continue;
    const [q0, q1] = lyricReg.window(c);
    let k = 1;
    if (!(t >= q0 && t <= q1) && c.word.start - lead <= t) {
      const arr = byLine.get(c.word.line)!, r = arr.indexOf(c);
      const base = t > c.word.end ? sungK : 1;
      // pushed out of the line's lit set by the `max`-th word after it (or, keep 'word', by the next one)
      const pushT = o.keep === 'word' ? (r > 0 ? arr[r - 1]!.word.start - lead : Infinity) : (r >= max ? arr[r - max]!.word.start - lead : Infinity);
      k = Number.isFinite(pushT) ? others + (base - others) * fall(pushT) : base;
      // an earlier line goes when the current one starts
      if (c.word.line < line) k = Math.min(k, others + (base - others) * fall(lineT));
    }
    setIso(c, k);
    if (k > 0.5) lit.push(c.id);
  }
  return { line, lit };
}

/** Pixels per (focal mm × cap m / distance m) at 1080 lines: the full-frame 16:9 crop is 20.25 mm tall (§13.1: 53.3). */
const PXK = (H: number) => H / 20.25;
/** Cap height in px of `capH` (m) at `dist` (m along the view axis) through a `focalMm` lens (H lines, default 1080). */
export const capPxFor = (capH: number, dist: number, focalMm: number, H = 1080) => (PXK(H) * focalMm * capH) / Math.max(1e-6, dist);
/** The cap height (m) that reads `px` at `dist` through `focalMm`. */
export const capForPx = (px: number, dist: number, focalMm: number, H = 1080) => (px * dist) / (PXK(H) * Math.max(1e-6, focalMm));
/** The distance (m) at which `capH` reads `px` through `focalMm` (lock-on framing: STATE 160 px at 24 mm → d = 0.4 · capH · 24 · …). */
export const distForPx = (capH: number, px: number, focalMm: number, H = 1080) => (PXK(H) * focalMm * capH) / Math.max(1e-6, px);
/** The focal length (mm) at which `capH` reads `px` from `dist` (dolly-zoom: keep px, vary dist). */
export const focalForPx = (capH: number, px: number, dist: number, H = 1080) => (px * dist) / (PXK(H) * Math.max(1e-6, capH));

export interface FaceWorld { center: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; normal: THREE.Vector3; capH: number; width: number }
const _fw = new THREE.Vector3();
/** A carrier face (part k) in world space: centre of its front plane, reading / up / normal axes, cap and width (m). */
export function faceWorld(f: Fab | LyricCarrier, k = 0): FaceWorld | null {
  const c: LyricCarrier | undefined = (f as Fab).carriers ? (f as Fab).carriers[0] : (f as LyricCarrier);
  if (!c) return null;
  const face: FaceSpec = k > 0 && c.parts?.[k] ? c.parts[k]!.face : c.face;
  const obj = k > 0 && c.parts?.[k] ? c.parts[k]!.obj : c.obj;
  obj.updateWorldMatrix(true, false);
  const n = (face.normal ?? new THREE.Vector3(0, 0, 1)).clone().normalize(), u = (face.up ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
  const r = new THREE.Vector3().crossVectors(u, n).normalize();
  const ctr = face.box.getCenter(new THREE.Vector3());
  const sz = face.box.getSize(new THREE.Vector3());
  const m3 = new THREE.Matrix3().setFromMatrix4(obj.matrixWorld);
  const sx = _fw.copy(r).applyMatrix3(m3).length();
  const sy = new THREE.Vector3().copy(u).applyMatrix3(m3).length();
  return {
    center: ctr.applyMatrix4(obj.matrixWorld),
    right: r.clone().applyMatrix3(m3).normalize(), up: u.clone().applyMatrix3(m3).normalize(), normal: n.clone().transformDirection(obj.matrixWorld),
    capH: face.capH * sy, width: Math.abs(sz.dot(new THREE.Vector3(Math.abs(r.x), Math.abs(r.y), Math.abs(r.z)))) * sx,
  };
}
/** Projected cap height (px, 1920×1080 logical) of a fab / carrier seen by `cam`, at the face centre along its up axis (as lyricqa.capPx). */
export function capPxOf(f: Fab | LyricCarrier, cam: THREE.Camera, H = 1080, k = 0): number {
  const fw = faceWorld(f, k);
  if (!fw) return 0;
  cam.updateMatrixWorld();
  const a = fw.center.clone().addScaledVector(fw.up, -fw.capH / 2).project(cam), b = fw.center.clone().addScaledVector(fw.up, fw.capH / 2).project(cam);
  return Math.hypot((b.x - a.x) * 0.5 * H * (16 / 9), (b.y - a.y) * 0.5 * H);
}
/** Circle of confusion (px, 1080 lines) of a world point for a Dof(focus = view depth, aperture, maxR) — the plate's DoF (as _look.dofCoc). */
export function cocAt(p: THREE.Vector3, cam: THREE.Camera, focus: number, aperture: number, maxR = 14): number {
  cam.updateMatrixWorld();
  const z = -p.clone().applyMatrix4(cam.matrixWorldInverse).z;
  if (!(aperture > 0) || !(focus > 0) || z <= 0) return 0;
  return Math.min(1, Math.max(0, aperture * Math.abs(1 / focus - 1 / z) * focus)) * maxR;
}
/**
 * The scene's carriers that are 'old' at t, in frame and still visible as lettering, with their CoC under the scene's
 * reported view (lyricReg.view): `sharp` ones (CoC < 1.5 px) fail the gate unless their light is ≤ 1.5 : 1 — a plate
 * using FabOpts.old 'ash' / 'soft' pushes its focus or retires them (setIso(c, 0)).
 */
export function oldFaces(scene: string, t: number): { id: string; text: string; coc: number; sharp: boolean; center: THREE.Vector3 }[] {
  const v = lyricReg.viewOf(scene);
  if (!v) return [];
  const ly = fabLyrics();
  const out: { id: string; text: string; coc: number; sharp: boolean; center: THREE.Vector3 }[] = [];
  for (const c of lyricReg.forScene(scene)) {
    const lineEnd = ly?.lines[c.word.line]?.end ?? c.word.end;
    if (fabPhase(c.word, t, lineEnd) !== 'old') continue;
    const fw = faceWorld(c);
    if (!fw) continue;
    const p = fw.center.clone().project(v.cam);
    if (p.z < -1 || p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
    const coc = cocAt(fw.center, v.cam, v.focus ?? 0, v.aperture ?? 0, v.maxR ?? 14);
    out.push({ id: c.id, text: c.text, coc, sharp: coc < 1.5, center: fw.center });
  }
  return out;
}

// ================================================================ side data (syllable parts, pitch, BPE)

const sylParts = new Map<string, string[]>();
let pitchBankP: PitchBank | null = null;
let sylJ: { words: { line: number; word: number; syl?: [number, number][]; parts?: string[] }[] } | null = null;
let initP: Promise<void> | null = null;
let fabLy: Lyrics | null = null;
/** The Lyrics instance fabInit was last given (F7 needs the line texts to align BPE tokens). */
export const fabLyrics = () => fabLy;

/**
 * Load the lyric side data once per page: syl.json (sets Word.syl on `ly` → syllable-aware cursors; keeps the syllable
 * letter parts for the B5 letter schedule) and the pitch tracks (long notes). Idempotent; call in init() (every Lyrics
 * instance passed gets its syllables).
 */
export async function fabInit(ly: Lyrics): Promise<void> {
  initP ??= (async () => {
    const [syl, bank] = await Promise.all([fetchData<NonNullable<typeof sylJ>>('syl.json'), loadPitch()]);
    sylJ = syl;
    for (const s of syl?.words ?? []) if (s.parts?.length) sylParts.set(`${s.line}:${s.word}`, s.parts);
    pitchBankP = bank;
  })();
  await initP;
  fabLy = ly;
  await loadBPE();
  for (const s of sylJ?.words ?? []) {
    const w = ly.lines[s.line]?.words[s.word];
    if (w && s.syl?.length) w.syl = s.syl;
  }
}
/** Syllable letter groups of a word (from syl.json), e.g. ['guar', 'an', 'teed'], or null. */
export const syllableParts = (w: Pick<Word, 'line' | 'index'>) => sylParts.get(`${w.line}:${w.index}`) ?? null;
/** Pitch track of a word if fabInit loaded one (long notes, §7.3). */
export const fabPitch = (w: Pick<Word, 'line' | 'index'>): PitchTrack | null => pitchBankP?.get(pitchKey(w.line, w.index)) ?? null;

// ================================================================ the letter / syllable cursor (B5 schedule)

/**
 * Map of the sung progress p (Lyrics.wordProgress: syllable i fills [i/n, (i+1)/n]) to the reading position u (0..1 of
 * the face width): each syllable's letters (syl.json parts) are made during that syllable, letters within a syllable by
 * their width. `spans` = [x0, x1] of each character of `text` (any unit). Without parts: u = p by letter widths.
 */
export function letterCursor(w: Word, text: string, spans: readonly [number, number][]): (p: number) => number {
  const x0 = spans.length ? spans[0]![0] : 0, x1 = spans.length ? spans[spans.length - 1]![1] : 1, W = Math.max(1e-9, x1 - x0);
  const parts = syllableParts(w);
  const chars = Array.from(text);
  const alnum = (c: string) => /[\p{L}\p{N}]/u.test(c);
  if (parts && parts.length > 1 && spans.length === chars.length) {
    const lens = parts.map((p) => Array.from(p).filter(alnum).length);
    const total = lens.reduce((a, b) => a + b, 0);
    const letterIdx: number[] = []; chars.forEach((c, i) => { if (alnum(c)) letterIdx.push(i); });
    if (total === letterIdx.length && total > 0) {
      // syllable i covers the characters from its first letter to the next syllable's first letter (punctuation joins the earlier one)
      const bounds: number[] = [];
      let acc = 0;
      for (let i = 0; i < lens.length; i++) { bounds.push(i === 0 ? x0 : spans[letterIdx[acc]!]![0]); acc += lens[i]!; }
      bounds.push(x1);
      const n = lens.length;
      return (p) => {
        if (p <= 0) return 0;
        if (p >= 1) return 1;
        const i = Math.min(n - 1, Math.floor(p * n)), f = p * n - i;
        return (bounds[i]! + (bounds[i + 1]! - bounds[i]!) * f - x0) / W;
      };
    }
  }
  return (p) => Math.max(0, Math.min(1, p));
}

/** Inverse of a monotone cursor: the song time at which the word's cursor reaches u (bisection on the closed form). */
export function cursorTime(sung: (t: number) => SungState, w: Word, u: number): number {
  if (u <= 0) return w.start;
  let lo = w.start, hi = w.end;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (sung(m).cursor < u) lo = m; else hi = m; }
  return hi;
}

/**
 * The registered sung state of a fabricated word: lyricreg.sungState with the letter/syllable cursor and the white-hot
 * band capped to `hotCap` caps (default 0.45: the fabrication POINT, also on fast words). The face shaders read exactly
 * this (setSungUniforms), so lyricqa and the pixels agree.
 */
export function fabSung(o: Pick<FabOpts, 'word' | 'lineEnd' | 'deprecateT' | 'method' | 'pitch'>, text: string, spans: readonly [number, number][], capOverW: number, hotCap = 0.45): (t: number) => SungState {
  const map = letterCursor(o.word, text, spans);
  const pitch = o.pitch === undefined ? (isLongNote(o.word) ? fabPitch(o.word) : null) : o.pitch;
  return (t: number) => {
    const s = sungState(o.word, t, { lineEnd: o.lineEnd, deprecateT: o.deprecateT, method: o.method, pitch });
    const c = map(s.cursor), back = map(LyricsCls.wordProgress(o.word, t - SUNG_T.hot));
    s.cursor = c;
    s.hotW = Math.min(Math.max(0, c - back), hotCap * capOverW);
    s.started = c > 0;
    return s;
  };
}

// ================================================================ signed-distance text masks

export interface TextMask {
  text: string; family: string;
  /** R8 signed distance: 0.5 = the glyph edge, + inside; 1 unit = 2·range px */
  tex: THREE.DataTexture;
  /** canvas size (px) and the ink box: left of the ink at padL, baseline at baseY (from the top) */
  pxW: number; pxH: number; padL: number; baseY: number;
  /** px per cap height, signed-distance range (px) */
  capPx: number; range: number;
  /** ink width and per-character [x0, x1] in CAP units from the ink's left edge (× capH = metres) */
  width: number; spans: [number, number][];
}
const maskCache = new Map<string, TextMask>();
const EDT_INF = 1e20;
function edt1d(g: Float64Array, off: number, stride: number, len: number, f: Float64Array, v: Uint16Array | Int32Array, z: Float64Array) {
  v[0] = 0; z[0] = -EDT_INF; z[1] = EDT_INF; f[0] = g[off]!;
  for (let q = 1, k = 0, s = 0; q < len; q++) {
    f[q] = g[off + q * stride]!;
    const q2 = q * q;
    do { const r = v[k]!; s = (f[q]! - f[r]! + q2 - r * r) / (q - r) / 2; } while (s <= z[k]! && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = EDT_INF;
  }
  for (let q = 0, k = 0; q < len; q++) {
    while (z[k + 1]! < q) k++;
    const r = v[k]!, qr = q - r;
    g[off + q * stride] = f[r]! + qr * qr;
  }
}
function edt2d(g: Float64Array, w: number, h: number) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n);
  for (let x = 0; x < w; x++) edt1d(g, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(g, y * w, 1, w, f, v, z);
}
/** Signed distance field (px, + inside) of an alpha coverage image (TinySDF's sub-pixel EDT). */
export function sdfFromAlpha(alpha: Uint8ClampedArray | Uint8Array, w: number, h: number, stride = 4, offset = 3): Float32Array {
  const outer = new Float64Array(w * h), inner = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i * stride + offset]! / 255;
    if (a >= 0.999) { outer[i] = 0; inner[i] = EDT_INF; }
    else if (a <= 0.001) { outer[i] = EDT_INF; inner[i] = 0; }
    else { const d = 0.5 - a; outer[i] = d > 0 ? d * d : 0; inner[i] = d < 0 ? d * d : 0; }
  }
  edt2d(outer, w, h); edt2d(inner, w, h);
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(inner[i]!) - Math.sqrt(outer[i]!);
  return out;
}
/** Pack a signed distance field (px) into an R8 texture (rows flipped: texture v = 0 is the image bottom). */
export function sdfTexture(sd: Float32Array, w: number, h: number, range: number): THREE.DataTexture {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const src = y * w, dst = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) data[dst + x] = Math.max(0, Math.min(255, Math.round(255 * (0.5 + sd[src + x]! / (2 * range)))));
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.unpackAlignment = 1;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Cap height of a font family as a fraction of the em. */
export function capRatio(family: string): number {
  try { const f = ot(family); return (f.tables.os2?.sCapHeight ?? f.unitsPerEm * 0.7) / f.unitsPerEm; } catch { return 0.7; }
}

/**
 * A signed-distance mask of `text` set in `family` (Canvas2D with the font's kerning), cached by (text, family, size).
 * Units: px of the mask canvas; `width`/`spans` in cap heights (multiply by capH for metres).
 */
export function textMask(text: string, family: string, o: { capPx?: number; tracking?: number; range?: number } = {}): TextMask {
  const capPx0 = o.capPx ?? 160, tr = o.tracking ?? 0;
  const key = `${family}|${capPx0}|${tr}|${o.range ?? ''}|${text}`;
  const hit = maskCache.get(key);
  if (hit) return hit;
  const cr = capRatio(family);
  // keep the canvas under 8192 px wide
  let capPx = capPx0;
  const est = layout(text || ' ', family, capPx / cr, tr * capPx / cr).width;
  if (est > 7600) capPx = Math.floor(capPx * 7600 / est);
  const size = capPx / cr;
  const lay = layout(text || ' ', family, size, tr * size);
  const range = o.range ?? Math.max(4, Math.round(capPx * 0.16));
  const c0 = document.createElement('canvas').getContext('2d')!;
  c0.font = font(family, size);
  const m = c0.measureText(text || ' ');
  const inkL = Math.min(0, -m.actualBoundingBoxLeft), inkR = Math.max(lay.width, m.actualBoundingBoxRight);
  const asc = Math.max(capPx, m.actualBoundingBoxAscent), desc = Math.max(0, m.actualBoundingBoxDescent);
  const pad = range + 2;
  const pxW = Math.ceil(inkR - inkL + 2 * pad), pxH = Math.ceil(asc + desc + 2 * pad);
  const cv = document.createElement('canvas');
  cv.width = pxW; cv.height = pxH;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.clearRect(0, 0, pxW, pxH);
  c.fillStyle = '#fff';
  c.font = font(family, size);
  c.textBaseline = 'alphabetic';
  const padL = pad - inkL, baseY = pad + asc;
  // glyph by glyph at the kerned layout positions (tracking honoured)
  for (const g of lay.glyphs) c.fillText(g.ch, padL + g.x, baseY);
  const img = c.getImageData(0, 0, pxW, pxH);
  const sd = sdfFromAlpha(img.data, pxW, pxH);
  const tex = sdfTexture(sd, pxW, pxH, range);
  const spans: [number, number][] = lay.glyphs.map((g) => [g.x / capPx, (g.x + g.w) / capPx]);
  const mk: TextMask = { text, family, tex, pxW, pxH, padL, baseY, capPx, range, width: lay.width / capPx, spans };
  maskCache.set(key, mk);
  return mk;
}

// ================================================================ the face decal (lettering finishes)

/** Lettering finishes of a decal face. */
export type Finish = 'groove' | 'ablate' | 'silk' | 'print' | 'inlay' | 'project';
const FIN_ID: Record<Finish, number> = { groove: 1, ablate: 2, silk: 3, print: 4, inlay: 5, project: 6 };
export const MAX_SPANS = 32;

const DECAL_FRAG = () => /* glsl */ `
${GLSL_COMMON}
${LIGHT_GLSL}
${MAT_GLSL}
${SUNG_GLSL}
${FAB_GLSL()}
uniform sampler2D uSdf; uniform vec3 uSdfK;   // metres per encoded unit, texel u, texel v
uniform vec3 uTx; uniform vec3 uTy;           // world reading / up axes of the face (groove normals)
uniform float uWall; uniform float uSlope; uniform float uLit; uniform vec3 uBody; uniform float uLineW; uniform float uDash;
uniform vec4 uArc;                              // curved faces: x0, width (local metres) along vUv.x; uArc.w > 0.5 = curved
uniform vec4 uSpans[${MAX_SPANS}]; uniform int uNSpans; uniform float uCapH; uniform float uOpacity;
uniform vec2 uSoftK;                            // the 'soft' dissolve: mip level of the blur, edge width (m)
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec2 vUv; varying float vAO; varying vec3 vIC;
float sdM(vec2 uv) { return (texture2D(uSdf, uv).r - 0.5) * uSdfK.x; }
vec2 sdG(vec2 uv) {
  vec2 g = vec2(sdM(uv + vec2(uSdfK.y, 0.0)) - sdM(uv - vec2(uSdfK.y, 0.0)), sdM(uv + vec2(0.0, uSdfK.z)) - sdM(uv - vec2(0.0, uSdfK.z)));
  float l = length(g); return l > 1e-9 ? g / l : vec2(0.0);
}
void main() {
  float faceX = uArc.w > 0.5 ? uArc.x + vUv.x * uArc.y : vL.x;
  // v4 'soft': the word dissolves like a defocused one (the mask's blurred mip, a wide edge)
  float soft = fabSoft();
  float d = sdM(vUv);
  if (soft > 0.0) d = mix(d, (textureLod(uSdf, vUv, uSoftK.x).r - 0.5) * uSdfK.x + 0.3 * uSoftK.y, soft);
  float aa = mix(max(fwidth(d), 1e-7) * 0.8, uSoftK.y, soft);
  float u = sungU(faceX);
  Sung s = sungAt(u);
  float ex = fabExist(s);
  vec3 N0 = normalize(vN); if (!gl_FrontFacing) N0 = -N0;
  vec3 V = normalize(cameraPosition - vW);
  vec3 fill = fabFill(s, SUNG_RAW) * uLit;
  float cover = smoothstep(-aa, aa, d);
  // the physical cut (walls, oxide rim, lacquer) shows only on a sharp, live word, and dulls with the ash (an old word's
  // cut walls / white oxide must not out-shine its ash, the gate's p90 ≤ 0.35)
  float hard = (1.0 - soft) * (1.0 - s.dead) * (1.0 - 0.75 * fabAshC() * s.passed * (1.0 - uFab.w));
  vec3 col = vec3(0.0); float a = 0.0;
#if FIN == 1 || FIN == 5
  // engraved: walls of bare cut metal sloping into the stroke, a light guide (F2) / enamel inlay (F10) at the bottom
  vec2 g = sdG(vUv);
  float wallK = (1.0 - smoothstep(uWall - aa, uWall + aa, d)) * hard;
  vec3 Nw = normalize(N0 + uSlope * (uTx * g.x + uTy * g.y));
  vec3 N = normalize(mix(N0, Nw, wallK * cover));
  float dep = clamp(d / max(uWall, 1e-6), 0.0, 1.0);
  float ao = mix(1.0, ${'0.3'}, dep * hard);
  LT_SPEC = 1.2;
  vec3 wall = ltShade(vW, N, V, ltNeutral(uBody), 0.26, 1.0, ao) * ao;
  vec3 gloss = ltShade(vW, N0, V, vec3(0.0), 0.1, 0.0, 1.0) * hard;
  float core = mix(1.0, smoothstep(uWall - aa, uWall + aa, d), hard);
#if FIN == 1
  // the light guide: brightest along the channel's centre, a fine bright seam where it meets the cut walls
  float ch = smoothstep(uWall, uWall + uWall * 1.5, d);
  vec3 guide = fill * (0.86 + 0.14 * ch) + gloss * 0.6;
  vec3 c = mix(wall + fill * 0.22 * dep, guide, core);
#else
  vec3 c = mix(wall, fill * 0.94 + gloss * 0.35, core);
#endif
  float al = cover * ex;
  if (al < 0.002) discard;
  col = c; a = al;
#elif FIN == 2
  // laser ablation: the anodising burnt off to the white oxide, only where the spot has been (+ a browned rim);
  // the 20 % graphite toolpath preview (dashed outlines) only in the v3 raw mode (it read the unsung word)
  float halo = (1.0 - smoothstep(0.0, uLineW, -d)) * (1.0 - cover) * hard;
  float pl = (1.0 - smoothstep(uLineW * 0.35 - aa, uLineW * 0.35 + aa, abs(d))) * step(0.5, fract((faceX + vL.y) * uDash));
  float pv = pl * s.preview * (1.0 - s.passed) * max(uFab.z, uFabB.z) * uFab.x;
  float frostN = 0.85 + 0.15 * vnoise(vL.xy * 420.0);
  vec3 frost = ltShade(vW, N0, V, vec3(0.5) * frostN, 0.8, 0.0, 1.0) * hard;
  vec3 mark = fill * frostN + frost * 0.25;
  vec3 c = mark * cover + ltNeutral(uBody) * 0.35 * halo;
  float al = ex * (cover + 0.75 * halo);
  c = c * ex + SUNG_PREVIEW * 5.0 * pv;
  al = max(al, pv);
  if (al < 0.002) discard;
  col = c / max(al, 1e-4); a = al;
#elif FIN == 3 || FIN == 4
  // F8 silkscreen ink (v4: invisible UV ink until the band has passed; fluoresces bone behind it) /
  // F9 ink printed on valve glass (v4: shows only where the filament behind it is lit)
  float al = cover * ex;
  if (al < 0.002) discard;
  float mott = 0.9 + 0.1 * vnoise(vL.xy * 900.0) + 0.05 * vnoise(vL.xy * 3100.0);
  vec3 lac = ltShade(vW, N0, V, ltNeutral(uBody), ${'0.42'}, 0.0, 1.0) * hard;
  col = lac + fill * mott; a = al;
#elif FIN == 6
  // vector-laser projection: light traced along the glyph outlines, letter by letter; the trace head is white-hot
  // (p1v4: the traced line runs just INSIDE the glyph edge — centred outside it, it fattened the letters until their
  //  counters closed and a projected word lost its own contrast)
  float band = 1.0 - smoothstep(uLineW * 0.5 - aa, uLineW * 0.5 + aa, abs(d - uLineW * 0.5));
  // (p1v4) the projector also hatches the letter's inside (raster scan lines, ~0.075 cap pitch): a projected word reads
  // as letters, not as thin outlines lost on the plate (lyricqa contrast); the hatch melts to its mean below ~2 px
  float hp = vL.y / (0.075 * uCapH);
  float hatch = smoothstep(0.22, 0.32, abs(fract(hp) - 0.5));
  hatch = mix(0.42, hatch, 1.0 - smoothstep(0.3, 0.6, fwidth(hp)));
  float fillIn = cover * (0.06 + 0.3 * hatch);
  float rev = 0.0, head = 0.0;
  for (int i = 0; i < ${MAX_SPANS}; i++) {
    if (i >= uNSpans) break;
    vec4 sp = uSpans[i];
    if (faceX < sp.x - uLineW || faceX > sp.y + uLineW) continue;
    float fk = clamp((uSungA.x - sungU(sp.x)) / max(1e-5, sungU(sp.y) - sungU(sp.x)), 0.0, 1.0);
    vec2 q = vec2(faceX - 0.5 * (sp.x + sp.y), vL.y - 0.5 * uCapH);
    float ang = fract(0.25 - atan(q.y, q.x) / TAU);     // clockwise from 12 o'clock
    float r = fk >= 1.0 ? 1.0 : step(ang, fk);
    rev = max(rev, r);
    if (fk > 0.0 && fk < 1.0) head = max(head, r * (1.0 - smoothstep(0.0, 0.06, fk - ang)));
  }
  vec3 lc = mix(SUNG_BONE * uSungB.x, mix(FAB_ASH * uFabB.y, SUNG_ASH, uFab.w), fabAshC());
  lc = mix(lc, mix(FAB_DEAD, SUNG_DEAD * 0.4, uFab.w), uSungA.w);
  // the projector dies with the line (v4 old): the light fades, the isolation dims it
  float pk = (1.0 - fabFade()) * uFab.x;
  vec3 c = (lc * uLit * (band + fillIn) * rev + SUNG_HOT * uSungB.w * head * band * (1.0 - uSungA.w)) * pk;
  col = c; a = 1.0;
#endif
#if FIN == 6
  gl_FragColor = vec4(col * uOpacity, 1.0);
#else
  col = ltFog(col, vW);
  gl_FragColor = vec4(col * a * uOpacity, a * uOpacity);
#endif
}`;

export interface DecalOpts {
  finish: Finish;
  /** base colour of the material the lettering is cut into (walls) / printed on (lacquer) */
  body?: [number, number, number];
  /** groove wall width (caps), default 0.045 groove / 0.02 inlay */
  wall?: number;
  /** groove wall slope (tan), default 1.6 */
  slope?: number;
  /** projected line / ablation rim width (caps) */
  lineW?: number;
  lit?: number;
  align?: 'left' | 'center' | 'right';
  /** curved face: a cylinder of this radius (m) around local +Y, text centred on +Z (valve glass) */
  radius?: number;
  /** (p1v4) the v4 look: old / unsung mode (defaults FAB_V4) */
  old?: OldMode;
  unsung?: UnsungMode;
}

export interface Decal {
  mesh: THREE.Mesh; mat: THREE.ShaderMaterial; mask: TextMask;
  /** ink extent in local x (metres) and cap height */
  x0: number; x1: number; capH: number;
  /** characters' [x0, x1] in local metres */
  spans: [number, number][];
  /** face box for lyricReg (local) */
  box: THREE.Box3;
  /** the sung state (a state with t = 0 is a fixed label: v3 ash, no v4 old) */
  setSung(s: SungState, long?: LongNote): void;
  /** world reading / up axes for the groove normals (call when the face moves) */
  orient(): void;
  /** (p1v4) the v4 look of this decal (old / unsung mode, isolation, extra soft) */
  look?(o: FabLook): void;
}

/**
 * A lettering decal lying on the parent's face (local XY, normal +Z, baseline-left at the origin unless aligned),
 * drawn after the opaque pass (premultiplied, depth-tested, no depth write) with the scene's lighting.
 */
export function faceDecal(mask: TextMask, capH: number, o: DecalOpts): Decal {
  const mPer = capH / mask.capPx;
  const w = mask.width * capH;
  const ax = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
  let geo: THREE.BufferGeometry;
  const gw = mask.pxW * mPer, gh = mask.pxH * mPer;
  const cx = (mask.pxW / 2 - mask.padL) * mPer + ax, cy = (mask.baseY - mask.pxH / 2) * mPer;
  const curved = !!o.radius && o.radius > 0;
  if (curved) {
    // a cylinder strip: arc length along the face = local reading x
    const R = o.radius!, segs = Math.max(16, Math.ceil(gw / R / 0.03));
    geo = new THREE.CylinderGeometry(R, R, gh, segs, 1, true, -(gw / 2 - cx) / R, gw / R);
    // CylinderGeometry's u runs with theta; theta 0 = +Z. Shift so the arc centre is at the text centre.
    geo.translate(0, cy, 0);
  } else {
    geo = new THREE.PlaneGeometry(gw, gh);
    geo.translate(cx, cy, 0);
  }
  const fin = FIN_ID[o.finish];
  const m = new THREE.ShaderMaterial({
    vertexShader: LIT_VERT, fragmentShader: DECAL_FRAG(),
    defines: { FIN: String(fin) },
    uniforms: {
      ...LIGHT_UNIFORMS, ...sungUniforms(), ...fabUniforms({ old: o.old, unsung: o.unsung }),
      uSdf: { value: mask.tex }, uSdfK: { value: new THREE.Vector3(2 * mask.range * mPer, 1.2 / mask.pxW, 1.2 / mask.pxH) },
      uTx: { value: new THREE.Vector3(1, 0, 0) }, uTy: { value: new THREE.Vector3(0, 1, 0) },
      uWall: { value: (o.wall ?? (o.finish === 'inlay' ? 0.022 : 0.045)) * capH },
      uSlope: { value: o.slope ?? 1.6 },
      uLit: { value: o.lit ?? 1 },
      uBody: { value: new THREE.Vector3(...(o.body ?? [LIN.ash[0] * 0.9, LIN.ash[1] * 0.9, LIN.ash[2] * 0.95])) },
      uLineW: { value: (o.lineW ?? (o.finish === 'project' ? 0.075 : 0.03)) * capH },
      uDash: { value: 1 / (0.06 * capH) },
      uArc: { value: new THREE.Vector4(cx - gw / 2, gw, 0, curved ? 1 : 0) },
      uSpans: { value: Array.from({ length: MAX_SPANS }, () => new THREE.Vector4()) },
      uNSpans: { value: 0 },
      uCapH: { value: capH },
      uOpacity: { value: 1 },
      // the soft dissolve: a FAB_V4.softCaps blur (mip level of the mask) and an edge 0.2 cap wide
      uSoftK: { value: new THREE.Vector2(Math.log2(Math.max(1, FAB_V4.softCaps * mask.capPx)), 0.2 * capH) },
    },
    transparent: true, premultipliedAlpha: true, depthWrite: false,
    blending: o.finish === 'project' ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    side: curved ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.name = `fab_${o.finish}`;
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = `fab_${o.finish}_${mask.text}`;
  mesh.renderOrder = 2;
  if (!curved) mesh.position.z = Math.max(1e-4, capH * 0.002);
  const spans: [number, number][] = mask.spans.map(([a, b]) => [ax + a * capH, ax + b * capH]);
  const sp = m.uniforms.uSpans!.value as THREE.Vector4[];
  spans.slice(0, MAX_SPANS).forEach(([a, b], i) => sp[i]!.set(a, b, 0, 0));
  m.uniforms.uNSpans!.value = Math.min(MAX_SPANS, spans.length);
  const x0 = ax, x1 = ax + w;
  const z = curved ? o.radius! : 0;
  const box = curved
    ? new THREE.Box3(new THREE.Vector3(Math.sin(x0 / o.radius!) * o.radius!, 0, z), new THREE.Vector3(Math.sin(x1 / o.radius!) * o.radius!, capH, z))
    : new THREE.Box3(new THREE.Vector3(x0, 0, mesh.position.z), new THREE.Vector3(x1, capH, mesh.position.z));
  const tx = new THREE.Vector3(), ty = new THREE.Vector3();
  return {
    mesh, mat: m, mask, x0, x1, capH, spans, box,
    setSung(s, long) {
      // (the projector's trace head is a point of laser light: gain 2.5 — at 5 its bloom washed a small word's own letters)
      setSungUniforms(m.uniforms, s, { existMode: EXISTS_FOR[o.finish], hotGain: o.finish === 'project' ? 2.5 : 5, long: noGlow(long), span: [x0, x1, capH] });
      // a fixed state (t = 0: an engraved label, a rating) keeps the v3 look: v3 ash, no dead-front, no v4 old
      (m.uniforms.uFab!.value as THREE.Vector4).w = s.t === 0 ? 1 : 0;
    },
    orient() {
      mesh.updateWorldMatrix(true, false);
      tx.set(1, 0, 0).transformDirection(mesh.matrixWorld); ty.set(0, 1, 0).transformDirection(mesh.matrixWorld);
      (m.uniforms.uTx!.value as THREE.Vector3).copy(tx); (m.uniforms.uTy!.value as THREE.Vector3).copy(ty);
    },
    look(lo) { setFabLook(m.uniforms, lo); },
  };
}
/** sungState already carries the pitch glow (±15 %); lyricreg's setSungUniforms would multiply LongNote.glow on top. */
export const noGlow = (l?: LongNote): LongNote | undefined => (l ? { ...l, glow: 1 } : undefined);
const EXISTS_FOR: Record<Finish, 0 | 1> = { groove: 0, ablate: 1, silk: 0, print: 0, inlay: 0, project: 1 };

// ================================================================ registration + common plumbing

/** Read (and reset) a `face_*` node's (width, cap) scale; returns the face size it carried, if any. */
export function faceNodeSize(parent?: THREE.Object3D): { w: number; cap: number } | null {
  if (!parent) return null;
  const ud = parent.userData as { fabFace?: { w: number; cap: number } };
  if (ud.fabFace) return ud.fabFace;
  if (!/^face_/i.test(parent.name)) return null;
  const s = parent.scale;
  if (Math.abs(s.x - 1) < 1e-6 && Math.abs(s.y - 1) < 1e-6) return null;
  ud.fabFace = { w: Math.abs(s.x), cap: Math.abs(s.y) };
  parent.scale.set(Math.sign(s.x) || 1, Math.sign(s.y) || 1, 1);
  parent.updateMatrixWorld(true);
  return ud.fabFace;
}

/** The cap height to build with: o.capH, or a face node's cap; shrunk so the word fits o.width / the node's width. */
export function resolveCap(o: FabOpts, naturalWidthCaps: number): number {
  const nd = faceNodeSize(o.parent);
  let cap = o.capH > 0 ? o.capH : nd?.cap ?? 0.2;
  const W = o.width ?? nd?.w;
  if (W && W > 0 && naturalWidthCaps * cap > W) cap = W / naturalWidthCaps;
  return cap;
}

/** Default carrier traits per method (§7.5: at least two; perspective and dof are verified by lyricqa). */
export function defaultTraits(m: FabMethod): CarrierTrait[] {
  const ev: FabMethod[] = ['F1', 'F3', 'F5', 'F6', 'F7', 'F10'];
  return ['perspective', 'lit', 'dof', ...(ev.includes(m) ? (['event'] as CarrierTrait[]) : [])];
}

/** Register a fabricated face (the carrier object holds `box` in its local space). */
export function registerFab(o: FabOpts, text: string, obj: THREE.Object3D, box: THREE.Box3, capH: number, sung: (t: number) => SungState, extra: Partial<LyricCarrier> = {}): LyricCarrier {
  const c = lyricReg.register({
    id: o.id ?? `${o.scene}/${text}@${o.word.gi}`, scene: o.scene, word: o.word, text, method: o.method,
    hook: o.hook ?? HOOK_WORDS.has(text), obj,
    face: { box, capH }, sung, bleedAfter: o.bleedAfter, traits: o.traits ?? defaultTraits(o.method),
    ...(o.qa ? { qa: o.qa } : {}),
    ...(o.subject !== undefined ? { subject: o.subject } : {}),
    ...extra,
  });
  retireWhenGone(c);
  return c;
}
/**
 * (p1v4) A plate's own carrier built on the kit's materials (a face ref holding nothing but the kit's lettering, e.g.
 * stack's stepWord / slamDecal / ngramTile): once its lettering is gone (every v4 material of it faded out after its line, or isolated to 0) the ref
 * reads invisible — §13.3 "把已登錄的字面設成不可見": whatever is behind a retired word is not measured as the word.
 * A live getter on `visible` (the plate's own `visible = …` still works); the kit's own refs are hidden by fabV4.settle.
 */
function retireWhenGone(c: LyricCarrier) {
  const o = c.obj, ud = o.userData as { fabRef?: boolean; fabRetire?: boolean };
  if (ud.fabRef || ud.fabRetire || !lettersOnly(o)) return;
  ud.fabRetire = true;
  let own = o.visible;
  Object.defineProperty(o, 'visible', {
    configurable: true, enumerable: true,
    get: () => own && !fadedOut(autoIso(c).mats ?? []),
    set: (v: boolean) => { own = v; },
  });
}

/** Long-note state for update(): the plate's beats + the word's pitch track. */
export function fabLong(o: FabOpts, t: number): LongNote | undefined {
  if (!o.beats) return undefined;
  const pitch = o.pitch === undefined ? fabPitch(o.word) : o.pitch;
  return longNote(o.word, t, o.beats, pitch);
}

/**
 * (p1v4) The common v4 members of a fab built on one carrier: phase, oldAt, center, iso (every material holding uFab),
 * and `settle(s)` for its update(): the registered face refs (`faces`: empty groups in the face's frame) exist only
 * while the word does — hidden before it is made (dead-front: until ½ frame before word.start, the gate's 'unsung') and
 * once its lettering is gone (the old 'fade' / 'retract' complete, or isolated to 0): §13.3 "還沒製造出來" /
 * "把已登錄的字面設成不可見" — whatever lies behind a word that is not there is not measured as the word.
 */
export function fabV4(o: Pick<FabOpts, 'word' | 'lineEnd' | 'old' | 'unsung'>, carrier: LyricCarrier, mats: () => Iterable<THREE.Material | null | undefined>, faces: THREE.Object3D[] = [], mode: OldMode = oldModeOf(o)): Pick<Fab, 'phase' | 'oldAt' | 'center' | 'iso'> & { settle(s: SungState): void } {
  const lineEnd = Math.max(o.lineEnd ?? o.word.end, o.word.end);
  const deadfront = (o.unsung ?? FAB_V4.unsung) === 'deadfront';
  let isoK = 1, gone = false;
  const sync = () => { const v = !(gone || isoK <= 0.01); for (const f of faces) f.visible = v; };
  const iso = (k: number) => { isoK = k; for (const m of mats()) setFabLook((m as THREE.ShaderMaterial | undefined)?.uniforms, { iso: k }); sync(); };
  fabIsoTarget(carrier.id, iso);
  return {
    phase: (t) => fabPhase(o.word, t, lineEnd),
    oldAt: lineEnd + OLD_AFTER,
    center: (out = new THREE.Vector3()) => out.copy(faceWorld(carrier)?.center ?? out),
    iso,
    settle(s) { gone = fabFadeOf(s, mode) >= 0.999 || (deadfront && s.t !== 0 && s.t < o.word.start - 0.5 / 60); sync(); },
  };
}
/**
 * An empty group in the frame of `parent`: the registered face of a carrier (the kit hides it once the word is gone).
 * Its world matrix IS its parent's (the same Matrix4 object): never stale, whoever updates the parent's matrices — a
 * plate that reads `carrier.obj.localToWorld` after updating only the machine's own matrices sees what it saw before.
 */
export function faceRefIn(parent: THREE.Object3D, text: string): THREE.Group {
  const g = new THREE.Group(); g.name = `face_${text}`; g.userData.fabRef = true; parent.add(g);
  Object.defineProperty(g, 'matrixWorld', { value: parent.matrixWorld, writable: true, configurable: true, enumerable: true });
  return g;
}

const _v = new THREE.Vector3();

/** A decal-based word (F2 groove, F8 silk, F9 print, F10 inlay …): one decal, one carrier. */
function decalWord(o: FabOpts, d: DecalOpts, fam: string, extra?: (root: THREE.Group, dc: Decal) => { update?(t: number, s: SungState): void; dispose?(): void; mats?: THREE.Material[] }): Fab {
  const text = o.text ?? fabText(o.word.w);
  const probe = textMask(text, fam, { capPx: o.capPx, tracking: o.tracking });
  const capH = resolveCap(o, probe.width);
  const dc = faceDecal(probe, capH, { ...d, align: o.align ?? d.align, lit: o.lit ?? d.lit, old: o.old ?? d.old, unsung: o.unsung ?? d.unsung });
  const root = new THREE.Group();
  root.name = `fab_${o.method}_${text}`;
  root.add(dc.mesh);
  o.parent?.add(root);
  const sung = fabSung(o, text, dc.spans, capH / Math.max(1e-6, dc.x1 - dc.x0));
  const face = faceRefIn(root, text);
  const carrier = registerFab(o, text, face, dc.box, capH, sung);
  const ex = extra?.(root, dc);
  const v4 = fabV4(o, carrier, () => [dc.mat, ...(ex?.mats ?? [])], [face]);
  return {
    obj: root, carriers: [carrier], width: dc.x1 - dc.x0, capH, method: o.method,
    phase: v4.phase, oldAt: v4.oldAt, center: v4.center, iso: v4.iso,
    update(t) {
      const s = sung(t);
      dc.setSung(s, fabLong(o, t));
      dc.orient();
      ex?.update?.(t, s);
      v4.settle(s);
    },
    cursor(t) {
      const s = sung(t);
      if (!s.started || s.done) return null;
      return dc.mesh.localToWorld(_v.set(dc.x0 + (dc.x1 - dc.x0) * s.cursor, capH / 2, 0).clone());
    },
    dispose() { root.removeFromParent(); lyricReg.unregister(carrier.id); dc.mesh.geometry.dispose(); dc.mat.dispose(); ex?.dispose?.(); },
  };
}

// ================================================================ machined-part geometry helpers

/** A box with rounded, bevelled edges (centred). r = edge radius (≥ 2 % of the smallest side reads as machined). */
export function bevelBox(w: number, h: number, d: number, r = Math.min(w, h, d) * 0.06, seg = 3): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
}
/** A socket-head cap screw seen head-on (axis +Z), head diameter `dia`: head + hex socket, as one group. */
export function capScrew(dia: number, steel?: THREE.Material, dark?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(dia / 2, dia / 2 * 1.03, dia * 0.6, 24), steel ?? mat('steelGraphite'));
  head.rotation.x = Math.PI / 2; head.position.z = dia * 0.3;
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(dia * 0.22, dia * 0.22, dia * 0.12, 6), dark ?? mat('anodInk'));
  sock.rotation.x = Math.PI / 2; sock.position.z = dia * 0.58;
  g.add(head, sock);
  return g;
}

// ================================================================ F2: V-groove light guide

/** F2: a V-groove engraved in the parent (black anodised part: the walls are bare metal), lit from the groove bottom left → right. */
export function grooveWord(o: FabOpts & { body?: [number, number, number] }): Fab {
  return decalWord({ ...o, method: 'F2' }, { finish: 'groove', body: o.body, wall: 0.07 }, o.font ?? F.archivo(100, 900));
}

// ================================================================ F10: machined nameplate / tag

/**
 * F10: a black anodised machined nameplate with the word engraved and enamel-filled (lights at its syllables), hung on
 * a hinge pin along its top edge: it hangs tilted and swings upright (latched) just before word.start (`swing` rad,
 * default 0.42; 0 = a fixed plate). The plate is built around the word (hardware: plate, hinge knuckles, pin, screws).
 * v4: the enamel is dead-front (black, flush) until its letters light: a blank plate before the word.
 */
export function plateWord(o: FabOpts & { swing?: number; plateMargin?: number }): Fab {
  const fam = o.font ?? F.archivo(100, 700);
  const text = o.text ?? fabText(o.word.w);
  const probe = textMask(text, fam, { capPx: o.capPx, tracking: o.tracking });
  const capH = resolveCap(o, probe.width + 2 * (o.plateMargin ?? 0.55));
  const mg = (o.plateMargin ?? 0.55) * capH;
  const dc = faceDecal(probe, capH, { finish: 'inlay', body: [LIN.ash[0] * 0.85, LIN.ash[1] * 0.85, LIN.ash[2] * 0.9], align: 'left', lit: o.lit, old: o.old, unsung: o.unsung });
  const w = dc.x1 - dc.x0;
  const PW = w + 2 * mg, PH = capH + 2 * mg, PD = Math.max(0.004, capH * 0.07);
  const ax = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
  // pivot = the hinge axis at the plate's top edge; the face (decal) hangs below it
  const root = new THREE.Group(); root.name = `fab_F10_${text}`;
  const pivot = new THREE.Group(); pivot.position.set(ax + w / 2, capH + mg, PD + capH * 0.05);
  root.add(pivot);
  const plateG = new THREE.Group(); plateG.position.set(-(w / 2), -(capH + mg), 0); // back to the face frame
  pivot.add(plateG);
  const hw = o.hardware !== false;
  if (hw) {
    const body = new THREE.Mesh(bevelBox(PW, PH, PD, Math.min(PH, PW) * 0.12, 4), mat('anodInk', { base: [LIN.ink2[0] * 2.3, LIN.ink2[1] * 2.3, LIN.ink2[2] * 2.5] }));
    body.position.set(w / 2, capH / 2, -PD / 2);
    plateG.add(body);
    const steel = mat('steelGraphite'), dark = mat('anodInk');
    for (const sx of [-1, 1]) {
      const sc = capScrew(capH * 0.16, steel, dark);
      sc.position.set(w / 2 + sx * (PW / 2 - mg * 0.42), -mg * 0.58, 0);
      plateG.add(sc);
    }
    // hinge: two knuckles on the plate, a pin through them, a bracket back to the parent
    const kn = new THREE.CylinderGeometry(capH * 0.11, capH * 0.11, PW * 0.18, 20);
    const ash = mat('brushedAsh');
    for (const sx of [-1, 1]) {
      const k = new THREE.Mesh(kn, ash);
      k.rotation.z = Math.PI / 2; k.position.set(sx * PW * 0.3, 0, -PD * 0.2);
      pivot.add(k);
      const br = new THREE.Mesh(bevelBox(PW * 0.14, capH * 0.5, capH * 0.12), mat('steelGraphite'));
      br.position.set(ax + w / 2 + sx * PW * 0.3, capH + mg + capH * 0.12, -capH * 0.02);
      root.add(br);
    }
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(capH * 0.035, capH * 0.035, PW * 0.78, 12), steel);
    pin.rotation.z = Math.PI / 2; pin.position.z = -PD * 0.2;
    pivot.add(pin);
  }
  dc.mesh.position.x += 0; // decal in the face frame (left aligned inside plateG)
  plateG.add(dc.mesh);
  o.parent?.add(root);
  const faceRef = faceRefIn(plateG, text); // the carrier: the face swings with the plate
  const sung = fabSung(o, text, dc.spans, capH / Math.max(1e-6, w));
  const carrier = registerFab({ ...o, method: 'F10' }, text, faceRef, dc.box, capH, sung);
  const v4 = fabV4(o, carrier, () => [dc.mat], [faceRef]);
  const swing = o.swing ?? (o.hardware === false ? 0 : 0.42);
  const ts = o.word.start;
  const ang = (t: number) => {
    // hangs tilted back on its pin; released at start − 0.24 s, swings upright and latches by word.start
    const t0 = ts - 0.24;
    if (t < t0) return swing * (1 + 0.04 * Math.sin(2 * Math.PI * 0.9 * t));
    const x = (t - t0) / 0.24;
    if (x < 1) return swing * Math.cos(x * Math.PI / 2) ** 2;
    const k = t - ts;
    return -swing * 0.06 * Math.exp(-k / 0.07) * Math.sin(k * 2 * Math.PI * 9);
  };
  return {
    obj: root, carriers: [carrier], width: w, capH, method: 'F10',
    phase: v4.phase, oldAt: v4.oldAt, center: v4.center, iso: v4.iso,
    update(t) {
      pivot.rotation.x = swing ? -ang(t) : 0;
      const s = sung(t);
      dc.setSung(s, fabLong(o, t));
      dc.orient();
      v4.settle(s);
    },
    cursor(t) { const s = sung(t); return !s.started || s.done ? null : dc.mesh.localToWorld(new THREE.Vector3(dc.x0 + w * s.cursor, capH / 2, 0)); },
    dispose() { root.removeFromParent(); lyricReg.unregister(carrier.id); dc.mat.dispose(); },
  };
}

// ================================================================ F8: silkscreen, revealed by a UV scan band

const BAND_FRAG = /* glsl */ `
${GLSL_COMMON}
uniform float uX; uniform float uW; uniform float uK; uniform vec3 uCol; uniform vec2 uY;
varying vec3 vL;
void main() {
  float x = vL.x - uX;
  float b = exp(-x * x / (uW * uW)) + 0.12 * exp(-max(-x, 0.0) / (uW * 8.0)) * step(x, 0.0);
  float y = smoothstep(uY.x - uW, uY.x + uW * 0.5, vL.y) * (1.0 - smoothstep(uY.y - uW * 0.5, uY.y + uW, vL.y));
  gl_FragColor = vec4(uCol * b * y * uK, 1.0);
}`;

/**
 * F8: the word in PCB silkscreen (v4: invisible UV-fluorescent ink — nothing shows under white light), lying on the
 * parent PCB; a UV inspection lamp at the word's left end sweeps a cold band across it and the ink fluoresces bone
 * behind the band's front (= the cursor); after the line the fluorescence decays (old 'fade'). Hardware: the lamp.
 */
export function silkWord(o: FabOpts & { mask?: [number, number, number] }): Fab {
  let band: THREE.Mesh | null = null, bandMat: THREE.ShaderMaterial | null = null;
  let isoK = 1;
  const f = decalWord({ ...o, method: 'F8' }, { finish: 'silk', body: o.mask ?? [LIN.ink2[0] * 1.8, LIN.ink2[1] * 1.8, LIN.ink2[2] * 2.0] }, o.font ?? F.mono(600), (root, dc) => {
    const capH = dc.capH, w = dc.x1 - dc.x0;
    bandMat = new THREE.ShaderMaterial({
      vertexShader: LIT_VERT, fragmentShader: BAND_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uX: { value: dc.x0 }, uW: { value: capH * 0.05 }, uK: { value: 0 }, uCol: { value: new THREE.Vector3(0.62, 0.66, 0.85) }, uY: { value: new THREE.Vector2(-capH * 0.2, capH * 1.2) } },
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    });
    band = new THREE.Mesh(new THREE.PlaneGeometry(w + capH * 1.2, capH * 2.2), bandMat);
    band.position.set(dc.x0 + w / 2, capH / 2, capH * 0.003);
    band.renderOrder = 3;
    root.add(band);
    if (o.hardware !== false) {
      // the UV lamp: a low anodised housing at the left end, a slit lens facing along the board
      const hous = new THREE.Mesh(bevelBox(capH * 0.55, capH * 1.9, capH * 0.42), mat('anodInk'));
      hous.position.set(dc.x0 - capH * 0.75, capH * 0.5, capH * 0.21);
      // its lens: a dark glass slit with a faint cold glow (the UV is mostly invisible)
      const slit = new THREE.Mesh(new THREE.BoxGeometry(capH * 0.05, capH * 1.4, capH * 0.06), mat('ceramic', { base: [0.02, 0.02, 0.025], emit: [0.45, 0.5, 0.75], emitK: 0.18 }));
      slit.position.set(dc.x0 - capH * 0.47, capH * 0.5, capH * 0.27);
      root.add(hous, slit);
    }
    return {
      update(t: number, s: SungState) {
        // the band leads the cursor while the word is sung, then parks off the end and fades
        const run = s.started && !s.done ? 1 : 0;
        const fade = s.done ? Math.max(0, 1 - (t - o.word.end) / 0.25) : run;
        bandMat!.uniforms.uX!.value = dc.x0 + w * s.cursor;
        bandMat!.uniforms.uK!.value = 0.12 * Math.max(run, fade) * (1 - s.dead) * isoK;
      },
      dispose() { bandMat?.dispose(); band?.geometry.dispose(); },
    };
  });
  const iso0 = f.iso!;
  f.iso = (k) => { isoK = k; iso0(k); };
  fabIsoTarget(f.carriers[0]!.id, f.iso);
  return f;
}

// ================================================================ F9: ink printed on valve glass, backlit by the filament

/**
 * F9: a vacuum valve (glass envelope ≤ 0.6 m, base and pins, anode plates, grid rods, a filament) with the word printed
 * on the envelope's front; the filament heats left → right with the cursor and the ink in front of it glows bone.
 * The valve's axis is the parent's +Y; the printed face centres on +Z at the baseline height 0. Hardware = the valve.
 * v4: the print shows only where the filament behind it is lit (dead-front before); after the line the filament cools.
 */
export function glassWord(o: FabOpts & { radius?: number; height?: number }): Fab {
  const fam = o.font ?? F.archivo(100, 700);
  const text = o.text ?? fabText(o.word.w);
  const probe = textMask(text, fam, { capPx: o.capPx, tracking: o.tracking });
  const capH = resolveCap(o, probe.width);
  const w = probe.width * capH;
  const R = o.radius ?? Math.max(capH * 1.6, w / 1.75);
  const dc = faceDecal(probe, capH, { finish: 'print', body: [0.05, 0.05, 0.055], align: 'center', radius: R * 1.004, lit: o.lit, old: o.old, unsung: o.unsung });
  const root = new THREE.Group(); root.name = `fab_F9_${text}`;
  root.add(dc.mesh);
  const parts: THREE.Object3D[] = [];
  let filMat: THREE.ShaderMaterial | null = null;
  const H = o.height ?? Math.max(capH * 6, R * 2.6);
  const y0 = -H * 0.42; // envelope bottom (the text band is near the middle)
  if (o.hardware !== false) {
    const glass = mat('glass', { thickness: 0.004 });
    const env = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H * 0.86, 64, 1, true), glass);
    env.position.y = y0 + H * 0.43;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    dome.scale.y = 0.55; dome.position.y = y0 + H * 0.86;
    env.renderOrder = 1; dome.renderOrder = 1;
    // the getter flash: the dome's inside silvered dark (every valve has it), a getter ring under it
    const flash = new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('steelGraphite', { base: [0.05, 0.05, 0.055], rough: 0.08, metal: 1 }));
    flash.scale.y = 0.53; flash.position.y = y0 + H * 0.86;
    const getter = new THREE.Mesh(new THREE.TorusGeometry(R * 0.28, R * 0.035, 8, 24), mat('steelGraphite'));
    getter.rotation.x = Math.PI / 2; getter.position.set(0, y0 + H * 0.8, -R * 0.1);
    parts.push(flash, getter);
    // the base: a ceramic collar, a black phenolic socket, pins; the tip-off at the top
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, H * 0.07, 48), mat('brushedAsh'));
    collar.position.y = y0 + H * 0.02;
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.18, H * 0.09, 48), mat('anodInk'));
    sock.position.y = y0 - H * 0.06;
    // anode: two dark nickel plates behind the text band, a getter ring at the top, mica spacers, grid rods
    const nickel = mat('steelGraphite', { base: [NEUTRAL.graphite[0] * 0.55, NEUTRAL.graphite[1] * 0.55, NEUTRAL.graphite[2] * 0.55], rough: 0.45 });
    const an = new THREE.Mesh(bevelBox(Math.min(R * 1.5, w + capH * 0.8), capH * 3.2, R * 0.12, R * 0.02), nickel);
    an.position.set(0, capH * 0.3, -R * 0.25);
    const mica = new THREE.Mesh(bevelBox(R * 1.5, H * 0.012, R * 1.1, H * 0.004), mat('ceramic', { base: [0.06, 0.06, 0.062], rough: 0.6 }));
    mica.position.set(0, y0 + H * 0.69, -R * 0.15);
    const mica2 = mica.clone(); mica2.position.y = y0 + H * 0.15;
    const rods = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.012, R * 0.012, H * 0.56, 6), mat('steelGraphite'));
      r.position.set(sx * R * 0.62, y0 + H * 0.42, -R * 0.15 + sz * R * 0.3);
      rods.add(r);
    }
    // the filament: a short zig-zag ribbon just under the text band (it backlights the print as it heats, left → right)
    const zig: number[] = [];
    const N = 22, fy = -capH * 0.55;
    for (let i = 0; i <= N; i++) { const x = -w / 2 + w * (i / N); zig.push(x, fy + (i % 2 ? 1 : -1) * capH * 0.16); }
    const pos: number[] = [], uvs: number[] = [];
    const rw = capH * 0.011;
    for (let i = 0; i < N; i++) {
      const ax2 = zig[2 * i]!, ay = zig[2 * i + 1]!, bx = zig[2 * i + 2]!, by = zig[2 * i + 3]!;
      const dx = bx - ax2, dy = by - ay, L = Math.hypot(dx, dy), nx = -dy / L * rw, ny = dx / L * rw;
      const zf = R * 0.3;
      pos.push(ax2 - nx, ay - ny, zf, bx - nx, by - ny, zf, bx + nx, by + ny, zf, ax2 - nx, ay - ny, zf, bx + nx, by + ny, zf, ax2 + nx, ay + ny, zf);
      for (let k = 0; k < 6; k++) uvs.push(0, 0);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    filMat = new THREE.ShaderMaterial({
      vertexShader: LIT_VERT, side: THREE.DoubleSide,
      fragmentShader: `${GLSL_COMMON}\n${SUNG_GLSL}\n${FAB_GLSL()}\nvarying vec3 vL; uniform float uHeat;\nvoid main() { Sung s = sungAt(sungU(vL.x)); float h = s.passed * (1.0 - s.dead) * (1.0 - 0.6 * s.ash) * (1.0 - fabFade()) * uFab.x;\n  vec3 c = mix(C_GRAPHITE * 0.08, vec3(1.0, 0.93, 0.84) * 0.9, h) + SUNG_HOT * 0.4 * s.hot * uFab.x; gl_FragColor = vec4(c * uHeat, 1.0); }`,
      uniforms: { ...sungUniforms(), ...fabUniforms({ old: o.old, unsung: o.unsung }), uHeat: { value: 1 } },
    });
    const fil = new THREE.Mesh(fg, filMat);
    // two support posts for the filament
    for (const sx of [-1, 1]) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.01, R * 0.01, capH * 1.2, 6), mat('steelGraphite')); sp.position.set(sx * (w / 2 + capH * 0.06), fy - capH * 0.5, R * 0.3); parts.push(sp); }
    parts.push(an, mica, mica2, rods, fil, collar, sock, env, dome);
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.035, R * 0.035, H * 0.08, 10), mat('brushedAsh'));
      const a = (i / 7) * Math.PI * 2;
      p.position.set(Math.cos(a) * R * 0.55, y0 - H * 0.14, Math.sin(a) * R * 0.55);
      parts.push(p);
    }
    for (const p of parts) root.add(p);
  }
  o.parent?.add(root);
  const sung = fabSung({ ...o, method: 'F9' }, text, dc.spans, capH / Math.max(1e-6, w));
  const face = faceRefIn(root, text);
  const carrier = registerFab({ ...o, method: 'F9' }, text, face, dc.box, capH, sung);
  const v4 = fabV4(o, carrier, () => [dc.mat, filMat], [face]);
  return {
    obj: root, carriers: [carrier], width: w, capH, method: 'F9',
    phase: v4.phase, oldAt: v4.oldAt, center: v4.center, iso: v4.iso,
    update(t) {
      const s = sung(t), ln = fabLong(o, t);
      dc.setSung(s, ln);
      if (filMat) setSungUniforms(filMat.uniforms, s, { existMode: 0, hotGain: 3, span: [dc.x0, dc.x1, capH] });
      v4.settle(s);
    },
    cursor(t) { const s = sung(t); if (!s.started || s.done) return null; const a = (dc.x0 + w * s.cursor) / R; return root.localToWorld(new THREE.Vector3(Math.sin(a) * R, capH / 2, Math.cos(a) * R)); },
    dispose() { root.removeFromParent(); lyricReg.unregister(carrier.id); dc.mat.dispose(); filMat?.dispose(); },
  };
}

// ================================================================ F3: extruded solid type (+ poster channel letters)

const SOLID_FRAG = () => /* glsl */ `
${GLSL_COMMON}
${LIGHT_GLSL}
${MAT_GLSL}
${SUNG_GLSL}
${FAB_GLSL()}
uniform vec3 uBody; uniform float uLit; uniform float uExist; uniform float uRough;
#ifdef POSTER
uniform sampler2D uSdf;
uniform vec4 uSdfA;   // mask px per metre, padL (px), baseline (px from the top), 0
uniform vec4 uSdfB;   // mask w, h (px), metres per encoded unit, cap (m)
uniform vec4 uPost;   // depth (m), bevel (m), seam pitch (m), LED module pitch (m)
#endif
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vLN; varying vec2 vUv; varying float vAO; varying vec3 vIC;
varying float vRestX; varying float vWordX;
void main() {
  vec3 N = dot(vN, vN) > 1e-12 ? normalize(vN) : vec3(0.0, 0.0, 1.0), V = normalize(cameraPosition - vW);
  vec3 nL = dot(vLN, vLN) > 1e-12 ? normalize(vLN) : vec3(0.0, 0.0, 1.0);
  float front = smoothstep(0.62, 0.95, nL.z);
  Sung s = sungAt(sungU(vRestX));
  // made: 0 = not fabricated yet (v4 dead-front: a letter of matte ink that takes no grazing light, §13.3), 1 = lit;
  // the old fade and the hero isolation take it back
  float made = fabExist(s);
  float live = made * (1.0 - s.dead);
  float rawK = max(uFab.z, uFab.w);
  // (v4 'fade' / 'retract') the letters leave: by the line's end + 0.7 s they are gone (a 1/40-cap dissolve over the
  // last 30 % of the fade, when they are dark matte already) — also a plate's own solid carriers built on this material
  float fd = fabFade() * (1.0 - rawK);
  if (fd > 0.7 && hash13(floor(vL * (40.0 / max(uSungSpan.z, 1e-4))) + 0.37) < (fd - 0.7) / 0.3 + 1e-4) discard;
  vec3 fill = fabFill(s, SUNG_RAW) * uLit * made;
  float gl = max(live, rawK);
  LT_SPEC = mix(0.06, 1.0, gl);
  vec3 alb = mix(FAB_INK * 0.8, ltNeutral(mix(uBody, C_GRAPHITE * 0.6, s.dead)), gl);
  float rough = mix(0.92, uRough, gl);
  float innerK = 1.0, trim = 0.0, seam = 0.0, screw = 0.0;
#ifdef POSTER
  // poster channel letters: the trim cap around the face, the diffuser's inner light, panel seams + screws on the returns
  float cap = uSdfB.w;
  vec2 wp = vec2(vWordX, vL.y);
  vec2 mp = vec2(uSdfA.y + wp.x * uSdfA.x, uSdfA.z - wp.y * uSdfA.x);
  float e = (texture2D(uSdf, vec2(mp.x / uSdfB.x, 1.0 - mp.y / uSdfB.y)).r - 0.5) * uSdfB.z;
  float trimW = max(0.01, 0.022 * cap);
  float aaE = max(fwidth(e), 1e-5);
  trim = (1.0 - smoothstep(trimW - aaE, trimW + aaE, e)) * front;
  // the diffuser's inner light: the LED modules behind it fill the stroke's middle, the light falls off toward the
  // trim (a lit sign's depth: 0.5 → 1 over 0.09 cap), the modules faintly visible as a staggered field of soft spots
  float pillow = 0.5 + 0.5 * smoothstep(trimW, trimW + 0.09 * cap, e);
  vec2 lp = wp / uPost.w;
  float row = floor(lp.y);
  vec2 lq = vec2(fract(lp.x + 0.5 * mod(row, 2.0)) - 0.5, fract(lp.y) - 0.5);
  float spot = exp(-dot(lq, lq) * 10.0);
  float ledVis = 1.0 - smoothstep(0.18, 0.45, length(fwidth(lp)));
  innerK = pillow * (1.0 + 0.16 * (spot - 0.32) * ledVis);
  float sideK = 1.0 - smoothstep(0.3, 0.7, abs(nL.z));
  float perim = abs(nL.x) > abs(nL.y) ? vL.y : vWordX;
  float sp = uPost.z;
  float sdst = abs(fract(perim / sp + 0.5) - 0.5) * sp;
  float sw = 0.0045 * cap + 0.6 * fwidth(perim);
  seam = (1.0 - smoothstep(sw * 0.45, sw, sdst)) * sideK;
  float zr = uPost.x - uPost.y - 0.04 * cap;
  vec2 sq = vec2((fract(perim / (sp / 3.0) + 0.5) - 0.5) * sp / 3.0, vL.z - zr);
  float sr = 0.011 * cap;
  float sd2 = length(sq) / sr;
  screw = (1.0 - smoothstep(0.75, 1.0, sd2)) * sideK * (1.0 - smoothstep(0.35, 0.8, fwidth(perim) / sr));
  // the joints are grooves and the screw heads domes: a height field the light reads (the returns are sheet metal)
  float hgt = (-0.004 * cap * (1.0 - smoothstep(0.0, sw, sdst)) + 0.006 * cap * sqrt(max(0.0, 1.0 - sd2 * sd2))) * sideK;
  N = mBump(vW, N, hgt);
  alb = mix(alb, mix(FAB_INK, FAB_STEEL * 0.09, gl), sideK);
#endif
  vec3 body = ltShade(vW, N, V, alb, rough, 0.35 * gl, 1.0);
#ifdef POSTER
  body *= 1.0 - 0.6 * seam;
  vec3 scr = ltShade(vW, N, V, mix(FAB_INK, FAB_STEEL * 0.6, gl), mix(0.9, 0.22, gl), 0.95 * gl, 1.0);
  body = mix(body, scr, screw);
#endif
  // front: a frosted diffuser lit from inside the letter (+ its satin reflection, only once made)
  vec3 face = fill * innerK + ltShade(vW, N, V, vec3(0.0), 0.2, 0.0, 1.0) * 0.6 * gl;
#ifdef POSTER
  // the trim cap: brushed aluminium round the face (matte ink until made), its inner edge catching the face's glow
  vec3 trimC = ltShade(vW, N, V, mix(FAB_INK, FAB_STEEL * 0.7, gl), mix(0.92, 0.32, gl), gl * 0.85, 1.0) + fill * 0.12 * smoothstep(-trimW, trimW, e);
  face = mix(face, trimC, trim);
#endif
  vec3 col = mix(body, face, front);
  col = ltFog(col, vW);
  // never a NaN / Inf into the HDR buffer (the bloom spreads it into a blot)
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
}`;
/** The solid vertex shader: LIT_VERT + the word-local rest x (sung state) + the glyph's word-space x (poster SDF). */
const SOLID_VERT = () => {
  let v = LIT_VERT.replace('void main() {', 'uniform mat4 uWordInv; attribute float aWordX; varying float vRestX; varying float vWordX;\nvoid main() {');
  v = v.includes('gl_Position =') ? v.replace('gl_Position =', 'vRestX = (uWordInv * vec4(vW, 1.0)).x;\n  vWordX = vL.x + aWordX;\n  gl_Position =') : v;
  return v;
};

const glyphGeoCache = new Map<string, { geo: THREE.BufferGeometry; minX: number; maxX: number } | null>();
/** Extruded glyph geometry (local: x from the glyph origin, baseline y = 0, back at z = 0, front at z = depth), cached. */
export function glyphGeometry(family: string, ch: string, em: number, depth: number, bevel: number, curveSegments = 6) {
  const key = `${family}|${ch}|${em.toFixed(5)}|${depth.toFixed(5)}|${bevel.toFixed(5)}|${curveSegments}`;
  if (glyphGeoCache.has(key)) return glyphGeoCache.get(key)!;
  const f = ot(family);
  const path = f.charToGlyph(ch).getPath(0, 0, em);
  const sp = new THREE.ShapePath();
  let n = 0;
  for (const c of path.commands as any[]) {
    if (c.type === 'M') { sp.moveTo(c.x, -c.y); n++; }
    else if (c.type === 'L') sp.lineTo(c.x, -c.y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
  }
  if (!n) { glyphGeoCache.set(key, null); return null; }
  const shapes = sp.toShapes();
  const bs = curveSegments >= 12 ? 4 : 3;
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: Math.max(1e-4, depth - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: bs, curveSegments });
  geo.translate(0, 0, bevel);
  geo.computeVertexNormals();
  // (p1v4) zero-area triangles of a glyph outline (coincident points in the font's contours) leave zero normals: the
  // shader's normalize() made a NaN pixel whose bloom was a white-hot blot with a black hole (zz_fab 44.967, the N of
  // GUARANTEED, also with the P0 kit) — give them the face normal of their side
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) {
    const x = nrm.getX(i), y = nrm.getY(i), z = nrm.getZ(i), l = Math.hypot(x, y, z);
    if (!(l > 1e-6) || !Number.isFinite(l)) nrm.setXYZ(i, 0, 0, 1); else if (Math.abs(l - 1) > 1e-3) nrm.setXYZ(i, x / l, y / l, z / l);
  }
  geo.computeBoundingBox();
  const r = { geo, minX: geo.boundingBox!.min.x, maxX: geo.boundingBox!.max.x };
  glyphGeoCache.set(key, r);
  return r;
}

export interface SolidText {
  group: THREE.Group;
  glyphs: { ch: string; mesh: THREE.Mesh; x: number; w: number }[];
  /** advance width (m) and per-char [x0, x1] (m) from the origin */
  width: number; spans: [number, number][]; capH: number;
}
/**
 * Solid extruded text in one shared material (word-local reading x feeds the sung state). Baseline y = 0, back z = 0.
 * (p1v4) `curveSegments` (default 6; posters 12+ — the outline of a 4 m letter stays round), `wordX`: give each glyph
 * its word-space x as the `aWordX` attribute (poster materials read the word's SDF with it; the geometry is cloned).
 */
export function extrudedText(text: string, family: string, capH: number, depth: number, m: THREE.Material, o: { bevel?: number; tracking?: number; curveSegments?: number; wordX?: boolean } = {}): SolidText {
  const cr = capRatio(family), em = capH / cr;
  const lay = layout(text, family, 100, (o.tracking ?? 0) * 100);
  const k = em / 100;
  const group = new THREE.Group();
  const glyphs: SolidText['glyphs'] = [];
  const bevel = o.bevel ?? Math.min(depth * 0.25, capH * 0.03);
  for (const g of lay.glyphs) {
    if (g.ch === ' ') continue;
    const gg = glyphGeometry(family, g.ch, em, depth, bevel, o.curveSegments ?? 6);
    if (!gg) continue;
    let geo = gg.geo;
    if (o.wordX) {
      geo = gg.geo.clone();
      geo.setAttribute('aWordX', new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute('position').count).fill(g.x * k), 1));
    }
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.x = g.x * k;
    mesh.name = `glyph_${g.ch}`;
    group.add(mesh);
    glyphs.push({ ch: g.ch, mesh, x: g.x * k, w: g.w * k });
  }
  return { group, glyphs, width: lay.width * k, spans: lay.glyphs.map((g) => [g.x * k, (g.x + g.w) * k]), capH };
}

/** Poster construction of solid type (channel letters): the word's SDF mask and its dimensions. */
export interface PosterSpec { mask: TextMask; capH: number; depth: number; bevel: number; /** panel seam pitch (m), default 0.55 cap */ seam?: number; /** LED module pitch (m), default 0.11 cap */ led?: number }
/** The lit material of solid type (one per word: its own sung uniforms). `poster`: channel-letter detail (needs extrudedText(…, { wordX: true })). */
export function solidMaterial(o: { body?: [number, number, number]; lit?: number; rough?: number; poster?: PosterSpec; old?: OldMode; unsung?: UnsungMode } = {}): THREE.ShaderMaterial {
  const p = o.poster;
  const m = new THREE.ShaderMaterial({
    vertexShader: SOLID_VERT(), fragmentShader: SOLID_FRAG(),
    defines: p ? { POSTER: '' } : {},
    uniforms: {
      ...LIGHT_UNIFORMS, ...sungUniforms(), ...fabUniforms({ old: o.old, unsung: o.unsung }),
      uWordInv: { value: new THREE.Matrix4() },
      uBody: { value: new THREE.Vector3(...(o.body ?? [LIN.ink2[0] * 2.4, LIN.ink2[1] * 2.4, LIN.ink2[2] * 2.6])) },
      uLit: { value: o.lit ?? 1 }, uExist: { value: 1 }, uRough: { value: o.rough ?? 0.3 },
      ...(p ? {
        uSdf: { value: p.mask.tex },
        uSdfA: { value: new THREE.Vector4(p.mask.capPx / p.capH, p.mask.padL, p.mask.baseY, 0) },
        uSdfB: { value: new THREE.Vector4(p.mask.pxW, p.mask.pxH, 2 * p.mask.range * (p.capH / p.mask.capPx), p.capH) },
        uPost: { value: new THREE.Vector4(p.depth, p.bevel, p.seam ?? 0.55 * p.capH, p.led ?? 0.11 * p.capH) },
      } : {}),
    },
  });
  m.name = p ? 'fab_solid_poster' : 'fab_solid';
  return m;
}

/**
 * F3: solid extruded Archivo letters standing proud of the parent (machined black bodies, diffuser fronts lit from
 * inside). Each letter is pushed out (raw: sunk `rise` × depth) and lit as the cursor reaches it, with a damped
 * overshoot. Long notes (§7.3, needs `beats`): the Archivo width steps 125 → 100 → 75 → 62 one per beat with a 7 %
 * punch, the baseline bends ≤ 0.15 cap and the cap height follows the pYIN F0 (the same word, re-cut per width).
 * v4: the letters stay inside the machine (rise 1.04: their fronts just behind the parent's face) until the cursor
 * pushes them out, matte ink until lit (no glints, no lit front), and after the line they go back in (old 'retract',
 * the v4 default here; 'fade' keeps them out, dark; the parent must be a solid face for the letters to hide in). Poster (cap ≥ 1.5 m, or `poster: true`): channel-letter
 * construction that holds up at 3–6 m caps — a polished trim cap around each face, the diffuser's inner light (a
 * pillow + the LED modules faintly through it), returns of sheet panels with seams and a row of screws, a bevel of
 * ≥ 3 % cap and round outlines (24 curve segments).
 */
export function solidWord(o: FabOpts & { weight?: 300 | 500 | 700 | 900; rise?: number; body?: [number, number, number] }): Fab & { glyphSets: SolidText['glyphs'][] } {
  const text = o.text ?? fabText(o.word.w);
  const weight = o.weight ?? 900;
  const long = isLongNote(o.word) && !!o.beats;
  const widths = long ? [...LONG_WIDTHS] : [100];
  const fam0 = o.font ?? F.archivo(widths[0]!, weight);
  const capH = resolveCap(o, layout(text, fam0, 100, (o.tracking ?? 0) * 100).width / (100 * capRatio(fam0)));
  const depth = o.depth ?? capH * 0.32;
  const poster = o.poster ?? capH >= 1.5;
  const bevel = poster ? Math.min(depth * 0.3, Math.max(capH * 0.032, 0.02)) : Math.min(depth * 0.25, capH * 0.03);
  // v4: the letters live INSIDE the machine until the cursor pushes them out (rise 1.04: the front sits just behind the
  // parent's face) and go back in after the line (old 'retract'); 'raw' keeps the v3 half-sunk letters
  const dead = (o.unsung ?? FAB_V4.unsung) === 'deadfront';
  const old: OldMode = o.old ?? (dead ? 'retract' : FAB_V4.old);
  const shared = poster ? null : solidMaterial({ body: o.body, lit: o.lit, old, unsung: o.unsung });
  const root = new THREE.Group(); root.name = `fab_F3_${text}`;
  const scaler = new THREE.Group(); root.add(scaler);
  const sets = widths.map((wd) => {
    const fam = o.font && !long ? o.font : F.archivo(wd, weight);
    // narrower cuts open their tracking a little (the condensed word must still read as letters, not a slab)
    const tr = (o.tracking ?? 0) + (long ? Math.max(0, (100 - wd) / 100) * 0.12 : 0);
    const m = shared ?? solidMaterial({ body: o.body, lit: o.lit, old, unsung: o.unsung, poster: { mask: textMask(text, fam, { capPx: 96, tracking: tr }), capH, depth, bevel } });
    const st = extrudedText(text, fam, capH, depth, m, { tracking: tr, bevel, curveSegments: poster ? 24 : 6, wordX: poster });
    const ax = o.align === 'center' ? -st.width / 2 : o.align === 'right' ? -st.width : 0;
    st.group.position.x = ax;
    scaler.add(st.group);
    return { st, ax, m };
  });
  sets.forEach((s, i) => (s.st.group.visible = i === 0));
  const maxW = sets[0]!.st.width;
  // the registered face: the front plane of the letters, rescaled to the current width (long notes)
  const faceRef = new THREE.Group(); faceRef.name = `face_${text}`; faceRef.userData.fabRef = true;
  root.add(faceRef);
  const ax0 = sets[0]!.ax;
  faceRef.position.x = ax0;
  const box = new THREE.Box3(new THREE.Vector3(0, 0, depth), new THREE.Vector3(maxW, capH, depth));
  o.parent?.add(root);
  const spans0 = sets[0]!.st.spans.map(([a, b]) => [a, b] as [number, number]);
  // (the white-hot front at gain 3.5, a poster's a narrower band — 0.16 cap at gain 3: a 0.45-cap band at gain 5 is a
  //  bloom that grey-washes the word's own settled letters for a frame, lyricqa contrast 3.6 : 1 on every-frame QA)
  const sung = fabSung({ ...o, method: 'F3' }, text, spans0, capH / Math.max(1e-6, maxW), poster ? 0.16 : 0.45);
  const hotGain = poster ? 3 : 3.5;
  const carrier = registerFab({ ...o, method: 'F3' }, text, faceRef, box, capH, sung);
  const rise = o.rise ?? (dead ? 1.04 : 0.62);
  // per-set glyph reach times (the cursor reaching each glyph's left edge)
  const reach = sets.map(({ st }) => st.glyphs.map((g) => cursorTime(sung, o.word, Math.max(0, (g.x - 1e-4) / st.width))));
  const inv = new THREE.Matrix4();
  const v4 = fabV4(o, carrier, () => sets.map((x) => x.m), [faceRef], old);
  return {
    obj: root, carriers: [carrier], width: maxW, capH, method: 'F3',
    phase: v4.phase, oldAt: v4.oldAt, center: v4.center, iso: v4.iso,
    /** the glyph meshes of every width cut (index = long-note step; one set for normal words): a plate may move them after word.end (shatter, fall) */
    glyphSets: sets.map((x) => x.st.glyphs),
    update(t) {
      const s = sung(t);
      const ln = fabLong(o, t);
      const si = long && ln ? Math.min(sets.length - 1, ln.step) : 0;
      sets.forEach((x, i) => (x.st.group.visible = i === si));
      const { st, ax, m } = sets[si]!;
      // face ref follows the visible width (anchored per align)
      faceRef.scale.x = st.width / maxW;
      faceRef.position.x = ax;
      const punch = ln?.punch ?? 1;
      scaler.scale.set(punch, punch * (ln?.heightK ?? 1), punch);
      const bend = (ln?.bend ?? 0) * capH;
      // (v4 'retract') after the line the letters sink back into the machine
      const sink = old === 'retract' ? fabFadeOf(s, old) : 0;
      st.glyphs.forEach((g, i) => {
        const tr = reach[si]![i]!;
        const k = t - tr;
        // pushed out from the machine: critically-damped-ish spring with a 6 % overshoot
        const p = k <= 0 ? 0 : 1 - Math.exp(-k / 0.045) * Math.cos(k * 2 * Math.PI * 4.5);
        g.mesh.position.z = -rise * depth * (1 - Math.min(1.06, p)) - (depth + bevel) * 1.02 * sink;
        const u = (g.x + g.w / 2) / st.width;
        g.mesh.position.y = bend * Math.sin(Math.PI * u);
      });
      setSungUniforms(m.uniforms, s, { existMode: 0, hotGain, long: noGlow(ln), span: [0, st.width, capH] });
      st.group.updateWorldMatrix(true, false);
      (m.uniforms.uWordInv!.value as THREE.Matrix4).copy(inv.copy(st.group.matrixWorld).invert());
      v4.settle(s);
    },
    cursor(t) { const s = sung(t); if (!s.started || s.done) return null; return faceRef.localToWorld(new THREE.Vector3(maxW * s.cursor, capH / 2, depth)); },
    dispose() { root.removeFromParent(); lyricReg.unregister(carrier.id); for (const x of sets) x.m.dispose(); },
  };
}

// ================================================================ dispatch

/** Fabricate one sung word with the given method. */
export function fabricate(o: FabOpts): Fab {
  switch (o.method) {
    case 'F1': return laserMark(o);
    case 'F2': return grooveWord(o);
    case 'F3': return solidWord(o);
    case 'F4': return segWord(o);
    case 'F5': return pinWord(o);
    case 'F6': return projectWord(o);
    case 'F7': return tileWord(o);
    case 'F8': return silkWord(o);
    case 'F9': return glassWord(o);
    case 'F10': return plateWord(o);
    default: return placeholderFab(o);
  }
}

/** Convenience: every word of a line with one method, laid left to right with `gap` (in caps) between words. */
export function fabLine(words: readonly Word[], o: Omit<FabOpts, 'word'> & { gap?: number }): Fab[] {
  const out: Fab[] = [];
  let x = 0;
  for (const w of words) {
    const f = fabricate({ ...o, word: w, align: 'left' } as FabOpts);
    f.obj.position.x += x;
    const width = f.width ?? fabText(w.w).length * 0.62 * o.capH;
    x += width + (o.gap ?? 0.6) * (f.capH ?? o.capH);
    out.push(f);
  }
  return out;
}

/**
 * Contract stub kept for tests: a flat face of the right size with the sung-state face shader (_mat 'ceramic',
 * face) and a registered carrier.
 */
export function placeholderFab(o: FabOpts): Fab {
  const text = o.text ?? fabText(o.word.w);
  const w = Math.max(1, text.length) * 0.62 * o.capH, h = o.capH;
  const x0 = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(x0 + w / 2, h / 2, 0);
  const m = mat('ceramic', { face: true, faceAll: true });
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = `fab_${text}`;
  const obj = new THREE.Group();
  obj.add(mesh);
  o.parent?.add(obj);
  const existMode = EXISTS_ONLY_BEHIND_CURSOR.has(o.method) ? 1 : 0;
  const sung = (t: number) => sungState(o.word, t, { lineEnd: o.lineEnd, deprecateT: o.deprecateT, method: o.method, pitch: o.pitch });
  const carrier = lyricReg.register({
    id: o.id ?? `${o.scene}/${text}@${o.word.gi}`, scene: o.scene, word: o.word, text, method: o.method,
    hook: o.hook ?? HOOK_WORDS.has(text), obj,
    face: { box: new THREE.Box3(new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x0 + w, h, 0)), capH: h },
    sung, bleedAfter: o.bleedAfter, traits: o.traits,
  });
  return {
    obj, carriers: [carrier],
    update(t) {
      const ln = o.beats ? longNote(o.word, t, o.beats, o.pitch) : undefined;
      setSungUniforms(m.uniforms, sung(t), { existMode, long: ln, span: [x0, x0 + w, h] });
    },
    cursor(t) {
      const s = sung(t);
      if (!s.started || s.done) return null;
      return mesh.localToWorld(new THREE.Vector3(x0 + w * s.cursor, h / 2, 0));
    },
    dispose() { obj.parent?.remove(obj); lyricReg.unregister(carrier.id); geo.dispose(); m.dispose(); },
  };
}
