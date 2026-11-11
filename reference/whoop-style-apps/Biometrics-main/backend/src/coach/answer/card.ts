// The answer card (spec 2026-09-30, sections 1.3 and 2.3). The model only
// names fact ids and short labels; the server fills every displayed value from
// the fact sheet (resolveCard in validate.ts), so a card can never show a
// number the user does not have.

import { Fact, comparisonDiff, formatDiffSize, hasComparison } from './facts';

export type CardStatus = 'below' | 'near' | 'above';

export interface CardItem {
  factId: string;
  label: string;
  display: string;
  value: number;
  usual?: number;
  status?: CardStatus;
  /** The difference from usual, signed with a real minus: "−25m", "+4 bpm", "−12 points", "+8%". */
  deltaDisplay?: string;
}

export interface AnswerCard {
  headline: string;
  tiles?: CardItem[];
  ranked?: CardItem[];
  tip?: string;
  source: string;
}

/** Within this fraction of the usual, either side, a value reads as "near" usual. */
export const NEAR_BAND = 0.1;

/**
 * ±10% of usual = near; otherwise below/above, inverted when lower is better (resting HR).
 * Counts (steps) get no status, matching the fact sheet, which renders no
 * comparison for them: today's count builds up through the day, so a morning
 * total would always read as below usual.
 */
export function statusOf(fact: Fact): CardStatus | undefined {
  if (!hasComparison(fact) || fact.usual === 0) return undefined;
  const ratio = (fact.value - fact.usual) / Math.abs(fact.usual);
  if (Math.abs(ratio) <= NEAR_BAND + 1e-9) return 'near';
  const higher = ratio > 0;
  return higher !== Boolean(fact.lowerIsBetter) ? 'above' : 'below';
}

/** The minus sign the card writes (U+2212), as in the design; the validator ignores signs. */
export const MINUS = '−';

/**
 * A tile's difference from usual: the sheet's own comparison number
 * (comparisonDiff, sized as the sheet writes it), signed by direction:
 * "−25m", "+4 bpm", "−12 points", "+8%". Undefined wherever statusOf is
 * (no usual, a usual of 0, a step count), and for no difference at all, where
 * the app's "on par" reads better than "0".
 */
export function deltaDisplayOf(fact: Fact): string | undefined {
  if (statusOf(fact) === undefined) return undefined;
  const diff = comparisonDiff(fact);
  if (diff === undefined || diff === 0) return undefined;
  const size = formatDiffSize(fact.unit, diff);
  const text = fact.unit === 'score' ? `${size} ${Math.abs(diff) === 1 ? 'point' : 'points'}` : size;
  return `${diff < 0 ? MINUS : '+'}${text}`;
}
