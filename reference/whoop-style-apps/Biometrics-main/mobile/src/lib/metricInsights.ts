import { METRIC_CONFIG, type MetricType } from '../theme';

export interface MetricRecord {
  id: string;
  metricType: MetricType;
  value: number;
  recordedAt: string;
}

export interface MetricStats {
  latest: number;
  average: number;
  min: number;
  max: number;
  // Absolute percent difference between latest and the average of every
  // OTHER reading in the series -- never counts today's own value in its
  // own baseline.
  trendPercent: number;
  direction: 'above' | 'below' | 'steady';
}

const STEADY_THRESHOLD_PERCENT = 3;

export function computeStats(series: MetricRecord[]): MetricStats | null {
  if (series.length === 0) return null;

  const values = series.map((r) => r.value);
  const latest = values[values.length - 1];
  const previous = values.slice(0, -1);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const baseline = previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : average;
  const pctDiff = baseline === 0 ? 0 : ((latest - baseline) / baseline) * 100;

  return {
    latest,
    average,
    min: Math.min(...values),
    max: Math.max(...values),
    trendPercent: Math.abs(pctDiff),
    direction: Math.abs(pctDiff) < STEADY_THRESHOLD_PERCENT ? 'steady' : pctDiff > 0 ? 'above' : 'below',
  };
}

export function buildHeadline(type: MetricType, stats: MetricStats): string {
  const label = METRIC_CONFIG[type].label;
  if (stats.direction === 'steady') return `${label} is steady with your recent average.`;
  return `${label} is ${Math.round(stats.trendPercent)}% ${stats.direction} your recent average.`;
}

// Every sentence here is derived directly from the fetched records -- no
// external model call, no fabricated score. Framed descriptively, not as
// prescriptive advice.
export function buildDetailSentences(type: MetricType, series: MetricRecord[], stats: MetricStats): string[] {
  const config = METRIC_CONFIG[type];
  const sentences: string[] = [buildHeadline(type, stats)];

  const count = series.length;
  // Lowercase mid-sentence ("resting heart rate"), but never an acronym ("HRV").
  const name = config.label === config.label.toUpperCase() ? config.label : config.label.toLowerCase();
  sentences.push(
    `Over the last ${count} reading${count === 1 ? '' : 's'}, ${name} ranged from ${config.format(
      stats.min,
    )} to ${config.format(stats.max)}, averaging ${config.format(stats.average)}.`,
  );

  if (config.goal) {
    const pctOfGoal = Math.round((stats.latest / config.goal) * 100);
    sentences.push(`Today's reading is ${pctOfGoal}% of your ${config.goalLabel}.`);
  }

  if (type === 'RESTING_HR' || type === 'HRV') {
    sentences.push('This is a comparison against your own recent readings, not a medical assessment.');
  }

  return sentences;
}
