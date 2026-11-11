import {
  analyzeHabits,
  CORRELATION_FACTORS,
  EngineInput,
  FactorDay,
  FactorKey,
  HypothesisResult,
} from '../../src/habits/engine';
import { correlationPValue } from '../../src/habits/stats';
import { ar1, dateAt, gaussian, seededRandom, stickyBinary } from './helpers';

const START = '2026-01-05';

/** z -> "% deviation" is just a scale here; what matters is that it is monotone in z. */
const PCT_PER_Z = 10;

function factorMap(values: (number | null)[], imputed: boolean[] = []): Map<string, FactorDay> {
  const m = new Map<string, FactorDay>();
  values.forEach((z, i) => {
    if (z === null) return;
    m.set(dateAt(START, i), { z, imputed: imputed[i] ?? false, pct: z * PCT_PER_Z });
  });
  return m;
}

function observationsOf(habit: number[]) {
  return habit.map((h, i) => ({ day: dateAt(START, i), exposed: h === 1 }));
}

/** Factor = AR(1) noise + `effect` on the night `lag` days after each exposed habit day. */
function withEffect(rand: () => number, habit: number[], lag: number, effect: number, phi = 0.3, extraDays = 6) {
  const n = habit.length + extraDays;
  const noise = ar1(rand, n, phi);
  return noise.map((v, d) => v + (d - lag >= 0 && d - lag < habit.length ? effect * habit[d - lag]! : 0));
}

const find = (hs: HypothesisResult[], factor: FactorKey, lag: number, habitType = 'ALCOHOL') =>
  hs.find((h) => h.habitType === habitType && h.factor === factor && h.lagDays === lag);

describe('90-day regression: a strong correlation must be detectable', () => {
  // The rejected permutation design passed every unit test yet could never
  // return a p-value below ~1/90 = 0.011, so BH across ~40 tests (needing
  // ~0.003) rejected nothing however strong the effect. This is the test that
  // design would have failed.
  it('rejects a strong lag-1 HRV effect at BH q<0.10 with a p-value far below the permutation floor', () => {
    const rand = seededRandom(11);
    const habit = stickyBinary(rand, 90, 0.5, 0.4);
    const hrvZ = withEffect(rand, habit, 1, -1.5);
    const input: EngineInput = {
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      factors: { HRV: factorMap(hrvZ) },
    };

    const { hypotheses } = analyzeHabits(input);
    const hit = find(hypotheses, 'HRV', 1)!;

    expect(hit).toBeDefined();
    expect(hit.pValue).toBeLessThan(0.011 / 3); // well below the ~0.011 floor of a 90-day permutation test
    expect(hit.qValue).toBeLessThan(0.1);
    expect(Math.abs(hit.r)).toBeGreaterThan(0.3);
    expect(hit.passes).toBe(true);
    expect(hit.direction).toBe('lower');
    expect(hit.effectSizePercent!).toBeLessThan(hit.comparisonPercent!);
    expect(hit.sampleSize).toBeGreaterThan(80);
  });
});

describe('false-positive control on autocorrelated null data', () => {
  // Habit and factors are independent but BOTH strongly autocorrelated: the
  // setting where a naive test reports "significant" correlations constantly.
  const SIMS = 300;
  const runNull = (seed: number) => {
    const rand = seededRandom(seed);
    const habit = stickyBinary(rand, 90, 0.85, 0.4);
    const factors: Partial<Record<FactorKey, Map<string, FactorDay>>> = {};
    for (const f of CORRELATION_FACTORS) factors[f] = factorMap(ar1(rand, 96, 0.75));
    return analyzeHabits({ habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }], factors });
  };

  it('keeps the run-level false-discovery rate at or below nominal, and beats the uncorrected test', () => {
    let runsWithAnyPass = 0;
    let corrected = 0;
    let naive = 0;
    let tests = 0;
    for (let s = 0; s < SIMS; s++) {
      const { hypotheses } = runNull(1000 + s);
      if (hypotheses.some((h) => h.passes)) runsWithAnyPass++;
      for (const h of hypotheses) {
        tests++;
        if (h.pValue < 0.05) corrected++;
        if (correlationPValue(h.r, h.sampleSize) < 0.05) naive++;
      }
    }
    // Global null: every rejection is false, so P(any BH rejection) <= q = 0.10.
    expect(runsWithAnyPass / SIMS).toBeLessThanOrEqual(0.1);
    // Per-test: the correction brings a 5% test near 5% where ignoring autocorrelation does not.
    expect(naive / tests).toBeGreaterThan(0.12);
    expect(corrected / tests).toBeLessThan(0.1);
    expect(corrected).toBeLessThan(naive);
  });
});

