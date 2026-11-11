import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { SleepNight } from '../api/sleep';
import { compareToAverage, formatDayTitle } from '../lib/heatmap';
import { formatDuration, isNapOnly, mainMinutes } from '../lib/sleepStats';
import { COLORS, METRIC_CONFIG } from '../theme';
import { Text } from './ui/text';

const formatSteps = METRIC_CONFIG.STEPS.format;

interface LinkTileProps {
  testID: string;
  icon: 'moon-outline';
  color: string;
  label: string;
  value: string;
  onPress: () => void;
}

// From the steps sheet to the same day's night on the Sleep page.
function LinkTile({ testID, icon, color, label, value, onPress }: LinkTileProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      className="min-h-[56px] flex-1 flex-row items-center gap-2.5 rounded-tile bg-muted px-3 py-3 active:opacity-70"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: color.replace('rgb(', 'rgba(').replace(')', ', 0.18)') }}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <View className="flex-1">
        <Text className="text-caption text-muted-foreground">{label}</Text>
        <Text className="text-headline tabular-nums" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={color} />
    </Pressable>
  );
}

export interface DayDetailProps {
  date: string;
  steps: number | null;
  goal: number;
  average: number | null;
  // The night that ended that morning, when sleep has loaded: undefined hides the link.
  sleepLink?: { night: SleepNight | null; onPress: () => void };
}

export function DayDetail({ date, steps, goal, average, sleepLink }: DayDetailProps) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const comparison = steps === null ? null : compareToAverage(steps, average);
  return (
    <View testID="day-detail" className="gap-2 pb-2">
      <Text className="text-caption text-muted-foreground">{formatDayTitle(date)}</Text>
      {steps === null ? (
        <Text testID="day-detail-empty" className="text-body">
          No steps were recorded for this day.
        </Text>
      ) : (
        <>
          <Text testID="day-detail-steps" className="text-number" numberOfLines={1} adjustsFontSizeToFit>
            {`${formatSteps(steps)} steps`}
          </Text>
          <Text testID="day-detail-goal" className="text-body">
            {`${Math.round((steps / goal) * 100)}% of your ${formatSteps(goal)}-step goal`}
          </Text>
          {comparison ? (
            <Text testID="day-detail-comparison" className="text-caption text-muted-foreground">
              {comparison}
            </Text>
          ) : null}
        </>
      )}
      {sleepLink ? (
        <View className="mt-2 flex-row">
          <LinkTile
            testID="day-detail-sleep-link"
            icon="moon-outline"
            color={palette.metricSleep}
            label="Sleep the night before"
            value={sleepLink.night && !isNapOnly(sleepLink.night) ? formatDuration(mainMinutes(sleepLink.night)) : 'No data'}
            onPress={sleepLink.onPress}
          />
        </View>
      ) : null}
    </View>
  );
}
