export type BiometricMetricType = 'HRV' | 'RESTING_HR' | 'SLEEP' | 'STEPS';

export interface HealthMetricPoint {
  recordedAt: Date;
  value: number;
}

// One Google `Sleep` object, kept whole (not collapsed to a per-day value) so
// re-fetching the same session is idempotent. Only fields confirmed against
// the live API: sleep.interval.{startTime,endTime} and
// sleep.summary.minutesAsleep, plus sleep.interval.{startUtcOffset,endUtcOffset}
// ("-14400s" strings, verified live) parsed to seconds east of UTC. The offsets
// are the record's own local-time basis; null when Google omitted or garbled one.
// The night summary and stage timeline (spec 2026-10-03 §1) are null / [] when
// Google omitted or garbled them, never 0.
export type SleepStageType = 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM';
export interface SleepStagePoint { type: SleepStageType; startTime: Date; endTime: Date }
export interface SleepSessionPoint {
  startTime: Date; endTime: Date; minutesAsleep: number;
  startUtcOffsetSeconds?: number | null; endUtcOffsetSeconds?: number | null;
  sleepType?: string | null; mainSleep?: boolean | null;
  minutesInSleepPeriod?: number | null; minutesAwake?: number | null;
  minutesToFallAsleep?: number | null; minutesAfterWakeUp?: number | null;
  deepMinutes?: number | null; lightMinutes?: number | null; remMinutes?: number | null; awakeMinutes?: number | null;
  stages?: SleepStagePoint[];
}
