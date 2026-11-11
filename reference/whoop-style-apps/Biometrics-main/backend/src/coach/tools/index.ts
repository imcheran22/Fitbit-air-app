// Read-only data access the fact sheet (answer/facts.ts) is built from: the
// user's scores, confirmed habit patterns and goals, with every aggregate
// computed here so values and rounding match what the app shows. Raw daily
// readings live in metrics.ts and the daily score in dailyScore.ts. Nothing
// here writes, takes SQL, or composes a sentence.

import { civilDateToUtcMidnight } from '../../biometrics/civilDate';
import { prisma } from '../../db/client';
import { getConfirmedCorrelations } from '../../habits/correlations';
import { listHabitTypes } from '../../habits/habitTypes';
import { shiftDate } from '../../scoring/dates';
import { getSleepGoalMinutes } from '../../users/goals';

export type { DailyScoreToolResult } from './dailyScore';

type HistoryMetric = 'RECOVERY' | 'SLEEP';

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function getScoreHistory(userId: string, metric: HistoryMetric, days: number, today: string) {
  const rows = await prisma.dailyScore.findMany({
    where: {
      userId,
      type: metric,
      score: { not: null },
      date: { gte: civilDateToUtcMidnight(shiftDate(today, -(days - 1))), lte: civilDateToUtcMidnight(today) },
    },
    orderBy: { date: 'asc' },
  });
  const points = rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), score: round1(r.score as number) }));
  const scores = points.map((p) => p.score);
  return {
    metric,
    days,
    points,
    average: scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    highest: scores.length ? Math.max(...scores) : null,
    lowest: scores.length ? Math.min(...scores) : null,
  };
}

export async function getHabitCorrelations(userId: string) {
  const [confirmed, types] = await Promise.all([getConfirmedCorrelations(userId), listHabitTypes(userId)]);
  const labelOf = new Map(types.map((t) => [t.type, t.label]));
  return {
    correlations: confirmed.map((c) => ({
      habitType: c.habitType,
      habitLabel: labelOf.get(c.habitType) ?? c.habitType,
      exposureThreshold: c.exposureThreshold,
      exposureUnit: c.exposureUnit,
      factor: c.factor,
      lagDays: c.lagDays,
      effectSizePercent: c.effectSizePercent,
      comparisonPercent: c.comparisonPercent,
      sampleSize: c.sampleSize,
      direction: c.direction,
    })),
  };
}

export async function getUserGoals(userId: string) {
  const sleepGoalMinutes = await getSleepGoalMinutes(userId);
  return { sleepGoalMinutes, sleepGoalHours: round1(sleepGoalMinutes / 60) };
}
