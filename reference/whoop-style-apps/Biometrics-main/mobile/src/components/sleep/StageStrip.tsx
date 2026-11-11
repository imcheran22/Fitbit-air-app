import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { StageType } from '../../api/sleep';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';

type Palette = typeof COLORS.light;

export const STAGE_TOKEN: Record<StageType, keyof Palette> = {
  DEEP: 'sleepDeep',
  REM: 'sleepRem',
  LIGHT: 'sleepLight',
  AWAKE: 'sleepAwake',
};

// Legend and spoken order: deepest first, awake last.
export const STAGE_ORDER: { type: StageType; label: string; spoken: string }[] = [
  { type: 'DEEP', label: 'Deep', spoken: 'deep' },
  { type: 'REM', label: 'REM', spoken: 'REM' },
  { type: 'LIGHT', label: 'Light', spoken: 'light' },
  { type: 'AWAKE', label: 'Awake', spoken: 'awake' },
];

export interface StageSegment {
  type: StageType;
  start: string;
  end: string;
}

/** Whole minutes spent in each stage across the segments. */
export function stageMinutes(stages: StageSegment[]): Record<StageType, number> {
  const out: Record<StageType, number> = { DEEP: 0, REM: 0, LIGHT: 0, AWAKE: 0 };
  for (const s of stages) {
    out[s.type] += Math.max(0, (Date.parse(s.end) - Date.parse(s.start)) / 60000);
  }
  for (const k of Object.keys(out) as StageType[]) out[k] = Math.round(out[k]);
  return out;
}

/** "Sleep stages: 60 min deep, 90 min REM, 120 min light, 30 min awake". */
export function stageStripLabel(stages: StageSegment[]): string {
  const minutes = stageMinutes(stages);
  return `Sleep stages: ${STAGE_ORDER.map((s) => `${minutes[s.type]} min ${s.spoken}`).join(', ')}`;
}

// One night's stage timeline from `start` to `end` (ISO instants). Segments are
// placed by time, so a gap in the data stays a gap. Some neighbouring stage
// colours are close, so the strip speaks its minutes per stage and screens
// show a StageLegend beside it: colour is never the only cue.
export function StageStrip({ stages, start, end, height = 16 }: { stages: StageSegment[]; start: string; end: string; height?: number }) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const t0 = Date.parse(start);
  const span = Date.parse(end) - t0;
  return (
    <View
      testID="stage-strip"
      accessible
      accessibilityRole="image"
      accessibilityLabel={stageStripLabel(stages)}
      style={{ height, borderRadius: 4, overflow: 'hidden', backgroundColor: palette.hairline }}
    >
      {span > 0
        ? stages.map((s, i) => {
            const left = (Date.parse(s.start) - t0) / span;
            const width = (Date.parse(s.end) - Date.parse(s.start)) / span;
            if (!(width > 0)) return null;
            return (
              <View
                key={`${s.start}-${i}`}
                testID={`stage-segment-${s.type}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${Math.max(0, left) * 100}%`,
                  width: `${Math.min(1, width) * 100}%`,
                  backgroundColor: palette[STAGE_TOKEN[s.type]],
                }}
              />
            );
          })
        : null}
    </View>
  );
}

// The visible key for a StageStrip: a swatch and a name per stage.
export function StageLegend() {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  return (
    <View testID="stage-legend" className="flex-row flex-wrap gap-x-3 gap-y-1">
      {STAGE_ORDER.map((s) => (
        <View key={s.type} className="flex-row items-center gap-1.5">
          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: palette[STAGE_TOKEN[s.type]] }} />
          <Text className="text-fine text-muted-foreground">{s.label}</Text>
        </View>
      ))}
    </View>
  );
}
