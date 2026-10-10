// v3 drop2, L66–L67 ("I was state of the art, / now I'm just a baseline"): THE FALL. The leaderboard one last time, as
// a tower of the whole film: PERCEPTRON 1958 at the bottom, then every #1 since, up to SELF-ATTENTION · TRANSFORMER 2017
// at the top — the singer, in the crown and the magenta. The drop climbs it a row per beat, each row flashing as it is
// passed. "I was state of the art": the crown. "Now I'm just a baseline": an empty row — ? ? ? — slams onto the top,
// and the singer's plate tips out and falls the whole height of history, past every row it once beat, the camera
// falling with it, until it lands flat on the BASELINE beside the perceptron.
// Style: the board's dark arena, magenta for the singer, each era's row in its own section colour.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BG = '#0B0A0D', BONE = '#EDEAF2', MAG = '#FF2E7E', GLASS = '#17151C', GOLD = '#FF2E7E';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), COND = F.archivo(75, 900), MONO = F.mono(500), MONOB = F.mono(700);
// bottom → top; colours borrowed from each era's section
const ROWS: [string, string, string][] = [
  ['PERCEPTRON', '1958', '#9A96A3'], ['MULTI-LAYER PERCEPTRON', '1986', '#9A96A3'], ['SIGMOID → RELU', '2010', '#9A96A3'], ['HOG + SVM', '2005', '#9A96A3'],
  ['DEEP CONVNET', '2012', '#9A96A3'], ['LSTM SEQ2SEQ', '2014', '#9A96A3'], ['GAN', '2014', '#9A96A3'], ['RESNET · 152 LAYERS', '2015', '#9A96A3'],
  ['SELF-ATTENTION · TRANSFORMER', '2017', '#9A96A3'],
];
const RW = 10.5, RH = 1.45, GAP = 2.3;
const rowY = (i: number) => 1.2 + i * GAP; // bottom edge of row i (0 = bottom)
const NR = ROWS.length;
const BZ = 5.0;

export default class Fall extends VScene {
  private L66!: Word[]; private L67!: Word[];
  private climb: number[] = [];

