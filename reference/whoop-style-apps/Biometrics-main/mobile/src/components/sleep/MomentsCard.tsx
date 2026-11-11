import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import type { StageType } from '../../api/sleep';
import type { StageSegment } from '../../lib/sleepCycles';
import { findSleepMoments } from '../../lib/sleepMoments';
import { formatClock, formatDuration, formatShortDuration, type NightClock } from '../../lib/sleepStats';
import { COLORS } from '../../theme';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';
import { STAGE_TOKEN, stageMinutes } from './StageStrip';

// The ring: 112 px across, 12 px thick, a small gap between stages.
const SIZE = 112;
const C = SIZE / 2;
const R_OUTER = 54;
const R_INNER = 42;
// The centre duration's widest line: the hole's chord at the text's edge,
// so a long night ("10h 59m") shrinks rather than running onto the band.
const HOLE_TEXT = 76;
const GAP = 0.05;

const MIX: { type: Exclude<StageType, 'AWAKE'>; label: string; spoken: string }[] = [
  { type: 'DEEP', label: 'Deep', spoken: 'deep' },
  { type: 'LIGHT', label: 'Light', spoken: 'light' },
  { type: 'REM', label: 'REM', spoken: 'REM' },
];

/** A ring sector from angle a0 to a1 (radians, clockwise from 3 o'clock). */
function sector(a0: number, a1: number): string {
  const pt = (r: number, a: number) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(R_OUTER, a0)} A${R_OUTER} ${R_OUTER} 0 ${large} 1 ${pt(R_OUTER, a1)} L${pt(R_INNER, a1)} A${R_INNER} ${R_INNER} 0 ${large} 0 ${pt(R_INNER, a0)} Z`;
}

interface Moment {
  type: StageType;
  title: string;
  detail: string;
  value: string;
}

// The night's stage mix and highlights (spec: Night.dc.html): a ring of deep,
// light and REM as shares of time asleep with a row per stage, then the
// moments that stood out, each shown only when the night had one. The centre
// is the night's own `minutesAsleep` (the header's number); the slices and
// rows are shares of the stage sums.
export function MomentsCard({
  stages,
  clock,
  minutesToFallAsleep,
  minutesAsleep,
}: {
  stages: StageSegment[];
  clock: NightClock;
  minutesToFallAsleep: number | null;
  minutesAsleep: number;
}) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const minutes = stageMinutes(stages);
  const asleep = minutes.DEEP + minutes.LIGHT + minutes.REM;
  const pct = (type: StageType) => (asleep > 0 ? Math.round((minutes[type] / asleep) * 100) : 0);
  const localTime = (iso: string) => formatClock(clock.at(iso));

  let angle = -Math.PI / 2;
  const ring = MIX.map((m) => {
    const sweep = asleep > 0 ? (minutes[m.type] / asleep) * 2 * Math.PI : 0;
    const d = sweep > GAP ? sector(angle + GAP / 2, angle + sweep - GAP / 2) : null;
    angle += sweep;
    return { type: m.type, d };
  });

  const found = findSleepMoments(stages, minutesToFallAsleep);
  const moments: Moment[] = [];
  if (found.fellAsleepMinutes !== null) {
    moments.push({ type: 'LIGHT', title: 'Fell asleep', detail: 'after getting into bed', value: formatShortDuration(found.fellAsleepMinutes) });
  }
  if (found.deepest) {
    moments.push({ type: 'DEEP', title: 'Deepest stretch', detail: `from ${localTime(found.deepest.start)}`, value: formatShortDuration(found.deepest.minutes) });
  }
  if (found.longestRem) {
    moments.push({ type: 'REM', title: 'Longest dream sleep', detail: `from ${localTime(found.longestRem.start)}`, value: formatShortDuration(found.longestRem.minutes) });
  }
  if (found.wakeUps.length > 0) {
    moments.push({
      type: 'AWAKE',
      title: 'Woke during the night',
      detail: found.wakeUps.map((w) => `${formatShortDuration(w.minutes)} at ${localTime(w.start)}`).join(', '),
      value: `${found.wakeUps.length}×`,
    });
  }

  return (
    <Card testID="moments-card" className="gap-3.5">
      <SectionLabel>Moments</SectionLabel>
      <View className="flex-row items-center gap-4">
        <View style={{ width: SIZE, height: SIZE }}>
          <Svg
            width={SIZE}
            height={SIZE}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Stage mix: ${MIX.map((m) => `${m.spoken} ${pct(m.type)} percent`).join(', ')} of time asleep`}
          >
            {ring.map((r) => (r.d ? <Path key={r.type} d={r.d} fill={palette[STAGE_TOKEN[r.type]]} /> : null))}
          </Svg>
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <Text className="text-heading tabular-nums" numberOfLines={1} adjustsFontSizeToFit style={{ maxWidth: HOLE_TEXT }}>
              {formatDuration(minutesAsleep)}
            </Text>
            <Text className="text-caption text-muted-foreground">asleep</Text>
          </View>
        </View>
        <View className="flex-1 gap-2">
          {MIX.map((m) => (
            <View key={m.type} className="flex-row items-center gap-2">
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette[STAGE_TOKEN[m.type]] }} />
              <Text className="flex-1 text-caption">{m.label}</Text>
              <Text className="text-caption text-muted-foreground tabular-nums">
                {formatShortDuration(minutes[m.type])}
              </Text>
              <Text className="w-9 text-right text-caption tabular-nums">
                {`${pct(m.type)}%`}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {moments.map((m) => (
        <View key={m.title} testID="moment-row" className="flex-row items-center gap-3 border-t border-border pt-3">
          <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: palette[STAGE_TOKEN[m.type]] }} />
          <View className="flex-1 gap-px">
            <Text className="text-body font-medium">{m.title}</Text>
            <Text className="text-caption text-muted-foreground">{m.detail}</Text>
          </View>
          <Text className="text-heading tabular-nums">{m.value}</Text>
        </View>
      ))}
    </Card>
  );
}
