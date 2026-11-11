import {
  alignSeries,
  buildComparisonSentence,
  buildNotEnoughDataLine,
  buildPatternSentence,
  buildSampleCaveat,
  factorPhrase,
  isSmallSample,
  lagPhrase,
  SMALL_SAMPLE_THRESHOLD,
} from '../../src/lib/patternSentence';
import type { PatternDTO } from '../../src/api/habits';

function pattern(overrides: Partial<PatternDTO> = {}): PatternDTO {
  return {
    habitType: 'ALCOHOL',
    exposureThreshold: 2,
    exposureUnit: 'drinks',
    factor: 'HRV',
    factorLabel: 'HRV',
    lagDays: 1,
    effectSizePercent: -14,
    comparisonPercent: 1.5,
    sampleSize: 11,
    direction: 'lower',
    series: { days: [], habit: [], factor: [] },
    ...overrides,
  };
}

describe('lagPhrase', () => {
  it('reads "The morning after" for lag 1 and "N days after" beyond it', () => {
    expect(lagPhrase(1)).toBe('The morning after');
    expect(lagPhrase(2)).toBe('2 days after');
    expect(lagPhrase(3)).toBe('3 days after');
  });
});

describe('factorPhrase', () => {
  it('words each factor from the structured field', () => {
    expect(factorPhrase('HRV', 'HRV')).toBe('HRV');
    expect(factorPhrase('SLEEP_DURATION', 'Sleep duration')).toBe('sleep duration');
    expect(factorPhrase('SLEEP_EFFICIENCY', 'Sleep efficiency')).toBe('sleep efficiency');
    expect(factorPhrase('CIRCADIAN_CONSISTENCY', 'Circadian consistency')).toBe('sleep-timing consistency');
  });

  it('words the RHR factor as resting heart rate, whatever label the server sends', () => {
    expect(factorPhrase('RHR', 'Resting HR')).toBe('resting heart rate');
    expect(factorPhrase('RHR', 'RESTING_HR')).toBe('resting heart rate');
    expect(factorPhrase('RHR', 'Resting HR')).not.toMatch(/minimum/i);
  });

  it('falls back to the server label for an unknown factor, normalising a "resting" label', () => {
    expect(factorPhrase('SOMETHING_NEW' as never, 'Skin temperature')).toBe('Skin temperature');
    expect(factorPhrase('SOMETHING_NEW' as never, 'Resting pulse')).toBe('resting heart rate');
  });
});

describe('buildPatternSentence', () => {
  it('builds the spec worked example for lag 1, below baseline', () => {
    expect(buildPatternSentence(pattern())).toBe(
      'The morning after you log 2+ drinks, your HRV has averaged 14% below baseline (across 11 observations) — this is a pattern in your own data, not a general medical claim.',
    );
  });

  it('says "N days after" for lags above 1', () => {
    expect(buildPatternSentence(pattern({ lagDays: 2 }))).toMatch(/^2 days after you log 2\+ drinks, /);
    expect(buildPatternSentence(pattern({ lagDays: 3 }))).toMatch(/^3 days after you log 2\+ drinks, /);
  });

  it('says "above" for a positive effect and uses the absolute value', () => {
    const sentence = buildPatternSentence(
      pattern({ habitType: 'WORKOUT', exposureThreshold: 20, exposureUnit: 'minutes', factor: 'SLEEP_DURATION', factorLabel: 'Sleep duration', effectSizePercent: 8.4, direction: 'higher' }),
    );

    expect(sentence).toBe(
      'The morning after you log 20+ minutes, your sleep duration has averaged 8.4% above baseline (across 11 observations) — this is a pattern in your own data, not a general medical claim.',
    );
  });

  it('describes the RHR factor as resting heart rate', () => {
    const sentence = buildPatternSentence(
      pattern({ habitType: 'CAFFEINE', exposureThreshold: 3, exposureUnit: 'cups', factor: 'RHR', factorLabel: 'Resting HR', effectSizePercent: 5, direction: 'higher' }),
    );

    expect(sentence).toContain('your resting heart rate has averaged 5% above baseline');
    expect(sentence).not.toMatch(/minimum/i);
  });

  it('formats a fractional threshold without trailing noise', () => {
    expect(buildPatternSentence(pattern({ exposureThreshold: 0.5, exposureUnit: 'litres' }))).toContain('log 0.5+ litres');
  });

  it('uses the singular for a single observation', () => {
    expect(buildPatternSentence(pattern({ sampleSize: 1 }))).toContain('(across 1 observation)');
  });

  it('is deterministic and always carries the not-a-medical-claim framing', () => {
    const a = buildPatternSentence(pattern());
    expect(buildPatternSentence(pattern())).toBe(a);
    expect(a).toMatch(/not a general medical claim\.$/);
  });
});

