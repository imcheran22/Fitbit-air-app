import React, { useEffect, useMemo, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { Text } from '../components/ui/text';
import { Card } from '../components/ui/card';
import { CountUp } from '../components/ui/count-up';
import { RangeChart } from '../components/ui/range-chart';
import { SectionLabel } from '../components/ui/section-label';
import { SegmentedControl } from '../components/ui/segmented-control';
import { METRIC_CONFIG } from '../theme';
import { computeStats, buildDetailSentences, type MetricRecord } from '../lib/metricInsights';
import { TREND_RANGES, inWindow, rangeDays, type TrendRange } from '../lib/metricTrends';
import { rangePendingText, rangeSentence, usualRange } from '../lib/usualRange';
import type { RootStackParamList } from '../navigation/RootNavigator';

type MetricDetailRoute = RouteProp<RootStackParamList, 'MetricDetail'>;

const RANGE_OPTIONS = TREND_RANGES.map(({ value, label }) => ({ value, label }));

/** "Wed, Sep 2" from a civil-date record, without shifting the day by timezone. */
export function readingDate(record: MetricRecord): string {
  const [y, m, d] = record.recordedAt.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function MetricDetailScreen() {
  const route = useRoute<MetricDetailRoute>();
  const navigation = useNavigation<any>();
  const { colorScheme: scheme } = useColorScheme();
  const { metricType, records, range: initialRange } = route.params;
  const config = METRIC_CONFIG[metricType];
  const color = scheme === 'dark' ? config.color.dark : config.color.light;
  const [range, setRange] = useState<TrendRange>(initialRange ?? '30d');
  const [scrubbed, setScrubbed] = useState<number | null>(null);

  const series = useMemo(
    () => [...records].sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0)),
    [records],
  );
  // Windows end on the latest reading rather than the wall clock, so a gap in
  // syncing shows the last stretch of data instead of an empty chart.
  const latestDate = series.length > 0 ? series[series.length - 1].recordedAt.slice(0, 10) : null;
  const days = rangeDays(range);
  const windowed = useMemo(() => (latestDate ? inWindow(series, latestDate, days) : []), [series, latestDate, days]);
  const usual = useMemo(() => (latestDate ? usualRange(series, latestDate) : null), [series, latestDate]);
  const stats = useMemo(() => computeStats(windowed), [windowed]);
  const sentences = useMemo(() => (stats ? buildDetailSentences(metricType, windowed, stats) : []), [metricType, windowed, stats]);
  const recent = useMemo(() => [...windowed].reverse(), [windowed]);

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: config.label });
  }, [navigation, config.label]);

  // Sleep has its own page (spec §5.1 #16); HRV, resting HR and steps keep this screen.
  useEffect(() => {
    if (metricType === 'SLEEP') navigation.replace('Sleep');
  }, [navigation, metricType]);
  if (metricType === 'SLEEP') return null;

  if (!stats) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-center text-muted-foreground">No {config.label.toLowerCase()} data yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const shown = scrubbed !== null ? windowed[scrubbed] : null;
  const headlineValue = shown ? shown.value : stats.latest;
  const context = usual
    ? rangeSentence(headlineValue, usual, config.format)
    : rangePendingText(inWindow(series, latestDate!, 30).length);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlatList
        data={recent}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View className="gap-5 pb-2">
            <View className="gap-1.5">
              <SectionLabel style={{ color }}>{shown ? readingDate(shown) : 'Latest'}</SectionLabel>
              {shown ? (
                <Text className="text-number">
                  {config.format(shown.value)}
                </Text>
              ) : (
                <CountUp
                  value={stats.latest}
                  format={config.format}
                  className="text-number"
                />
              )}
              <Text testID="metric-range-context" className="text-body text-muted-foreground">
                {context}
              </Text>
            </View>

            <SegmentedControl testID="metric-detail-range" options={RANGE_OPTIONS} value={range} onChange={setRange} />

            <Card className="px-3 py-4">
              <RangeChart
                testID="metric-range-chart"
                points={windowed}
                range={usual}
                color={color}
                format={config.format}
                height={200}
                onSelect={setScrubbed}
                accessibilityLabel={`${config.label} over ${days} days. ${context}.`}
              />
            </Card>

            <View className="flex-row rounded-card border border-border bg-card">
              {[
                { label: 'Low', value: stats.min },
                { label: 'Average', value: stats.average },
                { label: 'High', value: stats.max },
              ].map((cell, i) => (
                <View key={cell.label} className={`flex-1 gap-1 px-4 py-3.5 ${i > 0 ? 'border-l border-border' : ''}`}>
                  <Text className="text-caption text-muted-foreground">{cell.label}</Text>
                  <Text className="text-headline tabular-nums" numberOfLines={1} adjustsFontSizeToFit>
                    {config.format(cell.value)}
                  </Text>
                </View>
              ))}
            </View>

            {sentences.length > 0 ? (
              <Card className="gap-2">
                <SectionLabel>Insights</SectionLabel>
                {sentences.map((sentence, i) => (
                  <Text key={i} className={i === 0 ? 'text-heading' : 'text-caption text-muted-foreground'}>
                    {sentence}
                  </Text>
                ))}
              </Card>
            ) : null}

            <SectionLabel className="pt-1">Readings</SectionLabel>
          </View>
        }
        renderItem={({ item, index }) => (
          <View
            className={`flex-row items-center justify-between bg-card px-4 py-3.5 ${index === 0 ? 'rounded-t-card' : 'border-t border-border'} ${
              index === recent.length - 1 ? 'rounded-b-card' : ''
            }`}
          >
            <Text className="text-muted-foreground">{readingDate(item)}</Text>
            <Text className="font-semibold tabular-nums">
              {config.format(item.value)}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 20, paddingTop: 12 },
});
