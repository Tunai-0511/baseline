// The film's formulas at run time. scripts/eq.ts typesets app/eq.json with MathJax into public/eq/<key>.svg (glyphs
// as paths, ink = currentColor) and public/eq/index.json (each box in em). loadEq() rasterizes every formula once, in
// white, at PX_PER_EM; eqImage() hands out tinted copies (made synchronously from the white raster, then cached), so
// drawing never waits on anything after boot.

export interface EqBox { w: number; h: number; d: number }
export interface EqImage { img: HTMLCanvasElement; box: EqBox }

/** raster resolution: pixels per em (a formula 1 em tall on screen at up to ~110 px stays sharp) */
export const PX_PER_EM = 110;

const BOX = new Map<string, EqBox>();
const WHITE = new Map<string, HTMLCanvasElement>();
const TINT = new Map<string, EqImage>();
let ready: Promise<void> | null = null;

async function rasterize(key: string, box: EqBox) {
  const r = await fetch(`eq/${key}.svg`);
  if (!r.ok) throw new Error(`eq/${key}.svg: ${r.status}`);
  const w = Math.ceil(box.w * PX_PER_EM), h = Math.ceil(box.h * PX_PER_EM);
  // an explicit pixel size (the file says ex, which an <img> would resolve against a default font)
  const svg = (await r.text())
    .replace(/currentColor/g, '#FFFFFF')
    .replace(/ width="[^"]+"/, ` width="${w}px"`)
    .replace(/ height="[^"]+"/, ` height="${h}px"`)
    .replace(/ style="[^"]*"/, '');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d')!.drawImage(im, 0, 0, w, h);
    WHITE.set(key, cv);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Rasterize every formula of public/eq/index.json (once; later calls share the same promise). */
export function loadEq(): Promise<void> {
  ready ??= (async () => {
    const r = await fetch('eq/index.json');
    if (!r.ok) return;
    const idx = (await r.json()) as Record<string, EqBox>;
    for (const [k, b] of Object.entries(idx)) BOX.set(k, b);
    await Promise.all(Object.entries(idx).map(([k, b]) => rasterize(k, b).catch((e) => console.error(String(e)))));
  })();
  return ready;
}

/** A formula's box in em (null if unknown). */
export function eqBox(key: string): EqBox | null { return BOX.get(key) ?? null; }

/** The formula in a colour (#rrggbb), or null if it is not loaded. */
export function eqImage(key: string, color: string): EqImage | null {
  const id = `${key}|${color}`;
  const hit = TINT.get(id);
  if (hit) return hit;
  const white = WHITE.get(key), box = BOX.get(key);
  if (!white || !box) return null;
  const cv = document.createElement('canvas');
  cv.width = white.width; cv.height = white.height;
  const g = cv.getContext('2d')!;
  g.drawImage(white, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, cv.width, cv.height);
  const e = { img: cv, box };
  TINT.set(id, e);
  return e;
}
