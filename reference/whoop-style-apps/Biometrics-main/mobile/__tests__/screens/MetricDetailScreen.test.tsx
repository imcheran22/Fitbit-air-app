import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { MetricDetailScreen, readingDate } from '../../src/screens/MetricDetailScreen';
import { addDays } from '../../src/lib/heatmap';

const mockSetOptions = jest.fn();
const mockReplace = jest.fn();
// One object across renders, as React Navigation gives, so effects keyed on it run once.
const mockNavigation = { setOptions: mockSetOptions, replace: mockReplace };
let mockParams: unknown;

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockParams }),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

function hrvSeries(values: number[], end = '2026-09-29') {
  return values.map((value, i) => ({
    id: `h-${i}`,
    metricType: 'HRV',
    value,
    recordedAt: `${addDays(end, -(values.length - 1 - i))}T00:00:00.000Z`,
  }));
}

describe('MetricDetailScreen', () => {
  it('shows the latest value, low/average/high, an insight, and recent readings for the given metric', async () => {
    const records = [
      { id: '1', metricType: 'STEPS', value: 8000, recordedAt: '2026-09-01T00:00:00.000Z' },
      { id: '2', metricType: 'STEPS', value: 12000, recordedAt: '2026-09-02T00:00:00.000Z' },
    ];
    mockParams = { metricType: 'STEPS', records };

    const { getAllByText, getByText } = render(<MetricDetailScreen />);

    await waitFor(() => {
      expect(getAllByText(/12,000/).length).toBeGreaterThan(0);
    });

    // Low/average/high computed from the real series (8,000 and 12,000).
    expect(getAllByText(/8,000/).length).toBeGreaterThan(0);
    expect(getAllByText(/10,000/).length).toBeGreaterThan(0);

    // The headline insight and the goal-comparison sentence.
    expect(getByText('Steps is 50% above your recent average.')).toBeTruthy();
    expect(getByText(/Today's reading is 120% of your 10,000 steps\./)).toBeTruthy();

    // Recent readings list, most recent first.
    expect(getByText(readingDate(records[1]))).toBeTruthy();
    expect(getByText(readingDate(records[0]))).toBeTruthy();
  });

  it('draws the big latest value with tabular figures', async () => {
    mockParams = { metricType: 'STEPS', records: [{ id: '1', metricType: 'STEPS', value: 12000, recordedAt: '2026-09-02T00:00:00.000Z' }] };

    const { getAllByText } = render(<MetricDetailScreen />);

    await waitFor(() => {
      expect(getAllByText(/12,000/).length).toBeGreaterThan(0);
    });
    const big = getAllByText(/12,000/).filter((el) => String(el.props.className).split(' ').includes('text-number'));
    expect(big).toHaveLength(1);
    expect(StyleSheet.flatten(big[0].props.style).fontVariant).toEqual(['tabular-nums']);
  });

  it('formats a reading date from its civil date, not shifted by timezone', () => {
    expect(readingDate({ id: 'x', metricType: 'HRV', value: 1, recordedAt: '2026-09-02T00:00:00.000Z' })).toBe('Wed, Sep 2');
  });

  it('shows an empty state when the metric has no data', () => {
    mockParams = { metricType: 'HRV', records: [] };

    const { getByText } = render(<MetricDetailScreen />);

    expect(getByText(/No hrv data yet/i)).toBeTruthy();
  });

  it('sets the header title to the metric label', () => {
    mockParams = {
      metricType: 'RESTING_HR',
      records: [{ id: '1', metricType: 'RESTING_HR', value: 58, recordedAt: '2026-09-01T00:00:00.000Z' }],
    };

    render(<MetricDetailScreen />);

    expect(mockSetOptions).toHaveBeenCalledWith({ title: 'Resting Heart Rate' });
  });

  it('says where the latest reading sits against the usual range', () => {
    mockParams = { metricType: 'HRV', records: hrvSeries([44, 46, 48, 50, 52, 54, 56, 70]) };

    const { getByTestId } = render(<MetricDetailScreen />);

    expect(getByTestId('metric-range-context')).toHaveTextContent('Above your usual range of 45.4–60.2 ms');
  });

  it('counts the readings still needed before there is a usual range', () => {
    mockParams = { metricType: 'HRV', records: hrvSeries([50, 52, 54]) };

    const { getByTestId } = render(<MetricDetailScreen />);

    expect(getByTestId('metric-range-context')).toHaveTextContent('Your usual range appears after 4 more readings');
  });

  it('opens on the range it was given, and the readings follow the selected range', () => {
    const values = Array.from({ length: 40 }, (_, i) => 40 + (i % 10));
    const records = hrvSeries(values);
    mockParams = { metricType: 'HRV', records, range: '7d' };

    const { queryByText, getByTestId } = render(<MetricDetailScreen />);

    // 7 days ending on the latest reading: the 8th-newest is outside it.
    expect(queryByText(readingDate(records[records.length - 7]))).toBeTruthy();
    expect(queryByText(readingDate(records[records.length - 8]))).toBeNull();

    fireEvent.press(getByTestId('metric-detail-range-90d'));
    expect(queryByText(readingDate(records[records.length - 8]))).toBeTruthy();
  });

  // Sleep has its own page (spec §5.1 #16); HRV, resting HR and steps keep this screen.
  it('replaces itself with the Sleep page for SLEEP and renders nothing', () => {
    mockParams = { metricType: 'SLEEP', records: [{ id: '1', metricType: 'SLEEP', value: 432, recordedAt: '2026-09-01T00:00:00.000Z' }] };

    const { toJSON } = render(<MetricDetailScreen />);

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('Sleep');
    expect(toJSON()).toBeNull();
  });

  it('stays on this screen for HRV', () => {
    mockParams = { metricType: 'HRV', records: hrvSeries([44, 46, 48, 50, 52, 54, 56, 70]) };

    const { getByTestId } = render(<MetricDetailScreen />);

    expect(getByTestId('metric-range-context')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
