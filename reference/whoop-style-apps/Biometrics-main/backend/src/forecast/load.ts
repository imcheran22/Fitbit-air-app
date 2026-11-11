// The forecast's only DB access: gathers one user's inputs into ForecastData.
import { civilDateToUtcMidnight, localCivilDate } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { loadAnalysisInput, loadFactorSeries } from '../habits/analysis';
import { ANALYSIS_WINDOW_DAYS } from '../habits/config';
import { habitDayFor } from '../habits/habitDay';
import { listHabitTypes } from '../habits/habitTypes';
import { getLiveConfig } from '../scoring/configs';
import { shiftDate } from '../scoring/dates';
import { resolveSleepGoalMinutes } from '../users/goals';
import type { ForecastData, ForecastFactor } from './types';

const civil = (d: Date) => d.toISOString().slice(0, 10);

export async function loadForecastData(userId: string, now: Date): Promise<ForecastData> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true, sleepGoalMinutes: true },
  });
  const tz = user.timezone ?? 'UTC';
  const today = localCivilDate(now, tz);
  const cfg = getLiveConfig();
  // Enough history for the 14-night debt window plus its baseline, over the whole analysis window.
  const from = shiftDate(today, -(ANALYSIS_WINDOW_DAYS + cfg.historyDays + cfg.sleepDebtWindowDays));

  const [sleepRows, factorSeries, scoreRows, habitTypes, analysis, confirmedRows] = await Promise.all([
    prisma.biometricRecord.findMany({
      where: { userId, metricType: 'SLEEP', recordedAt: { gte: civilDateToUtcMidnight(from), lte: civilDateToUtcMidnight(today) } },
      orderBy: { recordedAt: 'asc' },
    }),
    loadFactorSeries(userId, shiftDate(today, -ANALYSIS_WINDOW_DAYS), today),
    prisma.dailyScore.findMany({
      where: { userId, type: 'RECOVERY', algorithmVersion: cfg.version, date: { gte: civilDateToUtcMidnight(from), lte: civilDateToUtcMidnight(today) } },
    }),
    listHabitTypes(userId),
    loadAnalysisInput(userId, now),
    prisma.habitCorrelation.findMany({
      where: { userId, status: 'CONFIRMED', lagDays: 1, factor: { in: ['HRV', 'RHR'] } },
      select: { habitType: true, factor: true },
    }),
  ]);

  const habitDay = habitDayFor(now, tz);
  const todayLogs = await prisma.habitLog.findMany({
    where: { userId, habitDay: civilDateToUtcMidnight(habitDay) },
    select: { habitType: true, value: true },
  });
  const todayHabitTotals: Record<string, number> = {};
  for (const log of todayLogs) todayHabitTotals[log.habitType] = (todayHabitTotals[log.habitType] ?? 0) + log.value;

  const empty = new Map();
  return {
    today,
    cfg,
    sleepGoalMinutes: resolveSleepGoalMinutes(user.sleepGoalMinutes),
    sleep: sleepRows.map((r) => ({ date: civil(r.recordedAt), value: r.value })),
    factors: { HRV: factorSeries.HRV ?? empty, RHR: factorSeries.RHR ?? empty },
    scores: new Map(scoreRows.map((s) => [civil(s.date), { score: s.score, confidence: s.confidenceLevel }])),
    habitTypes,
    observations: new Map(analysis.input.habits.map((h) => [h.habitType, h.observations])),
    confirmed: confirmedRows.map((r) => ({ habitType: r.habitType, factor: r.factor as ForecastFactor })),
    todayHabitTotals,
  };
}
