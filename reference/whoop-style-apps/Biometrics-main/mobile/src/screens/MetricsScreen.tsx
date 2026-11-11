import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../api/client';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { PressableScale } from '../components/ui/pressable-scale';
import { Reveal } from '../components/ui/reveal';
import { SegmentedControl } from '../components/ui/segmented-control';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { RangeChart } from '../components/ui/range-chart';
import { SectionLabel } from '../components/ui/section-label';
import { PageTitle } from '../components/ui/page-title';
import { openSleep } from '../navigation/sleepNavigation';
import { rangeSentence, usualRange } from '../lib/usualRange';
import { todayCivil } from '../lib/heatmap';
import type { MetricRecord } from '../lib/metricInsights';
import { TREND_RANGES, changeText, rangeDays, seriesFor, trendSummary, type TrendRange } from '../lib/metricTrends';
import { useTabBarClearance } from '../navigation/tabBarLayout';
import { useSync } from '../sync/SyncProvider';
import { COLORS, METRIC_CONFIG, METRIC_ORDER, type MetricType } from '../theme';

const RANGE_OPTIONS = TREND_RANGES.map(({ value, label }) => ({ value, label }));

export function MetricsScreen() {
  const navigation = useNavigation<any>();
  const clearance = useTabBarClearance();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'light' ? 'light' : 'dark';
  const colors = COLORS[scheme];
  const [records, setRecords] = useState<MetricRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<TrendRange>('30d');
  const [today, setToday] = useState(() => todayCivil());
  const requestId = useRef(0);
  // Bumped after each successful sync with Google Health, so the data reloads.
  const { dataVersion, syncNow } = useSync();

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const data = await apiFetch<MetricRecord[]>('/me/biometrics');
      if (id !== requestId.current) return;
      setRecords(data ?? []);
      setFailed(false);
      setToday(todayCivil());
    } catch {
      if (id !== requestId.current) return;
      // Keep showing what was loaded before; only an empty screen shows the error.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      requestId.current++;
    };
  }, [load, dataVersion]);

  async function onRefresh() {
    setRefreshing(true);
    // Pull from Google Health first, then read what it brought in.
    await syncNow('pull');
    await load();
    setRefreshing(false);
  }

  const days = rangeDays(range);
  const summaries = useMemo(
    () =>
      METRIC_ORDER.map((type) => {
        const series = seriesFor(records ?? [], type);
        return { type, series, summary: trendSummary(series, today, days), usual: usualRange(series, today) };
      }),
    [records, today, days],
  );

  function openDetail(type: MetricType, series: MetricRecord[]) {
    if (type === 'SLEEP') openSleep(navigation);
    else navigation.navigate('MetricDetail', { metricType: type, records: series, range });
  }
  let body: React.ReactNode;
  if (records === null && !failed) {
    body = (
      <View testID="metrics-loading" className="gap-3">
        {METRIC_ORDER.map((type) => (
          <Skeleton key={type} className="h-36 w-full" />
        ))}
      </View>
    );
  } else if (records === null) {
    body = (
      <View testID="metrics-error" className="items-center gap-3 py-12">
        <Text className="text-center text-muted-foreground">Your metrics could not be loaded.</Text>
        <Button testID="metrics-retry" variant="secondary" onPress={() => load()}>
          Try again
        </Button>
      </View>
    );
  } else if (records.length === 0) {
    body = (
      <Card testID="metrics-empty">
        <Text className="text-caption text-muted-foreground">Trends appear here once your Google Health data has synced.</Text>
      </Card>
    );
  } else {
    body = summaries.map(({ type, series, summary, usual }, index) => {
      const config = METRIC_CONFIG[type];
      const color = config.color[scheme];
      return (
        <Reveal key={type} index={index}>
          <PressableScale
            testID={`trend-card-${type}`}
            accessibilityRole="button"
            accessibilityLabel={`${config.label} trend`}
            disabled={!summary}
            onPress={() => summary && openDetail(type, series)}
          >
            <Card className="gap-3">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <View className="flex-row items-center gap-1.5">
                    <Ionicons name={config.icon as any} size={14} color={color} />
                    <Text className="text-caption font-medium" style={{ color }}>
                      {config.label}
                    </Text>
                  </View>
                  {summary ? (
                    <Text testID={`trend-latest-${type}`} className="text-display tabular-nums">
                      {config.format(summary.latest)}
                    </Text>
                  ) : null}
                </View>
                {summary ? <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginTop: 2 }} /> : null}
              </View>

              {summary ? (
                <>
                  {usual ? (
                    <Text testID={`trend-position-${type}`} className="text-caption text-muted-foreground">
                      {rangeSentence(summary.latest, usual, config.format)}
                    </Text>
                  ) : null}
                  {summary.points.length >= 2 ? (
                    <RangeChart compact points={summary.points} range={usual} color={color} format={config.format} height={72} />
                  ) : (
                    <Text className="py-6 text-center text-caption text-muted-foreground">One reading in this range so far</Text>
                  )}
                  <View className="flex-row justify-between gap-3">
                    <Text testID={`trend-average-${type}`} className="text-caption text-muted-foreground">
                      {`Avg ${config.format(summary.average)}`}
                    </Text>
                    <Text testID={`trend-change-${type}`} className="flex-1 text-right text-caption text-muted-foreground">
                      {changeText(summary.changePercent, days)}
                    </Text>
                  </View>
                </>
              ) : (
                <Text testID={`trend-empty-${type}`} className="text-caption text-muted-foreground">
                  {`No ${config.label.toLowerCase()} readings in the last ${days} days.`}
                </Text>
              )}
            </Card>
          </PressableScale>
        </Reveal>
      );
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: clearance }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} />}
      >
        <View className="gap-1">
          <SectionLabel>Against your usual range</SectionLabel>
          <PageTitle>Trends</PageTitle>
        </View>

        <SegmentedControl testID="metrics-range" options={RANGE_OPTIONS} value={range} onChange={setRange} />

        <PressableScale testID="patterns-button" accessibilityRole="button" onPress={() => navigation.navigate('Patterns')}>
          <Card className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-tile bg-accent/15">
              <Ionicons name="git-compare-outline" size={18} color={colors.accent} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-body font-semibold">Patterns</Text>
              <Text className="text-caption text-muted-foreground">How your habits line up with your recovery</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Card>
        </PressableScale>

        {body}
      </ScrollView>
    </SafeAreaView>
  );
}
