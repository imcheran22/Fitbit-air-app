import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Text } from '../../ui/text';
import { hexAlpha, useCoachVoice } from './shared';
import type { ThinkingStyleProps } from './types';
import { useThinkingLine } from './useThinkingLine';

const SWEEP_MS = 1600;
const BAR = 0.3;

// J: a slim reply card with an indeterminate accent strip sliding across its
// top edge, and "Sprout is soaking it in..." inside. Frozen, the strip rests
// at the left.
export function Strip({ characterId, paused }: ThinkingStyleProps) {
  const { name, text, accent } = useCoachVoice(characterId);
  const { line } = useThinkingLine(characterId, paused);
  const [width, setWidth] = useState(0);
  const sweep = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(sweep);
    sweep.value = 0;
    if (paused) return undefined;
    sweep.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.ease) }), -1, false);
    return () => cancelAnimation(sweep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // From just off the left edge to just past the right.
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: paused ? 0 : -BAR * width + sweep.value * (1 + BAR) * width }],
  }));

  return (
    <View className="mb-1.5 overflow-hidden rounded-[14px] border border-border bg-muted">
      <View style={{ height: 3, backgroundColor: hexAlpha(accent, 0.16) }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Animated.View style={[{ height: 3, width: `${BAR * 100}%`, backgroundColor: accent }, barStyle]} />
      </View>
      <Text className="px-3 py-[9px] text-caption text-muted-foreground">
        <Text className="text-caption font-semibold" style={{ color: text }}>
          {name}
        </Text>
        {` is ${line}…`}
      </Text>
    </View>
  );
}
