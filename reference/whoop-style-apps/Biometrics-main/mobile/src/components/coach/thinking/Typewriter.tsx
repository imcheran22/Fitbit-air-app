import React from 'react';
import { View } from 'react-native';
import { Text } from '../../ui/text';
import { CHARACTERS } from '../../characters/registry';
import { useCoachVoice, useElapsed } from './shared';
import type { ThinkingStyleProps } from './types';

const CYCLE_MS = 4200;
const TYPE_MS = 45;
const HOLD_UNTIL_MS = 3200;
const ERASE_MS = 20;

/** How much of `full` shows `phase` ms into its 4.2 s cycle: type, hold, erase. */
export function typedLength(full: string, phase: number): number {
  if (phase < HOLD_UNTIL_MS) return Math.min(full.length, Math.floor(phase / TYPE_MS));
  return Math.max(0, full.length - Math.floor((phase - HOLD_UNTIL_MS) / ERASE_MS));
}

// D: "Kit is judging your bedtime..." types out at 45 ms a letter, holds,
// erases at 20 ms a letter, then the next line. One clock drives it all.
// Frozen (Reduce Motion, out of focus) it shows the whole first line.
export function Typewriter({ characterId, paused }: ThinkingStyleProps) {
  const { name, text, accent } = useCoachVoice(characterId);
  const elapsed = useElapsed(paused);
  const lines = CHARACTERS[characterId].thinkingLines;
  const full = `${name} is ${lines[Math.floor(elapsed / CYCLE_MS) % lines.length]}…`;
  const shown = paused ? full : full.slice(0, typedLength(full, elapsed % CYCLE_MS));
  const caretOn = Math.floor(elapsed / 500) % 2 === 0;
  return (
    <View className="flex-row items-center pb-3">
      <Text testID="thinking-typewriter-text" className="shrink text-caption font-semibold" style={{ color: text }}>
        {shown}
      </Text>
      <View style={{ width: 2, height: 14, marginLeft: 1, backgroundColor: accent, opacity: caretOn ? 1 : 0 }} />
    </View>
  );
}
