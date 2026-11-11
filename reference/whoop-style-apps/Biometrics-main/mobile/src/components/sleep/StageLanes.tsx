import React, { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import type { StageType } from '../../api/sleep';
import { midNightWakeIndexes, nightEndMs, type StageSegment } from '../../lib/sleepCycles';
import { formatClock, formatShortDuration, type NightClock } from '../../lib/sleepStats';
import { BLOCK_HEIGHT, LANE_ORDER, LANE_ROW, laneTop, layoutStageLanes } from '../../lib/stageLanes';
import { mixWithWhite, withAlpha } from '../../lib/utils';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';
import { STAGE_ORDER, STAGE_TOKEN } from './StageStrip';

type Palette = typeof COLORS.light;

// The text-safe colour for each stage's name beside its lane.
const LABEL_TOKEN: Record<StageType, keyof Palette> = {
  AWAKE: 'sleepAwakeText',
  REM: 'sleepRemText',
  LIGHT: 'sleepLightText',
  DEEP: 'sleepDeepText',
};

const GUTTER = 76;
const PILL_ROW = 34;
// Blocks rise in left to right over this long, in the order they happened.
const BLOCK_SPREAD = 600;

/** A block's entrance, staggered by where it starts in the night (0..1); none with reduced motion. */
export function laneEntering(at: number, reduced: boolean) {
  if (reduced) return undefined;
  return FadeInDown.delay(80 + Math.round(at * BLOCK_SPREAD))
    .duration(520)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 6 }] });
}

// Links, markers and cycle pills fade in once the blocks have landed.
function fadeAfter(delay: number, reduced: boolean) {
  return reduced ? undefined : FadeIn.delay(delay).duration(600);
}

/** "Sleep stages: 18 min awake, 123 min REM, 231 min light, 90 min deep; woke 1 time in the night". */
export function stageLanesLabel(minutes: Record<StageType, number>, wakeUps: number): string {
  const stages = LANE_ORDER.map((type) => `${minutes[type]} min ${STAGE_ORDER.find((s) => s.type === type)!.spoken}`).join(', ');
  const woke = wakeUps === 0 ? 'no wake-ups in the night' : `woke ${wakeUps} ${wakeUps === 1 ? 'time' : 'times'} in the night`;
  return `Sleep stages: ${stages}; ${woke}`;
}

