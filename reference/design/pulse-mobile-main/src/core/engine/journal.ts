// Journal insights: does a behaviour logged on day D − 1 go with a different score on day D? Reference study,
// other-calculators.md § Journal insights: over the last 90 days, the days after a "yes" against the days after a "no",
// at least 5 of each; the effect is the difference of their means (the OLS slope on a 0/1 input), and it is clear when a
// pooled two-sample t statistic beats the one-sided 0.85 quantile of t (a two-sided 70 % test).
import { addDays } from "@/lib/time";
import { mean, roundHalfAway } from "./math";

export const WINDOW_DAYS = 90;
export const MIN_DAYS = 5;

/** One-sided 0.85 quantiles of t for 1–30 degrees of freedom (30 and over use the last). */
const T85 = [
  1.963, 1.386, 1.25, 1.19, 1.156, 1.134, 1.119, 1.108, 1.1, 1.093, 1.088, 1.083, 1.079, 1.076, 1.074, 1.071, 1.069, 1.067, 1.066,
  1.064, 1.063, 1.061, 1.06, 1.059, 1.058, 1.058, 1.057, 1.056, 1.055, 1.055,
];

export type ImpactLabel = "positive" | "negative" | "no_clear_effect" | "not_enough_data";
export type Effect = { nYes: number; nNo: number; delta: number | null; ciLow: number | null; ciHigh: number | null; label: ImpactLabel };

/**
 * The effect of "yes" on a score: mean(yes) − mean(no), and the interval delta ± t85 · SE (pooled variance), which
 * excludes 0 exactly when the test says the effect is clear. `dp`: decimals of the delta and interval (whole points for
 * 0–100 scores, as the source rounded the slope).
 */
export function effect(yes: readonly number[], no: readonly number[], dp = 0): Effect {
  const nYes = yes.length;
  const nNo = no.length;
  if (nYes < MIN_DAYS || nNo < MIN_DAYS) return { nYes, nNo, delta: null, ciLow: null, ciHigh: null, label: "not_enough_data" };
  const m1 = mean(no)!;
  const m2 = mean(yes)!;
  const ss = (xs: readonly number[], m: number) => xs.reduce((a, x) => a + (x - m) ** 2, 0);
  const df = nYes + nNo - 2;
  const sp2 = (ss(no, m1) + ss(yes, m2)) / df;
  const se = Math.sqrt(sp2 / nNo + sp2 / nYes);
  const crit = T85[Math.min(df, 30) - 1];
  const diff = m2 - m1;
  const clear = se === 0 ? diff !== 0 : Math.abs(diff) / se > crit;
  const delta = roundHalfAway(diff, dp);
  return {
    nYes,
    nNo,
    delta,
    ciLow: roundHalfAway(diff - crit * se, dp + 1),
    ciHigh: roundHalfAway(diff + crit * se, dp + 1),
    label: !clear || delta === 0 ? "no_clear_effect" : delta > 0 ? "positive" : "negative",
  };
}

/** The days after each answer to `tag` in the window ending the day before `asOf`, as [yes outcomes, no outcomes]. */
export function arms<T>(entries: readonly { day: string; tags: Record<string, boolean | number> }[], outcomeOf: (day: string) => T | undefined, asOf: string) {
  const from = addDays(asOf, -WINDOW_DAYS);
  const out = new Map<string, { yes: T[]; no: T[] }>();
  for (const e of [...entries].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    if (e.day < from || e.day >= asOf) continue;
    const next = outcomeOf(addDays(e.day, 1));
    if (next === undefined) continue;
    for (const [tag, v] of Object.entries(e.tags)) {
      const a = out.get(tag) ?? { yes: [], no: [] };
      out.set(tag, a);
      (Number(v) > 0 ? a.yes : a.no).push(next);
    }
  }
  return out;
}
