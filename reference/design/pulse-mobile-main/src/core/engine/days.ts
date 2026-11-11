// Functional days, windows and each day's aggregates. Reference study, shared-machinery.md § G04 (functional days and
// windows) and § G05 (per-day aggregates, default configuration). A functional day is a local calendar day
// [midnight, next midnight); a night belongs to the day it ends on (Session.day, the wake day). The windows:
// - midnight: the calendar day;
// - sleepSession: the day's primary sleep, start to end (empty without one).
// The pipeline builds DayInput from the store and keeps DayAggs in stage 1; stage 2 pools them into baselines.
import { combinedAgg, dailyAgg, type Agg } from "./baselines";
import { contextAt, isSleep, within, type MinuteHr, type Span, type Timeline } from "./context";

/** The sleep goal when the profile sets none: 7.5 h (reference study, shared-machinery.md § G06; fix 7). */
export const DEFAULT_SLEEP_GOAL_HOURS = 7.5;

export type DayInput = {
  /** The local day, [dayStart, dayEnd). */
  dayStart: number;
  dayEnd: number;
  /** The night ending on this day. */
  primary: Span | null;
  tl: Timeline;
  /** Minute heart rate and HRV samples (ascending) covering at least the primary sleep and the day. */
  hr: readonly MinuteHr[];
  hrv: readonly { ts: number; ms: number }[];
  /** The night's respiratory rate (Health Connect gives one per night) and skin-temperature delta, °C. */
  respBpm: number | null;
  tempDeltaC: number | null;
};

/**
 * One day's aggregates (the study's default configuration, entire-sleep contexts):
 * - restingHRV (daily): the night's HRV samples labelled sleep, inside the primary sleep;
 * - averageHRV (combined): every HRV sample of the calendar day (Stress's HRV baseline);
 * - restingHR (combined): the night's minute heart rate labelled sleep, inside the primary sleep (also the sleeping
 *   heart rate the Sleep Score's dip reads);
 * - inactiveHR (combined, with a histogram): the calendar day's minute heart rate labelled awake (Stress's HR CDF, the
 *   Sleep Score's dip baseline);
 * - resp (combined) and temp (daily): the night's single values.
 */
export type DayAggs = {
  restingHRV: Agg | null;
  averageHRV: Agg | null;
  restingHR: Agg | null;
  inactiveHR: Agg | null;
  resp: Agg | null;
  temp: Agg | null;
};

export function dayAggregates(d: DayInput): DayAggs {
  const night = d.primary;
  const nightHrv = night ? within(d.hrv, night.startTs, night.endTs).filter((s) => isSleep(contextAt(d.tl, s.ts, false))) : [];
  const nightHr = night ? within(d.hr, night.startTs, night.endTs).filter((m) => isSleep(contextAt(d.tl, m.ts))) : [];
  const dayHr = within(d.hr, d.dayStart, d.dayEnd).filter((m) => contextAt(d.tl, m.ts) === "awake");
  return {
    restingHRV: dailyAgg(nightHrv.map((s) => s.ms)),
    averageHRV: combinedAgg(within(d.hrv, d.dayStart, d.dayEnd).map((s) => s.ms)),
    restingHR: combinedAgg(nightHr.map((m) => m.bpm)),
    inactiveHR: combinedAgg(dayHr.map((m) => m.bpm), true),
    resp: d.respBpm == null ? null : { avg: d.respBpm, sd: 0, count: 1 },
    temp: d.tempDeltaC == null ? null : dailyAgg([d.tempDeltaC]),
  };
}

/** Which way each aggregate pools into its baseline. */
export const POOLING = {
  restingHRV: "daily",
  averageHRV: "combined",
  restingHR: "combined",
  inactiveHR: "combined",
  resp: "combined",
  temp: "daily",
} as const satisfies Record<keyof DayAggs, "daily" | "combined">;
