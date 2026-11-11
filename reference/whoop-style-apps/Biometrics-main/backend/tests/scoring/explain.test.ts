import { explainFactors } from '../../src/scoring/explain';
import { computeComposite } from '../../src/scoring/composite';
import { v1Config } from '../../src/scoring/configs/v1';

const cfg = v1Config;

describe('Stage 5: explainFactors', () => {
  const composite = computeComposite(
    [
      { factor: 'HRV', z: 1.5, imputed: false, excluded: false },
      { factor: 'RHR', z: 0.5, imputed: false, excluded: false },
      { factor: 'SLEEP_DEBT', z: -0.5, imputed: false, excluded: false },
    ],
    cfg,
  );

  it('splits (score - 50) across factors in proportion to their contribution, summing exactly to it', () => {
    const explained = explainFactors(composite);
    const totalContribution = composite.factors.reduce((s, x) => s + x.contribution, 0);
    expect(explained.reduce((s, f) => s + f.points, 0)).toBeCloseTo(composite.score! - 50, 9);
    for (const f of explained) {
      expect(f.points).toBeCloseTo((f.contribution / totalContribution) * (composite.score! - 50), 9);
    }
  });

  it('keeps contribution = weight x direction x z, so the bars are the addends of the score', () => {
    const explained = explainFactors(composite);
    expect(explained.find((f) => f.factor === 'HRV')!.contribution).toBeCloseTo(0.45 * 1.5, 12);
    expect(explained.find((f) => f.factor === 'RHR')!.contribution).toBeCloseTo(-0.35 * 0.5, 12);
    expect(explained.find((f) => f.factor === 'SLEEP_DEBT')!.contribution).toBeCloseTo(0.2 * 0.5, 12);
  });

  it('sorts by contribution magnitude, largest first', () => {
    expect(explainFactors(composite).map((f) => f.factor)).toEqual(['HRV', 'RHR', 'SLEEP_DEBT']);
  });

  it('gives a factor pulling against the score a negative share', () => {
    const explained = explainFactors(composite);
    expect(explained.find((f) => f.factor === 'HRV')!.points).toBeGreaterThan(0);
    expect(explained.find((f) => f.factor === 'RHR')!.points).toBeLessThan(0);
  });

  it('gives an excluded factor 0 points', () => {
    const c = computeComposite(
      [
        { factor: 'HRV', z: null, imputed: false, excluded: true },
        { factor: 'RHR', z: 1, imputed: false, excluded: false },
        { factor: 'SLEEP_DEBT', z: 0, imputed: false, excluded: false },
      ],
      cfg,
    );
    expect(explainFactors(c).find((f) => f.factor === 'HRV')!.points).toBe(0);
  });

  it('gives every factor 0 points when the score is exactly 50 (no division by zero)', () => {
    const c = computeComposite(
      (['HRV', 'RHR', 'SLEEP_DEBT'] as const).map((factor) => ({ factor, z: 0, imputed: false, excluded: false })),
      cfg,
    );
    expect(explainFactors(c).map((f) => f.points)).toEqual([0, 0, 0]);
  });

  it('gives points of 0 for a cold-start day with no score', () => {
    const c = computeComposite(
      (['HRV', 'RHR', 'SLEEP_DEBT'] as const).map((factor) => ({ factor, z: null, imputed: false, excluded: true })),
      cfg,
    );
    expect(explainFactors(c).every((f) => f.points === 0)).toBe(true);
  });
});
