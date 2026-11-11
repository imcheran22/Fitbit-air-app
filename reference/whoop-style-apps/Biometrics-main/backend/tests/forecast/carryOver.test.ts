import { fitCarryOver, shrinkAndClamp } from '../../src/forecast/carryOver';
import { TODAY, series } from './fixtures';

/** z(d+1) = 0.8 z(d), starting from 1: an exact OLS slope of 0.8. */
const decay = (n: number) => Array.from({ length: n }, (_, i) => 0.8 ** i);

describe('fitCarryOver', () => {
  it('shrinks an exact slope toward the 0.5 prior by n / (n + 30)', () => {
    // 11 points -> 10 pairs -> w = 10 / 40 = 0.25 -> 0.25 * 0.8 + 0.75 * 0.5 = 0.575
    expect(fitCarryOver(series(decay(11)), TODAY)).toBeCloseTo(0.575, 6);
  });

  it('returns the prior with fewer than two pairs', () => {
    expect(fitCarryOver(series([1]), TODAY)).toBe(0.5);
    expect(fitCarryOver(new Map(), TODAY)).toBe(0.5);
  });

  it('ignores pairs that touch an imputed or null day', () => {
    const clean = decay(11);
    const noisy = [...clean, 50]; // day 11 is a wild value, but imputed
    const withImputed = series(noisy, TODAY, new Set([11]));
    const withoutIt = series(clean, '2026-06-29');
    expect(fitCarryOver(withImputed, TODAY)).toBeCloseTo(fitCarryOver(withoutIt, TODAY), 10);
    const withNull = series([...clean, null]);
    expect(fitCarryOver(withNull, TODAY)).toBeCloseTo(fitCarryOver(withoutIt, TODAY), 10);
  });

  it('never looks past `through`', () => {
    const s = series([...decay(11), 40, -40]);
    expect(fitCarryOver(s, '2026-06-28')).toBeCloseTo(0.575, 6);
  });
});

describe('shrinkAndClamp', () => {
  it('clamps to [0, 0.9]', () => {
    expect(shrinkAndClamp(-2, 1000)).toBe(0);
    expect(shrinkAndClamp(3, 1000)).toBe(0.9);
  });
});
