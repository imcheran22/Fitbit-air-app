import {
  lnGamma,
  regularizedIncompleteBeta,
  studentTTwoSidedP,
  pearson,
  deseasonalize,
  lag1Autocorrelation,
  effectiveSampleSize,
  correlationPValue,
  seasonalParamsFor,
  benjaminiHochberg,
} from '../../src/habits/stats';

describe('lnGamma', () => {
  it.each([
    [1, 0],
    [2, 0],
    [5, Math.log(24)],
    [0.5, Math.log(Math.sqrt(Math.PI))],
    [10.5, 13.940625219403763],
  ])('lnGamma(%p)', (x, expected) => {
    expect(lnGamma(x)).toBeCloseTo(expected, 9);
  });
});

describe('regularizedIncompleteBeta', () => {
  it('handles the boundaries and symmetry', () => {
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
    expect(regularizedIncompleteBeta(0.3, 2.5, 4)).toBeCloseTo(1 - regularizedIncompleteBeta(0.7, 4, 2.5), 12);
  });
  it('matches closed forms', () => {
    // I_x(1, 1) = x ; I_x(2, 1) = x^2 ; I_x(1, 2) = 1 - (1-x)^2
    expect(regularizedIncompleteBeta(0.37, 1, 1)).toBeCloseTo(0.37, 12);
    expect(regularizedIncompleteBeta(0.37, 2, 1)).toBeCloseTo(0.37 ** 2, 12);
    expect(regularizedIncompleteBeta(0.37, 1, 2)).toBeCloseTo(1 - 0.63 ** 2, 12);
  });
});

describe('studentTTwoSidedP: reference values', () => {
  // Standard two-sided critical values from t tables.
  it.each([
    [1, 12.7062047, 0.05],
    [2, 4.3026527, 0.05],
    [5, 2.5705818, 0.05],
    [10, 2.2281389, 0.05],
    [30, 2.0422725, 0.05],
    [10, 3.1692727, 0.01],
    [10, 4.5868939, 0.001],
    [3, 5.8409093, 0.01],
    [120, 1.9799304, 0.05],
  ])('df=%p t=%p gives p=%p', (df, t, p) => {
    expect(studentTTwoSidedP(t, df)).toBeCloseTo(p, 5);
  });

  it('matches the exact closed forms for df 1 and 2', () => {
    for (const t of [0.3, 1, 2.5, 7]) {
      expect(studentTTwoSidedP(t, 1)).toBeCloseTo(1 - (2 / Math.PI) * Math.atan(t), 10);
      expect(studentTTwoSidedP(t, 2)).toBeCloseTo(1 - t / Math.sqrt(2 + t * t), 10);
    }
  });

  it('is symmetric, 1 at t=0 and 0 at infinity', () => {
    expect(studentTTwoSidedP(0, 7)).toBe(1);
    expect(studentTTwoSidedP(-2.3, 7.4)).toBeCloseTo(studentTTwoSidedP(2.3, 7.4), 12);
    expect(studentTTwoSidedP(Infinity, 7)).toBe(0);
  });

  // The whole point of the engine's continuous p-value: non-integer df (an
  // effective sample size is rarely a whole number). Checked against direct
  // numerical integration of the density, which shares no code with the beta
  // function: with x = sqrt(v) tan(theta) the t density is proportional to
  // cos(theta)^(v-1) on (-pi/2, pi/2), a finite integral.
  function integratedP(t: number, v: number): number {
    const f = (th: number) => Math.cos(th) ** (v - 1);
    const simpson = (a: number, b: number, n = 20000) => {
      const h = (b - a) / n;
      let s = f(a) + f(b);
      for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
      return (s * h) / 3;
    };
    const edge = Math.atan(t / Math.sqrt(v));
    return (2 * simpson(edge, Math.PI / 2)) / simpson(-Math.PI / 2, Math.PI / 2);
  }
  it.each([
    [2.0, 2.5],
    [1.3, 3.5],
    [3.1, 7.3],
    [0.7, 15.9],
    [2.6, 26.25],
  ])('non-integer df: t=%p df=%p matches numerical integration', (t, df) => {
    expect(studentTTwoSidedP(t, df)).toBeCloseTo(integratedP(t, df), 5);
  });

  it('is continuous in df (no rounding to an integer)', () => {
    const a = studentTTwoSidedP(2, 3);
    const b = studentTTwoSidedP(2, 3.5);
    const c = studentTTwoSidedP(2, 4);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(studentTTwoSidedP(2, 3.0001)).toBeCloseTo(a, 3);
  });
});

describe('pearson', () => {
  it('is 1 / -1 for perfect lines and 0 for degenerate input', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
    expect(pearson([], [])).toBe(0);
  });
  it('matches a hand computation', () => {
    // x = 1,2,3,4,5 ; y = 2,1,4,3,5 -> r = 0.8
    expect(pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])).toBeCloseTo(0.8, 12);
  });
});

describe('deseasonalize', () => {
  it("subtracts each weekday's own mean", () => {
    // weekday 0 values 10, 12 (mean 11); weekday 1 values 5, 5 (mean 5)
    expect(deseasonalize([10, 5, 12, 5], [0, 1, 0, 1])).toEqual([-1, 0, 1, 0]);
  });
  it('removes a pure weekly pattern entirely', () => {
    const wd = Array.from({ length: 28 }, (_, i) => i % 7);
    const seasonal = wd.map((d) => d * 3);
    for (const v of deseasonalize(seasonal, wd)) expect(v).toBeCloseTo(0, 12);
  });
});

