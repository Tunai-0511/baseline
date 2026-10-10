// v3 chorus2 tail + drop1, L30–L31 ("LSTM, you held the memory for so long, / one attention layer and the whole
// recurrence gone") and the drop: GONE. The LSTM cell, drawn as its diagram — the cell-state highway across the top
// (× forget, + input), the σ σ tanh σ gates below, h_t out — unrolled to the horizon, a memory riding the highway
// cell after cell: "for so long". Then one attention layer drops onto the line like a slab of glass; the ↻ loops of
// the recurrence snap one by one, the cells crumble and blow away under a held GONE. The drop: the slab lights up as
// the layer it is — tokens on glass, every pair joined, eight heads in eight colours flashing on the kick — and the
// camera dives down a stack of six of them.
// Style: LSTM green and amber on black; the attention layer in eight head colours.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, vlerp, U, type Ctx, basis, vnorm } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BG = '#0B0A0D', GRN = '#EDEAF2', AMB = '#FF2E7E', BONE = '#EDEAF2', DIM = '#1E1C24', MAG = '#FF2E7E';
const HEADS = ['#FF2E7E', '#EDEAF2', '#9A96A3', '#EDEAF2', '#FF2E7E', '#9A96A3', '#EDEAF2', '#9A96A3'];
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), MONO = F.mono(500), MONOB = F.mono(700);
const CP = 7.0; // cell pitch along x
const NCELL = 26;
const SLAB_Y = 4.4; // the attention slab's rest height
const NT = 12; // tokens on a layer

export default class Gone extends VScene {
  private L30!: Word[]; private L31!: Word[];
  private tDrop = 0;

  override init() {
    this.bg = BG;
    // the city round the chain: the Transformer's own equations, and attention strung between the towers
    this.env = { eq: ['attention', 'multihead', 'posenc', 'head', 'ffn', 'layernorm', 'lstm_c', 'bptt'], arcs: 16, focus: [16, 0, 0] };
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L30 = ly.lines[i0]!.words; this.L31 = ly.lines[i0 + 1]!.words;
    this.tDrop = this.ctx.audio.sections.find((s) => s.name === 'drop1')?.start ?? 112.33;
    const s = this.ctx.start, e = this.ctx.end;
    const w30 = (re: RegExp) => this.L30.find((x) => re.test(x.w))!, w31 = (re: RegExp) => this.L31.find((x) => re.test(x.w))!;
    const tMem = w30(/memory/).start, tLong = w30(/long/).start, tOne = this.L31[0]!.start, tLayer = w31(/layer/).start, tRec = w31(/recurrence/).start, tGone = w31(/gone/).start;
    this.env!.flash = [tLayer, tGone, this.tDrop]; // (the city answers the slab's landing, GONE and the drop)
    const tDrop = this.tDrop;
    this.rig = new Rig([
      { t0: s, name: 'cell', key: (t) => { const k = ease.inOutQuad(clamp((t - s) / (tMem - s))); return K([lerp(-6, -4, k), lerp(4.5, 5.2, k), lerp(11, 13, k)], [lerp(1.5, 3.5, k), 2.2, 0], 46, 0.03); } },
      { t0: tMem - 0.05, snap: 0.5, name: 'horizon', key: (t) => { const k = ease.inOutCubic(clamp((t - tMem) / (tOne - tMem))); return K([lerp(-4, -8, k), lerp(5.5, 3.6, k), lerp(9, 3.2, k)], [lerp(10, 60, k), lerp(2.4, 2.2, k), 0], lerp(46, 40, k), 0.02); } },
      { t0: tOne - 0.05, snap: 0.45, name: 'slab', key: (t) => { const k = ease.inOutQuad(clamp((t - tOne) / (tGone - tOne))); return K([lerp(-6, -10, k), lerp(9, 12, k), lerp(18, 24, k)], [lerp(14, 20, k), 2.6, 0], 46, -0.02); } },
      { t0: tGone - 0.05, snap: 0.3, name: 'gone', key: (t) => { const k = ease.outCubic(clamp((t - tGone) / (tDrop - tGone))); return K([lerp(20, 24, k), lerp(11, 14, k), lerp(28, 25, k)], [24, 5.2, 0], 46); } },
      { t0: tDrop - 0.02, name: 'dive', key: (t) => this.diveKey(t) },
    ], [{ t: s, amp: 0.5 }, { t: tOne, amp: 0.6 }, { t: tLayer - 0.05, amp: 2.4 }, { t: tRec, amp: 1.0 }, { t: tGone, amp: 1.4 }, ...this.B(tDrop, e).map((b, i) => ({ t: b, amp: i % 4 === 0 ? 0.9 : 0.35 }))], 0.8, 101);
    void tLong;
  }

