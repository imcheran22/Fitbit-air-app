import React from 'react';
import { Pressable, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { SleepActivityDTO } from '../../api/sleep';
import { COLORS } from '../../theme';
import { addDays } from '../../lib/heatmap';
import { BAND_WORD } from '../../lib/recoveryCopy';
import { scoreBand } from '../../lib/scoreInsights';
import { formatHm, pickerCellLabel, pickerWeekday, SLEEP_COPY } from '../../lib/sleepCopy';
import { isNapOnly, mainMinutes } from '../../lib/sleepStats';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';
import { SectionError, type Section } from './Section';

// Seven nights A-6..A, oldest left (spec §3.3). Tabs, so the buttons guard does not flag them (plan ruling 12).
// The selected night uses the default look, the others the outline look; rounded-lg, never pills.
export function NightPicker({ anchor, today, date, window, syncing, onSelect, onRetry }: {
  anchor: string; today: string; date: string; window: Section<SleepActivityDTO>; syncing: boolean;
  onSelect: (date: string) => void; onRetry: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  if (window.phase === 'loading') return <Skeleton testID="sleep-picker-loading" className="h-[60px] w-full rounded-lg" />;
  if (window.phase === 'error') return <SectionError testID="sleep-window-retry" message={SLEEP_COPY.windowError} onRetry={onRetry} />;

  const byDate = new Map(window.data.nights.map((n) => [n.date, n]));
  const dates = Array.from({ length: 7 }, (_, i) => addDays(anchor, i - 6));
  const todayMissing = anchor === today && !byDate.has(today);
  return (
    <View className="gap-2">
      <View accessibilityRole="tablist" className="flex-row gap-[5px]">
        {dates.map((d) => {
          const n = byDate.get(d);
          const minutes = n && !isNapOnly(n) ? mainMinutes(n) : null;
          const band = n && minutes !== null && n.sleepScore !== null ? scoreBand(n.sleepScore, window.data.bands) : null;
          const selected = d === date;
          return (
            <Pressable
              key={d}
              testID={`sleep-night-${d}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={pickerCellLabel({ date: d, today, minutes, band: band ? BAND_WORD[band] : null })}
              onPress={() => onSelect(d)}
              className={`h-[60px] flex-1 items-center justify-center gap-0.5 rounded-lg border active:opacity-70 ${selected ? 'border-primary bg-primary' : 'border-border'}`}
            >
              <Text className={`text-fine ${selected ? 'text-primary-foreground' : 'text-muted-foreground'}`} numberOfLines={1}>
                {pickerWeekday(d, today)}
              </Text>
              <Text className={`text-caption tabular-nums ${selected ? 'font-bold text-primary-foreground' : ''}`} numberOfLines={1}>
                {minutes === null ? SLEEP_COPY.noValue : formatHm(minutes)}
              </Text>
              <View testID={`sleep-night-dash-${d}`} style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: band ? colors[band] : colors.hairline }} />
            </Pressable>
          );
        })}
      </View>
      {todayMissing ? <Text testID="sleep-still-syncing" className="text-caption text-muted-foreground">{SLEEP_COPY.stillSyncing(syncing)}</Text> : null}
      {window.data.stagesBackfillPending ? <Text testID="sleep-older-nights" className="text-caption text-muted-foreground">{SLEEP_COPY.backfill}</Text> : null}
    </View>
  );
}
