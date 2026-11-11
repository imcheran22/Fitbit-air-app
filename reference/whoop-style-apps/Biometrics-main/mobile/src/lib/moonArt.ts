// The hero's pixel moon (spec §2.1), copied from the approved board (Main.dc.html). Colours are fixed in both themes.
import type { PixelRect } from './weatherArt';

const r = (x: number, y: number, w: number, h: number, fill: string): PixelRect => ({ x, y, w, h, fill });

export const MOON_GRID = { w: 25, h: 20 } as const;

export const MOON_ART: PixelRect[] = [
  // Stars.
  r(2, 3, 1, 1, '#E0E7FF'), r(21, 2, 1, 1, '#E0E7FF'), r(19, 14, 1, 1, '#C7D2FE'), r(4, 15, 1, 1, '#C7D2FE'), r(22, 9, 1, 1, '#E0E7FF'),
  // The crescent, light at the top to deep violet at the bottom.
  r(10, 2, 5, 1, '#C4B5FD'), r(8, 3, 5, 1, '#C4B5FD'), r(7, 4, 4, 2, '#A78BFA'), r(6, 6, 4, 6, '#A78BFA'),
  r(7, 12, 4, 2, '#8B5CF6'), r(8, 14, 5, 1, '#8B5CF6'), r(10, 15, 6, 1, '#7C3AED'), r(15, 14, 3, 1, '#7C3AED'),
  // The sparkle.
  r(16, 5, 1, 3, '#FDE68A'), r(15, 6, 3, 1, '#FDE68A'),
];
