import { sleepDebtZ } from '../../src/forecast/sleepLever';
import { scoreDay } from '../../src/scoring/pipeline';
import { makeData, TODAY } from './fixtures';

describe('sleepDebtZ', () => {
  const data = makeData();
  const hrv = [...data.factors.HRV.keys()].map((date) => ({ date, value: 55 }));
  const rhr = hrv.map((p) => ({ ...p, value: 58 }));

  it('matches the scoring pipeline for a real night of the same length', () => {
    const night = data.sleep.find((p) => p.date === TODAY)!;
    const oracle = scoreDay(
      { date: TODAY, hrv, rhr, sleep: data.sleep, steps: [], sleepGoalMinutes: 480 },
      data.cfg,
    ).factors.find((f) => f.factor === 'SLEEP_DEBT')!;
    const history = data.sleep.filter((p) => p.date !== TODAY);
    const z = sleepDebtZ(history, TODAY, night.value, 480, data.cfg);
    expect(z).toBeCloseTo((oracle.zRaw ?? oracle.z)!, 10);
  });

  it('ignores any sleep recorded on or after the target', () => {
    const polluted = [...data.sleep.filter((p) => p.date !== TODAY), { date: TODAY, value: 60 }, { date: '2026-07-01', value: 60 }];
    const clean = data.sleep.filter((p) => p.date < TODAY);
    expect(sleepDebtZ(polluted, TODAY, 480, 480, data.cfg)).toBe(sleepDebtZ(clean, TODAY, 480, 480, data.cfg));
  });

  it('more planned sleep never increases debt z', () => {
    const history = data.sleep.filter((p) => p.date < TODAY);
    expect(sleepDebtZ(history, TODAY, 600, 480, data.cfg)!).toBeLessThanOrEqual(sleepDebtZ(history, TODAY, 300, 480, data.cfg)!);
  });

  it('returns null on a cold-start history', () => {
    expect(sleepDebtZ([], TODAY, 480, 480, data.cfg)).toBeNull();
  });
});
