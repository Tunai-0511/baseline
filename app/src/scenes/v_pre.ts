// v3 pre-chorus ×4 ("X is all you need, / the abstract guaranteed"): THE CLAIM. Each time the claimed ingredient is
// built out of its own structure, and the line ends under a GUARANTEED seal slammed onto it.
//   depth     — a square shaft of 152 layers (8 · 19 · 22 · 152 marked), DEPTH extruded down its mouth; the camera
//               dives through floors that read IS · ALL · YOU, and NEED waits at the bottom (layer 152)
//   memory    — a row of LSTM cells; each cell's 5 × 7 dots hold one letter of MEMORY'S ALL YOU NEED, the cell state
//               runs over them like a rail
//   attention — four bricks (ATTENTION'S · ALL · YOU · NEED) and the attention among them, taken from a one-layer
//               model trained on the song (data/attn_lyrics.json); the 4 × 4 map on the floor
//   scale     — a log–log plane, loss ∝ C^−0.050, the camera backing out a decade per word, SCALE set letter by letter
//               at ×10 the size of the last; past the data the line goes on dashed: EXTRAPOLATED
// Style: one saturated colour per claim on black, a gold seal.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, vlerp, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';
import { glyphOutline } from './_wire';
import { dotMask } from './_seg';
import { hash } from '../engine/util';

type Key = 'depth' | 'memory' | 'attention' | 'scale';
// v4: one look for all four claims (ink, bone, magenta for the sung word); the claims differ by structure, not colour
const ONE = { bg: U.ink, c: U.ash, hi: U.bone, dim: U.line };
const PAL: Record<Key, { bg: string; c: string; hi: string; dim: string }> = { depth: ONE, memory: ONE, attention: ONE, scale: ONE };
const GOLD = U.bone, CRIM = U.mag, BONE = U.bone;
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), MONO = F.mono(500), MONOB = F.mono(700);
// depth
const LAYER = 0.8, NL = 152, SH = 5;
const camYD = (t: number, tIs: number, tStop: number) => (t < tIs ? lerp(11.5, 9, clamp((t - (tIs - 0.8)) / 0.8)) : lerp(9, -112, ease.inOutCubic(clamp((t - tIs) / (tStop - tIs)))));
// memory
const CELL = 2.9;
const MEM = "MEMORY'S ALL YOU NEED";

export default class Pre extends VScene {
  private claim: Key = 'depth';
  private Wd: Word[] = [];
  private attn: { causal_mean: number[][]; full_mean: number[][] } | null = null;

  private w(re: RegExp) { return this.Wd.find((x) => re.test(x.w))!; }

  override async init() {
    this.claim = (this.ctx.params.key as Key) ?? 'depth';
    this.bg = PAL[this.claim].bg;
    const ly = this.ctx.lyrics;
    // the two lines of this pre-chorus: the first line starting inside the window, and the next
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.Wd = [...ly.lines[i0]!.words, ...ly.lines[i0 + 1]!.words];
    if (this.claim === 'attention') { try { this.attn = await (await fetch('data/attn_lyrics.json')).json(); } catch { /* */ } }
    const X = this.Wd[0]!, tAll = this.w(/^all$/).start, tYou = this.w(/^you$/).start, tNeed = this.w(/need/), tThe = this.w(/^the$/).start, tAbs = this.w(/abstract/).start, tG = this.w(/guaranteed/).start;
    const tIs = this.Wd.find((x) => /^is$/.test(x.w))?.start ?? X.end;
    const s = this.ctx.start, e = this.ctx.end;
    let shots: ConstructorParameters<typeof Rig>[0];
    if (this.claim === 'depth') {
      const cy = (t: number) => camYD(t, tIs, tG - 0.15);
      shots = [
        { t0: s, name: 'mouth', key: (t) => { const y = cy(t); const k = clamp((t - s) / 1.2); return K([0.5 * (1 - k), y, 1.6 * (1 - k) + 0.3], [0, y - 30, 0], 50, 0.06 * Math.sin((t - s) * 0.8), [0, 0, -1]); } },
        { t0: tIs - 0.05, name: 'dive', key: (t) => { const y = cy(t); const ru = 1 - ease.inOutCubic(clamp((t - (tThe - 0.35)) / 0.6)); return K([0.3, y, 0.3], [0, y - 30, 0], lerp(50, 62, ease.inOutQuad(clamp((t - tIs) / (tNeed.start - tIs)))), Math.min(t - tIs, tThe - 0.35 - tIs) * 0.28 * ru, [0, 0, -1]); } },
        { t0: tG - 0.15, name: 'floor', key: (t) => { const k2 = ease.outCubic(clamp((t - tG) / (e - tG))); const y = -112 + 2.5 * k2; return K([0.3, y, 0.3], [0, y - 30, 0], lerp(56, 50, k2), 0, [0, 0, -1]); } },
      ];
    } else if (this.claim === 'memory') {
      const xw = (t: number) => this.memX(t);
      shots = [
        { t0: s, name: 'row', key: (t) => { const x = xw(t); return K([x + 3.5, 3.8, 9.5], [x + 1.2, 0.6, 0], 44, -0.04); } },
        { t0: tThe - 0.05, snap: 0.6, name: 'pull', key: (t) => { const k = ease.inOutCubic(clamp((t - tThe) / (tG - tThe))); const xe = (MEM.length - 1) * CELL; return K([lerp(xe - 8, xe - 2, k), lerp(5.5, 4.5, k), lerp(15, 13, k)], [lerp(xe - 16, xe - 4, k), 0.6, 0], 48, -0.05); } },
        { t0: tG - 0.05, snap: 0.25, name: 'seal', key: (t) => { const k = ease.outCubic(clamp((t - tG) / (e - tG))); const xe = (MEM.length - 1) * CELL; return K([lerp(xe + 2, xe + 1, k), lerp(4.5, 3.2, k), lerp(14, 11, k)], [xe + 3.2, 2.2, 0], 44); } },
      ];
    } else if (this.claim === 'attention') {
      shots = [
        { t0: s, name: 'bricks', key: (t) => { const k = ease.inOutQuad(clamp((t - s) / (tThe - s))); const kt = ease.outCubic(clamp((t - s) / 0.7)); return K([lerp(-7, 2.5, k), lerp(3.8, 7.0, k), lerp(11, 22, k)], [lerp(-7.2, 2.0, k), lerp(-6, lerp(1.8, 3.0, k), kt), 0], 44, 0.02); } },
        { t0: tG - 0.05, snap: 0.3, name: 'seal', key: (t) => { const k = ease.outCubic(clamp((t - tG) / (e - tG))); return K([lerp(2.5, 1.8, k), lerp(6.5, 5.8, k), lerp(19, 15.5, k)], [2.0, 4.4, 2], 44); } },
      ];
    } else {
      this.buildStairs();
      shots = [
        { t0: s, name: 'stairs', key: (t) => { const v = this.stairView(t); return K([v.x + 0.22 * v.d, v.y + 0.12 * v.d, v.d], [v.x, v.y, 0], 44, -0.03); } },
      ];
    }
    // the last 0.45 s: push into the ∎ — the next chorus opens out of its magenta
    const lastShot = shots[shots.length - 1]!, f0 = lastShot.key;
    lastShot.key = (t) => {
      const k0 = f0(t);
      const kk = ease.inQuad(clamp((t - (e - 0.45)) / 0.45));
      if (kk <= 0) return k0;
      const S = this.sealAt();
      const pEnd: V3 = [S.c[0] + S.n[0] * S.r * 0.75, S.c[1] + S.n[1] * S.r * 0.75, S.c[2] + S.n[2] * S.r * 0.75];
      return { ...k0, p: vlerp(k0.p, pEnd, kk), tg: vlerp(k0.tg, S.c, kk) };
    };
    this.rig = new Rig(shots, [{ t: X.start, amp: 0.8 }, { t: tAll, amp: 0.4 }, { t: tYou, amp: 0.4 }, { t: tNeed.start, amp: 0.6 }, { t: tAbs, amp: 0.3 }, { t: tG, amp: 1.8 }], 0.7, 51);
  }

