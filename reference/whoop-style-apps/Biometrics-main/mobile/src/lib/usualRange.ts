import { addDays } from './heatmap';
import type { MetricRecord } from './metricInsights';

// "Usual" is the middle 80% of this person's own readings over the last 30
// days -- a band drawn from their data, never a population norm or a target.
// Below MIN_READINGS there is too little to call anything usual, so no band.
export const USUAL_RANGE_DAYS = 30;
export const USUAL_RANGE_MIN_READINGS = 7;
const USUAL_LOW_Q = 0.1;
const USUAL_HIGH_Q = 0.9;

export interface UsualRange {
  low: number;
  high: number;
  readings: number;
}

export type RangePosition = 'above' | 'within' | 'below';

// Linear interpolation between closest ranks (the common "type 7" quantile).
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** The usual range from readings in the USUAL_RANGE_DAYS days ending `asOf` (YYYY-MM-DD), inclusive. */
export function usualRange(series: MetricRecord[], asOf: string): UsualRange | null {
  const start = addDays(asOf, -(USUAL_RANGE_DAYS - 1));
  const values = series
    .filter((r) => {
      const date = r.recordedAt.slice(0, 10);
      return date >= start && date <= asOf;
    })
    .map((r) => r.value)
    .sort((a, b) => a - b);
  if (values.length < USUAL_RANGE_MIN_READINGS) return null;
  // The middle 80%, not the middle half: a band that half of all readings fall
  // outside by definition would light up every other day as unusual.
  return { low: quantile(values, USUAL_LOW_Q), high: quantile(values, USUAL_HIGH_Q), readings: values.length };
}

export function rangePosition(value: number, range: UsualRange): RangePosition {
  if (value > range.high) return 'above';
  if (value < range.low) return 'below';
  return 'within';
}

// "48–60 ms" rather than "48.0 ms – 60.0 ms": when both ends share a trailing
// unit word, it is written once. Otherwise both ends are written in full.
export function formatRange(low: number, high: number, format: (v: number) => string): string {
  const a = format(low);
  const b = format(high);
  const unitA = a.includes(' ') ? a.slice(a.lastIndexOf(' ') + 1) : '';
  const unitB = b.includes(' ') ? b.slice(b.lastIndexOf(' ') + 1) : '';
  if (unitA && unitA === unitB && /^[a-z]+$/i.test(unitA)) {
    return `${a.slice(0, a.lastIndexOf(' '))}–${b}`;
  }
  return `${a}–${b}`;
}

/** "Above your usual range of 48–60 ms" -- a description, not a verdict. */
export function rangeSentence(value: number, range: UsualRange, format: (v: number) => string): string {
  const span = formatRange(range.low, range.high, format);
  const position = rangePosition(value, range);
  if (position === 'within') return `Within your usual range of ${span}`;
  return `${position === 'above' ? 'Above' : 'Below'} your usual range of ${span}`;
}

/** Copy for when there are not yet enough readings to draw a band. */
export function rangePendingText(readings: number): string {
  const needed = Math.max(0, USUAL_RANGE_MIN_READINGS - readings);
  return `Your usual range appears after ${needed} more ${needed === 1 ? 'reading' : 'readings'}`;
}
