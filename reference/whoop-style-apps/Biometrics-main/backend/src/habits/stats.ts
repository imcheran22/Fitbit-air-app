// Pure statistics for the habit correlation engine. No dependency: the one
// non-trivial piece is the Student-t p-value at a NON-INTEGER degrees of
// freedom, because the Pyper-Peterman effective sample size is rarely a whole
// number and rounding it would quietly change the answer. That needs the
// regularized incomplete beta function, implemented here.

// Lanczos approximation (g = 7, n = 9): ~15 significant digits for x > 0.
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lnGamma(x: number): number {
  if (x < 0.5) {
    // Reflection: Gamma(x) Gamma(1-x) = pi / sin(pi x)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0]!;
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta (modified Lentz), valid where x < (a+1)/(a+b+2). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const TINY = 1e-300;
  const EPS = 1e-15;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b), for a, b > 0 and x in [0, 1]. */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  // The fraction converges quickly only on one side of the mean; use the symmetry I_x(a,b) = 1 - I_{1-x}(b,a) otherwise.
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** Two-sided p-value P(|T| >= |t|) for a Student-t with `df` (real-valued, > 0) degrees of freedom. */
export function studentTTwoSidedP(t: number, df: number): number {
  if (Number.isNaN(t)) return 1;
  if (!Number.isFinite(t)) return 0;
  // P(|T| >= t) = I_{df/(df+t^2)}(df/2, 1/2)
  return regularizedIncompleteBeta(df / (df + t * t), df / 2, 0.5);
}

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

/** Pearson r; 0 for fewer than 2 points or a constant series (undefined r is "no evidence", never NaN). */
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/**
 * Subtracts each value's own weekday mean (weekday = 0..6). Weekly rhythm
 * shared by a habit and a biometric (weekend drinking, weekend sleep debt)
 * would otherwise read as correlation whether or not a relationship exists.
 */
export function deseasonalize(values: number[], weekdays: number[]): number[] {
  const sums = new Map<number, { sum: number; count: number }>();
  values.forEach((v, i) => {
    const w = weekdays[i]!;
    const s = sums.get(w) ?? { sum: 0, count: 0 };
    s.sum += v;
    s.count += 1;
    sums.set(w, s);
  });
  return values.map((v, i) => {
    const s = sums.get(weekdays[i]!)!;
    return v - s.sum / s.count;
  });
}

/**
 * Sample lag-1 autocorrelation. `dayNumbers` (strictly increasing) says which
 * observations are calendar neighbours: an observation series with gaps (a
 * dropped imputed day, an unobserved habit day) must not treat the two sides
 * of a gap as consecutive. Both numerator and denominator are averaged over
 * their own term counts so a gappy series is not shrunk toward 0.
 */
export function lag1Autocorrelation(values: number[], dayNumbers?: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const mu = mean(values);
  let denom = 0;
  for (const v of values) denom += (v - mu) ** 2;
  denom /= n;
  if (denom === 0) return 0;
  let num = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < n; i++) {
    if (dayNumbers && dayNumbers[i + 1]! - dayNumbers[i]! !== 1) continue;
    num += (values[i]! - mu) * (values[i + 1]! - mu);
    pairs++;
  }
  if (pairs < 2) return 0;
  return Math.max(-0.99, Math.min(0.99, num / pairs / denom));
}

/** Smallest effective sample size the test will use; keeps df >= 1 and the t statistic finite. */
export const MIN_EFFECTIVE_N = 3;

/**
 * Pyper & Peterman (1998): n_eff = n (1 - rho_h rho_f) / (1 + rho_h rho_f),
 * floored at 3 (two strongly positively autocorrelated series can drive it to
 * ~0 or below). Capped at n as well: a negative rho product would inflate it
 * past n, which is the anti-conservative direction, and this engine has no
 * reason to credit that.
 */
export function effectiveSampleSize(n: number, rhoHabit: number, rhoFactor: number): number {
  const product = rhoHabit * rhoFactor;
  if (product <= 0) return Math.max(MIN_EFFECTIVE_N, n);
  return Math.max(MIN_EFFECTIVE_N, Math.min(n, (n * (1 - product)) / (1 + product)));
}

/**
 * Two-sided p for a correlation `r` given an effective sample size:
 * t = r sqrt(df / (1 - r^2)) on df degrees of freedom. The p-value is
 * continuous, so unlike a permutation test it has no floor tied to how many
 * days of data exist.
 *
 * `seasonalParams` is how many parameters were estimated FROM THIS DATA before
 * the correlation was taken -- the weekday means deseasonalize() subtracts.
 * Fitting them and then testing the residuals as if they were raw observations
 * is the classic way to get p-values that are too small: the residuals are
 * closer together than the data was, so r looks more reliable than it is. The
 * standard correction for correlating residuals after removing p regressors is
 * df = n - 2 - p.
 *
 * df is floored at 1 so a short, heavily-adjusted series degrades to a weak,
 * honest test rather than a non-finite one.
 */
export function correlationPValue(r: number, nEff: number, seasonalParams = 0): number {
  const a = Math.abs(r);
  if (a >= 1) return 0;
  if (a === 0) return 1;
  const df = Math.max(1, nEff - 2 - seasonalParams);
  const t = a * Math.sqrt(df / (1 - a * a));
  return studentTTwoSidedP(t, df);
}

/**
 * Degrees of freedom deseasonalize() consumes: one mean per weekday actually
 * present, minus the one the overall mean already accounts for. A series
 * spanning a full week costs 6; three distinct weekdays cost 2.
 */
export function seasonalParamsFor(weekdays: number[]): number {
  return Math.max(0, new Set(weekdays).size - 1);
}

/**
 * Benjamini-Hochberg adjusted p-values ("q-values"), in the input order: a
 * hypothesis is rejected at FDR level q exactly when its adjusted value < q.
 * Adjusted_i = min over k >= rank(i) of p_(k) m / k, capped at 1.
 */
export function benjaminiHochberg(pValues: number[]): number[] {
  const m = pValues.length;
  const order = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array<number>(m);
  let running = 1;
  for (let k = m; k >= 1; k--) {
    const { p, i } = order[k - 1]!;
    running = Math.min(running, (p * m) / k);
    q[i] = running;
  }
  return q;
}
