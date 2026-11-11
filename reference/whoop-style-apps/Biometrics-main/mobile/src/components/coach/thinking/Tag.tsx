import React from 'react';
import { View } from 'react-native';
import { Text } from '../../ui/text';
import { hexAlpha, useCoachVoice, useElapsed } from './shared';
import type { ThinkingStyleProps } from './types';
import { useThinkingLine } from './useThinkingLine';

// C: a game-style "THINKING" tag in the pixel font with a blinking block,
// the personality line under it.
export function Tag({ characterId, paused }: ThinkingStyleProps) {
  const { name, text, accent } = useCoachVoice(characterId);
  const { line } = useThinkingLine(characterId, paused);
  const elapsed = useElapsed(paused);
  // On for half of each second, off for the other half (1 s steps).
  const blockOn = Math.floor(elapsed / 500) % 2 === 0;
  return (
    <View className="items-start gap-1.5 pb-1.5">
      <View
        className="flex-row items-center gap-2 rounded-md px-2.5 py-1.5"
        style={{ backgroundColor: hexAlpha(accent, 0.1), borderWidth: 2, borderColor: hexAlpha(accent, 0.35) }}
      >
        <View style={{ width: 8, height: 8, backgroundColor: accent, opacity: blockOn ? 1 : 0 }} />
        <Text className="text-label" style={{ color: text }}>THINKING</Text>
      </View>
      <Text className="text-caption text-muted-foreground">{`${name} is ${line}…`}</Text>
    </View>
  );
}
