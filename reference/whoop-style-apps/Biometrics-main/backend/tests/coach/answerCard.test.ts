import { MINUS, deltaDisplayOf, statusOf } from '../../src/coach/answer/card';
import { Fact, comparisonDiff, hasComparison, renderFact } from '../../src/coach/answer/facts';

const f = (value: number, usual?: number, lowerIsBetter?: boolean): Fact => ({
  id: 'x',
  label: 'X',
  value,
  unit: 'score',
  display: String(value),
  ...(usual === undefined ? {} : { usual }),
  ...(lowerIsBetter ? { lowerIsBetter } : {}),
});

describe('statusOf', () => {
  it('is near within 10% of the usual, either side', () => {
    expect(statusOf(f(58, 58))).toBe('near');
    expect(statusOf(f(53, 58))).toBe('near'); // -8.6%
    expect(statusOf(f(63.8, 58))).toBe('near'); // exactly +10%
  });

  it('is below or above outside that band', () => {
    expect(statusOf(f(26, 58))).toBe('below');
    expect(statusOf(f(52, 58))).toBe('below'); // -10.3%
    expect(statusOf(f(70, 58))).toBe('above');
  });

  it('inverts for a lower-is-better metric (resting heart rate)', () => {
    expect(statusOf(f(66, 57, true))).toBe('below');
    expect(statusOf(f(50, 57, true))).toBe('above');
    expect(statusOf(f(58, 57, true))).toBe('near');
  });

  it('is undefined without a usual, or with a usual of zero', () => {
    expect(statusOf(f(26))).toBeUndefined();
    expect(statusOf(f(3, 0))).toBeUndefined();
  });

  it('is undefined for a step count, which builds up through the day', () => {
    // As buildFactSheet builds it: today's steps carry a 30-day usual, but a
    // morning count far under that usual is not "below usual".
    const steps: Fact = { id: 'steps.today', label: 'Steps today so far', value: 2140, unit: 'count', display: '2,140', usual: 8200 };
    expect(statusOf(steps)).toBeUndefined();
  });
});

describe('deltaDisplayOf', () => {
  const of = (unit: Fact['unit'], value: number, usual?: number, lowerIsBetter?: boolean): Fact => ({
    id: 'x',
    label: 'X',
    value,
    unit,
    display: String(value),
    ...(usual === undefined ? {} : { usual }),
    ...(lowerIsBetter ? { lowerIsBetter } : {}),
  });

  it('signs the difference with a real minus or a plus, in the unit the sheet writes', () => {
    expect(deltaDisplayOf(of('minutes', 408, 433))).toBe(`${MINUS}25m`);
    expect(deltaDisplayOf(of('minutes', 540, 433))).toBe('+1h 47m');
    expect(deltaDisplayOf(of('bpm', 61, 57, true))).toBe('+4 bpm');
    expect(deltaDisplayOf(of('ms', 41, 52.3))).toBe(`${MINUS}11.3 ms`);
    expect(deltaDisplayOf(of('score', 46, 58))).toBe(`${MINUS}12 points`);
    expect(deltaDisplayOf(of('score', 59, 58))).toBe('+1 point');
    expect(deltaDisplayOf(of('percent', 34, 26))).toBe('+8%');
    expect(deltaDisplayOf(of('none', 3, 5))).toBe(`${MINUS}2`);
  });

  it('uses the same number as the sheet comparison', () => {
    const fact = of('minutes', 408, 433);
    expect(renderFact(fact)).toContain('25m less than usual');
    expect(Math.abs(comparisonDiff(fact)!)).toBe(25);
  });

  it('is undefined without a usual, with a usual of 0, for a count, or with no difference', () => {
    expect(deltaDisplayOf(of('score', 26))).toBeUndefined();
    expect(deltaDisplayOf(of('ms', 3, 0))).toBeUndefined();
    expect(deltaDisplayOf(of('count', 2140, 8200))).toBeUndefined();
    expect(deltaDisplayOf(of('score', 58, 58))).toBeUndefined();
  });
});

describe('hasComparison', () => {
  it('is the one rule for the sheet comparison and the card status: a usual, and not a count', () => {
    expect(hasComparison({ id: 'x', label: 'X', value: 1, unit: 'score', display: '1', usual: 2 })).toBe(true);
    expect(hasComparison({ id: 'x', label: 'X', value: 1, unit: 'score', display: '1' })).toBe(false);
    expect(hasComparison({ id: 'x', label: 'X', value: 1, unit: 'count', display: '1', usual: 2 })).toBe(false);
  });
});
