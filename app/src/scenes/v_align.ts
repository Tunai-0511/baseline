// v3 bridge a, L48–L51 ("RLHF trained a reward model to rank, / DPO skipped the middleman and took it to the bank /
// FlashAttention tiles it all inside the SRAM, / no more round trips to the HBM, no traffic jam"): THE PLANT.
//   RLHF  — four answers ride a line under a REWARD MODEL scanner that stamps each with its fitted Bradley–Terry score
//           (data/bt_reward.json: 1.66, 1.13, −0.41, −2.39) and sorts them: C ≻ A ≻ B ≻ D
//   DPO   — a crane lifts the reward model off the line (the middleman); the preference pair goes straight into the
//           policy, and at the bank's counter the partition function Z(x) is struck out of both sides — it cancels
//   Flash — a die seen from above: the 64 × 64 score matrix of a real head in 16 × 16 tiles, carried one by one into
//           the SRAM block and folded into the running (m, ℓ) of the online softmax; S is never written out
//   HBM   — the road to the memory stacks: standard attention's 4,325,376 element trips jam it red; FlashAttention's
//           335,544 (×12.9 fewer, N = 2,048) run green and free
// Style: plant and silicon — steel and safety orange on the line; die green, gold traces, SRAM white.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, vlerp, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BG = '#0B0A0D', STEEL = '#5C5966', ORA = '#EDEAF2', BONE = '#EDEAF2', GOLD = '#C9C5D1', DIE = '#121016', TRACE = '#3A3742', SRAM = '#EDEAF2', RED = '#9A96A3', GRN = '#FF2E7E', MAG = '#FF2E7E';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), COND = F.archivo(75, 900), MONO = F.mono(500), MONOB = F.mono(700), ITAL = F.serif(600, true);
const CHIP: V3 = [46, 0, 0]; // the die's centre (area 2)
const ANS = ['A', 'B', 'C', 'D'];

export default class Align extends VScene {
  private L: Word[][] = [];
  private bt: { scores: number[]; order_best_first: number[] } | null = null;
  private io: { standard: number; flash: number; ratio: number } | null = null;

