// GET /me/recovery/:date in one round of reads (spec §4.2, minus decision 6's factor detail).
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { getSleepNight } from '../biometrics/sleepNight';
import { prisma } from '../db/client';
import { buildForecast } from '../forecast/engine';
import { loadForecastData } from '../forecast/load';
import { getLiveConfig, SCORE_CONFIGS, type ScoreConfig } from '../scoring/configs';
import { isCivilDate, shiftDate } from '../scoring/dates';
import { loadScoreDetail } from '../scoring/detail';
import { toBaselineDTOs, toDailyScoreDTO } from '../scoring/dto';
import { nightlyDeficits } from '../scoring/features';
import { getSleepGoalMinutes } from '../users/goals';
import type { RecoveryCalendarDTO, RecoveryDayDTO, RecoveryPageDTO, RecoveryTomorrowDTO, SleepDebtDTO } from './dto';
import { buildMonth, buildOutlook } from './month';
import { nightsToClear, usualDebtRange } from './sleepDebt';
import { computeStreak } from './streak';
import { tomorrowFrom } from './tomorrow';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const round1 = (n: number) => Math.round(n * 10) / 10;

function endOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

async function userToday(userId: string, now: Date): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  // OrUtc: a stored zone that no longer resolves falls back to UTC instead of throwing (as the social module does).
  return localCivilDateOrUtc(now, user?.timezone ?? 'UTC');
}

async function history(userId: string, through: string): Promise<RecoveryDayDTO[]> {
  const rows = await prisma.dailyScore.findMany({
    where: { userId, type: 'RECOVERY', date: { lte: civilDateToUtcMidnight(through) } },
    select: { date: true, score: true },
    orderBy: { date: 'asc' },
  });
  return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), score: r.score === null ? null : round1(r.score) }));
}

// `cfg` is the row's config (live when there is no row), the same one the goal and weights come from.
async function sleepDebtFor(userId: string, date: string, cfg: ScoreConfig, goalFromRow: number | undefined, snap: { ewma: number | null; spread: number | null; mad: number | null; daysOfHistory: number; algorithmVersion: string } | undefined): Promise<SleepDebtDTO | null> {
  const window = cfg.sleepDebtWindowDays;
  const [features, nights, goalNow] = await Promise.all([
    prisma.userDailyFeatures.findUnique({ where: { userId_date: { userId, date: civilDateToUtcMidnight(date) } }, select: { sleepDebtRolling14d: true } }),
    prisma.biometricRecord.findMany({
      where: { userId, metricType: 'SLEEP', recordedAt: { gte: civilDateToUtcMidnight(shiftDate(date, -(window - 1))), lte: civilDateToUtcMidnight(date) } },
      select: { recordedAt: true, value: true },
    }),
    getSleepGoalMinutes(userId),
  ]);
  if (!features || features.sleepDebtRolling14d === null) return null;
  // No SLEEP records in the window: the stored 0 means "no data", not "no debt" (the tile says so).
  if (nights.length === 0) return null;
  const goal = goalFromRow ?? goalNow;
  const usual = snap ? usualDebtRange(snap) : null;
  // The same per-night rule the stored sleepDebtRolling14d sums (scoring/features.ts).
  const sleep = nights.map((n) => ({ date: n.recordedAt.toISOString().slice(0, 10), value: n.value }));
  const deficits = nightlyDeficits(sleep, date, goal, cfg);
  const minutes = Math.round(features.sleepDebtRolling14d);
  // Within the usual by the same rounded comparison the tile's fill makes, so the copy and colour agree
  // (also when the nights were re-synced, or the goal changed, after the stored debt was computed).
  const clear = (high: number) => (minutes <= Math.round(high) ? 0 : Math.max(1, nightsToClear(deficits, high)));
  return {
    minutes,
    windowNights: window,
    goalMinutes: goal,
    usualLowMinutes: usual ? Math.round(usual.low) : null,
    usualHighMinutes: usual ? Math.round(usual.high) : null,
    nightsToClear: usual ? clear(usual.high) : null,
  };
}

