// v3 stop, L64–L65 ("Every "all you need" becomes a footnote in the end, / cite me in related work, remember me, my
// friend"): FOOTNOTE. The music stops. In the dark the four claims hang large for a moment, then each shrinks to a
// superscript mark and drops to the bottom of the frame as a footnote line. "Cite me in related work": a long dark
// wall, and on it, one after another, the names of everything this film has sung — from PERCEPTRON to FLASHATTENTION
// — set like a memorial, lit plate by plate. "Remember me, my friend": the newest plate, ATTENTION · 2017, the last
// lit; a cursor blinks after it.
// Style: night memorial — near-black, bone type, one warm light per plate; the claims in their pre-chorus colours.
import type { Frame, PostOverrides } from '../engine/scene';
import { VScene, Rig, K, type V3, type Pl, at, floorPl, wallPl, frameMarks, pool, tc, clamp, lerp, ease, hexA, mixHex, hot, F, W, H, U, type Ctx } from './_v';
import type { Word } from '../engine/lyrics';

const BG = '#0B0A0D', BONE = '#EDEAF2', ASH = '#77727F', WARM = '#EDEAF2', MAG = '#FF2E7E';
const WIDE = F.archivo(125, 900), HEAVY = F.archivo(112, 900), MONO = F.mono(500), MONOB = F.mono(700), SERIF = F.serif(600, false), ITAL = F.serif(600, true);
const CLAIMS: [string, string][] = [["MEMORY'S ALL YOU NEED", '#EDEAF2'], ['DEPTH IS ALL YOU NEED', '#EDEAF2'], ["ATTENTION'S ALL YOU NEED", '#FF2E7E'], ['SCALE IS ALL YOU NEED', '#EDEAF2']];
const NAMES: [string, string][] = [
  ['PERCEPTRON', '1958'], ['MULTI-LAYER PERCEPTRON', '1986'], ['SIGMOID', '1986'], ['RELU', '2010'], ['SIFT', '1999'], ['HOG', '2005'], ['CONVOLUTION', '1989'], ['SVM', '1995'],
  ['KERNEL TRICK', '1992'], ['N-GRAM', '1948'], ['RNN', '1986'], ['LSTM', '1997'], ['SEQ2SEQ', '2014'], ['ATTENTION (ADDITIVE)', '2014'], ['GAN', '2014'], ['DIFFUSION', '2015'],
  ['ROPE', '2021'], ['RMSNORM', '2019'], ['SWIGLU', '2020'], ['MIXTURE OF EXPERTS', '2017'], ['INT4', '2022'], ['LORA', '2021'], ['IN-CONTEXT LEARNING', '2020'], ['BERT', '2018'],
  ['RLHF', '2017'], ['DPO', '2023'], ['FLASHATTENTION', '2022'], ['SELF-ATTENTION · TRANSFORMER', '2017'],
];

export default class Stop extends VScene {
  private L64!: Word[]; private L65!: Word[];

  override init() {
    this.bg = BG;
    const ly = this.ctx.lyrics;
    const i0 = ly.lines.findIndex((l) => l.words[0]!.start >= this.ctx.start - 0.3);
    this.L64 = ly.lines[i0]!.words; this.L65 = ly.lines[i0 + 1]!.words;
    const s = this.ctx.start, e = this.ctx.end;
    const t65 = this.L65[0]!.start, tRem = this.L65.find((w) => /remember/.test(w.w))!.start;
    this.rig = new Rig([
      { t0: s, name: 'dark', key: (t) => { const tf = this.L64.find((w) => /footnote/.test(w.w))!.start; const k = ease.inOutQuad(clamp((t - s) / (t65 - s))); const kf = ease.inOutCubic(clamp((t - tf) / (t65 - tf))); return K([lerp(0, -6.2, kf), lerp(0.2, -4.4, kf), lerp(18 - 2 * k, 6.5, kf)], [lerp(0, -6.2, kf), lerp(0.2, -4.9, kf), 0], 44); } },
      { t0: t65 - 0.05, snap: 0.9, name: 'wall', key: (t) => { const k = ease.inOutQuad(clamp((t - t65) / (e - t65))); const x = lerp(-22, 26, k); return K([x + 2.0, 1.6, 7.5], [x + 3.5, 1.4, -6], 44, 0); } },
    ], [], 0.5, 171);
    void tRem;
  }

