// Activity (spec 2026-10-13 §1): the header, This week, the month calendar, its stats beside "2026 so far", then
// "Against your usual". Steps carry the page; sleep, Recovery and the metrics each fail on their own.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { fetchActivity } from '../api/activity';
import { apiFetch } from '../api/client';
import { fetchScoresWithBands, type DailyScoreDTO } from '../api/scores';
import { fetchSleep, fetchSleepGoal } from '../api/sleep';
import { ActivityHeatmap, type RecoveryCalendarState, type SleepState } from '../components/activity-heatmap';
import { ActivityHeader } from '../components/activity/ActivityHeader';
import { ThisWeek } from '../components/activity/ThisWeek';
import { UsualTiles } from '../components/activity/UsualTiles';
import { YearSoFar, type YearRecovery, type YearSleep } from '../components/activity/YearSoFar';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { ACTIVITY_COPY, type CalendarTab } from '../lib/activityCopy';
import { weekRows, weekSummary } from '../lib/activityWeek';
import { addDays, daysBetween, fetchRange, todayCivil, type ValuesByDate } from '../lib/heatmap';
import type { MetricRecord } from '../lib/metricInsights';
import { DEFAULT_SCORE_BANDS } from '../lib/scoreInsights';
import { DEFAULT_SLEEP_GOAL_MINUTES, mainSleepByDate } from '../lib/sleepStats';
import { recoveryRecords, type TileRecord } from '../lib/usualTiles';
import { useSync } from '../sync/SyncProvider';
import { openNight } from '../navigation/sleepNavigation';
import { useTabBarClearance } from '../navigation/tabBarLayout';
import type { TabParamList } from '../navigation/TabsNavigator';
import { COLORS, METRIC_CONFIG } from '../theme';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | {
      phase: 'ready';
      steps: Map<string, number>;
      earliestDate: string | null;
      today: string;
      sleep: SleepState;
      sleepGoal: number;
      recovery: RecoveryCalendarState;
    };

// Recovery is read over the same range as steps (this year for "2026 so far", a year back for the calendar);
// it also covers the usual rows' 30 days and the 30 before them.
function recoveryDays(today: string): number {
  return daysBetween(fetchRange(today).from, today) + 1;
}

function recoveryScores(scores: DailyScoreDTO[]): ValuesByDate {
  return new Map(scores.filter((s) => s.score !== null).map((s) => [s.date, s.score as number]));
}