  /** where this claim's seal sits: centre, facing normal, radius (matches the seal() calls below) */
  private sealAt(): { c: V3; n: V3; r: number } {
    // (the ∎ at the end of the cut word, on the slab's face: what the last push flies into)
    const q = (c: V3, n: V3, R: number): { c: V3; n: V3; r: number } => {
      const size = (2.8 * R) / this.tw3('GUARANTEED', { size: 1, fam: WIDE });
      const up: V3 = n[1] > 0.5 ? [0, 0, -1] : [0, 1, 0];
      const dy = -0.3 * R + 0.36 * size * 0.5 + 0.02 * R;
      return { c: [c[0] + 1.475 * R + up[0] * dy + n[0] * 0.16 * R, c[1] + up[1] * dy + n[1] * 0.16 * R, c[2] + up[2] * dy + n[2] * 0.16 * R], n, r: 0.5 * R };
    };
    if (this.claim === 'depth') { const yb = -NL * LAYER + 0.05; return q([0, yb, 2.25], [0, 1, 0], 2.15); }
    if (this.claim === 'memory') { const xe = (MEM.length - 1) * CELL; return q([xe + 3.2, 2.2, 1.3], [0, 0, 1], 2.3); }
    if (this.claim === 'attention') return q([2.0, 5.2, 2.2], [0, 0, 1], 2.4);
    const sg = this.steps[this.steps.length - 1];
    if (!sg) return q([0, 0, 0.3], [0, 0, 1], 2);
    return q([sg.x + sg.w / 2, sg.y + 0.15 * sg.size, 0.3], [0, 0, 1], 0.62 * sg.size);
  }

