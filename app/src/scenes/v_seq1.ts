// v3 verse2 a, L16–L19 ("N-gram counting words, a window three tokens wide, / RNN kept a hidden state and carried it
// inside / Backprop through time, the gradients vanish or explode, / LSTM put gates along the road"): NIGHT LINE.
// The song itself is the train: every sung word is a wagon on a night railway, lit as it is sung.
//   n-gram — a gantry three wagons wide slides along the train; the trigram under it and its count, and a board of
//            what an n-gram counted on this very song (data/trigram.json: P(art | of the) = 5/9 …)
//   RNN    — a crane rides the overhead rail, stopping over each wagon to read it; the 8 LEDs on its face are the real
//            hidden state of a tanh RNN after each token (data/rnn_bptt.json), carried from wagon to wagon
//   BPTT   — the track forks behind the crane: on one branch the gradient's norm falls to 10⁻²⁰ (spectral radius
//            0.84: VANISH), on the other it climbs to 10⁶ (3.16: EXPLODE)
//   LSTM   — gates along the road: forget / input / output barriers at every wagon, opened by the real gate values of
//            an LSTM on the same words (data/lstm_gates.json); the cell state runs over them as a straight wire
// Style: night rail — navy, sodium lamps, signal green and red, bone type.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, vlerp, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BG = '#0B0A0D', NAVY = '#121016', SOD = '#EDEAF2', GRN = '#C9C5D1', RED = '#FF2E7E', BONE = '#EDEAF2', CYAN = '#EDEAF2', STEEL = '#5C5966';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), COND = F.archivo(75, 900), MONO = F.mono(500), MONOB = F.mono(700);
const PITCH = 2.7, WL = 2.3, WH = 1.3, WD = 1.3; // wagon pitch, length, height, depth
const CRANE_Y = 4.6;

interface Tok { w: Word; s: string; x: number; line: number }

export default class Seq1 extends VScene {
  private toks: Tok[] = [];
  private L: Word[][] = [];
  private head: { context: string[]; next: string; count: number; context_count: number; text: string }[] = [];
  private top: { g: string[]; c: number }[] = [];
  private h17: number[][] = [];
  private van: number[] = []; private exp: number[] = [];
  private gates: { f: number[]; i: number[]; o: number[] } | null = null;

  override async init() {
    this.bg = BG;
    this.env = { eq: ['ngram', 'rnn', 'bptt', 'lstm_f', 'lstm_i', 'lstm_c', 'lstm_h'], seed: 7, keep: (_x, z) => Math.abs(z) > 34 }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L = [0, 1, 2, 3].map((k) => ly.lines[i0 + k]!.words);
    const prev = ly.lines[i0 - 1]!.words.slice(-2);
    let k = 0;
    for (const w of prev) this.toks.push({ w, s: w.w.toUpperCase().replace(/[,.]/g, ''), x: k++ * PITCH, line: -1 });
    this.L.forEach((ws, li) => ws.forEach((w) => this.toks.push({ w, s: w.w.toUpperCase().replace(/[,.]/g, ''), x: k++ * PITCH, line: li })));
    try {
      const tg = await (await fetch('data/trigram.json')).json();
      this.head = tg.headline; this.top = tg.top_trigrams;
      const rb = await (await fetch('data/rnn_bptt.json')).json();
      this.h17 = rb.state.L17_h; this.van = rb.bptt.vanish.grad_norm; this.exp = rb.bptt.explode.grad_norm;
      const lg = await (await fetch('data/lstm_gates.json')).json();
      this.gates = lg.display;
    } catch { /* */ }
    const s = this.ctx.start, e = this.ctx.end;
    const t17 = this.L[1]![0]!.start, t18 = this.L[2]![0]!.start, t19 = this.L[3]![0]!.start;
    const tVan = this.L[2]!.find((w) => /vanish/.test(w.w))!.start;
    this.rig = new Rig([
      { t0: s, name: 'window', key: (t) => { const x = this.winX(t); return K([x + 3.2, 4.6, 13.0], [x + 0.6, 2.9, 0], 44, -0.02); } },
      { t0: t17 - 0.05, snap: 0.5, name: 'crane', key: (t) => { const x = this.craneX(t); return K([x + 4.5, 6.6, 12], [x + 0.6, 3.7, 0], 44, -0.03); } },
      { t0: t18 - 0.05, snap: 0.6, name: 'fork', key: (t) => { const x = this.craneX(t18); const k = ease.inOutCubic(clamp((t - t18) / (tVan - t18 + 0.4))); return K([x + lerp(4, 7.5, k), lerp(5.5, 7.5, k), lerp(7, 0.4, k)], [x - lerp(6, 16, k), lerp(2.0, 1.2, k), 0], lerp(48, 56, k), 0); } },
      { t0: t19 - 0.05, snap: 0.55, name: 'gates', key: (t) => { const x = this.roadX(t); return K([x + 5.4, 5.6, 12.5], [x + 1.2, 3.4, 0], 46, -0.03); } },
    ], [{ t: t17, amp: 0.6 }, { t: t18, amp: 0.8 }, { t: tVan, amp: 0.5 }, { t: this.L[2]!.find((w) => /explode/.test(w.w))!.start, amp: 1.6 }, { t: t19, amp: 0.8 }], 0.8, 81);
  }

