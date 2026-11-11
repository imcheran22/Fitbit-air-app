// The sleep family: Sleep Score, Sleep Bank, Sleep Consistency and Sleep Needed. Reference study, sleep.md.
import type { Stage } from "@/data/types";
import { clamp, mean } from "./math";

export type Sex = "male" | "female";

/** A stage segment; "unspecified" is sleep without a stage (a night with no hypnogram). */
export type SleepSeg = { startTs: number; endTs: number; stage: Stage | "unspecified" };

export type StageSums = { total: number; asleep: number; awake: number; deep: number; rem: number; interruptions: number };

/** Leading and trailing awake segments dropped (reference study, sleep.md § Score-side preprocessing, trimAwakeEdges). */
export function trimAwakeEdges(segs: readonly SleepSeg[]): SleepSeg[] {
  const first = segs.findIndex((s) => s.stage !== "awake");
  if (first < 0) return [];
  let last = segs.length - 1;
  while (segs[last].stage === "awake") last--;
  return segs.slice(first, last + 1);
}

/** Seconds per stage over the trimmed segments; every interior awake segment is one interruption, however short. */
export function stageSums(segs: readonly SleepSeg[]): StageSums {
  const s: StageSums = { total: 0, asleep: 0, awake: 0, deep: 0, rem: 0, interruptions: 0 };
  for (const g of trimAwakeEdges(segs)) {
    const d = g.endTs - g.startTs;
    s.total += d;
    if (g.stage === "awake") {
      s.awake += d;
      s.interruptions++;
      continue;
    }
    s.asleep += d;
    if (g.stage === "deep") s.deep += d;
    else if (g.stage === "rem") s.rem += d;
  }
  return s;
}

export const hasStages = (segs: readonly SleepSeg[]) => segs.some((g) => g.stage === "light" || g.stage === "deep" || g.stage === "rem");

/** 1 up to 5 interruptions, then the study's table to 12, then −0.05 each, at least 0.4. */
export function continuityFactor(n: number): number {
  if (n < 6) return 1;
  if (n <= 12) return [0.98, 0.95, 0.91, 0.86, 0.8, 0.73, 0.65][n - 6];
  return Math.max(0.4, (n - 12) * -0.05 + 0.65);
}

/** Deep-sleep and heart-rate-dip targets by age and sex (sleep.md § Per-sex and per-age targets); REM is always 0.2. */
export function sleepTargets(age: number | null, sex: Sex | null): { deep: number; rem: number; hrDip: number } {
  if (age == null || sex == null) return { deep: 0.125, rem: 0.2, hrDip: 0.255 };
  const band = age < 30 ? 0 : age < 40 ? 1 : age < 50 ? 2 : age < 60 ? 3 : age < 70 ? 4 : 5;
  const male = sex === "male";
  if (band === 0) return { deep: 0.15, rem: 0.2, hrDip: 0.3 };
  return { deep: (male ? 0.14 : 0.15) - 0.01 * band, rem: 0.2, hrDip: (male ? 0.29 : 0.3) - 0.01 * band };
}

export const SLEEP_COMPONENTS = ["asleep", "deep", "rem", "hrDip", "efficiency", "continuity"] as const;
export type SleepComponent = (typeof SLEEP_COMPONENTS)[number];
const EXP = [3, 2, 2, 3, 15, 10];
const W = [0.35, 0.2, 0.2, 0.1, 0.075, 0.075];

/** A component's raw input, its share of target (curve before the cap), and the 0–1 value the score uses. */
export type ComponentResult = { input: number; ofTarget: number; value: number };

/**
 * The Sleep Score, 0–100, from the primary sleep's stage sums against the night's need: six components, each
 * min(1, (x / target)^exp), weighted; missing components (no stages: deep and REM; no heart-rate dip) are dropped and the
 * weights renormalized. Null with no sleep (asleep ratio 0). Reference study, sleep.md § Kernel.
 */
