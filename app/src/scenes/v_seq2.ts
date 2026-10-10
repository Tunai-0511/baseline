// v3 verse2 b, L20–L23 ("Seq2seq would squeeze a sentence through a bottleneck, / attention let the decoder look back
// and double-check / Recurrence marched in order, one step at a time, / transformers ran in parallel and left it all
// behind"): NIGHT LINE, last stop. The input of a real encoder–decoder (data/seq2seq_attn.json, trained to reverse 12
// words) is this very lyric: its 12 wagons run into a funnel and come out of the neck as one glowing vector; the decoder
// unloads them reversed on the far side. Then attention: from every decoded wagon, beams back to the encoder wagons,
// weighted by the trained α — the anti-diagonal shows on the ground. Recurrence: one wagon at a time through a turnstile,
// t = 1, 2, 3 … on the beat. Transformers: every wagon at once, every pair joined by an arc; the camera lifts off and
// the night line is left below.
// Style: night rail turning into a lit grid — navy, sodium, cyan for attention, magenta for the transformer.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, vlerp, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BG = '#0B0A0D', SOD = '#EDEAF2', CYAN = '#FF2E7E', MAG = '#FF2E7E', BONE = '#EDEAF2', STEEL = '#5C5966', GRN = '#C9C5D1';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), COND = F.archivo(75, 900), MONO = F.mono(500), MONOB = F.mono(700);
const P2 = 2.5, WL = 2.15, WH = 1.2, WD = 1.2;
const ENC0 = -30, FUN0 = 1.0, FUN1 = 9.0, CAP = 10.6, DEC0 = 13.5; // encoder start, funnel, capsule, decoder start
const GATE = 74, MARCH0 = 52; // recurrence turnstile and queue start
const HM = { x: -2, z: 9, s: 0.9 }; // alignment heatmap on the ground

export default class Seq2 extends VScene {
  private L: Word[][] = [];
  private input: string[] = []; private output: string[] = []; private alpha: number[][] = [];

