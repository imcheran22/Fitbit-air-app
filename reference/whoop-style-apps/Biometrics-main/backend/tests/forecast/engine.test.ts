import { buildForecast } from '../../src/forecast/engine';
import { dateRange, shiftDate } from '../../src/scoring/dates';
import { makeData, plant, TODAY } from './fixtures';

const ready = (r: ReturnType<typeof buildForecast>) => {
  if (r.status !== 'READY') throw new Error(`expected READY, got ${r.status}`);
  return r;
};

describe('buildForecast gates', () => {
  it('NO_HISTORY at 20 scored days, READY at 21', () => {
    expect(buildForecast(makeData({}, 20))).toEqual({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 20 });
    expect(buildForecast(makeData({}, 21)).status).toBe('READY');
  });

  it("LOW_CONFIDENCE_TODAY when today's score is LOW or missing", () => {
    const d = makeData();
    const low = new Map(d.scores);
    low.set(TODAY, { score: 40, confidence: 'LOW' });
    expect(buildForecast({ ...d, scores: low })).toMatchObject({ reason: 'LOW_CONFIDENCE_TODAY' });
    const missing = new Map(d.scores);
    missing.delete(TODAY);
    expect(buildForecast({ ...d, scores: missing })).toMatchObject({ reason: 'LOW_CONFIDENCE_TODAY' });
  });
});

describe('buildForecast READY', () => {
  const data = plant(makeData(), 'ALCOHOL', 'HRV', -1.5);
  const r = ready(buildForecast(data));

  it('targets tomorrow with the live algorithm version', () => {
    expect(r.date).toBe(shiftDate(TODAY, 1));
    expect(r.algorithmVersion).toBe(data.cfg.version);
  });

  it('has 13 sleep steps x 2^k habit subsets', () => {
    expect(r.grid).toHaveLength(13 * 2);
    expect(new Set(r.grid.map((c) => c.sleepHours))).toEqual(new Set([4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]));
  });

  it('labels levers CONFIRMED / NONE_YET and puts SLEEP first', () => {
    expect(r.levers.map((l) => [l.key, l.effect])).toEqual([
      ['SLEEP', 'CONFIRMED'],
      ['ALCOHOL', 'CONFIRMED'],
      ['CAFFEINE', 'NONE_YET'],
      ['WORKOUT', 'NONE_YET'],
    ]);
    expect(r.levers[1]).toMatchObject({ threshold: 2, min: 0, max: 6, step: 1, unit: 'drinks' });
  });

  it('exposed cells score lower, and every cell is finite with its band around the score', () => {
    const at = (exposed: string[]) => r.grid.find((c) => c.sleepHours === 7.5 && c.exposed.join() === exposed.join())!;
    expect(at(['ALCOHOL']).score).toBeLessThan(at([]).score);
    for (const c of r.grid) {
      expect(Number.isFinite(c.score)).toBe(true);
      expect(c.band[0]).toBeLessThanOrEqual(c.score);
      expect(c.band[1]).toBeGreaterThanOrEqual(c.score);
    }
  });

  it('reports a 30-day track record', () => {
    expect(r.trackRecord.days).toBe(30);
    expect(r.trackRecord.series).toHaveLength(30);
    expect(r.trackRecord.hits).toBeGreaterThanOrEqual(15);
  });

  it("defaults to the 14-night median sleep (rounded to 0.5 h) and today's habit totals", () => {
    const d = { ...data, todayHabitTotals: { ALCOHOL: 3 } };
    const nights = d.sleep.filter((p) => p.date > shiftDate(TODAY, -14)).map((p) => p.value).sort((a, b) => a - b);
    const med = (nights[6]! + nights[7]!) / 2 / 60;
    const res = ready(buildForecast(d));
    expect(res.defaults.sleepHours).toBe(Math.round(med * 2) / 2);
    expect(res.defaults.habits).toEqual({ ALCOHOL: 3, CAFFEINE: 0, WORKOUT: 0 });
  });

  // Review Focus 4
  it('defaults to 7.5 h when no night was recorded in the last 14 days', () => {
    const d = { ...data, sleep: data.sleep.filter((p) => p.date <= shiftDate(TODAY, -14)) };
    const res = buildForecast(d);
    expect(res.status).toBe('READY');
    expect(ready(res).defaults.sleepHours).toBe(7.5);
  });

  // Review Focus 3
  it('a CONFIRMED habit with no computable pairs is NONE_YET and adds no grid dimension', () => {
    const d = { ...data, confirmed: [...data.confirmed, { habitType: 'CAFFEINE', factor: 'RHR' as const }] };
    const res = ready(buildForecast(d));
    expect(res.levers.find((l) => l.key === 'CAFFEINE')!.effect).toBe('NONE_YET');
    expect(res.grid).toHaveLength(26);
  });

  it('caps the grid at 4 habits and marks the rest NOT_MODELLED', () => {
    let d = makeData({
      habitTypes: ['A', 'B', 'C', 'D', 'E'].map((t) => ({ type: t, label: t, unit: 'x', exposureThreshold: 1, builtIn: false })),
    });
    const deltas = { A: -0.2, B: -0.4, C: -0.6, D: -0.8, E: -1.0 };
    for (const [h, delta] of Object.entries(deltas)) d = plant(d, h, 'HRV', delta, 3);
    const res = ready(buildForecast(d));
    expect(res.grid).toHaveLength(13 * 16);
    expect(res.levers.filter((l) => l.effect === 'NOT_MODELLED').map((l) => l.key)).toHaveLength(1);
  });

  it('only scored days count toward history', () => {
    const d = makeData({}, 30);
    const scores = new Map(d.scores);
    for (const date of dateRange(shiftDate(TODAY, -29), shiftDate(TODAY, -20))) scores.set(date, { score: null, confidence: 'LOW' });
    expect(buildForecast({ ...d, scores })).toMatchObject({ reason: 'NO_HISTORY', daysOfHistory: 20 });
  });
});
