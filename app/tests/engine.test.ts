// Engine: cut-aware shutter (no frame blends two shots) and the v3 display grade's curve. Owner: engine.
import { describe, expect, test } from 'bun:test';
import { CUT_EPS, shutterSpanOf, timelineCuts } from '../src/engine/shutter';
import { DEFAULT_POST, GRADE_BRIGHT, GRADE_LEGIBLE, gradeCurve } from '../src/engine/post';

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

describe('timelineCuts', () => {
  test('abutting entries cut, overlaps do not', () => {
    const tl = [{ start: 0, end: 10 }, { start: 10, end: 20 }, { start: 19, end: 30 }, { start: 30, end: 40 }];
    expect(timelineCuts(tl)).toEqual([0, 10, 30, 40]); // 19 and 20 are inside the crossfade
  });
  test('a gap cuts on both sides', () => {
    expect(timelineCuts([{ start: 0, end: 5 }, { start: 6, end: 8 }])).toEqual([0, 5, 6, 8]);
  });
});

describe('shutterSpanOf', () => {
  const dt = 1 / 60, sh = 0.5, w = dt * sh;
  test('no cut: symmetric', () => {
    const [a, b] = shutterSpanOf(10, dt, sh, [9, 11]);
    expect(a).toBeCloseTo(10 - w / 2, 12); expect(b).toBeCloseTo(10 + w / 2, 12);
  });
  test('46.733 (stack): the cut at 46.732 is inside the old shutter; the span slides to [cut, cut + w]', () => {
    const t = 2804 / 60, c = 46.732; // 46.7333
    const [a, b] = shutterSpanOf(t, dt, sh, [c]);
    expect(a).toBe(c); expect(b - a).toBeCloseTo(w, 12);
  });
  test('a cut just after t: the span ends before it', () => {
    const t = 10, c = 10.002;
    const [a, b] = shutterSpanOf(t, dt, sh, [c]);
    expect(b).toBeCloseTo(c - CUT_EPS, 12); expect(b - a).toBeCloseTo(w, 9);
  });
  test('t exactly at a cut belongs to the shot after it', () => {
    const [a] = shutterSpanOf(12, dt, sh, [12]);
    expect(a).toBe(12);
  });
  test('shutter 1: no room to slide, clipped', () => {
    const [a, b] = shutterSpanOf(10, dt, 1, [10 - 0.001]);
    expect(a).toBeCloseTo(10 - 0.001, 12); expect(b).toBeCloseTo(10 + dt / 2, 12);
  });
  test('property: every sub-frame on t\'s side of every cut, inside the frame slot, never longer than the shutter', () => {
    const r = rng(7);
    for (let i = 0; i < 20000; i++) {
      const t = 40 + r() * 20, shutter = [0.25, 0.5, 0.75, 1][i % 4]!;
      const cuts = Array.from({ length: 1 + (i % 3) }, () => t + (r() - 0.5) * 1.2 * dt);
      const [a, b] = shutterSpanOf(t, dt, shutter, cuts);
      const half = Math.max(dt * shutter, dt) / 2;
      expect(b).toBeGreaterThanOrEqual(a);
      expect(b - a).toBeLessThanOrEqual(dt * shutter + 1e-12);
      expect(a).toBeGreaterThanOrEqual(t - half - 1e-12); expect(b).toBeLessThanOrEqual(t + half + 1e-12);
      for (const c of cuts) {
        if (c <= t) expect(a).toBeGreaterThanOrEqual(c);
        else expect(b).toBeLessThan(c);
      }
    }
  });
});

describe('gradeCurve (v3 display grade)', () => {
  test('monotonic, 0 -> 0, white reachable, never above 1', () => {
    let prev = -1;
    for (let k = 0; k <= 4000; k++) {
      const x = (k / 4000) ** 3 * 20;
      const y = gradeCurve(x);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(y).toBeLessThanOrEqual(1);
      prev = y;
    }
    expect(gradeCurve(0)).toBe(0);
    expect(gradeCurve(20)).toBeGreaterThan(0.999);
  });
  test('dense blacks: deep shadows no brighter than the Phase 0 tone; mids lifted', () => {
    expect(gradeCurve(0.001)).toBeLessThanOrEqual(0.001);
    expect(gradeCurve(0.002)).toBeLessThanOrEqual(0.002);
    expect(gradeCurve(0.02)).toBeGreaterThan(0.02 * 2.5);
    expect(gradeCurve(0.08)).toBeGreaterThan(0.08 * 2.5);
    expect(gradeCurve(0.8)).toBeGreaterThan(0.97); // bone lettering stays the brightest thing on screen
  });
  test('grade 0 is the Phase 0 shoulder (identity below 0.72)', () => {
    for (const x of [0, 0.01, 0.2, 0.5, 0.71]) expect(gradeCurve(x, { grade: 0 })).toBeCloseTo(x, 12);
    expect(gradeCurve(1.0, { grade: 0 })).toBeCloseTo(0.72 + 0.28 * (1 - Math.exp(-0.28 / 0.28)), 12);
  });
  test('defaults are the v3 look (GRADE_BRIGHT)', () => {
    for (const [k, v] of Object.entries(GRADE_BRIGHT)) expect(DEFAULT_POST[k as keyof typeof DEFAULT_POST]).toBe(v);
  });
  test('GRADE_LEGIBLE keeps a bone word readable on a brighter lit face than BRIGHT does (WCAG 4.5:1)', () => {
    const wcagLimit = (p: object) => { // brightest neutral surround (scene-linear) for 4.5:1 against bone at 0.8
      const g = gradeCurve(0.8, p), lim = (g + 0.05) / 4.5 - 0.05;
      let lo = 0, hi = 0.8;
      for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (gradeCurve(m, p) > lim) hi = m; else lo = m; }
      return lo;
    };
    expect(wcagLimit(GRADE_LEGIBLE)).toBeGreaterThan(1.8 * wcagLimit(GRADE_BRIGHT));
  });
});
