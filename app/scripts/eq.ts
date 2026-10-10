#!/usr/bin/env bun
// The film's formulas, typeset at build time by MathJax 3 (mathjax-full) in bun — no TeX install needed.
//   bun scripts/eq.ts            typeset every entry of app/eq.json into public/eq/<key>.svg + public/eq/index.json
// Each SVG keeps currentColor (the plates pick the ink colour when they rasterize it, src/scenes/_eq.ts); glyphs are
// inline <path>s (fontCache 'none'). index.json: per key the box in em — w, h (top to bottom) and d (below baseline).
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const APP = path.resolve(import.meta.dir, '..');
const REG = path.join(APP, 'eq.json');
const OUT = path.join(APP, 'public/eq');

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams', 'boldsymbol'] }),
  OutputJax: new SVG({ fontCache: 'none' }),
});

function typeset(src: string): { svg: string; w: number; h: number; d: number } {
  const node = doc.convert(src, { display: true, em: 16, ex: 8, containerWidth: 4000 });
  let svg = adaptor.innerHTML(node);
  // MathJax reports TeX errors inside the SVG (data-mjx-error) instead of throwing
  const err = /data-mjx-error="([^"]*)"/.exec(svg);
  if (err) throw new Error(`TeX error in ${JSON.stringify(src)}: ${err[1]}`);
  // table and fraction rules get their width from MathJax's stylesheet, which a standalone SVG doesn't carry
  svg = svg.replace(/<line (?![^>]*stroke-width)/g, '<line stroke-width="70" ');
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg);
  if (!vb) throw new Error(`no viewBox for ${src}`);
  const [, , y0, w, h] = vb.map(Number) as number[];
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`, w: w! / 1000, h: h! / 1000, d: (h! + y0!) / 1000 };
}

const reg: Record<string, string> = JSON.parse(readFileSync(REG, 'utf8'));
mkdirSync(OUT, { recursive: true });
const index: Record<string, { w: number; h: number; d: number }> = {};
let bad = 0;
for (const [k, src] of Object.entries(reg)) {
  if (k.startsWith('_')) continue;
  try {
    const r = typeset(src);
    writeFileSync(path.join(OUT, `${k}.svg`), r.svg);
    index[k] = { w: +r.w.toFixed(4), h: +r.h.toFixed(4), d: +r.d.toFixed(4) };
  } catch (e) {
    bad++;
    console.error(String(e));
  }
}
writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
console.log(`${Object.keys(index).length} formulas -> public/eq/${bad ? `  (${bad} failed)` : ''}`);
if (bad) process.exit(1);