export function ActivityScreen() {
  const navigation = useNavigation<any>();
  // A date handed in by the Sleep page's "Steps that day": opened once, then cleared.
  const openDate = useRoute<RouteProp<TabParamList, 'Activity'>>().params?.date ?? null;
  const clearance = useTabBarClearance();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  // The calendar's tab; "2026 so far" follows it.
  const [tab, setTab] = useState<CalendarTab>('steps');
  // The "against your usual" rows. Null until the metrics read lands; a failed
  // read keeps what is on screen (or no rows) and never makes the screen an error.
  const [records, setRecords] = useState<MetricRecord[] | null>(null);
  const [usualRecovery, setUsualRecovery] = useState<TileRecord[]>([]);
  // Only the latest request may land: a slow first load must not overwrite a
  // pull-to-refresh that finished after it.
  const requestId = useRef(0);
  // Bumped after each successful sync with Google Health, so the data reloads.
  const { dataVersion, syncNow } = useSync();

  const load = useCallback(async () => {
    const id = ++requestId.current;
    // One request covers every view and every month the month view can reach.
    const today = todayCivil();
    const { from, to } = fetchRange(today);
    // Sleep, Recovery and the metrics fail on their own; the sleep goal is waited for, so the sleep colours never
    // draw against 8h and then jump.
    const [stepsRes, sleepRes, goalRes, metricsRes, recoveryRes] = await Promise.allSettled([
      fetchActivity(from, to),
      fetchSleep(from, to),
      fetchSleepGoal(),
      apiFetch<MetricRecord[]>('/me/biometrics'),
      fetchScoresWithBands(recoveryDays(today), 'RECOVERY'),
    ]);
    if (id !== requestId.current) return;
    if (metricsRes.status === 'fulfilled') setRecords(metricsRes.value ?? []);
    if (recoveryRes.status === 'fulfilled') setUsualRecovery(recoveryRecords(recoveryRes.value.scores));
    if (stepsRes.status === 'rejected') {
      setState((prev) => (prev.phase === 'ready' ? prev : { phase: 'error' }));
      return;
    }
    const res = stepsRes.value;
    setState((prev) => {
      const kept = prev.phase === 'ready' ? prev : null;
      return {
        phase: 'ready',
        steps: new Map(res.days.map((d) => [d.date, d.steps])),
        earliestDate: res.earliestDate,
        today,
        // A failed refresh keeps the goal already in use.
        sleepGoal: goalRes.status === 'fulfilled' && goalRes.value?.sleepGoalMinutes > 0 ? goalRes.value.sleepGoalMinutes : (kept?.sleepGoal ?? DEFAULT_SLEEP_GOAL_MINUTES),
        // A failed refresh keeps the sleep and Recovery already on screen.
        sleep:
          sleepRes.status === 'fulfilled'
            ? { phase: 'ready', nights: new Map(sleepRes.value.nights.map((n) => [n.date, n])), earliestDate: sleepRes.value.earliestDate }
            : kept?.sleep.phase === 'ready'
              ? kept.sleep
              : { phase: 'error' },
        recovery:
          recoveryRes.status === 'fulfilled'
            ? {
                phase: 'ready',
                scores: recoveryScores(recoveryRes.value.scores),
                bands: recoveryRes.value.bands ?? DEFAULT_SCORE_BANDS,
                from: addDays(today, -(recoveryDays(today) - 1)),
              }
            : kept?.recovery.phase === 'ready'
              ? kept.recovery
              : { phase: 'error' },
      };
    });
  }, []);

  useEffect(() => {
    load();
    return () => {
      // Drop anything still in flight once the tab is gone.
      requestId.current++;
    };
  }, [load, dataVersion]);

  // Coming back (e.g. from the Bedtime goal screen) re-reads, so a new sleep
  // goal recolours the calendar. load keeps what is on screen until the new
  // data lands, so there is no flash; the first focus (opening) is skipped.
  const blurred = useRef(false);
  useEffect(() => {
    const offBlur = navigation.addListener?.('blur', () => {
      blurred.current = true;
    });
    const offFocus = navigation.addListener?.('focus', () => {
      if (!blurred.current) return;
      blurred.current = false;
      load();
    });
    return () => {
      offBlur?.();
      offFocus?.();
    };
  }, [navigation, load]);

  async function onRefresh() {
    setRefreshing(true);
    // Pull from Google Health first, then read what it brought in.
    await syncNow('pull');
    await load();
    setRefreshing(false);
  }

  const retry = (key: 'sleep' | 'recovery') => () => {
    setState((prev) => (prev.phase === 'ready' ? { ...prev, [key]: { phase: 'loading' } } : prev));
    load();
  };

  const ready = state.phase === 'ready' ? state : null;
  const nights = ready?.sleep.phase === 'ready' ? ready.sleep.nights : null;
  // Main sleep only, as on the calendar: nap-only dates are skipped.
  const sleepMinutes = useMemo<ValuesByDate | null>(
    () => (nights ? new Map([...mainSleepByDate(nights.values())].map(([date, n]) => [date, n.minutesAsleep] as const)) : null),
    [nights],
  );
  const recovery = ready?.recovery.phase === 'ready' ? ready.recovery : null;
  const rows = useMemo(
    () => (ready ? weekRows(ready.today, ready.steps, sleepMinutes, recovery?.scores ?? null, recovery?.bands ?? DEFAULT_SCORE_BANDS) : null),
    [ready, sleepMinutes, recovery],
  );
  const yearSleep: YearSleep = !ready ? { phase: 'loading' } : sleepMinutes ? { phase: 'ready', minutes: sleepMinutes } : ready.sleep.phase === 'error' ? { phase: 'error' } : { phase: 'loading' };
  const yearRecovery: YearRecovery = recovery ? { phase: 'ready', scores: recovery.scores, bands: recovery.bands } : ready?.recovery.phase === 'error' ? { phase: 'error' } : { phase: 'loading' };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingTop: 8, paddingBottom: clearance }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} />}
      >
        <ActivityHeader summary={rows ? weekSummary(rows) : null} />

        {state.phase === 'loading' ? (
          <View testID="activity-loading" className="gap-4">
            <Skeleton className="h-96 w-full rounded-card" />
            <Skeleton className="h-80 w-full rounded-card" />
            <Skeleton className="h-28 w-full rounded-card" />
          </View>
        ) : null}

        {state.phase === 'error' ? (
          <View testID="activity-error" className="items-center gap-3 py-12">
            <Text className="text-center text-muted-foreground">{ACTIVITY_COPY.error}</Text>
            <Button
              testID="activity-retry"
              variant="secondary"
              onPress={() => {
                setState({ phase: 'loading' });
                load();
              }}
            >
              {ACTIVITY_COPY.retry}
            </Button>
          </View>
        ) : null}

        {ready && rows ? (
          <>
            <ThisWeek
              rows={rows}
              onOpenDay={(date) => navigation.navigate('Recovery', { date })}
              onOpenNight={(date) => openNight(navigation, date)}
            />
            <ActivityHeatmap
              steps={ready.steps}
              earliestDate={ready.earliestDate}
              today={ready.today}
              sleep={ready.sleep}
              recovery={ready.recovery}
              sleepGoal={ready.sleepGoal}
              onOpenNight={(date) => openNight(navigation, date)}
              openDate={openDate}
              onOpenedDate={() => navigation.setParams({ date: undefined })}
              onOpenRecovery={(date) => navigation.navigate('Recovery', { date })}
              onRetrySleep={retry('sleep')}
              onRetryRecovery={retry('recovery')}
              tab={tab}
              onTab={setTab}
            />
            <YearSoFar
              metric={tab}
              steps={ready.steps}
              sleep={yearSleep}
              recovery={yearRecovery}
              today={ready.today}
              stepGoal={METRIC_CONFIG.STEPS.goal ?? 10000}
              sleepGoal={ready.sleepGoal}
              onRetrySleep={retry('sleep')}
              onRetryRecovery={retry('recovery')}
            />
            {records ? <UsualTiles records={records} recovery={usualRecovery} today={ready.today} /> : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