  /** memory: x of the cell being written */
  private memX(t: number) {
    const idx = this.memIdx(t);
    return Math.max(0, idx - 2) * CELL;
  }
  private memIdx(t: number) {
    // characters of MEM written across the sung words (spaces take no time)
    const words = MEM.split(' ');
    const sung = [this.Wd[0]!, this.w(/^all$/), this.w(/^you$/), this.w(/need/)];
    let idx = 0, pos = 0;
    words.forEach((wd, i) => {
      const sw = sung[i]!;
      const k = clamp((t - sw.start) / Math.max(0.2, Math.min(0.9, sw.end - sw.start)));
      if (t >= sw.start) idx = pos + k * wd.length;
      pos += wd.length + 1;
    });
    return idx;
  }
  /** scale: the staircase — each word ×1.6 the size of the last, set up and to the right of it */
  private steps: { s: string; x: number; y: number; size: number; t: number; w: number }[] = [];
  private buildStairs() {
    const ws = [this.Wd[0]!, this.Wd.find((x) => /^is$/.test(x.w)), this.w(/^all$/), this.w(/^you$/), this.w(/need/)].filter(Boolean) as Word[];
    let x = 1.0, y = 9.5, size = 1.6;
    this.steps = ws.map((wd) => {
      const s = wd.w.replace(/[^A-Za-z]/g, '').toUpperCase();
      const w = this.tw3(s, { size, fam: WIDE });
      const st = { s, x, y, size, t: wd.start, w };
      x += w + 0.35 * size; size *= 1.6; y += 0.42 * size;
      return st;
    });
    // the seal's step
    this.steps.push({ s: '', x, y: y - 0.2 * size, size, t: this.w(/^the$/).start, w: 2.4 * size });
  }
  /** where the camera looks (word centre) and how far back it is, easing to each step as its word is sung */
  private stairView(t: number) {
    const st = this.steps;
    const tgt = (i: number) => ({ x: st[i]!.x + st[i]!.w / 2, y: st[i]!.y + 0.3 * st[i]!.size, d: 5.4 * st[i]!.size });
    let v = tgt(0);
    for (let i = 1; i < st.length; i++) {
      const k = ease.outExpo(clamp((t - st[i]!.t + 0.05) / 0.45));
      if (k <= 0) break;
      const n = tgt(i);
      v = { x: lerp(v.x, n.x, k), y: lerp(v.y, n.y, k), d: lerp(v.d, n.d, k) };
    }
    return v;
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const pal = PAL[this.claim];
    const tG = this.w(/guaranteed/);
    pool(c, W * 0.5, H * 0.5, 950, '#1C1A22', 0.6);
    if (this.claim === 'depth') this.depth(c, t);
    else if (this.claim === 'memory') this.memory(c, t);
    else if (this.claim === 'attention') this.attention(c, t);
    else this.scale(c, t);
    const no = { depth: '01', memory: '02', attention: '03', scale: '04' }[this.claim];
    frameMarks(c, U.ash, { tl: `BASELINE · CLAIM ${no}`, tr: `${this.claim.toUpperCase()} IS ALL YOU NEED`, bl: { depth: '2012 — 2015', memory: '1997 — 2016', attention: '2014 — 2017', scale: '2020 — 2022' }[this.claim], br: tc(t), alpha: 0.6 });
    const kick = this.beatPulse(t, 0.08);
    return { bloom: 0.8, bloomThreshold: 0.55, halation: 0.2, ca: 0.3 + 2.2 * hot(t, tG.start, 0.12), grain: 0.05, vignette: 0.32, flash: 0.025 * hot(t, tG.start, 0.08), zoom: 1 + 0.012 * kick };
  }

