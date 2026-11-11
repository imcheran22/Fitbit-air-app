// Profile's pixel art (boards S2 and ID-2): a 10×10 icon per category card, and the passport photo's sky.
// Rects in art cells, drawn like weatherArt's (integer scale, no shapeRendering).

import type { ProfileCategory } from './profileCopy';
import type { PixelRect } from './weatherArt';

type Row = [number, number, number, number, string];
const rects = (rows: Row[]): PixelRect[] => rows.map(([x, y, w, h, fill]) => ({ x, y, w, h, fill }));

export const CATEGORY_ICON_SIZE = 10;

export const CATEGORY_ICONS: Record<ProfileCategory, PixelRect[]> = {
  kipColour: rects([[2, 0, 6, 1, '#E5E7EB'], [1, 1, 8, 1, '#E5E7EB'], [0, 2, 10, 6, '#E5E7EB'], [1, 8, 4, 1, '#E5E7EB'], [6, 7, 3, 2, '#0A0B0E'], [2, 2, 2, 2, '#FB7185'], [5, 2, 2, 2, '#3B82F6'], [7, 4, 2, 2, '#FDE047'], [2, 5, 2, 2, '#6EE7B7']]),
  health: rects([[1, 1, 3, 1, '#F87171'], [6, 1, 3, 1, '#F87171'], [0, 2, 10, 3, '#F87171'], [1, 5, 8, 1, '#F87171'], [2, 6, 6, 1, '#EF4444'], [3, 7, 4, 1, '#EF4444'], [4, 8, 2, 1, '#DC2626'], [1, 2, 2, 1, '#FCA5A5']]),
  timezone: rects([[3, 0, 4, 1, '#60A5FA'], [1, 1, 8, 1, '#60A5FA'], [0, 2, 10, 6, '#60A5FA'], [1, 8, 8, 1, '#3B82F6'], [3, 9, 4, 1, '#3B82F6'], [2, 3, 3, 2, '#4ADE80'], [6, 5, 2, 2, '#4ADE80']]),
  notifications: rects([[4, 0, 2, 1, '#FBBF24'], [3, 1, 4, 1, '#FBBF24'], [2, 2, 6, 5, '#FBBF24'], [1, 7, 8, 1, '#F59E0B'], [4, 8, 2, 2, '#F59E0B'], [3, 2, 1, 3, '#FDE68A']]),
  buddies: rects([[1, 1, 3, 3, '#C4B5FD'], [6, 1, 3, 3, '#FB7185'], [0, 5, 5, 4, '#A78BFA'], [5, 5, 5, 4, '#F43F5E']]),
  chats: rects([[0, 1, 10, 6, '#A5B4FC'], [1, 0, 8, 1, '#A5B4FC'], [1, 7, 3, 1, '#818CF8'], [1, 8, 1, 1, '#818CF8'], [2, 3, 1, 1, '#1E1B4B'], [5, 3, 1, 1, '#1E1B4B'], [8, 3, 1, 1, '#1E1B4B']]),
  coach: rects([[2, 1, 6, 1, '#FDE68A'], [1, 2, 8, 5, '#FBBF24'], [2, 7, 6, 1, '#F59E0B'], [3, 4, 1, 1, '#1F2937'], [6, 4, 1, 1, '#1F2937'], [3, 8, 4, 2, '#64748B']]),
  aiCoach: rects([[1, 1, 8, 8, '#64748B'], [2, 2, 6, 6, '#94A3B8'], [3, 3, 4, 4, '#334155'], [0, 3, 1, 1, '#94A3B8'], [9, 3, 1, 1, '#94A3B8'], [0, 6, 1, 1, '#94A3B8'], [9, 6, 1, 1, '#94A3B8']]),
  signIn: rects([[3, 0, 4, 1, '#9CA3AF'], [2, 1, 1, 3, '#9CA3AF'], [7, 1, 1, 3, '#9CA3AF'], [1, 4, 8, 6, '#D1D5DB'], [4, 6, 2, 2, '#374151']]),
};

const SKY = ['#2A5694', '#3264A3', '#3D72B0', '#4E83BD'];
export const BACKDROP_W = 52;
export const BACKDROP_H = 62;

/** The passport photo's backdrop: dithered sky, sun and cloud, grass along the bottom. */
export function passportBackdrop(): PixelRect[] {
  const ground = 55;
  const band = Math.floor(ground / 4);
  const r: Row[] = [];
  SKY.forEach((colour, i) => {
    r.push([0, i * band, BACKDROP_W, i === 3 ? ground - 3 * band : band, colour]);
    if (i > 0) for (let x = i % 2; x < BACKDROP_W; x += 2) r.push([x, i * band, 1, 1, SKY[i - 1]!]);
  });
  r.push([39, 4, 6, 6, '#FBBF24'], [41, 8, 7, 3, '#E5E7EB']);
  r.push([0, ground, BACKDROP_W, 1, '#5CA857'], [0, ground + 1, BACKDROP_W, 2, '#4B9248'], [0, ground + 3, BACKDROP_W, BACKDROP_H - ground - 3, '#3D7C3C']);
  return rects(r);
}
