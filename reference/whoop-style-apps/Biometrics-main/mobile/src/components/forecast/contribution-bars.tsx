import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { Text } from '../ui/text';

export interface ContributionBarItem {
  key: string;
  label: string;
  points: number;
}

/** Signed horizontal bars, largest |points| first; reorders with a layout transition. */
export function ContributionBars({ items }: { items: ContributionBarItem[] }) {
  const sorted = [...items].sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const scale = Math.max(1, ...sorted.map((i) => Math.abs(i.points)));
  return (
    <View className="gap-5">
      {sorted.map((item) => {
        const width = `${(Math.abs(item.points) / scale) * 100}%` as `${number}%`;
        const positive = item.points >= 0;
        return (
          <Animated.View key={item.key} layout={LinearTransition.duration(220)} testID={`contribution-${item.key}`} className="gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-caption font-medium">{item.label}</Text>
              <Text
                className={`text-caption font-semibold tabular-nums ${positive ? 'text-score-excellent' : 'text-score-poor'}`}
              >
                {positive ? '+' : '−'}
                {Math.abs(item.points).toFixed(1)}
              </Text>
            </View>
            <View className="h-2 flex-row overflow-hidden rounded-full bg-muted">
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
                {!positive ? <View style={{ width }} className="h-full bg-score-poor" /> : null}
              </View>
              <View className="h-full w-px bg-border" />
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-start' }}>
                {positive ? <View style={{ width }} className="h-full bg-score-excellent" /> : null}
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
