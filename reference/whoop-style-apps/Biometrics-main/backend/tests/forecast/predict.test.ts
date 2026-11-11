import { fitModel, predictDay } from '../../src/forecast/predict';
import { shiftDate } from '../../src/scoring/dates';
import { makeData, plant, TODAY } from './fixtures';

const TARGET = shiftDate(TODAY, 1);
const sum = (xs: { points: number }[]) => xs.reduce((s, c) => s + c.points, 0);

describe('predictDay', () => {
  const data = plant(makeData(), 'ALCOHOL', 'HRV', -1.5);
  const model = fitModel(data, TODAY, ['ALCOHOL']);

  it('contributions sum exactly to score - 50', () => {
    for (const exposed of [new Set<string>(), new Set(['ALCOHOL'])]) {
      for (const sleepMinutes of [240, 480, 600]) {
        const p = predictDay(data, model, TARGET, { sleepMinutes, exposed })!;
        expect(sum(p.contributions)).toBeCloseTo(p.score - 50, 8);
      }
    }
  });

  it('a CONFIRMED negative HRV effect lowers the score when exposed', () => {
    const off = predictDay(data, model, TARGET, { sleepMinutes: 480, exposed: new Set() })!;
    const on = predictDay(data, model, TARGET, { sleepMinutes: 480, exposed: new Set(['ALCOHOL']) })!;
    expect(model.effects.get('ALCOHOL')!.HRV!).toBeLessThan(-1);
    expect(on.score).toBeLessThan(off.score);
    expect(on.contributions.map((c) => c.key)).toEqual(['CARRY_OVER', 'SLEEP', 'ALCOHOL']);
    expect(off.contributions.map((c) => c.key)).toEqual(['CARRY_OVER', 'SLEEP']);
  });

  it('a habit with no CONFIRMED row has no effect even if exposed', () => {
    const m = fitModel(data, TODAY, ['ALCOHOL', 'CAFFEINE']);
    const a = predictDay(data, m, TARGET, { sleepMinutes: 480, exposed: new Set(['ALCOHOL']) })!;
    const b = predictDay(data, m, TARGET, { sleepMinutes: 480, exposed: new Set(['ALCOHOL', 'CAFFEINE']) })!;
    expect(b.score).toBe(a.score);
  });

  it('more sleep never lowers the forecast', () => {
    const short = predictDay(data, model, TARGET, { sleepMinutes: 300, exposed: new Set() })!;
    const long = predictDay(data, model, TARGET, { sleepMinutes: 570, exposed: new Set() })!;
    expect(long.score).toBeGreaterThanOrEqual(short.score);
  });

  // Review Focus 2
  it("still forecasts when today's HRV is missing, with no NaN", () => {
    const hrv = new Map(data.factors.HRV);
    hrv.set(TODAY, { z: null, imputed: false, pct: null });
    const d = { ...data, factors: { ...data.factors, HRV: hrv } };
    const p = predictDay(d, fitModel(d, TODAY, ['ALCOHOL']), TARGET, { sleepMinutes: 480, exposed: new Set(['ALCOHOL']) })!;
    expect(Number.isFinite(p.score)).toBe(true);
    expect(sum(p.contributions)).toBeCloseTo(p.score - 50, 8);
  });

  it('returns null when every factor is excluded', () => {
    const empty = new Map();
    const d = { ...data, sleep: [], factors: { HRV: empty, RHR: empty } };
    expect(predictDay(d, fitModel(d, TODAY, []), TARGET, { sleepMinutes: 480, exposed: new Set() })).toBeNull();
  });
});
