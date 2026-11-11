// Template text (spec 2026-10-04 §2): used when the coach is off, has no consent, is
// reactive-only, or wrote two invalid drafts, and when coach data is deleted. No model call.
// Every sentence is checked like an AI draft, so a template bug can only lose a sentence.
// Wording follows the exact check: digits only, a count noun right after its number, scores as "N/100".

import { countDisplay, durationDisplay, FactSheet } from '../coach/answer/facts';
import { validateSentence } from '../coach/answer/validate';
import { weekdayName } from './periods';
import type { RecapKind, RecapStats } from './types';

const EXACT = { exactNumbers: true } as const;
const periodWord = (kind: RecapKind) => (kind === 'WEEK' ? 'week' : 'month');
const valid = (sheet: FactSheet) => (s: string | null): s is string => s !== null && validateSentence(s, sheet, EXACT).ok;

export function templateLine(kind: RecapKind, stats: RecapStats, sheet: FactSheet): string {
  const period = periodWord(kind);
  const delta = stats.comparison?.avgSleepDelta;
  const lead =
    stats.avgSleepMinutes !== undefined && delta !== undefined && delta !== 0
      ? `You slept ${durationDisplay(stats.avgSleepMinutes)} a night on average, ${durationDisplay(Math.abs(delta))} ${delta > 0 ? 'more' : 'less'} than last ${period}.`
      : stats.nightsOnGoal !== undefined && stats.nightsWithData > 0
        ? `You reached your sleep goal on ${stats.nightsOnGoal} of ${stats.nightsWithData} nights this ${period}.`
        : null;
  const streak = (stats.longestOnGoalStreak ?? 0) >= 3 ? `Your best run was ${stats.longestOnGoalStreak} nights on goal in a row.` : null;
  const kept = [lead, streak].filter(valid(sheet));
  return kept.length > 0 ? kept.join(' ') : `Here's your ${period} in sleep.`;
}

/** The weekly paragraph without a model: the old composeDigestFallback, over the recap sheet. WEEK only. */
export function composeRecapStoryFallback(kind: RecapKind, stats: RecapStats, sheet: FactSheet): string | null {
  if (kind !== 'WEEK') return null;
  const delta = stats.comparison?.avgSleepDelta;
  const lines = [
    stats.avgSleepMinutes !== undefined ? `You slept ${durationDisplay(stats.avgSleepMinutes)} a night on average across ${countDisplay('nights', stats.nightsWithData)}.` : null,
    stats.nightsOnGoal !== undefined ? `You reached your sleep goal on ${countDisplay('nights', stats.nightsOnGoal)}.` : null,
    stats.bestNight ? `Your best night was ${weekdayName(stats.bestNight.date)}, with ${durationDisplay(stats.bestNight.minutesAsleep)} asleep.` : null,
    stats.avgRecovery !== undefined ? `Recovery averaged ${stats.avgRecovery}/100.` : null,
    stats.steps ? `You walked ${stats.steps.total.toLocaleString('en-US')} steps, ${stats.steps.dailyAverage.toLocaleString('en-US')} a day on average.` : null,
    delta !== undefined && delta !== 0 ? `That's ${durationDisplay(Math.abs(delta))} ${delta > 0 ? 'more' : 'less'} sleep a night than last week.` : null,
  ].filter(valid(sheet));
  return lines.length > 0 ? ["Here's your week.", ...lines].join(' ') : null;
}
