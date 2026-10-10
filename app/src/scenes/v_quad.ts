// v3 chorus4 tail, L62–L63 ("And you, attention, quadratic in the length, / a linear-time successor's training up its
// strength"): PRESSURE. The attention matrix of a sequence of length n lies on the floor as a square of cells; on every
// beat n doubles and the square's area quadruples (n² = 1,048,576 → 4,194,304 → 16,777,216 …) until it runs off every
// edge of the frame and the camera cannot back away fast enough. Then, beside it, a single bright scan head runs down a
// thin line at constant speed — O(n), a fixed-size state carried along — while its training loss falls and a strength
// bar fills: the successor, unnamed, still training.
// Style: pressure — deep red and black for the square; cool white and green for the successor.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';

const BG = '#0B0A0D', RED = '#FF2E7E', DRED = '#3A0A1E', BONE = '#EDEAF2', COOL = '#EDEAF2', GRN = '#EDEAF2', MAG = '#FF2E7E';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), MONO = F.mono(500), MONOB = F.mono(700);

export default class Quad extends VScene {
  private L62!: Word[]; private L63!: Word[];
  private steps: number[] = [];

  override init() {
    this.bg = BG;
    this.env = { eq: ['quad', 'attention', 'linattn', 'ssm', 'causal', 'flash_io'], seed: 15, arcs: 12, keep: (x, z) => Math.max(Math.abs(x), Math.abs(z)) > 90, floorKeep: 0 }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L62 = ly.lines[i0]!.words; this.L63 = ly.lines[i0 + 1]!.words;
    const s = this.ctx.start, e = this.ctx.end;
    const tQ = this.L62.find((w) => /quadratic/.test(w.w))!.start, t63 = this.L63[0]!.start, tTrain = this.L63.find((w) => /training/.test(w.w))!.start;
    this.steps = this.B(tQ - 0.05, t63 - 0.1);
    this.rig = new Rig([
      { t0: s, name: 'square', key: (t) => { const sz = this.side(t); const d = 6 + sz * 0.55; return K([d * 0.35, d * 0.9, d * 0.75], [0, 0, -sz * 0.2], 50, 0.03 * Math.sin(t * 2)); } },
      { t0: t63 - 0.05, snap: 0.5, name: 'line', key: (t) => { const k = ease.inOutQuad(clamp((t - t63) / (e - t63))); const x = this.headX(t); return K([x + lerp(6, 8, k), lerp(5, 6, k), lerp(12, 13, k)], [x + 1, 1.5, -2], 46, -0.02); } },
    ], [...this.steps.map((b) => ({ t: b, amp: 1.0 })), { t: t63, amp: 0.4 }, { t: tTrain, amp: 0.3 }], 0.8, 161);
  }

