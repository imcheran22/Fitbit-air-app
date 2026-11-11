import { prisma } from '../db/client';
import { civilDateToUtcMidnight, localCivilDateOrUtc, sessionStartMinutesSinceLocalNoon } from './civilDate';
import { pickMainSession } from './mainSession';
import { groupSessionsByNight, populationStdDev, spreadToScore } from '../scoring/features';
import { getLiveConfig } from '../scoring/configs';
import { shiftDate } from '../scoring/dates';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;
const MINUTE_MS = 60_000;

export type RegularityDays = 7 | 30;

// Fewer nights than this and a spread is noise, so the score and both spreads are null.
const MIN_NIGHTS: Record<RegularityDays, number> = { 7: 4, 30: 15 };

export interface SleepRegularityDTO {
  days: number;
  /** Nights with a main session ending in the window. */
  nights: number;
  /** Mean of the bedtime and wake spread scores, 0..100; null below the minimum nights. */
  score: number | null;
  /** Population standard deviations in minutes; null below the minimum nights. */
  bedtimeSpreadMinutes: number | null;
  wakeSpreadMinutes: number | null;
  /** Local "HH:MM"; null with no nights. */
  averageBedtime: string | null;
  averageWake: string | null;
  /** One per night with data, by date: that night's bedtime minus the average. */
  drift: { date: string; bedtimeOffsetMinutes: number }[];
}

/** The ?days query value as a window, or null for anything but exactly "7" or "30". */
export function parseRegularityDays(value: unknown): RegularityDays | null {
  if (value === '7') return 7;
  if (value === '30') return 30;
  return null;
}

/** Noon-anchored minutes (a wake may exceed 1440) back to a local "HH:MM". */
function noonMinutesToClock(noonMinutes: number): string {
  const m = (Math.round(noonMinutes) + 12 * 60) % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Wake time on the same noon-anchored scale as its own bedtime, so it may run
 * past 1440: a 12:30 lie-in after a 23:00 bedtime is 1470, not 30 (which would
 * read as a 00:30 wake and blow up the spread). It is bedtime + the session's
 * length, plus the local-clock shift between start and end (DST or travel):
 * the end's own noon-anchored clock, lifted by whole days to the value nearest
 * that elapsed-time estimate. With both UTC offsets stored this equals
 * bedtime + length + (endOffset - startOffset) exactly; it also covers rows
 * that fall back to User.timezone.
 */
function wakeMinutes(
  main: { startTime: Date; endTime: Date; endUtcOffsetSeconds?: number | null },
  bedtime: number,
  timeZone: string,
): number {
  const elapsed = bedtime + (main.endTime.getTime() - main.startTime.getTime()) / MINUTE_MS;
  const clock = sessionStartMinutesSinceLocalNoon(
    { startTime: main.endTime, startUtcOffsetSeconds: main.endUtcOffsetSeconds ?? null },
    timeZone,
  );
  return clock + MINUTES_PER_DAY * Math.round((elapsed - clock) / MINUTES_PER_DAY);
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * How regular bedtime AND wake time are over the `days` nights ending today
 * (the user's local date, today included). A separate measure from the Sleep
 * score's Bedtime consistency factor, which is bedtime only over 14 nights,
 * but scored with the same spread maths and ceiling.
 *
 * Times are minutes since local noon, so an after-midnight bedtime is later
 * than 23:00, not 23 hours earlier.
 */
export async function getSleepRegularity(userId: string, days: RegularityDays): Promise<SleepRegularityDTO> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const timeZone = user?.timezone ?? 'UTC';
  const to = localCivilDateOrUtc(new Date(), timeZone);
  const from = shiftDate(to, -(days - 1));

  // A local date spans at most [D - 14h, D + 1d + 12h) in UTC, so a day of
  // margin each side holds every session ending in the window.
  const sessions = await prisma.sleepSession.findMany({
    where: {
      userId,
      endTime: {
        gte: new Date(civilDateToUtcMidnight(from).getTime() - DAY_MS),
        lt: new Date(civilDateToUtcMidnight(to).getTime() + 2 * DAY_MS),
      },
    },
    select: { startTime: true, endTime: true, minutesAsleep: true, startUtcOffsetSeconds: true, endUtcOffsetSeconds: true },
  });

  const nights: { date: string; bedtime: number; wake: number }[] = [];
  for (const [date, list] of groupSessionsByNight(sessions, timeZone)) {
    if (date < from || date > to) continue;
    const main = pickMainSession(list);
    if (!main) continue;
    const bedtime = sessionStartMinutesSinceLocalNoon(main, timeZone);
    nights.push({ date, bedtime, wake: wakeMinutes(main, bedtime, timeZone) });
  }
  nights.sort((a, b) => (a.date < b.date ? -1 : 1));

  if (nights.length === 0) {
    return {
      days, nights: 0, score: null, bedtimeSpreadMinutes: null, wakeSpreadMinutes: null,
      averageBedtime: null, averageWake: null, drift: [],
    };
  }

  const bedtimes = nights.map((n) => n.bedtime);
  const wakes = nights.map((n) => n.wake);
  const meanBedtime = mean(bedtimes);
  const scored = nights.length >= MIN_NIGHTS[days];
  const bedStd = populationStdDev(bedtimes);
  const wakeStd = populationStdDev(wakes);
  const { maxStdMinutes } = getLiveConfig().circadian;

  return {
    days,
    nights: nights.length,
    score: scored ? Math.round((spreadToScore(bedStd, maxStdMinutes) + spreadToScore(wakeStd, maxStdMinutes)) / 2) : null,
    bedtimeSpreadMinutes: scored ? Math.round(bedStd) : null,
    wakeSpreadMinutes: scored ? Math.round(wakeStd) : null,
    averageBedtime: noonMinutesToClock(meanBedtime),
    averageWake: noonMinutesToClock(mean(wakes)),
    drift: nights.map((n) => ({ date: n.date, bedtimeOffsetMinutes: Math.round(n.bedtime - meanBedtime) })),
  };
}
