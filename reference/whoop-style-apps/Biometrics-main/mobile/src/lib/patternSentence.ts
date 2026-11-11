import type { NotEnoughDataDTO, PatternDTO, PatternFactor, PatternSeriesDTO } from '../api/habits';

// Every sentence here is built from the structured fields the server returns --
// never from free text -- in the same deterministic way metricInsights.ts and
// scoreInsights.ts build theirs. Always worded as correlation in the user's own
// data, never as a medical or causal claim.

// Below this many paired observations a pattern is flagged as tentative.
export const SMALL_SAMPLE_THRESHOLD = 10;

const RESTING_HR = 'resting heart rate';

const FACTOR_PHRASES: Record<PatternFactor, string> = {
  HRV: 'HRV',
  RHR: RESTING_HR,
  SLEEP_DURATION: 'sleep duration',
  SLEEP_EFFICIENCY: 'sleep efficiency',
  CIRCADIAN_CONSISTENCY: 'sleep-timing consistency',
};

export function factorPhrase(factor: PatternFactor, serverLabel: string): string {
  const known = FACTOR_PHRASES[factor];
  if (known) return known;
  return /resting/i.test(serverLabel) ? RESTING_HR : serverLabel;
}

export function lagPhrase(lagDays: number): string {
  return lagDays === 1 ? 'The morning after' : `${lagDays} days after`;
}

// 14 -> "14", 8.4 -> "8.4", 14.26 -> "14.3".
export function formatNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function belowOrAbove(percent: number): 'below' | 'above' {
  return percent < 0 ? 'below' : 'above';
}

function observations(n: number): string {
  return `${n} ${n === 1 ? 'observation' : 'observations'}`;
}

export function buildPatternSentence(pattern: PatternDTO): string {
  const threshold = `${formatNumber(pattern.exposureThreshold)}+ ${pattern.exposureUnit}`;
  const factor = factorPhrase(pattern.factor, pattern.factorLabel);
  const effect = formatNumber(Math.abs(pattern.effectSizePercent));
  return (
    `${lagPhrase(pattern.lagDays)} you log ${threshold}, your ${factor} has averaged ` +
    `${effect}% ${belowOrAbove(pattern.effectSizePercent)} baseline (across ${observations(pattern.sampleSize)}) — ` +
    'this is a pattern in your own data, not a general medical claim.'
  );
}

// The control: the same factor on unexposed days, so the headline number can
// always be read against what "normal" looked like.
export function buildComparisonSentence(pattern: PatternDTO): string {
  const factor = factorPhrase(pattern.factor, pattern.factorLabel);
  const comparison = formatNumber(Math.abs(pattern.comparisonPercent));
  return (
    `On days you log under ${formatNumber(pattern.exposureThreshold)} ${pattern.exposureUnit}, your ${factor} ` +
    `has averaged ${comparison}% ${belowOrAbove(pattern.comparisonPercent)} baseline.`
  );
}

export function isSmallSample(sampleSize: number): boolean {
  return sampleSize < SMALL_SAMPLE_THRESHOLD;
}

// Persistent, visible sample-size caveat -- a pattern from 3 nights and one
// from 40 are not the same confidence.
export function buildSampleCaveat(sampleSize: number): string {
  return `Based on ${observations(sampleSize)}. The more days you log, the more reliable a pattern is.`;
}

export interface AlignedPoint {
  day: string; // the habit day
  exposed: boolean;
  // The factor reading the server tested for this habit day (habit day + lag);
  // null when that reading was missing or imputed.
  value: number | null;
}

// The server already returns the series aligned at the tested lag: entry i of
// `factor` is the reading on habit day `days[i]` + lagDays (see the backend
// engine's sparkline()). Shifting it again here would apply the lag twice and
// drop the last `lagDays` points, so this only zips the parallel arrays.
export function alignSeries(series: PatternSeriesDTO): AlignedPoint[] {
  return series.days.map((day, i) => ({
    day,
    exposed: series.habit[i] === 1,
    value: series.factor[i] ?? null,
  }));
}

// "Log 'nothing today' on days you don't drink so patterns can be found -- 3 of 8 needed"
const HABIT_VERBS: Record<string, string> = {
  ALCOHOL: 'drink',
  CAFFEINE: 'have caffeine',
  WORKOUT: 'work out',
};

function habitVerb(habitType: string, label: string): string {
  return HABIT_VERBS[habitType] ?? `do ${label.toLowerCase()}`;
}

export function buildNotEnoughDataLine(item: NotEnoughDataDTO, label: string): string {
  const verb = habitVerb(item.habitType, label);
  if (item.unexposedDays < item.requiredEach) {
    const have = Math.min(item.unexposedDays, item.requiredEach);
    return `Log 'nothing today' on days you don't ${verb} so patterns can be found — ${have} of ${item.requiredEach} needed`;
  }
  const have = Math.min(item.exposedDays, item.requiredEach);
  return `Keep logging on days you ${verb} so patterns can be found — ${have} of ${item.requiredEach} needed`;
}