  override init() {
    this.bg = BG;
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start + 1);
    this.L66 = ly.lines[i0]!.words; this.L67 = ly.lines[i0 + 1]!.words;
    const s = this.ctx.start, e = this.ctx.end;
    const t66 = this.L66[0]!.start, tNow = this.L67[0]!.start, tBase = this.L67.find((w) => /baseline/.test(w.w))!.start;
    this.climb = this.B(s, t66 - 0.2).filter((_, i) => i % 1 === 0).slice(0, NR);
    this.rig = new Rig([
      { t0: s, name: 'climb', key: (t) => { const y = this.camClimb(t); const orb = lerp(-0.38, 0.32, clamp((t - s) / (t66 - s))); return K([Math.sin(orb) * 22, y + 2.4, Math.cos(orb) * 22], [0, y + 0.4, 0], 48, 0.04 * Math.sin(t * 3)); } },
      { t0: t66 - 0.2, snap: 0.6, name: 'crown', key: (t) => { const k = ease.inOutQuad(clamp((t - t66) / (tNow - t66))); const yt = rowY(NR - 1); return K([lerp(7, 4, k), yt + lerp(3, 4.5, k), lerp(17, 15, k)], [0, yt + lerp(1.5, 2.2, k), 0], 46, -0.03); } },
      { t0: tNow - 0.04, snap: 0.25, name: 'fall', key: (t) => { const y = this.fallY(t); return K([6.5, y + 3.5, 14], [0.5, y - 0.4, 1.5], 50, 0.06 * Math.sin((t - tNow) * 2)); } },
      { t0: tBase + 0.25, snap: 0.3, name: 'land', key: (t) => { const k = ease.outCubic(clamp((t - tBase - 0.25) / (e - tBase - 0.25))); return K([lerp(4, 2, k), lerp(9, 11, k), lerp(17, 19, k)], [0, 0.4, BZ - 0.5], 46, 0); } },
    ], [...this.climb.map((b) => ({ t: b, amp: 0.6 })), { t: tNow, amp: 2.4 }, { t: tBase + 0.2, amp: 2.0 }], 0.8, 181);
  }

  private camClimb(t: number) {
    let i = 0, last = this.ctx.start;
    for (let k = 0; k < this.climb.length; k++) if (t >= this.climb[k]!) { i = k; last = this.climb[k]!; }
    const prev = rowY(Math.max(0, i - 1)) + RH / 2, cur = rowY(i) + RH / 2;
    return lerp(prev, cur, ease.outExpo(clamp((t - last) / 0.3)));
  }
  /** the singer's plate: from the top slot, down the whole tower to the floor */
  private fallY(t: number) {
    const tNow = this.L67[0]!.start, tBase = this.L67.find((w) => /baseline/.test(w.w))!.start;
    const k = clamp((t - (tNow + 0.15)) / (tBase + 0.2 - tNow - 0.15));
    return lerp(rowY(NR - 1), 0.02, ease.inQuad(k));
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L66 = this.L66, L67 = this.L67;
    const s = this.ctx.start;
    const t66 = L66[0]!, tState = L66.find((w) => /state/.test(w.w))!, tNow = L67[0]!, tBase = L67.find((w) => /baseline/.test(w.w))!;
    const beat = this.beatPulse(t, 0.08);
    const drop = t < t66.start;
    pool(c, W * 0.5, H * 0.4, 1100, '#2A0A1E', 0.55);
    this.grid3(c, floorPl(0), -40, 40, -30, 30, 2, '#2A1028', 1, { alpha: 0.8, fog: [15, 60] });
    // beams sweeping on the drop
    if (drop) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        const x0 = (i - 3.5) * 7, a = Math.sin(t * (0.9 + 0.1 * i) + i) * 0.6;
        const top: V3 = [x0, 40, -14], bot: V3 = [x0 + Math.sin(a) * 30, 0, -2 + Math.cos(a) * 8];
        this.fill3(c, [top, [bot[0] - 2.5, 0, bot[2]], [bot[0] + 2.5, 0, bot[2]]], hexA(i % 2 ? MAG : ROWS[i % NR]![2], 0.05 + 0.08 * beat));
      }
      c.restore();
    }
    // the tower frame
    for (const x of [-RW - 0.6, RW + 0.6]) this.seg(c, [x, 0, -0.6], [x, rowY(NR) + 3, -0.6], hexA(MAG, 0.5), 2);
    // the rows (the top row is the singer: drawn separately once it falls)
    const tSlam = tNow.start + 0.02;
    for (let i = 0; i < NR; i++) {
      const top = i === NR - 1;
      if (top && t >= tSlam) continue;
      const passed = drop && this.climb[i] !== undefined && t >= this.climb[i]!;
      const fl = passed ? hot(t, this.climb[i]!, 0.25) : 0;
      // during the fall, each row lights as the plate passes it
      const fy = t > tSlam ? this.fallY(t) : 99;
      const passing = t > tSlam && fy < rowY(i) + RH && fy > rowY(i) - 2 ? 1 : 0;
      this.row(c, rowY(i), ROWS[i]!, NR - i, top, Math.max(fl, passing * 0.8));
    }
    // the challenger
    if (t > tSlam - 0.4) {
      const y = t < tSlam ? lerp(rowY(NR - 1) + 14, rowY(NR - 1), ease.inQuad(clamp((t - (tSlam - 0.4)) / 0.4))) : rowY(NR - 1) + 0.25 * Math.exp(-(t - tSlam) * 12) * Math.sin((t - tSlam) * 50);
      this.row(c, y, ['? ? ?', '20??', '#FFFFFF'], 1, true, hot(t, tSlam, 0.2));
    }
    // the singer's plate falling, then lying on the baseline
    if (t >= tSlam) {
      const y = this.fallY(t);
      const land = ease.outCubic(clamp((t - (tBase.start + 0.2)) / 0.18));
      const slide = ease.outCubic(clamp((t - (tBase.start + 0.2)) / 0.5));
      const z = lerp(lerp(0.35, 2.4, ease.outCubic(clamp((t - tNow.start) / 0.3))), BZ - 0.6, slide);
      const ang = lerp(0.12 * Math.sin((t - tNow.start) * 6), Math.PI / 2, land);
      const P: Pl = { o: [0, Math.max(0.03, y), z], r: [1, 0, 0], u: [0, Math.cos(ang), -Math.sin(ang)] };
      const grey = clamp((t - tBase.start - 0.4) / 0.6);
      const edge = mixHex(MAG, '#77727F', grey);
      this.rect3(c, P, -RW, 0, 2 * RW, RH, { fill: mixHex('#2A0716', '#16141A', grey), stroke: edge, lw: 2.4 });
      this.text3(c, ROWS[NR - 1]![0], P, -RW + 2.4, RH * 0.5, { size: 0.6, fam: MONOB, color: mixHex('#FFFFFF', '#9A96A3', grey), mid: true });
      this.text3(c, '2017', P, RW - 0.5, RH * 0.5, { size: 0.42, fam: MONO, color: hexA(BONE, 0.7), align: 'right', mid: true });
      // speed lines while falling
      if (land < 1 && t > tNow.start + 0.2) {
        const sl: [V3, V3][] = [];
        for (let j = 0; j < 30; j++) { const x = -RW + (j / 29) * 2 * RW, yy = y + 1.5 + 3 * hash(j, 7); sl.push([[x, yy, z], [x, yy + 2.5 + 2 * hash(j, 8), z]]); }
        this.segs(c, sl, hexA(BONE, 0.35), 1.2);
      }
      if (t > tBase.start + 0.2 && t < tBase.start + 1.2) {
        const dt = t - tBase.start - 0.2;
        for (let j = 0; j < 50; j++) { const x = -RW + (j / 49) * 2 * RW; const up = 2.4 * dt - 3 * dt * dt; this.dot3(c, [x + (hash(j, 1) - 0.5) * dt * 5, Math.max(0.02, up * (0.5 + hash(j, 2))), z + (hash(j, 3) - 0.3) * dt * 5], 0.08, hexA(BONE, clamp(1 - dt / 1))); }
      }
    }
    // the baseline on the floor
    this.glowSeg(c, [-RW - 4, 0.02, BZ], [RW + 4, 0.02, BZ], BONE, 2, 8, 0.8);
    // the flood: magenta out across the floor from the baseline, the moment the plate lands (as in every chorus)
    const tLand = tBase.start + 0.2;
    if (t > tLand) {
      const grow = ease.outExpo(clamp((t - tLand) / 0.25)), back = ease.inOutCubic(clamp((t - (this.ctx.end - 0.6)) / 0.6));
      const half = lerp(0.06, 14, grow) * (1 - back) + 0.06 * back;
      this.rect3(c, floorPl(0.015), -40, -(BZ + half), 80, 2 * half, { fill: U.mag });
      for (let i = 0; i < 2; i++) { const u = clamp((t - tLand - i * 0.12) / 0.8); if (u > 0 && u < 1) this.ring3(c, floorPl(0.02), 0, -(BZ - 0.6), 3 + 26 * u, BONE, 3 * (1 - u), { alpha: 1 - u, n: 64 }); }
    }
    // ------------------------------------------------ lyric type
    const hdr: Pl = { o: [0, rowY(NR) + 1.0, 0.2], r: [1, 0, 0], u: [0, 1, 0] };
    if (!drop && t < tNow.start + 0.4) {
      this.say3(c, L66.slice(0, 2), t, hdr, 0, 2.1, { size: 1.0, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true });
      this.say3(c, L66.slice(L66.indexOf(tState)), t, hdr, 0, 0.3, { size: 1.75, slam: 0.4, fam: WIDE, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, rise: 0.3, glow: 16, glowColor: U.ink, text: (w) => w.w.replace(',', '') });
    }
    if (t > tNow.start - 0.02 && t < tBase.start + 0.3) {
      const y = this.fallY(t);
      this.say3(c, L67.slice(0, L67.length - 1), t, { o: [0, y + RH + 0.8, 2.4], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 1.5, slam: 0.4, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, text: (w) => w.w.replace('’', "'") });
    }
    if (t > tBase.start + 0.15) {
      const k = ease.outBack(clamp((t - tBase.start - 0.15) / 0.3), 1.8);
      this.text3(c, 'BASELINE', { o: [0, 0.03, BZ + 3.6], r: [1, 0, 0], u: [0, 0, -1] }, 0, 0, { size: 3.0 * k, fam: WIDE, color: t > tBase.start + 0.32 && t < this.ctx.end - 0.4 ? U.ink : '#FFFFFF', align: 'center' });
    }
    frameMarks(c, U.ash, { tl: 'BASELINE · THE FALL', tr: drop ? 'HISTORY' : 'SELF-ATTENTION · 2017', bl: '1958 — NOW', br: tc(t), alpha: 0.6 });
    void s; void GOLD;
    return { bloom: drop ? 1.0 : 0.8, bloomThreshold: 0.5, halation: 0.22, ca: 0.3 + (drop ? 1.4 * beat : 0) + 2.6 * hot(t, tSlam, 0.1), grain: 0.05, vignette: 0.34, flash: (drop ? 0.015 * beat : 0) + 0.028 * hot(t, tSlam, 0.08), zoom: 1 + (drop ? 0.02 : 0.008) * beat, split: drop ? 2 * beat : 0 };
  }

  private row(c: Ctx, y: number, r: [string, string, string], rank: number, top: boolean, flash: number) {
    const P: Pl = { o: [0, y, 0.31], r: [1, 0, 0], u: [0, 1, 0] };
    const col = top ? MAG : r[2];
    this.box3(c, [-RW, y, -0.3], [RW, y + RH, 0.3], hexA(col, 0.65 + 0.35 * flash), top ? 2.2 : 1.3, { fill: top ? '#2A0716' : GLASS });
    if (flash > 0.01) { c.save(); c.globalCompositeOperation = 'lighter'; this.rect3(c, P, -RW, 0, 2 * RW, RH, { fill: hexA(col, 0.35 * flash) }); c.restore(); }
    this.text3(c, String(rank).padStart(2, '0'), P, -RW + 0.5, RH * 0.5, { size: 0.82, fam: COND, color: col, mid: true });
    this.text3(c, r[0], P, -RW + 2.4, RH * 0.5, { size: 0.6, fam: MONOB, color: top ? '#FFFFFF' : BONE, mid: true });
    this.text3(c, r[1], P, RW - 0.5, RH * 0.5, { size: 0.5, fam: MONO, color: hexA(BONE, 0.7), align: 'right', mid: true });
    if (top) {
      const C: Pl = { o: [-RW - 1.7, y + RH * 0.5, 0.4], r: [1, 0, 0], u: [0, 1, 0] };
      const pts: V3[] = [at(C, -0.6, -0.4), at(C, 0.6, -0.4), at(C, 0.75, 0.45), at(C, 0.35, 0.05), at(C, 0, 0.6), at(C, -0.35, 0.05), at(C, -0.75, 0.45)];
      this.fill3(c, pts, GOLD, { stroke: '#FFF3C4', lw: 1.5 });
    }
  }
}
