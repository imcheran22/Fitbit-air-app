import {
  buildScoreHeadline,
  buildScoreVerdict,
  buildBaselineSentence,
  formatPoints,
  scoreBand,
  DEFAULT_SCORE_BANDS,
  sortFactorsByImpact,
  pickColdStartProgress,
  SCORE_FRAMING,
  SLEEP_SCORE_FRAMING,
  metricName,
} from '../../src/lib/scoreInsights';
import type { DailyScoreDTO, FactorDTO } from '../../src/api/scores';

function factor(overrides: Partial<FactorDTO> & Pick<FactorDTO, 'factor'>): FactorDTO {
  const labels = {
    HRV: 'HRV',
    RHR: 'Resting HR',
    SLEEP_DEBT: 'Sleep debt',
    SLEEP_DURATION: 'Sleep duration',
    SLEEP_EFFICIENCY: 'Sleep efficiency',
    CIRCADIAN_CONSISTENCY: 'Bedtime consistency',
  } as const;
  return {
    label: labels[overrides.factor],
    z: 0,
    weight: 0.3,
    contribution: 0,
    points: 0,
    imputed: false,
    excluded: false,
    ...overrides,
  };
}

function score(overrides: Partial<DailyScoreDTO> = {}): DailyScoreDTO {
  return {
    date: '2026-09-19',
    type: 'RECOVERY',
    score: 72,
    confidenceLevel: 'HIGH',
    algorithmVersion: 'v1',
    factors: [],
    coldStart: [],
    ...overrides,
  };
}

describe('buildScoreVerdict', () => {
  it('names the factor that lifted the score most', () => {
    const verdict = buildScoreVerdict(
      score({ factors: [factor({ factor: 'HRV', points: 8.2 }), factor({ factor: 'RHR', points: -3.1 })] }),
    );
    expect(verdict).toBe('HRV is lifting it today.');
  });

  it('names the factor that held it back when the biggest mover is a drag', () => {
    const verdict = buildScoreVerdict(
      score({ factors: [factor({ factor: 'HRV', points: 1.1 }), factor({ factor: 'RHR', points: -6.4 })] }),
    );
    expect(verdict).toBe('Resting HR is holding it back today.');
  });

  it('ignores excluded factors', () => {
    const verdict = buildScoreVerdict(
      score({ factors: [factor({ factor: 'HRV', points: 99, excluded: true }), factor({ factor: 'SLEEP_DEBT', points: 2 })] }),
    );
    expect(verdict).toBe('Sleep debt is lifting it today.');
  });

  it('says the day is around baseline when no factor moved it', () => {
    expect(buildScoreVerdict(score({ factors: [factor({ factor: 'HRV', points: 0.1 })] }))).toBe(
      'Right around your own baseline today.',
    );
  });

  it('is null when there is no score to explain', () => {
    expect(buildScoreVerdict(score({ score: null, factors: [factor({ factor: 'HRV', excluded: true })] }))).toBeNull();
    expect(buildScoreVerdict(score({ factors: [] }))).toBeNull();
  });
});

