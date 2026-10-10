// v3 bridge b, L52–L55 ("Context window: 2K, then a million tokens long, / needle in a haystack, it remembers every song /
// Every "all you need" is a paper with a date, / every breakthrough's just a baseline running late"): THE TAPE.
//   context  — this song's own tokens laid as a tape (data/niah.json: the song's BPE stream repeated to 2²⁰ tokens);
//              a window frame over the newest 2,048 doubles nine times to 1,048,576 while the camera climbs to keep it
//              in frame; only the last doubling reaches the start of the tape
//   needle   — at the far end, inside a stack of straw, the needle: token 0, the "P" of PERCEPTRON — the first word
//              this film sang; one beam from now back to it, and the retrieval map all green
//   dates    — the four claims of the pre-choruses on a wall, each stamped with its date: DEPTH 2015-12-10, MEMORY
//              1997-11-15, ATTENTION 2017-06-12, SCALE 2020-01-23
//   late     — the same four as spikes on a time axis; NOW sweeps right and every spike it passes sinks to the
//              baseline; a clock runs ahead of it
// Style: archive tape — warm amber and paper white on teal-black; each claim in its pre-chorus colour.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BG = '#0B0A0D', AMB = '#EDEAF2', PAPER = '#EDEAF2', TEAL = '#2A2731', GRN = '#FF2E7E', RED = '#FF2E7E', MAG = '#FF2E7E';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), COND = F.archivo(75, 900), MONO = F.mono(500), MONOB = F.mono(700);
const UPT = 1 / 256; // world units per token on the tape (2,048 → 8 units; 1,048,576 → 4,096)
const CLAIMS: { s: string; date: string; year: number; col: string }[] = [
  { s: "MEMORY'S ALL YOU NEED", date: '1997-11-15', year: 1997.9, col: '#EDEAF2' },
  { s: 'DEPTH IS ALL YOU NEED', date: '2015-12-10', year: 2015.9, col: '#EDEAF2' },
  { s: "ATTENTION'S ALL YOU NEED", date: '2017-06-12', year: 2017.45, col: '#FF2E7E' },
  { s: 'SCALE IS ALL YOU NEED', date: '2020-01-23', year: 2020.06, col: '#EDEAF2' },
];

export default class Ctx2 extends VScene {
  private L: Word[][] = [];
  private toks: string[] = [];

  override async init() {
    this.bg = BG;
    this.env = { eq: ['ppl', 'rope', 'alibi', 'posinterp', 'attention', 'clm'], seed: 14, keep: (x) => Math.abs(x) > 40, r0: 60, fixedR0: true, floorKeep: 0 }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L = [0, 1, 2, 3].map((k) => ly.lines[i0 + k]!.words);
    try { const rb = await (await fetch('data/rnn_bptt.json')).json(); this.toks = (rb.state.tokens as string[]).map((s) => s.replace(/Ġ/g, ' ').replace(/Ċ/g, '⏎')); } catch { /* */ }
    const s = this.ctx.start, e = this.ctx.end;
    const w = (i: number, re: RegExp) => this.L[i]!.find((x) => re.test(x.w))!;
    const t2k = w(0, /2K/).start, tMil = w(0, /million/).start, t53 = this.L[1]![0]!.start, tRem = w(1, /remembers/).start, t54 = this.L[2]![0]!.start, tDate = w(2, /date/).start, t55 = this.L[3]![0]!.start;
    this.rig = new Rig([
      { t0: s, name: 'tape', key: (t) => { const L = this.winLen(t); const h = 3 + Math.pow(L, 0.62) * 0.9; return K([2.5 + L * 0.04, h, 6 + Math.min(L, 50) * 0.05], [0, 0, -Math.min(L, 4096) * 0.42], 46, 0.0); } },
      { t0: t53 - 0.05, snap: 0.6, name: 'needle', key: (t) => { const k = ease.inOutQuad(clamp((t - t53) / (tRem - t53))); const z = -4096; return K([lerp(9, 6, k), lerp(6.5, 5, k), z + lerp(14, 10, k)], [0, 2.6, z], 46, 0.02); } },
      { t0: tRem - 0.05, snap: 0.35, name: 'map', key: (t) => { const k = ease.outCubic(clamp((t - tRem) / (t54 - tRem))); return K([lerp(-14, -16, k), lerp(5, 6, k), -4096 + lerp(14, 16, k)], [-15, 3.5, -4096 - 2], 46); } },
      { t0: t54 - 0.05, name: 'stones', key: (t) => {
        // close along the row (MEMORY → SCALE) while the line is sung, then back to see all four as their dates are cut
        const Z = 9000;
        const ks: [number, V3, V3, number][] = [
          [t54, [-10.5, 2.0, Z + 4.5], [-8.6, 1.9, Z - 3], 48],
          [tDate - 0.3, [9.5, 2.3, Z + 4.8], [12.0, 2.0, Z - 3], 48],
          [tDate + 0.25, [1.0, 3.6, Z + 17], [0.4, 2.0, Z - 3], 50],
          [t55, [0.6, 3.9, Z + 18.5], [0.4, 2.1, Z - 3], 50],
        ];
        let i = 0;
        while (i + 2 < ks.length && t > ks[i + 1]![0]) i++;
        const [ta, pa, ga, fa] = ks[i]!, [tb, pb, gb, fb] = ks[i + 1]!;
        const u = ease.inOutCubic(clamp((t - ta) / Math.max(1e-3, tb - ta)));
        const L3 = (a: V3, b: V3): V3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
        return K(L3(pa, pb), L3(ga, gb), lerp(fa, fb, u), 0.02 * Math.sin(t));
      } },
      { t0: t55 - 0.05, snap: 0.5, name: 'late', key: (t) => { const x = this.nowX(t); return K([x + 1.5, 5.5, 9100 + 15], [x + 0.5, 4.2, 9100], 46, -0.01); } },
    ], [{ t: t2k, amp: 0.6 }, { t: tMil, amp: 1.2 }, { t: t53, amp: 0.6 }, { t: tDate, amp: 1.4 }, { t: t55, amp: 0.6 }], 0.8, 151);
  }

