// Lyric carrier registry + the sung-state contract (TREATMENT §7.1–§7.5). Owner: tooling.
//
// Every sung word in the film is a physical thing in the 3D world (F1–F10, §7.1). Whoever builds a carrier
// registers it here, so `lyricqa` (src/engine/lyricqa.ts, run in-page by `render.ts lyricqa`) can measure it
// at any song time: world anchoring, cap height in px, contrast, DoF, margins, face angle, screen speed,
// occlusion, overlap and the anti-subtitle rule. The same module defines what "being sung" means (§7.2 phases
// raw → hot → bone → ash → dead, §7.3 long notes) as ONE closed form of song time, its GLSL twin (a shared
// uniform block every lyric-face shader includes), and the loaders for the lyric side data (syllables, pitch).
//
//   // in a plate's init():
//   lyricReg.clear(this.ctx.id);
//   const w = this.ctx.lyrics.get('the abstract guaranteed').words[2]!;          // “guaranteed”
//   lyricReg.register({ id: 'pre1/GUARANTEED', scene: this.ctx.id, word: w, text: 'GUARANTEED', method: 'F2',
//     hook: false, obj: leverFace, face: { box, capH: 1.2 }, sung: (t) => sungState(w, t, { lineEnd }) });
//   // in render(), once the camera is placed (and DoF parameters known; `cut` = Cuts.last(t) if the plate cuts inside):
//   lyricReg.view(this.ctx.id, { cam, focus, aperture, maxR, t, cut });
//   // seam objects, on BOTH sides of a cut (render.ts seam --cut H02; `t` only for seams that are not _handoff records):
//   lyricReg.handoff({ cut: 'H02', side: 'out', scene: this.ctx.id, obj, box });
//   // (p1v4 gates, KITS §22: `render.ts gates` reads these) the hits the plate stages, non-lyric labels, non-subject words:
//   lyricReg.hits(this.ctx.id, this.HITS);                       // any { t, level, label? } records (_impact.Hit fits)
//   lyricReg.label({ id: `${id}/U4`, scene: id, text: 'U4', obj, face: { box, capH: 0.42 } });
//   lyricReg.mark(`${id}/OF`, { subject: false });               // the v4 onset cap target does not apply to this word
//
// QA: `bun scripts/render.ts lyricqa --from a --to b` (or `--scene file`) runs src/engine/lyricqa.ts in-page on every
// word of data/lyrics.json in the range; a sung word with no carrier registered by a scene on screen is a failure.
// src/scenes/zz_qa.ts is a complete, passing example (and its `--sp '{"break":"…"}'` variants each fail one rule).
//
// Everything here is a pure function of song time t (no Math.random / Date / performance.now).
import * as THREE from 'three';
import { Lyrics, type Word, type Line } from './lyrics';
import { LIN } from './palette';

// ================================================================ vocabulary

/** The ten allowed ways of making a sung word (§7.1). */
export type FabMethod = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8' | 'F9' | 'F10';
export const FAB_METHODS: readonly FabMethod[] = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];
/** Methods whose glyphs do not exist before the cursor reaches them (laser mark, projection, pins rising, particles). */
export const EXISTS_ONLY_BEHIND_CURSOR: ReadonlySet<FabMethod> = new Set<FabMethod>(['F1', 'F5', 'F6']);

/** Hook words (§7.4.2: cap ≥ 80 px instead of 32 px). Compare against `fabText(word.w)`. */
export const HOOK_WORDS: ReadonlySet<string> = new Set(['STATE', 'BASELINE', 'LEADERBOARD', 'DEADLINE', 'GONE']);
/** Long-note words (§7.3) when sung longer than LONG_NOTE_MIN. */
export const LONG_WORDS: ReadonlySet<string> = new Set(['GUARANTEED', 'BASELINE', 'LONG', 'GONE', 'DEADLINE', 'FRIEND']);
export const LONG_NOTE_MIN = 1.5;
/** F3 long-note width ladder (Archivo width %, one step per beat, §7.3). */
export const LONG_WIDTHS = [125, 100, 75, 62] as const;

