// v3 chorus1 tail, L14–L15 ("Kernel tricks and hand-made features frozen on the shelf, / the network took the crown
// and learned the features by itself"): COLD STORAGE. A shelf in a cold room: in each cubby, an old method set in a
// block of ice — the RBF and polynomial kernels as their curves, SIFT's keypoint, HOG's star, Haar's boxes, a Gabor
// patch, an LBP code, a bag-of-words histogram, a colour histogram, a SURF blob — each tagged. Frost grows across the
// glass while FROZEN is sung. Then the crown lifts off the shelf and flies to a network standing beside it; the camera
// passes through its layers as they fill with what it learned on its own: edges (the real conv1 filters), textures,
// parts, and the class it outputs. BY ITSELF.
// Style: cold storage — ice blue and frost white on deep teal; the crown and the network warm (gold, magenta).
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, vlerp, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { hash } from '../engine/util';

const BG = '#0B0A0D', ICE = '#C9C5D1', FROST = '#EDEAF2', DEEP = '#141219', GOLD = '#FF2E7E', MAG = '#FF2E7E', BONE = '#EDEAF2';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), MONO = F.mono(500), MONOB = F.mono(700);
const CW = 3.2, CH = 2.6, NC = 5, NR = 2; // cubby size, columns, rows
const X0 = -(NC * CW) / 2, Y0 = 0.4;
const ITEMS: { tag: string; kind: string; kernel?: boolean }[] = [
  { tag: 'RBF KERNEL', kind: 'rbf', kernel: true }, { tag: 'POLY KERNEL', kind: 'poly', kernel: true }, { tag: 'SIFT', kind: 'sift' }, { tag: 'HOG', kind: 'hog' }, { tag: 'HAAR', kind: 'haar' },
  { tag: 'GABOR', kind: 'gabor' }, { tag: 'LBP', kind: 'lbp' }, { tag: 'BAG OF WORDS', kind: 'bow' }, { tag: 'COLOR HIST', kind: 'hist' }, { tag: 'SURF', kind: 'surf' },
];
const NET = { x: 15.5, layers: 4, gap: 2.8, s: 4.2 }; // network: layer planes stepping back in z

export default class Shelf extends VScene {
  private L14!: Word[]; private L15!: Word[];
  private seq: ImageBitmap | null = null;

  override async init() {
    this.bg = BG;
    this.env = { eq: ['kerneltrick', 'rbf', 'hog', 'convlayer', 'backprop', 'sgd'], seed: 6 }; // the city round the plate: walls of this plate's formulas (2026-10-10)
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L14 = ly.lines[i0]!.words; this.L15 = ly.lines[i0 + 1]!.words;
    try { this.seq = await createImageBitmap(await (await fetch('data/conv1_seq.png')).blob()); } catch { /* */ }
    const w14 = (re: RegExp) => this.L14.find((x) => re.test(x.w))!, w15 = (re: RegExp) => this.L15.find((x) => re.test(x.w))!;
    const s = this.ctx.start, e = this.ctx.end;
    const tFrozen = w14(/frozen/).start, tShelf = w14(/shelf/).start, tNet = this.L15[0]!.start, tCrown = w15(/crown/).start, tLearn = w15(/learned/).start, tBy = w15(/^by$/).start;
    this.rig = new Rig([
      // (the whole shelf in frame, drifting in: dollying along it close, the lines in front of it ran off both edges)
      { t0: s, name: 'dolly', key: (t) => { const k = ease.inOutQuad(clamp((t - s) / (tFrozen - s))); return K([lerp(-2.2, 2.2, k), lerp(5.6, 5.1, k), lerp(17.5, 15.8, k)], [lerp(-0.5, 0.5, k), 3.3, 0], 44, 0.03); } },
      { t0: tFrozen - 0.05, snap: 0.5, name: 'frost', key: (t) => { const k = ease.inOutCubic(clamp((t - tFrozen) / (tNet - tFrozen))); return K([lerp(1.5, 0, k), lerp(4.6, 4.2, k), lerp(16.5, 18.5, k)], [0, 2.9, 0], 44); } },
      { t0: tNet - 0.05, snap: 0.6, name: 'crown', key: (t) => { const k = ease.inOutCubic(clamp((t - tNet) / (tLearn - tNet))); return K([lerp(6.5, 10.5, k), lerp(6.2, 5.6, k), lerp(20, 16.5, k)], [lerp(7.0, 12.0, k), 4.4, -2], 46, -0.02); } },
      { t0: tLearn - 0.05, snap: 0.45, name: 'layers', key: (t) => { const k = ease.inOutQuad(clamp((t - tLearn) / (tBy - tLearn))); const z = lerp(0, -NET.gap * 3, k); return K([NET.x + 6.5, 5.4, z + 7.6], [NET.x + 0.2, 4.3, z - 0.8], 44, -0.03); } },
      { t0: tBy - 0.05, snap: 0.4, name: 'itself', key: (t) => { const k = ease.outCubic(clamp((t - tBy) / (e - tBy))); return K([NET.x - lerp(3.5, 5, k), lerp(5.2, 6.0, k), lerp(10.5, 13, k)], [NET.x + 0.6, 2.6, -NET.gap * 1.5], 46, 0.02); } },
    ], [{ t: tFrozen, amp: 0.6 }, { t: tCrown, amp: 0.8 }, { t: tBy, amp: 1.0 }], 0.8, 71);
    void tShelf;
  }

