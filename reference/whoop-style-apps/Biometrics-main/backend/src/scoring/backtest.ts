// Pure core of the backtest tool (scripts/backtest.ts does the DB loading and
// printing). Replays stored history through two config versions and diffs the
// resulting scores, using the SAME scoreDay the live job uses, so a diff can
// only ever come from the config difference.

import type { ScoreConfig } from './configs/v1';
import { scoreDay } from './pipeline';
import type { DailyPoint, SleepSessionInput } from './types';

/** Which composite a backtest replays. */
export type BacktestScoreType = 'RECOVERY' | 'SLEEP';

/** A day whose score moves by more than this is called out (spec §3: "flip more than 10 points"). */
export const CHANGE_THRESHOLD_POINTS = 10;

export const BACKTEST_DISCLAIMER =
  'REGRESSION CHECK, NOT A CORRECTNESS VALIDATION. This shows what changed between two algorithm ' +
  'versions on historical data ("did this change do something bigger than I expected"). There is no ' +
  'ground-truth recovery label to validate against, so it cannot say either version is more accurate.';

export interface BacktestUserData {
  userId: string;
  hrv: DailyPoint[];
  rhr: DailyPoint[];
  sleep: DailyPoint[];
  steps: DailyPoint[];
  sleepGoalMinutes: number;
  /** Stored sessions (Sleep Score efficiency / bedtime consistency). Omitted means those factors cold-start. */
  sessions?: SleepSessionInput[];
  /** IANA zone sessions without their own UTC offset are read in. Defaults to UTC. */
  timezone?: string;
}

export interface DayDiff {
  userId: string;
  date: string;
  live: number | null;
  candidate: number | null;
  /** candidate - live; null when either side has no score (cold start under one version only). */
  delta: number | null;
}

export interface BacktestReport {
  type: BacktestScoreType;
  liveVersion: string;
  candidateVersion: string;
  days: DayDiff[];
  /** Days where both versions produced a score. */
  comparedDays: number;
  /** Days where |delta| > CHANGE_THRESHOLD_POINTS. */
  changedOverThreshold: number;
  /** Days scored under exactly one version. */
  scoredByOneVersionOnly: number;
  meanAbsDelta: number;
  maxAbsDelta: number;
}

/** Every date with an observed score input inside [from, to], ascending. */
function replayDates(user: BacktestUserData, from: string, to: string): string[] {
  const dates = new Set<string>();
  for (const p of [...user.hrv, ...user.rhr, ...user.sleep]) {
    if (p.date >= from && p.date <= to) dates.add(p.date);
  }
  return [...dates].sort();
}

/**
 * Replays one score type. Uses the SAME scoreDay for both, so the Recovery and
 * Sleep diffs come from the one pipeline the live job runs. A day contributes
 * to the SLEEP report only when a Sleep Score exists for it under the live
 * config (no observed sleep, no Sleep Score, as in the live job).
 */
export function backtest(
  users: BacktestUserData[],
  live: ScoreConfig,
  candidate: ScoreConfig,
  range: { from: string; to: string },
  type: BacktestScoreType = 'RECOVERY',
): BacktestReport {
  const days: DayDiff[] = [];

  for (const user of users) {
    for (const date of replayDates(user, range.from, range.to)) {
      const input = {
        date,
        hrv: user.hrv,
        rhr: user.rhr,
        sleep: user.sleep,
        steps: user.steps,
        sleepGoalMinutes: user.sleepGoalMinutes,
        sessions: user.sessions ?? [],
        timezone: user.timezone ?? 'UTC',
      };
      const l = scoreDay(input, live);
      if (!l.hasObservedInput) continue;
      const c = scoreDay(input, candidate);
      // The Sleep Score exists only for a night with recorded sleep; when the
      // live config has none for the day, there is nothing to diff.
      const liveScore = type === 'SLEEP' ? l.sleepScore : l;
      const candidateScore = type === 'SLEEP' ? c.sleepScore : c;
      if (liveScore === null) continue;
      const liveValue = liveScore.score;
      const candidateValue = candidateScore === null ? null : candidateScore.score;
      days.push({
        userId: user.userId,
        date,
        live: liveValue,
        candidate: candidateValue,
        delta: liveValue !== null && candidateValue !== null ? candidateValue - liveValue : null,
      });
    }
  }

  const deltas = days.map((d) => d.delta).filter((d): d is number => d !== null);
  const abs = deltas.map(Math.abs);
  return {
    type,
    liveVersion: live.version,
    candidateVersion: candidate.version,
    days,
    comparedDays: deltas.length,
    changedOverThreshold: abs.filter((d) => d > CHANGE_THRESHOLD_POINTS).length,
    scoredByOneVersionOnly: days.filter((d) => (d.live === null) !== (d.candidate === null)).length,
    meanAbsDelta: abs.length === 0 ? 0 : abs.reduce((s, d) => s + d, 0) / abs.length,
    maxAbsDelta: abs.length === 0 ? 0 : Math.max(...abs),
  };
}

const fmt = (n: number | null) => (n === null ? '  -  ' : n.toFixed(1).padStart(5));

export function formatReport(report: BacktestReport, { maxRows = 60 }: { maxRows?: number } = {}): string {
  const changed = report.days
    .filter((d) => d.delta === null ? d.live !== d.candidate : Math.abs(d.delta) >= 0.05)
    .sort((a, b) => Math.abs(b.delta ?? Infinity) - Math.abs(a.delta ?? Infinity));

  const lines = [
    BACKTEST_DISCLAIMER,
    '',
    `${report.type} score: live ${report.liveVersion}  vs  candidate ${report.candidateVersion}`,
    `  days replayed:                       ${report.days.length}`,
    `  days scored under both versions:     ${report.comparedDays}`,
    `  days changed by more than ${CHANGE_THRESHOLD_POINTS} points:    ${report.changedOverThreshold}`,
    `  days scored under only one version:  ${report.scoredByOneVersionOnly}`,
    `  mean |delta|: ${report.meanAbsDelta.toFixed(2)}   max |delta|: ${report.maxAbsDelta.toFixed(2)}`,
  ];
  if (changed.length > 0) {
    lines.push('', 'largest per-day changes (user, date, live, candidate, delta):');
    for (const d of changed.slice(0, maxRows)) {
      lines.push(`  ${d.userId}  ${d.date}  ${fmt(d.live)}  ${fmt(d.candidate)}  ${d.delta === null ? '  n/a' : (d.delta >= 0 ? '+' : '') + d.delta.toFixed(1)}`);
    }
    if (changed.length > maxRows) lines.push(`  ... ${changed.length - maxRows} more`);
  }
  return lines.join('\n');
}