describe('buildScoreHeadline', () => {
  it('names the largest-|points| factor as the biggest lift on a positive day', () => {
    const headline = buildScoreHeadline(
      score({
        score: 78,
        factors: [
          factor({ factor: 'HRV', points: 8.2 }),
          factor({ factor: 'RHR', points: -3.1 }),
          factor({ factor: 'SLEEP_DEBT', points: -1.4 }),
        ],
      }),
    );

    expect(headline).toContain('Your Recovery Score is 78.');
    expect(headline).toContain('HRV is the biggest lift on your Recovery Score today (+8.2 pts).');
  });

  it('names the largest-|points| factor as the biggest drag on a negative day', () => {
    const headline = buildScoreHeadline(
      score({
        score: 41,
        factors: [
          factor({ factor: 'HRV', points: 1.1 }),
          factor({ factor: 'RHR', points: -6.4 }),
          factor({ factor: 'SLEEP_DEBT', points: -2 }),
        ],
      }),
    );

    expect(headline).toContain('Resting HR is the biggest drag on your Recovery Score today (−6.4 pts).');
  });

  it('handles a single dominant factor without mentioning the others', () => {
    const headline = buildScoreHeadline(
      score({
        score: 66,
        factors: [
          factor({ factor: 'HRV', points: 12 }),
          factor({ factor: 'RHR', points: 0.1 }),
          factor({ factor: 'SLEEP_DEBT', points: -0.2 }),
        ],
      }),
    );

    expect(headline).toContain('HRV is the biggest lift');
    expect(headline).not.toContain('Sleep debt is the biggest');
  });

  it('says nothing stands out when every factor is near zero', () => {
    const headline = buildScoreHeadline(
      score({
        score: 50,
        factors: [factor({ factor: 'HRV', points: 0.1 }), factor({ factor: 'RHR', points: -0.2 })],
      }),
    );

    expect(headline).toContain('right around your own baseline');
    expect(headline).not.toMatch(/biggest (lift|drag)/);
  });

  it('never picks an excluded factor as the driver', () => {
    const headline = buildScoreHeadline(
      score({
        factors: [
          factor({ factor: 'HRV', points: 99, excluded: true }),
          factor({ factor: 'RHR', points: -2 }),
          factor({ factor: 'SLEEP_DEBT', points: 1 }),
        ],
      }),
    );

    expect(headline).toContain('Resting HR is the biggest drag');
    expect(headline).toContain('Still building a baseline for HRV, so today’s score relies on the other factors.');
  });

  it('flags an imputed factor as estimated rather than measured', () => {
    const headline = buildScoreHeadline(
      score({
        factors: [
          factor({ factor: 'HRV', points: 5, imputed: true }),
          factor({ factor: 'RHR', points: -1 }),
        ],
      }),
    );

    expect(headline).toContain('HRV wasn’t recorded that day, so it’s estimated from your baseline.');
  });

  it('explains a cold-start day (score null) with the closest-to-ready metric and no invented number', () => {
    const headline = buildScoreHeadline(
      score({
        score: null,
        factors: [
          factor({ factor: 'HRV', excluded: true }),
          factor({ factor: 'RHR', excluded: true }),
          factor({ factor: 'SLEEP_DEBT', excluded: true }),
        ],
        coldStart: [
          { metric: 'HRV', daysCollected: 9, daysRequired: 14 },
          { metric: 'RESTING_HR', daysCollected: 3, daysRequired: 14 },
        ],
      }),
    );

    expect(headline).toContain('Your Recovery Score isn’t ready yet');
    expect(headline).toContain('9 of 14 days of HRV');
    expect(headline).not.toMatch(/biggest (lift|drag)/);
  });

  it('describes a cold-start RESTING_HR metric as resting heart rate, never a daily minimum', () => {
    const headline = buildScoreHeadline(
      score({
        score: null,
        factors: [],
        coldStart: [{ metric: 'RESTING_HR', daysCollected: 4, daysRequired: 14 }],
      }),
    );

    expect(headline).toContain('resting heart rate');
    expect(headline.toLowerCase()).not.toContain('daily minimum');
  });

  it('copes with a null score and no cold-start detail', () => {
    expect(buildScoreHeadline(score({ score: null, factors: [], coldStart: [] }))).toContain('isn’t ready yet');
  });

  it('labels a Sleep Score by its own type', () => {
    const headline = buildScoreHeadline(score({ type: 'SLEEP', factors: [factor({ factor: 'HRV', points: 4 })] }));

    expect(headline).toContain('Your Sleep Score is 72.');
  });

  it.each([
    ['a lift', [factor({ factor: 'HRV', points: 5 })], 72],
    ['a drag', [factor({ factor: 'HRV', points: -5 })], 72],
    ['steady', [factor({ factor: 'HRV', points: 0 })], 72],
    ['cold start', [], null],
  ] as const)('always carries the not-a-medical-assessment framing (%s)', (_name, factors, value) => {
    expect(buildScoreHeadline(score({ score: value, factors: [...factors] }))).toContain(SCORE_FRAMING);
  });

  it('only uses numbers present in the data', () => {
    const headline = buildScoreHeadline(
      score({ score: 64, factors: [factor({ factor: 'HRV', points: 3.4 }), factor({ factor: 'RHR', points: -1 })] }),
    );
    const numbers = headline.match(/\d+(\.\d+)?/g) ?? [];

    expect(numbers.sort()).toEqual(['3.4', '64']);
  });
});

