import React from 'react';
import { View } from 'react-native';
import type { SleepNightDetail } from '../../api/sleep';
import { durationCaption, napOnlySummaryA11y, nightEyebrow, noNightSummaryA11y, SLEEP_COPY, summaryA11y, summaryLine } from '../../lib/sleepCopy';
import { formatDuration } from '../../lib/sleepStats';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

// The night's date, main sleep and its comparisons (spec §3.4); one element for a screen reader.
export function NightSummary({ date, today, night, goalMinutes }: { date: string; today: string; night: SleepNightDetail | null; goalMinutes: number | null }) {
  const eyebrow = <SectionLabel>{nightEyebrow(date, today)}</SectionLabel>;
  if (!night) {
    return (
      <View testID="sleep-summary" accessible accessibilityLabel={noNightSummaryA11y(date)} className="gap-1 px-1 pt-1">
        {eyebrow}
        <Text className="text-body text-muted-foreground">{SLEEP_COPY.noSleepForNight}</Text>
      </View>
    );
  }
  if (night.mainIsNap) {
    return (
      <View testID="sleep-summary" accessible accessibilityLabel={napOnlySummaryA11y(date, night.minutesAsleep, night.bedtime)} className="gap-1 px-1 pt-1">
        {eyebrow}
        <Text className="text-body text-muted-foreground">{SLEEP_COPY.onlyNap(night.minutesAsleep, night.bedtime)}</Text>
      </View>
    );
  }
  const p = { bedtime: night.bedtime, wakeTime: night.wakeTime, mainMinutes: night.minutesAsleep, usual: night.usualMinutesAsleep, goal: goalMinutes };
  return (
    <View testID="sleep-summary" accessible accessibilityLabel={summaryA11y({ date, ...p })} className="gap-1 px-1 pt-1">
      {eyebrow}
      <View className="flex-row items-baseline gap-2.5">
        <Text className="text-number tabular-nums">{formatDuration(night.minutesAsleep)}</Text>
        <Text className="text-caption text-muted-foreground">{durationCaption(night.minutesAsleep, night.naps.map((n) => n.minutesAsleep))}</Text>
      </View>
      <Text className="text-caption text-muted-foreground tabular-nums">{summaryLine(p)}</Text>
    </View>
  );
}
