import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { SleepGoal } from '../../api/sleep';
import { COLORS } from '../../theme';
import { goalRowA11y, goalRowLine, SLEEP_COPY } from '../../lib/sleepCopy';
import { withAlpha } from '../../lib/utils';
import type { WindDownSettings } from '../../lib/windDown';
import { Card } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';
import { SectionError, type Section } from './Section';

// The board's card link to BedtimeGoal (spec §3.12). Allowlisted in the buttons guard as `sleep-goal-row`.
export function BedtimeGoalRow({ goal, reminder, onPress, onRetry }: { goal: Section<SleepGoal>; reminder: WindDownSettings | null; onPress: () => void; onRetry: () => void }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  if (goal.phase === 'error') return <SectionError testID="sleep-goal-retry" message={SLEEP_COPY.goalError} onRetry={onRetry} />;
  const line = goal.phase === 'ready' ? goalRowLine(goal.data, reminder) : null;
  return (
    <Pressable
      testID="sleep-goal-row"
      accessibilityRole="button"
      accessibilityLabel={line ? goalRowA11y(line) : SLEEP_COPY.bedtimeGoal}
      onPress={onPress}
      className="active:opacity-70"
    >
      <Card className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-[10px]" style={{ backgroundColor: withAlpha(colors.metricSleep, 0.16) }}>
          <Ionicons name="moon-outline" size={18} color={colors.metricSleep} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-body font-semibold">{SLEEP_COPY.bedtimeGoal}</Text>
          {line ? (
            <Text testID="sleep-goal-line" className="text-caption text-muted-foreground tabular-nums">{line}</Text>
          ) : (
            <Skeleton className="h-4 w-40 rounded-full" />
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Card>
    </Pressable>
  );
}
