import type { BaselineSnapshot, DailyScore } from '@prisma/client';
import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { BASELINE_METRICS, type ScoreType } from './dto';

/** One day's score row, its baseline snapshots and the last earlier day with a score. Shared by /me/scores/:date and /me/recovery. */
export async function loadScoreDetail(userId: string, date: string, type: ScoreType): Promise<{
  row: DailyScore | null;
  snapshots: BaselineSnapshot[];
  previous: { date: string; score: number } | null;
}> {
  const day = civilDateToUtcMidnight(date);
  const [row, snapshots, prev] = await Promise.all([
    prisma.dailyScore.findUnique({ where: { userId_date_type: { userId, date: day, type } } }),
    prisma.baselineSnapshot.findMany({ where: { userId, date: day, metric: { in: BASELINE_METRICS } } }),
    // The last day with an actual score (a cold-start day has none), so the client can show "+4 vs yesterday".
    prisma.dailyScore.findFirst({ where: { userId, type, date: { lt: day }, score: { not: null } }, orderBy: { date: 'desc' } }),
  ]);
  return {
    row,
    snapshots,
    previous: prev && prev.score !== null ? { date: prev.date.toISOString().slice(0, 10), score: Math.round(prev.score * 10) / 10 } : null,
  };
}
