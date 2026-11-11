import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import type { SleepGoal, SleepNight } from '../../api/sleep';
import { dayOfWeek } from '../../lib/heatmap';
import { weekdayLong } from '../../lib/recoveryCopy';
import { SLEEP_COPY } from '../../lib/sleepCopy';
import { layoutSleepWindow } from '../../lib/sleepWindow';
import { formatClock } from '../../lib/sleepStats';
import { withAlpha } from '../../lib/utils';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';

const CHART_HEIGHT = 220;
// Wide enough for "12:00 am" at text-fine.
const TICK_COLUMN = 52;

// One bar per night from bedtime (top) to wake (bottom), a column per date in `dates` (ascending), so a night with
// no data is a gap. The goal window is a faint band with dashed edges (the board); the selected night is ringed and
// the others sit at 45% (spec §3.9, plan ruling 14). A bar press selects its night. Ticks read on the app's clock
// (formatClock), like every other time on the page (spec §2.1, ruling F18). With no bars it shows `emptyText`, which
// the caller picks: only it knows whether the user has any sleep at all (final review I-1).
export function WindowChart({ dates, nights, goal, selectedDate, emptyText, onPressNight }: {
  dates: string[]; nights: SleepNight[]; goal: SleepGoal | null; selectedDate: string | null; emptyText: string;
  onPressNight: (date: string) => void;
}) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const byDate = useMemo(() => new Map(nights.map((n) => [n.date, n])), [nights]);
  const layout = useMemo(() => layoutSleepWindow([...nights].sort((a, b) => a.date.localeCompare(b.date)), goal), [nights, goal]);

  if (layout.bars.length === 0) {
    return (
      <View testID="sleep-window-chart" className="items-center justify-center" style={{ height: CHART_HEIGHT }}>
        <Text testID="sleep-window-empty" className="text-center text-caption text-muted-foreground">
          {emptyText}
        </Text>
      </View>
    );
  }

  const columns = Math.max(1, dates.length);
  const y = (frac: number) => frac * CHART_HEIGHT;
  const edge = withAlpha(palette.metricSleep, 0.6);

  return (
    <View testID="sleep-window-chart" className="gap-1.5">
      <View className="flex-row" style={{ height: CHART_HEIGHT }}>
        <View style={{ width: TICK_COLUMN }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {layout.ticks.map((t) => (
            <Text key={t.label} className="text-fine text-muted-foreground tabular-nums" style={{ position: 'absolute', left: 0, top: Math.min(CHART_HEIGHT - 14, Math.max(0, y(t.at) - 7)) }}>
              {formatClock(t.label)}
            </Text>
          ))}
        </View>
        <View className="flex-1">
          {layout.ticks.map((t) => (
            <View key={t.label} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: y(t.at), height: 1, backgroundColor: palette.hairline }} />
          ))}
          {layout.goalBand ? (
            <>
              <View
                testID="sleep-window-goal-band"
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, right: 0, top: y(layout.goalBand.top), height: y(layout.goalBand.height), backgroundColor: withAlpha(palette.metricSleep, 0.1) }}
              />
              <Svg pointerEvents="none" width="100%" height={CHART_HEIGHT} style={{ position: 'absolute' }}>
                {[layout.goalBand.top, layout.goalBand.top + layout.goalBand.height].map((at, i) => (
                  <Line key={i} testID={i === 0 ? 'sleep-window-goal-top' : 'sleep-window-goal-bottom'} x1="0" x2="100%" y1={y(at)} y2={y(at)} stroke={edge} strokeWidth={1} strokeDasharray="4 4" />
                ))}
              </Svg>
            </>
          ) : null}
          {layout.bars.map((bar) => {
            const column = dates.indexOf(bar.date);
            const night = byDate.get(bar.date);
            if (column < 0 || !night?.bedtime || !night.wakeTime) return null;
            const selected = bar.date === selectedDate;
            return (
              <Pressable
                key={bar.date}
                testID={`sleep-window-bar-${bar.date}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${weekdayLong(bar.date)}: ${formatClock(night.bedtime)} to ${formatClock(night.wakeTime)}${selected ? SLEEP_COPY.selectedSuffix : ''}`}
                onPress={() => onPressNight(bar.date)}
                style={{ position: 'absolute', left: `${(column / columns) * 100}%`, width: `${100 / columns}%`, top: y(bar.top), height: Math.max(4, y(bar.height)), alignItems: 'center' }}
              >
                <View
                  testID={selected ? 'sleep-window-selected' : undefined}
                  style={{ flex: 1, width: '56%', maxWidth: 22, borderRadius: 8, padding: selected ? 2 : 0, borderWidth: selected ? 2 : 0, borderColor: palette.foreground }}
                >
                  <View style={{ flex: 1, borderRadius: 6, backgroundColor: palette.metricSleep, opacity: selected ? 1 : 0.45 }} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View className="flex-row" style={{ paddingLeft: TICK_COLUMN }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {dates.map((d) => (
          <Text
            key={d}
            testID={`sleep-window-initial-${d}`}
            className={`flex-1 text-center text-fine ${d === selectedDate ? 'font-semibold' : 'text-muted-foreground'}`}
            // An explicit colour, so the selected initial is testable (className is not resolved in jest).
            style={d === selectedDate ? { color: palette.foreground } : undefined}
          >
            {SLEEP_COPY.weekdayInitial[dayOfWeek(d)]}
          </Text>
        ))}
      </View>
    </View>
  );
}
