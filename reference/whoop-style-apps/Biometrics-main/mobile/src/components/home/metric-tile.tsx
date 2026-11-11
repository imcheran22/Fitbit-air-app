import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { computeStats, type MetricRecord } from '../../lib/metricInsights';
import { withAlpha } from '../../lib/utils';
import { METRIC_CONFIG, type MetricType } from '../../theme';
import { Card } from '../ui/card';
import { CountUp } from '../ui/count-up';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';
import { TrendLine } from '../ui/trend-line';

// How many recent readings the sparkline draws.
const SPARK_POINTS = 14;

// "12% above your average" / "Steady" -- the same own-baseline comparison as
// the Home insight, never a judgement of good or bad.
export function trendCaption(series: MetricRecord[]): string | null {
  const stats = computeStats(series);
  if (!stats || series.length < 2) return null;
  if (stats.direction === 'steady') return 'Steady vs your average';
  return `${Math.round(stats.trendPercent)}% ${stats.direction} your average`;
}

// One metric in the Home grid: its latest reading as the number, then either
// progress toward a real goal (steps, sleep) or a sparkline (metrics with no
// universal goal). The metric's own colour is used only on its label, bar
// and line.
export function MetricTile({ type, series, onPress }: { type: MetricType; series: MetricRecord[]; onPress: () => void }) {
  const { colorScheme: scheme } = useColorScheme();
  const config = METRIC_CONFIG[type];
  const color = scheme === 'dark' ? config.color.dark : config.color.light;
  const latest = series[series.length - 1];
  const percent = config.goal ? latest.value / config.goal : undefined;
  const caption = percent !== undefined ? `${Math.round(percent * 100)}% of goal` : trendCaption(series);

  return (
    <PressableScale testID={`metric-card-${type}`} accessibilityRole="button" onPress={onPress} className="flex-1">
      <Card className="flex-1 gap-2">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name={config.icon as any} size={14} color={color} />
          <Text className="flex-1 text-caption font-medium" style={{ color }}>
            {config.label}
          </Text>
        </View>
        <CountUp
          value={latest.value}
          format={config.format}
          numberOfLines={1}
          adjustsFontSizeToFit
          className="text-display tabular-nums"
        />
        {percent !== undefined ? (
          <View className="my-2.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: withAlpha(color, 0.16) }}>
            <View className="h-1.5 rounded-full" style={{ width: `${Math.min(percent, 1) * 100}%`, backgroundColor: color }} />
          </View>
        ) : (
          <TrendLine data={series.slice(-SPARK_POINTS).map((r) => r.value)} color={color} height={26} />
        )}
        {caption ? <Text className="text-caption text-muted-foreground">{caption}</Text> : null}
      </Card>
    </PressableScale>
  );
}
