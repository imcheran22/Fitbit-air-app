import { contrast, hexAlpha } from '../components/characters/palette';
import { characterInfo } from '../components/characters/registry';
import { mixHex } from '../components/characters/sprites/compose';
import type { CharacterId } from '../components/characters/types';
import type { ChangeTone } from './recapCopy';
import type { PixelLevel } from './yearPixels';
import { COLORS } from '../theme';

// The recap share images' colours (recap restyle, owner decision 2026-10-05): every image is
// tinted by its coach, a dark ground from the registry with the coach's accent on top and a dot
// pattern of the accent. Pure, so the views and their tests share one source.

export interface RecapTint {
  /** The image's background. */
  ground: string;
  /** The coach's registry accent: dots, sprites' companions, fills. */
  accent: string;
  /** The accent as text (eyebrows, titles, app name): lightened only if it would not read. */
  accentText: string;
  /** Body text and big numbers. */
  text: string;
  /** Quotes and secondary text. */
  soft: string;
  /** Uppercase labels and captions. */
  muted: string;
  /** Translucent tile fill and its border. */
  surface: string;
  border: string;
  /** Footer hairline. */
  hairline: string;
  /** The dot pattern's dots. */
  dot: string;
  /** A story progress segment not reached yet. */
  track: string;
}

const MIN_TEXT_CONTRAST = 4.6;

/** The accent, mixed toward white until it reads on the ground. */
function readable(color: string, ground: string): string {
  for (let i = 0; i <= 20; i++) {
    const c = i === 0 ? color : mixHex(color, '#FFFFFF', i * 0.05);
    if (contrast(c, ground) >= MIN_TEXT_CONTRAST) return c.toUpperCase();
  }
  return '#FFFFFF';
}

export function recapTint(coachId: CharacterId): RecapTint {
  const { accent, ground } = characterInfo(coachId);
  const text = mixHex('#FFFFFF', accent, 0.06).toUpperCase();
  return {
    ground,
    accent,
    accentText: readable(accent, ground),
    text,
    soft: mixHex(mixHex('#FFFFFF', accent, 0.18), ground, 0.1).toUpperCase(),
    muted: readable(mixHex(mixHex('#FFFFFF', accent, 0.3), ground, 0.3), ground),
    surface: hexAlpha(text, 0.07),
    border: hexAlpha(text, 0.12),
    hairline: hexAlpha(text, 0.12),
    dot: hexAlpha(accent, 0.17),
    track: hexAlpha(text, 0.35),
  };
}

/** Year in pixels' sleep scale, short → on goal (fixed purple, whatever the coach). */
export const YEAR_SCALE = { short: '#6B4FA8', near: '#9333EA', goal: '#D8B4FE' } as const;

/**
 * One year-in-pixels square. A night with sleep is filled on the purple scale; a night without
 * data is an empty square with an outline (the ground shows through), so it never reads as a
 * short night or as the ground; a night still to come is a faint fill with no outline.
 */
export function yearCell(level: PixelLevel, tint: Pick<RecapTint, 'ground' | 'text'>): { fill: string; outline: string | null } {
  if (level === 'none') return { fill: 'transparent', outline: mixHex(tint.ground, tint.text, 0.34).toUpperCase() };
  if (level === 'future') return { fill: mixHex(tint.ground, tint.text, 0.07).toUpperCase(), outline: null };
  return { fill: YEAR_SCALE[level], outline: null };
}

/** A signed change: green when better, orange when worse, grey (the tint's muted) when equal. */
export const CHANGE_COLORS = { better: '#86EFAC', worse: '#FDBA74' } as const;

/** The same on a light page, text-safe on white (green-700, orange-700). */
const CHANGE_COLORS_LIGHT = { better: '#15803D', worse: '#C2410C' } as const;

/**
 * An in-app signed change (the month screen's comparison rows): the design's green and orange on
 * a dark page, darker text-safe ones on a light page, the muted grey when nothing changed.
 */
export function changeColor(tone: ChangeTone, scheme: 'light' | 'dark'): string {
  if (tone === 'same') return COLORS[scheme].muted;
  return scheme === 'dark' ? CHANGE_COLORS[tone] : CHANGE_COLORS_LIGHT[tone];
}

// The app's page background and card (the tab bar) in each theme, as hex for contrast checks.
const RING_SURFACES = { light: ['#F6F6F7', '#FFFFFF'], dark: ['#0A0B0E', '#14161B'] } as const;
/** Non-text contrast (WCAG 1.4.11) for the ring and its dot, with a little headroom. */
const MIN_RING_CONTRAST = 3.1;

/**
 * The story ring around the profile avatar (Home, the Profile tab, the Profile screen) and an
 * unwatched shelf circle: the recap coach's accent. On a light page a pale accent (Luna's yellow,
 * Bun's silver) is darkened toward black, keeping its hue, until it stands out at 3:1; on a dark
 * page an accent that is too dark is lightened toward white.
 */
export function storyRingColor(coachId: CharacterId, scheme: 'light' | 'dark'): string {
  const { accent } = characterInfo(coachId);
  const toward = scheme === 'dark' ? '#FFFFFF' : '#000000';
  for (let i = 0; i <= 20; i++) {
    const c = (i === 0 ? accent : mixHex(accent, toward, i * 0.05)).toUpperCase();
    if (RING_SURFACES[scheme].every((s) => contrast(c, s) >= MIN_RING_CONTRAST)) return c;
  }
  return toward;
}

/** A watched recap's quiet ring on the shelf (the design's zinc-700 in dark). */
export const STORY_RING_NEUTRAL = { light: '#C4C4CC', dark: '#3F3F46' } as const;
