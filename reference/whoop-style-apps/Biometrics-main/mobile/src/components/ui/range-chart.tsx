import React, { useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import type { MetricRecord } from '../../lib/metricInsights';
import { formatRange, rangePosition, type UsualRange } from '../../lib/usualRange';
import { withAlpha } from '../../lib/utils';
import { COLORS } from '../../theme';
import { Text } from './text';

const PAD_X = 8;
const PAD_Y = 10;

/** The value domain drawn: every reading and the band, with headroom so dots never touch the edge. */
export function yDomain(values: number[], range: UsualRange | null): [number, number] {
  const all = range ? [...values, range.low, range.high] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || Math.max(Math.abs(max) * 0.1, 1);
  return [min - span * 0.12, max + span * 0.12];
}

export function xAt(index: number, count: number, width: number): number {
  if (count <= 1) return width / 2;
  return PAD_X + (index * (width - 2 * PAD_X)) / (count - 1);
}

export function yAt(value: number, domain: [number, number], height: number): number {
  const [min, max] = domain;
  return PAD_Y + (1 - (value - min) / (max - min)) * (height - 2 * PAD_Y);
}

/** The reading nearest a touch at `x`, clamped to the series. */
export function nearestIndex(x: number, count: number, width: number): number {
  if (count <= 1 || width <= 2 * PAD_X) return 0;
  const raw = Math.round(((x - PAD_X) / (width - 2 * PAD_X)) * (count - 1));
  return Math.max(0, Math.min(count - 1, raw));
}

export function shortDate(record: MetricRecord): string {
  const [y, m, d] = record.recordedAt.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface RangeChartProps {
  points: MetricRecord[];
  range: UsualRange | null;
  color: string;
  format: (value: number) => string;
  height?: number;
  // Compact: a card-sized chart with no axes and no scrubbing.
  compact?: boolean;
  // Scrubbing reports the reading under the finger (null when released), so
  // the screen can show it in its headline number.
  onSelect?: (index: number | null) => void;
  accessibilityLabel?: string;
  testID?: string;
}

// A metric against its own usual range (Apple-Vitals style). The line stays
// neutral; only readings outside the band, and the latest reading, take the
// metric's colour -- in the same colour above or below, because whether
// "above" is good depends on the metric and this chart doesn't judge.
export function RangeChart({
  points,
  range,
  color,
  format,
  height = 180,
  compact = false,
  onSelect,
  accessibilityLabel,
  testID,
}: RangeChartProps) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const lastIndex = useRef<number | null>(null);

  const count = points.length;
  const values = points.map((p) => p.value);
  const domain = count > 0 ? yDomain(values, range) : ([0, 1] as [number, number]);

  const select = (index: number | null) => {
    if (index === lastIndex.current) return;
    if (index !== null) void Haptics.selectionAsync();
    lastIndex.current = index;
    setSelected(index);
    onSelect?.(index);
  };

  // Same claim rule as the forecast Slider: this sits in a vertical ScrollView,
  // so a drag only becomes a scrub once it is clearly horizontal.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-8, 8])
    .failOffsetY([-8, 8])
    .onStart((e) => select(nearestIndex(e.x, count, width)))
    .onUpdate((e) => select(nearestIndex(e.x, count, width)))
    .onFinalize(() => select(null));
  const gesture = compact || count < 2 ? Gesture.Tap().enabled(false) : pan;

  const xs = points.map((_, i) => xAt(i, count, width));
  const ys = values.map((v) => yAt(v, domain, height));
  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const bandTop = range ? yAt(range.high, domain, height) : 0;
  const bandBottom = range ? yAt(range.low, domain, height) : 0;
  const neutral = withAlpha(colors.muted, 0.6);

  const tooltip = selected !== null && width > 0 ? points[selected] : null;
  const tooltipWidth = 132;
  const tooltipLeft = tooltip ? Math.max(0, Math.min(width - tooltipWidth, xs[selected!] - tooltipWidth / 2)) : 0;

  return (
    <View testID={testID} className="gap-2">
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityLabel={accessibilityLabel}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
          style={{ height }}
        >
          {width > 0 && count > 0 ? (
            <Svg width={width} height={height}>
              {range ? (
                <>
                  <Rect
                    testID="range-band"
                    x={0}
                    y={bandTop}
                    width={width}
                    height={Math.max(bandBottom - bandTop, 1.5)}
                    fill={withAlpha(color, 0.12)}
                    rx={4}
                  />
                  {!compact ? (
                    <>
                      <Line x1={0} x2={width} y1={bandTop} y2={bandTop} stroke={withAlpha(color, 0.35)} strokeDasharray="3 4" />
                      <Line x1={0} x2={width} y1={bandBottom} y2={bandBottom} stroke={withAlpha(color, 0.35)} strokeDasharray="3 4" />
                    </>
                  ) : null}
                </>
              ) : null}
              {count > 1 ? (
                <Path d={linePath} stroke={neutral} strokeWidth={compact ? 1.75 : 2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              ) : null}
              {tooltip ? <Line x1={xs[selected!]} x2={xs[selected!]} y1={0} y2={height} stroke={withAlpha(colors.foreground, 0.35)} /> : null}
              {points.map((p, i) => {
                const outside = range !== null && rangePosition(p.value, range) !== 'within';
                const isLast = i === count - 1;
                const isSelected = i === selected;
                if (!outside && !isLast && !isSelected) return null;
                return (
                  <Circle
                    key={p.id}
                    testID={outside ? `range-outlier-${i}` : undefined}
                    cx={xs[i]}
                    cy={ys[i]}
                    r={isLast || isSelected ? (compact ? 4 : 5.5) : compact ? 2.5 : 3.5}
                    fill={outside || isLast ? color : colors.foreground}
                    stroke={isLast || isSelected ? colors.card : undefined}
                    strokeWidth={isLast || isSelected ? 2.5 : 0}
                  />
                );
              })}
            </Svg>
          ) : null}
          {tooltip ? (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', top: 0, left: tooltipLeft, width: tooltipWidth }}
              className="items-center rounded-tile border border-border bg-surface-raised px-2.5 py-1.5"
            >
              <Text className="text-caption text-muted-foreground">{shortDate(tooltip)}</Text>
              <Text className="text-body font-bold tabular-nums">
                {format(tooltip.value)}
              </Text>
            </View>
          ) : null}
          {!compact && range && width > 0 ? (
            <>
              <View pointerEvents="none" className="absolute left-0 rounded-full bg-card px-1.5" style={{ top: bandTop - 8 }}>
                <Text className="text-fine text-muted-foreground">{format(range.high)}</Text>
              </View>
              <View pointerEvents="none" className="absolute left-0 rounded-full bg-card px-1.5" style={{ top: bandBottom - 8 }}>
                <Text className="text-fine text-muted-foreground">{format(range.low)}</Text>
              </View>
            </>
          ) : null}
        </View>
      </GestureDetector>

      {!compact && count > 1 ? (
        <View className="flex-row justify-between px-1">
          <Text className="text-fine text-muted-foreground">{shortDate(points[0])}</Text>
          <Text className="text-fine text-muted-foreground">{shortDate(points[Math.floor((count - 1) / 2)])}</Text>
          <Text className="text-fine text-muted-foreground">{shortDate(points[count - 1])}</Text>
        </View>
      ) : null}

      {!compact ? (
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 px-1">
          {range ? (
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-3.5 rounded-sm" style={{ backgroundColor: withAlpha(color, 0.3) }} />
              <Text className="text-fine text-muted-foreground">{`Usual range · ${formatRange(range.low, range.high, format)}`}</Text>
            </View>
          ) : null}
          {range ? (
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <Text className="text-fine text-muted-foreground">Outside it</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
