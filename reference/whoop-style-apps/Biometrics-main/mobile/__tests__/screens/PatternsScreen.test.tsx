import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PatternsScreen } from '../../src/screens/PatternsScreen';
import { fetchHabitConfig, fetchPatterns, type PatternDTO } from '../../src/api/habits';

jest.mock('../../src/api/habits');

const habitTypes = [
  { type: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', exposureThreshold: 2, builtIn: true },
  { type: 'CAFFEINE', label: 'Caffeine', unit: 'cups', exposureThreshold: 3, builtIn: true },
  { type: 'CUSTOM_MEDITATION', label: 'Meditation', unit: 'minutes', exposureThreshold: 10, builtIn: false },
];

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
      days: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
      habit: [1, 0, 1, 0],
      factor: [0.1, -1.2, 0.2, -1],
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchHabitConfig as jest.Mock).mockResolvedValue(habitTypes);
});

describe('PatternsScreen', () => {
  it('shows a loading state while patterns are fetched', () => {
    (fetchPatterns as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { getByTestId } = render(<PatternsScreen />);

    expect(getByTestId('patterns-loading')).toBeTruthy();
  });

  it('lists each confirmed pattern as a correlation card with its deterministic sentence', async () => {
    (fetchPatterns as jest.Mock).mockResolvedValue({
      patterns: [
        pattern(),
        pattern({ habitType: 'CAFFEINE', exposureThreshold: 3, exposureUnit: 'cups', factor: 'RHR', factorLabel: 'Resting HR', lagDays: 2, effectSizePercent: 4, direction: 'higher', sampleSize: 20 }),
      ],
      notEnoughData: [],
    });

    const { findByTestId, getAllByTestId, getByText, queryByTestId, queryByText } = render(<PatternsScreen />);

    expect(await findByTestId('correlation-card-ALCOHOL-HRV-1')).toBeTruthy();
    expect(getByText(/^The morning after you log 2\+ drinks, your HRV has averaged 14% below baseline/)).toBeTruthy();
    expect(getByText(/^2 days after you log 3\+ cups, your resting heart rate has averaged 4% above baseline/)).toBeTruthy();
    expect(getAllByTestId(/^correlation-card-/)).toHaveLength(2);
    // The habit's label comes from the config.
    expect(getByText('Alcohol')).toBeTruthy();
    expect(getByText('Caffeine')).toBeTruthy();
    expect(queryByText(/daily minimum/i)).toBeNull();
    expect(queryByTestId('patterns-empty')).toBeNull();
  });

  it('shows a progress line for habits that do not have enough data yet, worded from the unexposed count', async () => {
    (fetchPatterns as jest.Mock).mockResolvedValue({
      patterns: [],
      notEnoughData: [
        { habitType: 'ALCOHOL', exposedDays: 10, unexposedDays: 3, requiredEach: 8 },
        { habitType: 'CAFFEINE', exposedDays: 9, unexposedDays: 6, requiredEach: 8 },
        { habitType: 'CUSTOM_MEDITATION', exposedDays: 2, unexposedDays: 12, requiredEach: 8 },
      ],
    });

    const { findByTestId, getByText } = render(<PatternsScreen />);

    expect(await findByTestId('not-enough-data-ALCOHOL')).toBeTruthy();
    expect(getByText("Log 'nothing today' on days you don't drink so patterns can be found — 3 of 8 needed")).toBeTruthy();
    expect(getByText("Log 'nothing today' on days you don't have caffeine so patterns can be found — 6 of 8 needed")).toBeTruthy();
    expect(getByText('Keep logging on days you do meditation so patterns can be found — 2 of 8 needed')).toBeTruthy();
  });

  it('exposes progress toward the requirement to assistive tech', async () => {
    (fetchPatterns as jest.Mock).mockResolvedValue({
      patterns: [],
      notEnoughData: [{ habitType: 'ALCOHOL', exposedDays: 10, unexposedDays: 3, requiredEach: 8 }],
    });

    const { findByTestId } = render(<PatternsScreen />);

    const progress = await findByTestId('not-enough-data-progress-ALCOHOL');
    expect(progress.props.accessibilityValue).toEqual({ min: 0, max: 8, now: 3 });
  });

  it('falls back to a humanised habit name when the config cannot be loaded', async () => {
    (fetchHabitConfig as jest.Mock).mockRejectedValue(new Error('boom'));
    (fetchPatterns as jest.Mock).mockResolvedValue({
      patterns: [],
      notEnoughData: [{ habitType: 'CUSTOM_MEDITATION', exposedDays: 12, unexposedDays: 2, requiredEach: 8 }],
    });

    const { findByText } = render(<PatternsScreen />);

    expect(await findByText("Log 'nothing today' on days you don't do custom meditation so patterns can be found — 2 of 8 needed")).toBeTruthy();
  });

  it('explains the two-weekly-runs rule in the empty state and shows no candidate patterns', async () => {
    (fetchPatterns as jest.Mock).mockResolvedValue({ patterns: [], notEnoughData: [] });

    const { findByTestId, getByText, queryByTestId } = render(<PatternsScreen />);

    expect(await findByTestId('patterns-empty')).toBeTruthy();
    expect(getByText(/two weekly/i)).toBeTruthy();
    expect(queryByTestId(/^correlation-card-/)).toBeNull();
  });

  it('shows the empty state alongside the progress lines when nothing is confirmed yet', async () => {
    (fetchPatterns as jest.Mock).mockResolvedValue({
      patterns: [],
      notEnoughData: [{ habitType: 'ALCOHOL', exposedDays: 10, unexposedDays: 3, requiredEach: 8 }],
    });

    const { findByTestId } = render(<PatternsScreen />);

    expect(await findByTestId('patterns-empty')).toBeTruthy();
    expect(await findByTestId('not-enough-data-ALCOHOL')).toBeTruthy();
  });

  it('shows an error with a retry when loading fails, and recovers on retry', async () => {
    (fetchPatterns as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    const { findByText, getByTestId } = render(<PatternsScreen />);
    expect(await findByText(/Patterns are unavailable right now/i)).toBeTruthy();

    (fetchPatterns as jest.Mock).mockResolvedValue({ patterns: [pattern()], notEnoughData: [] });
    fireEvent.press(getByTestId('patterns-retry'));

    await waitFor(() => expect(getByTestId('correlation-card-ALCOHOL-HRV-1')).toBeTruthy());
  });
});
