import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ActivityScreen } from '../../src/screens/ActivityScreen';
import { ActivityHeatmap } from '../../src/components/activity-heatmap';
import { fetchActivity } from '../../src/api/activity';
import { fetchSleep, fetchSleepGoal } from '../../src/api/sleep';
import { addDays, daysBetween, fetchRange, todayCivil } from '../../src/lib/heatmap';
import { apiFetch } from '../../src/api/client';
import { fetchScoresWithBands } from '../../src/api/scores';

jest.mock('../../src/api/activity');
jest.mock('../../src/api/sleep');
jest.mock('../../src/api/client');
jest.mock('../../src/api/scores');

const mockNavigate = jest.fn();
// Screen events by name, so a test can fire focus/blur.
const mockListeners: Record<string, () => void> = {};
let mockRouteParams: { date?: string } | undefined;
const mockNavigation = {
  navigate: mockNavigate,
  setParams: jest.fn(),
  addListener: (event: string, fn: () => void) => {
    mockListeners[event] = fn;
    return () => delete mockListeners[event];
  },
};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockRouteParams }),
}));

const today = () => todayCivil();
const night = (date: string, minutesAsleep: number) => ({ date, minutesAsleep, minutesInBed: 480, bedtime: '23:10', wakeTime: '07:10', sleepScore: 80 });
const score = (date: string, value: number) => ({ date, type: 'RECOVERY', score: value, confidenceLevel: 'HIGH', algorithmVersion: 'v1', factors: [], coldStart: [] });

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteParams = undefined;
  (fetchActivity as jest.Mock).mockResolvedValue({ days: [], earliestDate: '2025-01-01' });
  (fetchSleep as jest.Mock).mockResolvedValue({ nights: [], earliestDate: null });
  (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
  (apiFetch as jest.Mock).mockResolvedValue([]);
  (fetchScoresWithBands as jest.Mock).mockResolvedValue({ scores: [], bands: { excellent: 80, good: 60, fair: 40 } });
});

