import { hexToLinear } from './util';

// Baseline palette: cool violet-black ink, cold paper white, and one hot accent that always
// means "the current state of the art". Everything that has been superseded goes to ash/graphite.
export const HEX = {
  ink: '#0B0A0D', // background black (faintly violet)
  ink2: '#16141A', // raised black (panels, paper-in-the-dark)
  graphite: '#5C5966', // superseded rows, dim lines, secondary text
  ash: '#9A96A3', // mid grey
  bone: '#EDEAF2', // cold paper white, primary text
  signal: '#FF2E7E', // hot magenta: the current #1 (SOTA), the sung word
  ember: '#FF9CC4', // pale pink core of the accent (glows)
  blood: '#A3104A', // deep magenta shadow of the accent
  acid: '#C8FF2E', // rare: reserved for one moment
} as const;

export type PaletteKey = keyof typeof HEX;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