  private nowYear(t: number) {
    const L55 = this.L[3]!;
    return lerp(1997, 2026, ease.inOutQuad(clamp((t - L55[0]!.start) / (L55[L55.length - 1]!.end - L55[0]!.start + 0.2))));
  }
  private nowX(t: number) { return -6 + (this.nowYear(t) - 1995) * 0.85; }
  /** window length in world units: 2,048 tokens at "2K", doubling up to 1,048,576 by the end of "long" */
  private winLen(t: number) {
    const w = (re: RegExp) => this.L[0]!.find((x) => re.test(x.w))!;
    const t2k = w(/2K/).start, tMil = w(/million/).start, tLong = w(/long/).end;
    if (t < t2k) return 2048 * UPT * clamp((t - this.L[0]![0]!.start) / (t2k - this.L[0]![0]!.start));
    const d = 9 * ease.inOutQuad(clamp((t - (t2k + 0.4)) / (tLong - t2k - 0.5)));
    void tMil;
    return 2048 * UPT * Math.pow(2, d);
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L = this.L;
    const t53 = L[1]![0]!.start, t54 = L[2]![0]!.start, t55 = L[3]![0]!.start;
    const kick = this.beatPulse(t, 0.08);
    pool(c, W * 0.5, H * 0.5, 1000, '#163236', 0.5);
    if (t < t54 + 0.3) this.tape(c, t);
    if (t > t54 - 0.6) this.wallOfDates(c, t);
    frameMarks(c, U.ash, { tl: 'BASELINE · THE TAPE', tr: t < t53 ? 'CONTEXT WINDOW' : t < t54 ? 'NEEDLE: TOKEN 0 · "P"' : 'CLAIMS · DATED', bl: '2020 — 2024', br: tc(t), alpha: 0.6 });
    return { bloom: 0.8, bloomThreshold: 0.55, halation: 0.2, ca: 0.3 + 1.6 * hot(t, L[2]!.find((x) => /date/.test(x.w))!.start, 0.12), grain: 0.05, vignette: 0.32, zoom: 1 + 0.01 * kick };
  }

