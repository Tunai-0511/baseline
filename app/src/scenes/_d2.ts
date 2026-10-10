// 2D design kit for the Baseline MV (user, 2026-10-10: "每段都是不同的設計風格", clear, colourful, not obsessed with 3D).
// A D2Scene draws one Canvas2D frame (1920 × 1080 logical px) as a pure function of song time t; the engine's post
// adds bloom / grain / shake. Every section brings its own palette and design language; this file only holds the
// plumbing: text with karaoke states, shapes, a 2D camera, beats, pixel fonts, and timing helpers.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, clearRT } from '../engine/gl';
import { font, layout } from '../engine/type';
import { clamp, lerp, ease, hash } from '../engine/util';
import type { Word, Line } from '../engine/lyrics';
import { dotMask } from './_seg';

export { W, H, clamp, lerp, ease, hash };
export type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- colour
export function hexA(hex: string, a = 1): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function mixHex(a: string, b: string, k: number): string {
  const p = parseInt(a.replace('#', ''), 16), q = parseInt(b.replace('#', ''), 16);
  const ch = (s: number) => Math.round(lerp((p >> s) & 255, (q >> s) & 255, clamp(k)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------- the scene base
export abstract class D2Scene extends Scene {
  layer = new Layer2D();
  /** background colour (CSS) the layer is cleared to */
  bg = '#000000';
  /** `under`: drawn after the clear and before the frame (a VScene's floor reflection). */
  override render(f: Frame, out: THREE.WebGLRenderTarget, under?: (c: Ctx) => void): PostOverrides {
    const { renderer, comp } = this.ctx;
    clearRT(renderer, out, [0, 0, 0]);
    this.layer.clear(this.bg);
    const c = this.layer.ctx;
    if (under) { c.save(); under(c); c.restore(); }
    c.save();
    c.textBaseline = 'alphabetic';
    const post = this.draw(c, f.t, f) ?? {};
    c.restore();
    comp.draw(renderer, this.layer.upload(), out);
    return { grade: 0, bloom: 0.35, bloomThreshold: 0.9, grain: 0.045, vignette: 0.25, ca: 0.25, halation: 0.1, ...post };
  }
  abstract draw(c: Ctx, t: number, f: Frame): PostOverrides | void;
  /** words of lyric line i */
  W(i: number): Word[] { return this.ctx.lyrics.lines[i]!.words; }
  line(i: number): Line { return this.ctx.lyrics.lines[i]!; }
  /** beat times in [a, b) */
  beats(a: number, b: number): number[] {
    const au = this.ctx.audio, out: number[] = [];
    for (let i = Math.ceil(au.beatAt(a) - 1e-6); ; i++) { const x = au.timeOfBeat(i); if (x >= b) break; if (x >= a - 1e-6) out.push(x); if (out.length > 600) break; }
    return out;
  }
  /** time since the last beat (s) and its index */
  lastBeat(t: number): { t0: number; i: number } {
    const au = this.ctx.audio, i = Math.floor(au.beatAt(t) + 1e-6);
    return { t0: au.timeOfBeat(i), i };
  }
  /** 1 on each beat decaying with half-life hl */
  beatPulse(t: number, hl = 0.09): number { const b = this.lastBeat(t); return Math.pow(0.5, (t - b.t0) / hl); }
}

// ---------------------------------------------------------------- timing
export const prog = (t: number, a: number, b: number, e: (x: number) => number = ease.linear) => e(clamp((t - a) / Math.max(1e-6, b - a)));
/** sung fraction of a word (karaoke front) */
export const sungW = (t: number, w: Word, min = 0.12) => clamp((t - w.start) / Math.max(min, w.end - w.start));
/** 1 at t0, halving every hl */
export const hot = (t: number, t0: number, hl = 0.06) => (t < t0 ? 0 : Math.pow(0.5, (t - t0) / hl));
/** visible window with fades */
export const win = (t: number, a: number, b: number, fi = 0.12, fo = 0.12) => clamp(Math.min((t - a) / fi, (b - t) / fo));
/** typewriter: how many chars of s are shown at t (cps chars/s from t0) */
export const typed = (s: string, t: number, t0: number, cps = 30) => s.slice(0, Math.max(0, Math.floor((t - t0) * cps)));
/** spread the characters of a word over its sung span: count of chars lit */
export const charsLit = (w: Word, t: number, n = w.w.length) => Math.max(0, Math.min(n, Math.floor(((t - w.start) / Math.max(0.1, w.end - w.start)) * n * 1.4 + (t >= w.start ? 1 : 0))));

// ---------------------------------------------------------------- text
export interface TxtOpt {
  size: number; fam: string; color?: string; align?: CanvasTextAlign; base?: CanvasTextBaseline; alpha?: number;
  track?: number; stroke?: string; strokeW?: number; glow?: number; glowColor?: string;
}
export function setFont(c: Ctx, o: TxtOpt) {
  c.font = font(o.fam, o.size);
  c.textAlign = o.align ?? 'left';
  c.textBaseline = o.base ?? 'alphabetic';
  c.letterSpacing = `${(o.track ?? 0) * o.size}px`;
}
export function txt(c: Ctx, s: string, x: number, y: number, o: TxtOpt) {
  c.save();
  setFont(c, o);
  c.globalAlpha *= o.alpha ?? 1;
  if (o.glow) { c.shadowBlur = o.glow; c.shadowColor = o.glowColor ?? o.color ?? '#fff'; }
  if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.strokeW ?? 2; c.lineJoin = 'round'; c.strokeText(s, x, y); }
  if (o.color) { c.fillStyle = o.color; c.fillText(s, x, y); }
  c.restore();
}
export function tw(c: Ctx, s: string, o: TxtOpt): number { c.save(); setFont(c, o); const w = c.measureText(s).width; c.restore(); return w; }
/** largest size ≤ max so that s fits in maxW */
export function fit(c: Ctx, s: string, fam: string, maxW: number, max = 400, track = 0): number {
  let lo = 4, hi = max;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (tw(c, s, { size: m, fam, track }) <= maxW) lo = m; else hi = m; }
  return Math.floor(lo);
}
/** cap height of a family at size (Archivo ≈ 0.72, Plex ≈ 0.7) */
export const capOf = (size: number, k = 0.72) => size * k;

/**
 * Karaoke text: the whole string in `dim` (or nothing), the sung part in `on`, a white-hot front. prog 0..1 over the
 * string's width (left → right). Works with any align.
 */
export function wipeTxt(c: Ctx, s: string, x: number, y: number, prog: number, o: TxtOpt & { on: string; dim?: string; hotColor?: string }) {
  const w = tw(c, s, o), al = o.align ?? 'left';
  const x0 = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;
  if (o.dim) txt(c, s, x, y, { ...o, color: o.dim, glow: 0, stroke: undefined });
  if (prog <= 0) return w;
  c.save();
  c.beginPath();
  c.rect(x0 - 4, y - o.size * 1.4, w * clamp(prog) + 8, o.size * 2.2);
  c.clip();
  txt(c, s, x, y, { ...o, color: o.on });
  c.restore();
  return w;
}

/** A line of words laid out left → right with per-word state colours: upcoming / current / sung. Returns word boxes. */
export function lyricRow(c: Ctx, words: Word[], t: number, x: number, y: number, o: TxtOpt & { up?: string; cur: string; done: string; gap?: number; upAlpha?: number; text?: (w: Word) => string }) {
  setFont(c, o);
  const gap = o.gap ?? o.size * 0.28;
  const texts = words.map((w) => (o.text ? o.text(w) : w.w));
  const widths = texts.map((s) => tw(c, s, o));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  let xx = (o.align ?? 'left') === 'center' ? x - total / 2 : (o.align === 'right' ? x - total : x);
  const boxes: { x: number; w: number; s: string; word: Word }[] = [];
  words.forEach((w, i) => {
    const p = sungW(t, w);
    const s = texts[i]!;
    if (t < w.start) { if (o.up) txt(c, s, xx, y, { ...o, align: 'left', color: o.up, alpha: o.upAlpha ?? 1, glow: 0 }); }
    else wipeTxt(c, s, xx, y, Math.min(1, p * 1.6), { ...o, align: 'left', on: p < 1 ? o.cur : o.done, dim: o.up });
    boxes.push({ x: xx, w: widths[i]!, s, word: w });
    xx += widths[i]! + gap;
  });
  return { boxes, total };
}

/**
 * A lyric line as a typographic block: words wrapped into rows within maxW, each word coloured by its state —
 * upcoming (up, may be '' to hide), being sung (cur, with a wipe), sung (done). Returns the word boxes (for anchoring
 * graphics to words). `upper` uppercases the display text.
 */
export function lyricBlock(c: Ctx, words: Word[], t: number, x: number, y: number, o: TxtOpt & { maxW: number; lead?: number; up: string; cur: string; done: string; upper?: boolean; gap?: number; pop?: number; text?: (w: Word, i: number) => string }) {
  setFont(c, o);
  const gap = o.gap ?? o.size * 0.26, lead = o.lead ?? o.size * 1.02;
  const items = words.map((w, i) => { const s0 = o.text ? o.text(w, i) : w.w; const s = o.upper ? s0.toUpperCase() : s0; return { w, s, wd: tw(c, s, o) }; });
  const rows: (typeof items)[] = [[]];
  let rw = 0;
  for (const it of items) {
    const cur = rows[rows.length - 1]!;
    if (cur.length && rw + gap + it.wd > o.maxW) { rows.push([it]); rw = it.wd; } else { cur.push(it); rw += (cur.length > 1 ? gap : 0) + it.wd; }
  }
  const boxes: { x: number; y: number; w: number; s: string; word: Word }[] = [];
  rows.forEach((row, ri) => {
    const total = row.reduce((a, b) => a + b.wd, 0) + gap * (row.length - 1);
    let xx = (o.align ?? 'left') === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    const yy = y + ri * lead;
    for (const it of row) {
      const p = sungW(t, it.w);
      const pop = o.pop ? 1 + o.pop * hot(t, it.w.start, 0.08) : 1;
      c.save();
      if (pop !== 1) { c.translate(xx + it.wd / 2, yy - o.size * 0.35); c.scale(pop, pop); c.translate(-(xx + it.wd / 2), -(yy - o.size * 0.35)); }
      if (t < it.w.start) { if (o.up) txt(c, it.s, xx, yy, { ...o, align: 'left', color: o.up, glow: 0 }); }
      else wipeTxt(c, it.s, xx, yy, Math.min(1, p * 1.8), { ...o, align: 'left', on: p < 1 ? o.cur : o.done, dim: o.up || undefined });
      c.restore();
      boxes.push({ x: xx, y: yy, w: it.wd, s: it.s, word: it.w });
      xx += it.wd + gap;
    }
  });
  return { boxes, rows: rows.length, lead };
}

// ---------------------------------------------------------------- shapes
export function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath();
  c.moveTo(x + k, y); c.lineTo(x + w - k, y); c.quadraticCurveTo(x + w, y, x + w, y + k);
  c.lineTo(x + w, y + h - k); c.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  c.lineTo(x + k, y + h); c.quadraticCurveTo(x, y + h, x, y + h - k);
  c.lineTo(x, y + k); c.quadraticCurveTo(x, y, x + k, y); c.closePath();
}
export function fillRR(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string) { rr(c, x, y, w, h, r); c.fillStyle = fill; c.fill(); }
export function strokeRR(c: Ctx, x: number, y: number, w: number, h: number, r: number, stroke: string, lw = 2) { rr(c, x, y, w, h, r); c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
export function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: string, lw = 2, dash?: number[]) {
  c.save(); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; if (dash) c.setLineDash(dash);
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore();
}
export function arrow(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: string, lw = 3, head = 14) {
  line(c, x0, y0, x1, y1, col, lw);
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.save(); c.fillStyle = col; c.beginPath(); c.moveTo(x1, y1);
  c.lineTo(x1 - Math.cos(a - 0.45) * head, y1 - Math.sin(a - 0.45) * head);
  c.lineTo(x1 - Math.cos(a + 0.45) * head, y1 - Math.sin(a + 0.45) * head); c.closePath(); c.fill(); c.restore();
}
export function circle(c: Ctx, x: number, y: number, r: number, fill?: string, stroke?: string, lw = 2) {
  c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
export function poly(c: Ctx, pts: [number, number][], col: string, lw = 2, close = false, fill?: string) {
  if (pts.length < 2) return;
  c.beginPath(); c.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]![0], pts[i]![1]);
  if (close) c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  c.strokeStyle = col; c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke();
}
/** a plot curve y = f(x) over [x0,x1] mapped into the box */
export function plot(c: Ctx, f: (x: number) => number, box: { x: number; y: number; w: number; h: number }, xr: [number, number], yr: [number, number], col: string, lw = 3, upto = 1) {
  const pts: [number, number][] = [];
  const n = 120;
  for (let i = 0; i <= n * clamp(upto); i++) {
    const u = i / n, xv = lerp(xr[0], xr[1], u), yv = f(xv);
    pts.push([box.x + u * box.w, box.y + box.h - ((yv - yr[0]) / (yr[1] - yr[0])) * box.h]);
  }
  poly(c, pts, col, lw);
}

