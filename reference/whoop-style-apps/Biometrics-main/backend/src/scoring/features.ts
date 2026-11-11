// Stage 2 -- Feature derivation. Pure functions over daily series; persistence
// into UserDailyFeatures happens in the orchestrator.

import { sessionEndCivilDate, sessionStartMinutesSinceLocalNoon } from '../biometrics/civilDate';
import { pickMainSession } from '../biometrics/mainSession';
import { daysBetween, shiftDate } from './dates';
import type { ScoreConfig } from './configs/v1';
import type { DailyPoint, SleepSessionInput } from './types';

/**
 * The window's nights D-(w-1)..D, oldest first, each max(0, sleepGoalMinutes -
 * minutesAsleep). Each night is floored at 0, so a long night does not pay back
 * another night's deficit: it is a rolling deficit, not a net balance.
 *
 * A night with no record contributes 0: absence of data is not evidence of a
 * full-goal deficit. (The caller flags that day's factor as imputed instead, so
 * confidence reflects it.) The Recovery page reads these per night too.
 */
export function nightlyDeficits(sleep: DailyPoint[], date: string, goalMinutes: number, cfg: ScoreConfig): number[] {
  const window = cfg.sleepDebtWindowDays;
  const from = shiftDate(date, -(window - 1));
  const out = new Array<number>(window).fill(0);
  for (const night of sleep) {
    if (night.date < from || night.date > date) continue;
    const i = daysBetween(from, night.date);
    out[i] = out[i]! + Math.max(0, goalMinutes - night.value);
  }
  return out;
}

/** sleepDebtRolling14d = the sum of nightlyDeficits over the window ending on `date` (inclusive). */
export function sleepDebtRolling(sleep: DailyPoint[], date: string, goalMinutes: number, cfg: ScoreConfig): number {
  return nightlyDeficits(sleep, date, goalMinutes, cfg).reduce((sum, v) => sum + v, 0);
}

/**
 * The daily sleep-debt series through `throughDate`, needed as the baseline
 * history for that factor. A day is emitted only when its whole window lies
 * inside the user's history (first recorded night + window - 1): earlier
 * windows are understated by construction and would drag the baseline low,
 * making every later day look like unusually high debt.
 */
export function buildSleepDebtSeries(
  sleep: DailyPoint[],
  throughDate: string,
  goalMinutes: number,
  cfg: ScoreConfig,
): DailyPoint[] {
  if (sleep.length === 0) return [];
  const firstNight = sleep.reduce((min, p) => (p.date < min ? p.date : min), sleep[0]!.date);
  const out: DailyPoint[] = [];
  for (let d = shiftDate(firstNight, cfg.sleepDebtWindowDays - 1); d <= throughDate; d = shiftDate(d, 1)) {
    out.push({ date: d, value: sleepDebtRolling(sleep, d, goalMinutes, cfg) });
  }
  return out;
}

/** Percent deviation of `value` from its EWMA baseline. */
export function baselineDeviationPct(value: number, ewma: number): number {
  return ((value - ewma) / ewma) * 100;
}

function meanOver(steps: DailyPoint[], from: string, to: string): { mean: number; count: number } {
  let sum = 0;
  let count = 0;
  for (const p of steps) {
    if (p.date >= from && p.date <= to) {
      sum += p.value;
      count++;
    }
  }
  return { mean: count === 0 ? 0 : sum / count, count };
}

/**
 * Steps-derived acute:chronic workload ratio (7-day mean / 28-day mean).
 * Computed and stored so the series exists to validate later, but deliberately
 * NOT part of the Recovery composite: a steps proxy is not a validated training
 * load, and a weighted term built on it would carry unvalidated input.
 */
export function acuteChronicLoadRatio(steps: DailyPoint[], date: string, cfg: ScoreConfig): number | null {
  const acute = meanOver(steps, shiftDate(date, -(cfg.acwr.acuteDays - 1)), date);
  const chronic = meanOver(steps, shiftDate(date, -(cfg.acwr.chronicDays - 1)), date);
  if (acute.count === 0 || chronic.count < cfg.acwr.minChronicObservations || chronic.mean === 0) return null;
  return acute.mean / chronic.mean;
}

// ---------------------------------------------------------------------------
// Slice 1.5: Sleep Score features. Both read SleepSession rows (Slice 0) rather
// than the daily BiometricRecord rollup, because they need sleep STRUCTURE
// (onset time, interval), not just a per-day total.
// ---------------------------------------------------------------------------

const MS_PER_MINUTE = 60_000;

/** Minutes between a session's start and end instants; <= 0 (or NaN) means the interval is unusable. */
function intervalMinutes(s: SleepSessionInput): number {
  return (s.endTime.getTime() - s.startTime.getTime()) / MS_PER_MINUTE;
}

/**
 * Sessions grouped by the local civil date of their END instant: at the
 * record's own end UTC offset when it has one, else in `timeZone`. The same key
 * the SLEEP rollup uses, so "night D" is the night that produced day D's HRV and
 * RHR.
 */
export function groupSessionsByNight(
  sessions: SleepSessionInput[],
  timeZone: string,
): Map<string, SleepSessionInput[]> {
  const byNight = new Map<string, SleepSessionInput[]>();
  for (const s of sessions) {
    const date = sessionEndCivilDate(s, timeZone);
    const list = byNight.get(date);
    if (list) list.push(s);
    else byNight.set(date, [s]);
  }
  return byNight;
}

