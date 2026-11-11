// Small numeric helpers the Pulse engine's kernels share. Everything is in doubles (engine plan, fix 18): the reference
// study's kernels run in Float32, which only moves the last digits and can flip a status at an exact threshold.

/**
 * Rounds half away from zero to `dp` decimals: the one rounding rule for every engine value and label (engine plan,
 * fix 6; the reference study, shared-machinery.md § G09, found three different rules on screen).
 */
export function roundHalfAway(x: number, dp = 0): number {
  const f = 10 ** dp;
  return (Math.sign(x) * Math.round(Math.abs(x) * f)) / f;
}

/** The arithmetic mean, or null with no values. */
export function mean(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Population mean and SD (divisor n), or null with no values. */
export function popStats(xs: readonly number[]): { mean: number; sd: number; n: number } | null {
  const m = mean(xs);
  if (m == null) return null;
  let v = 0;
  for (const x of xs) v += (x - m) ** 2;
  return { mean: m, sd: Math.sqrt(v / xs.length), n: xs.length };
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