// ---------------------------------------------------------------- 2D camera
/** Apply a camera: the point (cx, cy) of the design goes to frame centre, zoomed, rotated, then offset. */
export function cam(c: Ctx, cx: number, cy: number, zoom = 1, rot = 0, dx = 0, dy = 0) {
  c.translate(W / 2 + dx, H / 2 + dy);
  c.rotate(rot);
  c.scale(zoom, zoom);
  c.translate(-cx, -cy);
}

// ---------------------------------------------------------------- pixel font (5×7)
/** 5×7 pixel text; px = pixel size; lit(i) 0..1 per char; returns width */
export function pix(c: Ctx, s: string, x: number, y: number, px: number, col: string, o: { lit?: (i: number) => number; off?: string; gap?: number; align?: 'left' | 'center' | 'right'; glow?: number } = {}) {
  const cw = px * 6, total = s.length * cw - px;
  let x0 = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  c.save();
  if (o.glow) { c.shadowBlur = o.glow; c.shadowColor = col; }
  for (let i = 0; i < s.length; i++) {
    const [m0, m1] = dotMask(s[i]!.toUpperCase());
    const L = o.lit ? clamp(o.lit(i)) : 1;
    for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) {
      const bit = r < 4 ? (m0 >> (r * 5 + k)) & 1 : (m1 >> ((r - 4) * 5 + k)) & 1;
      if (bit && L > 0) { c.globalAlpha = L; c.fillStyle = col; c.fillRect(x0 + k * px, y + r * px, px * 0.88, px * 0.88); }
      else if (o.off) { c.globalAlpha = 1; c.fillStyle = o.off; c.fillRect(x0 + k * px, y + r * px, px * 0.88, px * 0.88); }
    }
    x0 += cw;
  }
  c.restore();
  return total;
}

// ---------------------------------------------------------------- misc
/** deterministic pseudo-random in [0,1) */
export const rnd = (...k: number[]) => hash(...k);
/** grain of dots / noise texture drawn with tiny rects (cheap) */
export function scatter(c: Ctx, n: number, seed: number, col: string, size = 2, box = { x: 0, y: 0, w: W, h: H }) {
  c.fillStyle = col;
  for (let i = 0; i < n; i++) c.fillRect(box.x + rnd(i, seed) * box.w, box.y + rnd(i, seed, 7) * box.h, size, size);
}
export function layoutW(s: string, fam: string, size: number) { return layout(s, fam, size).width; }