  private tape(c: Ctx, t: number) {
    const L52 = this.L[0]!, L53 = this.L[1]!;
    const w52 = (re: RegExp) => L52.find((x) => re.test(x.w))!, w53 = (re: RegExp) => L53.find((x) => re.test(x.w))!;
    const tCtx = L52[0]!, t2k = w52(/2K/), tMil = w52(/million/), tNeedle = L53[0]!, tHay = w53(/haystack/), tRem = w53(/remembers/), tSong = w53(/song/);
    const total = 1048576 * UPT; // 4,096 units
    const G = floorPl(0);
    // the tape: a long amber strip from z = 0 (now) back to z = −4096 (token 0)
    this.fill3(c, [[-0.9, 0.01, 0.5], [0.9, 0.01, 0.5], [0.9, 0.01, -total], [-0.9, 0.01, -total]], hexA(AMB, 0.18));
    for (const x of [-0.9, 0.9]) this.seg(c, [x, 0.02, 0.5], [x, 0.02, -total], hexA(AMB, 0.8), 1.4);
    // ticks: every 2^k tokens in view (log-spaced so the near ticks are tokens and the far ticks are powers of two)
    const ticks: [V3, V3][] = [];
    for (let k = 0; k < 21; k++) { const z = -Math.pow(2, k) * UPT; ticks.push([[-1.2, 0.02, z], [1.2, 0.02, z]]); }
    this.segs(c, ticks, hexA(PAPER, 0.5), 1.2);
    // near the camera: the newest tokens as tiles with their text
    for (let i = 0; i < 40; i++) {
      const z = -(i + 0.5) * UPT * 16; // one tile per 16 tokens
      const tok = this.toks.length ? this.toks[(this.toks.length - 1 - i * 16 + this.toks.length * 4) % this.toks.length]! : '·';
      this.rect3(c, G, -0.8, -z - UPT * 7, 1.6, UPT * 14, { fill: hexA('#2A1E0A', 0.9), stroke: hexA(AMB, 0.4), lw: 1 });
      if (i < 24) this.text3(c, tok.trim() || '·', this.readable({ o: [0, 0.03, z], r: [1, 0, 0], u: [0, 0, -1] }), 0, 0, { size: 0.028, fam: MONOB, color: PAPER, align: 'center', mid: true });
    }
    // the window frame over the newest tokens
    const Lw = this.winLen(t);
    if (t > tCtx.start - 0.1) {
      const a = clamp((t - tCtx.start + 0.1) / 0.3);
      const z0 = 0.3, z1 = -Lw;
      const ww = 1.4 + Math.min(40, Lw * 0.012);
      const hh = 0.6 + Math.min(30, Lw * 0.01);
      this.fill3(c, [[-ww, 0.02, z0], [ww, 0.02, z0], [ww, 0.02, z1], [-ww, 0.02, z1]], hexA(GRN, 0.08 * a));
      for (const x of [-ww, ww]) { this.seg(c, [x, 0.02, z0], [x, 0.02, z1], hexA(GRN, a), 2.2); this.seg(c, [x, 0, z1], [x, hh, z1], hexA(GRN, a), 2.2); this.seg(c, [x, 0, z0], [x, hh, z0], hexA(GRN, a), 2.2); }
      this.seg(c, [-ww, hh, z1], [ww, hh, z1], hexA(GRN, a), 2.2);
      const n = Math.round(Lw / UPT);
      const lab = n >= 1048000 ? '1,048,576' : Math.max(0, n).toLocaleString('en-US');
      // the count rides the window's far edge on screen, at a fixed readable size
      const q = this.pr([0, hh, z1]);
      if (q.z > this.near && t < tNeedle.start) {
        // (while the line is still on the tape, the count sits under the window's far edge — over it, it printed on
        // CONTEXT WINDOW: 2K — and it rises to ride the edge as the line goes up to the top of the frame)
        const kz = clamp((Lw - 12) / 30);
        const x = clamp(q.x, 260, W - 260), y = clamp(q.y - 30 + 140 * (1 - kz), 120, H - 160);
        c.save(); c.globalAlpha *= a; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
        c.font = `64px "${MONOB}"`; c.fillStyle = GRN; c.shadowBlur = 16; c.shadowColor = '#000';
        c.fillText(`${lab}`, x, y);
        c.font = `26px "${MONOB}"`; c.fillStyle = PAPER; c.fillText('TOKENS IN CONTEXT', x, y + 38);
        if (n <= 2100) { c.font = `20px "${MONO}"`; c.fillStyle = hexA(PAPER, 0.75); c.fillText('2,048 = THE 175B DECODER\u2019S WINDOW', x, y + 70); }
        c.restore();
      }
    }
    // the needle at the far end, in a stack of straw
    const zN = -total;
    if (t > tNeedle.start - 1.5) {
      const a = clamp((t - (tNeedle.start - 1.5)) / 0.6);
      const ta = a * (1 - clamp((t - (tRem.start - 0.2)) / 0.3)); // its tags go as the map comes (they hung at the frame's edge)
      const straws: [V3, V3][] = [];
      for (let i = 0; i < 260; i++) {
        const r = 6 * Math.sqrt(hash(i, 1)), an = hash(i, 2) * Math.PI * 2;
        const x = Math.cos(an) * r, zz = Math.sin(an) * r, hgt = 4.2 * (1 - (r / 6) ** 2) * hash(i, 3);
        const d = 1.6, a2 = hash(i, 4) * Math.PI * 2;
        straws.push([[x, hgt, zN + zz], [x + Math.cos(a2) * d, hgt + (hash(i, 5) - 0.5) * 1.2, zN + zz + Math.sin(a2) * d]]);
      }
      this.segs(c, straws, hexA('#D9B25A', 0.8 * a), 1.4);
      // the needle: token 0 — "P" — glowing
      const found = clamp((t - tHay.start) / 0.4);
      this.glowSeg(c, [-1.6, 1.4, zN + 0.6], [1.6, 2.0, zN - 0.4], '#FFFFFF', 2.4, 12, a);
      if (ta > 0) this.text3(c, 'TOKEN 0 · "P"', this.readable({ o: [0, 2.65, zN], r: [1, 0, 0], u: [0, 1, 0] }), 0, 0, { size: 0.45, fam: MONOB, color: PAPER, align: 'center', alpha: ta });
      if (found > 0 && ta > 0) {
        this.text3(c, 'PERCEPTRON', this.readable({ o: [0, 4.15, zN], r: [1, 0, 0], u: [0, 1, 0] }), 0, 0, { size: 0.9 * ease.outBack(found, 1.6), fam: WIDE, color: '#FFFFFF', align: 'center', glow: 16, glowColor: AMB, alpha: ta });
        this.text3(c, '(THE FIRST WORD OF THIS SONG)', this.readable({ o: [0, 3.42, zN], r: [1, 0, 0], u: [0, 1, 0] }), 0, 0, { size: 0.3, fam: MONO, color: hexA(PAPER, 0.8 * found * ta), align: 'center' });
        // the retrieval beam from now back to the needle
        this.seg(c, [0, 1.8, 0], [0, 1.8, zN], hexA(GRN, 0.6 * found), 2);
      }
    }
    // the retrieval map (context length × needle depth), all green
    if (t > tRem.start - 0.1) {
      const a = clamp((t - tRem.start + 0.1) / 0.4);
      const MP: Pl = { o: [-21, 0.5, -4096 - 2], r: [1, 0, 0], u: [0, 1, 0] };
      for (let r = 0; r < 10; r++) for (let q = 0; q < 10; q++) {
        const show = clamp(a * 3 - (r + q) / 10);
        this.rect3(c, MP, q * 1.1, r * 0.62, 1.0, 0.54, { fill: hexA(GRN, 0.25 + 0.6 * show) });
      }
      this.text3(c, 'CONTEXT LENGTH 2K → 1M  ·  NEEDLE DEPTH 0 → 100 %', MP, 0, -0.55, { size: 0.32, fam: MONOB, color: hexA(PAPER, a) });
    }
    // lyric type
    if (t < tNeedle.start - 0.05) {
      // the line sits on the tape near "now" while the window is small, then stays pinned high in frame
      const P = this.readable({ o: [0, 2.9, -1.5], r: [1, 0, 0], u: [0, 0.6, -0.8] });
      const kz = clamp((Lw - 12) / 30);
      // (handed over, not cross-faded: both copies of the line on screen at once read as a double)
      c.save(); c.globalAlpha *= 1 - clamp(kz / 0.4);
      this.say3(c, L52.slice(0, 3), t, P, 0, 0.9, { size: 0.62, fam: WIDE, up: '', cur: U.mag, done: PAPER, align: 'center', upper: true, text: (x) => x.w.replace(',', '') });
      c.restore();
      if (kz > 0.3) {
        c.save(); c.globalAlpha *= clamp((kz - 0.3) / 0.5); c.textAlign = 'center'; c.font = `54px "${WIDE}"`; c.fillStyle = PAPER; c.shadowBlur = 14; c.shadowColor = '#000';
        c.fillText('CONTEXT WINDOW: 2K', W / 2, 150);
        c.restore();
      }
      if (t > tMil.start - 0.4) {
        const sung = L52.slice(3).filter((x) => t >= x.start).map((x) => x.w.replace(',', '').toUpperCase()).join(' ');
        c.save(); c.textAlign = 'center'; c.font = `70px "${WIDE}"`; c.fillStyle = GRN; c.shadowBlur = 16; c.shadowColor = '#000';
        c.fillText(sung, W / 2, H - 120);
        c.restore();
      }
    } else {
      // (lower and smaller: as the camera closes in on the needle, at 7.0 the line rose out of the top of the frame)
      const P = this.readable({ o: [-1.5, 5.5, -4096 + 0.5], r: [1, 0, 0], u: [0, 1, 0] });
      c.save(); c.globalAlpha *= 1 - clamp((t - tRem.start + 0.3) / 0.3);
      this.say3(c, L53.slice(0, L53.indexOf(tHay) + 1), t, P, 0, 0, { size: 0.85, slam: 0.35, fam: WIDE, up: '', cur: U.mag, done: PAPER, align: 'center', upper: true, text: (x) => x.w.replace(',', '') });
      c.restore();
      if (t > tRem.start - 0.25) this.say3(c, L53.slice(L53.indexOf(tRem) - 1), t, { o: [-15, 7.6, -4096 - 2], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 1.15, slam: 0.35, fam: WIDE, up: '', cur: U.mag, done: PAPER, align: 'center', upper: true });
    }
    void t2k; void tSong;
  }

