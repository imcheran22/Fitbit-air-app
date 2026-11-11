import { generateDemoHistory } from '../../src/demo/generate';

const h = generateDemoHistory({ seed: 42, endDate: '2026-06-30', days: 90 });

describe('generateDemoHistory', () => {
  it('is deterministic for a seed', () => {
    expect(generateDemoHistory({ seed: 42, endDate: '2026-06-30', days: 90 })).toEqual(h);
  });

  it('has one value per day for every metric, ending on endDate', () => {
    for (const s of [h.hrv, h.rhr, h.steps, h.sleep]) {
      expect(s).toHaveLength(90);
      expect(s.at(-1)!.date).toBe('2026-06-30');
    }
    expect(h.sessions).toHaveLength(90);
    expect(h.checkInDays).toHaveLength(90);
  });

  it('plants the alcohol effect on next-day HRV and RHR', () => {
    const drinkDays = new Set(h.habitLogs.filter((l) => l.habitType === 'ALCOHOL' && l.value >= 2).map((l) => l.habitDay));
    const after = (s: { date: string; value: number }[], exposed: boolean) => {
      const vals = s.slice(1).filter((p, i) => drinkDays.has(s[i]!.date) === exposed).map((p) => p.value);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    expect(drinkDays.size).toBeGreaterThanOrEqual(15);
    expect(after(h.hrv, true)).toBeLessThan(after(h.hrv, false) - 5);
    expect(after(h.rhr, true)).toBeGreaterThan(after(h.rhr, false) + 3);
  });

  it('keeps values physiologically plausible', () => {
    expect(h.hrv.every((p) => p.value > 20 && p.value < 120)).toBe(true);
    expect(h.rhr.every((p) => p.value > 40 && p.value < 80)).toBe(true);
    expect(h.sleep.every((p) => p.value > 180 && p.value < 660)).toBe(true);
  });
});
