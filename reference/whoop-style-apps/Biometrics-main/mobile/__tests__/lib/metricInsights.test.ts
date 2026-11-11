import { buildDetailSentences, computeStats, type MetricRecord } from '../../src/lib/metricInsights';

function series(type: MetricRecord['metricType'], values: number[]): MetricRecord[] {
  return values.map((value, i) => ({ id: String(i), metricType: type, value, recordedAt: `2026-09-${10 + i}T00:00:00.000Z` }));
}

describe('buildDetailSentences', () => {
  it('lowercases a metric name mid-sentence', () => {
    const s = series('RESTING_HR', [55, 58]);
    expect(buildDetailSentences('RESTING_HR', s, computeStats(s)!)[1]).toBe(
      'Over the last 2 readings, resting heart rate ranged from 55 bpm to 58 bpm, averaging 57 bpm.',
    );
  });

  it('keeps an acronym in capitals', () => {
    const s = series('HRV', [40, 50]);
    expect(buildDetailSentences('HRV', s, computeStats(s)!)[1]).toBe(
      'Over the last 2 readings, HRV ranged from 40.0 ms to 50.0 ms, averaging 45.0 ms.',
    );
  });
});
