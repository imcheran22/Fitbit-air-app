import { changeText, inWindow, rangeDays, seriesFor, trendSummary } from '../../src/lib/metricTrends';
import type { MetricRecord } from '../../src/lib/metricInsights';

const rec = (id: string, metricType: MetricRecord['metricType'], date: string, value: number): MetricRecord => ({
  id,
  metricType,
  value,
  recordedAt: `${date}T00:00:00.000Z`,
});

describe('seriesFor', () => {
  it('keeps one metric, oldest first', () => {
    const records = [rec('3', 'STEPS', '2026-09-03', 3), rec('1', 'HRV', '2026-09-01', 40), rec('2', 'STEPS', '2026-09-01', 1)];
    expect(seriesFor(records, 'STEPS').map((r) => r.id)).toEqual(['2', '3']);
  });
});

describe('inWindow', () => {
  const series = ['2026-09-14', '2026-09-15', '2026-09-21', '2026-09-22'].map((d, i) => rec(String(i), 'STEPS', d, i));

  it('keeps the N days ending today, inclusive', () => {
    expect(inWindow(series, '2026-09-22', 7).map((r) => r.recordedAt.slice(0, 10))).toEqual(['2026-09-21', '2026-09-22']);
  });

  it('can look at the window just before', () => {
    expect(inWindow(series, '2026-09-22', 7, 7).map((r) => r.recordedAt.slice(0, 10))).toEqual(['2026-09-14', '2026-09-15']);
  });
});

describe('trendSummary', () => {
  it('summarises the window and compares it with the one before', () => {
    const series = [
      rec('a', 'STEPS', '2026-09-10', 8000),
      rec('b', 'STEPS', '2026-09-12', 8000),
      rec('c', 'STEPS', '2026-09-18', 9000),
      rec('d', 'STEPS', '2026-09-22', 11000),
    ];

    const summary = trendSummary(series, '2026-09-22', 7)!;

    expect(summary.points.map((p) => p.id)).toEqual(['c', 'd']);
    expect(summary.latest).toBe(11000);
    expect(summary.average).toBe(10000);
    expect(summary.min).toBe(9000);
    expect(summary.max).toBe(11000);
    expect(summary.changePercent).toBe(25);
  });

  it('has no comparison when the earlier window is empty, and nothing at all for an empty window', () => {
    const series = [rec('a', 'HRV', '2026-09-22', 40)];
    expect(trendSummary(series, '2026-09-22', 7)?.changePercent).toBeNull();
    expect(trendSummary(series, '2026-10-30', 7)).toBeNull();
  });
});

describe('changeText', () => {
  it('describes the change neutrally', () => {
    expect(changeText(25, 7)).toBe('Up 25% vs the previous 7 days');
    expect(changeText(-8.4, 30)).toBe('Down 8% vs the previous 30 days');
    expect(changeText(0.2, 7)).toBe('Level with the previous 7 days');
    expect(changeText(null, 90)).toBe('No readings from the 90 days before');
  });
});

describe('rangeDays', () => {
  it('maps each range to its length', () => {
    expect(rangeDays('7d')).toBe(7);
    expect(rangeDays('30d')).toBe(30);
    expect(rangeDays('90d')).toBe(90);
  });
});