describe('buildScoreHeadline (SLEEP)', () => {
  const sleepScore = (overrides: Partial<DailyScoreDTO> = {}) => score({ type: 'SLEEP', score: 74, ...overrides });

  it('names a single dominant factor as the biggest lift', () => {
    const headline = buildScoreHeadline(
      sleepScore({
        factors: [
          factor({ factor: 'SLEEP_DURATION', points: 0.1, weight: 0.45 }),
          factor({ factor: 'SLEEP_EFFICIENCY', points: 9.3, weight: 0.35 }),
          factor({ factor: 'CIRCADIAN_CONSISTENCY', points: -0.2, weight: 0.2 }),
        ],
      }),
    );

    expect(headline).toContain('Your Sleep Score is 74.');
    expect(headline).toContain('Sleep efficiency is the biggest lift on your Sleep Score today (+9.3 pts).');
    expect(headline).not.toContain('Bedtime consistency is the biggest');
  });

  it('says duration is measured against the sleep goal, and that the night fell short of it', () => {
    const headline = buildScoreHeadline(
      sleepScore({
        score: 48,
        factors: [
          factor({ factor: 'SLEEP_DURATION', points: -7.6, weight: 0.45 }),
          factor({ factor: 'SLEEP_EFFICIENCY', points: 1.2, weight: 0.35 }),
          factor({ factor: 'CIRCADIAN_CONSISTENCY', points: 0.3, weight: 0.2 }),
        ],
      }),
    );

    expect(headline).toContain('Sleep duration is the biggest drag on your Sleep Score today (−7.6 pts).');
    expect(headline).toContain('against your sleep goal');
    expect(headline).toContain('under it');
  });

  it('never implies duration is compared to the person’s own average', () => {
    const headline = buildScoreHeadline(
      sleepScore({
        factors: [
          factor({ factor: 'SLEEP_DURATION', points: -4, weight: 0.45 }),
          factor({ factor: 'SLEEP_EFFICIENCY', points: 2, weight: 0.35 }),
        ],
      }),
    );

    expect(headline).not.toMatch(/your own (recent )?(readings|average)/i);
    expect(headline).not.toContain('your own baseline');
  });

  it('describes a duration at or above goal without saying it fell short', () => {
    const headline = buildScoreHeadline(
      sleepScore({ score: 88, factors: [factor({ factor: 'SLEEP_DURATION', points: 6, weight: 0.45 })] }),
    );

    expect(headline).toContain('Sleep duration is the biggest lift');
    expect(headline).toContain('against your sleep goal');
    expect(headline).toContain('met it');
    expect(headline).not.toContain('under it');
  });

  it('keeps a high-efficiency night to the efficiency sentence when duration is not a factor yet', () => {
    const headline = buildScoreHeadline(
      sleepScore({ factors: [factor({ factor: 'SLEEP_EFFICIENCY', points: 5.5, weight: 0.35 })] }),
    );

    expect(headline).toContain('Sleep efficiency is the biggest lift on your Sleep Score today (+5.5 pts).');
    expect(headline).not.toContain('sleep goal');
  });

  it('says bedtime consistency needs more nights when only some factors are available', () => {
    const headline = buildScoreHeadline(
      sleepScore({
        factors: [
          factor({ factor: 'SLEEP_DURATION', points: 3, weight: 0.45 }),
          factor({ factor: 'SLEEP_EFFICIENCY', points: -1, weight: 0.35 }),
          factor({ factor: 'CIRCADIAN_CONSISTENCY', points: 0, excluded: true, weight: 0.2 }),
        ],
        coldStart: [{ metric: 'CIRCADIAN_CONSISTENCY', daysCollected: 9, daysRequired: 27 }],
      }),
    );

    expect(headline).toContain('Bedtime consistency needs a few more nights');
    expect(headline).toContain('relies on the other factors');
    expect(headline).not.toContain('Bedtime consistency is the biggest');
  });

  it('explains an all-excluded day with the closest-to-ready metric and no invented number', () => {
    const headline = buildScoreHeadline(
      sleepScore({
        score: null,
        factors: [
          factor({ factor: 'SLEEP_DURATION', excluded: true }),
          factor({ factor: 'SLEEP_EFFICIENCY', excluded: true }),
          factor({ factor: 'CIRCADIAN_CONSISTENCY', excluded: true }),
        ],
        coldStart: [
          { metric: 'SLEEP', daysCollected: 5, daysRequired: 7 },
          { metric: 'CIRCADIAN_CONSISTENCY', daysCollected: 2, daysRequired: 27 },
        ],
      }),
    );

    expect(headline).toContain('Your Sleep Score isn’t ready yet');
    expect(headline).toContain('5 of 7 days of sleep');
    expect(headline).not.toMatch(/biggest (lift|drag)/);
    expect(headline).toContain(SLEEP_SCORE_FRAMING);
  });

  it('says nothing stands out when every factor is near zero', () => {
    const headline = buildScoreHeadline(
      sleepScore({
        factors: [factor({ factor: 'SLEEP_EFFICIENCY', points: 0.1 }), factor({ factor: 'SLEEP_DURATION', points: -0.2 })],
      }),
    );

    expect(headline).not.toMatch(/biggest (lift|drag)/);
    expect(headline).toContain('No single factor stands out');
  });

  it.each([
    ['a lift', [factor({ factor: 'SLEEP_EFFICIENCY', points: 5 })], 72],
    ['a duration drag', [factor({ factor: 'SLEEP_DURATION', points: -5 })], 72],
    ['a cold start', [], null],
  ] as const)('always carries the not-a-medical-assessment framing (%s)', (_name, factors, value) => {
    const headline = buildScoreHeadline(sleepScore({ score: value, factors: [...factors] }));

    expect(headline).toContain(SLEEP_SCORE_FRAMING);
    expect(headline).toContain('not a medical assessment');
  });

  it('only uses numbers present in the data', () => {
    const headline = buildScoreHeadline(
      sleepScore({
        score: 61,
        factors: [factor({ factor: 'SLEEP_DURATION', points: -3.4 }), factor({ factor: 'SLEEP_EFFICIENCY', points: 1 })],
      }),
    );
    const numbers = headline.match(/\d+(\.\d+)?/g) ?? [];

    expect(numbers.sort()).toEqual(['3.4', '61']);
  });
});

