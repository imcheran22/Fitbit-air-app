import type { BaselineDTO, ColdStartDTO, DailyScoreDTO, FactorDTO, ScoreBandsDTO } from '../api/scores';

export const SCORE_FRAMING = 'This is a comparison against your own recent readings, not a medical assessment.';
// Sleep duration is scored against the user's sleep goal rather than their own
// average, so the Sleep Score can't use the "own recent readings" wording.
export const SLEEP_SCORE_FRAMING =
  'This reflects how your recent nights compare with your goals and your own patterns, not a medical assessment.';

function scoreFraming(type: DailyScoreDTO['type']): string {
  return type === 'SLEEP' ? SLEEP_SCORE_FRAMING : SCORE_FRAMING;
}

// Below this many points a factor is treated as "not moving the score".
const NEGLIGIBLE_POINTS = 0.5;

export type ScoreBand = 'scoreExcellent' | 'scoreGood' | 'scoreFair' | 'scorePoor';

// The server config is authoritative for the band thresholds (every score
// response carries `bands`). These only cover an older server that doesn't
// send them, and the moment before the first response has loaded.
export const DEFAULT_SCORE_BANDS: ScoreBandsDTO = { excellent: 75, good: 55, fair: 40 };

function isValidBands(bands: unknown): bands is ScoreBandsDTO {
  if (typeof bands !== 'object' || bands === null) return false;
  const { excellent, good, fair } = bands as Record<string, unknown>;
  return (
    typeof excellent === 'number' &&
    typeof good === 'number' &&
    typeof fair === 'number' &&
    Number.isFinite(excellent) &&
    Number.isFinite(good) &&
    Number.isFinite(fair) &&
    excellent <= 100 &&
    fair >= 0 &&
    excellent > good &&
    good > fair
  );
}

// Bands are relative to the model's calibration (an all-normal day lands at
// 50, two favourable standard deviations near 90), not an absolute clinical
// scale. Each threshold is the inclusive lower bound of its band. Malformed
// `bands` (missing, non-numeric, not strictly descending within 0-100) are
// ignored in favour of the defaults.
export function scoreBand(score: number, bands?: ScoreBandsDTO | null): ScoreBand {
  const { excellent, good, fair } = isValidBands(bands) ? bands : DEFAULT_SCORE_BANDS;
  if (score >= excellent) return 'scoreExcellent';
  if (score >= good) return 'scoreGood';
  if (score >= fair) return 'scoreFair';
  return 'scorePoor';
}

const SCORE_TYPE_LABEL: Record<DailyScoreDTO['type'], string> = {
  RECOVERY: 'Recovery Score',
  SLEEP: 'Sleep Score',
};

export function scoreTypeLabel(type: DailyScoreDTO['type']): string {
  return SCORE_TYPE_LABEL[type];
}

const METRIC_NAMES: Record<string, string> = {
  HRV: 'HRV',
  RESTING_HR: 'resting heart rate',
  RHR: 'resting heart rate',
  SLEEP: 'sleep',
  SLEEP_DEBT: 'sleep debt',
  SLEEP_EFFICIENCY: 'sleep efficiency',
  CIRCADIAN_CONSISTENCY: 'bedtime consistency',
  STEPS: 'steps',
};

export function metricName(metric: string): string {
  return METRIC_NAMES[metric] ?? metric.toLowerCase().replace(/_/g, ' ');
}

export function formatPoints(points: number): string {
  const rounded = Math.round(Math.abs(points) * 10) / 10;
  if (rounded === 0) return '0.0 pts';
  return `${points > 0 ? '+' : '−'}${rounded.toFixed(1)} pts`;
}

export function sortFactorsByImpact(factors: FactorDTO[]): FactorDTO[] {
  return factors
    .map((factor, index) => ({ factor, index }))
    .sort((a, b) => {
      if (a.factor.excluded !== b.factor.excluded) return a.factor.excluded ? 1 : -1;
      return Math.abs(b.factor.points) - Math.abs(a.factor.points) || a.index - b.index;
    })
    .map((entry) => entry.factor);
}

// A score needs just one factor to be ready, so the metric closest to its
// required history is the one whose progress is worth showing.
export function pickColdStartProgress(coldStart: ColdStartDTO[]): ColdStartDTO | null {
  let best: ColdStartDTO | null = null;
  for (const entry of coldStart) {
    if (!best || entry.daysCollected > best.daysCollected) best = entry;
  }
  return best;
}