describe('ActivityScreen', () => {
  it('reads steps and sleep over one range, plus the goal, the metrics and Recovery over the same range', async () => {
    const { findByTestId } = render(<ActivityScreen />);
    await findByTestId('this-week');
    const { from, to } = fetchRange(today());
    expect(fetchActivity).toHaveBeenCalledWith(from, to);
    expect(fetchSleep).toHaveBeenCalledWith(from, to);
    expect(fetchSleepGoal).toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith('/me/biometrics');
    expect(fetchScoresWithBands).toHaveBeenCalledWith(daysBetween(from, to) + 1, 'RECOVERY');
  });

  it('lays the page out as header, This week, calendar, month stats, 2026 so far, then the usual rows', async () => {
    const { findByTestId, getByTestId, UNSAFE_root } = render(<ActivityScreen />);
    await findByTestId('usual-tiles');
    const order = ['activity-header', 'this-week', 'heatmap-canvas', 'heatmap-stats', 'year-so-far', 'year-grid', 'usual-tiles'];
    // Depth-first, so a node's place in the list is its place on the page.
    const seen = UNSAFE_root.findAll((n) => typeof n.props.testID === 'string', { deep: true }).map((n) => n.props.testID as string);
    const at = order.map((id) => seen.indexOf(id));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("switches 2026 so far with the calendar's Steps / Sleep / Recovery tabs", async () => {
    (fetchScoresWithBands as jest.Mock).mockResolvedValue({ scores: [score(today(), 82)], bands: { excellent: 80, good: 60, fair: 40 } });
    const { findByTestId, getByTestId, getByText } = render(<ActivityScreen />);
    expect(await findByTestId('year-grid')).toHaveProp('accessibilityLabel', expect.stringMatching(/^Steps per day/));
    expect(getByText(/so far · steps per day$/)).toBeTruthy();

    fireEvent.press(getByTestId('activity-tab-sleep'));
    expect(getByTestId('year-grid')).toHaveProp('accessibilityLabel', expect.stringMatching(/^Sleep per night/));

    fireEvent.press(getByTestId('activity-tab-recovery'));
    expect(getByTestId('year-grid')).toHaveProp('accessibilityLabel', expect.stringMatching(/^Recovery per day/));
    expect(getByTestId('year-best')).toHaveTextContent('82');
  });

  it("sums the week in the header and fills today's row", async () => {
    (fetchActivity as jest.Mock).mockResolvedValue({ days: [{ date: today(), steps: 4321 }, { date: addDays(today(), -1), steps: 1000 }], earliestDate: '2025-01-01' });
    (fetchSleep as jest.Mock).mockResolvedValue({ nights: [night(today(), 452)], earliestDate: '2025-01-01' });
    (fetchScoresWithBands as jest.Mock).mockResolvedValue({ scores: [score(today(), 35)], bands: { excellent: 80, good: 60, fair: 40 } });

    const { findByTestId, getByTestId } = render(<ActivityScreen />);

    expect(await findByTestId('activity-summary')).toHaveTextContent('Last 7 days · 5,321 steps · 1 night');
    expect(getByTestId(`week-recovery-${today()}`)).toHaveTextContent('35');
    expect(getByTestId(`week-sleep-${today()}`)).toHaveTextContent('7h 32m');
    expect(getByTestId(`week-steps-${today()}`)).toHaveTextContent('4,321');
  });

  it('opens Recovery from a day row and the night from its moon', async () => {
    (fetchSleep as jest.Mock).mockResolvedValue({ nights: [night(today(), 452)], earliestDate: '2025-01-01' });
    const { findByTestId, getByTestId, queryByTestId } = render(<ActivityScreen />);

    fireEvent.press(await findByTestId(`week-row-${today()}`));
    expect(mockNavigate).toHaveBeenLastCalledWith('Recovery', { date: today() });

    fireEvent.press(getByTestId(`week-moon-${today()}`));
    expect(mockNavigate).toHaveBeenLastCalledWith('Sleep', { date: today() });
    // No night recorded yesterday: no moon.
    expect(queryByTestId(`week-moon-${addDays(today(), -1)}`)).toBeNull();
  });

  it('opens a Recovery day from the calendar, and a night on the Sleep page', async () => {
    const { findByTestId, UNSAFE_getByType } = render(<ActivityScreen />);
    await findByTestId('heatmap-stats');

    act(() => UNSAFE_getByType(ActivityHeatmap).props.onOpenRecovery('2026-10-01'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Recovery', { date: '2026-10-01' });
    act(() => UNSAFE_getByType(ActivityHeatmap).props.onOpenNight('2026-10-01'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Sleep', { date: '2026-10-01' });
  });

  it("opens the steps sheet on a date handed in by the Sleep page's Steps that day, then clears it", async () => {
    mockRouteParams = { date: today() };
    (fetchActivity as jest.Mock).mockResolvedValue({ days: [{ date: today(), steps: 7000 }], earliestDate: '2025-01-01' });
    const { findByTestId } = render(<ActivityScreen />);

    expect(await findByTestId('day-detail-steps')).toHaveTextContent('7,000 steps');
    expect(mockNavigation.setParams).toHaveBeenCalledWith({ date: undefined });
  });

  it('syncs with Google Health on pull-to-refresh, then re-reads', async () => {
    const syncNow = jest.fn().mockResolvedValue(undefined);
    const syncModule = require('../../src/sync/SyncProvider');
    const spy = jest
      .spyOn(syncModule, 'useSync')
      .mockReturnValue({ state: 'idle', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 0, syncNow });
    const { UNSAFE_getByType, findByTestId } = render(<ActivityScreen />);
    await findByTestId('heatmap-stats');
    expect(fetchActivity).toHaveBeenCalledTimes(1);

    const { ScrollView } = require('react-native');
    await act(async () => {
      await UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh();
    });

    expect(syncNow).toHaveBeenCalledWith('pull');
    expect(fetchActivity).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('offers a retry when steps fail, and recovers', async () => {
    (fetchActivity as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    const { findByTestId, getByTestId } = render(<ActivityScreen />);
    expect(getByTestId('activity-title')).toBeTruthy();

    fireEvent.press(await findByTestId('activity-retry'));

    expect(await findByTestId('this-week')).toBeTruthy();
    await waitFor(() => expect(fetchActivity).toHaveBeenCalledTimes(2));
  });
});

describe('ActivityScreen: sections fail on their own', () => {
  it('keeps steps working when sleep fails, and retries sleep from the Sleep tab', async () => {
    (fetchActivity as jest.Mock).mockResolvedValue({ days: [{ date: today(), steps: 4321 }], earliestDate: '2025-01-01' });
    (fetchSleep as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    const { findByTestId, getByTestId } = render(<ActivityScreen />);

    expect(await findByTestId('stat-total')).toHaveTextContent('4,321');
    expect(getByTestId(`week-sleep-${today()}`)).toHaveTextContent('—');
    fireEvent.press(getByTestId('activity-tab-sleep'));
    fireEvent.press(getByTestId('sleep-retry'));

    await waitFor(() => expect(fetchSleep).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getByTestId('stat-average')).toBeTruthy());
  });

  it('keeps the page up when Recovery fails, and retries it from the Recovery tab', async () => {
    (fetchScoresWithBands as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    const { findByTestId, getByTestId, queryByTestId } = render(<ActivityScreen />);

    expect(await findByTestId('this-week')).toBeTruthy();
    expect(queryByTestId('activity-error')).toBeNull();
    fireEvent.press(getByTestId('activity-tab-recovery'));
    fireEvent.press(getByTestId('recovery-retry'));

    await waitFor(() => expect(fetchScoresWithBands).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getByTestId('stat-scored')).toHaveTextContent('0'));
  });

  it('still shows the page without the usual rows when the metrics read fails', async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error('offline'));

    const { findByTestId, queryByTestId } = render(<ActivityScreen />);

    expect(await findByTestId('heatmap-stats')).toBeTruthy();
    expect(queryByTestId('usual-tiles')).toBeNull();
    expect(queryByTestId('activity-error')).toBeNull();
  });

  it('feeds the usual Recovery row from the same Recovery read', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([{ id: 'h', metricType: 'HRV', value: 61, recordedAt: `${today()}T00:00:00.000Z` }]);
    (fetchScoresWithBands as jest.Mock).mockResolvedValue({ scores: [score(today(), 71)], bands: { excellent: 80, good: 60, fair: 40 } });

    const { findByTestId, getByTestId } = render(<ActivityScreen />);

    expect(await findByTestId('usual-tile-RECOVERY')).toHaveTextContent(/71/);
    expect(getByTestId('usual-tile-HRV')).toHaveTextContent(/61/);
  });
});

describe('ActivityScreen: sleep goal', () => {
  it('colours sleep against the saved goal, or 8h when it cannot be read', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 420, bedtimeGoal: null, wakeGoal: null });
    const first = render(<ActivityScreen />);
    await first.findByTestId('heatmap-stats');
    expect(first.UNSAFE_getByType(ActivityHeatmap).props.sleepGoal).toBe(420);
    first.unmount();

    (fetchSleepGoal as jest.Mock).mockRejectedValue(new Error('offline'));
    const second = render(<ActivityScreen />);
    await second.findByTestId('heatmap-stats');
    expect(second.UNSAFE_getByType(ActivityHeatmap).props.sleepGoal).toBe(480);
  });

  it('picks up a goal saved elsewhere on coming back to the tab, in place', async () => {
    const { findByTestId, queryByTestId, UNSAFE_getByType } = render(<ActivityScreen />);
    await findByTestId('heatmap-stats');
    // The first focus (opening the tab) loads nothing extra.
    await act(async () => mockListeners.focus?.());
    expect(fetchSleepGoal).toHaveBeenCalledTimes(1);

    (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 420, bedtimeGoal: '23:00', wakeGoal: '07:00' });
    await act(async () => mockListeners.blur?.());
    await act(async () => mockListeners.focus?.());

    await waitFor(() => expect(UNSAFE_getByType(ActivityHeatmap).props.sleepGoal).toBe(420));
    expect(queryByTestId('activity-loading')).toBeNull();
  });

  it('waits for the goal before drawing, so the colours never jump', async () => {
    let resolveGoal: (g: unknown) => void = () => {};
    (fetchSleepGoal as jest.Mock).mockReturnValue(new Promise((r) => (resolveGoal = r)));

    const { findByTestId, getByTestId, queryByTestId } = render(<ActivityScreen />);
    await act(async () => {});

    expect(getByTestId('activity-loading')).toBeTruthy();
    expect(queryByTestId('heatmap-stats')).toBeNull();
    await act(async () => resolveGoal({ sleepGoalMinutes: 420, bedtimeGoal: null, wakeGoal: null }));
    expect(await findByTestId('heatmap-stats')).toBeTruthy();
  });
});
