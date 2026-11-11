import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { RecoveryPageDTO } from '../../api/recovery';
import { COLORS } from '../../theme';
import { monthCells } from '../../lib/calendarGrid';
import { BAND_WORD, monthCaption, monthTitle, RECOVERY_COPY, shiftMonth } from '../../lib/recoveryCopy';
import { scoreBand, type ScoreBand } from '../../lib/scoreInsights';
import type { MonthLoad } from '../../lib/useRecoveryPage';
import { withAlpha } from '../../lib/utils';
import { Button } from '../ui/button';
import { PressableScale } from '../ui/pressable-scale';
import { SectionLabel } from '../ui/section-label';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';

const COLUMN = { width: '14.2857%', padding: 2 } as const;
const BOX = 38;
const LEGEND: ScoreBand[] = ['scoreExcellent', 'scoreGood', 'scoreFair', 'scorePoor'];

type Props = {
  page: RecoveryPageDTO;
  viewMonth: string;
  load: MonthLoad;
  onPage: (month: string) => void;
  onRetry: (month: string) => void;
  onOpenDay: (date: string) => void;
  today: string;
};

// The month calendar with paging (spec §3.7). D's month comes in the bundle; other months load through `load`.
// Past days and today open that day's Recovery (a day with no row opens the no-data state); future days are inert.
export function RecoveryCalendar({ page, viewMonth, load, onPage, onRetry, onOpenDay, today }: Props) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const colors = dark ? COLORS.dark : COLORS.light;
  const title = monthTitle(viewMonth, today);
  const data = load.data;
  const scores = new Map((data?.days ?? []).map((d) => [d.date, d.score]));
  const prevDisabled = !page.firstScoredDate || viewMonth <= page.firstScoredDate.slice(0, 7);
  const nextDisabled = viewMonth >= today.slice(0, 7);

  const dayCell = (cell: { date: string }) => {
    const { date } = cell;
    const score = scores.get(date) ?? null;
    const band = score === null ? null : scoreBand(score, page.bands);
    const future = date > today;
    const selected = date === page.date;
    const isToday = date === today && !selected;
    const scored = band !== null && !future;
    const fill = scored ? (dark ? colors[band] : withAlpha(colors[band], 0.22)) : undefined;
    const ink = scored ? (dark ? COLORS.dark.background : colors.foreground) : undefined;
    // The ring and its gap take 8 px, so a selected cell keeps the same 38 px slot.
    const box = (
      <View
        className={`items-center justify-center rounded-lg ${scored ? '' : 'bg-muted'}`}
        style={{ height: selected ? BOX - 8 : BOX, backgroundColor: fill }}
      >
        <Text
          className={`text-fine tabular-nums ${isToday ? 'font-bold' : 'font-semibold'} ${scored ? '' : 'text-muted-foreground'}`}
          style={ink ? { color: ink } : undefined}
          numberOfLines={1}
        >
          {scored ? String(Math.round(score!)) : String(Number(date.slice(8)))}
        </Text>
      </View>
    );
    const body = future ? (
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{box}</View>
    ) : (
      <PressableScale
        testID={`recovery-cal-${cell.date}`}
        accessibilityRole="button"
        accessibilityLabel={RECOVERY_COPY.cellLabel(date, score, band === null ? null : BAND_WORD[band])}
        onPress={() => onOpenDay(date)}
      >
        {box}
      </PressableScale>
    );
    return selected ? (
      <View testID="recovery-cal-selected" style={{ borderWidth: 2, borderColor: colors.foreground, padding: 2, borderRadius: 10 }}>
        {body}
      </View>
    ) : (
      body
    );
  };

  return (
    <View testID="recovery-calendar" className="gap-2">
      <View className="flex-row items-center justify-between">
        <SectionLabel>{title}</SectionLabel>
        <View className="flex-row gap-1">
          <Button variant="ghost" size="icon-sm" accessibilityLabel={RECOVERY_COPY.prevMonth} hitSlop={6} disabled={prevDisabled} onPress={() => onPage(shiftMonth(viewMonth, -1))}>
            <Ionicons name="chevron-back" size={16} color={colors.foreground} />
          </Button>
          <Button variant="ghost" size="icon-sm" accessibilityLabel={RECOVERY_COPY.nextMonth} hitSlop={6} disabled={nextDisabled} onPress={() => onPage(shiftMonth(viewMonth, 1))}>
            <Ionicons name="chevron-forward" size={16} color={colors.foreground} />
          </Button>
        </View>
      </View>

      {load.status === 'error' ? (
        <View className="flex-row items-center gap-2">
          <Text className="text-caption text-muted-foreground">{RECOVERY_COPY.monthError(title)}</Text>
          <Button variant="ghost" size="sm" onPress={() => onRetry(viewMonth)}>{RECOVERY_COPY.retry}</Button>
        </View>
      ) : data && data.average !== null ? (
        <View className="flex-row items-baseline gap-2">
          <Text className="text-number">{String(Math.round(data.average))}</Text>
          <Text className="text-caption text-muted-foreground">{monthCaption(data.counts)}</Text>
        </View>
      ) : null}

      <View className="flex-row">
        {RECOVERY_COPY.weekdayHeader.map((d, i) => (
          <View key={i} style={COLUMN} className="items-center">
            <Text className="text-fine text-muted-foreground">{d}</Text>
          </View>
        ))}
      </View>

      {load.status === 'loading' && !data ? (
        <View testID="recovery-cal-loading" className="flex-row flex-wrap">
          {Array.from({ length: 35 }, (_, i) => (
            <View key={i} style={COLUMN}>
              <Skeleton className="h-[38px] rounded-lg" />
            </View>
          ))}
        </View>
      ) : data ? (
        <View className="flex-row flex-wrap">
          {monthCells(viewMonth).map((cell, i) => (
            <View key={cell.date ?? `blank-${i}`} style={COLUMN}>
              {cell.date ? dayCell({ date: cell.date }) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View className="flex-row flex-wrap items-center gap-3">
        {LEGEND.map((b) => (
          <View key={b} className="flex-row items-center gap-1">
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[b] }} />
            <Text className="text-fine text-muted-foreground">{BAND_WORD[b]}</Text>
          </View>
        ))}
      </View>
      <Text className="text-fine text-muted-foreground">{RECOVERY_COPY.calendarHint}</Text>
    </View>
  );
}