// One night's stages as four lanes (spec: Night.dc.html): each stretch is a
// solid block in its own lane, so lane and colour both name the stage, with
// thin links where one stage hands over to the next, a marker for each brief
// wake in the night, the sleep cycles as numbered pills beneath, and a local
// time axis. `clock` tells the night's local time (nightClock).
export function StageLanes({ stages, clock }: { stages: StageSegment[]; clock: NightClock }) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme !== 'light';
  const palette = dark ? COLORS.dark : COLORS.light;
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const layout = useMemo(() => layoutStageLanes(stages, width, clock.offset), [stages, width, clock.offset]);
  if (stages.length === 0) return null;

  const t0 = Date.parse(stages[0]!.start);
  const t1 = nightEndMs(stages);
  const axis = [t0, (t0 + t1) / 2, t1].map((t) => formatClock(clock.at(new Date(t).toISOString())));
  const colour = (type: StageType) => palette[STAGE_TOKEN[type]];
  const links = layout.links.map((l) => `M${l.x.toFixed(2)} ${l.y1} L${l.x.toFixed(2)} ${l.y2}`).join(' ');

  return (
    <View testID="stage-lanes" className="gap-2.5">
      <View className="flex-row">
        <View style={{ width: GUTTER }}>
          {LANE_ORDER.map((type) => (
            <View key={type} testID={`stage-lane-${type}`} style={{ height: LANE_ROW, justifyContent: 'center' }}>
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: colour(type) }} />
                <Text className="text-caption font-semibold" style={{ color: palette[LABEL_TOKEN[type]] }}>
                  {STAGE_ORDER.find((s) => s.type === type)!.label}
                </Text>
              </View>
              <Text className="pl-[13px] text-caption text-muted-foreground tabular-nums">
                {formatShortDuration(layout.minutes[type])}
              </Text>
            </View>
          ))}
          <View style={{ height: PILL_ROW, justifyContent: 'center' }}>
            <Text className="text-caption font-medium">Cycles</Text>
          </View>
        </View>

        <View testID="stage-lanes-area" className="flex-1" onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={stageLanesLabel(layout.minutes, midNightWakeIndexes(stages).size)}
            style={{ height: layout.height }}
          >
            {width > 0 ? (
              <Svg width={width} height={layout.height} style={{ position: 'absolute', left: 0, top: 0 }}>
                {layout.hourGuides.map((x) => (
                  <Line key={x} x1={x} x2={x} y1={4} y2={layout.height - 4} stroke={palette.border} strokeWidth={1} strokeDasharray="3 3" />
                ))}
              </Svg>
            ) : null}
            {LANE_ORDER.map((type) => (
              <View
                key={type}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: laneTop(type),
                  height: BLOCK_HEIGHT,
                  borderRadius: 8,
                  backgroundColor: withAlpha(colour(type), dark ? 0.12 : 0.09),
                }}
              />
            ))}
            {width > 0 && links ? (
              <Animated.View entering={fadeAfter(700, reduced)} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
                <Svg width={width} height={layout.height}>
                  <Path d={links} fill="none" stroke={withAlpha(palette.foreground, dark ? 0.28 : 0.22)} strokeWidth={1.5} strokeLinecap="round" />
                </Svg>
              </Animated.View>
            ) : null}
            {layout.blocks.map((b) => {
              const c = colour(b.type);
              const id = `lane-block-${b.index}`;
              return (
                <Animated.View
                  key={b.index}
                  testID="stage-block"
                  entering={laneEntering(b.at, reduced)}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: b.left,
                    top: b.top,
                    width: b.width,
                    height: b.height,
                    borderRadius: b.radius,
                    shadowColor: c,
                    shadowOpacity: dark ? 0.35 : 0.25,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Svg width={b.width} height={b.height}>
                    <Defs>
                      <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={mixWithWhite(c, dark ? 0.18 : 0.14)} />
                        <Stop offset="1" stopColor={c} />
                      </LinearGradient>
                    </Defs>
                    <Rect x={0} y={0} width={b.width} height={b.height} rx={b.radius} fill={`url(#${id})`} />
                  </Svg>
                </Animated.View>
              );
            })}
            {layout.markers.map((m) => (
              <Animated.View
                key={m.index}
                testID="stage-wake-marker"
                entering={fadeAfter(80 + BLOCK_SPREAD + 220, reduced)}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: m.x - 9,
                  top: m.y - 9,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  borderWidth: 3,
                  borderColor: palette.card,
                  backgroundColor: palette.sleepAwake,
                  shadowColor: palette.sleepAwake,
                  shadowOpacity: dark ? 0.6 : 0.4,
                  shadowRadius: 5,
                  shadowOffset: { width: 0, height: 0 },
                }}
              />
            ))}
          </View>
          <View style={{ height: PILL_ROW }}>
            {layout.cyclePills.map((p) => (
              <Animated.View
                key={p.n}
                testID="stage-cycle-pill"
                entering={fadeAfter(900, reduced)}
                style={{ position: 'absolute', left: p.left, top: 6, width: p.width, height: 22 }}
              >
                <View className="flex-1 items-center justify-center rounded-full bg-muted">
                  <Text className="text-fine">{String(p.n)}</Text>
                </View>
              </Animated.View>
            ))}
          </View>
        </View>
      </View>

      <View testID="stage-lanes-axis" className="flex-row justify-between" style={{ marginLeft: GUTTER }}>
        {axis.map((label, i) => (
          <Text key={i} className="text-fine text-muted-foreground tabular-nums">
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}