describe('lag alignment', () => {
  it('finds an effect placed on the night after the habit at lag 1 and not at lags 2-3', () => {
    const rand = seededRandom(21);
    const habit = Array.from({ length: 90 }, () => (rand() < 0.4 ? 1 : 0));
    const hrvZ = withEffect(rand, habit, 1, -1.5, 0.2);
    const { hypotheses } = analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      factors: { HRV: factorMap(hrvZ) },
    });

    expect(find(hypotheses, 'HRV', 1)!.passes).toBe(true);
    expect(find(hypotheses, 'HRV', 2)!.passes).toBe(false);
    expect(find(hypotheses, 'HRV', 3)!.passes).toBe(false);
  });

  it('finds an effect that lands two nights after at lag 2 only', () => {
    const rand = seededRandom(22);
    const habit = Array.from({ length: 90 }, () => (rand() < 0.4 ? 1 : 0));
    const { hypotheses } = analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      factors: { HRV: factorMap(withEffect(rand, habit, 2, -1.5, 0.2)) },
    });
    expect(find(hypotheses, 'HRV', 1)!.passes).toBe(false);
    expect(find(hypotheses, 'HRV', 2)!.passes).toBe(true);
    expect(find(hypotheses, 'HRV', 3)!.passes).toBe(false);
  });

  it('reads the factor on H + lag, not on H: a same-day (lag 0) relationship is not reported', () => {
    // The BIOMETRIC precedes the habit: a bad night on civil date D drives more
    // coffee on habit day D. A lag-0 test would surface this as a habit effect.
    const rand = seededRandom(23);
    const factor = ar1(rand, 96, 0.2);
    const habit = factor.slice(0, 90).map((z) => (z < -0.2 ? 1 : 0));
    // Sanity: the reverse relationship really is strong on the same date.
    const lag0 = habit.map((h, i) => [h, factor[i]!]);
    const meanExposed = lag0.filter(([h]) => h === 1).reduce((s, [, f]) => s + f!, 0) / lag0.filter(([h]) => h === 1).length;
    expect(meanExposed).toBeLessThan(-0.7);

    const { hypotheses } = analyzeHabits({
      habits: [{ habitType: 'CAFFEINE', observations: observationsOf(habit) }],
      factors: { HRV: factorMap(factor) },
    });
    expect(hypotheses.length).toBeGreaterThan(0);
    expect(hypotheses.filter((h) => h.passes)).toEqual([]);
    expect(hypotheses.every((h) => h.lagDays >= 1)).toBe(true);
  });

  it('never tests lag 0', () => {
    const rand = seededRandom(24);
    const habit = stickyBinary(rand, 60, 0.5);
    const { hypotheses } = analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      factors: { HRV: factorMap(ar1(rand, 66, 0.3)) },
    });
    expect([...new Set(hypotheses.map((h) => h.lagDays))].sort()).toEqual([1, 2, 3]);
  });
});

