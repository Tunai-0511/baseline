// Cut-aware motion-blur shutter (pure functions; Engine.shutterSpan uses them). Owner: engine.
// A frame's sub-frames must never blend two shots: the shutter interval of frame t is clipped to the side of every
// hard cut that t is on, and slid away from the cut to keep its length as far as the frame's own slot allows.

/** Song-time margin a sub-frame keeps from the next cut (it must render the shot before it). */
export const CUT_EPS = 1e-6;

/**
 * Hard cuts of a timeline: entry boundaries that nothing spans across (A ends where B starts, no overlap; also the
 * song's start and end). An overlap (a crossfade, a scene's own transition) is continuous and not a cut.
 * (Entry e is on screen for e.start <= t < e.end, as Engine.composite has it.)
 */
export function timelineCuts(tl: { start: number; end: number }[]): number[] {
  const xs = [...new Set(tl.flatMap((e) => [e.start, e.end]))].sort((a, b) => a - b);
  return xs.filter((b) => {
    const before = tl.filter((e) => e.start < b && e.end >= b), after = tl.filter((e) => e.start <= b && b < e.end);
    return (before.length > 0 || after.length > 0) && !before.some((e) => after.includes(e));
  });
}

/**
 * The shutter interval [lo, hi] (song s) of frame t: `shutter` × dt centred on t, unless a cut lies within the frame's
 * slot t ± max(dt, shutter·dt)/2. Then it is clipped to t's side (t exactly at a cut belongs to the shot after it;
 * the shot before ends CUT_EPS before the cut) and slid away from the cut to keep its length where the slot has room.
 * Sub-frames stay inside the slot, so no instant is sampled by two frames.
 */
export function shutterSpanOf(t: number, dt: number, shutter: number, cuts: Iterable<number>): [number, number] {
  const w = dt * shutter, lo = t - w / 2, hi = t + w / 2;
  if (!(w > 0)) return [lo, hi];
  const half = Math.max(w, dt) / 2, sLo = t - half, sHi = t + half;
  let a = -Infinity, b = Infinity;
  for (const c of cuts) {
    if (!(c > sLo && c <= sHi)) continue;
    if (c <= t) a = Math.max(a, c); else b = Math.min(b, c);
  }
  if (a === -Infinity && b === Infinity) return [lo, hi];
  const L0 = Math.max(sLo, a), R0 = Math.min(sHi, b - CUT_EPS);
  let L = Math.max(lo, L0), R = Math.min(hi, R0);
  if (lo < L0) R = Math.min(R0, L + w);
  else if (hi > R0) L = Math.max(L0, R - w);
  return [L, Math.max(L, R)];
}
