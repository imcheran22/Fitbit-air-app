import React from 'react';
import { View } from 'react-native';
import { Text } from '../../ui/text';
import { useCoachVoice, useElapsed } from './shared';
import type { ThinkingStyleProps } from './types';

const WORD = 'thinking';
const HOP_MS = 110;
// Eight letters plus a four-beat rest before the wave starts again.
const BEATS = 12;

// H: "Peep is thinking", one letter of "thinking" hopping 2 pt at a time.
// Screen readers get the plain sentence, not eight separate letters.
export function Bouncy({ characterId, paused }: ThinkingStyleProps) {
  const { name, text } = useCoachVoice(characterId);
  const elapsed = useElapsed(paused);
  const hopping = paused ? -1 : Math.floor(elapsed / HOP_MS) % BEATS;
  return (
    <View testID="thinking-bouncy" accessible accessibilityRole="text" accessibilityLabel={`${name} is thinking`} className="flex-row items-end pb-3">
      <Text className="text-caption text-muted-foreground">{`${name} is `}</Text>
      <View testID="thinking-bouncy-letters" className="flex-row" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from(WORD).map((letter, index) => (
          <Text
            key={index}
            className="text-caption font-semibold"
            style={{ color: text, transform: [{ translateY: index === hopping ? -2 : 0 }] }}
          >
            {letter}
          </Text>
        ))}
      </View>
    </View>
  );
}