  private wallOfDates(c: Ctx, t: number) {
    const L54 = this.L[2]!, L55 = this.L[3]!;
    const w54 = (re: RegExp) => L54.find((x) => re.test(x.w))!;
    const tEvery = L54[0]!, tPaper = w54(/paper/), tDate = w54(/date/), t55 = L55[0]!;
    // the four guarantees of the pre-choruses, standing in a row like headstones: black glass, the claim cut into
    // each, GUARANTEED ∎ at its foot; on "date" each gets its date cut, hot, then cooling
    const Z = 9000 - 3;
    const fade = 1 - clamp((t - t55.start - 0.2) / 0.4);
    CLAIMS.forEach((cl, i) => {
      const cx = -12 + i * 8, hw = 3.4, h = 4.4, d = 0.6;
      const ti = tEvery.start - 0.3 + i * 0.18;
      if (t < ti) return;
      const rise = ease.outCubic(clamp((t - ti) / 0.4));
      const top = h * rise;
      this.box3(c, [cx - hw, 0, Z - d / 2], [cx + hw, top, Z + d / 2], hexA(U.graphite, fade), 1.2, { fill: '#0C0B10', alpha: fade });
      this.glowSeg(c, [cx - hw, top, Z + d / 2], [cx + hw, top, Z + d / 2], cl.col === MAG ? MAG : PAPER, 1.6, 8, 0.7 * fade);
      if (rise < 0.95) return;
      const F: Pl = wallPl(Z + d / 2 + 0.01, [cx, 0, Z + d / 2 + 0.01]);
      const words = cl.s.split(' ');
      const l1 = words[0]!, l2 = words.slice(1).join(' ');
      const s1 = Math.min(1.25, (2 * hw - 0.8) / this.tw3(l1, { size: 1, fam: WIDE })), s2 = Math.min(0.8, (2 * hw - 0.8) / this.tw3(l2, { size: 1, fam: WIDE }));
      this.text3(c, l1, F, 0, h - 0.6 - s1 * 0.72, { size: s1, fam: WIDE, color: hexA(cl.col, fade), align: 'center' });
      this.text3(c, l2, F, 0, h - 0.9 - s1 * 0.72 - s2 * 0.95, { size: s2, fam: WIDE, color: hexA(PAPER, 0.85 * fade), align: 'center' });
      this.text3(c, 'GUARANTEED  ∎', F, 0, 0.45, { size: 0.32, fam: MONOB, color: hexA(U.ash, 0.8 * fade), align: 'center', track: 0.2 });
      // the date, cut on "date"
      const ts = tDate.start - 0.12 + i * 0.09;
      if (t > ts) {
        const k = clamp((t - ts) / 0.1), hotK = Math.exp(-(t - ts) / 0.3);
        const dd = cl.date.split('');
        this.text3(c, cl.date, F, 0, 1.25, { size: 0.62, fam: MONOB, color: hexA(mixHex(PAPER, '#FF9CC4', hotK), fade), align: 'center', glow: 14 * hotK, glowColor: MAG, each: (j) => ((j + 0.5) / dd.length <= k ? {} : null) });
        if (hotK > 0.2) this.dot3(c, at(F, -1.9 + 3.8 * k, 1.45, 0.02), 0.08, '#FFFFFF');
      }
    });
    if (t < t55.start + 0.4) {
      const P: Pl = { o: [0, 7.4, 9000 - 6], r: [1, 0, 0], u: [0, 1, 0] };
      c.save(); c.globalAlpha *= 1 - clamp((t - t55.start) / 0.4); this.chunk3(c, L54, t, P, 0, 0, { size: 1.5, maxW: 22, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 4, 7], text: (x) => x.w.replace(/[“”]/g, '"').replace(',', '') }); c.restore();
    }
    // late: spikes on a time axis, NOW sweeping, each passed spike sinking to the baseline; a clock running ahead
    if (t > t55.start - 0.3) {
      const a = clamp((t - t55.start + 0.3) / 0.4);
      const ax: Pl = wallPl(9100 - 2, [0, 0, 9100 - 2]);
      const X = (yr: number) => -6 + (yr - 1995) * 0.85;
      void X;
      this.seg(c, at(ax, X(1995), 1.0), at(ax, X(2026), 1.0), hexA(PAPER, a), 2);
      for (let yr = 1995; yr <= 2025; yr += 5) { this.seg(c, at(ax, X(yr), 0.8), at(ax, X(yr), 1.2), hexA(PAPER, a), 1.4); this.text3(c, String(yr), ax, X(yr), 0.2, { size: 0.36, fam: MONO, color: hexA(PAPER, 0.8 * a), align: 'center' }); }
      // (at the axis' left end: over it, the claims sinking to the baseline printed on it)
      this.text3(c, 'BASELINE', ax, X(1995) - 0.35, 1.0, { size: 0.36, fam: MONOB, color: hexA(PAPER, 0.7 * a), align: 'right', mid: true });
      const now = this.nowYear(t);
      this.seg(c, at(ax, X(now), 0.4), at(ax, X(now), 9.5), hexA(GRN, a), 2.4);
      // (under the axis: up the line, the falling claims' names crossed it)
      this.text3(c, `NOW ${Math.floor(now)}`, ax, X(now) + 0.2, -0.65, { size: 0.6, fam: MONOB, color: GRN });
      CLAIMS.forEach((cl, ci) => {
        const passed = now - cl.year;
        const hgt = passed < 0 ? 0 : passed < 0.3 ? 7 * (passed / 0.3) : 7 * Math.exp(-(passed - 0.3) * 0.9);
        const x = X(cl.year);
        if (passed > 0) {
          this.pl3(c, [at(ax, x - 0.5, 1.0), at(ax, x, 1.0 + hgt), at(ax, x + 0.5, 1.0)], cl.col, 2.6, { alpha: a });
          this.text3(c, cl.s.split(' ')[0]!.replace("'S", ''), ax, x, 1.4 + hgt + ci * 0.75 * clamp(1 - hgt / 3), { size: 0.6, fam: MONOB, color: hexA(cl.col, a), align: 'center' });
        }
      });
      // the clock running ahead of NOW
      const CP: Pl = { o: at(ax, X(now) + 3.0, 7.0, 0.1), r: ax.r, u: ax.u };
      this.ring3(c, CP, 0, 0, 1.0, hexA(PAPER, a), 2, { fill: hexA('#0A1A1C', a) });
      const ang = -t * 9;
      this.seg(c, at(CP, 0, 0), at(CP, Math.cos(ang) * 0.85, Math.sin(ang) * 0.85), RED, 2.4);
      this.seg(c, at(CP, 0, 0), at(CP, Math.cos(ang / 12) * 0.55, Math.sin(ang / 12) * 0.55), PAPER, 2.4);
      // the line itself
      const P: Pl = { o: [this.nowX(t) + 0.5, 9.0, 9100 - 1.9], r: [1, 0, 0], u: [0, 1, 0] };
      this.chunk3(c, L55, t, P, 0, 0, { size: 1.3, maxW: 16, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 2, 5], text: (x) => x.w.replace('’', "'") });
      void MAG;
    }
    void tPaper;
  }
}