describe('buildBaselineSentence (sleep metrics)', () => {
  it('formats a SLEEP_EFFICIENCY baseline as percentages', () => {
    expect(
      buildBaselineSentence({ metric: 'SLEEP_EFFICIENCY', ewma: 91.24, spread: 3.06, daysOfHistory: 30, windowDays: 30, unit: '%' }),
    ).toBe('Your sleep efficiency baseline: 91.2% ± 3.1%, based on your last 30 days.');
  });

  it('formats a CIRCADIAN_CONSISTENCY baseline in pts under the bedtime-consistency name', () => {
    expect(
      buildBaselineSentence({ metric: 'CIRCADIAN_CONSISTENCY', ewma: 78, spread: 8, daysOfHistory: 27, windowDays: 30, unit: 'pts' }),
    ).toBe('Your bedtime consistency baseline: 78 pts ± 8 pts, based on the 27 days of data so far.');
  });

  it('names the new metrics in plain words', () => {
    expect(metricName('SLEEP_EFFICIENCY')).toBe('sleep efficiency');
    expect(metricName('CIRCADIAN_CONSISTENCY')).toBe('bedtime consistency');
    expect(metricName('SLEEP_DEBT')).toBe('sleep debt');
  });
});

describe('buildBaselineSentence', () => {
  it('states the baseline, spread and window used', () => {
    expect(buildBaselineSentence({ metric: 'HRV', ewma: 42, spread: 6, daysOfHistory: 30, windowDays: 30, unit: 'ms' })).toBe(
      'Your HRV baseline: 42 ms ± 6 ms, based on your last 30 days.',
    );
  });

  it('rounds to one decimal place', () => {
    expect(buildBaselineSentence({ metric: 'HRV', ewma: 42.349, spread: 5.96, daysOfHistory: 30, windowDays: 30, unit: 'ms' })).toContain(
      '42.3 ms ± 6 ms',
    );
  });

  it('says how many days it actually has when history is shorter than the window', () => {
    expect(buildBaselineSentence({ metric: 'HRV', ewma: 42, spread: 6, daysOfHistory: 18, windowDays: 30, unit: 'ms' })).toContain(
      'based on the 18 days of data so far',
    );
  });

  it('names the RESTING_HR baseline as resting heart rate', () => {
    const sentence = buildBaselineSentence({ metric: 'RESTING_HR', ewma: 52, spread: 3, daysOfHistory: 30, windowDays: 30, unit: 'bpm' });

    expect(sentence).toContain('resting heart rate baseline');
    expect(sentence.toLowerCase()).not.toContain('daily minimum');
  });
});