  // ------------------------------------------------------------------ the seal
  /** a gold rosette on plane P at (x, y), radius R, slammed in at t0 */
  /**
   * The guarantee (2026-10-10, user: the gold seal looked cheap): a slab of black glass slams onto the claim, the
   * word is laser-cut into it as it is sung (a hot front, sparks, the cut letters cooling from magenta to bone), and a
   * magenta ∎ — end of proof — slams in after it. (x, y): the slab's centre on P; R: its scale (the old seal radius).
   */
  private seal(c: Ctx, t: number, P: Pl, x: number, y: number, R: number, t0: number, t1: number) {
    if (t < t0 - 0.02) return;
    const fall = clamp((t - t0) / 0.12);
    const h = R * 0.16, lift = R * 2.6 * (1 - ease.inQuad(fall));
    const sw = 2.0 * R, sh = 0.68 * R; // half extents
    const land = t0 + 0.12;
    const bounce = t > land ? 0.05 * R * Math.exp(-(t - land) * 14) * Math.abs(Math.sin((t - land) * 40)) : 0;
    const z = h + lift + bounce;
    const A = (u: number, v: number, zz: number) => at(P, x + u, y + v, zz);
    // the shadow it throws on the plane, and the landing: a square shockwave and a puff of dust
    const sa = 0.55 * ease.outCubic(fall);
    this.fill3(c, [A(-sw * 1.06, -sh * 1.1, 0.01), A(sw * 1.06, -sh * 1.1, 0.01), A(sw * 1.06, sh * 1.1, 0.01), A(-sw * 1.06, sh * 1.1, 0.01)], hexA('#000000', sa));
    if (t > land && t < land + 0.8) {
      const u = (t - land) / 0.8, gx = sw * (1.05 + 1.6 * ease.outCubic(u)), gy = sh * (1.1 + 2.4 * ease.outCubic(u));
      this.pl3(c, [A(-gx, -gy, 0.02), A(gx, -gy, 0.02), A(gx, gy, 0.02), A(-gx, gy, 0.02)], BONE, 3 * (1 - u), { close: true, alpha: 0.8 * (1 - u) });
      const dust: number[] = [];
      for (let i = 0; i < 90; i++) {
        const an = hash(i, 3) * Math.PI * 2, sp = 0.8 + 1.6 * hash(i, 4), rr = sp * R * ease.outCubic(u);
        const ex = Math.cos(an) * (sw + rr), ey = Math.sin(an) * (sh + rr * 0.6);
        const w = A(ex, ey, 0.05 + 0.4 * R * Math.sin(Math.PI * u) * hash(i, 5));
        dust.push(w[0], w[1], w[2]);
      }
      this.points(c, dust, 90, U.ash, 2.2, 0.7 * (1 - u));
    }
    // once the word is cut the slab is lit from inside: a soft magenta spill round its foot
    const lit = clamp((t - (this.w(/guaranteed/).start + 0.3)) / 0.6);
    if (lit > 0) {
      const pc = this.pr(A(0, 0, 0)), pe = this.pr(A(sw, 0, 0));
      if (pc.z > this.near) pool(c, pc.x, pc.y, Math.max(60, Math.hypot(pe.x - pc.x, pe.y - pc.y) * 1.9), CRIM, 0.22 * lit);
    }
    // the slab: sides (dark), then the face (glossy black, a sheen across it), lit edges
    const face = (u: number, v: number) => A(u, v, z);
    const base = (u: number, v: number) => A(u, v, lift + bounce);
    const sides: [number, number, number, number][] = [[-sw, -sh, sw, -sh], [sw, -sh, sw, sh], [sw, sh, -sw, sh], [-sw, sh, -sw, -sh]];
    for (const [u0, v0, u1, v1] of sides) this.fill3(c, [base(u0, v0), base(u1, v1), face(u1, v1), face(u0, v0)], '#08070A', { stroke: hexA(U.graphite, 0.5), lw: 1 });
    this.fill3(c, [face(-sw, -sh), face(sw, -sh), face(sw, sh), face(-sw, sh)], '#0E0D12');
    // the sheen: a soft diagonal band of reflected light drifting across the glass
    const sx = lerp(-sw * 1.6, sw * 1.2, clamp((t - t0) / 2.2));
    this.fill3(c, [face(clamp(sx, -sw, sw), -sh), face(clamp(sx + 0.9 * R, -sw, sw), -sh), face(clamp(sx + 0.5 * R, -sw, sw), sh), face(clamp(sx - 0.4 * R, -sw, sw), sh)], hexA(BONE, 0.05));
    this.seg(c, face(-sw, sh), face(sw, sh), hexA(BONE, 0.85), 2.2);
    this.seg(c, face(-sw, -sh), face(-sw, sh), hexA(BONE, 0.3), 1.2);
    this.seg(c, face(sw, -sh), face(sw, sh), hexA(BONE, 0.3), 1.2);
    this.seg(c, face(-sw, -sh), face(sw, -sh), hexA(BONE, 0.15), 1.2);
    // the face as a plane for type (lying on the slab, a hair proud of the glass)
    const F: Pl = { o: A(0, 0, z + 0.004), r: P.r, u: P.u };
    this.text3(c, 'THE ABSTRACT  ·  CLAIM VERIFIED', F, -1.8 * R, 0.36 * R, { size: 0.12 * R, fam: MONOB, color: hexA(U.ash, 0.9 * fall), track: 0.18 });
    // GUARANTEED, cut as it is sung: the laser front at p (0..1 of the word's width)
    const gw = this.w(/guaranteed/);
    const p = clamp((t - gw.start) / Math.max(0.35, Math.min(1.0, gw.end - gw.start) * 0.85));
    const word = 'GUARANTEED';
    const size = (2.8 * R) / this.tw3(word, { size: 1, fam: WIDE });
    const gx0 = -1.8 * R, gy = -0.3 * R; // (on the face: coordinates from the slab's centre)
    const n = word.length;
    // the cut: a dark inset first (the depth of the groove), then the letter itself
    const cut = (i: number) => (i + 0.5) / n <= p;
    this.text3(c, word, F, gx0 + 0.012 * R, gy - 0.016 * R, { size, fam: WIDE, color: '#000000', each: (i) => (cut(i) ? { a: 0.9 } : null) });
    this.text3(c, word, F, gx0, gy, {
      size, fam: WIDE, color: BONE, glow: 12, glowColor: CRIM,
      each: (i) => {
        if (!cut(i)) return null;
        const age = t - (gw.start + (i + 0.5) / n * (Math.max(0.35, Math.min(1.0, gw.end - gw.start) * 0.85)));
        const hotK = Math.exp(-Math.max(0, age) / 0.25);
        return { color: mixHex(BONE, '#FF9CC4', hotK) };
      },
    });
    // the laser: a beam down to the cut and its sparks
    if (p > 0 && p < 1) {
      const ww = this.tw3(word, { size, fam: WIDE });
      const lx = gx0 + ww * p, ly = gy + 0.36 * size;
      const tip = at(F, lx, ly, 0.004), src = at(F, lx - 0.6 * R, ly + 1.6 * R, 2.4 * R);
      this.glowSeg(c, src, tip, CRIM, 2, 14, 0.9);
      this.dot3(c, tip, 0.06 * R, '#FFFFFF');
      for (let i = 0; i < 46; i++) {
        const tb = gw.start + (i / 46) * (Math.max(0.35, Math.min(1.0, gw.end - gw.start) * 0.85));
        const age = t - tb;
        if (age < 0 || age > 0.35) continue;
        const pb = (i / 46), bx = gx0 + ww * pb, by = gy + 0.36 * size;
        const an = hash(i, 9) * Math.PI - Math.PI * 0.1, sp = (0.8 + 1.4 * hash(i, 10)) * R;
        const q0 = at(F, bx + Math.cos(an) * sp * age, by + Math.sin(an) * sp * age - 2.5 * R * age * age, 0.02 + 0.6 * R * age);
        const q1 = at(F, bx + Math.cos(an) * sp * (age - 0.03), by + Math.sin(an) * sp * (age - 0.03) - 2.5 * R * (age - 0.03) ** 2, 0.02 + 0.6 * R * (age - 0.03));
        this.seg(c, q1, q0, i % 3 ? '#FFD6E6' : '#FFFFFF', 2, { alpha: 1 - age / 0.35 });
      }
    }
    // ∎: end of proof — slams in once the word is cut
    const tq = gw.start + Math.max(0.35, Math.min(1.0, gw.end - gw.start) * 0.85) + 0.04;
    if (t > tq - 0.02) {
      const k = clamp((t - tq) / 0.1);
      const qs = 0.45 * R * (1 + 1.4 * Math.pow(1 - k, 3)), qx = 1.475 * R, qy = gy + 0.36 * size * 0.5 + 0.02 * R;
      const q = (u: number, v: number, zz: number) => at(F, qx + u, qy + v, zz);
      this.fill3(c, [q(-qs / 2, -qs / 2, 0.01), q(qs / 2, -qs / 2, 0.01), q(qs / 2, qs / 2, 0.01), q(-qs / 2, qs / 2, 0.01)], CRIM, { stroke: '#FF9CC4', lw: 1.5 });
      if (t > tq + 0.1 && t < tq + 0.6) { const u = (t - tq - 0.1) / 0.5; const g = qs * (0.6 + 1.6 * u); this.pl3(c, [q(-g, -g, 0.02), q(g, -g, 0.02), q(g, g, 0.02), q(-g, g, 0.02)], CRIM, 2.5 * (1 - u), { close: true, alpha: 1 - u }); }
    }
    void t1;
  }


