import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { findSleepCycles, type CycleTail, type SleepCycle, type StageSegment } from '../../lib/sleepCycles';
import { formatClock, formatShortDuration, type NightClock } from '../../lib/sleepStats';
import { COLORS } from '../../theme';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';
import { STAGE_TOKEN } from './StageStrip';

/** "7 min" under an hour, "1h 15m" from there. */
function spokenMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : formatShortDuration(minutes);
}

/** What followed the last cycle, or null when the last cycle ended the night. */
export function tailLine(tail: CycleTail): string | null {
  // The tail can hold any stage (and a brief wake), so it is just "sleep".
  if (tail.sleepMinutes > 0) return `Then ${spokenMinutes(tail.sleepMinutes)} of sleep before you woke.`;
  if (tail.awakeMinutes > 0) return `Then ${spokenMinutes(tail.awakeMinutes)} awake before you got up.`;
  return null;
}

/** Each stage stretch inside the cycle as a share of it: [left, width] in 0..1. */
function cycleParts(stages: StageSegment[], cycle: SleepCycle) {
  const a = Date.parse(cycle.start);
  const b = Date.parse(cycle.end);
  const len = b - a;
  return stages
    .map((s) => ({ type: s.type, from: Math.max(Date.parse(s.start), a), to: Math.min(Date.parse(s.end), b) }))
    .filter((p) => p.to > p.from && len > 0)
    .map((p) => ({ type: p.type, left: (p.from - a) / len, width: (p.to - p.from) / len }));
}

// The night's sleep cycles (spec: Night.dc.html): one row per cycle with its
// length, when it began, a stage bar scaled to the longest cycle and its deep,
// REM and light minutes, then a line on how the night ended.
export function SleepCyclesCard({ stages, clock }: { stages: StageSegment[]; clock: NightClock }) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const { cycles, tail, averageMinutes } = findSleepCycles(stages);
  const longest = Math.max(1, ...cycles.map((c) => c.minutes));
  const footer = cycles.length > 0 ? tailLine(tail) : null;

  return (
    <Card testID="cycles-card" className="gap-3.5">
      <View className="flex-row items-baseline justify-between">
        <SectionLabel>{cycles.length > 0 ? `${cycles.length} sleep ${cycles.length === 1 ? 'cycle' : 'cycles'}` : 'Sleep cycles'}</SectionLabel>
        {averageMinutes !== null ? <Text className="text-caption text-muted-foreground">{`avg ${formatShortDuration(averageMinutes)}`}</Text> : null}
      </View>

      {cycles.length === 0 ? (
        <Text className="text-caption text-muted-foreground">Not enough REM sleep to split this night into cycles.</Text>
      ) : null}

      {cycles.map((c) => (
        <View key={c.n} testID="cycle-row" className="flex-row items-start gap-3">
          <View className="h-6 w-6 items-center justify-center rounded-full bg-muted">
            <Text className="text-caption font-semibold">{String(c.n)}</Text>
          </View>
          <View className="flex-1 gap-1.5">
            <View className="flex-row items-baseline justify-between">
              <Text className="text-body font-medium tabular-nums">
                {formatShortDuration(c.minutes)}
              </Text>
              <Text className="text-caption text-muted-foreground tabular-nums">
                {formatClock(clock.at(c.start))}
              </Text>
            </View>
            <View className="h-2.5 overflow-hidden rounded-full bg-muted" style={{ width: `${(c.minutes / longest) * 100}%` }}>
              {cycleParts(stages, c).map((p, i) => (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${p.left * 100}%`,
                    width: `${p.width * 100}%`,
                    minWidth: 2,
                    backgroundColor: palette[STAGE_TOKEN[p.type]],
                  }}
                />
              ))}
            </View>
            <Text className="text-caption text-muted-foreground">
              {`Deep ${formatShortDuration(c.stageMinutes.DEEP)} · REM ${formatShortDuration(c.stageMinutes.REM)} · Light ${formatShortDuration(c.stageMinutes.LIGHT)}`}
            </Text>
          </View>
        </View>
      ))}

      {footer ? <Text className="text-caption text-muted-foreground">{footer}</Text> : null}
    </Card>
  );
}
