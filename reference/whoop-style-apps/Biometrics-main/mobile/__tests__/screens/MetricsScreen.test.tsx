import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { MetricsScreen } from '../../src/screens/MetricsScreen';
import { apiFetch } from '../../src/api/client';
import { addDays, todayCivil } from '../../src/lib/heatmap';

jest.mock('../../src/api/client');

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// Records are dated relative to the real today, so the ranges are exercised as a user would see them.
const today = todayCivil();
const daysAgo = (n: number) => `${addDays(today, -n)}T00:00:00.000Z`;

const records = [
  { id: 's-old', metricType: 'STEPS', value: 2000, recordedAt: daysAgo(40) },
  { id: 's-prev', metricType: 'STEPS', value: 8000, recordedAt: daysAgo(10) },
  { id: 's-1', metricType: 'STEPS', value: 9000, recordedAt: daysAgo(3) },
  { id: 's-2', metricType: 'STEPS', value: 11000, recordedAt: daysAgo(0) },
  { id: 'h-1', metricType: 'HRV', value: 42, recordedAt: daysAgo(50) },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MetricsScreen', () => {
  it('syncs with Google Health on pull-to-refresh, then re-reads', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(records);
    const syncNow = jest.fn().mockResolvedValue(undefined);
    const syncModule = require('../../src/sync/SyncProvider');
    const spy = jest
      .spyOn(syncModule, 'useSync')
      .mockReturnValue({ state: 'idle', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 0, syncNow });
    const { UNSAFE_getByType, findByTestId } = render(<MetricsScreen />);
    await findByTestId('trend-latest-STEPS');
    const reads = () => (apiFetch as jest.Mock).mock.calls.filter(([p]) => p === '/me/biometrics').length;
    const before = reads();

    const { ScrollView } = require('react-native');
    await act(async () => {
      await UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });

    expect(syncNow).toHaveBeenCalledWith('pull');
    expect(reads()).toBe(before + 1);
    spy.mockRestore();
  });

  it('shows a trend card per metric for the default 30-day range', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(records);

    const { findByTestId, getByTestId } = render(<MetricsScreen />);

    expect(await findByTestId('trend-latest-STEPS')).toHaveTextContent('11,000');
    expect(apiFetch).toHaveBeenCalledWith('/me/biometrics');
    // 30 days: 8,000 + 9,000 + 11,000.
    expect(getByTestId('trend-average-STEPS')).toHaveTextContent('Avg 9,333');
    expect(getByTestId('trend-change-STEPS')).toHaveTextContent('Up 367% vs the previous 30 days');
    expect(getByTestId('trend-empty-HRV')).toHaveTextContent('No hrv readings in the last 30 days.');
  });

  it('recomputes every card when the range changes', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(records);

    const { findByTestId, getByTestId } = render(<MetricsScreen />);
    await findByTestId('trend-latest-STEPS');

    fireEvent.press(getByTestId('metrics-range-7d'));
    expect(getByTestId('trend-average-STEPS')).toHaveTextContent('Avg 10,000');
    expect(getByTestId('trend-change-STEPS')).toHaveTextContent('Up 25% vs the previous 7 days');

    fireEvent.press(getByTestId('metrics-range-90d'));
    expect(getByTestId('trend-latest-HRV')).toHaveTextContent('42.0 ms');
  });

  it("opens a metric's detail with its whole series, on the selected range", async () => {
    (apiFetch as jest.Mock).mockResolvedValue(records);

    const { findByTestId, getByTestId } = render(<MetricsScreen />);
    await findByTestId('trend-latest-STEPS');
    fireEvent.press(getByTestId('metrics-range-7d'));
    fireEvent.press(getByTestId('trend-card-STEPS'));

    expect(mockNavigate).toHaveBeenCalledWith('MetricDetail', {
      metricType: 'STEPS',
      records: [records[0], records[1], records[2], records[3]],
      range: '7d',
    });
  });

  // Sleep has its own page (spec §5.1); the other metrics keep MetricDetail.
  it('opens the Sleep page from the sleep card, and MetricDetail from another', async () => {
    const sleep = { id: 'sl-1', metricType: 'SLEEP', value: 432, recordedAt: daysAgo(1) };
    (apiFetch as jest.Mock).mockResolvedValue([...records, sleep]);

    const { findByTestId, getByTestId } = render(<MetricsScreen />);
    await findByTestId('trend-latest-SLEEP');
    fireEvent.press(getByTestId('trend-card-SLEEP'));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('Sleep', undefined);

    fireEvent.press(getByTestId('trend-card-STEPS'));
    expect(mockNavigate).toHaveBeenLastCalledWith('MetricDetail', expect.objectContaining({ metricType: 'STEPS' }));
  });

  it('places the latest reading against the usual range once there are enough readings', async () => {
    const hrv = [44, 46, 48, 50, 52, 54, 56, 70].map((value, i) => ({
      id: `hrv-${i}`,
      metricType: 'HRV',
      value,
      recordedAt: daysAgo(7 - i),
    }));
    (apiFetch as jest.Mock).mockResolvedValue([...records, ...hrv]);

    const { findByTestId, queryByTestId } = render(<MetricsScreen />);

    expect(await findByTestId('trend-position-HRV')).toHaveTextContent('Above your usual range of 45.4–60.2 ms');
    // Steps has only three readings in 30 days: too few to call anything usual.
    expect(queryByTestId('trend-position-STEPS')).toBeNull();
  });

  it('opens Patterns from its entry card', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(records);

    const { findByTestId } = render(<MetricsScreen />);
    fireEvent.press(await findByTestId('patterns-button'));

    expect(mockNavigate).toHaveBeenCalledWith('Patterns');
  });

  it('renders as the Trends route, titled Trends, with its trend cards', async () => {
    (apiFetch as jest.Mock).mockResolvedValue(records);

    // Pushed from Activity's "All trends": the screen reads no route params.
    const { findByTestId, getByText, getByRole } = render(<MetricsScreen {...({ route: { key: 'Trends-1', name: 'Trends' } } as object)} />);

    expect(await findByTestId('trend-latest-STEPS')).toHaveTextContent('11,000');
    expect(getByText('TRENDS')).toBeTruthy();
    expect(getByRole('header', { name: 'Trends' })).toBeTruthy();
  });

  it('explains an empty account', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);

    const { findByTestId } = render(<MetricsScreen />);

    expect(await findByTestId('metrics-empty')).toBeTruthy();
  });

  it('offers a retry when loading fails, and recovers', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(records);

    const { findByTestId } = render(<MetricsScreen />);
    fireEvent.press(await findByTestId('metrics-retry'));

    expect(await findByTestId('trend-latest-STEPS')).toHaveTextContent('11,000');
  });
});
