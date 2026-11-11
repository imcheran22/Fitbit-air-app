import { useRef } from 'react';
import { isLoaded } from 'expo-font';
import { useColorScheme } from 'nativewind';
import { chipTextColor } from '../../characters/palette';
import { CHARACTERS } from '../../characters/registry';
import type { CharacterId } from '../../characters/types';
import { useSpriteClock } from '../../characters/useSpriteClock';
import { FONTS } from '../../../theme';

// The pixel face, for the few inline styles that still name it (the Campfire
// scene and the share cards). App.tsx waits for it with Geist before anything
// draws, so it is in; Geist stands in only if the font failed to load.
export const SILKSCREEN = 'Silkscreen';
export { hexAlpha } from '../../characters/palette';

export function pixelFont(): string {
  try {
    return isLoaded(SILKSCREEN) ? SILKSCREEN : FONTS.sans;
  } catch {
    return FONTS.sans;
  }
}

/**
 * The coach's name and colours for a thinking style. `accent` is for fills;
 * `text` is the focus-chip text colour: the accent darkened (light mode) or
 * lightened toward white (dark mode) until it reads at 4.6:1.
 */
export function useCoachVoice(id: CharacterId) {
  const { colorScheme } = useColorScheme();
  const info = CHARACTERS[id];
  return { name: info.name, accent: info.accent, text: chipTextColor(info.accent, colorScheme) };
}

/**
 * Milliseconds since this style appeared, re-rendering on the shared sprite
 * tick. Paused (screen out of focus, Reduce Motion) → 0: the first frame.
 */
export function useElapsed(paused: boolean): number {
  const t = useSpriteClock(paused);
  const mountedAt = useRef(Date.now());
  return paused || t === 0 ? 0 : Math.max(0, Date.now() - mountedAt.current);
}

/** 0–3 dots, one more every 400 ms. */
export const dotCount = (elapsed: number) => Math.floor(elapsed / 400) % 4;

/** A label as speech: no trailing ellipsis. */
export const spoken = (label: string) => label.replace(/(…|\.\.\.)$/, '').trim();