  override async init() {
    this.bg = BG;
    this.env = { eq: ['bt', 'rlhf', 'dpo', 'flash_m', 'flash_l', 'flash_io'], seed: 13, keep: (_x, z) => Math.abs(z) > 34 }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L = [0, 1, 2, 3].map((k) => ly.lines[i0 + k]!.words);
    try {
      this.bt = await (await fetch('data/bt_reward.json')).json();
      const fl = await (await fetch('data/flash_tiles.json')).json();
      this.io = fl.io_elements[0];
    } catch { /* */ }
    const s = this.ctx.start, e = this.ctx.end;
    const w = (i: number, re: RegExp) => this.L[i]!.find((x) => re.test(x.w))!;
    const tRank = w(0, /rank/).start, t49 = this.L[1]![0]!.start, tBank = w(1, /took/).start, t50 = this.L[2]![0]!.start, tSram = w(2, /SRAM/).start, t51 = this.L[3]![0]!.start, tJam = w(3, /traffic/).start;
    this.rig = new Rig([
      { t0: s, name: 'line', key: (t) => { const k = ease.inOutQuad(clamp((t - s) / (tRank - s))); const b = K([lerp(-4, 1, k), lerp(5.2, 5.8, k), lerp(14, 14.5, k)], [lerp(-1, 2, k), 3.4, 0], 46, 0.02); const ko = 1 - ease.outCubic(clamp((t - s) / 0.4)); return ko > 0 ? { ...b, p: vlerp(b.p, [-11.6, 1.3, 2.4], ko), tg: vlerp(b.tg, [-11.6, 1.3, 0], ko) } : b; } },
      { t0: tRank - 0.05, snap: 0.4, name: 'rank', key: (t) => { const k = ease.outCubic(clamp((t - tRank) / (t49 - tRank))); return K([lerp(8, 10, k), lerp(5.6, 6.2, k), lerp(14, 12.5, k)], [lerp(10, 11, k), 4.8, 0], 46, -0.02); } },
      { t0: t49 - 0.05, snap: 0.5, name: 'crane', key: (t) => { const k = ease.inOutQuad(clamp((t - t49) / (tBank - t49))); return K([lerp(5, 4, k), lerp(7.5, 7.2, k), lerp(19, 18, k)], [lerp(5, 4.5, k), lerp(4.2, 3.6, k), 0], 46, 0.02); } },
      { t0: w(1, /^and$/).start - 0.05, snap: 0.35, name: 'bank', key: (t) => { const k = ease.outCubic(clamp((t - tBank) / (t50 - tBank))); return K([lerp(18, 20, k), lerp(4.6, 5.0, k), lerp(15, 13.5, k)], [21.5, 3.9, -1], 46); } },
      { t0: t50 - 0.05, snap: 0.6, name: 'die', key: (t) => { const k = ease.inOutQuad(clamp((t - t50) / (tSram - t50 + 0.4))); return K([CHIP[0] + lerp(-4, -2, k), lerp(24, 18, k), CHIP[2] + lerp(14, 10, k)], [CHIP[0] + lerp(0, -1, k), 0, CHIP[2] - 0.5], 46, 0); } },
      { t0: t51 - 0.05, snap: 0.45, name: 'road', key: (t) => { const k = ease.inOutQuad(clamp((t - t51) / (e - t51))); return K([CHIP[0] + lerp(14, 18, k), lerp(9, 11, k), CHIP[2] + lerp(13, 15, k)], [CHIP[0] + lerp(12, 14, k), 0, CHIP[2] - 1], 46, -0.02); } },
    ], [{ t: s, amp: 0.6 }, { t: tRank, amp: 0.6 }, { t: w(1, /middleman/).start, amp: 1.2 }, { t: tBank, amp: 0.8 }, { t: t50, amp: 0.8 }, { t: t51, amp: 0.6 }, { t: tJam, amp: 0.9 }], 0.8, 141);
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L = this.L;
    const t49 = L[1]![0]!.start, t50 = L[2]![0]!.start;
    const kick = this.beatPulse(t, 0.08);
    pool(c, W * 0.5, H * 0.5, 1000, t < t50 ? '#2A1A0A' : '#0E2A1C', 0.5);
    this.grid3(c, floorPl(-0.02), -20, 80, -20, 20, 1.5, t < t50 ? '#20262C' : '#123020', 1, { alpha: 0.8, fog: [10, 55] });
    if (t < t50 + 0.6) this.plant(c, t);
    if (t > t50 - 0.8) this.chip(c, t);
    frameMarks(c, U.ash, { tl: t < t49 ? 'BASELINE · THE PLANT · PREFERENCES' : t < t50 ? 'BASELINE · THE PLANT · DIRECT' : 'BASELINE · THE DIE', tr: t < t49 ? 'BRADLEY–TERRY · P(i ≻ j) = σ(rᵢ − rⱼ)' : t < t50 ? 'β = 0.1 · Z(x) CANCELS' : 'SRAM ≈ 19 TB/s · HBM ≈ 1.5 TB/s', bl: '2017 — 2023', br: tc(t), alpha: 0.6 });
    return { bloom: 0.75, bloomThreshold: 0.55, halation: 0.18, ca: 0.3 + 1.4 * hot(t, L[1]!.find((x) => /middleman/.test(x.w))!.start, 0.1), grain: 0.05, vignette: 0.32, zoom: 1 + 0.01 * kick };
  }

