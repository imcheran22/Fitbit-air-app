import { habitEffect } from '../../src/forecast/habitEffects';
import { TODAY, series } from './fixtures';

// Days 0..9. Exposed on even days; the factor on the NEXT day is -1 after exposure, +1 otherwise.
const z = [0, -1, 1, -1, 1, -1, 1, -1, 1, -1];
const days = [...series(z).keys()];
const obs = days.map((day, i) => ({ day, exposed: i % 2 === 0 }));

describe('habitEffect', () => {
  it('is mean(z | exposed yesterday) - mean(z | unexposed yesterday) at lag 1', () => {
    expect(habitEffect(obs, series(z), TODAY)).toBeCloseTo(-2, 10);
  });

  it('returns null when either side has no pairs', () => {
    const allExposed = obs.map((o) => ({ ...o, exposed: true }));
    expect(habitEffect(allExposed, series(z), TODAY)).toBeNull();
    expect(habitEffect([], series(z), TODAY)).toBeNull();
  });

  it('skips imputed factor days and never reads past `through`', () => {
    const imputedAll = series(z, TODAY, new Set(z.map((_, i) => i)));
    expect(habitEffect(obs, imputedAll, TODAY)).toBeNull();
    // Only the first pair (exposed day 0 -> day 1) is visible when through = day 1.
    expect(habitEffect(obs, series(z), days[1]!)).toBeNull();
  });
});