  /** n doubles on each beat of "quadratic in the length": side in world units (√ of the cell count, scaled) */
  private dbl(t: number) { let k = 0; for (const b of this.steps) if (t >= b) k++; const last = this.steps[k - 1] ?? 0; return k - 1 + (k ? ease.outExpo(clamp((t - last) / 0.25)) : 0); }
  private side(t: number) { return 4 * Math.pow(2, Math.max(0, this.dbl(t))); }
  private headX(t: number) { const t63 = this.L63[0]!.start; return lerp(-2, 40, clamp((t - t63) / (this.ctx.end - t63))); }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L62 = this.L62, L63 = this.L63;
    const tYou = L62[0]!, tAtt = L62.find((w) => /attention/.test(w.w))!, tQ = L62.find((w) => /quadratic/.test(w.w))!, tLen = L62.find((w) => /length/.test(w.w))!;
    const t63 = L63[0]!, tLin = L63.find((w) => /linear/.test(w.w))!, tSucc = L63.find((w) => /successor/.test(w.w))!, tTrain = L63.find((w) => /training/.test(w.w))!, tStr = L63.find((w) => /strength/.test(w.w))!;
    const beat = this.beatPulse(t, 0.08);
    const press = clamp(this.dbl(t) / 4);
    pool(c, W * 0.5, H * 0.5, 1100, mixHex('#2A0A0E', '#550A14', press), 0.6);
    // ------------------------------------------------ the square: n × n cells, n doubling per beat
    const fadeSq = 1 - clamp((t - t63.start - 0.2) / 0.6) * 0.75;
    const side = this.side(t);
    const G = floorPl(0.02);
    const nShow = 16; // cells drawn per side (each a block of n/16 × n/16)
    const cs = side / nShow;
    for (let r = 0; r < nShow; r++) for (let q = 0; q < nShow; q++) {
      const v = 0.45 + 0.55 * Math.abs(Math.sin(r * 1.3 + q * 0.7 + t * 3));
      this.rect3(c, G, -side / 2 + q * cs, -side / 2 + r * cs, cs * 0.92, cs * 0.92, { fill: hexA(mixHex(DRED, RED, v * (0.4 + 0.6 * press)), 0.85 * fadeSq) });
    }
    this.rect3(c, G, -side / 2, -side / 2, side, side, { stroke: hexA(RED, fadeSq), lw: 2 });
    const k = Math.max(0, Math.round(this.dbl(t)));
    const n = 1024 * Math.pow(2, k);
    if (t > tQ.start - 0.05) {
      // counters, screen-space: they must stay legible while the square runs off the frame
      c.save(); c.globalAlpha *= fadeSq; c.textAlign = 'left';
      c.font = `30px "${MONOB}"`; c.fillStyle = BONE; c.fillText(`n = ${n.toLocaleString('en-US')} TOKENS`, 90, H - 190);
      c.font = `64px "${MONOB}"`; c.fillStyle = RED; c.shadowBlur = 18; c.shadowColor = '#0B0A0D'; c.fillText(`n² = ${(n * n).toLocaleString('en-US')}`, 90, H - 120);
      c.restore();
    }
    // ------------------------------------------------ the successor: one scan head down a line, O(n)
    if (t > t63.start - 0.4) {
      const a = clamp((t - t63.start + 0.4) / 0.4);
      const z = -2;
      this.glowSeg(c, [-4, 0.05, z], [44, 0.05, z], COOL, 1.6, 6, a * 0.8);
      const hx = this.headX(t);
      // tokens passed: small ticks; the state: a fixed 8-cell register riding with the head
      const ticks: [V3, V3][] = [];
      for (let x = -4; x < hx; x += 0.6) ticks.push([[x, 0.05, z - 0.3], [x, 0.05, z + 0.3]]);
      this.segs(c, ticks, hexA(COOL, 0.6 * a), 1.2);
      this.box3(c, [hx - 0.8, 0.05, z - 0.8], [hx + 0.8, 1.6, z + 0.8], GRN, 1.8, { fill: hexA('#0A2A1A', a) });
      for (let i = 0; i < 8; i++) this.rect3(c, { o: [hx - 0.7, 0.3, z + 0.81], r: [1, 0, 0], u: [0, 1, 0] }, i * 0.175, 0, 0.13, 0.4 + 0.6 * Math.abs(Math.sin(t * 6 + i)), { fill: hexA(GRN, a) });
      this.text3(c, 'STATE: FIXED SIZE', { o: [hx, 2.1, z], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.3, fam: MONOB, color: hexA(GRN, a), align: 'center' });
      this.text3(c, 'O(n)', { o: [hx, 2.7, z], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.6, fam: WIDE, color: hexA(COOL, a), align: 'center' });
      // training: loss falling, strength filling
      if (t > tTrain.start - 0.2) {
        const kt = clamp((t - tTrain.start + 0.2) / (tStr.end - tTrain.start + 0.2));
        const P: Pl = { o: [hx + 3.0, 0.4, z - 1.5], r: [1, 0, 0], u: [0, 1, 0] };
        this.rect3(c, P, 0, 0, 6, 3.6, { fill: hexA('#081A12', 0.9), stroke: hexA(GRN, 0.7), lw: 1.2 });
        const pts: V3[] = [];
        for (let i = 0; i <= 40 * kt; i++) { const u = i / 40; pts.push(at(P, 0.3 + u * 5.4, 0.4 + 2.8 * Math.exp(-u * 3.2) + 0.08 * Math.sin(u * 40), 0.02)); }
        this.pl3(c, pts, GRN, 2.2);
        this.text3(c, 'TRAINING LOSS', P, 0.3, 3.15, { size: 0.26, fam: MONOB, color: GRN });
        this.rect3(c, P, 0.3, -0.6, 5.4, 0.35, { fill: '#0A1A12', stroke: hexA(GRN, 0.5), lw: 1 });
        this.rect3(c, P, 0.3, -0.6, 5.4 * ease.inOutQuad(kt), 0.35, { fill: GRN });
        this.text3(c, 'STRENGTH', P, 0.3, -1.05, { size: 0.26, fam: MONOB, color: GRN });
      }
    }
    // ------------------------------------------------ lyric type
    if (t < t63.start - 0.05) {
      // AND YOU, on the near edge; ATTENTION, written across the square (it grows as the square does); QUADRATIC under it
      const SQ: Pl = { o: [0, 0.04, 0], r: [1, 0, 0], u: [0, 0, -1] };
      const sideNow = this.side(t);
      if (t >= tYou.start) this.say3(c, L62.slice(0, 2), t, SQ, 0, sideNow * 0.5 + 0.9, { size: Math.max(0.9, sideNow * 0.07), fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, slam: 0.35, glow: 14, glowColor: U.ink });
      // (rows well apart — the square is seen at a grazing angle, which squeezes the gaps between them — and the block
      // pulled toward the far edge: the camera looks at the far half, and IN THE LENGTH at −0.37 fell off the bottom
      // of the frame onto the n² counter)
      if (t >= tAtt.start) { const kk = ease.outBack(clamp((t - tAtt.start) / 0.25), 1.6); this.text3(c, 'ATTENTION,', SQ, 0, sideNow * 0.26, { size: sideNow * 0.105 * kk, fam: WIDE, color: '#FFFFFF', align: 'center', mid: true, glow: 22, glowColor: U.ink }); }
      if (t >= tQ.start) this.text3(c, 'QUADRATIC', SQ, 0, sideNow * 0.04, { size: sideNow * 0.11, fam: WIDE, color: t < tQ.end ? U.mag : BONE, align: 'center', mid: true, glow: 22, glowColor: U.ink });
      // IN THE LENGTH stops growing with the square at n = 4,096: the camera cannot keep up with it (that is the
      // point), and at the next doubling LENGTH ran off the bottom of the frame while it was being sung
      const tIn = L62[L62.indexOf(tLen) - 2]!, sideL = Math.min(sideNow, 16);
      if (t >= tIn.start) this.say3(c, L62.slice(L62.indexOf(tLen) - 2), t, SQ, 0, -sideL * 0.17, { size: sideL * 0.06, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, slam: 0.35, glow: 14, glowColor: U.ink, text: (w) => w.w.replace(',', '') });
    } else {
      const P: Pl = { o: [this.headX(t) + 1, 4.2, -2.4], r: [1, 0, 0], u: [0, 1, 0] };
      this.say3(c, [L63[0]!, tLin, tSucc], t, P, 0, 0.6, { size: 0.9, fam: WIDE, up: '', cur: U.mag, done: COOL, align: 'center', upper: true, text: (w) => w.w.replace('’', "'") });
      this.say3(c, L63.slice(L63.indexOf(tTrain)), t, P, 0, -0.6, { size: 0.75, fam: HEAVY, up: '', cur: U.mag, done: COOL, align: 'center', upper: true });
    }
    frameMarks(c, U.ash, { tl: 'BASELINE · PRESSURE', tr: t < t63.start ? 'ATTENTION · O(n²) TIME AND MEMORY' : 'SUCCESSOR · O(n)', bl: '2017 — ?', br: tc(t), alpha: 0.6 });
    return { bloom: 0.8, bloomThreshold: 0.55, halation: 0.2, ca: 0.3 + (t < t63.start ? 2.2 * beat * press : 0), grain: 0.05, vignette: 0.36 + 0.2 * press * (t < t63.start ? 1 : 0), zoom: 1 + (t < t63.start ? 0.02 * beat * press : 0) };
  }
}