  // ------------------------------------------------------------------ RLHF / DPO
  private plant(c: Ctx, t: number) {
    const L48 = this.L[0]!, L49 = this.L[1]!;
    const w48 = (re: RegExp) => L48.find((x) => re.test(x.w))!, w49 = (re: RegExp) => L49.find((x) => re.test(x.w))!;
    const tRLHF = L48[0]!, tReward = w48(/reward/), tRank = w48(/rank/), tDPO = L49[0]!, tSkip = w49(/skipped/), tMid = w49(/middleman/), tTook = w49(/took/), tBank = w49(/bank/);
    const scores = this.bt?.scores ?? [1.13, -0.41, 1.66, -2.39];
    const order = this.bt?.order_best_first ?? [2, 0, 1, 3];
    const P = wallPl(0);
    // the belt
    this.box3(c, [-14, 0.4, -1.2], [16, 0.8, 1.2], STEEL, 1.2, { fill: '#15191D' });
    const rollers: [V3, V3][] = [];
    for (let x = -14; x <= 16; x += 0.8) rollers.push([[x - ((t * 2) % 0.8), 0.81, -1.2], [x - ((t * 2) % 0.8), 0.81, 1.2]]);
    this.segs(c, rollers, hexA(STEEL, 0.6), 1);
    // the reward-model scanner (lifted away during DPO)
    const lift = ease.inOutCubic(clamp((t - (tMid.start - 0.1)) / 0.7));
    // (straight up: drawn off to the left it rose through DPO)
    const sx = 0, sy = 3.0 + lift * 9, sxo = 0;
    if (lift < 1) {
      this.box3(c, [sx + sxo - 1.8, sy, -1.4], [sx + sxo + 1.8, sy + 2.2, 1.4], ORA, 1.8, { fill: '#2A1606' });
      this.text3(c, 'REWARD', { o: [sx + sxo, sy + 1.5, 1.41], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.5, fam: WIDE, color: BONE, align: 'center', mid: true });
      this.text3(c, 'MODEL', { o: [sx + sxo, sy + 0.8, 1.41], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.5, fam: WIDE, color: BONE, align: 'center', mid: true });
      if (lift > 0) {
        // the crane's cable and hook
        this.seg(c, [sx + sxo, sy + 2.2, 0], [sx + sxo, 16, 0], STEEL, 2);
        this.text3(c, 'MIDDLEMAN', { o: [sx + sxo, sy + 2.8, 0.5], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.55, fam: MONOB, color: ORA, align: 'center' });
      }
      // scan beam
      if (lift < 0.2) this.fill3(c, [[sx - 0.4, sy, 0], [sx + 0.4, sy, 0], [sx + 1.2, 0.85, 0], [sx - 1.2, 0.85, 0]], hexA(ORA, 0.12 + 0.2 * Math.abs(Math.sin(t * 6))));
    }
    // the four answers ride left → right, get scored under the scanner, then sort into a ranked stack on the right
    const tIn = tRLHF.start - 0.2, tSort = tRank.start;
    ANS.forEach((a, i) => {
      const xIn = lerp(-13 + i * 3.1, 1.5 + i * 3.1, ease.inOutQuad(clamp((t - tIn) / (tSort - tIn - 0.1))));
      const scored = xIn > -0.6;
      const rank = order.indexOf(i);
      const kS = ease.inOutCubic(clamp((t - tSort) / 0.6));
      const x = lerp(xIn, 11, kS), y = lerp(0.8, 0.8 + (3 - rank) * 1.95, kS), z = 0;
      const fade = 1 - clamp((t - tDPO.start - 0.6) / 0.6) * 0.75;
      const best = rank === 0 && kS > 0.5;
      const card: Pl = { o: [x, y, z + 0.91], r: [1, 0, 0], u: [0, 1, 0] };
      this.box3(c, [x - 1.35, y, z - 0.7], [x + 1.35, y + 1.75, z + 0.9], hexA(best ? MAG : BONE, fade), best ? 2.2 : 1.4, { fill: hexA(best ? U.magDark : '#16141B', fade) });
      this.text3(c, a, card, -0.82, 0.88, { size: 1.1, fam: WIDE, color: hexA(best ? MAG : BONE, fade), align: 'center', mid: true });
      this.text3(c, 'ANSWER', card, -0.15, 1.3, { size: 0.24, fam: MONOB, color: hexA(U.ash, fade), mid: true });
      if (scored) {
        const pop = ease.outBack(clamp((xIn + 0.6) / 1.2), 2);
        this.text3(c, `${scores[i]! >= 0 ? '+' : ''}${scores[i]!.toFixed(2)}`, card, -0.15, 0.62, { size: 0.42 * pop, fam: MONOB, color: hexA(scores[i]! > 0 ? BONE : U.ash, fade), mid: true });
      }
      if (kS > 0.6) this.text3(c, `#${rank + 1}`, { o: [x + 1.9, y + 0.88, z], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.9, fam: COND, color: hexA(rank === 0 ? MAG : BONE, fade), mid: true, glow: rank === 0 ? 12 : 0, glowColor: MAG });
    });
    if (t > tRank.start) this.text3(c, 'C ≻ A ≻ B ≻ D', { o: [11, 9.3, 0], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.8, fam: MONOB, color: BONE, align: 'center', alpha: 1 - clamp((t - tDPO.start - 0.3) / 0.4) });
    // DPO: the direct pipe from the preference pair into the policy; the bank counter with Z(x) cancelling
    if (t > tSkip.start - 0.2) {
      const a = clamp((t - tSkip.start + 0.2) / 0.4);
      this.glowSeg(c, [-6, 1.5, 0], [17, 1.5, 0], GRN, 2.4, 10, a);
      this.box3(c, [17, 0.4, -1.4], [21, 3.2, 1.4], hexA(GRN, a), 1.8, { fill: hexA('#0A2016', a) });
      this.text3(c, 'π_θ', { o: [19, 1.8, 1.41], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.9, fam: ITAL, color: hexA(BONE, a), align: 'center', mid: true });
      this.text3(c, 'y_w ≻ y_l', { o: [-4, 2.2, 0], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 0.5, fam: MONOB, color: hexA(GRN, a), align: 'center' });
    }
    if (t > tTook.start - 0.3) {
      const a = clamp((t - tTook.start + 0.3) / 0.4);
      const BP: Pl = { o: [21.5, 0.4, -1.6], r: [1, 0, 0], u: [0, 1, 0] };
      // the vault door
      this.ring3(c, BP, 0, 3.2, 2.6, hexA(GOLD, a), 3, { fill: hexA('#1E1608', 0.95 * a), n: 60 });
      for (let i = 0; i < 6; i++) { const an = (i / 6) * Math.PI * 2 + (t - tTook.start) * 1.5; this.seg(c, at(BP, Math.cos(an) * 0.5, 3.2 + Math.sin(an) * 0.5, 0.02), at(BP, Math.cos(an) * 1.9, 3.2 + Math.sin(an) * 1.9, 0.02), hexA(GOLD, a), 2); }
      // the cancellation, written on the counter: r = β log(π/π_ref) + β log Z(x)  →  Z cancels in r_w − r_l
      const CP: Pl = { o: [21.5, 6.6, -1.5], r: [1, 0, 0], u: [0, 1, 0] };
      const cut = clamp((t - tBank.start + 0.05) / 0.25);
      this.text3(c, 'r_w − r_l = β log π(y_w)/π_ref − β log π(y_l)/π_ref', CP, 0, 0, { size: 0.36, fam: MONOB, color: hexA(BONE, a), align: 'center' });
      this.text3(c, '+ β log Z(x) − β log Z(x)', CP, 0, -0.65, { size: 0.36, fam: MONOB, color: hexA(GOLD, a), align: 'center' });
      if (cut > 0) this.seg(c, at(CP, -3.0, -0.52, 0.02), at(CP, lerp(-3.0, 3.0, cut), -0.52, 0.02), RED, 3);
      if (cut >= 1) this.text3(c, 'Z(x) CANCELS', CP, 0, -1.5, { size: 0.55, fam: WIDE, color: GOLD, align: 'center', glow: 10, glowColor: GOLD });
    }
    // lyric type
    const top: Pl = { o: [2, 6.6, -0.5], r: [1, 0, 0], u: [0, 1, 0] };
    if (t < tDPO.start - 0.05) {
      const k = ease.outBack(clamp((t - tRLHF.start) / 0.25), 1.6);
      this.text3(c, 'RLHF', top, -5.2, 0, { size: 2.2 * k, fam: WIDE, color: t < tRLHF.end ? U.mag : BONE, align: 'center', glow: 12, glowColor: U.ink });
      this.chunk3(c, L48.slice(1), t, top, 4.6, 0.2, { size: 1.35, maxW: 10, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 2, 4] });
    } else {
      const k = ease.outBack(clamp((t - tDPO.start) / 0.25), 1.6);
      this.text3(c, 'DPO', top, -7.2, 0, { size: 2.2 * k, fam: WIDE, color: t < tDPO.end ? U.mag : BONE, align: 'center', glow: 12, glowColor: U.ink, alpha: 1 - clamp((t - tTook.start) / 0.3) });
      c.save(); c.globalAlpha *= 1 - clamp((t - tTook.start) / 0.3); this.chunk3(c, [tSkip, w49(/^the$/), tMid], t, top, 4.6, 0.2, { size: 1.35, maxW: 10, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 2] }); c.restore();
      if (t > tTook.start - 0.05) this.say3(c, L49.slice(L49.indexOf(w49(/^and$/))), t, { o: [21.5, 8.1, -1.5], r: [1, 0, 0], u: [0, 1, 0] }, 0, 0, { size: 1.15, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true });
    }
    void tReward;
  }

  // ------------------------------------------------------------------ FlashAttention / HBM
  private chip(c: Ctx, t: number) {
    const L50 = this.L[2]!, L51 = this.L[3]!;
    const w50 = (re: RegExp) => L50.find((x) => re.test(x.w))!, w51 = (re: RegExp) => L51.find((x) => re.test(x.w))!;
    const tFlash = L50[0]!, tTiles = w50(/tiles/), tSram = w50(/SRAM/), t51 = L51[0]!, tHBM = w51(/HBM/), tNo2 = L51.filter((x) => /^no$/.test(x.w))[1] ?? L51[0]!, tTraffic = w51(/traffic/), tJam = w51(/jam/);
    const G = floorPl(0.02, [CHIP[0], 0.02, CHIP[2]]);
    // the die and its traces
    this.rect3(c, G, -8, -8, 16, 16, { fill: DIE, stroke: GOLD, lw: 2 });
    const tr: [V3, V3][] = [];
    for (let i = 0; i < 26; i++) { const y = -7.5 + i * 0.6; tr.push([at(G, -7.6, y), at(G, -7.6 + 2 + 3 * hash(i, 1), y)]); tr.push([at(G, 7.6, y), at(G, 7.6 - 2 - 3 * hash(i, 2), y)]); }
    this.segs(c, tr, hexA(TRACE, 0.6), 1.2);
    // the SRAM block (on-chip, small, fast)
    this.rect3(c, G, -2.0, -6.8, 4.0, 2.6, { fill: '#1E2A30', stroke: SRAM, lw: 2 });
    this.text3(c, 'SRAM · ON-CHIP', G, 0, -7.4, { size: 0.36, fam: MONOB, color: SRAM, align: 'center' });
    // the score matrix S as 4 × 4 tiles (causal: tiles above the diagonal are never touched)
    const T = 4, ts = 2.4, ox = -T * ts / 2, oy = -1.0;
    const nTiles = 10; // causal tiles (i ≥ j)
    const prog = clamp((t - tTiles.start) / (tSram.end - tTiles.start + 0.6));
    const done = Math.floor(prog * nTiles);
    let k = 0;
    for (let i = 0; i < T; i++) for (let j = 0; j <= i; j++) {
      const x = ox + j * ts, y = oy + (T - 1 - i) * ts;
      const state = k < done ? 2 : k === done ? 1 : 0;
      const col = state === 2 ? hexA(GRN, 0.55) : state === 1 ? hexA(SRAM, 0.9) : hexA('#2A3A30', 0.9);
      this.rect3(c, G, x + 0.08, y + 0.08, ts - 0.16, ts - 0.16, { fill: col, stroke: hexA(GOLD, 0.5), lw: 1 });
      if (state === 1) {
        // the tile being processed rides into the SRAM: a ghost of it inside the block
        this.rect3(c, G, -1.0, -6.4, 2.0, 1.8, { fill: hexA(SRAM, 0.5 + 0.3 * Math.sin(t * 20)) });
        this.seg(c, at(G, x + ts / 2, y + ts / 2, 0.05), at(G, 0, -5.5, 0.05), SRAM, 2);
      }
      k++;
    }
    for (let i = 0; i < T; i++) for (let j = i + 1; j < T; j++) this.rect3(c, G, ox + j * ts + 0.08, oy + (T - 1 - i) * ts + 0.08, ts - 0.16, ts - 0.16, { stroke: hexA(STEEL, 0.4), lw: 1, dash: [4, 4] });
    this.text3(c, 'S = QKᵀ · 64 × 64 · TILES 16 × 16', G, ox, oy + T * ts + 0.4, { size: 0.36, fam: MONOB, color: GOLD });
    this.text3(c, `ONLINE SOFTMAX (m, ℓ) · TILE ${Math.min(nTiles, done + 1)}/${nTiles}`, G, ox, oy - 0.7, { size: 0.32, fam: MONO, color: hexA(BONE, 0.8) });
    if (t > tSram.start) this.text3(c, 'S NEVER WRITTEN TO HBM · EXACT', G, 0, 7.2, { size: 0.42, fam: MONOB, color: GRN, align: 'center' });
    // HBM stacks and the road
    const HB: V3 = [CHIP[0] + 15, 0, CHIP[2]];
    for (let s = 0; s < 4; s++) this.box3(c, [HB[0] - 1.6 + (s % 2) * 3.4, 0, HB[2] - 4 + Math.floor(s / 2) * 4.4], [HB[0] + 1.2 + (s % 2) * 3.4, 2.4, HB[2] - 0.8 + Math.floor(s / 2) * 4.4], STEEL, 1.4, { fill: '#1A1F24' });
    this.text3(c, 'HBM', floorPl(2.45, [HB[0], 2.45, HB[2]]), 1.6, -0.0, { size: 1.0, fam: WIDE, color: BONE, align: 'center' });
    // the road: lanes between the die's edge and the HBM
    const r0: V3 = [CHIP[0] + 8, 0.03, CHIP[2]], r1: V3 = [HB[0] - 1.8, 0.03, HB[2]];
    for (const dz of [-1.0, 1.0]) this.seg(c, [r0[0], 0.03, dz], [r1[0], 0.03, dz], hexA(BONE, 0.5), 1.4);
    // packets: before "no traffic jam" a jam of red tail-lights crawling; after, sparse green runs
    const free = t > tTraffic.start - 0.05;
    const jam = t > t51.start - 0.3 && !free;
    const nP = free ? 6 : 36;
    for (let i = 0; i < nP; i++) {
      const lane = i % 2 ? -0.5 : 0.5;
      const speed = free ? 9 : 0.6;
      const u = ((i / nP) + (t * speed) / 7 * (i % 2 ? -1 : 1)) % 1;
      const x = lerp(r0[0], r1[0], (u + 1) % 1);
      const y = 0.25;
      const col = free ? GRN : RED;
      this.box3(c, [x - 0.25, 0.05, lane - 0.22], [x + 0.25, y + 0.2, lane + 0.22], col, 1.2, { fill: hexA(col, jam || free ? 0.5 : 0.2) });
    }
    if (this.io) {
      // the count, painted on the floor in front of the road (standing over it, it sat inside NO TRAFFIC JAM)
      const sign = floorPl(0.03, [CHIP[0] + 10.4, 0.03, CHIP[2] + 2.7]);
      this.text3(c, free ? `FLASH  ${this.io.flash.toLocaleString('en-US')} ELEMENTS` : `STANDARD  ${this.io.standard.toLocaleString('en-US')} ELEMENTS`, sign, 0, 0, { size: 0.55, fam: MONOB, color: free ? GRN : RED, align: 'center' });
      if (free) this.text3(c, `×${this.io.ratio.toFixed(1)} FEWER ROUND TRIPS · N = 2,048`, sign, 0, -0.8, { size: 0.42, fam: MONO, color: hexA(BONE, 0.8), align: 'center' });
    }
    // lyric type
    // the die's own markings: FLASHATTENTION along its top edge, the rest of the line along the bottom
    const P: Pl = this.readable({ o: [CHIP[0], 0.04, CHIP[2] - 5.6], r: [1, 0, 0], u: [0, 0, -1] });
    if (t < t51.start - 0.05) {
      const k = ease.outBack(clamp((t - tFlash.start) / 0.25), 1.6);
      // (over the top row of tiles, clear of the S = QKᵀ line past the grid's far edge)
      this.text3(c, 'FLASHATTENTION', P, 0, 1.15, { size: 1.6 * k, fam: WIDE, color: t < tFlash.end ? U.mag : SRAM, align: 'center', glow: 14, glowColor: U.ink });
      this.chunk3(c, L50.slice(1), t, P, 0, -11.4, { size: 1.3, maxW: 14, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 3] });
    } else {
      const RP = this.readable({ o: [CHIP[0] + 12, 3.9, CHIP[2] - 3.5], r: [1, 0, 0], u: [0, 1, 0] });
      this.chunk3(c, L51.slice(0, L51.indexOf(tNo2)), t, RP, 0, 0.2, { size: 1.25, maxW: 12, slam: 0.4, glow: 16, glowColor: U.ink, breaks: [0, 4] });
      if (t > tNo2.start - 0.05) {
        const k = ease.outBack(clamp((t - tNo2.start) / 0.25), 1.6);
        this.say3(c, [tNo2, tTraffic, tJam], t, RP, 0, -1.5, { size: 1.6 * k, fam: WIDE, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, glow: 12, glowColor: U.ink, slam: 0.4 });
      }
    }
    void tHBM; void vlerp; void W; void H; void mixHex;
  }
}