  /** the drop: down a stack of six attention layers, a jump per bar, an orbit inside each */
  private diveKey(t: number) {
    const tDrop = this.tDrop, e = this.ctx.end;
    const bars = this.ctx.audio.downbeats.filter((d) => d >= tDrop - 0.05 && d < e);
    let bi = 0; for (let i = 0; i < bars.length; i++) if (t >= bars[i]!) bi = i;
    const b0 = bars[bi] ?? tDrop, b1 = bars[bi + 1] ?? e;
    const kk = ease.outExpo(clamp((t - b0) / 0.35));
    const lvl = (i: number) => -i * 6.5;
    const yPrev = lvl(Math.max(0, bi - 1) * 1.5), yCur = lvl(bi * 1.5);
    const y = lerp(yPrev, yCur, kk) + SLAB_Y;
    const ph = (t - b0) / Math.max(0.3, b1 - b0);
    const yaw = bi * 1.1 + ph * 0.9;
    const cx = 24;
    return K([cx + Math.sin(yaw) * 16, y + 5.5 - ph * 1.5, Math.cos(yaw) * 16], [cx, y - 1.5, 0], 50 + 6 * hot(t, b0, 0.15), 0.08 * Math.sin(yaw));
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L30 = this.L30, L31 = this.L31;
    const w30 = (re: RegExp) => L30.find((x) => re.test(x.w))!, w31 = (re: RegExp) => L31.find((x) => re.test(x.w))!;
    const tLSTM = L30[0]!, tHeld = w30(/held/), tMem = w30(/memory/), tFor = w30(/for/), tLong = w30(/long/);
    const tOne = L31[0]!, tAtt = w31(/attention/), tLayer = w31(/layer/), tWhole = w31(/whole/), tRec = w31(/recurrence/), tGone = w31(/gone/);
    const tDrop = this.tDrop;
    const beat = this.beatPulse(t, 0.07);
    const slamT = tLayer.start - 0.05;
    const crumble = clamp((t - tRec.start) / 2.2);
    // ------------------------------------------------ ground
    pool(c, W * 0.5, H * 0.55, 1000, t < tDrop ? '#0E2A1E' : '#2A0A22', 0.5);
    if (t < tDrop + 0.5) this.grid3(c, floorPl(-0.05), -20, 200, -16, 16, 2, DIM, 1, { alpha: 0.8 * (1 - clamp((t - tDrop) / 0.5)), fog: [10, 70] });
    // ------------------------------------------------ the LSTM line
    if (t < tDrop + 0.2) {
      for (let i = NCELL - 1; i >= 0; i--) {
        const x = i * CP;
        const lit = clamp((t - (tHeld.start + i * 0.08)) / 0.3);
        // crumble: from the far end back, each cell lifts and blows apart after the recurrence snaps
        const ci = clamp(crumble * 1.6 - (NCELL - 1 - i) / NCELL);
        if (ci >= 1) continue;
        this.cell(c, t, x, lit, ci, i);
      }
      // the memory riding the highway, far into the distance
      if (t > tHeld.start && t < tOne.start + 0.3) {
        const u = clamp((t - tHeld.start) / (tLong.end - tHeld.start + 0.3));
        const x = lerp(0, (NCELL - 2) * CP, ease.inOutQuad(u));
        const q = this.pr([x, 4.2, 0]);
        if (q.z > this.near) { c.save(); c.globalCompositeOperation = 'lighter'; const R = Math.max(6, 1.0 * q.k); const g = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, R); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, hexA(AMB, 0.7)); g.addColorStop(1, hexA(AMB, 0)); c.fillStyle = g; c.fillRect(q.x - R, q.y - R, 2 * R, 2 * R); c.restore(); }
      }
    }
    // ------------------------------------------------ the attention slab
    if (t > tOne.start - 0.6) this.slab(c, t, slamT, tDrop);
    // ------------------------------------------------ the drop: a stack of six layers
    if (t > tDrop - 0.05) for (let l = 1; l < 6; l++) this.attnLayer(c, t, 24, SLAB_Y - l * 6.5 * 1.5 + 0, l);
    // ------------------------------------------------ lyric type
    const front: Pl = { o: [0, 0, 2.6], r: [1, 0, 0], u: [0, 1, 0] };
    if (t < tOne.start + 0.4) {
      const fade = 1 - clamp((t - tOne.start) / 0.4);
      // LSTM, and YOU HELD THE MEMORY on the same front plane, one under the other; both clear for FOR SO LONG
      const head = fade * (1 - clamp((t - (tFor.start - 0.08)) / 0.15));
      const k = ease.outBack(clamp((t - tLSTM.start) / 0.3), 1.6);
      if (head > 0) {
        this.text3(c, 'LSTM,', front, -1.4, 5.0, { size: 2.0 * k, fam: WIDE, color: t < tLSTM.end ? U.mag : BONE, glow: 14, glowColor: U.ink, alpha: head });
        // (under the cell-state highway, not across it: its × and + showed through YOU)
        this.say3(c, [w30(/you/), tHeld, w30(/^the$/), tMem], t, front, -1.4, 3.1, { size: 1.15, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, upper: true, rise: 0.3, alpha: head, glow: 16, glowColor: U.ink });
      }
      // FOR SO LONG strung out along the highway into the distance
      if (t > tFor.start - 0.02) {
        const ws = [tFor, w30(/^so$/), tLong];
        ws.forEach((wd, i) => {
          if (t < wd.start - 0.02) return;
          const x = 18 + i * 22, s0 = wd.w.toUpperCase().replace(',', '');
          const P: Pl = { o: [x, 6.4, 0], r: [1, 0, 0], u: [0, 1, 0] };
          const stretch = wd === tLong ? 0.6 * clamp((t - tLong.start) / 0.5) : 0;
          this.text3(c, s0, P, 0, 0, { size: 2.8, fam: WIDE, color: t < wd.end ? U.mag : BONE, align: 'center', track: stretch, glow: 12, glowColor: U.ink, alpha: fade });
        });
      }
    }
    if (t > tOne.start - 0.02 && t < tGone.start + 0.1) {
      // (gone as GONE lands — it is set over the same place, and the cross-fade printed it on ATTENTION LAYER)
      const SP: Pl = { o: [16, SLAB_Y + 3.4, 0], r: [1, 0, 0], u: [0, 1, 0] };
      const ga = 1 - clamp((t - (tGone.start - 0.08)) / 0.12);
      this.say3(c, [tOne, tAtt, tLayer], t, SP, 0, 0.3, { size: 1.8, slam: 0.4, fam: WIDE, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, rise: 0.4, alpha: ga });
      this.say3(c, [w31(/^and$/), w31(/^the$/), tWhole, tRec], t, { ...SP, o: [16, SLAB_Y + 1.4, 0] }, 0, 0, { size: 1.3, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, alpha: ga });
    }
    if (t > tGone.start - 0.02) {
      // GONE: huge, held to the end of the note, the letters drifting apart like the cells
      const k = ease.outBack(clamp((t - tGone.start) / 0.3), 1.6);
      const drift = clamp((t - tGone.start) / (tGone.end - tGone.start));
      const out = 1 - clamp((t - tGone.end - 0.2) / 0.6);
      const P: Pl = this.readable({ o: [24, SLAB_Y + 3.0, 0], r: [1, 0, 0], u: [0, 1, 0] });
      this.text3(c, 'GONE', P, 0, 0, { size: 4.6 * k, fam: WIDE, color: U.mag, align: 'center', glow: 26, glowColor: U.ink, alpha: out, each: (i) => ({ dx: (i - 1.5) * 0.2 * drift, dy: 0.15 * Math.sin(i * 2 + t * 2) * drift, a: 1 - 0.2 * drift }) });
    }
    if (t > tDrop) {
      const P: Pl = this.readable({ o: [24, SLAB_Y - 8.5, -8], r: [1, 0, 0], u: [0, 1, 0] });
      const a = clamp((t - tGone.end - 0.2) / 0.4);
      this.text3(c, 'MULTI-HEAD ATTENTION × 8  ·  6 LAYERS', P, 0, 0, { size: 0.7, fam: MONOB, color: hexA(BONE, 0.8 * a), align: 'center' });
    }
    // the drop's last two bars: what just happened, written across the layer the camera is diving through
    if (t > tDrop) {
      const bars = this.ctx.audio.downbeats.filter((d) => d >= tDrop - 0.05 && d < this.ctx.end);
      // (GONE is held over the drop's first bars: written across the layer the camera dives through, it stays sung)
      const WORDS: [number, string, string][] = [[1, 'GONE', ''], [2, 'ALL PAIRS', 'AT ONCE'], [3, 'NO', 'RECURRENCE']];
      for (const [bi, w1, w2] of WORDS) {
        const tb = bars[bi];
        if (tb === undefined || t < tb) continue;
        const nb = bars[bi + 1] ?? this.ctx.end;
        if (t > nb + 0.05) continue;
        const yl = SLAB_Y - bi * 6.5 * 1.5 + 0.05;
        // (set square to the screen as the camera was when the bar began — on the floor's own axes, seen from the
        // dive, the words read sideways)
        const kb = this.rig ? basis(this.rig.at(tb)) : null;
        const rr = kb ? vnorm([kb.R[0], 0, kb.R[2]]) : ([1, 0, 0] as V3), uu = kb ? vnorm([kb.U[0], 0, kb.U[2]]) : ([0, 0, -1] as V3);
        const P: Pl = { o: [24, yl, 0], r: rr, u: uu };
        const k = clamp((t - tb) / 0.12);
        const sc = 1 + 0.5 * Math.pow(1 - k, 3);
        // (well apart: on a floor seen at a grazing angle the gap between two rows foreshortens to nothing)
        // (the second line's start under the first's: the floor seen at an angle pushes the far line right)
        this.text3(c, w1, P, 0, w2 ? -0.6 : -3.0, { size: w2 ? 2.2 : 4.6, fam: WIDE, color: bi === 2 || !w2 ? U.mag : U.bone, align: 'center', mid: true, glow: 20, glowColor: U.ink, each: () => ({ sc }) });
        if (w2) this.text3(c, w2, P, 0, -4.6, { size: 2.2, fam: WIDE, color: bi === 2 ? U.bone : U.mag, align: 'center', mid: true, glow: 20, glowColor: U.ink, each: () => ({ sc }) });
      }
    }
    frameMarks(c, U.ash, { tl: t < tOne.start ? 'BASELINE · LSTM · c_t → c_t+1 → …' : 'BASELINE · ONE ATTENTION LAYER', tr: t < tDrop ? '1997 → 2017' : 'DROP', bl: t < tDrop ? 'RECURRENCE' : 'NO RECURRENCE', br: tc(t), alpha: 0.6 });
    void tAtt; void W; void H;
    return { bloom: t < tDrop ? 0.8 : 1.0, bloomThreshold: 0.5, halation: 0.22, ca: 0.3 + 2.6 * hot(t, slamT, 0.1) + (t > tDrop ? 1.6 * beat : 0), grain: 0.05, vignette: 0.34, flash: 0.028 * hot(t, slamT, 0.08) + (t > tDrop ? 0.012 * beat : 0), zoom: 1 + (t > tDrop ? 0.02 : 0.01) * beat, split: t > tDrop ? 2.5 * beat : 0 };
  }

  /** one LSTM cell at x, drawn as its diagram on a vertical plane, with the ↻ recurrence loop over it */
  private cell(c: Ctx, t: number, x: number, lit: number, ci: number, i: number) {
    const L31 = this.L31;
    const tRec = L31.find((w) => /recurrence/.test(w.w))!.start;
    const snapT = tRec - 0.1 + (NCELL - 1 - i) * 0.025; // loops snap from the far end
    const lift = ci > 0 ? ease.inQuad(ci) * 6 : 0;
    const drift = ci > 0 ? ease.inQuad(ci) * 8 : 0;
    const a = 1 - ci;
    const P: Pl = { o: [x + drift, lift, -drift * 0.4], r: [1, 0, 0], u: [0, 1, 0] };
    const col = mixHex(DIM, GRN, 0.35 + 0.65 * lit);
    c.save(); c.globalAlpha *= a;
    // body
    this.rect3(c, P, -2.6, 0.6, 5.2, 3.0, { fill: hexA('#071A12', 0.92), stroke: col, lw: 1.4 });
    // cell-state highway across the top, × and + on it
    this.seg(c, at(P, -3.5, 4.2), at(P, 3.5, 4.2), mixHex(col, AMB, 0.4 * lit), 2.4);
    this.ring3(c, P, -1.2, 4.2, 0.28, col, 1.4, { fill: '#071A12' }); this.text3(c, '×', P, -1.2, 4.2, { size: 0.42, fam: HEAVY, color: BONE, align: 'center', mid: true });
    this.ring3(c, P, 0.6, 4.2, 0.28, col, 1.4, { fill: '#071A12' }); this.text3(c, '+', P, 0.6, 4.2, { size: 0.42, fam: HEAVY, color: BONE, align: 'center', mid: true });
    // gates
    ['σ', 'σ', 'tanh', 'σ'].forEach((g, j) => {
      const gx = -1.8 + j * 1.2;
      this.rect3(c, P, gx - 0.45, 1.2, 0.9, 0.7, { fill: hexA(j === 2 ? '#2A1E06' : '#0B2A1C', 0.95), stroke: j === 2 ? AMB : col, lw: 1.2 });
      this.text3(c, g, P, gx, 1.55, { size: 0.3, fam: MONOB, color: BONE, align: 'center', mid: true });
      this.seg(c, at(P, gx, 1.9), at(P, gx, j === 0 ? 3.92 : j === 3 ? 2.6 : 3.92), hexA(col, 0.8), 1);
    });
    // h_t out the bottom-right, into the next cell
    this.seg(c, at(P, 2.6, 1.0), at(P, CP - 2.6, 1.0), hexA(col, 0.7), 1.4);
    this.text3(c, `t=${i + 1}`, P, -2.4, 0.15, { size: 0.3, fam: MONO, color: hexA(BONE, 0.6) });
    // the ↻ recurrence loop over the cell: snaps at its time
    const snapped = t > snapT;
    if (!snapped) {
      this.ring3(c, { o: at(P, 0, 5.4), r: P.r, u: P.u }, 0, 0, 0.75, hexA(GRN, 0.85), 1.8, { a0: 0.3, a1: Math.PI * 1.75 });
      const tip = at(P, Math.cos(Math.PI * 1.75) * 0.75, 5.4 + Math.sin(Math.PI * 1.75) * 0.75);
      this.dot3(c, tip, 0.1, GRN);
    } else {
      const dt = t - snapT;
      for (let k = 0; k < 6; k++) {
        const a0 = 0.3 + k * 0.4, a1 = a0 + 0.35;
        const vx = Math.cos(a0) * 2, vy = 2 + hash(i, k) * 2;
        const ox = vx * dt, oy = vy * dt - 6 * dt * dt;
        this.ring3(c, { o: at(P, ox, 5.4 + oy), r: P.r, u: P.u }, 0, 0, 0.75, hexA(GRN, clamp(1 - dt / 0.8)), 1.8, { a0, a1, n: 6 });
      }
    }
    c.restore();
  }

  /** the attention slab: drops on "layer", lies on the line; at the drop it lights up as a layer */
  private slab(c: Ctx, t: number, slamT: number, tDrop: number) {
    const fall = ease.inQuad(clamp((t - (slamT - 0.5)) / 0.5));
    const y = t < slamT ? lerp(SLAB_Y + 26, SLAB_Y, fall) : SLAB_Y + 0.3 * Math.exp(-(t - slamT) * 10) * Math.sin((t - slamT) * 40);
    this.attnLayer(c, t, 24, y, 0);
    // shock ring at the slam
    if (t > slamT && t < slamT + 0.8) { const u = (t - slamT) / 0.8; this.ring3(c, floorPl(y), 24, 0, 18 + 30 * u, MAG, 3 * (1 - u), { alpha: 1 - u, n: 80 }); }
    void tDrop;
  }

  /** an attention layer: a glass slab with NT tokens, all pairs joined, eight heads flashing on the beat */
  private attnLayer(c: Ctx, t: number, cx: number, y: number, l: number) {
    const w = 46, d = 12;
    const P = floorPl(y, [0, y, 0]);
    const tDrop = this.tDrop;
    const on = t > tDrop ? 1 : 0.35;
    const lb = this.lastBeat(t);
    const head = (lb.i + l) % 8;
    this.rect3(c, P, cx - w / 2, -d / 2, w, d, { fill: hexA('#140A1C', 0.55), stroke: hexA(MAG, 0.9), lw: 1.6 });
    // tokens along the middle
    const xs = Array.from({ length: NT }, (_, j) => cx - w / 2 + 3 + (j * (w - 6)) / (NT - 1));
    xs.forEach((x, j) => {
      this.box3(c, [x - 0.8, y, -0.8], [x + 0.8, y + 1.0, 0.8], hexA(BONE, 0.8), 1.2, { fill: '#1A0E22' });
      if (l === 0) this.text3(c, ['one', 'attention', 'layer', 'and', 'the', 'whole', 'recurrence', 'gone', '·', '·', '·', '·'][j]!.toUpperCase(), { o: [x, y + 0.5, 0.81], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.24, fam: MONOB, color: BONE, align: 'center', mid: true });
    });
    // all pairs, colored by head; brightness pulses with the beat after the drop
    const beat = this.beatPulse(t, 0.12);
    for (let i = 0; i < NT; i++) for (let j = i + 1; j < NT; j++) {
      const hd = (i * 7 + j * 3 + head) % 8;
      const wgt = Math.pow(hash(i, j, l + 3), 3);
      if (wgt < 0.05) continue;
      const hgt = 1.2 + Math.abs(j - i) * 0.65;
      const pts: V3[] = [];
      for (let q = 0; q <= 14; q++) { const u = q / 14; pts.push([lerp(xs[i]!, xs[j]!, u), y + 1.1 + Math.sin(Math.PI * u) * hgt, Math.sin(Math.PI * u) * (hd - 3.5) * 0.5]); }
      const a = on * (0.15 + 0.85 * wgt) * (t > tDrop ? 0.4 + 0.6 * (hd === head ? beat : 0.3) : 1);
      this.pl3(c, pts, HEADS[hd]!, 1.2 + 3.6 * wgt, { alpha: a });
    }
    this.text3(c, `LAYER ${l + 1}`, P, cx - w / 2 + 0.4, -d / 2 + 0.4, { size: 0.5, fam: MONOB, color: hexA(MAG, 0.9) });
    // the layer's own equations, engraved in it: scaled dot-product attention in front of the tokens, multi-head behind
    if (l === 0) {
      const R = this.readable(P);
      const fa = on * clamp((t - (this.ctx.start + 0.4)) / 0.6);
      if (fa > 0.02) {
        this.eqFit(c, 'attention', R, cx, -3.3, w * 0.62, 2.6, { color: BONE, alpha: 0.85 * fa });
        this.eqFit(c, 'multihead', R, cx, 3.6, w * 0.5, 1.6, { color: U.ash, alpha: 0.6 * fa, qa: false });
      }
    }
  }
}
