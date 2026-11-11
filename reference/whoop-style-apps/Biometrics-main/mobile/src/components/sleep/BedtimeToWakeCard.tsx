import React from 'react';
import { View } from 'react-native';
import type { SleepGoal, SleepNight } from '../../api/sleep';
import { addDays } from '../../lib/heatmap';
import { SLEEP_COPY } from '../../lib/sleepCopy';
import { isNapOnly } from '../../lib/sleepStats';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { SegmentedControl } from '../ui/segmented-control';
import { WindowChart } from './WindowChart';

export type SleepRange = 'week' | 'two-weeks';

// Bedtime to wake over A-6..A or A-13..A (spec §3.9). Nap-only dates are not nights (plan ruling 5).
// `hasSleep` is false only when nothing has ever synced (the window's earliestDate is null).
export function BedtimeToWakeCard({ anchor, date, nights, hasSleep, goal, range, onRange, onSelect }: {
  anchor: string; date: string; nights: SleepNight[]; hasSleep: boolean; goal: SleepGoal | null; range: SleepRange;
  onRange: (r: SleepRange) => void; onSelect: (date: string) => void;
}) {
  const days = range === 'week' ? 7 : 14;
  const dates = Array.from({ length: days }, (_, i) => addDays(anchor, i - (days - 1)));
  // Only the visible range: the page-scoped fetch reaches further back, and those nights must not set the axis or
  // the empty state.
  const visible = new Set(dates);
  const shown = nights.filter((n) => visible.has(n.date) && !isNapOnly(n));
  return (
    <Card testID="sleep-window-card" className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <SectionLabel>{SLEEP_COPY.bedtimeToWake}</SectionLabel>
        <View style={{ width: 168 }}>
          <SegmentedControl
            testID="sleep-range"
            options={[{ value: 'week', label: SLEEP_COPY.rangeWeek }, { value: 'two-weeks', label: SLEEP_COPY.rangeTwoWeeks }]}
            value={range}
            onChange={onRange}
          />
        </View>
      </View>
      <WindowChart
        dates={dates}
        nights={shown}
        goal={goal}
        selectedDate={date}
        emptyText={hasSleep ? SLEEP_COPY.windowEmptyRange : SLEEP_COPY.windowEmptyNoSleep}
        onPressNight={onSelect}
      />
    </Card>
  );
}
