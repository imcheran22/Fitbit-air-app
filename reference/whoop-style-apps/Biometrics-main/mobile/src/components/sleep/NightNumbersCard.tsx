import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { SleepNightDetail } from '../../api/sleep';
import { COLORS } from '../../theme';
import { SLEEP_COPY } from '../../lib/sleepCopy';
import { formatShortDuration, type NightClock } from '../../lib/sleepStats';
import { Button, buttonIconSize } from '../ui/button';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

// "The night" (spec §3.8): label left, value right, hairlines between; naps on the night's clock, newest last; then
// "Steps that day", the link the removed Activity night sheet offered (decision 8).
export function NightNumbersCard({ night, clock, onStepsThatDay }: { night: SleepNightDetail; clock: NightClock; onStepsThatDay: () => void }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const napOnly = night.mainIsNap === true;
  const rows: Array<[string, string]> = [];
  if (!napOnly) {
    rows.push([SLEEP_COPY.timeInBed, formatShortDuration(night.minutesInBed)]);
    if (night.minutesAwake !== null) rows.push([SLEEP_COPY.timeAwake, formatShortDuration(night.minutesAwake)]);
    if (night.minutesToFallAsleep !== null) rows.push([SLEEP_COPY.timeToFallAsleep, formatShortDuration(night.minutesToFallAsleep)]);
    if (night.minutesAfterWakeUp !== null) rows.push([SLEEP_COPY.afterWaking, formatShortDuration(night.minutesAfterWakeUp)]);
  }
  // A nap-only date's main session is the nap itself. The backend can emit a zero-length nap: dropped.
  const naps = [
    ...(napOnly ? [{ minutes: night.minutesAsleep, at: night.bedtime }] : []),
    ...night.naps
      .filter((n) => n.minutesAsleep > 0)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((n) => ({ minutes: n.minutesAsleep, at: clock.at(n.start) })),
  ];
  return (
    <Card testID="sleep-night-numbers" className="gap-2">
      <SectionLabel>{SLEEP_COPY.theNight}</SectionLabel>
      <View>
        {rows.map(([label, value], i) => (
          <View key={label} className={`flex-row items-baseline justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
            <Text className="text-body">{label}</Text>
            <Text className="text-body text-muted-foreground tabular-nums">{value}</Text>
          </View>
        ))}
        <View testID="sleep-naps-row" className={`flex-row justify-between gap-3 py-2.5 ${rows.length > 0 ? 'border-t border-border' : ''}`}>
          <Text className="text-body">{SLEEP_COPY.naps}</Text>
          <View className="items-end">
            {naps.length === 0 ? (
              <Text className="text-body text-muted-foreground">{SLEEP_COPY.napsNone}</Text>
            ) : (
              naps.map((n, i) => (
                <Text key={i} className="text-body text-muted-foreground tabular-nums">{SLEEP_COPY.napRow(n.minutes, n.at)}</Text>
              ))
            )}
          </View>
        </View>
      </View>
      <Button
        testID="sleep-steps-that-day"
        variant="link"
        size="sm"
        className="self-start"
        iconEnd={<Ionicons name="chevron-forward" size={buttonIconSize('sm')} color={colors.foreground} />}
        onPress={onStepsThatDay}
      >
        {SLEEP_COPY.stepsThatDay}
      </Button>
    </Card>
  );
}
