// SLEEP_DEBT z for `target` if the night ending on `target` lasts
// `plannedMinutes`: the same four steps scoring/pipeline.ts runs, so the sleep
// lever is exact rather than predicted. Pure.
import { computeBaseline, zScore } from '../scoring/baseline';
import type { ScoreConfig } from '../scoring/configs';
import { shiftDate } from '../scoring/dates';
import { buildSleepDebtSeries, sleepDebtRolling } from '../scoring/features';
import type { DailyPoint } from '../scoring/types';

export function sleepDebtZ(
  sleep: DailyPoint[],
  target: string,
  plannedMinutes: number,
  goalMinutes: number,
  cfg: ScoreConfig,
): number | null {
  const nights = [...sleep.filter((p) => p.date < target), { date: target, value: plannedMinutes }].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const debt = sleepDebtRolling(nights, target, goalMinutes, cfg);
  const debtSeries = buildSleepDebtSeries(nights, target, goalMinutes, cfg);
  const from = shiftDate(target, -cfg.historyDays);
  const baseline = computeBaseline(
    debtSeries.filter((p) => p.date >= from && p.date < target),
    cfg,
  );
  return zScore(debt, baseline, cfg, 'SLEEP_DEBT');
}