export function sleepScore(a: {
  sums: StageSums;
  staged: boolean;
  needS: number;
  /** 1 − sleeping HR / inactive-HR baseline, at least 0; null without either. */
  hrDip: number | null;
  age: number | null;
  sex: Sex | null;
}): { score: number | null; components: Record<SleepComponent, ComponentResult | null> } {
  const { sums: s, needS } = a;
  const t = sleepTargets(a.age, a.sex);
  const ratio = (x: number) => (needS === 0 ? 0 : x / needS);
  const inputs = [
    ratio(s.asleep),
    a.staged ? ratio(s.deep) : null,
    a.staged ? ratio(s.rem) : null,
    a.hrDip,
    s.total === 0 ? 1 : 1 - s.awake / s.total,
    continuityFactor(s.interruptions),
  ];
  const targets = [1, t.deep, 0.2, t.hrDip, 0.97, 1];
  const components = {} as Record<SleepComponent, ComponentResult | null>;
  let num = 0;
  let den = 0;
  inputs.forEach((x, i) => {
    if (x == null || !Number.isFinite(x)) {
      components[SLEEP_COMPONENTS[i]] = null;
      return;
    }
    const ofTarget = Math.pow(x / targets[i], EXP[i]);
    const value = Math.min(1, ofTarget);
    components[SLEEP_COMPONENTS[i]] = { input: x, ofTarget, value };
    num += W[i] * value;
    den += W[i];
  });
  const score = inputs[0] === 0 || !(den > 0) ? null : clamp((num * 100) / den, 0, 100);
  return { score, components };
}

/** The heart-rate dip: 1 − sleeping HR ÷ the inactive-HR baseline, at least 0 (sleep.md § HR dip producer). */
export const hrDip = (sleepingHr: number | null, inactiveBaseline: number | null) =>
  sleepingHr == null || inactiveBaseline == null || !(inactiveBaseline > 0) ? null : Math.max(0, 1 - sleepingHr / inactiveBaseline);

/**
 * The Sleep Bank in minutes over up to 7 days, oldest first: each day's sleep (main and naps, not awake) minus the goal,
 * weighted e^(0.3·(j − 6)) with j = 6 the NEWEST day (fix 14: the source counted j from the oldest, so a short history
 * gave last night a weight below 1). A day with no sleep is skipped but keeps its slot.
 */
export function sleepBank(asleepS: readonly number[], goalHours: number): number {
  const days = asleepS.slice(-7);
  let out = 0;
  days.forEach((t, j) => {
    if (t === 0) return;
    out += ((t - goalHours * 3600) / 60) * Math.exp(0.3 * (j - (days.length - 1)));
  });
  return out;
}

/** The night's need, seconds: goal, plus the strain term, plus a quarter of the debt (sleep.md § Per-day SleepNeeded). */
export type SleepNeed = { goalS: number; strainS: number; debtS: number; needS: number };

/**
 * `prevStrain` against `recentStrains` (up to 30 days before it, population SD): each SD above the mean asks 2 % more
 * sleep, never less. `bankMin`: the bank the need repays (a quarter of a negative bank).
 */
export function sleepNeeded(goalHours: number, prevStrain: number | null, recentStrains: readonly number[], bankMin: number): SleepNeed {
  const goalS = goalHours * 3600;
  const m = mean(recentStrains);
  let mult = 1;
  if (m != null && prevStrain != null) {
    const sd = Math.sqrt(recentStrains.reduce((a, x) => a + (x - m) ** 2, 0) / recentStrains.length);
    mult = Math.max(1, 1 + 0.02 * (sd === 0 ? 0 : (prevStrain - m) / sd));
  }
  const strainS = Math.max(0, goalS * mult - goalS);
  const debtS = bankMin < 0 ? bankMin * -60 * 0.25 : 0;
  return { goalS, strainS, debtS, needS: goalS + strainS + debtS };
}

