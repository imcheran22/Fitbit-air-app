import { computeBaseline, ewma, median, mad, zScore, sleepDurationZVsGoal } from '../../src/scoring/baseline';
import type { Baseline } from '../../src/scoring/types';
import { v1Config } from '../../src/scoring/configs/v1';
import { series } from './helpers';

const cfg = v1Config;

describe('Stage 3: EWMA', () => {
  it('seeds with the first value', () => {
    expect(ewma([42], 30)).toBe(42);
  });

  it('applies EWMA_t = a*x_t + (1-a)*EWMA_{t-1} with a = 2/(N+1)', () => {
    const a = 2 / 31;
    expect(ewma([10, 20], 30)).toBeCloseTo(a * 20 + (1 - a) * 10, 12);
    const step2 = a * 20 + (1 - a) * 10;
    expect(ewma([10, 20, 30], 30)).toBeCloseTo(a * 30 + (1 - a) * step2, 12);
  });

  it('is constant on a constant series', () => {
    expect(ewma(Array(40).fill(7), 30)).toBeCloseTo(7, 12);
  });

  it('weights recent days more than a flat mean would', () => {
    const values = [...Array(30).fill(40), ...Array(5).fill(60)];
    const flatMean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(ewma(values, 30)).toBeGreaterThan(flatMean);
  });

  it('returns null for an empty series', () => {
    expect(ewma([], 30)).toBeNull();
  });
});

describe('Stage 3: median and MAD', () => {
  it('computes median for odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('computes the raw (unscaled) MAD', () => {
    // values 1..7: median 4, abs devs 3,2,1,0,1,2,3 -> median 2
    expect(mad([1, 2, 3, 4, 5, 6, 7])).toBe(2);
  });
});

describe('Stage 3: computeBaseline', () => {
  const fourteen = series('2026-08-01', [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53]);

  it('scales the spread to sigma: spread = 1.4826 x MAD', () => {
    const b = computeBaseline(fourteen, cfg);
    if (b.coldStart) throw new Error('expected a ready baseline');
    // median 46.5, absolute deviations 6.5..0.5..6.5, MAD 3.5
    expect(b.mad).toBe(3.5);
    expect(b.spread).toBeCloseTo(1.4826 * 3.5, 12);
    expect(b.ewma).toBeCloseTo(ewma(fourteen.map((p) => p.value), 30)!, 12);
    expect(b.daysOfHistory).toBe(14);
  });

  it('is cold-start below 14 days: no stats, never a population default', () => {
    const b = computeBaseline(fourteen.slice(0, 13), cfg);
    expect(b).toEqual({ coldStart: true, daysOfHistory: 13 });
  });

  it('computes spread over only the last 30 observations', () => {
    const old = series('2026-05-01', Array(40).fill(10)); // wildly different old level
    const cycle = [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53];
    const recentValues = [...cycle, ...cycle, 40, 41];
    const recent = series('2026-06-10', recentValues); // exactly 30 points
    const b = computeBaseline([...old, ...recent], cfg);
    const onlyRecent = computeBaseline(recent, cfg);
    if (b.coldStart || onlyRecent.coldStart) throw new Error('expected ready baselines');
    expect(b.mad).toBe(onlyRecent.mad);
  });

});

describe('Stage 3: zScore', () => {
  const baseline = { coldStart: false as const, daysOfHistory: 30, ewma: 50, spread: 5, mad: 5 / 1.4826 };

  it('is (value - ewma) / spread', () => {
    expect(zScore(60, baseline, cfg)).toBe(2);
    expect(zScore(45, baseline, cfg)).toBe(-1);
  });

  it('floors the spread so a flat history does not produce an infinite z', () => {
    const flat = { coldStart: false as const, daysOfHistory: 30, ewma: 50, spread: 0, mad: 0 };
    expect(zScore(51, flat, cfg)).toBeCloseTo(1 / (0.02 * 50), 10);
  });

  it('is null while cold-starting', () => {
    expect(zScore(50, { coldStart: true, daysOfHistory: 3 }, cfg)).toBeNull();
  });
});

describe('Slice 1.5: sleepDurationZVsGoal (duration scored against the goal, not the baseline)', () => {
  const ready = (ewma: number, spread: number): Baseline => ({ coldStart: false, daysOfHistory: 30, ewma, spread, mad: spread / 1.4826 });

  it('is (minutesAsleep - goal) / sigma-hat: exactly on goal is 0 whatever the baseline centre is', () => {
    expect(sleepDurationZVsGoal(480, 480, ready(400, 30), v1Config)).toBe(0);
  });

  it("scores a short night against the goal even when it equals the user's own baseline", () => {
    // Baseline centre 420 (a habitually short sleeper): 420 vs a 480 goal is still 2 sigma under.
    expect(sleepDurationZVsGoal(420, 480, ready(420, 30), v1Config)).toBeCloseTo(-2, 12);
  });

  it('clamps the deficit at -3 sigma', () => {
    expect(sleepDurationZVsGoal(390, 480, ready(450, 30), v1Config)).toBeCloseTo(-3, 12); // exactly -3
    expect(sleepDurationZVsGoal(300, 480, ready(450, 30), v1Config)).toBe(-3); // -6 sigma raw
    expect(sleepDurationZVsGoal(0, 480, ready(450, 30), v1Config)).toBe(-3);
  });

  it('clamps the surplus at +1 sigma: sleeping past goal earns no extra credit', () => {
    expect(sleepDurationZVsGoal(510, 480, ready(450, 30), v1Config)).toBeCloseTo(1, 12);
    expect(sleepDurationZVsGoal(660, 480, ready(450, 30), v1Config)).toBe(1);
    expect(sleepDurationZVsGoal(900, 480, ready(450, 30), v1Config)).toBe(1);
  });

  it('is null while the SLEEP baseline is cold-starting (no sigma-hat to scale by)', () => {
    expect(sleepDurationZVsGoal(400, 480, { coldStart: true, daysOfHistory: 5 }, v1Config)).toBeNull();
  });

  it('floors sigma-hat the same way zScore does, so a flat history cannot make the z infinite', () => {
    const z = sleepDurationZVsGoal(400, 480, ready(450, 0), v1Config)!;
    expect(Number.isFinite(z)).toBe(true);
    expect(z).toBe(-3);
  });
});