// Every sentence is derived from the fetched score -- no model call, no
// fabricated numbers (only the score and factor points the server returned).
// Same house style as metricInsights.ts, and always carries the same
// "not a medical assessment" framing.
export function buildScoreHeadline(score: DailyScoreDTO): string {
  const typeLabel = scoreTypeLabel(score.type);
  const isSleep = score.type === 'SLEEP';
  const framing = scoreFraming(score.type);
  const active = score.factors.filter((f) => !f.excluded);

  if (score.score === null || active.length === 0) {
    const cold = pickColdStartProgress(score.coldStart);
    const need = isSleep ? 'to build your baseline' : 'to compare you against your own baseline';
    const detail = cold
      ? `: you have ${cold.daysCollected} of ${cold.daysRequired} days of ${metricName(cold.metric)} so far, and we need all ${cold.daysRequired} ${need}.`
      : '.';
    return `Your ${typeLabel} isn’t ready yet${detail} ${framing}`;
  }

  const sentences: string[] = [`Your ${typeLabel} is ${Math.round(score.score)}.`];

  const top = [...active]
    .map((factor, index) => ({ factor, index }))
    .sort(
      (a, b) =>
        Math.abs(b.factor.points) - Math.abs(a.factor.points) || b.factor.weight - a.factor.weight || a.index - b.index,
    )[0].factor;

  if (Math.abs(top.points) < NEGLIGIBLE_POINTS) {
    sentences.push(
      isSleep
        ? `No single factor stands out in your ${typeLabel} today.`
        : 'That’s right around your own baseline — no single factor stands out today.',
    );
  } else {
    const role = top.points > 0 ? 'lift' : 'drag';
    sentences.push(`${top.label} is the biggest ${role} on your ${typeLabel} today (${formatPoints(top.points)}).`);
  }

  // Duration is scored against the goal, not the person's own average.
  const duration = active.find((f) => f.factor === 'SLEEP_DURATION');
  if (duration) {
    const outcome =
      duration.points <= -NEGLIGIBLE_POINTS
        ? 'you came in under it'
        : duration.points >= NEGLIGIBLE_POINTS
          ? 'you met it'
          : 'you were right around it';
    sentences.push(`${duration.label} is measured against your sleep goal, and ${outcome}.`);
  }

  for (const f of active) {
    if (f.imputed) {
      sentences.push(`${f.label} wasn’t recorded that day, so it’s estimated from your baseline.`);
    }
  }

  const excluded = score.factors.filter((f) => f.excluded);
  if (excluded.length > 0) {
    const names = excluded.map((f) => f.label).join(' and ');
    sentences.push(
      isSleep
        ? `${names} ${excluded.length > 1 ? 'need' : 'needs'} a few more nights before it counts, so today’s score relies on the other factors.`
        : `Still building a baseline for ${names}, so today’s score relies on the other factors.`,
    );
  }

  sentences.push(framing);
  return sentences.join(' ');
}

// The one-line verdict under the Home hero ring: which factor moved today's
// score most, in plain words. Same factor ranking as buildScoreHeadline, but
// short -- the full explanation (and the framing) lives on Score detail.
// Null when there is no score to explain yet.
export function buildScoreVerdict(score: DailyScoreDTO): string | null {
  const active = score.factors.filter((f) => !f.excluded);
  if (score.score === null || active.length === 0) return null;

  const top = active
    .map((factor, index) => ({ factor, index }))
    .sort(
      (a, b) =>
        Math.abs(b.factor.points) - Math.abs(a.factor.points) || b.factor.weight - a.factor.weight || a.index - b.index,
    )[0].factor;

  if (Math.abs(top.points) < NEGLIGIBLE_POINTS) return 'Right around your own baseline today.';
  return top.points > 0 ? `${top.label} is lifting it today.` : `${top.label} is holding it back today.`;
}

function formatBaselineValue(value: number): string {
  return String(Math.round(value * 10) / 10);
}

// '%' attaches to the number ("91.2%"); every other unit is spaced ("42 ms", "78 pts").
function formatWithUnit(value: number, unit: string): string {
  const n = formatBaselineValue(value);
  return unit === '%' ? `${n}%` : `${n} ${unit}`;
}

export function buildBaselineSentence(baseline: BaselineDTO): string {
  const value = formatWithUnit(baseline.ewma, baseline.unit);
  const spread = formatWithUnit(baseline.spread, baseline.unit);
  const basis =
    baseline.daysOfHistory < baseline.windowDays
      ? `based on the ${baseline.daysOfHistory} days of data so far`
      : `based on your last ${baseline.windowDays} days`;
  return `Your ${metricName(baseline.metric)} baseline: ${value} ± ${spread}, ${basis}.`;
}
