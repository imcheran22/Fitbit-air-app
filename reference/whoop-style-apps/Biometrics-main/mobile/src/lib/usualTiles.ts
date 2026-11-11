// Activity's "Against your usual · 30d" tiles (spec 2026-10-07 social §3): Resting HR, Sleep, HRV and Recovery.
// Same maths as the Metrics cards: the latest reading and the 30-day change (trendSummary + changeText). Recovery
// comes from the daily scores (at least 60 days, so the 30-day change has its earlier window), mapped to tile records here — it is not a MetricType.

import type { DailyScoreDTO } from '../api/scores';
import { METRIC_CONFIG } from '../theme';
import type { MetricRecord } from './metricInsights';
import { changeText, seriesFor, trendSummary } from './metricTrends';

export const TILE_METRICS = ['RESTING_HR', 'SLEEP', 'HRV', 'RECOVERY'] as const;
export type TileMetric = (typeof TILE_METRICS)[number];
export interface TileRecord { id: string; metricType: TileMetric; value: number; recordedAt: string }

export interface UsualTile {
  type: TileMetric;
  label: string;
  color: { light: string; dark: string };
  latest: string | null;
  /** The latest reading's civil date (Recovery opens that day's score). */
  latestDate: string | null;
  delta: string | null;
  /** The whole series, oldest first (what MetricDetail is opened with). */
  series: TileRecord[];
  /** Only the readings in the 30-day window, for the sparkline. */
  points: TileRecord[];
}

const DAYS = 30;
// Half-width tiles: the full "Resting Heart Rate" would truncate.
const SHORT_LABELS: Partial<Record<TileMetric, string>> = { RESTING_HR: 'Resting HR' };
const RECOVERY = { label: 'Recovery', format: (v: number) => String(Math.round(v)), color: { light: 'rgb(79, 70, 229)', dark: 'rgb(129, 140, 248)' } };

/** Recovery scores (newest first from the server) as tile records, oldest first; a null score is no reading. */
export function recoveryRecords(scores: DailyScoreDTO[]): TileRecord[] {
  return scores
    .filter((s): s is DailyScoreDTO & { score: number } => s.score !== null)
    .map((s) => ({ id: `RECOVERY-${s.date}`, metricType: 'RECOVERY' as const, value: s.score, recordedAt: `${s.date}T00:00:00.000Z` }))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export function usualTiles(records: MetricRecord[], recovery: TileRecord[], today: string): UsualTile[] {
  return TILE_METRICS.map((type) => {
    const config = type === 'RECOVERY' ? RECOVERY : METRIC_CONFIG[type];
    const series: TileRecord[] = type === 'RECOVERY' ? recovery : (seriesFor(records, type) as TileRecord[]);
    // trendSummary reads only recordedAt and value, so a Recovery record works as a MetricRecord here.
    const summary = trendSummary(series as unknown as MetricRecord[], today, DAYS);
    const last = summary ? summary.points[summary.points.length - 1]! : null;
    return {
      type,
      label: SHORT_LABELS[type] ?? config.label,
      color: config.color,
      latest: summary ? config.format(summary.latest) : null,
      latestDate: last ? last.recordedAt.slice(0, 10) : null,
      delta: summary ? changeText(summary.changePercent, DAYS) : null,
      series,
      points: summary ? (summary.points as unknown as TileRecord[]) : [],
    };
  });
}