  private tokAt(w: Word) { return this.toks.find((q) => q.w === w)!; }
  /** the trigram gantry's centre: over the last three sung wagons */
  private winX(t: number) {
    let i = 2;
    for (let k = 2; k < this.toks.length; k++) if (this.toks[k]!.w.start <= t + 0.02) i = k;
    const a = this.toks[Math.max(0, i - 1)]!.x, b = this.toks[i - 1]!.x;
    const prev = this.toks[Math.max(2, i - 1) - 1]!.x;
    const k = ease.outCubic(clamp((t - this.toks[i]!.w.start) / 0.18));
    void a; void b;
    return lerp(prev, this.toks[i - 1]!.x, k);
  }
  /** the crane: over the wagon being read (L17 onward) */
  private craneX(t: number) {
    const ws = this.L[1]!;
    let x = this.tokAt(ws[0]!).x - PITCH;
    for (const w of ws) { const tk = this.tokAt(w); const k = ease.inOutCubic(clamp((t - (w.start - 0.12)) / 0.2)); x = lerp(x, tk.x, k); }
    return x;
  }
  private roadX(t: number) {
    const ws = this.L[3]!;
    let x = this.tokAt(ws[0]!).x - PITCH * 1.5;
    for (const w of ws) { const tk = this.tokAt(w); const k = ease.inOutCubic(clamp((t - (w.start - 0.15)) / 0.3)); x = lerp(x, tk.x, k); }
    return x;
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L = this.L;
    const t17 = L[1]![0]!.start, t18 = L[2]![0]!.start, t19 = L[3]![0]!.start;
    const kick = this.beatPulse(t, 0.08);
    const xs = this.toks.map((q) => q.x);
    const x0 = xs[0]! - 20, x1 = xs[xs.length - 1]! + 20;
    // ------------------------------------------------ night: ground, lamps, distant city
    pool(c, W * 0.5, H * 0.62, 1000, '#16224A', 0.5);
    this.grid3(c, floorPl(-0.02), x0, x1, -18, 12, 2, '#101A3A', 1, { alpha: 0.8, fog: [10, 50] });
    for (let i = 0; i < 46; i++) {
      const x = x0 + (i / 45) * (x1 - x0), h = 3 + 7 * hash(i, 1);
      this.rect3(c, wallPl(-16), x - 1.4, 0, 2.8 * (0.6 + hash(i, 2)), h, { fill: '#08102A', stroke: hexA('#1E2C5A', 0.8), lw: 1 });
      for (let j = 0; j < 5; j++) if (hash(i, j, 3) > 0.55) this.dot3(c, at(wallPl(-15.98), x - 0.8 + 0.5 * (j % 3), 1 + j * 1.3), 0.08, hexA(SOD, 0.5 + 0.4 * hash(i, j)));
    }
    // lamps along the line
    for (let x = x0; x < x1; x += 8) {
      this.seg(c, [x, 0, -2.4], [x, 5.4, -2.4], STEEL, 1.4);
      const q = this.pr([x, 5.4, -2.4]);
      if (q.z > this.near) { c.save(); c.globalCompositeOperation = 'lighter'; const R = Math.min(40, 18 * q.k * 0.3 + 4); const g = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, R); g.addColorStop(0, hexA(SOD, 0.22)); g.addColorStop(1, hexA(SOD, 0)); c.fillStyle = g; c.fillRect(q.x - R, q.y - R, 2 * R, 2 * R); c.restore(); }
    }
    // ------------------------------------------------ the track
    const sl: [V3, V3][] = [];
    for (let x = x0; x < x1; x += 0.8) sl.push([[x, 0.02, -0.9], [x, 0.02, 0.9]]);
    this.segs(c, sl, '#2A3458', 3);
    for (const z of [-0.6, 0.6]) this.seg(c, [x0, 0.08, z], [x1, 0.08, z], '#8A97B8', 1.6);
    // ------------------------------------------------ the wagons (the words)
    this.toks.forEach((q, i) => {
      const sung = t >= q.w.start;
      const hotk = hot(t, q.w.start, 0.25);
      const lit = sung ? 1 : 0.18;
      this.box3(c, [q.x - WL / 2, 0.3, -WD / 2], [q.x + WL / 2, 0.3 + WH, WD / 2], hexA(sung ? SOD : STEEL, 0.6 + 0.4 * lit), 1.3, { fill: mixHex('#0A1024', '#2A1A08', 0.5 * lit) });
      const side: Pl = { o: [q.x, 0.3 + WH / 2, WD / 2 + 0.01], r: [1, 0, 0], u: [0, 1, 0] };
      const size = Math.min(0.62, (WL - 0.35) / Math.max(1e-3, this.tw3(q.s, { size: 1, fam: COND }))); // (real width, not a per-letter guess)
      this.text3(c, q.s, side, 0, 0, { size, fam: COND, color: sung ? mixHex(BONE, '#FFFFFF', hotk) : hexA(BONE, 0.25), align: 'center', mid: true, glow: hotk * 14, glowColor: SOD });
      // couplers
      if (i < this.toks.length - 1) this.seg(c, [q.x + WL / 2, 0.55, 0], [q.x + PITCH - WL / 2, 0.55, 0], STEEL, 1.4);
      // wheel dots
      for (const dx of [-0.7, 0.7]) this.dot3(c, [q.x + dx, 0.25, WD / 2 + 0.02], 0.16, '#141A30', { stroke: STEEL, lw: 1 });
    });
    // ------------------------------------------------ the four ideas
    if (t < t17 + 0.6) this.ngram(c, t, t17);
    if (t > t17 - 0.4 && t < t19 + 0.3) this.rnn(c, t, t18, t19);
    if (t > t18 - 0.1 && t < t19 + 0.4) this.fork(c, t, t19);
    if (t > t19 - 0.4) this.lstm(c, t);
    frameMarks(c, U.ash, { tl: 'BASELINE · NIGHT LINE · SEQUENCES', tr: t < t17 ? 'n = 3' : t < t18 ? 'h_t = tanh(W h_t−1 + U x_t)' : t < t19 ? 'BACKPROP THROUGH TIME · T = 64' : 'c_t = f ⊙ c_t−1 + i ⊙ g', bl: '1948 — 1997', br: tc(t), alpha: 0.6 });
    return { bloom: 0.8, bloomThreshold: 0.55, halation: 0.2, ca: 0.3 + 2.0 * hot(t, L[2]!.find((w) => /explode/.test(w.w))!.start, 0.12), grain: 0.05, vignette: 0.34, zoom: 1 + 0.012 * kick };
  }

  private ngram(c: Ctx, t: number, t17: number) {
    // (all of it gone quickly once the RNN line starts: the crane comes in beside the board)
    const a = 1 - clamp((t - (t17 - 0.1)) / 0.25);
    const x = this.winX(t);
    // gantry over three wagons
    const hw = PITCH * 1.5 - 0.1;
    c.save(); c.globalAlpha *= a;
    for (const sx of [-hw, hw]) this.seg(c, [x + sx, 0, 1.3], [x + sx, 3.1, 1.3], GRN, 2.4);
    for (const sx of [-hw, hw]) this.seg(c, [x + sx, 0, -1.3], [x + sx, 3.1, -1.3], hexA(GRN, 0.6), 1.6);
    this.box3(c, [x - hw, 3.1, -1.3], [x + hw, 3.5, 1.3], GRN, 1.6, { fill: '#06200F' });
    const front: Pl = { o: [x, 3.3, 1.31], r: [1, 0, 0], u: [0, 1, 0] };
    this.text3(c, 'N-GRAM · n = 3', front, 0, 0, { size: 0.3, fam: MONOB, color: GRN, align: 'center', mid: true });
    // the trigram under the gantry and its count on this song
    let i = 2;
    for (let k = 2; k < this.toks.length; k++) if (this.toks[k]!.w.start <= t + 0.02) i = k;
    const tri = [this.toks[i - 2]!, this.toks[i - 1]!, this.toks[i]!].map((q) => q.s.toLowerCase());
    const sign: Pl = { o: [x, 4.4, 0], r: [1, 0, 0], u: [0, 1, 0] };
    this.rect3(c, sign, -hw, -0.5, 2 * hw, 1.2, { fill: '#06200F', stroke: hexA(GRN, 0.7), lw: 1.2 });
    this.text3(c, `count(${tri.join(' ')}) = 1`, sign, 0, 0.1, { size: 0.36, fam: MONOB, color: BONE, align: 'center', mid: true });
    c.restore();
    // N-GRAM, the hero, standing above the line; COUNTING WORDS / A WINDOW THREE TOKENS WIDE are the wagons themselves
    // (high enough that the second line clears the count board, and gone as the RNN crane comes in beside it)
    const SK: Pl = { o: [0, 6.5, -0.8], r: [1, 0, 0], u: [0, 1, 0] };
    c.save(); c.globalAlpha *= 1 - clamp((t - (t17 - 0.12)) / 0.2);
    this.chunk3(c, this.L[0]!, t, SK, 0, 0, { size: 1.5, maxW: 13, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 1, 3, 5], anchor: (w) => [this.tokAt(w).x + 1.2, 0] });
    c.restore();
    // the board: what an n-gram counted on this song
    const B: Pl = { o: [this.tokAt(this.L[0]![3]!).x + 2.5, 6.2, -3.2], r: [1, 0, 0], u: [0, 1, 0] };
    const ba = 0 * clamp((t - this.L[0]![1]!.start) / 0.4) * a;
    if (ba > 0) {
      this.rect3(c, B, -0.4, -4.4, 9.6, 5.2, { fill: hexA('#06200F', 0.92 * ba), stroke: hexA(GRN, 0.8 * ba), lw: 1.3 });
      this.text3(c, 'COUNTED ON THIS SONG', B, 0, 0.25, { size: 0.36, fam: MONOB, color: hexA(GRN, ba) });
      this.top.slice(0, 5).forEach((r, j) => {
        this.text3(c, r.g.join(' '), B, 0, -0.55 - j * 0.7, { size: 0.34, fam: MONO, color: hexA(BONE, ba) });
        this.text3(c, `× ${r.c}`, B, 8.8, -0.55 - j * 0.7, { size: 0.34, fam: MONOB, color: hexA(SOD, ba), align: 'right' });
      });
      const h = this.head[0];
      if (h) this.text3(c, h.text, B, 0, -4.0, { size: 0.4, fam: MONOB, color: hexA(GRN, ba) });
    }
  }

  private rnn(c: Ctx, t: number, t18: number, t19: number) {
    const ws = this.L[1]!;
    const a = clamp((t - (ws[0]!.start - 0.06)) / 0.25) * (1 - clamp((t - t18 + 0.1) / 0.25));
    const x = this.craneX(Math.min(t, t18));
    if (a <= 0) return;
    // overhead rail
    this.seg(c, [this.tokAt(ws[0]!).x - 6, CRANE_Y + 0.9, 0], [this.tokAt(ws[ws.length - 1]!).x + 6, CRANE_Y + 0.9, 0], hexA(STEEL, a), 2);
    c.save(); c.globalAlpha *= a;
    // the crane body
    this.box3(c, [x - 1.5, CRANE_Y - 0.6, -0.9], [x + 1.5, CRANE_Y + 0.8, 0.9], CYAN, 1.6, { fill: '#0A1A30' });
    const face: Pl = { o: [x, CRANE_Y, 0.91], r: [1, 0, 0], u: [0, 1, 0] };
    this.text3(c, 'RNN', face, -1.3, 0.25, { size: 0.55, fam: WIDE, color: BONE, mid: true });
    // h_t: 8 LEDs, the real state after the token it is over
    let ti = 0;
    ws.forEach((w, i) => { if (t >= w.start - 0.05) ti = i; });
    const h = this.h17[Math.min(this.h17.length - 1, Math.round((ti / Math.max(1, ws.length - 1)) * (this.h17.length - 1)))] ?? new Array(8).fill(0);
    for (let j = 0; j < 8; j++) {
      const v = h[j] ?? 0;
      this.rect3(c, face, 0.05 + j * 0.17, -0.45, 0.13, 0.5, { fill: '#04101E' });
      this.rect3(c, face, 0.05 + j * 0.17, -0.2, 0.13, 0.25 * v, { fill: v > 0 ? CYAN : SOD });
    }
    this.text3(c, 'h_t', face, 0.65, 0.35, { size: 0.24, fam: MONOB, color: hexA(CYAN, 0.9) });
    // the read beam into the wagon below
    const rd = hot(t, ws[ti]!.start, 0.2);
    this.fill3(c, [[x - 0.3, CRANE_Y - 0.6, 0], [x + 0.3, CRANE_Y - 0.6, 0], [x + 1.0, 1.6, 0], [x - 1.0, 1.6, 0]], hexA(CYAN, 0.08 + 0.25 * rd));
    c.restore();
    // RNN · KEPT A HIDDEN STATE · AND CARRIED IT INSIDE on a long sign over the rail
    const sp: Pl = { o: [x, CRANE_Y + 2.0, 0], r: [1, 0, 0], u: [0, 1, 0] };
    const i1 = ws.findIndex((w) => /^and$/.test(w.w));
    void sp; void i1;
    const SKr: Pl = { o: [0, CRANE_Y + 1.9, 0], r: [1, 0, 0], u: [0, 1, 0] };
    c.save(); c.globalAlpha *= a;
    this.chunk3(c, ws, t, SKr, 0, 0, { size: 1.5, maxW: 12, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 3, 5, 7], anchor: (w) => [this.tokAt(w).x + 0.8, 0] });
    c.restore();
  }

  private fork(c: Ctx, t: number, t19: number) {
    const ws = this.L[2]!;
    const t18 = ws[0]!.start, tVan = ws.find((w) => /vanish/.test(w.w))!, tOr = ws.find((w) => /^or$/.test(w.w))!, tExp = ws.find((w) => /explode/.test(w.w))!;
    const a = clamp((t - (t18 - 0.1)) / 0.3) * (1 - clamp((t - t19) / 0.4));
    if (a <= 0) return;
    const xj = this.craneX(t18); // the junction: where the crane stopped (t = 64, next to the loss)
    const back = 30, zb = 5.5;
    const at3 = (sgn: number, u: number): V3 => [xj - back * u, 0.06, sgn * zb * Math.min(1, u * 5)];
    c.save(); c.globalAlpha *= a;
    // the two branch tracks, running back in time alongside the train; time posts every 8 steps
    for (const sgn of [-1, 1]) {
      const pts: V3[] = []; for (let i = 0; i <= 40; i++) pts.push(at3(sgn, i / 40));
      for (const dz of [-0.6, 0.6]) this.pl3(c, pts.map((p) => [p[0], p[1], p[2] + dz] as V3), '#8A97B8', 1.8);
      for (let k = 0; k <= 8; k++) {
        const p = at3(sgn, k / 8);
        this.seg(c, [p[0], 0, p[2] + sgn * 1.1], [p[0], 1.2, p[2] + sgn * 1.1], STEEL, 1.4);
        const P = this.readable({ o: [p[0], 1.45, p[2] + sgn * 1.1], r: [0, 0, -1], u: [0, 1, 0] });
        // (the t=64 posts stand at the junction, beside the last wagon: their tags come once the camera has turned to
        // look down the branches — from the first angle they printed over INSIDE)
        const la = k === 0 ? clamp((t - (t18 + 1.6)) / 0.3) : 1;
        if (la > 0) this.text3(c, `t=${64 - k * 8}`, P, 0, 0, { size: 0.32, fam: MONO, color: hexA(BONE, 0.7 * la), align: 'center' });
      }
    }
    // the pulses: born at the junction, run back to t = 1, sized and lit by the real norm at each step
    const k = lerp(0.1, 1, ease.inOutQuad(clamp((t - (tVan.start - 0.05)) / (tExp.end - tVan.start + 0.5))));
    const pulse = (sgn: number, norms: number[], col: string, explode: boolean) => {
      const n = norms.length;
      const idx = Math.min(n - 1, Math.floor(k * (n - 1)));
      const g = norms[n - 1 - idx] ?? 1;
      const lg = Math.log10(Math.max(1e-30, g));
      const r = explode ? clamp(0.5 + 0.28 * lg, 0.5, 2.6) : clamp(0.5 + 0.025 * lg, 0.0, 0.5) * clamp(1 + lg / 22);
      const p: V3 = [...at3(sgn, k)] as V3; p[1] = 1.0;
      const q = this.pr(p);
      if (q.z > this.near && r > 0.01) {
        c.save(); c.globalCompositeOperation = 'lighter';
        const R = r * q.k * 2.6;
        const gr = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, Math.max(1, R));
        gr.addColorStop(0, hexA('#FFFFFF', 0.95)); gr.addColorStop(0.3, hexA(col, 0.8)); gr.addColorStop(1, hexA(col, 0));
        c.fillStyle = gr; c.fillRect(q.x - R, q.y - R, 2 * R, 2 * R); c.restore();
      }
      const P = this.readable({ o: [p[0], 1.0 + Math.max(0.6, r) + 0.6, p[2] + sgn * 1.5], r: [0, 0, -1], u: [0, 1, 0] });
      // (it dips out while it runs past the branch's sign, which stands over the track at xj − 9)
      const ra = clamp((Math.abs(p[0] - (xj - 9)) - 3) / 3);
      if (ra > 0) this.text3(c, `‖∂L/∂h‖ = ${g.toExponential(1)}`, P, 0, 0, { size: 0.55, fam: MONOB, color: col, align: 'center', glow: 8, glowColor: '#000', alpha: ra });
      if (explode && k > 0.97) this.text3(c, 'NaN', P, 0, 0.8, { size: 0.9, fam: WIDE, color: RED, align: 'center' });
    };
    if (t > tVan.start - 0.05) { pulse(-1, this.van, CYAN, false); pulse(1, this.exp, RED, true); }
    // the signs, standing at the mouth of each branch, facing the camera
    const sign = (sgn: number, s: string, w: Word, col: string, shake: boolean) => {
      if (t < w.start - 0.02) return;
      const kk = ease.outBack(clamp((t - w.start) / 0.22), 2.2);
      const P = this.readable({ o: [xj - 9, 2.2, sgn * (zb + 3.4)], r: [0, 0, -1], u: [0, 1, 0] });
      this.text3(c, s, P, 0, 0, { size: 2.3 * kk, fam: WIDE, color: col, align: 'center', glow: 16, glowColor: U.ink, each: shake ? (i) => ({ dx: 0.05 * Math.sin(t * 60 + i), dy: 0.05 * Math.cos(t * 53 + i * 2) }) : (i) => ({ a: 1 - 0.1 * i * clamp((t - w.start) / 0.6) }) });
    };
    sign(-1, 'VANISH', tVan, CYAN, false);
    sign(1, 'EXPLODE', tExp, RED, true);
    // (OR stands over the track, in front of the receding wagons: on the signs' line, with dark around it)
    if (t > tOr.start - 0.02) { const P = this.readable({ o: [xj - 7, 2.2, 0], r: [0, 0, -1], u: [0, 1, 0] }); this.text3(c, 'OR', P, 0, 0, { size: 1.3, fam: HEAVY, color: t < tOr.end ? U.mag : BONE, align: 'center', glow: 14, glowColor: U.ink }); }
    c.restore();
    // BACKPROP THROUGH TIME, THE GRADIENTS — a gantry over the junction
    const hp = this.readable({ o: [xj - 5, 4.8, 0], r: [0, 0, -1], u: [0, 1, 0] });
    const i1 = ws.findIndex((w) => /vanish/.test(w.w));
    c.save(); c.globalAlpha *= a * (1 - clamp((t - tVan.start + 0.05) / 0.2));
    this.chunk3(c, ws.slice(0, i1), t, hp, 0, 0, { size: 1.5, maxW: 10, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 1, 3], anchor: undefined });
    c.restore();
  }

  private lstm(c: Ctx, t: number) {
    const ws = this.L[3]!;
    const t19 = ws[0]!.start;
    const a = clamp((t - (t19 - 0.4)) / 0.4);
    const xa = this.tokAt(ws[0]!).x - PITCH * 3, xb = this.toks[this.toks.length - 1]!.x + PITCH * 3;
    // the cell state: a straight wire over the road, a smooth pulse running along it
    this.glowSeg(c, [xa, 3.4, 0], [xb, 3.4, 0], GRN, 2, 9, a);
    const px = lerp(xa, xb, clamp((t - t19) / 3.0));
    this.dot3(c, [px, 3.4, 0], 0.16, '#FFFFFF', { alpha: a });
    this.text3(c, 'c_t  CELL STATE', { o: [xa + 1, 3.65, 0], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.3, fam: MONOB, color: hexA(GRN, a) });
    // gates at every wagon of the road: F, I, O barrier arms opened by the real gate values
    const G = this.gates;
    const road = this.toks.filter((q) => q.line >= 2);
    road.forEach((q, j) => {
      const show = clamp((t - (t19 - 0.3 + j * 0.03)) / 0.3) * a;
      if (show <= 0) return;
      const vals = G ? [G.f[j % G.f.length]!, G.i[j % G.i.length]!, G.o[j % G.o.length]!] : [0.5, 0.5, 0.5];
      ['F', 'I', 'O'].forEach((nm, g) => {
        const bx = q.x - 0.9 + g * 0.9, bz = 1.25;
        const ang = lerp(0, Math.PI / 2 * 0.95, vals[g]!) * show; // 0 = closed (arm across), 1 = up
        this.seg(c, [bx, 0, bz], [bx, 1.5, bz], STEEL, 2, { alpha: show });
        const L0 = 1.2;
        const tip: V3 = [bx, 1.5 + Math.sin(ang) * L0, bz + Math.cos(ang) * L0];
        this.seg(c, [bx, 1.5, bz], tip, vals[g]! > 0.5 ? GRN : RED, 3.4, { alpha: show });
        this.dot3(c, tip, 0.06, vals[g]! > 0.5 ? GRN : RED, { alpha: show });
        if (j < 3) this.text3(c, nm, { o: [bx, 0.15, bz + 0.05], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.28, fam: MONOB, color: hexA(BONE, 0.8 * show), align: 'center' });
      });
    });
    // LSTM on a gantry sign; PUT GATES ALONG THE ROAD on its board
    const gx = this.tokAt(ws[0]!).x;
    const P: Pl = { o: [gx, 5.6, -0.4], r: [1, 0, 0], u: [0, 1, 0] };
    for (const sx of [-3.4, 3.4]) this.seg(c, [gx + sx, 0, -0.4], [gx + sx, 5.0, -0.4], hexA(STEEL, a), 2);
    this.rect3(c, P, -3.6, -0.6, 7.2, 2.0, { fill: hexA('#081A10', 0.95 * a), stroke: hexA(GRN, 0.8 * a), lw: 1.4 });
    // the cell-state update on a plate hung under the sign (Hochreiter & Schmidhuber's c_t, with the forget gate)
    this.rect3(c, P, -3.6, -1.95, 7.2, 1.15, { fill: hexA('#081A10', 0.95 * a), stroke: hexA(GRN, 0.5 * a), lw: 1.1 });
    this.eqFit(c, 'lstm_c', P, 0, -1.375, 6.4, 0.7, { color: BONE, alpha: 0.95 * a });
    const k = ease.outBack(clamp((t - t19) / 0.25), 1.6);
    this.text3(c, 'LSTM', P, 0, 0.4, { size: 1.6 * k, fam: WIDE, color: t < ws[0]!.end ? U.mag : BONE, align: 'center', mid: true, glow: 12, glowColor: U.ink, alpha: a });
    // (the line rides above the gantry sign, clear of LSTM)
    const SKl: Pl = { o: [0, 7.7, -0.4], r: [1, 0, 0], u: [0, 1, 0] };
    c.save(); c.globalAlpha *= a;
    this.chunk3(c, ws.slice(1), t, SKl, 0, 0, { size: 1.5, maxW: 12, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 2], anchor: (w) => [this.tokAt(w).x + 1.5, 0] });
    c.restore();
  }
}
