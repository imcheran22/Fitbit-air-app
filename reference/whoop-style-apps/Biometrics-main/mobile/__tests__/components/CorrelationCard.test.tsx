import React from 'react';
import { render } from '@testing-library/react-native';
import { CorrelationCard } from '../../src/components/ui/correlation-card';
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
    series: {
      days: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'],
      habit: [1, 0, 1, 0, 0, 1],
      factor: [0.2, -1.4, 0.3, -1.1, null, 0.1],
    },
    ...overrides,
  };
}

describe('CorrelationCard', () => {
  it('renders the deterministic sentence for lag 1, below baseline', () => {
    const { getByTestId } = render(<CorrelationCard pattern={pattern()} habitLabel="Alcohol" />);

    expect(getByTestId('pattern-sentence').props.children).toBe(
      'The morning after you log 2+ drinks, your HRV has averaged 14% below baseline (across 11 observations) — this is a pattern in your own data, not a general medical claim.',
    );
  });

  it('renders "N days after" for lags above 1', () => {
    const { getByTestId } = render(<CorrelationCard pattern={pattern({ lagDays: 3 })} />);

    expect(getByTestId('pattern-sentence').props.children).toMatch(/^3 days after you log 2\+ drinks, /);
  });

  it('handles a positive (above baseline / higher) pattern', () => {
    const { getByTestId, getByText } = render(
      <CorrelationCard
        pattern={pattern({ habitType: 'WORKOUT', exposureThreshold: 20, exposureUnit: 'minutes', factor: 'SLEEP_DURATION', factorLabel: 'Sleep duration', effectSizePercent: 6, comparisonPercent: -1, direction: 'higher' })}
        habitLabel="Workout"
      />,
    );

    expect(getByTestId('pattern-sentence').props.children).toContain('your sleep duration has averaged 6% above baseline');
    expect(getByText('Higher than on other days')).toBeTruthy();
  });

  it('shows the lower direction badge for a negative pattern', () => {
    const { getByText } = render(<CorrelationCard pattern={pattern()} />);

    expect(getByText('Lower than on other days')).toBeTruthy();
  });

  it('words the RHR factor as resting heart rate, never a daily minimum', () => {
    const { getByTestId, queryByText } = render(
      <CorrelationCard pattern={pattern({ factor: 'RHR', factorLabel: 'Resting HR', effectSizePercent: 4, direction: 'higher' })} />,
    );

    expect(getByTestId('pattern-sentence').props.children).toContain('your resting heart rate has averaged 4% above baseline');
    expect(queryByText(/daily minimum/i)).toBeNull();
  });

  it('shows the control comparison alongside the effect', () => {
    const { getByText } = render(<CorrelationCard pattern={pattern()} />);

    expect(getByText('On days you log under 2 drinks, your HRV has averaged 1.5% above baseline.')).toBeTruthy();
  });

  it('always shows the sample size as a visible line, not just in the sentence', () => {
    const { getByTestId } = render(<CorrelationCard pattern={pattern()} />);

    expect(getByTestId('pattern-caveat').props.children).toMatch(/11 observations/);
  });

  it('adds a small-sample hint below 10 observations and not at 10 or more', () => {
    const small = render(<CorrelationCard pattern={pattern({ sampleSize: 9 })} />);
    expect(small.getByTestId('pattern-small-sample')).toBeTruthy();
    expect(small.getByTestId('pattern-caveat').props.children).toMatch(/9 observations/);

    const enough = render(<CorrelationCard pattern={pattern({ sampleSize: 10 })} />);
    expect(enough.queryByTestId('pattern-small-sample')).toBeNull();
  });

  it('draws a sparkline aligned at the tested lag with a caption naming that lag', () => {
    const { getByTestId } = render(<CorrelationCard pattern={pattern({ lagDays: 2 })} />);

    expect(getByTestId('pattern-sparkline')).toBeTruthy();
    expect(getByTestId('pattern-sparkline-caption').props.children).toContain('2 days after each day');
  });

  it('omits the sparkline when the series has too little data to draw', () => {
    const { queryByTestId } = render(
      <CorrelationCard pattern={pattern({ series: { days: [], habit: [], factor: [] } })} />,
    );

    expect(queryByTestId('pattern-sparkline')).toBeNull();
    expect(queryByTestId('pattern-sparkline-caption')).toBeNull();
  });

  it('falls back to a humanised habit type when no label is given', () => {
    const { getByText } = render(<CorrelationCard pattern={pattern({ habitType: 'CUSTOM_MEDITATION' })} />);

    expect(getByText('Custom meditation')).toBeTruthy();
  });

  it('matches its snapshot for a negative lag-1 pattern', () => {
    const { toJSON } = render(<CorrelationCard pattern={pattern()} habitLabel="Alcohol" />);

    expect(toJSON()).toMatchSnapshot();
  });

  it('matches its snapshot for a positive lag-3 small-sample pattern', () => {
    const { toJSON } = render(
      <CorrelationCard
        pattern={pattern({ lagDays: 3, sampleSize: 8, effectSizePercent: 5.5, comparisonPercent: -0.5, direction: 'higher', factor: 'SLEEP_EFFICIENCY', factorLabel: 'Sleep efficiency' })}
        habitLabel="Workout"
      />,
    );

    expect(toJSON()).toMatchSnapshot();
  });
});
