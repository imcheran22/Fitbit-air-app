import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { COLORS } from '../../theme';
import { monthCells } from '../../lib/calendarGrid';
import { addDays, shiftMonth as shiftMonthStart, sleepHeatLevel } from '../../lib/heatmap';
import { monthTitle, shiftMonth } from '../../lib/recoveryCopy';
import { formatHm, monthCellLabel, SLEEP_COPY } from '../../lib/sleepCopy';
import { formatClock, formatDuration, mainSleepByDate, sleepRangeStats } from '../../lib/sleepStats';
import type { MonthLoad } from '../../lib/useSleepPage';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PressableScale } from '../ui/pressable-scale';
import { SectionLabel } from '../ui/section-label';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';

const COLUMN = { width: '14.2857%', padding: 3 } as const;
const BOX = 36;

type Props = {
  viewMonth: string; today: string; date: string; load: MonthLoad; goalMinutes: number; earliestDate: string | null;
  onPage: (month: string) => void; onRetry: (month: string) => void; onSelect: (date: string) => void;
};

// The month heatmap and its stats (spec §3.11): Monday first (plan ruling 11), main sleep on the sleepHeat ramp, D
// ringed, future days muted and hidden from screen readers. Paging stops at earliestDate's month and this month.
export function SleepMonthCard({ viewMonth, today, date, load, goalMinutes, earliestDate, onPage, onRetry, onSelect }: Props) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const heat = [null, colors.sleepHeat1, colors.sleepHeat2, colors.sleepHeat3, colors.sleepHeat4] as const;
  const title = monthTitle(viewMonth, today);
  const first = `${viewMonth}-01`;
  const last = addDays(shiftMonthStart(first, 1), -1);
  const byDate = mainSleepByDate(load.nights ?? []);
  const stats = load.status === 'ready' ? sleepRangeStats(byDate, first, last, today, goalMinutes) : null;
  // Ruling F11: a month with no nights shows the placeholder, never "0 of 0".
  const counted = stats && stats.nights > 0 ? stats : null;
  const prevDisabled = !earliestDate || viewMonth <= earliestDate.slice(0, 7);
  const nextDisabled = viewMonth >= today.slice(0, 7);

  const dayCell = (d: string) => {
    const minutes = byDate.get(d)?.minutesAsleep ?? null;
    const level = sleepHeatLevel(minutes, goalMinutes);
    const fill = level ? heat[level] : null;
    const future = d > today;
    const selected = d === date;
    const box = (
      <View className={`items-center justify-center rounded-lg ${fill ? '' : 'bg-muted'}`} style={{ height: selected ? BOX - 8 : BOX, backgroundColor: fill ?? undefined }}>
        <Text className={`text-fine font-semibold tabular-nums ${fill ? '' : 'text-muted-foreground'}`} numberOfLines={1}>
          {fill && minutes !== null ? formatHm(minutes) : String(Number(d.slice(8)))}
        </Text>
      </View>
    );
    const body = future ? (
      <View testID={`sleep-month-future-${d}`} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{box}</View>
    ) : (
      <PressableScale testID={`sleep-month-day-${d}`} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={monthCellLabel(d, minutes)} onPress={() => onSelect(d)}>
        {box}
      </PressableScale>
    );
    return selected ? (
      <View testID="sleep-month-selected" style={{ borderWidth: 2, borderColor: colors.foreground, padding: 2, borderRadius: 10 }}>{body}</View>
    ) : body;
  };

  const stat = (testID: string, value: string, label: string) => (
    <View key={testID} testID={testID} className="w-1/2 gap-0.5 pb-2">
      <Text className="text-headline tabular-nums" numberOfLines={1}>{value}</Text>
      <Text className="text-caption text-muted-foreground">{label}</Text>
    </View>
  );

  return (
    <Card testID="sleep-month" className="gap-2.5">
      <View className="flex-row items-center justify-between">
        <SectionLabel testID="sleep-month-title">{title}</SectionLabel>
        <View className="flex-row gap-1.5">
          <Button variant="outline" size="icon-sm" accessibilityLabel={SLEEP_COPY.prevMonth} hitSlop={6} disabled={prevDisabled} onPress={() => onPage(shiftMonth(viewMonth, -1))}>
            <Ionicons name="chevron-back" size={14} color={colors.foreground} />
          </Button>
          <Button variant="outline" size="icon-sm" accessibilityLabel={SLEEP_COPY.nextMonth} hitSlop={6} disabled={nextDisabled} onPress={() => onPage(shiftMonth(viewMonth, 1))}>
            <Ionicons name="chevron-forward" size={14} color={colors.foreground} />
          </Button>
        </View>
      </View>
      <View className="flex-row" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {SLEEP_COPY.weekdayHeader.map((w, i) => (
          <View key={i} style={COLUMN} className="items-center"><Text className="text-fine text-muted-foreground">{w}</Text></View>
        ))}
      </View>
      {load.status === 'error' ? (
        <View className="flex-row items-center gap-2">
          <Text className="text-caption text-muted-foreground">{SLEEP_COPY.monthError(title)}</Text>
          <Button variant="ghost" size="sm" onPress={() => onRetry(viewMonth)}>{SLEEP_COPY.retry}</Button>
        </View>
      ) : load.status === 'loading' ? (
        <View testID="sleep-month-loading" className="flex-row flex-wrap">
          {Array.from({ length: 35 }, (_, i) => (
            <View key={i} style={COLUMN}><Skeleton className="h-9 rounded-lg" /></View>
          ))}
        </View>
      ) : (
        <>
          <View className="flex-row flex-wrap">
            {monthCells(viewMonth).map((cell, i) => (
              <View key={cell.date ?? `blank-${i}`} style={COLUMN}>{cell.date ? dayCell(cell.date) : null}</View>
            ))}
          </View>
          <View className="mt-1 flex-row flex-wrap">
            {stat('sleep-stat-average', counted?.averageMinutes == null ? SLEEP_COPY.noValue : formatDuration(counted.averageMinutes), SLEEP_COPY.statAverage)}
            {stat('sleep-stat-at-goal', counted ? SLEEP_COPY.nightsAtGoal(counted.goalNights, counted.nights) : SLEEP_COPY.noValue, SLEEP_COPY.statAtGoal)}
            {stat('sleep-stat-bedtime', counted?.averageBedtime ? formatClock(counted.averageBedtime) : SLEEP_COPY.noValue, SLEEP_COPY.statBedtime)}
            {stat('sleep-stat-longest', counted?.longest ? formatDuration(counted.longest.minutes) : SLEEP_COPY.noValue, SLEEP_COPY.statLongest)}
          </View>
        </>
      )}
    </Card>
  );
}