describe('buildComparisonSentence', () => {
  it('reads the effect against the unexposed control, below baseline', () => {
    expect(buildComparisonSentence(pattern({ comparisonPercent: -2 }))).toBe(
      'On days you log under 2 drinks, your HRV has averaged 2% below baseline.',
    );
  });

  it('reads above baseline for a positive comparison', () => {
    expect(buildComparisonSentence(pattern({ comparisonPercent: 1.5 }))).toBe(
      'On days you log under 2 drinks, your HRV has averaged 1.5% above baseline.',
    );
  });
});

describe('sample size', () => {
  it('treats fewer than 10 observations as a small sample', () => {
    expect(SMALL_SAMPLE_THRESHOLD).toBe(10);
    expect(isSmallSample(9)).toBe(true);
    expect(isSmallSample(10)).toBe(false);
  });

  it('always states the sample size', () => {
    expect(buildSampleCaveat(11)).toMatch(/11 observations/);
    expect(buildSampleCaveat(1)).toMatch(/1 observation\b/);
  });
});

describe('alignSeries', () => {
  // The server's series is already aligned at the tested lag: factor[i] is the
  // reading for habit day days[i] + lag. The client must NOT shift it again.
  it('zips the server-aligned arrays without shifting the factor by the lag', () => {
    const aligned = alignSeries({ days: ['d1', 'd2', 'd3', 'd4'], habit: [1, 0, 1, 0], factor: [10, 20, null, 40] });

    expect(aligned).toEqual([
      { day: 'd1', exposed: true, value: 10 },
      { day: 'd2', exposed: false, value: 20 },
      { day: 'd3', exposed: true, value: null },
      { day: 'd4', exposed: false, value: 40 },
    ]);
  });

  it('keeps every habit day, including the last ones (no tail is dropped)', () => {
    const aligned = alignSeries({ days: ['d1', 'd2', 'd3'], habit: [1, 1, 1], factor: [1, 2, 3] });

    expect(aligned).toHaveLength(3);
    expect(aligned.map((p) => p.value)).toEqual([1, 2, 3]);
  });

  it('treats a missing factor entry as null', () => {
    const aligned = alignSeries({ days: ['d1', 'd2'], habit: [0, 1], factor: [5] });

    expect(aligned[1]).toEqual({ day: 'd2', exposed: true, value: null });
  });
});

describe('buildNotEnoughDataLine', () => {
  const base = { habitType: 'ALCOHOL', exposedDays: 10, unexposedDays: 3, requiredEach: 8 };

  it('asks for "nothing today" check-ins when unexposed days are short', () => {
    expect(buildNotEnoughDataLine(base, 'Alcohol')).toBe(
      "Log 'nothing today' on days you don't drink so patterns can be found — 3 of 8 needed",
    );
  });

  it('words the built-in habits naturally', () => {
    expect(buildNotEnoughDataLine({ ...base, habitType: 'CAFFEINE', unexposedDays: 5 }, 'Caffeine')).toBe(
      "Log 'nothing today' on days you don't have caffeine so patterns can be found — 5 of 8 needed",
    );
    expect(buildNotEnoughDataLine({ ...base, habitType: 'WORKOUT', unexposedDays: 0 }, 'Workout')).toBe(
      "Log 'nothing today' on days you don't work out so patterns can be found — 0 of 8 needed",
    );
  });

  it('words a custom habit from its label', () => {
    expect(buildNotEnoughDataLine({ ...base, habitType: 'CUSTOM_MEDITATION', unexposedDays: 2 }, 'Meditation')).toBe(
      "Log 'nothing today' on days you don't do meditation so patterns can be found — 2 of 8 needed",
    );
  });

  it('asks for more logged days when it is the exposed side that is short', () => {
    expect(buildNotEnoughDataLine({ ...base, exposedDays: 4, unexposedDays: 12 }, 'Alcohol')).toBe(
      'Keep logging on days you drink so patterns can be found — 4 of 8 needed',
    );
  });

  it('caps the shown progress at the requirement', () => {
    expect(buildNotEnoughDataLine({ ...base, exposedDays: 20, unexposedDays: 20 }, 'Alcohol')).toContain('8 of 8');
  });
});