describe('minimum-observation gate (8 exposed and 8 unexposed)', () => {
  const build = (exposed: number, unexposed: number) => {
    const rand = seededRandom(31);
    const habit = [...Array(exposed).fill(1), ...Array(unexposed).fill(0)].sort(() => rand() - 0.5) as number[];
    return analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      // 3 spare factor days so lag 3 does not cut the last observations short.
      factors: { HRV: factorMap(ar1(rand, habit.length + 4, 0.3)) },
    });
  };

  it('does not test a habit with 7 exposed pairs and reports the counts', () => {
    const out = build(7, 30);
    expect(out.hypotheses).toEqual([]);
    expect(out.notEnoughData).toHaveLength(1);
    expect(out.notEnoughData[0]).toMatchObject({ habitType: 'ALCOHOL', requiredEach: 8 });
    // Lag 1 sees every habit day's factor (only the last day's lag-3 factor is missing).
    expect(out.notEnoughData[0]!.exposedDays).toBe(7);
    expect(out.notEnoughData[0]!.unexposedDays).toBe(30);
  });

  it('does not test a habit with 7 unexposed pairs', () => {
    const out = build(30, 7);
    expect(out.hypotheses).toEqual([]);
    expect(out.notEnoughData[0]).toMatchObject({ exposedDays: 30, unexposedDays: 7 });
  });

  it('tests a habit with exactly 8 and 8 at lag 1', () => {
    const out = build(8, 8);
    expect(out.hypotheses.find((h) => h.lagDays === 1)).toBeDefined();
    expect(out.notEnoughData).toEqual([]);
  });

  it('a user who only logs the days they drink has no unexposed days and is never tested', () => {
    const rand = seededRandom(32);
    const observations = Array.from({ length: 40 }, (_, i) => ({ day: dateAt(START, i), exposed: true }));
    const out = analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations }],
      factors: { HRV: factorMap(ar1(rand, 46, 0.3)) },
    });
    expect(out.hypotheses).toEqual([]);
    expect(out.notEnoughData[0]).toMatchObject({ exposedDays: 40, unexposedDays: 0 });
  });

  it('counts pairs, not habit days: days whose factor is missing do not count toward the gate', () => {
    const rand = seededRandom(33);
    const habit = stickyBinary(rand, 40, 0.5);
    const z = ar1(rand, 46, 0.3).map((v, i) => (i % 2 === 0 ? null : v)); // half the nights missing
    const out = analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      factors: { HRV: factorMap(z) },
    });
    for (const h of out.hypotheses) expect(h.sampleSize).toBeLessThanOrEqual(20);
  });
});

describe('imputed-day exclusion', () => {
  // A true lag-1 effect, then a share of nights replaced by baseline-imputed
  // z = 0. Honouring the imputed flag drops those pairs and recovers the
  // effect; ignoring it keeps ~zero values in the exposed group and dilutes it.
  const build = (honourFlag: boolean) => {
    const rand = seededRandom(41);
    const habit = Array.from({ length: 90 }, () => (rand() < 0.45 ? 1 : 0));
    const z = withEffect(rand, habit, 1, -1.0, 0.2);
    const imputed = z.map((_, d) => d >= 1 && d - 1 < habit.length && habit[d - 1] === 1 && rand() < 0.6);
    const observed = z.map((v, i) => (imputed[i] ? 0 : v));
    const flags = honourFlag ? imputed : imputed.map(() => false);
    return analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      factors: { HRV: factorMap(observed, flags) },
    });
  };

  it('recovers the effect when imputed days are excluded, and not when the flag is ignored', () => {
    const honoured = find(build(true).hypotheses, 'HRV', 1)!;
    const ignored = find(build(false).hypotheses, 'HRV', 1)!;

    expect(honoured.passes).toBe(true);
    expect(honoured.effectSizePercent!).toBeLessThan(-5); // ~ -1.0 z * 10
    expect(ignored.passes).toBe(false);
    expect(Math.abs(ignored.r)).toBeLessThan(Math.abs(honoured.r));
    // Dropped pairs really are absent from the sample.
    expect(honoured.sampleSize).toBeLessThan(ignored.sampleSize);
  });

  it('shows dropped days as null in the sparkline series', () => {
    const rand = seededRandom(42);
    const habit = stickyBinary(rand, 30, 0.5);
    const z = ar1(rand, 36, 0.3);
    const flags = z.map((_, i) => i === 5);
    const out = analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      factors: { HRV: factorMap(z, flags) },
    });
    const h = find(out.hypotheses, 'HRV', 1)!;
    // habit day index 4 pairs with factor day index 5 at lag 1
    expect(h.series.days[4]).toBe(dateAt(START, 4));
    expect(h.series.factor[4]).toBeNull();
    expect(h.series.factor[3]).not.toBeNull();
    expect(h.series.habit[4]).toBe(habit[4]);
  });
});