/** Timing constants of the sung state (s). */
export const SUNG_T = {
  /** white-hot after the cursor passes a point */
  hot: 0.05,
  /** bone holds this long after the LINE ends, then fades to ash */
  hold: 0.3,
  /** bone → ash fade duration */
  fade: 0.4,
  /** deprecated machine: lettering → graphite over this */
  dead: 0.3,
  /** lyricqa window around each word: [start − qaPre, end + qaPost] (§7.4) */
  qaPre: 0.1,
  qaPost: 0.25,
} as const;

const mul = (c: readonly number[], k: number): [number, number, number] => [c[0]! * k, c[1]! * k, c[2]! * k];
/**
 * Linear colours of the phases (§7.2, §5.5). bone is capped at 0.8 linear (no bloom); only the white-hot
 * point exceeds 1.0. Lyrics are NEVER magenta (R3): there is no signal entry here on purpose.
 */
export const SUNG_COL = {
  /** unsung display segment / dark engraving: graphite at ~0.05 linear, visible */
  raw: mul(LIN.graphite, 0.45),
  /** toolpath preview of a not-yet-marked laser word: 20% graphite dashes */
  preview: mul(LIN.graphite, 0.2),
  /** fabrication point, 50 ms (multiplied by the hot gain, default 6) */
  hot: [1.0, 0.94, 0.86] as [number, number, number],
  /** sung: bone at 0.8 linear peak */
  bone: mul(LIN.bone, 0.8 / LIN.bone[2]),
  /** after the line (+0.3 s): ash at 0.5 linear peak */
  ash: mul(LIN.ash, 0.5 / LIN.ash[2]),
  /** owning machine deprecated */
  dead: [...LIN.graphite] as [number, number, number],
} as const;

