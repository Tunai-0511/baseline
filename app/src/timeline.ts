// The edit: which scene plays when. Cuts are anchored to lyric lines and snapped to the beat
// grid (data/lyrics.json, data/audio.json), never hard-coded seconds. Sections without a plate
// yet play the `sketch` sync-check scene.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>(['./scenes/*.ts', './scenes/pd/*.ts']);
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  /** Cut on the last beat at/before the first word of the matching line (tol: words that start a hair early). */
  const cut = (q: string, nth = 0, tol = 0.05) => {
    const s = ly.get(q, nth).words[0]!.start;
    return au.timeOfBeat(Math.floor(au.beatAt(s + tol)));
  };
  const sec = (name: string) => au.sections.find((s) => s.name === name)!;
  const E = (id: string, file: string, start: number, end: number, params: Record<string, any> = {}): TimelineEntry =>
    ({ id, load: scene(file), start, end, params });

  // ?scene=<file>[&sp=<json params>]: play one scene file over the whole song (kit tests, zz_ look sheets,
  // building a plate before it is on the edit); render.ts passes --scene / --sp through
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const solo = q?.get('scene');
  if (solo) return [E(solo, solo, 0, au.duration, q?.get('sp') ? JSON.parse(q.get('sp')!) : {})];

  // v5 (2026-10-10, user: 每段都是不同的設計風格): one 2D design scene per section, cuts on the beat before each line
  /** a hair before the first sung word of line i (for a cut that lands on the vocal, when the beat is far from it) */
  const onset = (i: number) => ly.lines[i]!.words[0]!.start - 0.02;
  const cutL = (i: number) => au.timeOfBeat(Math.floor(au.beatAt(ly.lines[i]!.words[0]!.start + 0.05)));
  // scene files that exist; the rest play the sync-check placeholder until they are written
  const READY = new Set(Object.keys(modules).map((k) => k.replace('./scenes/', '').replace('.ts', '')));
  const S = (id: string, file: string, a: number, b: number, p: Record<string, any> = {}) =>
    READY.has(file) ? E(id, file, a, b, p) : E(id, 'sketch', a, b, { section: id });
  const plates: TimelineEntry[] = [
    // v3 (2026-10-10, STORYBOARD-v3.md): original plates, one per idea; p(doom) lends technique only
    S('intro', 'v_intro', 0, onset(2)),
    S('v1sig', 'v_sig', onset(2), onset(4)),
    S('v1feat', 'v_feat', onset(4), cutL(6)),
    S('v1svm', 'v_svm', cutL(6), cutL(8)),
    S('pre1', 'v_pre', cutL(8), cutL(10), { key: 'depth' }),
    S('chorus1', 'v_lb', cutL(10), cutL(14), { n: 1 }),
    S('chorus1b', 'v_shelf', cutL(14), cutL(16)),
    S('verse2a', 'v_seq1', cutL(16), onset(20)),
    S('verse2b', 'v_seq2', onset(20), cutL(24)),
    S('pre2', 'v_pre', cutL(24), cutL(26), { key: 'memory' }),
    S('chorus2', 'v_lb', cutL(26), cutL(30), { n: 2 }),
    S('chorus2b', 'v_gone', cutL(30), cutL(32)),
    S('verse3a', 'v_gen2', cutL(32), onset(36)),
    S('verse3b', 'v_eff2', onset(36), cutL(40)),
    S('pre3', 'v_pre', cutL(40), cutL(42), { key: 'attention' }),
    S('chorus3', 'v_lb', cutL(42), cutL(46), { n: 3 }),
    S('chorus3b', 'v_bert', cutL(46), cutL(48)),
    S('bridgeA', 'v_align', cutL(48), cutL(52)),
    S('bridgeB', 'v_ctx', cutL(52), cutL(56)),
    S('pre4', 'v_pre', cutL(56), cutL(58), { key: 'scale' }),
    S('chorus4', 'v_lb', cutL(58), cutL(62), { n: 4 }),
    S('chorus4b', 'v_quad', cutL(62), cutL(64)),
    S('stop', 'v_stop', cutL(64), sec('drop2').start),
    S('drop2', 'v_fall', sec('drop2').start, cutL(68)),
    S('tail', 'v_tail', cutL(68), au.duration),
  ];
  // everything else: the sync-check placeholder, section by section, in the gaps the plates leave
  // (a section can be split by a plate into a head and a tail piece)
  const out: TimelineEntry[] = [];
  const sorted = [...plates].sort((x, y) => x.start - y.start);
  for (const s of au.sections) {
    let a = s.start, n = 0;
    for (const p of sorted) {
      if (p.end <= a || p.start >= s.end) continue;
      if (p.start - a > 0.05) out.push(E(n++ ? `${s.name}.${n}` : s.name, 'sketch', a, p.start, { section: s.name }));
      a = Math.max(a, p.end);
    }
    if (s.end - a > 0.05) out.push(E(n++ ? `${s.name}.${n}` : s.name, 'sketch', a, s.end, { section: s.name }));
  }
  return [...out, ...plates].sort((x, y) => x.start - y.start);
}
