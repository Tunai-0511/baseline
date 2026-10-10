// Token tiles and packets (TREATMENT §7.1 F7). Owner: fab.
// Machined aluminium tiles (black-anodised tops, bright machined chamfers) whose top face is engraved with a BPE token
// of this song (data/bpe.json: 272 merges, 1,065 tokens = the lyric text + a final line break; 'Ġ' = a leading space,
// engraved as '·'); a tile sliding into the read window IS the token being sung: it travels on a minimum-jerk profile
// and settles (decelerates) exactly when the cursor reaches its first letter, and its engraving lights under the
// reader. Packets travel along polylines the same way. Pure functions of t.
//
//   await fabInit(ctx.lyrics);                                  // loads bpe.json (or: await loadBPE())
//   bpeTokens(ctx.lyrics, word)                                 // → { tokens: ['N', '-', 'gram'], index: [n…] }
//   const row = new TileRow(['·all'], { size: 0.3 });  parent.add(row.obj);   row.setLit(k, state)
//   const f = tileWord({ scene, word, method: 'F7', capH: 0.12, parent });     // tiles + track + reader, one carrier
//   packetAt(points, tDep, tArr, t)                             // position on a path, arriving (slowing) at tArr
//
// Local frame (as every fab face): tiles along +X from x = 0 in the parent's XY plane, the engraved tops facing +Z
// (rotate the parent −π/2 about X for a horizontal conveyor read from above).
// p1v4 (KITS §23): a tile's engraving is dead-front (enamel-filled flush, black) until the reader lights it — the tiles
// waiting in the feed show blank tops (v3 showed their tokens: readable before they were sung); after the line the
// engraving drops to the v4 ash and goes dark (old 'fade', default); neutral graphite bodies; heroIsolate dims them.
import * as THREE from 'three';
import type { Word, Lyrics } from '../engine/lyrics';
import { F } from '../engine/type';
import { LIN } from '../engine/palette';
import { fetchData, fabText, lyricReg, sungState, SUNG_T, type SungState } from '../engine/lyricreg';
import { mat, brushedAsh } from './_mat';
import { textMask, faceDecal, registerFab, fabLong, fabLyrics, letterCursor, bevelBox, capScrew, fabV4, faceRefIn, NEUTRAL, type Decal, type Fab, type FabOpts, type OldMode, type UnsungMode } from './_fab';

/** data/bpe.json (repo data/). */
export interface BPE { about?: string; merges?: number; vocab?: number; tokens: string[]; chars?: number; [k: string]: unknown }
let bpeP: Promise<BPE | null> | null = null;
let bpeData: BPE | null = null;
export function loadBPE(): Promise<BPE | null> {
  bpeP ??= fetchData<BPE>('bpe.json').then((b) => (bpeData = b));
  return bpeP;
}

const normQ = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
let streamCache: { starts: number[]; text: string } | null = null;

/**
 * The BPE tokens that spell one sung word (the token stream aligned to the lyric text): leading-space tokens get '·',
 * pure punctuation at the word's edges is dropped. Falls back to the word itself when bpe.json is not loaded.
 */
export function bpeTokens(ly: Lyrics | null, w: Word): { tokens: string[]; index: number[] } {
  const b = bpeData;
  if (!b || !ly) return { tokens: [fabText(w.w).toLowerCase()], index: [-1] };
  if (!streamCache) {
    const starts: number[] = [];
    let text = '';
    for (const t of b.tokens) { starts.push(text.length); text += t.replace(/Ġ/g, ' ').replace(/Ċ/g, '\n'); }
    streamCache = { starts, text: normQ(text) };
  }
  const S = streamCache;
  // char range of the word in the lyric text (lines joined by '\n')
  let off = 0;
  for (let i = 0; i < w.line; i++) off += ly.lines[i]!.text.length + 1;
  const lt = normQ(ly.lines[w.line]!.text);
  let pos = 0;
  for (let i = 0; i <= w.index; i++) {
    const ww = normQ(ly.lines[w.line]!.words[i]!.w);
    const f = lt.indexOf(ww, pos);
    if (f < 0) break;
    if (i === w.index) pos = f; else pos = f + ww.length;
  }
  const ws = off + pos, we = ws + normQ(w.w).length;
  if (S.text.slice(ws, we) !== normQ(w.w)) return { tokens: [fabText(w.w).toLowerCase()], index: [-1] };
  const toks: string[] = [], idx: number[] = [];
  for (let k = 0; k < b.tokens.length; k++) {
    const a = S.starts[k]!, e = k + 1 < S.starts.length ? S.starts[k + 1]! : S.text.length;
    if (e <= ws || a >= we) continue;
    const raw = b.tokens[k]!;
    toks.push(raw.replace(/Ġ/g, '·').replace(/Ċ/g, ''));
    idx.push(k);
  }
  // drop edge punctuation tokens (',' after 'line') that are not part of the made letters
  while (toks.length > 1 && !/[\p{L}\p{N}]/u.test(toks[toks.length - 1]!)) { toks.pop(); idx.pop(); }
  return { tokens: toks, index: idx };
}

