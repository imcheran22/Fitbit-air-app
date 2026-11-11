import React from 'react';
import { View } from 'react-native';
import { Text } from '../../ui/text';
import { Lines } from './Lines';
import { useCoachVoice, useElapsed } from './shared';
import type { ThinkingStyleProps } from './types';

const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

// F (default): the backend's real progress steps as a checklist. Finished
// steps are ticked and muted; the current one spins. Before the first status
// arrives (or from a server that sends none) it shows the personality line.
export function Steps(props: ThinkingStyleProps) {
  const { characterId, steps, paused } = props;
  const { text } = useCoachVoice(characterId);
  const elapsed = useElapsed(paused);
  if (!steps.length) return <Lines {...props} />;
  const spinner = SPINNER[Math.floor(elapsed / 90) % SPINNER.length];
  return (
    <View className="gap-[3px] pb-1.5">
      {steps.map((step) => (
        <View key={step.id} testID={`thinking-step-${step.id}-${step.done ? 'done' : 'active'}`} className="flex-row items-center gap-[7px]">
          <Text className="w-3 text-center text-caption" style={{ color: text }}>
            {step.done ? '✓' : spinner}
          </Text>
          <Text className={step.done ? 'shrink text-caption text-muted-foreground' : 'shrink text-caption text-foreground'}>{step.label}</Text>
        </View>
      ))}
    </View>
  );
}
