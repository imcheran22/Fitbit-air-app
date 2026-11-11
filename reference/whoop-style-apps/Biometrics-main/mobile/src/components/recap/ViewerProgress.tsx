// The story viewer's running bar (recap story, social story): past frames full, the current one filling from the
// viewer's shared progress value. Not StoryProgress (WeeklyStoryView), which is the static bar drawn into exports.

import React from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { STORY_PROGRESS_HEIGHT } from './WeeklyStoryView';

export function ViewerProgress({ count, index, progress, track, fill, testID = 'story-viewer-progress' }: {
  count: number;
  index: number;
  progress: SharedValue<number>;
  track: string;
  fill: string;
  testID?: string;
}) {
  const filling = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, progress.value)) * 100}%` }));
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: 4, height: STORY_PROGRESS_HEIGHT }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flex: 1, borderRadius: 2, backgroundColor: track, overflow: 'hidden' }}>
          {i < index ? <View style={{ width: '100%', height: '100%', backgroundColor: fill }} /> : null}
          {i === index ? <Animated.View style={[{ height: '100%', backgroundColor: fill }, filling]} /> : null}
        </View>
      ))}
    </View>
  );
}