describe('formatPoints', () => {
  it('signs positive and negative values to one decimal place', () => {
    expect(formatPoints(8.24)).toBe('+8.2 pts');
    expect(formatPoints(-3.06)).toBe('−3.1 pts');
  });

  it('shows zero without a sign, including values that round to zero', () => {
    expect(formatPoints(0)).toBe('0.0 pts');
    expect(formatPoints(-0.04)).toBe('0.0 pts');
  });
});

describe('scoreBand', () => {
  it.each([
    [100, 'scoreExcellent'],
    [75, 'scoreExcellent'],
    [74.9, 'scoreGood'],
    [55, 'scoreGood'],
    [54, 'scoreFair'],
    [40, 'scoreFair'],
    [39, 'scorePoor'],
    [0, 'scorePoor'],
  ])('maps %s to %s', (value, band) => {
    expect(scoreBand(value)).toBe(band);
  });
});

describe('scoreBand with server-provided bands', () => {
  const custom = { excellent: 90, good: 70, fair: 50 };

  it('exports the fallback thresholds', () => {
    expect(DEFAULT_SCORE_BANDS).toEqual({ excellent: 75, good: 55, fair: 40 });
  });

  it.each([
    [100, 'scoreExcellent'],
    [90, 'scoreExcellent'],
    [89.9, 'scoreGood'],
    [70, 'scoreGood'],
    [69.9, 'scoreFair'],
    [50, 'scoreFair'],
    [49.9, 'scorePoor'],
    [0, 'scorePoor'],
  ])('uses the given bands (lower bound inclusive): %s -> %s', (value, band) => {
    expect(scoreBand(value, custom)).toBe(band);
  });

  it('classifies a score differently from the defaults when the server says so', () => {
    expect(scoreBand(78)).toBe('scoreExcellent');
    expect(scoreBand(78, custom)).toBe('scoreGood');
  });

  it('accepts bounds at the edges of 0-100', () => {
    expect(scoreBand(0, { excellent: 100, good: 50, fair: 0 })).toBe('scoreFair');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty object', {}],
    ['missing field', { excellent: 90, good: 70 }],
    ['non-numeric', { excellent: '90', good: 70, fair: 50 }],
    ['NaN', { excellent: NaN, good: 70, fair: 50 }],
    ['Infinity', { excellent: Infinity, good: 70, fair: 50 }],
    ['equal thresholds (not strictly descending)', { excellent: 70, good: 70, fair: 50 }],
    ['ascending', { excellent: 40, good: 55, fair: 75 }],
    ['above 100', { excellent: 120, good: 70, fair: 50 }],
    ['below 0', { excellent: 90, good: 70, fair: -5 }],
    ['a string', 'nope'],
  ])('falls back to the defaults for %s', (_label, bands) => {
    for (const value of [100, 78, 75, 74.9, 55, 54, 40, 39, 0]) {
      expect(scoreBand(value, bands as never)).toBe(scoreBand(value));
    }
    expect(scoreBand(78, bands as never)).toBe('scoreExcellent');
  });
});

describe('sortFactorsByImpact', () => {
  it('sorts by |points| descending with excluded factors last, without mutating the input', () => {
    const input = [
      factor({ factor: 'HRV', points: 1 }),
      factor({ factor: 'RHR', points: -5 }),
      factor({ factor: 'SLEEP_DEBT', points: 99, excluded: true }),
    ];
    const copy = [...input];

    expect(sortFactorsByImpact(input).map((f) => f.factor)).toEqual(['RHR', 'HRV', 'SLEEP_DEBT']);
    expect(input).toEqual(copy);
  });
});

describe('pickColdStartProgress', () => {
  it('picks the metric closest to having enough history', () => {
    expect(
      pickColdStartProgress([
        { metric: 'RESTING_HR', daysCollected: 3, daysRequired: 14 },
        { metric: 'HRV', daysCollected: 9, daysRequired: 14 },
      ]),
    ).toEqual({ metric: 'HRV', daysCollected: 9, daysRequired: 14 });
  });

  it('returns null when nothing is cold-starting', () => {
    expect(pickColdStartProgress([])).toBeNull();
  });
});
