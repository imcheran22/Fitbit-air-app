import type { MetricType } from '../theme';
import type { MetricRecord } from './metricInsights';
import { addDays } from './heatmap';

export type TrendRange = '7d' | '30d' | '90d';

export const TREND_RANGES: { value: TrendRange; label: string; days: number }[] = [
  { value: '7d', label: '7D', days: 7 },
  { value: '30d', label: '30D', days: 30 },
  { value: '90d', label: '90D', days: 90 },
];

export function rangeDays(range: TrendRange): number {
  return TREND_RANGES.find((r) => r.value === range)?.days ?? 7;
}

// Every metric's recordedAt is UTC midnight of its civil date, so the date is
// the ISO prefix -- no timezone conversion (which could shift it a day).
function civilDateOf(record: MetricRecord): string {
  return record.recordedAt.slice(0, 10);
}

/** One metric's records, oldest first. */
export function seriesFor(records: MetricRecord[], type: MetricType): MetricRecord[] {
  return records
    .filter((r) => r.metricType === type)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));
}

/** Records whose civil date falls in the `days` days ending today, inclusive. */
export function inWindow(series: MetricRecord[], today: string, days: number, offsetDays = 0): MetricRecord[] {
  const end = addDays(today, -offsetDays);
  const start = addDays(end, -(days - 1));
  return series.filter((r) => {
    const date = civilDateOf(r);
    return date >= start && date <= end;
  });
}

export interface TrendSummary {
  points: MetricRecord[];
  latest: number;
  average: number;
  min: number;
  max: number;
  // Percent change of this window's average against the window of the same
  // length just before it; null when that earlier window has no readings.
  changePercent: number | null;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** Null when the window has no readings for this metric. */
export function trendSummary(series: MetricRecord[], today: string, days: number): TrendSummary | null {
  const points = inWindow(series, today, days);
  if (points.length === 0) return null;
  const values = points.map((p) => p.value);
  const average = mean(values);
  const previous = inWindow(series, today, days, days);
  const previousAverage = previous.length > 0 ? mean(previous.map((p) => p.value)) : null;
  return {
    points,
    latest: values[values.length - 1],
    average,
    min: Math.min(...values),
    max: Math.max(...values),
    changePercent: previousAverage === null || previousAverage === 0 ? null : ((average - previousAverage) / previousAverage) * 100,
  };
}

/**
 * "Up 6% vs the previous 7 days". Deliberately neutral wording: whether a
 * change is good depends on the metric (a falling resting heart rate usually
 * is), and this screen describes rather than judges.
 */
export function changeText(changePercent: number | null, days: number): string {
  if (changePercent === null) return `No readings from the ${days} days before`;
  const rounded = Math.round(changePercent);
  if (rounded === 0) return `Level with the previous ${days} days`;
  return `${rounded > 0 ? 'Up' : 'Down'} ${Math.abs(rounded)}% vs the previous ${days} days`;
}