export interface TileOpts {
  /** tile edge (m): the tile is `size` tall (y) and at least `size` wide (longer tokens make longer tiles) */
  size: number;
  /** gap between tiles (m), default 0.08 size */
  gap?: number;
  /** tile thickness as a fraction of size (default 0.35) */
  depth?: number;
  /** engraving cap height as a fraction of size (default 0.34) */
  cap?: number;
  /** engrave the stream index small in the corner (default true) */
  index?: number[];
  /** (p1v4) the engravings' v4 look (defaults FAB_V4) */
  old?: OldMode;
  unsung?: UnsungMode;
}

interface Tile { g: THREE.Group; body: THREE.Mesh; dc: Decal; num: Decal | null; x: number; w: number; tx0: number; tx1: number }

/**
 * A row of token tiles. Local frame: tiles along +X from 0, tops (engraved) facing +Z, tile bottoms at y = 0.
 * `tiles[k].g.position.x` may be animated (tileWord does); `setSung(k, state, span)` drives the engraving.
 */
export class TileRow {
  obj = new THREE.Group();
  tiles: Tile[] = [];
  width = 0;
  readonly capH: number;
  readonly depth: number;
  constructor(public tokens: string[], public o: TileOpts) {
    const s = o.size, gap = o.gap ?? s * 0.08, D = (o.depth ?? 0.35) * s;
    this.capH = (o.cap ?? 0.34) * s; this.depth = D;
    const fam = F.mono(700), famN = F.mono(400);
    const body = mat('anodInk', { base: [NEUTRAL.graphite[0] * 0.16, NEUTRAL.graphite[1] * 0.16, NEUTRAL.graphite[2] * 0.16], rough: 0.4 });
    let x = 0;
    tokens.forEach((tok, k) => {
      const mk = textMask(tok, fam, { capPx: 128 });
      const tw = mk.width * this.capH;
      const w = Math.max(s, tw + s * 0.5);
      const g = new THREE.Group(); g.position.x = x;
      const bm = new THREE.Mesh(bevelBox(w, s, D, Math.min(s, D) * 0.16, 3), body);
      bm.position.set(w / 2, s / 2, D / 2);
      g.add(bm);
      const dc = faceDecal(mk, this.capH, { finish: 'groove', body: [NEUTRAL.ash[0], NEUTRAL.ash[1], NEUTRAL.ash[2]], wall: 0.022, slope: 2.2, old: o.old, unsung: o.unsung });
      const tx0 = (w - tw) / 2;
      dc.mesh.position.set(tx0, s * 0.5 - this.capH * 0.62, D + dc.mesh.position.z);
      g.add(dc.mesh);
      let num: Decal | null = null;
      const ix = o.index?.[k];
      if (ix !== undefined && ix >= 0) {
        const nm = textMask(String(ix).padStart(4, '0'), famN, { capPx: 64 });
        num = faceDecal(nm, s * 0.07, { finish: 'groove', wall: 0.12 });
        num.mesh.position.set(w - s * 0.1 - nm.width * s * 0.07, s * 0.09, D + num.mesh.position.z);
        num.setSung({ t: 0, cursor: 1, hotW: 0, ash: 1, dead: 0, glow: 1, preview: 0, started: true, done: true });
        g.add(num.mesh);
      }
      this.obj.add(g);
      this.tiles.push({ g, body: bm, dc, num, x, w, tx0, tx1: tx0 + tw });
      x += w + gap;
    });
    this.width = Math.max(0, x - gap);
    this.obj.name = 'tiles';
  }
  /** Engraving state of tile k; `span` = the word's [x0, x1] in this tile's text-local x (for a multi-tile word). */
  setSung(k: number, s: SungState, span?: [number, number]) {
    const t = this.tiles[k];
    if (!t) return;
    t.dc.setSung(s);
    if (span) ((t.dc.mat.uniforms.uSungSpan!.value) as THREE.Vector4).set(span[0], span[1], t.dc.capH, 0);
    t.dc.orient();
    t.num?.orient();
  }
  /** Read position / window at t: a static row has nothing to animate (tileWord drives the tiles). */
  update(_t: number) {}
}