describe('series choice', () => {
  it('correlates only the per-night z series; sleepDebtRolling14d is not a factor', () => {
    expect([...CORRELATION_FACTORS]).toEqual(['HRV', 'RHR', 'SLEEP_DURATION', 'SLEEP_EFFICIENCY', 'CIRCADIAN_CONSISTENCY']);
    expect(CORRELATION_FACTORS.some((f) => /debt/i.test(f))).toBe(false);
  });

  it('tests every supplied factor against every habit at every lag in one BH family', () => {
    const rand = seededRandom(51);
    const habits = ['ALCOHOL', 'CAFFEINE'].map((habitType) => ({
      habitType,
      observations: observationsOf(stickyBinary(rand, 70, 0.5)),
    }));
    const factors: EngineInput['factors'] = {};
    for (const f of CORRELATION_FACTORS) factors[f] = factorMap(ar1(rand, 76, 0.3));
    const { hypotheses } = analyzeHabits({ habits, factors });
    expect(hypotheses).toHaveLength(2 * 5 * 3);
    for (const h of hypotheses) expect(h.qValue).toBeGreaterThanOrEqual(h.pValue);
  });
});

describe('weekday de-seasonalization', () => {
  it('does not report a shared weekend pattern as a habit effect', () => {
    // Drinking happens on Fri/Sat; HRV dips on Sat/Sun. No causal link beyond the calendar.
    const rand = seededRandom(61);
    const n = 91;
    const habit = Array.from({ length: n }, (_, i) => {
      const wd = new Date(`${dateAt(START, i)}T00:00:00Z`).getUTCDay();
      return (wd === 5 || wd === 6) && rand() < 0.9 ? 1 : 0;
    });
    const hrv = Array.from({ length: n + 6 }, (_, d) => {
      const wd = new Date(`${dateAt(START, d)}T00:00:00Z`).getUTCDay();
      return (wd === 6 || wd === 0 ? -1.5 : 0) + 0.5 * gaussian(rand);
    });
    const { hypotheses } = analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      factors: { HRV: factorMap(hrv) },
    });
    expect(hypotheses.length).toBeGreaterThan(0);
    expect(hypotheses.filter((h) => h.passes)).toEqual([]);
  });
});

describe('effect size and direction', () => {
  it('reports mean % deviation on exposed vs unexposed paired days', () => {
    // Deterministic: exposed nights have z = -2 (-20%), unexposed z = +1 (+10%).
    const habit = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? 1 : 0));
    const z: number[] = Array.from({ length: 66 }, (_, d) => {
      const h = d - 1 >= 0 && d - 1 < 60 ? habit[d - 1]! : 0;
      return h === 1 ? -2 : 1;
    });
    const { hypotheses } = analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      factors: { HRV: factorMap(z) },
    });
    const h = find(hypotheses, 'HRV', 1)!;
    expect(h.effectSizePercent).toBe(-20);
    expect(h.comparisonPercent).toBe(10);
    expect(h.direction).toBe('lower');
  });

  it("reports 'higher' when the exposed mean exceeds the comparison mean", () => {
    const rand = seededRandom(71);
    const habit = Array.from({ length: 80 }, () => (rand() < 0.5 ? 1 : 0));
    const { hypotheses } = analyzeHabits({
      habits: [{ habitType: 'WORKOUT', observations: observationsOf(habit) }],
      factors: { RHR: factorMap(withEffect(rand, habit, 1, 1.5, 0.2)) },
    });
    const h = find(hypotheses, 'RHR', 1, 'WORKOUT')!;
    expect(h.direction).toBe('higher');
    expect(h.passes).toBe(true);
  });

  it('a pair with no % deviation still counts toward r but not toward the averages', () => {
    const rand = seededRandom(72);
    const habit = Array.from({ length: 50 }, () => (rand() < 0.5 ? 1 : 0));
    const z = withEffect(rand, habit, 1, -1, 0.2);
    const m = factorMap(z);
    for (const [k, v] of m) if (k === dateAt(START, 3)) m.set(k, { ...v, pct: null });
    const { hypotheses } = analyzeHabits({
      habits: [{ habitType: 'ALCOHOL', observations: observationsOf(habit) }],
      factors: { HRV: m },
    });
    const h = find(hypotheses, 'HRV', 1)!;
    expect(h.effectSizePercent).not.toBeNull();
    expect(h.sampleSize).toBeGreaterThan(45);
  });
});