  frame(c: Ctx, t: number, f: Frame): PostOverrides {
    void f;
    const L64 = this.L64, L65 = this.L65;
    const tEvery = L64[0]!, tBecomes = L64.find((w) => /becomes/.test(w.w))!, tFoot = L64.find((w) => /footnote/.test(w.w))!, t65 = L65[0]!, tRel = L65.find((w) => /related/.test(w.w))!, tRem = L65.find((w) => /remember/.test(w.w))!, tFriend = L65.find((w) => /friend/.test(w.w))!;
    // ------------------------------------------------ the claims, then footnotes
    if (t < t65.start + 0.4) {
      const shrink = ease.inOutCubic(clamp((t - tFoot.start + 0.1) / 0.8));
      const out = 1 - clamp((t - t65.start) / 0.4);
      const P = wallPl(0);
      CLAIMS.forEach(([s, col], i) => {
        const ti = tEvery.start + i * 0.12;
        if (t < ti) return;
        const a = clamp((t - ti) / 0.3) * out;
        const y0 = 3.2 - i * 1.5, y1 = -5.3 + (3 - i) * 0.0;
        const y = lerp(y0, y1 - i * 0.42, shrink);
        const x = lerp(0, -8.5, shrink);
        const size = lerp(1.05, 0.34, shrink);
        if (shrink < 0.98) this.text3(c, s, P, x, y, { size, fam: WIDE, color: hexA(col, a), align: shrink > 0.5 ? 'left' : 'center' });
        if (shrink > 0.5) {
          const fa = clamp((shrink - 0.5) / 0.4) * a;
          this.text3(c, `${i + 1}`, P, -8.95, y + 0.16, { size: 0.26, fam: MONOB, color: hexA(col, fa) });
          if (shrink >= 0.98) this.text3(c, `${s.charAt(0)}${s.slice(1).toLowerCase()}.`, P, -8.5, y, { size: 0.36, fam: ITAL, color: hexA(BONE, fa * 0.9) });
        }
      });
      // the footnote rule
      if (shrink > 0.3) this.seg(c, at(P, -9.0, -4.6), at(P, -5.0, -4.6), hexA(BONE, 0.6 * out * clamp((shrink - 0.3) / 0.3)), 1.2);
      // the line itself, small and quiet at the top
      c.save(); c.globalAlpha *= out; c.textAlign = 'center'; c.font = `36px "${SERIF}"`; c.fillStyle = BONE;
      const sung = L64.filter((w) => t >= w.start).map((w) => w.w.replace(/[“”]/g, '"')).join(' ');
      c.fillText(sung, W / 2, 140);
      c.restore();
      void tBecomes;
    }
    // ------------------------------------------------ the memorial wall
    if (t > t65.start - 0.3) {
      const a = clamp((t - t65.start + 0.3) / 0.6);
      const wall: Pl = wallPl(-6);
      this.rect3(c, wall, -30, -2.4, 64, 6.4, { fill: hexA('#0E0D10', a), stroke: hexA(ASH, 0.4 * a), lw: 1 });
      // plates in two rows, lit one by one across the line
      const nN = NAMES.length;
      const dur = tFriend.start - t65.start;
      NAMES.forEach(([nm, yr], i) => {
        const col = Math.floor(i / 2), row = i % 2;
        const x = -26 + col * 3.85, y = row ? -1.2 : 1.6;
        const ti = t65.start + (i / (nN - 1)) * dur;
        const lit = clamp((t - ti) / 0.35);
        const last = i === nN - 1;
        const P: Pl = { o: at(wall, x, y, 0.02), r: wall.r, u: wall.u };
        this.rect3(c, P, -1.8, -0.75, 3.6, 1.5, { fill: hexA(mixHex('#141217', '#2A2016', lit), a), stroke: hexA(last ? MAG : WARM, (0.15 + 0.6 * lit) * a), lw: 1 });
        const fs = Math.min(0.26, 3.2 / Math.max(1, nm.length * 0.62));
        this.text3(c, nm, P, 0, 0.12, { size: fs, fam: MONOB, color: hexA(last ? '#FFFFFF' : BONE, (0.12 + 0.88 * lit) * a), align: 'center', mid: true });
        this.text3(c, yr, P, 0, -0.45, { size: 0.2, fam: MONO, color: hexA(last ? MAG : WARM, (0.1 + 0.8 * lit) * a), align: 'center', mid: true });
        // a small warm light over each lit plate
        if (lit > 0) { const q = this.pr(at(P, 0, 0.95, 0.05)); if (q.z > this.near) { c.save(); c.globalCompositeOperation = 'lighter'; const R = 80 * Math.min(1.5, q.k / 60); const g = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, R); g.addColorStop(0, hexA(last ? MAG : WARM, 0.35 * lit * a)); g.addColorStop(1, hexA(WARM, 0)); c.fillStyle = g; c.fillRect(q.x - R, q.y - R, 2 * R, 2 * R); c.restore(); } }
        if (last && t > tFriend.start) {
          // the cursor after the newest name
          const blink = Math.floor((t - tFriend.start) * 2.5) % 2 ? 0.15 : 1;
          this.rect3(c, P, 1.95, -0.3, 0.16, 0.6, { fill: hexA(BONE, blink * a) });
        }
      });
      // the line, engraved along the top of the wall as the camera passes
      const top: Pl = { o: at(wall, 0, 3.4, 0.03), r: wall.r, u: wall.u };
      const camX = this.key.tg[0];
      this.say3(c, L65.slice(0, L65.indexOf(tRem)), t, { ...top, o: at(wall, Math.min(camX - 2, 6), 3.0, 0.03) }, 0, 0, { size: 0.55, fam: SERIF, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, text: (w) => w.w.replace(',', '') });
      if (t > tRem.start - 0.05) this.say3(c, L65.slice(L65.indexOf(tRem)), t, { ...top, o: at(wall, camX + 1, -3.4, 0.03) }, 0, 0, { size: 0.55, fam: SERIF, up: '', cur: U.mag, done: BONE, align: 'center', upper: true, text: (w) => w.w.replace(',', '') });
      this.text3(c, 'RELATED WORK', wall, -29.2, 3.6, { size: 0.36, fam: MONOB, color: hexA(ASH, a) });
      void tRel;
    }
    frameMarks(c, U.ash, { tl: 'BASELINE · FOOTNOTE', tr: t < t65.start ? '' : 'RELATED WORK', bl: '', br: tc(t), alpha: 0.4 });
    void pool; void floorPl; void H;
    return { bloom: 0.6, bloomThreshold: 0.6, halation: 0.15, ca: 0.15, grain: 0.06, vignette: 0.45 };
  }
}
