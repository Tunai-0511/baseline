// Seams across the hard cuts between plates, and the film camera (hits on the slams, a pump on the kicks).
// The designed hand-offs stay cuts (SVM yard → DEPTH well, the seal → each chorus, drop1 → the GAN screen, ∇ → the
// attention bricks, BERT's checkbox → RLHF, the related work list → drop2): seams go only where one world hard-cut
// to another. Times come from the timeline and the lyrics, never hard-coded.
import type { TimelineEntry } from './engine/engine';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';
import type { Direction, Hit, Seam, SeamKind } from './engine/seams';
import { norm } from './engine/lyrics';

export function makeDirection(ly: Lyrics, au: AudioData, tl: TimelineEntry[]): Direction {
  const ent = (id: string) => tl.find((e) => e.id === id);
  const start = (id: string) => ent(id)!.start;
  const S = (a: string, b: string, kind: SeamKind, pre: number, post: number, o: Partial<Seam> = {}): Seam | null =>
    ent(a) && ent(b) ? { a, b, at: start(b), kind, pre, post, ...o } : null;
  const word = (line: number, re: RegExp) => ly.lines[line]?.words.find((w) => re.test(norm(w.w)));

  const seams = [
    S('intro', 'v1sig', 'zoom', 0.22, 0.32, { ca: [0.5, 0.45], p: [5, 0.6, 2.4, 0.08], fx: { flash: 0.04, ca: 3 } }),
    S('v1sig', 'v1feat', 'whip', 0.18, 0.3, { dir: [1, 0], p: [0.05, 3.2, 0.1, 0.03], fx: { ca: 3 } }),
    S('v1feat', 'v1svm', 'slice', 0.1, 0.3, { dir: [1, 0], p: [10, 0.45, 0.012, 1] }),
    S('chorus1', 'chorus1b', 'push', 0.06, 0.4, { dir: [0, -1], p: [0.3, 3.2, 0.03, 0.05] }),
    S('chorus1b', 'verse2a', 'whip', 0.2, 0.34, { dir: [1, 0], p: [0.05, 3.2, 0.12, 0.03], fx: { ca: 3 } }),
    S('verse2a', 'verse2b', 'whip', 0.16, 0.3, { dir: [1, 0], p: [0.04, 3, 0.08, 0.02] }),
    S('verse2b', 'pre2', 'zoom', 0.2, 0.32, { p: [6, 0.6, 2.4, 0], fx: { flash: 0.03 } }),
    S('chorus2', 'chorus2b', 'slice', 0.1, 0.3, { dir: [-1, 0], p: [12, 0.5, 0.014, 1] }),
    S('verse3a', 'verse3b', 'push', 0.06, 0.4, { dir: [-1, 0], p: [0.35, 3, 0.02, -0.04] }),
    S('chorus3', 'chorus3b', 'slice', 0.1, 0.3, { dir: [1, 0], p: [11, 0.5, 0.012, 1] }),
    S('bridgeA', 'bridgeB', 'zoom', 0.2, 0.32, { p: [5, 0.6, 2.4, 0.06] }),
    S('bridgeB', 'pre4', 'whip', 0.18, 0.32, { dir: [0, -1], p: [0.05, 3, 0.1, 0.03], fx: { ca: 3 } }),
    S('chorus4', 'chorus4b', 'zoom', 0.12, 0.3, { p: [4, 2.2, 2.6, -0.12], fx: { flash: 0.05, ca: 6, width: 0.06 } }),
    S('drop2', 'tail', 'luma', 0.08, 0.6, { p: [0.25, 0.25, 0.9, 0] }),
  ].filter((x): x is Seam => !!x);

  const hits: Hit[] = [];
  // the slams: BASELINE in every chorus (and the last one), HERO, GONE, COLLAPSED
  for (const line of [11, 27, 43, 59, 67]) {
    const w = word(line, /^baseline/);
    if (w) hits.push({ t: w.start, z: 0.04, shake: 9, decay: 0.18, shock: 24 });
  }
  for (const [line, re] of [[3, /^hero/], [31, /^gone/], [32, /^collapsed/], [7, /^fall/], [18, /^explode/]] as const) {
    const w = word(line, re);
    if (w) hits.push({ t: w.start, z: 0.03, shake: 7, decay: 0.16, shock: 18 });
  }
  // the drops come in with a shockwave
  for (const name of ['drop1', 'drop2']) {
    const s = au.sections.find((x) => x.name === name);
    if (s) hits.push({ t: s.start, z: 0.05, shake: 12, decay: 0.24, shock: 34, shockSpeed: 2400 });
  }
  // the kick under the choruses and the drops
  for (const name of ['chorus1', 'chorus2', 'drop1', 'chorus3', 'chorus4', 'drop2']) {
    const s = au.sections.find((x) => x.name === name);
    if (!s) continue;
    for (const [kt, kv] of au.events('kick', s.start + 0.05, s.end)) if (kv > 0.55) hits.push({ t: kt, z: 0.007 * kv, decay: 0.09, attack: 0.012 });
  }
  return { seams, hits, moves: [] };
}
