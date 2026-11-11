import React from 'react';
import { View, type ViewStyle } from 'react-native';
import type { RecapSummary } from '../../api/recaps';
import { useCharacterOptional } from '../../characters/CharacterContext';
import { storyRingHint } from '../../lib/recapCopy';
import { recapCoachId } from '../../lib/recapShare';
import { storyRingColor } from '../../lib/recapTheme';
import { recapDestination, useUnwatchedRecap } from '../../lib/unwatchedRecap';
import { DEFAULT_CHARACTER_ID } from '../characters/types';

export interface StoryRingState {
  recap: RecapSummary;
  /** The recap coach's ring colour on this theme's page. */
  color: string;
  /** "Your week is ready. Play your story", for the avatar's accessibility label. */
  hint: string;
  /** Where a tap goes: a week's story, or a month's recap screen. */
  destination: ReturnType<typeof recapDestination>;
}

interface FocusSource {
  addListener?: (event: 'focus', callback: () => void) => () => void;
}

/** The ring for the avatar on this screen, or null when there is no unwatched recap. */
export function useStoryRing(scheme: 'light' | 'dark', navigation?: FocusSource): StoryRingState | null {
  const { recap } = useUnwatchedRecap(navigation);
  const characterId = useCharacterOptional()?.characterId ?? DEFAULT_CHARACTER_ID;
  if (!recap) return null;
  return {
    recap,
    color: storyRingColor(recapCoachId(recap, characterId), scheme),
    hint: storyRingHint(recap),
    destination: recapDestination(recap),
  };
}

export interface StoryRingProps {
  /** The ring's colour; null draws no ring and no dot (the child fills the whole size). */
  color: string | null;
  /** Outer diameter. */
  size: number;
  ringWidth: number;
  /** Space between the ring and the child. */
  gap: number;
  dotSize: number;
  /** The surface under the dot, for its border, so the dot reads on top of the ring. */
  surface: string;
  testID?: string;
  children: React.ReactNode;
}

/**
 * A story ring (weekly story placement, design A2): a ring in the recap coach's colour around an
 * avatar, with a small dot of the same colour at its top right, bordered in the surface colour.
 * Decorative: the pressable around it says a new recap is ready.
 */
export function StoryRing({ color, size, ringWidth, gap, dotSize, surface, testID, children }: StoryRingProps) {
  const ringed = color !== null;
  const style: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: ringed ? ringWidth : 0,
    borderColor: color ?? 'transparent',
    padding: ringed ? gap : 0,
  };
  return (
    <View testID={testID} style={style}>
      <View style={{ flex: 1, borderRadius: size / 2, overflow: 'hidden' }}>{children}</View>
      {ringed ? (
        <View
          testID={testID ? `${testID}-dot` : undefined}
          pointerEvents="none"
          style={{
            position: 'absolute',
            // Offsets count from inside the ring's border: this sits the dot on the ring's corner.
            top: -ringWidth - 1,
            right: -ringWidth - 1,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
            borderWidth: 2,
            borderColor: surface,
          }}
        />
      ) : null}
    </View>
  );
}
