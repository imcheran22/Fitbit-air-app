import type { AchievementFamily } from '../api/achievements';

// The badge's pixel art (spec 2026-10-06 §6; canvas Badge.dc.html): a pixel octagon, a 12×12 glyph
// per family and the tier colours. Pure data and geometry; BadgeIcon draws it.

/** 12×12 glyphs, '#' = a filled cell: moon, clock, sneaker, check, heart, calendar, sparkle. */
export const GLYPHS: Record<AchievementFamily, readonly string[]> = {
  SLEEP_GOAL: ['.....####...', '...####.....', '..###.......', '.###......#.', '.###.....###', '###.......#.', '###.........', '.###........', '.###........', '..###.......', '...####.....', '.....####...'],
  STEADY_BEDTIME: ['...######...', '..#......#..', '.#...##...#.', '#....##....#', '#....##....#', '#....####..#', '#....####..#', '#..........#', '#..........#', '.#........#.', '..#......#..', '...######...'],
  STEP_GOAL: ['............', '............', '..###.......', '..####......', '..#####.....', '..######....', '..#######...', '.##########.', '############', '############', '.##########.', '............'],
  CHECK_IN: ['............', '..........##', '.........###', '........###.', '.......###..', '##....###...', '###..###....', '.######.....', '..####......', '...##.......', '............', '............'],
  BEST_RECOVERY_WEEK: ['............', '.###....###.', '#####..#####', '############', '############', '############', '.##########.', '..########..', '...######...', '....####....', '.....##.....', '............'],
  EVERY_DAY_LOGGED: ['..#......#..', '############', '############', '#..........#', '#.##.##.##.#', '#.##.##.##.#', '#..........#', '#.##.##.##.#', '#.##.##.##.#', '#..........#', '############', '............'],
  STEADIEST_MONTH: ['.....##.....', '.....##.....', '.....##.....', '....####....', '...######...', '############', '############', '...######...', '....####....', '.....##.....', '.....##.....', '.....##.....'],
};

export interface TierColors { ring: string; fill: string; glyph: string }

/** Level 0 (locked) to IV (Diamond), exactly as the canvas. Level V is the user's coach colour. */
export const TIERS: readonly TierColors[] = [
  { ring: '#3F3F46', fill: '#18181B', glyph: '#52525B' },
  { ring: '#D08A4E', fill: '#3A2414', glyph: '#F0B07A' },
  { ring: '#CBD5E1', fill: '#253041', glyph: '#E2E8F0' },
  { ring: '#FACC15', fill: '#3B300A', glyph: '#FDE68A' },
  { ring: '#67E8F9', fill: '#0E2A33', glyph: '#CFFAFE' },
];

/** A pip not yet earned. */
export const LOCKED_PIP = '#3F3F46';

/** a → b by t (0..1), per channel, "#RRGGBB" in and out. */
export function mixHex(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t).toString(16).padStart(2, '0'));
  return `#${out.join('')}`.toUpperCase();
}

/** Level V: the coach's accent ring, a dark fill and a pale glyph of the same hue. */
export function coachTier(accent: string): TierColors {
  return { ring: accent, fill: mixHex(accent, '#000000', 0.78), glyph: mixHex(accent, '#FFFFFF', 0.45) };
}

export function tierColors(level: number, coachAccent: string): TierColors {
  const l = Math.max(0, Math.min(5, Math.round(level)));
  return l === 5 ? coachTier(coachAccent) : TIERS[l]!;
}

/**
 * Small text in a tier's colour (the ladder's EARNED / NEXT). The pale rings (Silver, Gold, Diamond,
 * light coach accents) vanish on the light page, so light mode darkens the ring by 55% toward black:
 * every tier and coach accent then clears 4.5:1 on the light page and card. Dark mode keeps the ring.
 */
export function tierTextColor(level: number, coachAccent: string, dark: boolean): string {
  const ring = tierColors(level, coachAccent).ring;
  return dark ? ring : mixHex(ring, '#000000', 0.55);
}

/** [col, row] of every filled cell, row by row. */
export function glyphCells(family: AchievementFamily): Array<[col: number, row: number]> {
  const cells: Array<[number, number]> = [];
  GLYPHS[family].forEach((row, r) => row.split('').forEach((ch, c) => {
    if (ch === '#') cells.push([c, r]);
  }));
  return cells;
}

/** The octagon (corners cut at 30% / 70%) inside a `size` box, inset by `inset` on every side. */
export function octagonPoints(inset: number, size = 100): string {
  const w = size - 2 * inset;
  const at = (f: number) => +(inset + w * f).toFixed(2);
  const corners: Array<[number, number]> = [[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]];
  return corners.map(([x, y]) => `${at(x)},${at(y)}`).join(' ');
}