  // ------------------------------------------------------------------ depth
  private depth(c: Ctx, t: number) {
    const pal = PAL.depth;
    const X = this.Wd[0]!, tIs = this.Wd.find((x) => /^is$/.test(x.w))!.start, tNeed = this.w(/need/), tThe = this.w(/^the$/), tAbs = this.w(/abstract/), tG = this.w(/guaranteed/);
    const camY = this.claim === 'depth' ? camYD(t, tIs, tG.start - 0.15) : 0;
    const yL = (k: number) => -k * LAYER;
    // layer frames (only those near the camera's reach)
    const frames: [V3, V3][] = [], marks: [V3, V3][] = [];
    for (let k = 0; k <= NL; k++) {
      const y = yL(k);
      if (y > camY + 1 || y < camY - 70) continue;
      const q: V3[] = [[-SH, y, -SH], [SH, y, -SH], [SH, y, SH], [-SH, y, SH]];
      const big = [8, 19, 22, 50, 101, 152].includes(k);
      for (let i = 0; i < 4; i++) (big ? marks : frames).push([q[i]!, q[(i + 1) % 4]!]);
    }
    this.segs(c, frames, hexA(pal.c, 0.55), 1.2);
    this.segs(c, marks, pal.hi, 2.6);
    // corner rails
    for (const [x, z] of [[-SH, -SH], [SH, -SH], [SH, SH], [-SH, SH]] as [number, number][]) this.seg(c, [x, Math.min(2, camY + 1), z], [x, Math.max(yL(NL), camY - 75), z], hexA(pal.c, 0.7), 1.6);
    // residual skips on the +x wall: one arc per 3-layer block from layer 22 down
    const arcs: V3[][] = [];
    for (let k = 22; k + 3 <= NL; k += 3) {
      const y0 = yL(k), y1 = yL(k + 3);
      if (y0 > camY + 1 || y1 < camY - 60) continue;
      const pts: V3[] = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push([SH - 0.02, lerp(y0, y1, u), -2.2 + Math.sin(Math.PI * u) * 1.3]); }
      arcs.push(pts);
    }
    for (const a of arcs) this.pl3(c, a, hexA(pal.hi, 0.75), 1.4);
    // wall labels at the famous depths
    const lab: [number, string][] = [[8, '8 LAYERS · 2012'], [19, '19 · 2014'], [22, '22 · 2014'], [50, '50 · 2015'], [101, '101 · 2015'], [152, '152 · 2015']];
    for (const [k, s] of lab) {
      const y = yL(k);
      if (y > camY + 0.5 || y < camY - 45) continue;
      // (the bottom one sits at the edge of the floor NEED lands on: it goes as NEED comes, L152 on the back wall stays)
      const la = k === NL ? 1 - clamp((t - (tNeed.start - 0.1)) / 0.15) : 1;
      const Pw: Pl = { o: [-SH + 0.02, y + 0.15, 0], r: [0, 0, 1], u: [0, 1, 0] };
      if (la > 0) this.text3(c, s, Pw, -3.8, 0, { size: 0.5, fam: MONOB, color: pal.hi, alpha: la });
      const Pw2: Pl = { o: [0, y + 0.15, -SH + 0.02], r: [1, 0, 0], u: [0, 1, 0] };
      this.text3(c, `L${k}`, Pw2, 0, 0, { size: 0.9, fam: WIDE, color: hexA(pal.hi, 0.85), align: 'center' });
    }
    // DEPTH: the outline at the mouth, extruded down 28 layers
    const ol = glyphOutline('DEPTH', WIDE, 2.5, 0.04);
    const ox = -ol.width / 2, oz = 1.25;
    const ek = clamp((t - X.start) / (X.end - X.start));
    const nCopies = Math.round(lerp(1, 28, ease.outCubic(ek)));
    for (let d = 0; d < nCopies; d++) {
      const y = -d * LAYER + 0.02;
      if (y > camY - 0.5) continue;
      const sg: [V3, V3][] = [];
      for (let i = 0; i < ol.segs.length; i += 4) sg.push([[ox + ol.segs[i]!, y, oz - ol.segs[i + 1]!], [ox + ol.segs[i + 2]!, y, oz - ol.segs[i + 3]!]]);
      this.segs(c, sg, d === 0 ? (t < X.end + 0.2 ? U.mag : U.bone) : hexA(pal.c, 0.9 * Math.pow(0.9, d)), d === 0 ? 3.2 : 1.3);
    }
    // the floors IS · ALL · YOU, written across the shaft where the camera will meet them; NEED at the bottom
    const floorWord = (wd: Word, s: string, size: number, y: number) => {
      if (t < wd.start - 0.02 || y > camY - 0.3) return;
      const near = clamp((camY - y - 1.2) / 3.5);
      if (near <= 0.02) return;
      const P = floorPl(y, [0, y, 0]);
      c.save(); c.globalAlpha *= near;
      const k = ease.outBack(clamp((t - wd.start) / 0.2), 1.6);
      this.rect3(c, P, -SH, -SH, 2 * SH, 2 * SH, { fill: hexA(pal.bg, 0.55), stroke: hexA(pal.hi, 0.8), lw: 1.5 });
      this.text3(c, s, P, 0, 0, { size: size * k, fam: WIDE, color: t < wd.end ? U.mag : U.bone, align: 'center', mid: true, glow: 14, glowColor: U.ink });
      c.restore();
    };
    const cyAt = (tt: number) => camYD(tt, tIs, tG.start - 0.15);
    const isW = this.Wd.find((x) => /^is$/.test(x.w))!, allW = this.w(/^all$/), youW = this.w(/^you$/);
    floorWord(isW, 'IS', 4.4, Math.round((cyAt(isW.start + 0.6) - 1) / LAYER) * LAYER);
    floorWord(allW, 'ALL', 4.4, Math.round((cyAt(allW.start + 0.6) - 1) / LAYER) * LAYER);
    floorWord(youW, 'YOU', 4.4, Math.round((cyAt(youW.start + 0.6) - 1) / LAYER) * LAYER);
    const yb = yL(NL);
    const B = floorPl(yb, [0, yb, 0]);
    this.grid3(c, B, -SH, SH, -SH, SH, 1, hexA(pal.c, 0.6), 1);
    if (t > tNeed.start - 0.02) {
      const k = ease.outBack(clamp((t - tNeed.start) / 0.25), 1.6);
      this.text3(c, 'NEED', B, 0, 3.15, { size: 3.4 * k, fam: WIDE, color: t < tNeed.end ? U.mag : U.bone, align: 'center', mid: true, glow: 18, glowColor: U.ink });
    }
    if (t > tThe.start - 0.02) this.say3(c, [tThe, tAbs], t, B, 0, 1.0, { size: 1.0, fam: HEAVY, up: '', cur: U.mag, done: U.bone, align: 'center', upper: true, slam: 0.3 });
    this.seal(c, t, floorPl(yb + 0.05, [0, yb + 0.05, 0]), 0, -2.25, 2.15, tG.start, tG.end);
  }

  // ------------------------------------------------------------------ memory
  private memory(c: Ctx, t: number) {
    const pal = PAL.memory;
    const tG = this.w(/guaranteed/), tThe = this.w(/^the$/), tAbs = this.w(/abstract/);
    const idx = this.memIdx(t);
    const G = floorPl(-1.6);
    this.grid3(c, G, -10, 80, -14, 10, 1.4, pal.dim, 1, { fog: [8, 50] });
    // cell state rail across the tops
    const n = MEM.length, xe = (n - 1) * CELL;
    this.glowSeg(c, [-CELL, 1.55, 0], [xe + CELL * 1.5, 1.55, 0], U.bone, 2.2, 10, 0.9);
    // a pulse riding the rail with the writing head
    const hx = idx * CELL;
    this.dot3(c, [hx, 1.55, 0], 0.22, '#FFFFFF');
    for (let i = 0; i < n; i++) {
      const ch = MEM[i]!;
      const x = i * CELL;
      const written = idx >= i + 0.6;
      const box: [V3, V3] = [[x - 1.15, -1.15, -1.15], [x + 1.15, 1.15, 1.15]];
      if (ch === ' ') { this.seg(c, [x - 1.0, 0, 0], [x + 1.0, 0, 0], hexA(pal.c, 0.4), 1.2, { dash: [4, 6] }); continue; }
      this.box3(c, box[0], box[1], hexA(i === Math.floor(idx) ? U.mag : pal.c, written ? 0.95 : 0.35), i === Math.floor(idx) ? 2.2 : 1.4, { fill: U.panel });
      // gate glyphs on the top face: σ σ tanh σ
      const top = floorPl(1.16, [x, 1.16, 0]);
      ['σ', 'σ', 'tanh', 'σ'].forEach((g, j) => this.text3(c, g, top, -0.85 + j * 0.56, -0.6, { size: 0.26, fam: MONO, color: hexA(pal.hi, 0.5), align: 'center' }));
      // the letter as 5 × 7 dots on the front face
      const [m0, m1] = dotMask(ch === "'" ? "'" : ch);
      const front: Pl = { o: [x, 0, 1.16], r: [1, 0, 0], u: [0, 1, 0] };
      const lit = clamp((idx - i) * 2);
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) {
        const bit = r < 4 ? (m0 >> (r * 5 + q)) & 1 : (m1 >> ((r - 4) * 5 + q)) & 1;
        const px = -0.72 + q * 0.36, py = 1.0 - r * 0.33;
        if (bit && lit > 0) this.dot3(c, at(front, px, py, 0.01), 0.13, i === Math.floor(idx) ? U.mag : U.bone, { alpha: lit });
        else this.dot3(c, at(front, px, py, 0.01), 0.07, hexA(pal.c, 0.18));
      }
      // h_t arrow to the next cell
      if (i < n - 1 && MEM[i + 1] !== ' ') this.seg(c, [x + 1.2, -0.6, 0], [x + CELL - 1.2, -0.6, 0], hexA(pal.hi, 0.5), 1.2);
    }
    // labels
    this.text3(c, 'c_t  →  CELL STATE', wallPl(-1.2), -CELL, 2.3, { size: 0.42, fam: MONOB, color: pal.hi });
    // THE ABSTRACT on the rail's end plate; the seal on the last cell
    if (t > tThe.start - 0.02) this.say3(c, [tThe, tAbs], t, wallPl(1.2), xe + 3.2, 5.6, { size: 0.95, fam: HEAVY, up: '', cur: U.mag, done: U.bone, align: 'center', upper: true, slam: 0.3 });
    this.seal(c, t, wallPl(1.3), xe + 3.2, 2.2, 2.3, tG.start, tG.end);
    void hash;
  }

  // ------------------------------------------------------------------ attention
  private attention(c: Ctx, t: number) {
    const pal = PAL.attention;
    const tG = this.w(/guaranteed/), tThe = this.w(/^the$/), tAbs = this.w(/abstract/);
    const words = [this.Wd[0]!, this.w(/^all$/), this.w(/^you$/), this.w(/need/)];
    const labels = ["ATTENTION'S", 'ALL', 'YOU', 'NEED'];
    const xs = [-7.4, 1.9, 6.4, 11.4], wd = [10.4, 3.6, 3.8, 4.6];
    const G = floorPl(-0.6);
    this.grid3(c, G, -20, 24, -12, 12, 1, pal.dim, 1, { fog: [10, 40] });
    const M = this.attn?.causal_mean ?? [[1, 0, 0, 0], [0.5, 0.5, 0, 0], [0.13, 0.49, 0.38, 0], [0.34, 0.29, 0.25, 0.12]];
    const F0 = wallPl(0);
    // bricks
    words.forEach((w0, i) => {
      if (t < w0.start - 0.05) return;
      const k = ease.outBack(clamp((t - w0.start) / 0.25), 1.6);
      const x = xs[i]!, ww = wd[i]!;
      const sung = t < w0.end + 0.1;
      this.box3(c, [x - ww / 2, -0.6, -0.8], [x + ww / 2, -0.6 + 1.9 * k, 0.8], sung ? U.mag : U.bone, sung ? 2.4 : 1.4, { fill: sung ? U.magDark : U.panel });
      this.text3(c, labels[i]!, wallPl(0.82), x, -0.6 + 0.95 * k, { size: 1.0, fam: WIDE, color: sung ? U.mag : U.bone, align: 'center', mid: true });
    });
    // letter-level attention inside ATTENTION'S while it is sung: arcs among the letters
    const w0 = words[0]!;
    if (t > w0.start && t < words[1]!.start + 0.4) {
      const n = 11, x0 = xs[0]! - wd[0]! / 2 + 0.55, dx = (wd[0]! - 1.1) / (n - 1);
      const q = Math.min(n - 1, Math.floor(((t - w0.start) / (w0.end - w0.start)) * n));
      for (let j = 0; j <= q; j++) {
        const wgt = Math.exp(-Math.abs(q - j) * 0.6) * (0.4 + 0.6 * hash(q, j));
        this.arc(c, [x0 + q * dx, 1.3, 0], [x0 + j * dx, 1.3, 0], 0.6 + Math.abs(q - j) * 0.35, pal.hi, 0.6 + 3 * wgt, 0.35 + 0.6 * wgt);
      }
    }
    // brick-level attention (trained weights, causal): the sung brick queries the bricks before it
    for (let i = 1; i < 4; i++) {
      const wi = words[i]!;
      if (t < wi.start) continue;
      const k = clamp((t - wi.start) / 0.35);
      for (let j = 0; j <= i; j++) {
        const wgt = M[i]![j]!;
        if (wgt < 0.01) continue;
        this.arc(c, [xs[i]!, 1.4, 0.2], [xs[j]!, 1.4, 0.2], 1.4 + Math.abs(xs[i]! - xs[j]!) * 0.28, U.mag, 1 + 7 * wgt, (0.3 + 0.7 * wgt) * k);
        // (the weights go as the slab comes down over the arcs: half under its edges they read as scraps)
        const wa = 1 - clamp((t - (tG.start - 0.25)) / 0.25);
        if (k >= 1 && wgt > 0.08 && wa > 0) {
          const mid: V3 = [(xs[i]! + xs[j]!) / 2, 1.4 + 1.4 + Math.abs(xs[i]! - xs[j]!) * 0.28, 0.2];
          this.text3(c, wgt.toFixed(2), F0, mid[0], mid[1] + 0.2, { size: 0.42, fam: MONOB, color: pal.hi, align: 'center', alpha: wa });
        }
      }
    }
    // the 4 × 4 map on the floor
    const mk = clamp((t - words[1]!.start) / 0.4);
    if (mk > 0) {
      const P = floorPl(-0.58);
      const cs = 1.2, x0 = -2.4, z0 = 3.0;
      for (let r = 0; r < 4; r++) for (let q2 = 0; q2 < 4; q2++) {
        const v = M[r]![q2]!;
        const show = t >= words[r]!.start ? 1 : 0;
        this.rect3(c, P, x0 + q2 * cs, -z0 - r * cs, cs - 0.08, cs - 0.08, { fill: hexA(mixHex(U.panel, U.mag, Math.pow(v, 0.6)), mk * (0.25 + 0.75 * show)) });
      }
      this.text3(c, 'softmax(QKᵀ/√d) · causal', P, x0, -z0 - 4 * cs - 0.5, { size: 0.4, fam: MONO, color: hexA(pal.hi, 0.8 * mk) });
    }
    if (t > tThe.start - 0.02) this.say3(c, [tThe, tAbs], t, wallPl(1.8), 2.0, 9.4, { size: 0.95, fam: HEAVY, up: '', cur: U.mag, done: U.bone, align: 'center', upper: true, slam: 0.3 });
    this.seal(c, t, wallPl(2.2), 2.0, 5.2, 2.4, tG.start, tG.end);
  }
  private arc(c: Ctx, a: V3, b: V3, h: number, col: string, lw: number, alpha: number) {
    const pts: V3[] = [];
    for (let i = 0; i <= 24; i++) { const u = i / 24; const p = vlerp(a, b, u); pts.push([p[0], p[1] + Math.sin(Math.PI * u) * h, p[2]]); }
    this.pl3(c, pts, col, lw, { alpha });
  }

  // ------------------------------------------------------------------ scale
  private scale(c: Ctx, t: number) {
    const pal = PAL.scale;
    const tG = this.w(/guaranteed/), tThe = this.w(/^the$/), tAbs = this.w(/abstract/);
    const P = wallPl(0);
    // the log–log plane under the first word: x = log10 C (2 units per decade, 10^18 … 10^24 measured, on to 10^30
    // extrapolated), y = loss, ticks labelled with the real values of L ∝ C^−0.050 (≈ −3.4 % per doubling)
    const X = (lc: number) => (lc - 18) * 0.9, Y = (lc: number) => 7.2 - (lc - 18) * 0.5;
    this.grid3(c, P, 0, X(30), -0.6, 8, 0.9, pal.dim, 1);
    this.seg(c, at(P, 0, -0.6), at(P, X(30), -0.6), pal.hi, 1.6);
    this.seg(c, at(P, 0, -0.6), at(P, 0, 8), pal.hi, 1.6);
    for (let d = 18; d <= 30; d += 3) {
      this.text3(c, `1e${d}`, P, X(d), -1.2, { size: 0.32, fam: MONO, color: pal.hi, align: 'center' });
      this.text3(c, Math.pow(10, -0.05 * (d - 18)).toFixed(2), P, -0.2, Y(d) - 0.1, { size: 0.28, fam: MONO, color: hexA(pal.hi, 0.7), align: 'right' });
    }
    this.text3(c, 'COMPUTE (FLOPs) →', P, X(30), -1.9, { size: 0.32, fam: MONOB, color: pal.hi, align: 'right' });
    this.text3(c, 'LOSS ∝ C', P, 0.3, 8.4, { size: 0.42, fam: MONOB, color: U.mag });
    this.text3(c, '−0.050', P, 0.3 + this.tw3('LOSS ∝ C', { size: 0.42, fam: MONOB }) + 0.05, 8.65, { size: 0.28, fam: MONOB, color: U.mag });
    const line = (a: number, b: number): V3[] => { const out: V3[] = []; for (let i = 0; i <= 30; i++) { const lc = lerp(a, b, i / 30); out.push(at(P, X(lc), Y(lc), 0.02)); } return out; };
    this.pl3(c, line(18, 24), U.mag, 3);
    this.pl3(c, line(24, 30), U.mag, 2, { dash: [8, 7] });
    this.text3(c, 'EXTRAPOLATED', P, X(27.5), Y(27.5) + 0.4, { size: 0.3, fam: MONOB, color: pal.hi, align: 'center' });
    // the staircase: SCALE IS ALL YOU NEED, each word 1.6× the last
    this.steps.forEach((st, i) => {
      if (!st.s || t < st.t - 0.02) return;
      const k = ease.outBack(clamp((t - st.t) / 0.25), 1.6);
      const last = i === this.steps.length - 2;
      this.text3(c, st.s, P, st.x, st.y, { size: st.size * k, fam: WIDE, color: t < (this.Wd.find((x) => x.start >= st.t - 0.01)?.end ?? 0) + 0.1 || last ? U.mag : U.bone, glow: 12, glowColor: U.ink });
      // a riser from this step to the next, like the dashed line going on
      const nx = this.steps[i + 1];
      if (nx && t > nx.t) this.seg(c, at(P, st.x + st.w, st.y - 0.2 * st.size, 0.01), at(P, nx.x, nx.y - 0.2 * nx.size, 0.01), hexA(pal.c, 0.6), 1.5, { dash: [8, 8] });
      this.text3(c, `×${Math.pow(1.6, i).toFixed(i ? 1 : 0)}`, P, st.x, st.y - 0.42 * st.size, { size: 0.22 * st.size, fam: MONO, color: hexA(pal.hi, 0.7) });
    });
    const sg = this.steps[this.steps.length - 1]!;
    if (t > tThe.start - 0.02) this.say3(c, [tThe, tAbs], t, P, sg.x + sg.w / 2, sg.y + 0.95 * sg.size, { size: 0.32 * sg.size, fam: HEAVY, up: '', cur: U.mag, done: U.bone, align: 'center', upper: true, slam: 0.3 });
    this.seal(c, t, wallPl(0.3), sg.x + sg.w / 2, sg.y + 0.15 * sg.size, 0.62 * sg.size, tG.start, tG.end);
  }
}

function sup(n: number) { return String(n).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]).join(''); }
