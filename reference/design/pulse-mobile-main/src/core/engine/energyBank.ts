// Energy Bank, 1–100, a charge and drain state machine on the 6-minute stress slots. Reference study,
// recovery-stress-energy.md § Energy Bank. Sleep charges toward the sleep goal; awake slots charge when raw stress is
// under 20 and drain otherwise, faster the higher the stress; charging slows near the top and draining near the bottom.
// The level carries across midnight. Fix 3: instead of starting every history at 0, the machine warms up over the first
// days (the pipeline shows it from the eighth).
import { clamp } from "./math";
import type { SlotContext } from "./stress";

/** The level's band, for its colour: high above 75, medium above 50, low above 25, else very low. */
export type EnergyBand = "very_low" | "low" | "medium" | "high";
export const energyBand = (level: number): EnergyBand => (level > 75 ? "high" : level > 50 ? "medium" : level > 25 ? "low" : "very_low");

/** A stretch that drained the bank: a workout (by its name), stress, or other activity; `amount` in points. */
export interface Drain {
  label: string;
  kind: "workout" | "activity" | "stress";
  /** Unix seconds, [start, end). */
  start: number;
  end: number;
  amount: number;
}

/** Days the machine runs before its level is shown. */
export const WARMUP_DAYS = 7;
export const DEFAULT_AWAKE_S = 57_600;

/**
 * One slot's step from level `e`: sleep slots charge at 80 per sleep goal; awake, workout and exercise slots charge at
 * 15 per awake day when raw stress is under 20, else drain at 60 per awake day; without stress, 70 % of the rate.
 */
export function energyStep(e: number, a: { context: SlotContext; rawStress: number | null; sleepGoalS: number; awakeS: number }): number {
  const S = a.rawStress;
  const sleep = a.context === "otherSleep" || a.context === "remAndDeepSleep";
  const charging = sleep || (S != null && S < 20);
  const base = sleep ? 80 / a.sleepGoalS : (charging ? 15 : 60) / a.awakeS;
  let delta: number;
  if (S == null) delta = base * 0.7 * 360;
  else if (charging) {
    const k = Math.pow(0.93, S - 5) + 0.1;
    delta = k <= 1 ? base * k * 360 : base * 360;
  } else {
    const k = S > 100 ? Math.pow(1.0115059614181519, S) + 0.40839999914 : Math.pow(1.0150359869003296, S) - 0.89999997615;
    delta = base * k * 360;
  }
  const cap = Math.min(1, Math.pow(1.05, charging ? -(e - 60) : e - 40));
  return clamp(e + (charging ? 1 : -1) * delta * cap, 1, 100);
}

/**
 * Each day's awake seconds for the drain and charge rates: 86400 minus its sleep, averaged over the 7 days up to it,
 * applied the day after (`sleepS` by day, oldest first; null for a day before any data). Default 16 h.
 */
export function awakeSeconds(sleepS: readonly (number | null)[]): number {
  const xs = sleepS.slice(-7).filter((s): s is number => s != null).map((s) => 86_400 - s);
  return xs.length > 1 ? xs.reduce((a, x) => a + x, 0) / xs.length : DEFAULT_AWAKE_S;
}