async function tomorrowFor(userId: string, now: Date): Promise<RecoveryTomorrowDTO> {
  try {
    return tomorrowFrom(buildForecast(await loadForecastData(userId, now)));
  } catch (err) {
    console.error(JSON.stringify({ event: 'recovery_error', route: 'tomorrow', error: (err as Error)?.constructor?.name ?? 'Error' }));
    return { status: 'UNAVAILABLE' };
  }
}

export async function buildRecoveryPage(userId: string, dateParam: string, now = new Date()): Promise<RecoveryPageDTO | { error: 'bad_date' | 'future_date' }> {
  const today = await userToday(userId, now);
  const date = dateParam === 'today' ? today : dateParam;
  if (!isCivilDate(date)) return { error: 'bad_date' };
  if (date > today) return { error: 'future_date' };
  const isToday = date === today;
  const month = date.slice(0, 7);

  const detail = await loadScoreDetail(userId, date, 'RECOVERY');
  const { row, snapshots, previous } = detail;
  const stored = (row?.factors ?? []) as Array<{ factor: string; goalMinutes?: number }>;
  const debtGoal = stored.find((f) => f.factor === 'SLEEP_DEBT')?.goalMinutes;
  const debtSnap = snapshots.find((s) => s.metric === 'SLEEP_DEBT');
  const cfg = (row && SCORE_CONFIGS[row.algorithmVersion]) || getLiveConfig();

  // history() reads every RECOVERY row up to the end of D's month (best streak needs all of it). A few hundred
  // rows per year; a known cost, recorded in the ledger.
  const [rows, sleepDebt, night, tomorrow] = await Promise.all([
    history(userId, endOfMonth(month)),
    sleepDebtFor(userId, date, cfg, debtGoal, debtSnap),
    getSleepNight(userId, date),
    isToday ? tomorrowFor(userId, now) : Promise.resolve(null),
  ]);

  const bands = getLiveConfig().scoreBands;
  const upto = rows.filter((r) => r.date <= date);
  return {
    date,
    today,
    isToday,
    state: !row ? 'NO_DATA' : row.score === null ? 'BUILDING' : 'READY',
    bands,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    score: row ? toDailyScoreDTO(row, snapshots) : null,
    previous,
    baselines: row ? toBaselineDTOs(snapshots, 'RECOVERY') : [],
    weights: { HRV: cfg.weights.HRV, RHR: cfg.weights.RHR, SLEEP_DEBT: cfg.weights.SLEEP_DEBT },
    outlook: buildOutlook(upto, date),
    sleepDebt,
    lastNight: night
      ? {
          date: night.date,
          minutesAsleep: night.minutesAsleep,
          stages: night.hasStages && night.stageTotals
            ? { deep: night.stageTotals.deep.minutes, rem: night.stageTotals.rem.minutes, light: night.stageTotals.light.minutes, awake: night.stageTotals.awake.minutes }
            : null,
        }
      : null,
    streak: computeStreak(upto, date, bands.good, isToday),
    month: buildMonth(rows, month, bands),
    // The earliest scored date in all history (it may fall after a past D); the client uses it only to bound calendar paging.
    firstScoredDate: rows.find((r) => r.score !== null)?.date ?? null,
    tomorrow,
  };
}

export async function buildRecoveryCalendar(userId: string, month: string, now = new Date()): Promise<RecoveryCalendarDTO | { error: 'bad_month' | 'future_month' }> {
  if (!MONTH.test(month)) return { error: 'bad_month' };
  const today = await userToday(userId, now);
  if (month > today.slice(0, 7)) return { error: 'future_month' };
  const bands = getLiveConfig().scoreBands;
  return { month: buildMonth(await history(userId, endOfMonth(month)), month, bands), bands };
}