/**
 * Tonight's need: the per-night need, plus the time lost to the usual efficiency (at most an hour) and the usual time
 * to fall asleep (at most an hour), over the last 30 nights (sleep.md § Tonight planner). Efficiency in %, latency in min.
 */
export function tonightNeeded(need: SleepNeed, efficiencies: readonly number[], latenciesMin: readonly number[]) {
  const avgEff = mean(efficiencies) ?? 100;
  const effS = avgEff === 0 ? 0 : Math.min(need.needS / (avgEff / 100) - need.needS, 3600);
  const latS = latenciesMin.length ? Math.min(mean(latenciesMin)!, 60) * 60 : 0;
  return { ...need, effS, latS, inBedS: need.needS + effS + latS };
}

/**
 * Sleep Consistency, 0–100: how much the asleep minutes of up to 7 recent days agree, bin by bin over 1440 clock minutes
 * (sleep.md § Sleep Consistency). Each day lists the clock-minute ranges [m0, m1) it was asleep (its own night and the
 * night before, clipped to its local midnight-to-midnight). Null with fewer than 2 days.
 */
export function sleepConsistency(days: readonly (readonly [number, number][])[]): number | null {
  const N = days.length;
  if (N < 2) return null;
  const k = new Array<number>(1440).fill(0);
  for (const ranges of days) {
    const mark = new Array<boolean>(1440).fill(false);
    for (const [m0, m1] of ranges) for (let m = Math.max(0, m0); m < Math.min(1440, m1); m++) if (!mark[m]) {
      mark[m] = true;
      k[m]++;
    }
  }
  let agr = 0;
  for (const km of k) agr += km * (km - 1) + (N - km) * (N - km - 1);
  return (agr / ((N - 1) * N) / 1440) * 100;
}

/**
 * The sleep goal onboarding sets from age, hours (reference study, sleep.md § Goal setting, defaults and read path,
 * defaultGoalByAge): 8:00 under 30, 7:45 in the 30s, 7:30 from 40 to 59, 7:15 in the 60s, 7:00 from 70.
 */
export function defaultSleepGoal(age: number): number {
  if (age >= 70) return 7;
  if (age >= 60) return 7.25;
  if (age >= 40) return 7.5;
  if (age >= 30) return 7.75;
  return 8;
}

/** A night for the automatic goal: Recovery with the Sleep Score taken as 100, and the main sleep's asleep seconds. */
export type GoalNight = { recovery: number | null; asleepS: number | null };

/**
 * `sufficient` with 90 nights and 15 of them at Recovery 67 or more; `insufficient` still carries a goal. `nights`: the
 * nights ranked; `high`: the nights at 67 or more.
 */
export type AutoSleepGoal = { status: "sufficient" | "insufficient"; hours: number; nights: number; high: number };

/**
 * The automatic sleep goal (reference study, sleep.md § Automatic goal estimator, dynamicGoal): over the last 120 days,
 * oldest first, the last 90 nights with a Recovery and a main sleep, ranked by Recovery (ties keep their order); the mean
 * asleep time of the top 15 %, plus 30 s, in whole minutes. Null when no night ranks or none reaches 67.
 */
export function autoSleepGoal(days: readonly GoalNight[]): AutoSleepGoal | null {
  const last = days.filter((d) => d.recovery != null && d.asleepS != null).slice(-90);
  const k = Math.trunc(last.length * 0.15);
  const high = days.filter((d) => d.recovery != null && d.recovery >= 67).length;
  if (k === 0 || high === 0) return null;
  const top = [...last].sort((a, b) => b.recovery! - a.recovery!).slice(0, k);
  const total = Math.round(top.reduce((a, d) => a + d.asleepS!, 0) / k) + 30;
  const hours = Math.trunc(total / 3600) + (Math.trunc(total / 60) % 60) / 60;
  return { status: last.length >= 90 && high >= 15 ? "sufficient" : "insufficient", hours, nights: last.length, high };
}
