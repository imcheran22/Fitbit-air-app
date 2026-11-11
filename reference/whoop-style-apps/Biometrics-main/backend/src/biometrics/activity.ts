import { prisma } from '../db/client';
import { getLiveConfig } from '../scoring/configs';
import type { ScoreBands } from '../scoring/configs/v1';
import { civilDateToUtcMidnight, localCivilDateOrUtc, localClockTime, sessionEndCivilDate } from './civilDate';
import { isDaytimeNap, pickMainSession } from './mainSession';

// The heat map's widest view is a trailing year drawn as whole week columns
// (up to 371 days); 400 leaves room for that without making this an unbounded
// history dump like GET /me/biometrics.
export const MAX_ACTIVITY_RANGE_DAYS = 400;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A real calendar date, not just the right shape: "2026-02-30" parses to
// March 2nd, so the round trip is what rejects it.
export function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const d = civilDateToUtcMidnight(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export type ActivityRange = { from: string; to: string };

/** The validated inclusive [from, to] range, or the reason it is not one. */
export function parseActivityRange(from: unknown, to: unknown): ActivityRange | { error: string } {
  if (!isCivilDate(from) || !isCivilDate(to)) return { error: 'from and to must be YYYY-MM-DD dates' };
  if (from > to) return { error: 'from must not be after to' };
  const days = (civilDateToUtcMidnight(to).getTime() - civilDateToUtcMidnight(from).getTime()) / DAY_MS + 1;
  if (days > MAX_ACTIVITY_RANGE_DAYS) return { error: `range must not exceed ${MAX_ACTIVITY_RANGE_DAYS} days` };
  return { from, to };
}

export interface ActivityDTO {
  days: { date: string; steps: number }[];
  // The user's oldest STEPS record, so the client can tell "history not
  // synced yet" apart from "no activity on those days".
  earliestDate: string | null;
}

/**
 * Daily steps for an inclusive civil-date range. STEPS records are already
 * keyed at UTC midnight of their civil date (dailyRollUp's civilStartTime), so
 * the date is read straight off recordedAt with no timezone conversion.
 */
export async function getActivityForUser(userId: string, range: ActivityRange): Promise<ActivityDTO> {
  const gte = civilDateToUtcMidnight(range.from);
  const lt = new Date(civilDateToUtcMidnight(range.to).getTime() + DAY_MS);

  const [records, earliest] = await Promise.all([
    prisma.biometricRecord.findMany({
      where: { userId, metricType: 'STEPS', recordedAt: { gte, lt } },
      select: { recordedAt: true, value: true },
      orderBy: { recordedAt: 'asc' },
    }),
    prisma.biometricRecord.findFirst({
      where: { userId, metricType: 'STEPS' },
      select: { recordedAt: true },
      orderBy: { recordedAt: 'asc' },
    }),
  ]);

  return {
    days: records.map((r) => ({ date: r.recordedAt.toISOString().slice(0, 10), steps: r.value })),
    earliestDate: earliest ? earliest.recordedAt.toISOString().slice(0, 10) : null,
  };
}

export interface SleepNightDTO {
  /** The local civil date the night ENDED on: the SLEEP rollup's key. */
  date: string;
  /** Total minutes asleep across that date's sessions (the rollup scores read). */
  minutesAsleep: number;
  /** Total minutes from start to end across that date's sessions. */
  minutesInBed: number | null;
  /**
   * Local "HH:MM" start and end of the night's main session (most minutes asleep, earliest
   * start on a tie), so a nap never sets the bedtime.
   */
  bedtime: string | null;
  wakeTime: string | null;
  /** That day's Sleep Score, once one has been computed. */
  sleepScore: number | null;
  /** The main session's minutes awake, when its source reported a summary. */
  minutesAwake: number | null;
  /** The main session's minutes in each stage; null when it has no stage summary at all. */
  stageMinutes: { deep: number; light: number; rem: number; awake: number } | null;
  /** Whether the main session has a DEEP, LIGHT or REM stage: AWAKE alone is not stages. */
  hasStages: boolean;
  /** The main session's minutes asleep (the page's one night duration); null with a rollup but no sessions. */
  mainMinutesAsleep: number | null;
  /** The main session is a daytime nap (isDaytimeNap): the date has no night. */
  mainIsNap: boolean;
}

export interface SleepActivityDTO {
  nights: SleepNightDTO[];
  // The user's oldest SLEEP rollup, so the client can tell "history not
  // synced yet" apart from "no sleep recorded on those nights".
  earliestDate: string | null;
  // True while a connected account's older nights still wait for their
  // one-off stage backfill, so the client can say stages are on the way.
  stagesBackfillPending: boolean;
  // The live score bands, so the client colours sleepScore the way the score routes do.
  bands: ScoreBands;
  // The user's local civil date, so the client's "today" follows the server, not the device clock.
  today: string;
}

type SessionTimes = { startTime: Date; endTime: Date; minutesAsleep: number; startUtcOffsetSeconds: number | null; endUtcOffsetSeconds: number | null };

const minutesBetween = (s: SessionTimes) => (s.endTime.getTime() - s.startTime.getTime()) / 60000;

/**
 * Nightly sleep for an inclusive civil-date range: the Sleep page, the
 * Activity Sleep calendar and Home. Minutes asleep come from the SLEEP
 * rollup, so they always match what the Sleep Score saw; the times come from
 * the sessions behind it, bucketed onto dates exactly as the rollup is.
 */
export async function getSleepForUser(userId: string, range: ActivityRange, now: Date = new Date()): Promise<SleepActivityDTO> {
  const gte = civilDateToUtcMidnight(range.from);
  const lt = new Date(civilDateToUtcMidnight(range.to).getTime() + DAY_MS);

  const [user, records, earliest, scores, sessions, conn] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.biometricRecord.findMany({
      where: { userId, metricType: 'SLEEP', recordedAt: { gte, lt } },
      select: { recordedAt: true, value: true },
      orderBy: { recordedAt: 'asc' },
    }),
    prisma.biometricRecord.findFirst({
      where: { userId, metricType: 'SLEEP' },
      select: { recordedAt: true },
      orderBy: { recordedAt: 'asc' },
    }),
    prisma.dailyScore.findMany({
      where: { userId, type: 'SLEEP', date: { gte, lt } },
      select: { date: true, score: true },
    }),
    // A local date spans at most [D - 14h, D + 1d + 12h) in UTC, so a day of
    // margin each side holds every session ending on a date in the range.
    prisma.sleepSession.findMany({
      where: { userId, endTime: { gte: new Date(gte.getTime() - DAY_MS), lt: new Date(lt.getTime() + DAY_MS) } },
      select: {
        startTime: true, endTime: true, startUtcOffsetSeconds: true, endUtcOffsetSeconds: true, minutesAsleep: true,
        minutesAwake: true, deepMinutes: true, lightMinutes: true, remMinutes: true, awakeMinutes: true,
        stages: { where: { type: { in: ['DEEP', 'LIGHT', 'REM'] } }, select: { id: true }, take: 1 },
      },
    }),
    prisma.healthConnection.findUnique({ where: { userId }, select: { status: true, sleepStagesBackfilledAt: true } }),
  ]);
  const timeZone = user?.timezone ?? 'UTC';

  const sessionsByDate = new Map<string, (typeof sessions)[number][]>();
  for (const s of sessions) {
    const date = sessionEndCivilDate(s, timeZone);
    sessionsByDate.set(date, [...(sessionsByDate.get(date) ?? []), s]);
  }
  const scoreByDate = new Map(scores.map((s) => [s.date.toISOString().slice(0, 10), s.score]));

  return {
    nights: records.map((r) => {
      const date = r.recordedAt.toISOString().slice(0, 10);
      const own = sessionsByDate.get(date) ?? [];
      const main = pickMainSession(own);
      const score = scoreByDate.get(date);
      return {
        date,
        minutesAsleep: r.value,
        minutesInBed: own.length > 0 ? Math.round(own.reduce((sum, s) => sum + minutesBetween(s), 0)) : null,
        bedtime: main ? localClockTime(main.startTime, main.startUtcOffsetSeconds, timeZone) : null,
        wakeTime: main ? localClockTime(main.endTime, main.endUtcOffsetSeconds, timeZone) : null,
        sleepScore: score == null ? null : Math.round(score),
        minutesAwake: main?.minutesAwake ?? null,
        stageMinutes: main && [main.deepMinutes, main.lightMinutes, main.remMinutes, main.awakeMinutes].some((v) => v != null)
          ? { deep: main.deepMinutes ?? 0, light: main.lightMinutes ?? 0, rem: main.remMinutes ?? 0, awake: main.awakeMinutes ?? 0 }
          : null,
        hasStages: (main?.stages.length ?? 0) > 0,
        mainMinutesAsleep: main ? main.minutesAsleep : null,
        mainIsNap: main ? isDaytimeNap(main, timeZone) : false,
      };
    }),
    earliestDate: earliest ? earliest.recordedAt.toISOString().slice(0, 10) : null,
    stagesBackfillPending: conn?.status === 'CONNECTED' && conn.sleepStagesBackfilledAt === null,
    bands: getLiveConfig().scoreBands,
    today: localCivilDateOrUtc(now, timeZone),
  };
}