  override async init() {
    this.bg = BG;
    this.env = { eq: ['seq2seq', 'bahdanau_e', 'bahdanau_a', 'attention', 'multihead', 'lstm_c'], seed: 8, arcs: 10, keep: (_x, z) => Math.abs(z) > 34 }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L = [0, 1, 2, 3].map((k) => ly.lines[i0 + k]!.words);
    try { const d = await (await fetch('data/seq2seq_attn.json')).json(); this.input = d.example.input; this.output = d.example.output; this.alpha = d.alpha; } catch { /* */ }
    if (!this.input.length) { this.input = 'seq2seq would squeeze a sentence through a bottleneck attention let the decoder'.split(' '); this.output = [...this.input].reverse(); }
    const s = this.ctx.start, e = this.ctx.end;
    const w = (i: number, re: RegExp) => this.L[i]!.find((x) => re.test(x.w))!;
    const tNeck = w(0, /bottleneck/).start, tAtt = this.L[1]![0]!.start, tLook = w(1, /look/).start, tDbl = w(1, /double/).start;
    const tRec = this.L[2]![0]!.start, tTr = this.L[3]![0]!.start, tLeft = w(3, /left/).start;
    this.rig = new Rig([
      { t0: s, name: 'enc', key: (t) => { const x = this.encX(t); return K([x + 3.6, 4.4, 11.5], [x + 0.6, 1.8, 0], 44, -0.02); } },
      { t0: tNeck - 0.1, snap: 0.45, name: 'neck', key: (t) => { const k = ease.inOutQuad(clamp((t - tNeck) / (tAtt - tNeck))); return K([lerp(6, 12, k), lerp(4.5, 3.8, k), lerp(10, 9, k)], [lerp(6.5, 11.5, k), 1.2, 0], 46, 0.02); } },
      { t0: tAtt - 0.05, snap: 0.55, name: 'beams', key: (t) => { const k = ease.inOutQuad(clamp((t - tAtt) / (tLook - tAtt))); return K([lerp(24, 20, k), lerp(9, 10, k), lerp(19, 21, k)], [lerp(14, 10, k), lerp(4.2, 4.0, k), 0], 50); } },
      { t0: tLook - 0.05, snap: 0.3, name: 'look', key: (t) => { const k = ease.outCubic(clamp((t - tLook) / (tDbl - tLook))); return K([lerp(34, 30, k), lerp(5.5, 7.0, k), lerp(9, 11, k)], [lerp(6, 0, k), 3.6, 0], 48, 0.03); } },
      { t0: tDbl - 0.05, snap: 0.4, name: 'map', key: (t) => { const k = ease.inOutQuad(clamp((t - tDbl) / (tRec - tDbl))); return K([HM.x + 5.4, lerp(15, 13, k), HM.z + lerp(13, 11.5, k)], [HM.x + 5.4, 0, HM.z + 6.2], 46); } },
      { t0: tRec - 0.05, snap: 0.5, name: 'march', key: (t) => { const k = ease.inOutQuad(clamp((t - tRec) / (tTr - tRec))); return K([GATE + lerp(7, 5, k), lerp(5.6, 5.2, k), lerp(13, 11.5, k)], [GATE + lerp(2.5, 1.5, k), 3.0, 0], 46, -0.02); } },
      { t0: tTr - 0.05, snap: 0.35, name: 'parallel', key: (t) => {
        const k = ease.inOutCubic(clamp((t - tTr) / (tLeft - tTr)));
        const k2 = ease.inCubic(clamp((t - tLeft) / (e - tLeft)));
        return K([GATE - 6 + 30 * k2, lerp(6, 13, k) + 10 * k2, lerp(16, 22, k) - 6 * k2], [GATE - 6 + 40 * k2, lerp(3, 4.5, k) + 4 * k2, 0], lerp(48, 56, k) + 10 * k2, 0.05 * k2);
      } },
    ], [{ t: tNeck, amp: 0.9 }, { t: tAtt, amp: 0.6 }, { t: tLook, amp: 1.0, dir: 'h' }, { t: tRec, amp: 0.5 }, { t: tTr, amp: 1.4 }, { t: tLeft, amp: 0.8 }], 0.8, 91);
  }