/** Display text of a sung token: upper-case, typographic apostrophe kept, trailing punctuation dropped ('need,' → 'NEED'). */
export function fabText(w: string): string {
  return w.replace(/[“”"(),.!?;:…]+/g, '').replace(/'/g, '’').toUpperCase();
}

// ================================================================ the sung state (§7.2)

export interface SungState {
  /** song time this state was evaluated at */
  t: number;
  /** 0..1: fabrication front along the reading axis (syllable-aware Lyrics.wordProgress): 0 before word.start, 1 after word.end */
  cursor: number;
  /** width (cursor units) of the white-hot band just behind the cursor = what the cursor covered in the last 50 ms */
  hotW: number;
  /** 0..1 bone → ash (starts SUNG_T.hold after the line's end) */
  ash: number;
  /** 0..1 → graphite (the owning machine has been deprecated) */
  dead: number;
  /** brightness multiplier of the sung fill: 1 ± 0.15 on long notes (pitch envelope), else 1 */
  glow: number;
  /** 0..1 opacity of the raw toolpath preview (F1 laser marks: 0.2 until marked; 0 for other methods) */
  preview: number;
  /** cursor > 0 */
  started: boolean;
  /** t ≥ word.end: meaning-actions (crush, shatter, fall, eat) are allowed from now on (§7.2) */
  done: boolean;
}

export interface SungOpts {
  /** end of the line the word belongs to (default: the word's own end; pass line.end) */
  lineEnd?: number;
  /** time the owning machine is deprecated (from _machine): lettering goes graphite */
  deprecateT?: number;
  method?: FabMethod;
  /** pitch track of this word (long notes): drives `glow` */
  pitch?: PitchTrack | null;
}

/** §7.2 as a closed form of song time. The same numbers feed the GLSL block (setSungUniforms). */
export function sungState(w: Word, t: number, o: SungOpts = {}): SungState {
  const cursor = Lyrics.wordProgress(w, t);
  const back = Lyrics.wordProgress(w, t - SUNG_T.hot);
  const lineEnd = Math.max(o.lineEnd ?? w.end, w.end);
  const fadeT = lineEnd + SUNG_T.hold;
  const ash = t <= fadeT ? 0 : Math.min(1, (t - fadeT) / SUNG_T.fade);
  const dead = o.deprecateT === undefined || t <= o.deprecateT ? 0 : Math.min(1, (t - o.deprecateT) / SUNG_T.dead);
  const preview = o.method === 'F1' ? 0.2 : 0;
  let glow = 1;
  if (o.pitch && isLongNote(w)) glow = 1 + 0.15 * pitchNorm(o.pitch, t);
  return { t, cursor, hotW: Math.max(0, cursor - back), ash, dead, glow, preview, started: cursor > 0, done: t >= w.end };
}

/** True from word.end on: the only time a carrier may be crushed, shattered, eaten or dropped (§7.2). */
export const afterWord = (w: Word, t: number) => t >= w.end;
/** A long note (§7.2/§7.3): one of LONG_WORDS sung longer than 1.5 s. Must stay in the world until word.end. */
export const isLongNote = (w: Word) => w.end - w.start > LONG_NOTE_MIN && LONG_WORDS.has(fabText(w.w));

// ================================================================ long notes (§7.3)

export interface LongNote {
  long: boolean;
  /** index into LONG_WIDTHS: one step per beat after the word starts (0 = 125 %) */
  step: number;
  /** Archivo width % for F3 solid type (125 → 100 → 75 → 62) */
  width: number;
  /** scale punch on each width step: 1 → 1.07 decaying in ~80 ms */
  punch: number;
  /** baseline bend amplitude as a fraction of the cap height, from pYIN F0, |bend| ≤ 0.15 */
  bend: number;
  /** cap height multiplier from F0 (1 ± 0.06) */
  heightK: number;
  /** fill brightness multiplier for engraved / display methods (1 ± 0.15) */
  glow: number;
}

/**
 * Long-note state of a word at t. `beats` = AudioData.beats (never derive from BPM). A beat closer than
 * 0.12 s to word.start is the onset itself and does not step the width.
 */
export function longNote(w: Word, t: number, beats: readonly number[], pitch?: PitchTrack | null): LongNote {
  const long = isLongNote(w);
  if (!long || t < w.start) return { long, step: 0, width: LONG_WIDTHS[0], punch: 1, bend: 0, heightK: 1, glow: 1 };
  let step = 0, last = -1e9;
  for (const b of beats) {
    if (b <= w.start + 0.12) continue;
    if (b > Math.min(t, w.end)) break;
    step++; last = b;
  }
  step = Math.min(step, LONG_WIDTHS.length - 1);
  const punch = 1 + 0.07 * Math.exp(-Math.max(0, t - last) / 0.08) * (last > 0 ? 1 : 0);
  const pn = pitch ? pitchNorm(pitch, Math.min(t, w.end)) : 0;
  return { long, step, width: LONG_WIDTHS[step]!, punch, bend: 0.15 * pn, heightK: 1 + 0.06 * pn, glow: 1 + 0.15 * pn };
}

// ================================================================ side data: syllables + pitch

/**
 * Pitch track of one sung word (app/public/data/pitch/<key>.json, written by tools/data/export_pitch.py).
 * key = `L<line 2 digits>_w<word index 2 digits>`, e.g. L09_w02 = “guaranteed”.
 */
export interface PitchTrack {
  key: string;
  line: number;
  word: number;
  text: string;
  /** time of f0[0] (song s) and hop between samples (s) */
  t0: number;
  hop: number;
  /** pYIN F0 in Hz, 0 = unvoiced */
  f0: number[];
  /** optional 0..1 loudness envelope on the same grid */
  env?: number[];
}
export type PitchBank = Map<string, PitchTrack>;
export const pitchKey = (line: number, word: number) => `L${String(line).padStart(2, '0')}_w${String(word).padStart(2, '0')}`;

/** F0 at t relative to the word's median, in −1..1 (±6 semitones = ±1); 0 when unvoiced or out of range. */
const medianF0 = new WeakMap<PitchTrack, number>();
export function pitchNorm(p: PitchTrack, t: number): number {
  const i = Math.round((t - p.t0) / p.hop);
  if (i < 0 || i >= p.f0.length || !(p.f0[i]! > 0)) return 0;
  let med = medianF0.get(p);
  if (med === undefined) {
    const voiced = p.f0.filter((f) => f > 0).sort((a, b) => a - b);
    med = voiced[voiced.length >> 1] ?? p.f0[i]!;
    medianF0.set(p, med);
  }
  const semis = 12 * Math.log2(p.f0[i]! / med);
  return Math.max(-1, Math.min(1, semis / 6));
}

/**
 * Fetch JSON side data by name ('syl.json', 'pitch/index.json', 'ibp.json', 'bpe.json' …). Tries `data/<name>`
 * (repo-level data/ and the production build) and then `public/data/<name>` (app/public/data in the Vite dev
 * server, whose /data/ route is redirected to the repo's data/ folder). Returns null if neither is JSON.
 */
export async function fetchData<T = unknown>(name: string): Promise<T | null> {
  for (const url of [`data/${name}`, `public/data/${name}`]) {
    try {
      const r = await fetch(url);
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return (await r.json()) as T;
    } catch { /* try the next location */ }
  }
  return null;
}

/** syl.json (tools/data/add_syl.py): syllable spans of the words that need them (§7.3). */
export interface SylJSON { words: { line: number; word: number; text: string; syl: [number, number][]; parts?: string[] }[] }

/** Merge syl.json into the Lyrics words (sets Word.syl, so Lyrics.wordProgress becomes syllable-aware). Idempotent. */
export async function loadSyllables(ly: Lyrics): Promise<number> {
  const j = await fetchData<SylJSON>('syl.json');
  if (!j) return 0;
  let n = 0;
  for (const s of j.words) {
    const w = ly.lines[s.line]?.words[s.word];
    if (w && s.syl?.length) { w.syl = s.syl; n++; }
  }
  return n;
}

let pitchBank: Promise<PitchBank> | null = null;
/** All pitch tracks (pitch/index.json lists the keys). Cached: every caller shares one bank. */
export function loadPitch(): Promise<PitchBank> {
  pitchBank ??= (async () => {
    const bank: PitchBank = new Map();
    const idx = await fetchData<{ words: string[] }>('pitch/index.json');
    if (!idx) return bank;
    await Promise.all(idx.words.map(async (k) => { const p = await fetchData<PitchTrack>(`pitch/${k}.json`); if (p) bank.set(k, p); }));
    return bank;
  })();
  return pitchBank;
}

// ================================================================ GLSL twin of the sung state

/**
 * The shared sung-state uniform block + helpers, for every lyric-face shader (_mat `face: true`, _fab, _seg …).
 * Include AFTER GLSL_COMMON (for sat()) in fragment shaders; the vertex part (sungBend) needs nothing.
 *
 *   uSungA = (cursor, hotW, ash, dead)
 *   uSungB = (glow, preview, existMode (0 always there | 1 only behind the cursor), hotGain)
 *   uSungC = (longStep 0..3, punch, bend (fraction of cap), heightK)
 *   uSungSpan = (x0, x1, capH, 0): the face's reading extent in the mesh's LOCAL x, and cap height (local units)
 *
 *   float u = sungU(vLocal.x);           // 0..1 along the reading direction
 *   Sung s = sungAt(u);                  // phase weights at this point of the face
 *   vec3 fill = sungFill(s, SUNG_RAW);   // linear colour of the lettering (self-lit: readable in any light)
 *   // s.exist == 0 → the glyph is not made yet here (F1/F5/F6): draw the material underneath, or the preview
 */
export const SUNG_GLSL = /* glsl */ `
uniform vec4 uSungA; uniform vec4 uSungB; uniform vec4 uSungC; uniform vec4 uSungSpan;
const vec3 SUNG_RAW = vec3(${SUNG_COL.raw.map((x) => x.toFixed(5)).join(',')});
const vec3 SUNG_PREVIEW = vec3(${SUNG_COL.preview.map((x) => x.toFixed(5)).join(',')});
const vec3 SUNG_HOT = vec3(${SUNG_COL.hot.map((x) => x.toFixed(5)).join(',')});
const vec3 SUNG_BONE = vec3(${SUNG_COL.bone.map((x) => x.toFixed(5)).join(',')});
const vec3 SUNG_ASH = vec3(${SUNG_COL.ash.map((x) => x.toFixed(5)).join(',')});
const vec3 SUNG_DEAD = vec3(${SUNG_COL.dead.map((x) => x.toFixed(5)).join(',')});
struct Sung { float passed; float hot; float ash; float dead; float exist; float preview; };
float sungU(float xLocal) { return clamp((xLocal - uSungSpan.x) / max(1e-5, uSungSpan.y - uSungSpan.x), 0.0, 1.0); }
Sung sungAt(float u) {
  Sung s;
  float c = uSungA.x;
  s.passed = c <= 0.0 ? 0.0 : (c >= 1.0 ? 1.0 : 1.0 - smoothstep(c - 0.004, c + 0.004, u));
  s.hot = s.passed * (uSungA.y > 0.0 ? smoothstep(c - uSungA.y - 0.004, c - uSungA.y + 0.004, u) : 0.0);
  s.ash = uSungA.z * s.passed;
  s.dead = uSungA.w;
  s.exist = mix(1.0, s.passed, uSungB.z);
  s.preview = (1.0 - s.passed) * uSungB.y;
  return s;
}
/** colour of the lettering at a face point: raw (unsung), white-hot, bone (×glow), ash, graphite (dead) */
vec3 sungFill(Sung s, vec3 rawCol) {
  vec3 c = mix(rawCol, SUNG_BONE * uSungB.x, s.passed);
  c = mix(c, SUNG_ASH, s.ash);
  c = mix(c, SUNG_DEAD, s.dead);
  return mix(c, SUNG_HOT * uSungB.w, s.hot * (1.0 - s.dead));
}`;

/** Vertex-side long-note helper: bends a glyph point of the face (local coords) by the F0 contour. */
export const SUNG_VERT_GLSL = /* glsl */ `
uniform vec4 uSungC; uniform vec4 uSungSpan;
vec3 sungBend(vec3 p) {
  float u = clamp((p.x - uSungSpan.x) / max(1e-5, uSungSpan.y - uSungSpan.x), 0.0, 1.0);
  p.y += uSungC.z * uSungSpan.z * sin(3.14159265 * u);
  return p;
}`;

/** Fresh sung uniforms for one material (each lyric face owns its own; NOT shared like the light uniforms). */
export function sungUniforms(): Record<string, THREE.IUniform> {
  return {
    uSungA: { value: new THREE.Vector4(1, 0, 0, 0) },
    uSungB: { value: new THREE.Vector4(1, 0, 0, 6) },
    uSungC: { value: new THREE.Vector4(0, 1, 0, 1) },
    uSungSpan: { value: new THREE.Vector4(0, 1, 1, 0) },
  };
}

/** Write a SungState (and optionally a LongNote) into sung uniforms. `span` = [x0, x1, capH] of the face (local). */
export function setSungUniforms(u: Record<string, THREE.IUniform>, s: SungState, o: { existMode?: 0 | 1; hotGain?: number; long?: LongNote; span?: [number, number, number] } = {}) {
  (u.uSungA!.value as THREE.Vector4).set(s.cursor, s.hotW, s.ash, s.dead);
  // sungState.glow and LongNote.glow come from the same pitch track (1 ± 0.15): apply ONE of them, never the
  // product (+32 % pushed bone past the 0.8 lettering peak). sungState's wins when it was given a pitch track.
  const glow = s.glow !== 1 ? s.glow : (o.long?.glow ?? 1);
  (u.uSungB!.value as THREE.Vector4).set(glow, s.preview, o.existMode ?? 0, o.hotGain ?? 6);
  const l = o.long;
  (u.uSungC!.value as THREE.Vector4).set(l?.step ?? 0, l?.punch ?? 1, l?.bend ?? 0, l?.heightK ?? 1);
  if (o.span) (u.uSungSpan!.value as THREE.Vector4).set(o.span[0], o.span[1], o.span[2], 0);
}

// ================================================================ the registry

/** The glyph face of a carrier, in the carrier object's LOCAL space. */
export interface FaceSpec {
  /** extent of the lettering (thin along the normal) */
  box: THREE.Box3;
  /** out of the face (default +Z) */
  normal?: THREE.Vector3;
  /** up of the glyphs (default +Y); reading direction = up × normal … i.e. +X for the defaults */
  up?: THREE.Vector3;
  /** cap height in local units (lyricqa scales it by the world matrix and projects it) */
  capH: number;
}

/** Anti-subtitle evidence a carrier claims (§7.5: at least two). lyricqa verifies the measurable ones. */
export type CarrierTrait = 'perspective' | 'occlusion' | 'lit' | 'dof' | 'event';

export interface LyricCarrier {
  /** unique id, '<scene>/<TEXT>[#n]' by convention */
  id: string;
  /** ctx.id of the timeline entry that owns it (lyricqa only measures carriers of entries active at t) */
  scene: string;
  /** the sung word (from ctx.lyrics) — its start/end define the QA window */
  word: Word;
  /** exactly the letters made in the world (e.g. 'GUARANTEED') */
  text: string;
  method: FabMethod;
  /** hook word: cap ≥ 80 px (default HOOK_WORDS.has(text)) */
  hook: boolean;
  /** the object whose local space holds `face`; must be in the scene graph, never under a camera */
  obj: THREE.Object3D;
  face: FaceSpec;
  /** sung state getter (usually (t) => sungState(word, t, {...})) */
  sung: (t: number) => SungState;
  /** song time after which the 96 px edge margin is waived (LEADERBOARD after its first two syllables) */
  bleedAfter?: number;
  traits?: CarrierTrait[];
  /** override the QA window (default [word.start − 0.10, word.end + 0.25]) */
  qa?: [number, number];
  /** parts of a split carrier (e.g. D-E-P-T-H on five decks): each a sub-face in its own object */
  parts?: { obj: THREE.Object3D; face: FaceSpec; chars: string }[];
  /**
   * (p1v4 gates, KITS §22) the shot is about this word: the gate runner holds its cap height at onset to the v4 target
   * (hook words 90–300 px, others 70 px). Default true; set false for a word sung while the shot is about something else
   * (a small word riding a wide). lyricqa's §7.4 rules apply either way.
   */
  subject?: boolean;
}

/** (p1v4 gates) A non-lyric label a plate shows (designator, year, status text): the gate runner counts the readable ones per frame. */
export interface LabelCarrier {
  id: string;
  scene: string;
  text: string;
  obj: THREE.Object3D;
  face: FaceSpec;
}

export type HitLevel = 'S' | 'M' | 'L' | 'XL' | 'XXL';
/** (p1v4 gates) A hit a plate stages (song s): the gate runner measures camera flow, light surge / brownout and white-out around it. */
export interface HitMark { scene: string; t: number; level: HitLevel; label?: string }

/** What the owning scene shows this frame (lyricqa needs the camera; DoF params for the CoC check). */
export interface ViewInfo {
  cam: THREE.PerspectiveCamera;
  /** Dof.resolve parameters of this frame (focus distance m, aperture, maxR logical px); omit when no DoF */
  focus?: number;
  aperture?: number;
  maxR?: number;
  /** scene roots to ray-test for occlusion (default: the carrier's own top-level ancestor) */
  roots?: THREE.Object3D[];
  /** song time this view was reported at */
  t?: number;
  /**
   * time of this camera's last hard cut at or before t (`Cuts.last(t)`), if the plate cuts inside itself: lyricqa
   * does not measure screen speed / camera lock across it (a cut is not motion). Plate boundaries are known already.
   */
  cut?: number;
}

/** A seam object (TREATMENT §9): registered on both sides of a cut so `render.ts seam --cut <id>` can measure it. */
export interface HandoffCarrier {
  /** cut id from _handoff.ts (H00…H13) */
  cut: string;
  side: 'out' | 'in';
  scene: string;
  obj: THREE.Object3D;
  /** the object's extent in its local space (its screen rect is compared across the cut) */
  box: THREE.Box3;
  /** cut time (song s), only for seams that are not records of _handoff.ts (test scenes, cuts inside one plate) */
  t?: number;
}

/** Identity of a sung word across Lyrics instances: '<line>:<index in line>'. */
export const wordKey = (w: Pick<Word, 'line' | 'index'>) => `${w.line}:${w.index}`;
/** §7.4 QA window of a word: [start − 0.10, end + 0.25]. */
export const qaWindow = (w: Pick<Word, 'start' | 'end'>): [number, number] => [w.start - SUNG_T.qaPre, w.end + SUNG_T.qaPost];

export class LyricRegistry {
  readonly carriers = new Map<string, LyricCarrier>();
  readonly views = new Map<string, ViewInfo>();
  readonly handoffs = new Map<string, HandoffCarrier>();
  /** (p1v4 gates) non-lyric labels, by id */
  readonly labels = new Map<string, LabelCarrier>();
  /** (p1v4 gates) the hits each scene stages */
  readonly hitMarks = new Map<string, HitMark[]>();

  /** Add (or replace, same id) a carrier. `hook` defaults from HOOK_WORDS. Returns it. */
  register(c: Omit<LyricCarrier, 'hook'> & { hook?: boolean }): LyricCarrier {
    const full: LyricCarrier = { ...c, hook: c.hook ?? HOOK_WORDS.has(c.text) };
    this.carriers.set(full.id, full);
    return full;
  }
  unregister(id: string) { this.carriers.delete(id); }
  /** (p1v4 gates) Patch a registered carrier, e.g. `lyricReg.mark('chorus1/OF', { subject: false })`. False if no such id. */
  mark(id: string, patch: Partial<Pick<LyricCarrier, 'subject' | 'traits' | 'bleedAfter' | 'qa'>>): boolean {
    const c = this.carriers.get(id);
    if (!c) return false;
    Object.assign(c, patch);
    return true;
  }
  /** (p1v4 gates) Register a non-lyric label the frame shows (same face spec as a carrier; ≤ 3 readable per frame). */
  label(l: LabelCarrier): LabelCarrier { this.labels.set(l.id, l); return l; }
  /**
   * (p1v4 gates) The hits a scene stages, e.g. `lyricReg.hits(this.ctx.id, this.HITS)` in init() (any `{ t, level }`
   * records: _impact.Hit fits; `label`/`name` is kept). Replaces the scene's previous list. Times are song seconds.
   */
  hits(scene: string, hs: readonly { t: number; level: string; label?: string; name?: string }[]) {
    const ok = new Set(['S', 'M', 'L', 'XL', 'XXL']);
    this.hitMarks.set(scene, hs.filter((h) => Number.isFinite(h.t) && ok.has(h.level)).map((h) => ({ scene, t: h.t, level: h.level as HitLevel, label: h.label ?? h.name })));
  }
  /** Drop every carrier, view, handoff, label and hit of a scene (call at the start of init() and in dispose()). */
  clear(scene: string) {
    for (const [k, c] of this.carriers) if (c.scene === scene) this.carriers.delete(k);
    for (const [k, h] of this.handoffs) if (h.scene === scene) this.handoffs.delete(k);
    for (const [k, l] of this.labels) if (l.scene === scene) this.labels.delete(k);
    this.hitMarks.delete(scene);
    this.views.delete(scene);
  }
  all(): LyricCarrier[] { return [...this.carriers.values()]; }
  forScene(scene: string): LyricCarrier[] { return this.all().filter((c) => c.scene === scene); }
  /** QA window of a carrier (§7.4). */
  window(c: LyricCarrier): [number, number] { return c.qa ?? qaWindow(c.word); }
  /** Carriers of one sung word (optionally only of the given scenes). */
  ofWord(w: Pick<Word, 'line' | 'index'>, scenes?: Iterable<string>): LyricCarrier[] {
    const k = wordKey(w), ok = scenes ? new Set(scenes) : null;
    return this.all().filter((c) => wordKey(c.word) === k && (!ok || ok.has(c.scene)));
  }
  /** Carriers whose QA window contains t (optionally only those of the given scenes = the entries active at t). */
  at(t: number, scenes?: Iterable<string>): LyricCarrier[] {
    const ok = scenes ? new Set(scenes) : null;
    return this.all().filter((c) => { const [a, b] = this.window(c); return t >= a && t <= b && (!ok || ok.has(c.scene)); });
  }
  /** Report the camera (and DoF) a scene renders with this frame. Call every render() after placing the camera. */
  view(scene: string, v: ViewInfo) { this.views.set(scene, v); }
  viewOf(scene: string): ViewInfo | undefined { return this.views.get(scene); }
  /** Register a seam object for one side of a cut. */
  handoff(h: HandoffCarrier) { this.handoffs.set(`${h.cut}:${h.side}`, h); return h; }
  handoffOf(cut: string, side: 'out' | 'in'): HandoffCarrier | undefined { return this.handoffs.get(`${cut}:${side}`); }
}

/** One registry per page (also on globalThis.__lyricreg, so a second copy of this module finds the same one). */
export const lyricReg: LyricRegistry = ((globalThis as any).__lyricreg ??= new LyricRegistry()) as LyricRegistry;

/** §7.4.1 dev assert: null if `obj` is world-anchored, else why not (an ancestor is a camera). */
export function anchorError(obj: THREE.Object3D): string | null {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if ((o as THREE.Camera).isCamera) return `carrier ${obj.name || obj.uuid} is under camera ${o.name || o.uuid}`;
  return null;
}

/** The line a word belongs to (for lineEnd). */
export const lineOf = (ly: Lyrics, w: Word): Line => ly.lines[w.line]!;