const mj = (u: number) => { const x = Math.max(0, Math.min(1, u)); return x * x * x * (x * (x * 6 - 15) + 10); };

/** Position along a polyline (world or local points) leaving at tDep and arriving — decelerating — at tArr. */
export function packetAt(points: readonly THREE.Vector3[], tDep: number, tArr: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  const u = mj((t - tDep) / Math.max(1e-6, tArr - tDep));
  const L: number[] = [0];
  for (let i = 1; i < points.length; i++) L.push(L[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
  const s = u * L[L.length - 1]!;
  for (let i = 1; i < points.length; i++) if (s <= L[i]! || i === points.length - 1) {
    const f = (s - L[i - 1]!) / Math.max(1e-9, L[i]! - L[i - 1]!);
    return out.copy(points[i - 1]!).lerp(points[i]!, Math.max(0, Math.min(1, f)));
  }
  return out.copy(points[0] ?? new THREE.Vector3());
}

/**
 * F7: the word's BPE tokens as tiles that slide in from the feed (right) along a machined track and settle in the read
 * window, each exactly when the cursor reaches its first letter; the reader's slit light makes the engraving glow.
 * Hardware: the track plate, guide rails, the window frame with its reader bar, end stops. capH = engraving cap height.
 */
export function tileWord(o: FabOpts & { size?: number; travel?: number }): Fab {
  const ly = fabLyrics();
  const { tokens, index } = bpeTokens(ly, o.word);
  const size = o.size ?? (o.capH > 0 ? o.capH / 0.34 : 0.3);
  const row = new TileRow(tokens, { size, index, old: o.old, unsung: o.unsung });
  const root = new THREE.Group(); root.name = `fab_F7_${tokens.join('')}`;
  const ax = o.align === 'center' ? -row.width / 2 : o.align === 'right' ? -row.width : 0;
  row.obj.position.x = ax;
  root.add(row.obj);
  const s = size, D = row.depth;
  const travel = o.travel ?? row.width + s * 0.35;
  if (o.hardware !== false) {
    const steel = mat('steelGraphite'), ash = brushedAsh(), anod = mat('anodInk');
    const L = row.width + travel + s * 0.9;
    const x0 = ax - s * 0.5;
    // the track plate behind the tiles and the two guide rails (above / below)
    const plate = new THREE.Mesh(bevelBox(L, s * 1.9, s * 0.12, s * 0.03), anod);
    plate.position.set(x0 + L / 2, s / 2, -s * 0.06);
    root.add(plate);
    for (const y of [-s * 0.09, s * 1.09]) {
      const rail = new THREE.Mesh(bevelBox(L, s * 0.14, D * 0.75, s * 0.03), ash);
      rail.position.set(x0 + L / 2, y, D * 0.375);
      root.add(rail);
    }
    // read window: a frame around the tiles' resting places, the reader bar above with its slit
    const fw = row.width + s * 0.3;
    const frame = (w: number, h: number, x: number, y: number) => { const m = new THREE.Mesh(bevelBox(w, h, s * 0.12, s * 0.02), steel); m.position.set(x, y, D + s * 0.08); root.add(m); };
    frame(s * 0.1, s * 1.5, ax - s * 0.15, s / 2);
    frame(s * 0.1, s * 1.5, ax + row.width + s * 0.15, s / 2);
    const reader = new THREE.Mesh(bevelBox(fw + s * 0.2, s * 0.28, s * 0.36, s * 0.04), anod);
    reader.position.set(ax + row.width / 2, s * 1.42, D + s * 0.1);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(fw, s * 0.03, s * 0.02), mat('ceramic', { emit: [0.78, 0.76, 0.82], emitK: 0.9 }));
    slit.position.set(ax + row.width / 2, s * 1.28, D + s * 0.26);
    root.add(reader, slit);
    for (const sx of [-1, 1]) { const sc = capScrew(s * 0.08, steel, anod); sc.position.set(ax + row.width / 2 + sx * (fw / 2), s * 1.42, D + s * 0.28); root.add(sc); }
    // the end stop at the far left
    const stop = new THREE.Mesh(bevelBox(s * 0.16, s * 1.1, D * 1.2, s * 0.03), steel);
    stop.position.set(ax - s * 0.3, s / 2, D * 0.6);
    root.add(stop);
  }
  o.parent?.add(root);
  // the word's cursor over the made letters (tokens without '·'), each tile = its share of the letters
  const text = o.text ?? tokens.join('').replace(/·/g, '');
  const letters: [number, number][] = [];
  const tileOfLetter: number[] = [];
  row.tiles.forEach((tl, k) => {
    const tok = tokens[k]!.replace(/·/g, '');
    const n = Math.max(1, Array.from(tok).length), lead = tokens[k]!.startsWith('·') ? 1 : 0;
    const cw = (tl.tx1 - tl.tx0) / (n + lead);
    for (let j = 0; j < n; j++) { letters.push([tl.x + tl.tx0 + (j + lead) * cw, tl.x + tl.tx0 + (j + lead + 1) * cw]); tileOfLetter.push(k); }
  });
  const map = letterCursor(o.word, text, letters.length === Array.from(text).length ? letters : letters.slice(0, 1));
  const capH = row.capH;
  const X0 = letters[0]?.[0] ?? 0, X1 = letters[letters.length - 1]?.[1] ?? row.width;
  const sung = (t: number): SungState => {
    const st = sungState(o.word, t, { lineEnd: o.lineEnd, deprecateT: o.deprecateT, method: 'F7' });
    const c = map(st.cursor), back = map(sungState(o.word, t - SUNG_T.hot).cursor);
    st.cursor = c; st.hotW = Math.min(Math.max(0, c - back), (0.45 * capH) / Math.max(1e-6, X1 - X0)); st.started = c > 0;
    return st;
  };
  // tile k arrives when the cursor reaches its first letter
  const firstU = row.tiles.map((_, k) => { const i = tileOfLetter.indexOf(k); return i < 0 ? 0 : (letters[i]![0] - X0) / Math.max(1e-6, X1 - X0); });
  const arrive = firstU.map((u) => {
    if (u <= 0) return o.word.start - 0.02;
    let lo = o.word.start, hi = o.word.end;
    for (let i = 0; i < 36; i++) { const m = (lo + hi) / 2; if (sung(m).cursor < u) lo = m; else hi = m; }
    return hi - 0.02;
  });
  const T = 0.42;
  const y0 = row.tiles[0] ? s * 0.5 - capH * 0.62 : 0;
  const box = new THREE.Box3(new THREE.Vector3(X0, y0, D), new THREE.Vector3(X1, y0 + capH, D));
  const face = faceRefIn(row.obj, text);
  const carrier = registerFab({ ...o, method: 'F7', text }, text, face, box, capH, sung);
  const v4 = fabV4(o, carrier, () => row.tiles.map((tl) => tl.dc.mat), [face]);
  return {
    obj: root, carriers: [carrier], width: row.width, capH, method: 'F7',
    phase: v4.phase, oldAt: v4.oldAt, center: v4.center, iso: v4.iso,
    update(t) {
      const st = sung(t);
      v4.settle(st);
      void fabLong;
      row.tiles.forEach((tl, k) => {
        const u = (t - (arrive[k]! - T)) / T;
        tl.g.position.x = tl.x + travel * (1 - mj(u));
        // the engraving in word coordinates: map the word's [X0, X1] into this tile's decal-local x
        const off = tl.x + tl.tx0;
        row.setSung(k, st, [X0 - off, X1 - off]);
      });
    },
    cursor(t) { const st = sung(t); return !st.started || st.done ? null : row.obj.localToWorld(new THREE.Vector3(X0 + (X1 - X0) * st.cursor, y0 + capH / 2, D)); },
    dispose() { root.removeFromParent(); lyricReg.unregister(carrier.id); },
  };
}