/**
 * sleepEfficiency = sum(minutesAsleep) / sum(time in bed) over one night's
 * sessions, as a 0..1 fraction.
 *
 * ASSUMPTION, not a confirmed fact: time in bed is DERIVED as
 * (endTime - startTime) of each session, not read from Sleep.summary.timeInBed
 * (unverified against the live API). Whether that interval really equals time
 * in bed for every session shape (a segment of a longer night, a device-split
 * night) is a pending Slice 0 live check; see
 * docs/superpowers/notes/slice0-live-checks.md. Until it is settled this value
 * is only as good as that assumption.
 *
 * Sessions with a zero or negative interval carry no time-in-bed information
 * and are ignored (in both sums); a night with none left has no efficiency
 * (null), never a division by zero. The ratio is capped at 1: an interval
 * shorter than minutesAsleep is a data inconsistency, not efficiency above 100%.
 */
export function sleepEfficiency(nightSessions: SleepSessionInput[]): number | null {
  let asleep = 0;
  let inBed = 0;
  for (const s of nightSessions) {
    const minutes = intervalMinutes(s);
    if (!(minutes > 0)) continue;
    asleep += s.minutesAsleep;
    inBed += minutes;
  }
  if (inBed <= 0) return null;
  return Math.min(1, asleep / inBed);
}

/** Daily sleepEfficiency through `throughDate`, one point per night that has a usable interval. */
export function buildSleepEfficiencySeries(
  sessions: SleepSessionInput[],
  timeZone: string,
  throughDate: string,
): DailyPoint[] {
  const out: DailyPoint[] = [];
  for (const [date, night] of groupSessionsByNight(sessions, timeZone)) {
    if (date > throughDate) continue;
    const value = sleepEfficiency(night);
    if (value !== null) out.push({ date, value });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * One point per night: the onset (start instant) of that night's MAIN session,
 * in minutes since 12:00 local (read at the record's own start UTC offset when it
 * has one, else in `timeZone`). Main = the longest by minutesAsleep (a
 * confirmed field, unlike the derived interval), earliest start on a tie, so a
 * nap or a brief split session never stands in for the night's bedtime.
 * Noon-anchored so bedtimes either side of midnight are one contiguous run.
 */
export function mainSessionOnsets(sessions: SleepSessionInput[], timeZone: string): DailyPoint[] {
  const out: DailyPoint[] = [];
  for (const [date, night] of groupSessionsByNight(sessions, timeZone)) {
    const main = pickMainSession(night);
    if (main) out.push({ date, value: sessionStartMinutesSinceLocalNoon(main, timeZone) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Bedtime consistency for the trailing window ending on `date`: the population
 * stddev of the nightly onsets, inverted and normalized to 0..100 as
 * 100 * max(0, 1 - stddev / cfg.circadian.maxStdMinutes). 100 is a metronome
 * bedtime, 0 is a spread of maxStdMinutes or more; higher is better.
 *
 * Null (cold start) until cfg.circadian.minHistoryNights nights of history
 * exist up to `date`, and null when the window itself holds fewer than
 * cfg.circadian.minWindowNights nights (a stddev of two points is noise).
 * Both need only stored SleepSession history, which the Slice 0 re-sync
 * provides, so a user with >= 14 retrievable nights is not held back by
 * "starting from today".
 */
export function circadianConsistencyOn(onsets: DailyPoint[], date: string, cfg: ScoreConfig): number | null {
  const { windowDays, minWindowNights, minHistoryNights, maxStdMinutes } = cfg.circadian;
  if (onsets.filter((o) => o.date <= date).length < minHistoryNights) return null;

  const from = shiftDate(date, -(windowDays - 1));
  const window = onsets.filter((o) => o.date >= from && o.date <= date).map((o) => o.value);
  if (window.length < minWindowNights) return null;

  return spreadToScore(populationStdDev(window), maxStdMinutes);
}

/** Population (divide by n) standard deviation; the caller guarantees a non-empty list. */
export function populationStdDev(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * A spread in minutes inverted and normalized to 0..100: 100 at no spread, 0 at
 * maxStdMinutes or more. Shared by circadian consistency and the sleep
 * regularity endpoint so the two can never use different maths.
 */
export function spreadToScore(stdMinutes: number, maxStdMinutes: number): number {
  return 100 * Math.max(0, 1 - stdMinutes / maxStdMinutes);
}

/**
 * The daily circadian-consistency series through `throughDate`: the baseline
 * history for that factor. Starts on the night the history first reaches
 * cfg.circadian.minHistoryNights, so the baseline itself (which needs
 * cfg.minHistoryDays of these points) is excluded for ~27 nights, as with the
 * sleep-debt series.
 */
export function buildCircadianSeries(onsets: DailyPoint[], throughDate: string, cfg: ScoreConfig): DailyPoint[] {
  const sorted = [...onsets].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sorted.length < cfg.circadian.minHistoryNights) return [];
  const out: DailyPoint[] = [];
  for (let d = sorted[cfg.circadian.minHistoryNights - 1]!.date; d <= throughDate; d = shiftDate(d, 1)) {
    const value = circadianConsistencyOn(sorted, d, cfg);
    if (value !== null) out.push({ date: d, value });
  }
  return out;
}
