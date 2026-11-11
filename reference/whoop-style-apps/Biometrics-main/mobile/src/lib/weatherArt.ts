// Pixel weather (spec §3.0). Rect lists copied from the approved board (Combined.dc.html) where it
// has art; the rest drawn on the same grids and palette. Colours are fixed in both themes.
import type { WeatherKey } from './recoveryCopy';

export type PixelRect = { x: number; y: number; w: number; h: number; fill: string };
const r = (x: number, y: number, w: number, h: number, fill: string): PixelRect => ({ x, y, w, h, fill });

const SUN_HI = '#FDE68A', SUN_MID = '#FCD34D', SUN = '#FBBF24', SUN_LO = '#F59E0B';
const CLOUD = '#E5E7EB', CLOUD_HI = '#F3F4F6', CLOUD_LO = '#9CA3AF', GREY = '#D1D5DB';
const STORM = '#6B7280', STORM_LO = '#4B5563';

export const HERO_ART: Record<WeatherKey, PixelRect[]> = {
  // Board hero (Good): sun behind a cloud.
  mostlyClear: [
    r(9, 1, 6, 1, SUN_HI), r(7, 2, 10, 1, SUN_MID), r(6, 3, 12, 7, SUN), r(7, 10, 10, 1, SUN_LO), r(9, 11, 6, 1, SUN_LO),
    r(11, 0, 2, 1, SUN_HI), r(3, 6, 2, 1, SUN_HI), r(19, 5, 2, 1, SUN_HI),
    r(14, 9, 8, 1, CLOUD), r(12, 10, 13, 1, CLOUD_HI), r(11, 11, 16, 4, CLOUD), r(12, 15, 14, 1, CLOUD_LO), r(15, 10, 3, 1, '#FFFFFF'),
  ],
  // New: a centred sun with four rays.
  clear: [
    r(11, 4, 6, 1, SUN_HI), r(9, 5, 10, 1, SUN_MID), r(8, 6, 12, 7, SUN), r(9, 13, 10, 1, SUN_LO), r(11, 14, 6, 1, SUN_LO),
    r(13, 1, 2, 2, SUN_HI), r(13, 16, 2, 2, SUN_HI), r(4, 9, 2, 2, SUN_HI), r(22, 9, 2, 2, SUN_HI),
  ],
  // New: a plain grey cloud, no rain (decision 1).
  cloudy: [
    r(10, 5, 8, 1, GREY), r(8, 6, 13, 1, CLOUD), r(6, 7, 17, 1, CLOUD_HI), r(5, 8, 19, 5, GREY), r(6, 13, 17, 1, CLOUD_LO), r(11, 6, 3, 1, CLOUD_HI),
  ],
  // New: a dark cloud with lightning.
  stormy: [
    r(10, 2, 8, 1, STORM), r(8, 3, 13, 1, STORM), r(6, 4, 17, 6, STORM), r(7, 10, 15, 1, STORM_LO),
    r(14, 11, 3, 1, SUN), r(13, 12, 3, 1, SUN), r(12, 13, 5, 1, SUN), r(14, 14, 2, 1, SUN), r(13, 15, 2, 1, SUN), r(13, 16, 1, 1, SUN_LO),
  ],
  // New: a dotted grey sun outline (cold start).
  building: [
    r(12, 3, 1, 1, STORM), r(15, 3, 1, 1, STORM), r(9, 5, 1, 1, STORM), r(18, 5, 1, 1, STORM), r(8, 8, 1, 1, STORM), r(19, 8, 1, 1, STORM),
    r(8, 11, 1, 1, STORM), r(19, 11, 1, 1, STORM), r(9, 14, 1, 1, STORM), r(18, 14, 1, 1, STORM), r(12, 16, 1, 1, STORM), r(15, 16, 1, 1, STORM),
  ],
  // New: an empty sky, three grey dashes.
  none: [r(6, 9, 4, 1, STORM_LO), r(12, 9, 4, 1, STORM_LO), r(18, 9, 4, 1, STORM_LO)],
};

export const SMALL_ART: Record<WeatherKey, PixelRect[]> = {
  clear: [r(3, 3, 5, 5, SUN), r(5, 1, 1, 1, SUN_HI), r(1, 5, 1, 1, SUN_HI), r(9, 5, 1, 1, SUN_HI), r(5, 9, 1, 1, SUN_HI)],
  mostlyClear: [r(2, 2, 5, 5, SUN), r(4, 5, 6, 3, CLOUD)],
  cloudy: [r(1, 4, 9, 4, CLOUD_LO), r(3, 3, 5, 1, CLOUD_LO)],
  stormy: [r(1, 3, 9, 4, STORM), r(3, 2, 5, 1, STORM), r(5, 7, 2, 1, SUN), r(4, 8, 2, 1, SUN), r(5, 9, 1, 1, SUN)],
  building: [r(4, 2, 1, 1, STORM), r(6, 2, 1, 1, STORM), r(2, 4, 1, 1, STORM), r(8, 4, 1, 1, STORM), r(2, 6, 1, 1, STORM), r(8, 6, 1, 1, STORM), r(4, 8, 1, 1, STORM), r(6, 8, 1, 1, STORM)],
  none: [r(3, 5, 5, 1, STORM_LO)],
};