describe('lag1Autocorrelation', () => {
  it('is ~1 for a slow trend, negative for alternation and 0 for a constant', () => {
    const trend = Array.from({ length: 50 }, (_, i) => i);
    expect(lag1Autocorrelation(trend)).toBeGreaterThan(0.9);
    const alt = Array.from({ length: 50 }, (_, i) => (i % 2 ? 1 : -1));
    expect(lag1Autocorrelation(alt)).toBeLessThan(-0.9);
    expect(lag1Autocorrelation([3, 3, 3, 3])).toBe(0);
    expect(lag1Autocorrelation([1])).toBe(0);
  });
  it('only pairs calendar-adjacent observations when there are gaps', () => {
    // Two runs separated by a big gap: the jump between them must not count.
    const values = [-1, -1, -1, 1, 1, 1];
    const days = [0, 1, 2, 100, 101, 102];
    expect(lag1Autocorrelation(values, days)).toBeGreaterThan(lag1Autocorrelation(values));
  });
});

describe('effectiveSampleSize (Pyper-Peterman)', () => {
  it('equals n when either series is white', () => {
    expect(effectiveSampleSize(90, 0, 0.8)).toBe(90);
    expect(effectiveSampleSize(90, 0.5, 0)).toBe(90);
  });
  it('shrinks with positive autocorrelation: n(1-p)/(1+p)', () => {
    // rho product 0.25 -> 90 * 0.75 / 1.25 = 54
    expect(effectiveSampleSize(90, 0.5, 0.5)).toBeCloseTo(54, 10);
  });
  it('is floored at 3 when both series are strongly autocorrelated', () => {
    expect(effectiveSampleSize(20, 0.99, 0.99)).toBe(3);
    expect(effectiveSampleSize(90, 0.999, 0.999)).toBe(3);
  });
  it('never exceeds n (a negative autocorrelation product is not credited)', () => {
    expect(effectiveSampleSize(40, 0.6, -0.6)).toBe(40);
  });
});

describe('degrees of freedom charged for de-seasonalization', () => {
  it('counts one parameter per distinct weekday present, minus the overall mean', () => {
    expect(seasonalParamsFor([0, 1, 2, 3, 4, 5, 6])).toBe(6);
    expect(seasonalParamsFor([1, 1, 3, 3, 5])).toBe(2);
    expect(seasonalParamsFor([2, 2, 2])).toBe(0);
    expect(seasonalParamsFor([])).toBe(0);
  });

  // Fitting 7 weekday means from the data and then testing the residuals as if
  // they were raw observations makes p look smaller than the evidence supports.
  it('makes the p-value larger (more conservative), never smaller', () => {
    const unadjusted = correlationPValue(0.5, 27);
    const adjusted = correlationPValue(0.5, 27, 6);

    expect(adjusted).toBeGreaterThan(unadjusted);
    expect(correlationPValue(0.5, 27, 0)).toBe(unadjusted);
  });

  it('floors df at 1 so a short, heavily-adjusted series still returns a finite p', () => {
    const p = correlationPValue(0.5, 4, 6);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('correlationPValue', () => {
  it('uses t = r*sqrt((n_eff-2)/(1-r^2)) on n_eff-2 df, with no resolution floor', () => {
    // r = 0.5, n_eff = 27 -> t = 0.5*sqrt(25/0.75) = 2.8868, df 25 -> p ~ 0.0079
    const p = correlationPValue(0.5, 27);
    expect(p).toBeCloseTo(studentTTwoSidedP(0.5 * Math.sqrt(25 / 0.75), 25), 12);
    expect(p).toBeGreaterThan(0.007);
    expect(p).toBeLessThan(0.009);
    // A permutation test on 90 days could never go below ~0.011; this can.
    expect(correlationPValue(0.6, 90)).toBeLessThan(1e-6);
  });
  it('handles r = 0 and |r| = 1', () => {
    expect(correlationPValue(0, 30)).toBe(1);
    expect(correlationPValue(1, 30)).toBe(0);
    expect(correlationPValue(-1, 30)).toBe(0);
  });
  it('accepts a fractional effective sample size', () => {
    const p = correlationPValue(0.4, 12.6);
    expect(p).toBeLessThan(correlationPValue(0.4, 12));
    expect(p).toBeGreaterThan(correlationPValue(0.4, 13));
  });
});

describe('benjaminiHochberg', () => {
  it('returns monotone adjusted q-values in the input order', () => {
    // sorted p = .01 .02 .03 .5 -> q_i = min over k>=i of p_(k)*m/k
    const q = benjaminiHochberg([0.5, 0.01, 0.03, 0.02]);
    expect(q[1]).toBeCloseTo(0.04, 12);
    expect(q[3]).toBeCloseTo(0.04, 12);
    expect(q[2]).toBeCloseTo(0.04, 12);
    expect(q[0]).toBeCloseTo(0.5, 12);
  });
  it('caps at 1 and handles empty / single input', () => {
    expect(benjaminiHochberg([])).toEqual([]);
    expect(benjaminiHochberg([0.7])).toEqual([0.7]);
    expect(benjaminiHochberg([0.9, 0.95])[0]).toBeLessThanOrEqual(1);
  });
  it('rejects at q<0.10 exactly the hypotheses the step-up procedure rejects', () => {
    const p = [0.001, 0.008, 0.039, 0.041, 0.042, 0.07, 0.074, 0.205, 0.212, 0.216];
    const rejected = benjaminiHochberg(p).map((q) => q < 0.1);
    // BH at 0.10, m=10: largest k with p_(k) <= k*0.01 is 5 (0.042 <= 0.05), so the
    // first five are rejected even though p_(3) and p_(4) exceed their own k*0.01.
    expect(rejected).toEqual([true, true, true, true, true, false, false, false, false, false]);
  });
});