  /** the crown: on top of the shelf's middle until "crown", then an arc to the network's top */
  crownPos(t: number): V3 {
    const tCrown = this.L15.find((x) => /crown/.test(x.w))!.start;
    const a: V3 = [0, Y0 + NR * CH + 0.9, 0], b: V3 = [NET.x, NET.s + 2.4, -NET.gap * 1.5];
    const k = ease.inOutCubic(clamp((t - (tCrown - 0.35)) / 0.95));
    const p = vlerp(a, b, k);
    return [p[0], p[1] + Math.sin(Math.PI * k) * 5, p[2]];
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L14 = this.L14, L15 = this.L15;
    const w14 = (re: RegExp) => L14.find((x) => re.test(x.w))!, w15 = (re: RegExp) => L15.find((x) => re.test(x.w))!;
    const tKer = L14[0]!, tHand = w14(/hand-made/), tFrozen = w14(/frozen/), tOn = w14(/^on$/), tShelf = w14(/shelf/);
    const tNet = L15[0]!, tCrown = w15(/crown/), tLearn = w15(/learned/), tBy = w15(/^by$/), tItself = w15(/itself/);
    const frost = ease.inOutQuad(clamp((t - tFrozen.start) / 0.9));
    const kick = this.beatPulse(t, 0.08);
    // ------------------------------------------------ the cold room
    pool(c, W * 0.42, H * 0.45, 1000, '#0E4A66', 0.45);
    this.grid3(c, floorPl(-0.02), -30, 40, -12, 14, 1.2, '#0E3A50', 1, { alpha: 0.8, fog: [10, 45] });
    // frost breath: slow drifting specks
    for (let i = 0; i < 70; i++) {
      const x = -14 + 30 * hash(i, 1) + Math.sin(t * 0.3 + i) * 0.6, y = 0.3 + 7 * hash(i, 2) + ((t * 0.25 + hash(i, 3)) % 1) * 0.8, z = -3 + 9 * hash(i, 4);
      this.dot3(c, [x, y, z], 0.03 + 0.03 * hash(i, 5), hexA(FROST, 0.35));
    }
    // ------------------------------------------------ the shelf
    const back = wallPl(-1.1);
    this.rect3(c, back, X0 - 0.3, Y0 - 0.3, NC * CW + 0.6, NR * CH + 0.6, { fill: '#061C27', stroke: hexA(ICE, 0.5), lw: 1.4 });
    for (let r = 0; r < NR; r++) for (let q = 0; q < NC; q++) {
      const idx = r * NC + q, it = ITEMS[idx]!;
      const x = X0 + q * CW, y = Y0 + (NR - 1 - r) * CH;
      // cubby frame (box)
      this.box3(c, [x, y, -1.1], [x + CW, y + CH, 1.0], hexA(ICE, 0.45), 1.1);
      // the artifact on the cubby's back
      const P: Pl = wallPl(-0.6, [x + CW / 2, y + CH / 2 + 0.15, -0.6]);
      const lit = it.kernel ? hot(t, tKer.start + 0.15 * q, 0.5) : hot(t, tHand.start + 0.09 * idx, 0.5);
      this.artifact(c, P, it.kind, mixHex(ICE, '#FFFFFF', lit));
      // the ice block in front of it
      const ib: [V3, V3] = [[x + 0.25, y + 0.15, -0.9], [x + CW - 0.25, y + CH - 0.35, 0.75]];
      this.box3(c, ib[0], ib[1], hexA(FROST, 0.55 + 0.3 * frost), 1.2, { fill: hexA('#BFEFFF', 0.1 + 0.18 * frost) });
      // frost: dendrites spreading over the block's front face
      if (frost > 0) this.dendrites(c, wallPl(0.76, [x + CW / 2, y + CH / 2 - 0.1, 0.76]), CW - 0.5, CH - 0.5, frost, idx);
      // the tag on the shelf's front edge: the top row's at the top of the cubby, the bottom row's at the foot, so the two
      // lyric lines set in front of the shelf run between them (they used to run through the tags)
      const tagP: Pl = wallPl(1.02, [x + CW / 2, r === 0 ? y + CH - 0.44 : y + 0.05, 1.02]);
      const tagLit = it.kernel ? t >= tKer.start : t >= tHand.start + 0.09 * (idx - 2);
      this.rect3(c, tagP, -1.35, -0.02, 2.7, 0.42, { fill: hexA(tagLit ? '#123E52' : '#0A2633', 0.95), stroke: hexA(ICE, tagLit ? 0.9 : 0.3), lw: 1 });
      // (the names frost over with the shelf: FROZEN is written across them)
      const tagA = (tagLit ? 1 : 0.35) * (1 - clamp((t - (tFrozen.start - 0.1)) / 0.25));
      if (tagA > 0.02) this.text3(c, it.tag, tagP, 0, 0.19, { size: 0.26, fam: MONOB, color: hexA(BONE, tagA), align: 'center', mid: true });
    }
    // the crown: resting on top of the shelf, then off to the network
    const cp = this.crownPos(t);
    this.crown(c, cp, 1.0, t);
    if (t < tCrown.start - 0.3) this.text3(c, 'PREVIOUS OWNER: KERNEL SVM', wallPl(0.5), 0, Y0 + NR * CH + 0.15, { size: 0.24, fam: MONO, color: hexA(GOLD, 0.8), align: 'center' });
    // ------------------------------------------------ the network
    if (t > tNet.start - 0.6) this.network(c, t, tLearn.start, tBy.start);
    // ------------------------------------------------ lyric type
    const top: Pl = wallPl(1.1);
    // KERNEL TRICKS AND / HAND-MADE FEATURES set in front of the shelf, each low in its row under the row's tags; at
    // "frozen" they ice over and sink away (quickly: FROZEN starts writing over them)
    {
      const fz = clamp((t - (tFrozen.start - 0.06)) / 0.2);
      const front: Pl = wallPl(1.6);
      const col = (cur: string) => mixHex(cur, FROST, fz);
      this.say3(c, L14.slice(0, 3), t, front, 0, Y0 + CH + 0.65 - 0.6 * fz, { size: 1.2, slam: 0.35, fam: HEAVY, up: '', cur: col(U.mag), done: col(BONE), align: 'center', upper: true, rise: 0.25, alpha: 1 - fz, glow: 12, glowColor: '#000000' });
      this.say3(c, [tHand, w14(/features/)], t, front, 0, Y0 + 1.2 - 0.6 * fz, { size: 1.2, slam: 0.35, fam: HEAVY, up: '', cur: col(U.mag), done: col(BONE), align: 'center', upper: true, rise: 0.25, alpha: 1 - fz, glow: 12, glowColor: '#000000' });
    }
    // FROZEN across the glass, frosted; ON THE SHELF under it
    if (t > tFrozen.start - 0.02) {
      const fk = clamp((t - tFrozen.start) / (tFrozen.end - tFrozen.start));
      const P: Pl = wallPl(1.4);
      this.text3(c, 'FROZEN', P, 0, Y0 + 0.8, { size: 3.0, fam: WIDE, align: 'center', glow: 22, glowColor: U.ink, alpha: 1 - 0.75 * clamp((t - tNet.start) / 0.5), each: (i, _ch, n) => ((i + 0.5) / n <= fk * 1.4 + 0.05 ? { color: t < tFrozen.end ? U.mag : FROST } : null) });
      if (t > tOn.start - 0.02) this.say3(c, [tOn, w14(/^the$/), tShelf], t, wallPl(1.5), 0, Y0 - 1.4, { size: 1.1, slam: 0.3, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, alpha: 1 - clamp((t - tNet.start) / 0.5) });
    }
    // THE NETWORK TOOK / THE CROWN over the network; AND LEARNED THE FEATURES through the layers; BY ITSELF
    if (t > tNet.start - 0.02) {
      const NP: Pl = wallPl(1.8, [NET.x, 0, 1.8]);
      const i0 = 0, i1 = L15.indexOf(tCrown) + 1;
      // (gone as AND is sung: AND LEARNED comes up through the layers, and the two would stack on screen)
      const tAnd0 = w15(/^and$/).start;
      this.say3(c, L15.slice(i0, i1), t, NP, 0, NET.s + 4.6, { size: 1.3, slam: 0.35, fam: HEAVY, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, maxW: 11, rise: 0.25, alpha: 1 - clamp((t - tAnd0 + 0.12) / 0.12) });
    }
    const tAndL = w15(/^and$/);
    if (t > tAndL.start - 0.02 && t < tBy.start + 0.1) {
      // AND LEARNED on the first layer, THE FEATURES on the third, each sung word by word; one pair at a time (seen
      // at an angle, the layers' words used to stack over each other; one word at a time, THE flashed for 0.1 s)
      const ws = L15.slice(L15.indexOf(tAndL), L15.indexOf(tBy));
      const iThe = ws.findIndex((x) => /^the$/i.test(x.w));
      const groups: [Word[], number][] = [[ws.slice(0, iThe), 0], [ws.slice(iThe), 2]];
      groups.forEach(([g, li], gi) => {
        if (!g.length || t < g[0]!.start - 0.02) return;
        const next = groups[gi + 1]?.[0][0];
        const a = (next ? 1 - clamp((t - (next.start - 0.06)) / 0.06) : 1) * (1 - clamp((t - (tBy.start - 0.06)) / 0.08));
        if (a <= 0) return;
        const z = -NET.gap * li + 0.05;
        const P: Pl = wallPl(z, [NET.x, NET.s + 1.0, z]);
        this.say3(c, g, t, P, 0, 0, { size: 1.25, fam: HEAVY, up: '', cur: GOLD, done: BONE, align: 'center', upper: true, slam: 0.35, alpha: a, glow: 14, glowColor: '#000000' });
      });
    }
    if (t > tBy.start - 0.02) {
      // (slammed in at full size over the network: grown from nothing at its foot, BY was too small to read)
      const k = 1 + 0.45 * Math.pow(1 - clamp((t - tBy.start) / 0.18), 3);
      const P: Pl = wallPl(2.6, [NET.x + 0.5, 0, 2.6]);
      this.text3(c, 'BY ITSELF', P, 0, NET.s + 0.2, { size: 1.7 * k, fam: WIDE, color: t < tItself.end ? U.mag : '#FFFFFF', align: 'center', glow: 20, glowColor: U.ink, each: (i) => (i < 2 || t >= tItself.start ? {} : null) });
    }
    frameMarks(c, U.ash, { tl: 'BASELINE · COLD STORAGE', tr: t < tNet.start ? 'FEATURES: DESIGNED' : 'FEATURES: LEARNED', bl: '2012', br: tc(t), alpha: 0.6 });
    return { bloom: 0.75, bloomThreshold: 0.55, halation: 0.2, ca: 0.3 + 1.5 * hot(t, tBy.start, 0.1), grain: 0.05, vignette: 0.32, zoom: 1 + 0.01 * kick };
  }

