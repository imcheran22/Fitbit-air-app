// "2026 so far" (A-2), full width under the month stats: the year's figures over its year grid, for whichever
// tab the calendar is on (steps, sleep or Recovery).

import React, { useMemo } from 'react';
import { View } from 'react-native';
import type { ScoreBandsDTO } from '../../api/scores';
import { ACTIVITY_COPY, compactSteps, type CalendarTab } from '../../lib/activityCopy';
import { recoveryStats, yearSoFar } from '../../lib/activityWeek';
import type { ValuesByDate } from '../../lib/heatmap';
import { formatDuration } from '../../lib/sleepStats';
import { METRIC_CONFIG } from '../../theme';
import { SectionError } from '../sleep/Section';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';
import { YearGrid } from './YearGrid';

const COPY = ACTIVITY_COPY.year;
const NONE = ACTIVITY_COPY.stats.none;

export type YearValues<T> = { phase: 'loading' } | { phase: 'error' } | ({ phase: 'ready' } & T);
export type YearSleep = YearValues<{ minutes: ValuesByDate }>;
export type YearRecovery = YearValues<{ scores: ValuesByDate; bands: ScoreBandsDTO }>;

function Figure({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View className="flex-1 gap-0.5">
      <Text className="text-caption text-muted-foreground">{label}</Text>
      <Text testID={testID} className="text-heading tabular-nums" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export function YearSoFar({ metric, steps, sleep, recovery, today, stepGoal, sleepGoal, onRetrySleep, onRetryRecovery }: {
  metric: CalendarTab;
  steps: ValuesByDate;
  sleep: YearSleep;
  recovery: YearRecovery;
  today: string;
  stepGoal: number;
  sleepGoal: number;
  onRetrySleep: () => void;
  onRetryRecovery: () => void;
}) {
  const year = today.slice(0, 4);
  const sleepMinutes = sleep.phase === 'ready' ? sleep.minutes : null;
  const rec = recovery.phase === 'ready' ? recovery : null;
  const stepYear = useMemo(() => yearSoFar(steps, today, stepGoal), [steps, today, stepGoal]);
  const sleepYear = useMemo(() => (sleepMinutes ? yearSoFar(sleepMinutes, today, sleepGoal) : null), [sleepMinutes, today, sleepGoal]);
  const recYear = useMemo(() => (rec ? recoveryStats(rec.scores, `${year}-01-01`, today, today, rec.bands) : null), [rec, year, today]);

  let body: React.ReactNode;
  if (metric === 'steps') {
    body = (
      <>
        <View className="flex-row gap-3">
          <Figure testID="year-total" label={COPY.total} value={compactSteps(stepYear.total)} />
          <Figure testID="year-average" label={COPY.average} value={stepYear.average === null ? NONE : METRIC_CONFIG.STEPS.format(stepYear.average)} />
          <Figure testID="year-goal" label={COPY.goalDays} value={String(stepYear.goalDays)} />
        </View>
        <YearGrid metric="steps" values={steps} today={today} goal={stepGoal} />
      </>
    );
  } else if (metric === 'sleep') {
    if (sleep.phase === 'error') body = <SectionError testID="year-sleep-retry" message={COPY.error} onRetry={onRetrySleep} />;
    else if (!sleepMinutes || !sleepYear) body = <Skeleton testID="year-loading" className="h-40 w-full rounded-tile" />;
    else
      body = (
        <>
          <View className="flex-row gap-3">
            <Figure testID="year-total" label={COPY.total} value={ACTIVITY_COPY.stats.hours(sleepYear.total)} />
            <Figure testID="year-average" label={ACTIVITY_COPY.stats.nightlyAverage} value={sleepYear.average === null ? NONE : formatDuration(sleepYear.average)} />
            <Figure testID="year-goal" label={COPY.goalNights} value={String(sleepYear.goalDays)} />
          </View>
          <YearGrid metric="sleep" values={sleepMinutes} today={today} goal={sleepGoal} />
        </>
      );
  } else if (recovery.phase === 'error') {
    body = <SectionError testID="year-recovery-retry" message={COPY.error} onRetry={onRetryRecovery} />;
  } else if (!rec || !recYear) {
    body = <Skeleton testID="year-loading" className="h-40 w-full rounded-tile" />;
  } else {
    body = (
      <>
        <View className="flex-row gap-3">
          <Figure testID="year-average" label={ACTIVITY_COPY.stats.recAverage} value={recYear.average === null ? NONE : String(Math.round(recYear.average))} />
          <Figure testID="year-best" label={ACTIVITY_COPY.stats.bestDay} value={recYear.best ? String(recYear.best.score) : NONE} />
          <Figure testID="year-scored" label={ACTIVITY_COPY.stats.scored} value={String(recYear.scored)} />
        </View>
        <YearGrid metric="recovery" values={rec.scores} today={today} goal={0} bands={rec.bands} />
      </>
    );
  }

  return (
    <Card testID="year-so-far" className="gap-3 p-3">
      <SectionLabel>{COPY.gridTitle(year, metric)}</SectionLabel>
      {body}
    </Card>
  );
}
