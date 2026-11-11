import { rollingBacktest } from '../../src/forecast/backtest';
import { bandFor, errorSummary, quantile } from '../../src/forecast/band';
import { shiftDate } from '../../src/scoring/dates';
import { makeData, plant, TODAY } from './fixtures';

describe('rollingBacktest', () => {
  const data = plant(makeData(), 'ALCOHOL', 'HRV', -1.5);

  it('produces one point per scored day in the last 30 days', () => {
    const pts = rollingBacktest(data, ['ALCOHOL']);
    expect(pts).toHaveLength(30);
    expect(pts[0]!.date).toBe(shiftDate(TODAY, -29));
    expect(pts.at(-1)!.date).toBe(TODAY);
  });

  it('skips days without an actual score', () => {
    const scores = new Map(data.scores);
    scores.set(TODAY, { score: null, confidence: 'LOW' });
    expect(rollingBacktest({ ...data, scores }, ['ALCOHOL'])).toHaveLength(29);
  });

  it('never uses data dated on or after the forecast day (leakage)', () => {
    const D = shiftDate(TODAY, -10);
    const poison = (m: Map<string, { z: number | null; imputed: boolean; pct: number | null }>) =>
      new Map([...m].map(([d, v]) => [d, d >= D ? { ...v, z: 9 } : v]));
    const leaked = {
      ...data,
      factors: { HRV: poison(data.factors.HRV as never), RHR: poison(data.factors.RHR as never) },
      sleep: data.sleep.map((p) => (p.date > D ? { ...p, value: 30 } : p)),
      observations: new Map(
        [...data.observations].map(([h, obs]) => [h, obs.map((o) => (o.day >= D ? { ...o, exposed: !o.exposed } : o))]),
      ),
    };
    const at = (pts: { date: string; forecast: number }[]) => pts.find((p) => p.date === D)!.forecast;
    expect(at(rollingBacktest(leaked, ['ALCOHOL']))).toBe(at(rollingBacktest(data, ['ALCOHOL'])));
  });
});

describe('band', () => {
  it('quantile interpolates linearly', () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4, 10);
  });

  it('uses P10/P90 of errors with >= 10 pairs, clamped to [0, 100]', () => {
    const errors = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
    const [lo, hi] = bandFor(60, errors);
    expect(lo).toBeCloseTo(60 + quantile([...errors].sort((a, b) => a - b), 0.1), 10);
    expect(hi).toBeCloseTo(60 + quantile([...errors].sort((a, b) => a - b), 0.9), 10);
    expect(bandFor(99, errors)[1]).toBe(100);
  });

  it('falls back to +/- 1.5 MAD-sigma below 10 pairs and +/- 10 below 3', () => {
    const [lo, hi] = bandFor(50, [-2, 0, 2, 4]);
    // median 1; |e - 1| = 3,1,1,3 -> MAD 2 -> sigma 2.9652 -> half-width 4.4478
    expect(hi - 50).toBeCloseTo(1.5 * 2 * 1.4826, 6);
    expect(50 - lo).toBeCloseTo(1.5 * 2 * 1.4826, 6);
    expect(bandFor(50, [1])).toEqual([40, 60]);
  });

  it('summarises the track record with the rounded-up median |error|', () => {
    const pts = [1, -2, 3, -4, 10].map((e, i) => ({ date: `d${i}`, forecast: 50, actual: 50 + e }));
    expect(errorSummary(pts)).toEqual({ withinPoints: 3, hits: 3, days: 5 });
    expect(errorSummary([])).toEqual({ withinPoints: 0, hits: 0, days: 0 });
  });
});