  private artifact(c: Ctx, P: Pl, kind: string, col: string) {
    const s = 0.75;
    const line = (pts: [number, number][], lw = 2) => this.pl3(c, pts.map(([x, y]) => at(P, x * s, y * s)), col, lw);
    if (kind === 'rbf') { const pts: [number, number][] = []; for (let i = 0; i <= 40; i++) { const x = -1.3 + (2.6 * i) / 40; pts.push([x, -0.7 + 1.5 * Math.exp(-x * x * 2.2)]); } line(pts, 2.4); }
    else if (kind === 'poly') { const pts: [number, number][] = []; for (let i = 0; i <= 40; i++) { const x = -1.2 + (2.4 * i) / 40; pts.push([x, -0.6 + 0.55 * Math.pow(x + 0.2, 3) + 0.3 * x * x]); } line(pts.map(([x, y]) => [x, Math.max(-0.75, Math.min(0.9, y))]), 2.4); }
    else if (kind === 'sift') { this.ring3(c, P, 0, 0.05, 0.6, col, 2); this.seg(c, at(P, 0, 0.05), at(P, 0.45, 0.45), col, 2); for (let i = 0; i < 4; i++) this.ring3(c, P, -1 + i * 0.66, -0.7, 0.12, col, 1.2); }
    else if (kind === 'hog') { for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI; const L = 0.3 + 0.45 * Math.abs(Math.sin(i * 1.7)); this.seg(c, at(P, -Math.cos(a) * L, -Math.sin(a) * L), at(P, Math.cos(a) * L, Math.sin(a) * L), col, 2); } }
    else if (kind === 'haar') { this.rect3(c, P, -1.0, -0.6, 1.0, 1.2, { fill: hexA(col, 0.9) }); this.rect3(c, P, 0, -0.6, 1.0, 1.2, { stroke: col, lw: 2 }); }
    else if (kind === 'gabor') { for (let i = -5; i <= 5; i++) { const a = Math.exp(-(i * i) / 12); this.seg(c, at(P, i * 0.17 - 0.3, -0.7), at(P, i * 0.17 + 0.3, 0.7), hexA(col, a), 2.6); } }
    else if (kind === 'lbp') { const bits = [1, 0, 1, 1, 0, 0, 1, 0]; const pos: [number, number][] = [[-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0]]; pos.forEach(([x, y], i) => this.rect3(c, P, x * 0.45 - 0.2, y * 0.45 - 0.2, 0.4, 0.4, bits[i] ? { fill: hexA(col, 0.9) } : { stroke: col, lw: 1.4 })); }
    else if (kind === 'bow' || kind === 'hist') { for (let i = 0; i < 8; i++) { const h = 0.2 + 1.2 * Math.abs(Math.sin(i * (kind === 'bow' ? 2.1 : 1.3) + 0.5)); this.rect3(c, P, -1.1 + i * 0.28, -0.7, 0.2, h, kind === 'hist' ? { fill: hexA(['#FF6A6A', '#FFC56A', '#C8FF6A', '#6AFFB2', '#6AD9FF', '#8B6AFF', '#FF6AE0', '#FF6A9B'][i]!, 0.85) } : { fill: hexA(col, 0.85) }); } }
    else if (kind === 'surf') { for (let i = 0; i < 3; i++) this.ring3(c, P, 0, 0, 0.25 + i * 0.25, hexA(col, 1 - i * 0.25), 2); this.rect3(c, P, -0.75, -0.75, 1.5, 1.5, { stroke: hexA(col, 0.6), lw: 1.2, dash: [4, 4] }); }
  }

  private dendrites(c: Ctx, P: Pl, w: number, h: number, k: number, seed: number) {
    const segs: [V3, V3][] = [];
    const grow = (x: number, y: number, a: number, len: number, d: number, id: number) => {
      if (d > 4 || len < 0.06) return;
      const prog = clamp(k * 5 - d * 0.9);
      if (prog <= 0) return;
      const L = len * prog;
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      if (Math.abs(x2) > w / 2 || Math.abs(y2) > h / 2) return;
      segs.push([at(P, x, y), at(P, x2, y2)]);
      if (prog < 1) return;
      const sp = 0.5 + 0.4 * hash(seed, id);
      grow(x2, y2, a + sp, len * 0.62, d + 1, id * 3 + 1);
      grow(x2, y2, a - sp, len * 0.62, d + 1, id * 3 + 2);
      if (hash(seed, id, 7) > 0.5) grow(x2, y2, a, len * 0.7, d + 1, id * 3 + 3);
    };
    for (let i = 0; i < 3; i++) {
      const cx = (hash(seed, i, 1) - 0.5) * w * 0.9, cy = -h / 2 + 0.05;
      grow(cx, cy, Math.PI / 2 + (hash(seed, i, 2) - 0.5) * 1.2, h * 0.38, 0, i + 1);
    }
    this.segs(c, segs, hexA(FROST, 0.75), 1.2);
  }

  private crown(c: Ctx, p: V3, s: number, t: number) { this.crown3(c, [p[0], p[1] - 0.45 * s, p[2]], s * 1.25, t); }


  private network(c: Ctx, t: number, tLearn: number, tBy: number) {
    const a = clamp((t - (this.L15[0]!.start - 0.6)) / 0.5);
    const S = NET.s;
    // (short: the layers step back in depth, and seen from the side their corner tags sit close together — the long
    // LAYER n · … tags ran into each other)
    const names = ['EDGES', 'TEXTURES', 'PARTS', 'CLASS'];
    for (let l = NET.layers - 1; l >= 0; l--) {
      const z = -NET.gap * l;
      const P: Pl = wallPl(z, [NET.x, 0.4, z]);
      const fill = clamp((t - (tLearn + l * 0.22)) / 0.35);
      this.rect3(c, P, -S / 2, 0, S, S, { fill: hexA('#170A14', 0.9 * a), stroke: hexA(MAG, 0.8 * a), lw: 1.6 });
      // (every other one under its plane: seen from the side, the planes' top corners sit close together)
      const na = a * (1 - clamp((t - (tBy - 0.1)) / 0.2)); // (gone as BY ITSELF lands over the planes)
      if (na > 0.01) this.text3(c, names[l]!, P, -S / 2, l % 2 ? -0.5 : S + 0.25, { size: 0.26, fam: MONOB, color: hexA(BONE, 0.75 * na) });
      if (fill <= 0) continue;
      const cells = 4, cs = S / cells;
      for (let r = 0; r < cells; r++) for (let q = 0; q < cells; q++) {
        const show = clamp(fill * 3 - (r * cells + q) / (cells * cells) * 2);
        if (show <= 0) continue;
        const x = -S / 2 + q * cs + 0.06, y = S - (r + 1) * cs + 0.06, w = cs - 0.12;
        if (l === 0 && this.seq) {
          // the real learned conv1 filters (last snapshot), one per cell
          const idx = (r * cells + q) * 5 + 3, col = idx % 12, row = Math.floor(idx / 12) % 8;
          this.img3(c, this.seq, 156, 4680, P, x, y, w, w, { sx: 1 + col * 13, sy: 104 * 44 + 1 + row * 13, sw: 11, sh: 11, n: 1, smooth: false, alpha: show * a });
          c.save(); c.globalCompositeOperation = 'color'; this.rect3(c, P, x, y, w, w, { fill: hexA('#FF2E7E', 0.9 * show * a) }); c.restore();
        } else if (l === 1) {
          // textures: oriented stripes and dots
          const ang = hash(r, q, 3) * Math.PI, fq = 3 + 4 * hash(r, q, 4);
          for (let i = 0; i < 6; i++) { const u = (i + 0.5) / 6; const cx = x + w / 2 + Math.cos(ang) * (u - 0.5) * w * 0.8, cy = y + w / 2 + Math.sin(ang) * (u - 0.5) * w * 0.8; this.seg(c, at(P, cx - Math.sin(ang) * w * 0.35, cy + Math.cos(ang) * w * 0.35, 0.01), at(P, cx + Math.sin(ang) * w * 0.35, cy - Math.cos(ang) * w * 0.35, 0.01), hexA(mixHex(MAG, GOLD, hash(r, q, 5)), show * a * (0.5 + 0.5 * Math.sin(i * fq))), 2); }
        } else if (l === 2) {
          // parts: eye, wheel, ear, leg — little line drawings
          const kind = (r * cells + q) % 4, cx = x + w / 2, cy = y + w / 2, R = w * 0.32;
          const Pp: Pl = { o: at(P, cx, cy, 0.01), r: P.r, u: P.u };
          if (kind === 0) { this.ring3(c, Pp, 0, 0, R, hexA(GOLD, show * a), 1.8); this.dot3(c, at(Pp, 0, 0), R * 0.35, hexA(GOLD, show * a)); }
          else if (kind === 1) { this.ring3(c, Pp, 0, 0, R, hexA(MAG, show * a), 1.8); for (let i = 0; i < 6; i++) { const an = (i / 6) * Math.PI * 2; this.seg(c, at(Pp, 0, 0), at(Pp, Math.cos(an) * R, Math.sin(an) * R), hexA(MAG, show * a), 1.2); } }
          else if (kind === 2) this.pl3(c, [at(Pp, -R, -R), at(Pp, 0, R), at(Pp, R, -R)], hexA(GOLD, show * a), 1.8, { close: true });
          else this.pl3(c, [at(Pp, -R * 0.4, R), at(Pp, -R * 0.2, -R), at(Pp, R * 0.5, -R)], hexA(MAG, show * a), 1.8);
        }
      }
      if (l === 3) {
        const k = fill;
        const cls: [string, number][] = [['TABBY CAT', 0.62], ['TIGER CAT', 0.21], ['LYNX', 0.09], ['EGYPTIAN CAT', 0.05]];
        cls.forEach(([name, p], i) => {
          const y = S - 0.7 - i * 0.95;
          this.text3(c, name, P, -S / 2 + 0.25, y, { size: 0.3, fam: MONOB, color: hexA(i ? BONE : GOLD, k * a) });
          this.rect3(c, P, -S / 2 + 0.25, y - 0.38, (S - 0.5) * p * k, 0.16, { fill: hexA(i ? MAG : GOLD, 0.9 * a) });
          this.text3(c, p.toFixed(2), P, S / 2 - 0.25, y, { size: 0.28, fam: MONO, color: hexA(BONE, 0.7 * k * a), align: 'right' });
        });
      }
      // connections to the next layer
      if (l < NET.layers - 1) for (const [x0, y0] of [[-S / 2, 0.4], [S / 2, 0.4], [S / 2, S + 0.4], [-S / 2, S + 0.4]] as [number, number][]) this.seg(c, [NET.x + x0, y0, z], [NET.x + x0, y0, z - NET.gap], hexA(MAG, 0.35 * a), 1);
    }
    void tBy;
  }
}
