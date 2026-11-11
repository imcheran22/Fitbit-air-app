import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { RecoveryPageDTO } from '../../api/recovery';
import { COLORS } from '../../theme';
import { scoreBand } from '../../lib/scoreInsights';
import { RECOVERY_COPY } from '../../lib/recoveryCopy';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

// Consecutive Good-or-better days ending at D (spec §3.6), with the last 4 days as band squares.
export function StreakTile({ page, className }: { page: RecoveryPageDTO; className?: string }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const { current, best } = page.streak;
  const hasHistory = best > 0 || page.outlook.some((d) => d.score !== null);
  return (
    <Card testID="recovery-streak" className={`gap-2 ${className ?? ''}`}>
      <SectionLabel>{RECOVERY_COPY.streak}</SectionLabel>
      <View className="flex-row items-baseline gap-1.5">
        <Text className="text-display tabular-nums">{String(current)}</Text>
        <Text className="text-caption text-muted-foreground">{RECOVERY_COPY.streakUnit(current)}</Text>
      </View>
      <View className="flex-row gap-1" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {page.outlook.slice(-4).map((d, i) => (
          <View
            key={d.date}
            testID={`streak-square-${i}`}
            className={d.score === null ? 'bg-muted' : undefined}
            style={{ width: 14, height: 14, borderRadius: 4, ...(d.score === null ? null : { backgroundColor: colors[scoreBand(d.score, page.bands)] }) }}
          />
        ))}
      </View>
      <Text className="text-caption text-muted-foreground">{RECOVERY_COPY.streakCaption(best, hasHistory)}</Text>
    </Card>
  );
}
