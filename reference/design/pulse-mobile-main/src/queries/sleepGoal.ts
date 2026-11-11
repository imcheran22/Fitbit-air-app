// Settings › Goals, the sleep goal: the profile's goal (7.5 h when it sets none) and the automatic estimate from the
// last 120 days' stored Recovery and main sleep (reference study, sleep.md § Automatic goal estimator).
import { autoSleepGoal, type AutoSleepGoal, type GoalNight } from "@/core/engine/sleep";
import { DEFAULT_SLEEP_GOAL_HOURS } from "@/core/engine/days";
import type { ScoreRow } from "@/data/store";
import { addDays } from "@/lib/time";
import { todayOf, type QueryCtx } from "./common";

export type SleepGoalVM = { hours: number; method: "manual" | "automatic"; estimate: AutoSleepGoal | null };

/**
 * The estimator ranks Recovery with the Sleep Score taken as 100 (its 30 % weight at full), so a good night's sleep never
 * ranks its own night: the stored value plus 30 × (1 − sleepPerf), at most 100.
 */
export function goalNight(r: ScoreRow): GoalNight {
  const v = r.recovery?.value ?? null;
  const perf = r.recovery?.inputs.sleepPerf ?? null;
  return {
    recovery: v == null || perf == null ? null : Math.min(100, v + 30 * (1 - perf)),
    asleepS: r.sleep?.main ? r.sleep.main.asleepMin * 60 : null,
  };
}

export async function sleepGoalView(ctx: QueryCtx): Promise<SleepGoalVM> {
  const today = todayOf(ctx);
  const rows = await ctx.store.scoresIn({ from: addDays(today, -119), to: today });
  const g = ctx.profile.sleepGoal;
  return { hours: g?.hours ?? DEFAULT_SLEEP_GOAL_HOURS, method: g?.method ?? "manual", estimate: autoSleepGoal(rows.map(goalNight)) };
}