  /** encoder wagon i position (wagons run into the funnel as they are sung) */
  private encPos(i: number, t: number): V3 {
    const ws = [...this.L[0]!, ...this.L[1]!.slice(0, 4)];
    const tNeck = this.L[0]!.find((x) => /bottleneck/.test(x.w))!.start;
    const base = ENC0 + i * P2 + (12 - this.input.length) * P2;
    // all wagons slide forward together after "bottleneck": into the funnel and gone
    const push = ease.inQuad(clamp((t - tNeck) / 1.4)) * 34;
    void ws;
    return [base + push, 0.3, 0];
  }
  private encX(t: number) {
    const ws = this.L[0]!;
    let x = ENC0;
    ws.forEach((w, i) => { const k = ease.inOutCubic(clamp((t - (w.start - 0.1)) / 0.25)); x = lerp(x, ENC0 + (i + (12 - this.input.length)) * P2, k); });
    return x;
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L = this.L;
    const w = (i: number, re: RegExp) => L[i]!.find((x) => re.test(x.w))!;
    const tSeq = L[0]![0]!, tNeck = w(0, /bottleneck/), tAtt = L[1]![0]!, tDec = w(1, /decoder/), tLook = w(1, /look/), tDbl = w(1, /double/);
    const tRec = L[2]![0]!, tStep = w(2, /step/), tTr = L[3]![0]!, tPar = w(3, /parallel/), tLeft = w(3, /left/), tBeh = w(3, /behind/);
    const kick = this.beatPulse(t, 0.08);
    const lift = clamp((t - tTr.start) / 2.5); // the night lights up into a grid
    // ------------------------------------------------ ground, city, track
    pool(c, W * 0.5, H * 0.6, 1000, mixHex('#16224A', '#3A0E2A', lift), 0.5);
    this.grid3(c, floorPl(-0.02), -40, 130, -30, 30, 2, mixHex('#101A3A', '#3A1030', lift), 1, { alpha: 0.8, fog: [10, 60] });
    for (let i = 0; i < 40; i++) {
      const x = -40 + i * 4.3, h = 3 + 8 * hash(i, 7);
      this.rect3(c, wallPl(-18), x, 0, 3.2, h, { fill: '#08102A', stroke: hexA(mixHex('#1E2C5A', MAG, lift), 0.8), lw: 1 });
    }
    const sl: [V3, V3][] = [];
    for (let x = -40; x < 120; x += 0.8) sl.push([[x, 0.02, -0.9], [x, 0.02, 0.9]]);
    this.segs(c, sl, '#2A3458', 3);
    for (const z of [-0.6, 0.6]) this.seg(c, [-40, 0.08, z], [120, 0.08, z], '#8A97B8', 1.6);

    // ------------------------------------------------ seq2seq: encoder wagons, funnel, capsule, decoder
    if (t < tRec.start + 0.5) this.seq2seq(c, t);
    // ------------------------------------------------ recurrence and the transformer
    if (t > tRec.start - 0.8) this.march(c, t);
    // ------------------------------------------------ lyric type
    // SEQ2SEQ on the funnel mouth; BOTTLENECK on the neck
    if (t > tSeq.start - 0.02 && t < tAtt.start) {
      const k = ease.outBack(clamp((t - tSeq.start) / 0.25), 1.6);
      const x = this.encX(Math.min(t, tNeck.start));
      void k; void x;
      const FM: Pl = { o: [0, 4.4, -0.5], r: [1, 0, 0], u: [0, 1, 0] };
      c.save(); c.globalAlpha *= 1 - clamp((t - tNeck.start) / 0.25);
      this.chunk3(c, L[0]!.slice(0, -1), t, FM, 0, 0, { size: 1.8, maxW: 13, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 1, 3, 5], anchor: (w) => [this.encX(w.start + 0.2) + 1.5, 0] });
      c.restore();
    }
    if (t > tNeck.start - 0.02 && t < tRec.start) {
      const k = ease.outBack(clamp((t - tNeck.start) / 0.22), 2);
      const NP: Pl = { o: [FUN1 + 0.6, 2.6, 0.2], r: [1, 0, 0], u: [0, 1, 0] };
      this.text3(c, 'BOTTLENECK', NP, 0, 0, { size: 1.25 * k, fam: WIDE, color: t < tNeck.end ? U.mag : BONE, align: 'center', glow: 14, glowColor: U.ink, each: (i, _ch, n) => ({ sc: 1 - 0.35 * Math.exp(-Math.pow((i - (n - 1) / 2) / 2.2, 2)) }) });
    }
    // ATTENTION over the decoder; LET THE DECODER; LOOK BACK on the beams; AND DOUBLE-CHECK at the map
    if (t > tAtt.start - 0.02 && t < tRec.start) {
      const AP: Pl = { o: [DEC0 + 2.5, 7.4, 0], r: [1, 0, 0], u: [0, 1, 0] };
      const k = ease.outBack(clamp((t - tAtt.start) / 0.25), 1.6);
      // (ATTENTION / LET THE DECODER clear as LOOK BACK lands: from the look shot they sit right behind it)
      const aa = 1 - clamp((t - (tLook.start - 0.05)) / 0.15);
      if (aa > 0) {
        this.text3(c, 'ATTENTION', this.readable(AP), 0, 0, { size: 1.9 * k, fam: WIDE, color: t < tAtt.end ? U.mag : BONE, align: 'center', glow: 16, glowColor: U.ink, alpha: aa });
        this.say3(c, [w(1, /let/), w(1, /^the$/), tDec], t, this.readable({ ...AP, o: [DEC0 + 2.5, 5.55, 0] }), 0, 0, { size: 1.15, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, alpha: aa });
      }
      if (t > tLook.start - 0.02) {
        const LP = this.readable({ o: [4, 5.4, 1.0], r: [1, 0, 0], u: [0, 1, 0] });
        this.say3(c, [tLook, w(1, /back/)], t, LP, 0, 0, { size: 2.1, fam: WIDE, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, glow: 14, glowColor: U.ink, slam: 0.4 });
      }
      if (t > tDbl.start - 0.25) {
        const MP: Pl = { o: [HM.x + 5.4, 0.05, HM.z + 12 * HM.s + 0.4], r: [1, 0, 0], u: [0, 0, -1] };
        this.say3(c, [w(1, /^and$/), tDbl], t, MP, 0, 0, { size: 1.45, slam: 0.4, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true });
      }
    }
    // the line's own words for recurrence are on the marching wagons; ONE STEP AT A TIME on the turnstile sign
    if (t > tRec.start - 0.05 && t < tTr.start) this.chunk3(c, L[2]!, t, { o: [GATE + 2.6, 5.9, -0.6], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 1.6, maxW: 13, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 1, 4, 6] });
    // TRANSFORMERS / RAN IN PARALLEL / AND LEFT IT ALL BEHIND in the sky
    if (t > tTr.start - 0.02) {
      const SP = this.readable({ o: [GATE - 6, 8.2, -2], r: [1, 0, 0], u: [0, 1, 0] });
      const k = ease.outBack(clamp((t - tTr.start) / 0.25), 1.6);
      // (steps back as AND LEFT IT ALL BEHIND comes in: that line starts just under its tail)
      this.text3(c, 'TRANSFORMERS', SP, 0, 0, { size: 2.15 * k, fam: WIDE, color: t < tTr.end ? U.mag : '#FFFFFF', align: 'center', glow: 22, glowColor: U.ink, alpha: 1 - 0.85 * clamp((t - (tLeft.start - 0.3)) / 0.35) });
      // (RAN IN PARALLEL clears as AND LEFT IT ALL BEHIND comes in beside it)
      this.say3(c, [w(3, /^ran$/), w(3, /^in$/), tPar], t, SP, 0, -2.0, { size: 1.5, slam: 0.4, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, alpha: 1 - clamp((t - (tLeft.start - 0.32)) / 0.15) });
      if (t > tLeft.start - 0.3) {
        const BP = this.readable({ o: [GATE + 16.5, 6.5, -2], r: [1, 0, 0], u: [0, 1, 0] });
        this.say3(c, L[3]!.slice(L[3]!.indexOf(w(3, /^and$/))), t, BP, 0, 0, { size: 1.5, slam: 0.4, fam: WIDE, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, rise: 0.3 });
      }
    }
    frameMarks(c, U.ash, { tl: 'BASELINE · NIGHT LINE · LAST STOP', tr: t < tAtt.start ? 'ENCODER → c ∈ ℝ⁶⁴ → DECODER' : t < tRec.start ? 'α = softmax(score(s, h))' : t < tTr.start ? 'O(n) SEQUENTIAL STEPS' : 'O(1) SEQUENTIAL · n² PAIRS', bl: '2014 — 2017', br: tc(t), alpha: 0.6 });
    void tStep; void tBeh;
    return { bloom: 0.85, bloomThreshold: 0.55, halation: 0.2, ca: 0.3 + 1.6 * hot(t, tTr.start, 0.12) + 1.0 * hot(t, tLook.start, 0.1), grain: 0.05, vignette: 0.34, zoom: 1 + 0.012 * kick };
  }

  private wagon(c: Ctx, x: number, s: string, lit: number, col: string, hotk = 0, y = 0.3, sq = 1) {
    this.box3(c, [x - (WL / 2) * sq, y, -(WD / 2) * sq], [x + (WL / 2) * sq, y + WH * sq, (WD / 2) * sq], hexA(lit > 0.5 ? col : STEEL, 0.55 + 0.45 * lit), 1.3, { fill: mixHex('#0A1024', '#2A1A08', 0.5 * lit) });
    if (sq > 0.3) {
      const side: Pl = { o: [x, y + (WH / 2) * sq, (WD / 2) * sq + 0.01], r: [1, 0, 0], u: [0, 1, 0] };
      // (sized from the real width: estimated per letter, PARALLEL and LEFT ran past the wagon's ends)
      const size = Math.min(0.56, (WL - 0.35) / Math.max(1e-3, this.tw3(s, { size: 1, fam: COND }))) * sq;
      this.text3(c, s, side, 0, 0, { size, fam: COND, color: lit > 0.5 ? mixHex(BONE, '#FFFFFF', hotk) : hexA(BONE, 0.3), align: 'center', mid: true, glow: hotk * 12, glowColor: col });
    }
  }

  private seq2seq(c: Ctx, t: number) {
    const L = this.L;
    const ws = [...L[0]!, ...L[1]!.slice(0, 4)];
    const tNeck = L[0]!.find((x) => /bottleneck/.test(x.w))!.start, tAtt = L[1]![0]!.start, tLook = L[1]!.find((x) => /look/.test(x.w))!.start;
    const tRec = L[2]![0]!.start;
    const a = 1 - clamp((t - tRec + 0.2) / 0.5);
    c.save(); c.globalAlpha *= a;
    // the funnel: square rings narrowing to the neck
    for (let i = 0; i <= 10; i++) {
      const u = i / 10, x = lerp(FUN0, FUN1, u), s = lerp(2.2, 0.45, ease.inOutQuad(u)), yc = 1.0;
      this.pl3(c, [[x, yc - s, -s], [x, yc + s, -s], [x, yc + s, s], [x, yc - s, s]], hexA(SOD, 0.35 + 0.5 * u), 1.4, { close: true });
    }
    for (const [dy, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]) this.seg(c, [FUN0, 1.0 + 2.2 * dy, 2.2 * dz], [FUN1, 1.0 + 0.45 * dy, 0.45 * dz], hexA(SOD, 0.7), 1.4);
    // the capsule: the whole sentence as one vector (glows once the wagons have gone in)
    const full = clamp((t - tNeck - 0.5) / 0.9);
    const cq = this.pr([CAP, 1.0, 0]);
    if (cq.z > this.near) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const R = (0.6 + 0.5 * full) * cq.k * 1.6;
      const g = c.createRadialGradient(cq.x, cq.y, 0, cq.x, cq.y, R);
      g.addColorStop(0, hexA('#FFFFFF', 0.4 + 0.5 * full)); g.addColorStop(0.4, hexA(SOD, 0.5 * full + 0.15)); g.addColorStop(1, hexA(SOD, 0));
      c.fillStyle = g; c.fillRect(cq.x - R, cq.y - R, 2 * R, 2 * R); c.restore();
    }
    this.box3(c, [CAP - 0.55, 0.45, -0.55], [CAP + 0.55, 1.55, 0.55], SOD, 1.6, { fill: hexA('#3A2408', 0.9) });
    this.text3(c, 'c ∈ ℝ⁶⁴', { o: [CAP, -0.3, 0.6], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.36, fam: MONOB, color: SOD, align: 'center' });
    // encoder wagons: sung words light; after "bottleneck" they run into the funnel and shrink away
    ws.forEach((wd, i) => {
      const p = this.encPos(i, t);
      const sq = p[0] < FUN0 ? 1 : clamp(1 - (p[0] - FUN0) / (FUN1 - FUN0), 0, 1);
      if (sq <= 0.02) return;
      const lit = t >= wd.start ? 1 : 0;
      const s = (this.input[i] ?? wd.w).toUpperCase();
      this.wagon(c, p[0], s, lit, SOD, hot(t, wd.start, 0.25), 0.3 + (1 - sq) * 0.6, sq);
    });
    // decoder: the reversed words come out one per 0.13 s after the capsule fills
    const td0 = tNeck + 1.0;
    this.output.forEach((s, j) => {
      const tj = td0 + j * 0.13;
      if (t < tj) return;
      const x = DEC0 + j * P2;
      const come = ease.outCubic(clamp((t - tj) / 0.25));
      this.wagon(c, lerp(CAP + 1, x, come), s.toUpperCase(), 1, CYAN, hot(t, tj, 0.2));
    });
    // attention: from every decoded wagon, beams back to the encoder wagons (which now stand above the funnel as ghosts)
    if (t > tAtt - 0.1) {
      const ka = clamp((t - tAtt) / 0.5);
      // the encoder tokens restored as a row of ghost tiles above the funnel (attention reads them all)
      this.input.forEach((s, i) => {
        const x = -12 + i * 2.2;
        this.rect3(c, { o: [x, 4.6, 0], r: [1, 0, 0], u: [0, 1, 0] }, -0.95, -0.35, 1.9, 0.7, { fill: hexA('#0A1630', 0.9 * ka), stroke: hexA(CYAN, 0.6 * ka), lw: 1 });
        this.text3(c, s.toUpperCase(), { o: [x, 4.6, 0.01], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: Math.min(0.32, 1.7 / Math.max(1, s.length * 0.62)), fam: COND, color: hexA(BONE, ka), align: 'center', mid: true });
      });
      const cur = Math.min(11, Math.floor(clamp((t - tAtt) / (tLook - tAtt + 0.6)) * 12));
      for (let j = 0; j <= cur; j++) {
        const dx = DEC0 + j * P2;
        const row = this.alpha[j] ?? [];
        for (let i = 0; i < 12; i++) {
          const al = row[i] ?? (i === 11 - j ? 0.9 : 0.01);
          if (al < 0.02) continue;
          const sx = -12 + i * 2.2;
          const strong = j === cur ? 1 : 0.35;
          const pts: V3[] = [];
          for (let q = 0; q <= 16; q++) { const u = q / 16; const p = vlerp([dx, 1.6, 0], [sx, 4.25, 0], u); pts.push([p[0], p[1] + Math.sin(Math.PI * u) * 3.2, p[2] + Math.sin(Math.PI * u) * 1.5]); }
          this.pl3(c, pts, CYAN, 0.6 + 5 * al * strong, { alpha: ka * (0.15 + 0.85 * al) * strong });
        }
      }
      // the alignment map on the ground: the anti-diagonal of a reversal
      const mk = clamp((t - (L[1]!.find((x) => /double/.test(x.w))!.start - 0.6)) / 0.5);
      if (mk > 0) {
        const G = floorPl(0.02);
        for (let r = 0; r < 12; r++) for (let q = 0; q < 12; q++) {
          const v = this.alpha[r]?.[q] ?? (q === 11 - r ? 0.9 : 0.01);
          this.rect3(c, G, HM.x + q * HM.s, -(HM.z + r * HM.s) - HM.s * 0.92, HM.s * 0.92, HM.s * 0.92, { fill: hexA(mixHex('#0A1630', CYAN, Math.pow(v, 0.5)), mk) });
        }
        this.text3(c, 'α · DECODER STEP × ENCODER WORD', G, HM.x, -(HM.z - 0.6), { size: 0.4, fam: MONOB, color: hexA(CYAN, mk) });
        // the two checks: a decoded word and its source, ticked
        const dc = clamp((t - L[1]!.find((x) => /double/.test(x.w))!.start) / 0.3);
        if (dc > 0) for (const r of [3, 8]) this.text3(c, '✓', G, HM.x + (11 - r) * HM.s + HM.s * 0.15, -(HM.z + r * HM.s) - HM.s * 0.85, { size: 0.9 * dc, fam: HEAVY, color: GRN });
      }
    }
    c.restore();
  }

  private march(c: Ctx, t: number) {
    const L = this.L;
    const tRec = L[2]![0]!.start, tTr = L[3]![0]!.start, tLeft = L[3]!.find((x) => /left/.test(x.w))!.start;
    const a = clamp((t - (tRec - 0.8)) / 0.5);
    const words = [...L[2]!, ...L[3]!];
    const nR = L[2]!.length;
    // the turnstile
    c.save(); c.globalAlpha *= a;
    for (const z of [-1.6, 1.6]) this.seg(c, [GATE, 0, z], [GATE, 3.2, z], GRN, 2.4);
    this.box3(c, [GATE - 0.2, 3.2, -1.6], [GATE + 0.2, 3.6, 1.6], GRN, 1.6, { fill: '#06200F' });
    // steps on the beat: one wagon through per beat
    const beats = this.B(tRec - 0.05, tTr + 0.1);
    let step = 0;
    for (const b of beats) if (t >= b) step++;
    const stepK = beats.length ? ease.outCubic(clamp((t - (beats[Math.max(0, step - 1)] ?? tRec)) / 0.22)) : 0;
    const sgn: Pl = { o: [GATE, 4.6, 0], r: [1, 0, 0], u: [0, 1, 0] };
    // (the board is as wide as its longest line plus a margin: at 6.4 the AT ONCE line ran into both ends)
    const bw = this.tw3('t = 1 … n  AT ONCE', { size: 0.62, fam: MONOB }) + 1.1;
    this.rect3(c, sgn, -bw / 2, -0.55, bw, 1.5, { fill: '#06200F', stroke: hexA(GRN, 0.8), lw: 1.3 });
    this.text3(c, t < tTr ? `t = ${Math.max(1, step)}` : 't = 1 … n  AT ONCE', sgn, 0, 0.2, { size: 0.62, fam: MONOB, color: GRN, align: 'center', mid: true });
    c.restore();
    // the wagons: L22's words queue and pass one per beat; at "transformers" L23's words appear all at once
    const par = clamp((t - tTr) / 0.25);
    words.forEach((wd, i) => {
      const isRec = i < nR;
      if (!isRec && t < tTr - 0.02) return;
      let x: number;
      if (isRec) {
        // position in the queue: wagons before the turnstile advance by one slot each beat
        const slot = i - (step - 1 + stepK);
        x = GATE + 1.6 + slot * P2;
        if (t > tTr) x += (t - tTr) * 0; // they stay where they are when the transformer arrives
      } else {
        const j = i - nR;
        x = GATE + 3.0 + j * P2 * 1.05;
      }
      const lit = t >= wd.start ? 1 : 0.15;
      const fade = isRec ? 1 - 0.75 * par : par;
      if (fade <= 0.02) return;
      c.save(); c.globalAlpha *= a * fade;
      this.wagon(c, x, wd.w.toUpperCase().replace(/[,.]/g, ''), isRec ? lit : 1, isRec ? SOD : MAG, hot(t, isRec ? wd.start : tTr, 0.25), isRec ? 0.3 : 0.3 + 2.2 * ease.outBack(par, 1.4));
      c.restore();
    });
    void MARCH0;
    // the transformer: every pair of L23's wagons joined by an arc, all at once
    if (t > tTr - 0.02) {
      const n = L[3]!.length, k = clamp((t - tTr) / 0.35);
      const xs = Array.from({ length: n }, (_, j) => GATE + 3.0 + j * P2 * 1.05);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const h = 1.2 + Math.abs(j - i) * 0.55;
        const pts: V3[] = [];
        for (let q = 0; q <= 18; q++) { const u = q / 18; pts.push([lerp(xs[i]!, xs[j]!, u), 3.8 + Math.sin(Math.PI * u) * h * k, Math.sin(Math.PI * u) * 0.8 * ((i + j) % 2 ? 1 : -1)]); }
        this.pl3(c, pts, (i + j) % 3 ? MAG : CYAN, 1.2 + 1.2 * hash(i, j), { alpha: 0.35 + 0.5 * hot(t, tTr + 0.02 * (i + j), 0.4) });
      }
    }
    void tLeft;
  }
}
