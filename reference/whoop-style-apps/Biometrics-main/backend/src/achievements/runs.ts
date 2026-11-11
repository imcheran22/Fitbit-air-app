// Runs (spec 2026-10-06 §4): consecutive qualifying dates. One generic walk serves every streak
// family; each family only decides how a date is marked.
//   hit  — qualifies;
//   miss — has data and does not qualify: breaks the run;
//   none — no data: for a synced family (pausable) it breaks only when a later date has data or it
//          is more than PAUSE_DAYS before today, otherwise the latest run is paused; for a family
//          that is not synced (check-ins) it breaks at once;
//   skip — neither counts nor breaks (a night with no bedtime goal and too little history; today's
//          habit day before its check-in).

import { shiftDate } from '../scoring/dates';

export type DayMark = 'hit' | 'miss' | 'none' | 'skip';
export interface MarkedDay { date: string; mark: DayMark }
export interface Run { hits: string[]; broken: boolean }
export interface RunSummary { runs: Run[]; best: number; current: number }
export interface EarnedLevel { level: number; value: number; earnedOn: string }

export const PAUSE_DAYS = 2;

/** `days` ascending, from the family's start date to the last date it can judge. */
export function summariseRuns(days: readonly MarkedDay[], opts: { today: string; pausable: boolean }): RunSummary {
  let lastData = -1;
  for (let i = 0; i < days.length; i++) {
    const mark = days[i]!.mark;
    if (mark === 'hit' || mark === 'miss') lastData = i;
  }
  const cutoff = shiftDate(opts.today, -PAUSE_DAYS);
  const runs: Run[] = [];
  let open: Run | null = null;
  for (let i = 0; i < days.length; i++) {
    const { date, mark } = days[i]!;
    if (mark === 'skip') continue;
    if (mark === 'hit') {
      if (open === null) {
        open = { hits: [], broken: false };
        runs.push(open);
      }
      open.hits.push(date);
      continue;
    }
    const breaks = mark === 'miss' || !opts.pausable || i < lastData || date < cutoff;
    if (breaks && open !== null) {
      open.broken = true;
      open = null;
    }
  }
  const best = runs.reduce((m, r) => Math.max(m, r.hits.length), 0);
  const last = runs[runs.length - 1];
  return { runs, best, current: last && !last.broken ? last.hits.length : 0 };
}

/** Each threshold some run reached, dated by the earliest run to reach it (its Nth hit). */
export function earnedLevels(runs: readonly Run[], thresholds: readonly number[]): EarnedLevel[] {
  const out: EarnedLevel[] = [];
  thresholds.forEach((value, i) => {
    const run = runs.find((r) => r.hits.length >= value);
    if (run) out.push({ level: i + 1, value, earnedOn: run.hits[value - 1]! });
  });
  return out;
}
