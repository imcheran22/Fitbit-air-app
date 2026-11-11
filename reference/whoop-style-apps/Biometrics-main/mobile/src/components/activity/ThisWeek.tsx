// Activity's "This week" (A-2): a row per day, newest first, with recovery as weather, a sleep bar and a steps bar.
// The row opens that day's Recovery page; the moon opens the night in Sleep.

import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { ACTIVITY_COPY } from '../../lib/activityCopy';
import type { WeekRow } from '../../lib/activityWeek';
import { formatDuration } from '../../lib/sleepStats';
import { COLORS, METRIC_CONFIG } from '../../theme';
import { WeatherIcon } from '../recovery/WeatherIcon';
import { Button, buttonIconSize } from '../ui/button';
import { Card } from '../ui/card';
import { PressableScale } from '../ui/pressable-scale';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

const COPY = ACTIVITY_COPY.week;
const DAY_COL = 40;
const RECOVERY_COL = 62;

function Bar({ fillRatio, colour, track, value, testID }: { fillRatio: number; colour: string; track: string; value: string; testID: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="h-2 flex-1" style={{ backgroundColor: track }}>
        <View testID={`${testID}-fill`} className="absolute bottom-0 left-0 top-0" style={{ width: `${Math.round(fillRatio * 100)}%`, backgroundColor: colour }} />
      </View>
      <Text testID={testID} className="w-[58px] text-right text-caption text-muted-foreground tabular-nums" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function ThisWeek({ rows, onOpenDay, onOpenNight }: { rows: WeekRow[]; onOpenDay: (date: string) => void; onOpenNight: (date: string) => void }) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  return (
    <View testID="this-week" className="gap-2">
      <View className="flex-row items-baseline justify-between">
        <SectionLabel>{COPY.label}</SectionLabel>
        <Text className="text-caption text-muted-foreground">{COPY.hint}</Text>
      </View>
      <Card className="p-0">
        <View className="flex-row gap-2 px-4 pb-1 pt-3" accessible={false} importantForAccessibility="no-hide-descendants">
          <Text className="text-fine text-muted-foreground" style={{ width: DAY_COL }}>{COPY.columns.day}</Text>
          <Text className="text-fine text-muted-foreground" style={{ width: RECOVERY_COL }}>{COPY.columns.recovery}</Text>
          <Text className="flex-1 text-fine text-muted-foreground">{COPY.columns.sleepSteps}</Text>
        </View>
        {rows.map((row, i) => (
          <PressableScale
            key={row.date}
            testID={`week-row-${row.date}`}
            accessibilityRole="button"
            accessibilityLabel={COPY.rowLabel(row)}
            accessibilityHint={COPY.rowHint}
            onPress={() => onOpenDay(row.date)}
            className={`min-h-[58px] flex-row items-center gap-2 px-4 py-2 ${i > 0 ? 'border-t border-border' : ''} ${row.isToday ? 'bg-muted' : ''}`}
          >
            <View style={{ width: DAY_COL }}>
              <Text className={`text-fine ${row.isToday ? 'text-foreground' : 'text-muted-foreground'}`}>{row.weekday}</Text>
              <Text className="text-body font-semibold tabular-nums">{row.day}</Text>
            </View>
            <View className="flex-row items-center gap-1.5" style={{ width: RECOVERY_COL }}>
              {row.weather ? <WeatherIcon kind={row.weather} variant="small" size={22} testID={`week-weather-${row.date}`} /> : null}
              <Text
                testID={`week-recovery-${row.date}`}
                className="text-body font-semibold tabular-nums"
                style={row.low ? { color: palette.scorePoor } : undefined}
              >
                {row.recovery === null ? COPY.empty : String(row.recovery)}
              </Text>
            </View>
            <View className="flex-1 gap-1.5">
              <Bar
                testID={`week-sleep-${row.date}`}
                fillRatio={row.sleepFill}
                colour={palette.metricSleep}
                track={palette.heat0}
                value={row.sleepMinutes === null ? COPY.empty : formatDuration(row.sleepMinutes)}
              />
              <Bar
                testID={`week-steps-${row.date}`}
                fillRatio={row.stepsFill}
                colour={palette.metricSteps}
                track={palette.heat0}
                value={row.steps === null ? COPY.empty : METRIC_CONFIG.STEPS.format(row.steps)}
              />
            </View>
            {row.sleepMinutes !== null ? (
              <Button
                testID={`week-moon-${row.date}`}
                variant="ghost"
                size="icon-sm"
                accessibilityLabel={COPY.moonLabel(row.date)}
                onPress={() => onOpenNight(row.date)}
              >
                <Ionicons name="moon" size={buttonIconSize('icon-sm')} color={palette.metricSleep} />
              </Button>
            ) : (
              <View className="w-[32px]" />
            )}
          </PressableScale>
        ))}
      </Card>
    </View>
  );
}
