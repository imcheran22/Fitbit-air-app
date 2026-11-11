import type { RecapStats } from '../api/recaps';
import { isCharacterId, type CharacterId } from '../components/characters/types';

// The shareable images (spec 2026-10-04 §3): formats, what each can include, and the export
// geometry. Pure, so the builder and its tests share one source.

export type ShareFormat = 'card' | 'story' | 'year';
export type IncludeKey = 'avgSleep' | 'streak' | 'bestRecovery' | 'steps' | 'bestNight' | 'quote' | 'coach' | 'count' | 'badges';
export type Includes = Record<IncludeKey, boolean>;

/** The only identity on an image: the app's name, no URL (owner decision). */
export const APP_NAME = 'Biometrics';
export const DESIGN_WIDTH = 360;
// The card is 4:5 (1080×1350), the story 9:16 (1080×1920 a frame), the year square (recap restyle).
export const DESIGN_HEIGHT: Record<ShareFormat, number> = { card: 450, story: 640, year: 360 };
export const EXPORT_PIXELS = 1080;

export const FORMAT_INCLUDES: Record<ShareFormat, IncludeKey[]> = {
  card: ['avgSleep', 'streak', 'bestRecovery', 'steps', 'quote', 'coach'],
  story: ['bestNight', 'quote', 'coach', 'badges'],
  year: ['count', 'coach'],
};

export const INCLUDE_LABELS: Record<IncludeKey, string> = {
  avgSleep: 'Average sleep',
  streak: 'Longest streak',
  bestRecovery: 'Best recovery',
  steps: 'Steps',
  bestNight: 'Best night',
  quote: 'A line from your coach',
  coach: 'Coach character',
  count: 'Nights on goal',
  badges: 'Badges this week',
};

export const FORMAT_LABELS: Record<ShareFormat, string> = { card: 'Card', story: 'Story', year: 'Year' };

/** Off until the user switches it on (the design's default). */
const DEFAULT_OFF: ReadonlySet<IncludeKey> = new Set<IncludeKey>(['bestRecovery']);

const ALL_KEYS: IncludeKey[] = ['avgSleep', 'streak', 'bestRecovery', 'steps', 'bestNight', 'quote', 'coach', 'count', 'badges'];

/** The switches a format offers for these stats: a missing stat (or a streak of 0) has none. */
export function availableIncludes(format: ShareFormat, stats: RecapStats | null): IncludeKey[] {
  return FORMAT_INCLUDES[format].filter((key) => {
    switch (key) {
      case 'avgSleep':
        return stats?.avgSleepMinutes !== undefined;
      case 'streak':
        return (stats?.longestOnGoalStreak ?? 0) > 0;
      case 'bestRecovery':
        return stats?.bestRecovery !== undefined;
      case 'steps':
        return stats?.steps !== undefined;
      case 'bestNight':
        return stats?.bestNight !== undefined;
      default:
        return true;
    }
  });
}

/** Every key: the user's choice when available, else its default (on, Best recovery off); an unavailable key is always off. */
export function resolveIncludes(format: ShareFormat, stored: Partial<Includes>, stats: RecapStats | null): Includes {
  const available = new Set(availableIncludes(format, stats));
  return Object.fromEntries(ALL_KEYS.map((k) => [k, available.has(k) && (stored[k] ?? !DEFAULT_OFF.has(k))])) as Includes;
}

/**
 * makeImageFromView has no scale argument and captures at the device's pixel ratio, so the export
 * view is laid out 1080 / pixelRatio points wide: the capture is 1080 px wide on any device (spec §3).
 */
export function exportLayout(format: ShareFormat, pixelRatio: number): { width: number; height: number; scale: number } {
  const width = EXPORT_PIXELS / pixelRatio;
  const scale = width / DESIGN_WIDTH;
  return { width, height: DESIGN_HEIGHT[format] * scale, scale };
}

/**
 * The coach on the monthly card and weekly story: the recap's own, since its line was written in
 * that voice; the current coach when the recap has none we know (ruling S6). Year in pixels has no
 * line and always shows the current coach.
 */
export function recapCoachId(recap: { personaId: string | null }, current: CharacterId): CharacterId {
  return isCharacterId(recap.personaId) ? recap.personaId : current;
}

// The coach's quote never truncates on an image: it is sized to its box from an estimate of its
// wrapped lines, and the Text keeps adjustsFontSizeToFit as a net for when the estimate is short.
/** Line height of the drawn quote (Geist), as a multiple of its font size. */
export const QUOTE_LINE_HEIGHT = 1.4;
/** adjustsFontSizeToFit's floor, relative to the fitted size. */
export const QUOTE_MIN_FONT_SCALE = 0.7;
const QUOTE_MIN_FONT = 12;
// Mean advances, spaces included, in ems, rounded up so the estimate wraps early: Geist Regular
// measures 0.465 on English text, Silkscreen (the titles) 0.706.
export const SANS_ADVANCE_EM = 0.5;
export const PIXEL_ADVANCE_EM = 0.75;

/** Lines the text wraps to at this size (greedy word wrap on the mean advance), in design units. */
export function quoteLines(text: string, fontSize: number, width: number, advanceEm: number = SANS_ADVANCE_EM): number {
  const perLine = Math.max(1, Math.floor(width / (fontSize * advanceEm)));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const needed = used === 0 ? word.length : used + 1 + word.length;
    if (needed <= perLine || used === 0) {
      used = needed;
    } else {
      lines++;
      used = word.length;
    }
    // A word longer than a line breaks across lines.
    while (used > perLine) {
      lines++;
      used -= perLine;
    }
  }
  return lines;
}

/**
 * The largest size (base down to `minSize`, whole points; 12 by default) at which the wrapped text
 * fits the box. A quote is at most 30 words and always fits by 12; the weekly story has no word
 * cap, so frame 3 passes a lower floor and a long story shrinks instead of overflowing.
 */
export function fitQuote(text: string, width: number, maxHeight: number, baseSize: number, minSize: number = QUOTE_MIN_FONT): { fontSize: number; lines: number } {
  let fontSize = baseSize;
  let lines = quoteLines(text, fontSize, width);
  while (fontSize > minSize && lines * fontSize * QUOTE_LINE_HEIGHT > maxHeight) {
    fontSize--;
    lines = quoteLines(text, fontSize, width);
  }
  return { fontSize, lines };
}

/** The on-screen preview's scale: the design fitted into a box. Never captured. */
export function previewScale(format: ShareFormat, maxWidth: number, maxHeight: number): number {
  return Math.min(maxWidth / DESIGN_WIDTH, maxHeight / DESIGN_HEIGHT[format]);
}
