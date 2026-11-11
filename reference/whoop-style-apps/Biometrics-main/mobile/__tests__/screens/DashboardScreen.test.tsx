import React from 'react';
import { characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import { act, render, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { DashboardScreen, greetingFor } from '../../src/screens/DashboardScreen';
import { apiFetch } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { READY } from '../../jest-mocks/forecastFixture';
import { AppState, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { storyRingColor } from '../../src/lib/recapTheme';
import { HomeScene } from '../../src/components/home/HomeScene';
import { Kip } from '../../src/components/kip/Kip';
import { addDays, todayCivil } from '../../src/lib/heatmap';
import { COLORS } from '../../src/theme';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import * as nativewind from 'nativewind';

jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext');

const mockSignOut = jest.fn();
const mockNavigate = jest.fn();
const mockListeners: Record<string, Array<() => void>> = {};
let mockFocused = true;
const mockNavigation = {
  navigate: (...args: unknown[]) => mockNavigate(...args),
  isFocused: () => mockFocused,
  addListener: (event: string, fn: () => void) => {
    (mockListeners[event] ??= []).push(fn);
    return () => {
      mockListeners[event] = (mockListeners[event] ?? []).filter((f) => f !== fn);
    };
  },
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

function fire(event: 'focus' | 'blur') {
  act(() => (mockListeners[event] ?? []).forEach((f) => f()));
}

/**
 * The screen calls /me/biometrics, /me/connection and /me/scores independently, so route
 * each path to its own canned response rather than one blanket resolution.
 */
function mockApi(options: {
  records?: unknown;
  connection?: unknown;
  recordsError?: Error;
  scores?: unknown[];
  scoresError?: Error;
  habitsError?: Error;
  forecast?: unknown;
  recaps?: unknown[];
  nights?: unknown[];
  sleepError?: Error;
  goal?: unknown;
  buddyScene?: unknown;
}) {
  (apiFetch as jest.Mock).mockImplementation((path: string) => {
    if (path === '/me/buddies/scene') {
      if (options.buddyScene instanceof Error) return Promise.reject(options.buddyScene);
      return Promise.resolve(options.buddyScene ?? { buddies: [], total: 0, incomingRequests: 0 });
    }
    if (path === '/me/sleep/goal') return Promise.resolve(options.goal ?? { sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
    if (path.startsWith('/me/sleep?')) {
      if (options.sleepError) return Promise.reject(options.sleepError);
      return Promise.resolve({ nights: options.nights ?? [], earliestDate: null, stagesBackfillPending: false });
    }
    if (path.startsWith('/me/recaps')) return Promise.resolve({ recaps: options.recaps ?? [] });
    if (path.startsWith('/me/buddies')) return Promise.resolve({ buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 });
    if (path === '/me/forecast') {
      return Promise.resolve(options.forecast ?? { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 0 });
    }
    if (path === '/me/connection') {
      return Promise.resolve(options.connection ?? { status: 'CONNECTED' });
    }
    if (path.startsWith('/me/habits')) {
      if (options.habitsError) return Promise.reject(options.habitsError);
      if (path === '/me/habits/config') {
        return Promise.resolve({ habitTypes: [{ type: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', exposureThreshold: 2, builtIn: true }] });
      }
      return Promise.resolve({ today: '2026-09-20', days: [{ habitDay: '2026-09-20', checkedIn: false, observed: { ALCOHOL: false } }] });
    }
    if (path.startsWith('/me/scores')) {
      if (options.scoresError) return Promise.reject(options.scoresError);
      return Promise.resolve({ scores: options.scores ?? [] });
    }
    if (options.recordsError) return Promise.reject(options.recordsError);
    return Promise.resolve(options.records ?? []);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockListeners)) delete mockListeners[k];
  mockFocused = true;
  (useAuth as jest.Mock).mockReturnValue({
    session: { userId: 'u1', email: 'u1@example.com' },
    signInWithApple: jest.fn(),
    signInWithGoogle: jest.fn(),
    signOut: mockSignOut,
  });
});

describe('DashboardScreen', () => {
  it('reloads its data after a sync', async () => {
    mockApi({});
    const syncModule = require('../../src/sync/SyncProvider');
    const syncState = { state: 'idle', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 0, syncNow: jest.fn() };
    const spy = jest.spyOn(syncModule, 'useSync').mockReturnValue(syncState);
    const utils = render(<DashboardScreen />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/me/biometrics'));
    const loads = () => (apiFetch as jest.Mock).mock.calls.filter(([p]) => p === '/me/biometrics').length;
    const before = loads();

    spy.mockReturnValue({ ...syncState, dataVersion: 1 });
    utils.rerender(<DashboardScreen />);

    await waitFor(() => expect(loads()).toBe(before + 1));
    spy.mockRestore();
  });

  it('renders fetched biometric records', async () => {
    mockApi({
      records: [
        { id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' },
        { id: '2', metricType: 'RESTING_HR', value: 58, recordedAt: '2026-09-01T00:00:00.000Z' },
      ],
    });

    const { getAllByText } = render(<DashboardScreen />);

    await waitFor(() => {
      expect(getAllByText(/Steps/).length).toBeGreaterThan(0);
      expect(getAllByText(/9,000/).length).toBeGreaterThan(0);
    });
  });

  it('renders rings, an insight, and trend charts for every real metric', async () => {
    mockApi({
      records: [
        { id: '1', metricType: 'STEPS', value: 8000, recordedAt: '2026-09-01T00:00:00.000Z' },
        { id: '2', metricType: 'STEPS', value: 12000, recordedAt: '2026-09-02T00:00:00.000Z' },
        { id: '3', metricType: 'RESTING_HR', value: 60, recordedAt: '2026-09-01T00:00:00.000Z' },
        { id: '4', metricType: 'RESTING_HR', value: 58, recordedAt: '2026-09-02T00:00:00.000Z' },
        { id: '5', metricType: 'SLEEP', value: 420, recordedAt: '2026-09-01T00:00:00.000Z' },
        { id: '6', metricType: 'SLEEP', value: 400, recordedAt: '2026-09-02T00:00:00.000Z' },
        { id: '7', metricType: 'HRV', value: 50, recordedAt: '2026-09-01T00:00:00.000Z' },
        { id: '8', metricType: 'HRV', value: 65.9, recordedAt: '2026-09-02T00:00:00.000Z' },
      ],
    });

    const { getAllByText, getByText } = render(<DashboardScreen />);

    await waitFor(() => {
      expect(getAllByText('Steps').length).toBeGreaterThan(0);
      expect(getAllByText('Resting Heart Rate').length).toBeGreaterThan(0);
      expect(getAllByText('Sleep').length).toBeGreaterThan(0);
      expect(getAllByText('HRV').length).toBeGreaterThan(0);
    });

    // Latest value per metric renders in both the ring and the trend card.
    expect(getAllByText(/12,000/).length).toBeGreaterThan(0);
    expect(getAllByText(/58 bpm/).length).toBeGreaterThan(0);
    expect(getAllByText(/6h 40m/).length).toBeGreaterThan(0);
    expect(getAllByText(/65\.9 ms/).length).toBeGreaterThan(0);

    // The insight picks whichever metric deviates most from its own trailing
    // average -- Steps at +50% here beats HRV's +31.8%, Sleep's -4.8%, and
    // Resting Heart Rate's -3.3%.
    expect(getByText('Steps is 50% above your recent average.')).toBeTruthy();
  });

  it('opens a metric detail page with that metric\'s own series when a ring card is pressed', async () => {
    const stepsRecords = [
      { id: '1', metricType: 'STEPS', value: 8000, recordedAt: '2026-09-01T00:00:00.000Z' },
      { id: '2', metricType: 'STEPS', value: 12000, recordedAt: '2026-09-02T00:00:00.000Z' },
    ];
    mockApi({ records: stepsRecords });

    const { getByTestId } = render(<DashboardScreen />);

    await waitFor(() => expect(getByTestId('metric-card-STEPS')).toBeTruthy());
    fireEvent.press(getByTestId('metric-card-STEPS'));

    expect(mockNavigate).toHaveBeenCalledWith('MetricDetail', { metricType: 'STEPS', records: stepsRecords });
  });

  it('the SLEEP metric tile opens the Sleep page; other tiles still open their detail', async () => {
    const steps = [{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }];
    const sleepRecords = [
      { id: 's1', metricType: 'SLEEP', value: 420, recordedAt: '2026-09-01T00:00:00.000Z' },
      { id: 's2', metricType: 'SLEEP', value: 450, recordedAt: '2026-09-02T00:00:00.000Z' },
    ];
    mockApi({ records: [...steps, ...sleepRecords], scores: [] });
    const { findByTestId, getByTestId } = render(<DashboardScreen />);
    fireEvent.press(await findByTestId('metric-card-SLEEP'));
    expect(mockNavigate).toHaveBeenCalledWith('Sleep', undefined);
    expect(mockNavigate).not.toHaveBeenCalledWith('MetricDetail', expect.objectContaining({ metricType: 'SLEEP' }));
    fireEvent.press(getByTestId('metric-card-STEPS'));
    expect(mockNavigate).toHaveBeenCalledWith('MetricDetail', expect.objectContaining({ metricType: 'STEPS' }));
  });

  // The coach is off in this file, so there is no digest here; DashboardDigest.test checks the shelf
  // sits above it when the coach is on.
  it('shows the Recaps shelf after the habit log, for everyone (coach off here)', async () => {
    mockApi({ records: [{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }] });
    const { findByTestId, toJSON } = render(<DashboardScreen />);
    await findByTestId('recap-shelf');
    const tree = JSON.stringify(toJSON());
    const habitLog = tree.indexOf('habit-log');
    expect(habitLog).toBeGreaterThanOrEqual(0);
    expect(habitLog).toBeLessThan(tree.indexOf('recap-shelf'));
    expect(tree.indexOf('coach-digest')).toBe(-1);
  });

  // Trends and the Patterns entry moved off Home (spec 2.2); they live on the Trends screen now.
  it('no longer shows the trend list or the Patterns entry', async () => {
    mockApi({ records: [{ id: '1', metricType: 'STEPS', value: 8000, recordedAt: '2026-09-01T00:00:00.000Z' }] });

    const { findByTestId, queryByTestId } = render(<DashboardScreen />);

    await findByTestId('metric-card-STEPS');
    expect(queryByTestId('trend-card-STEPS')).toBeNull();
    expect(queryByTestId('patterns-button')).toBeNull();
  });

  // Signing in now lands here rather than on the connect screen, so a user who
  // has never connected meets this state first: it has to offer the connect
  // step, not describe a sync that cannot happen yet.
  it('offers the connect step to a user who has never connected', async () => {
    mockApi({ records: [], connection: { status: 'NOT_CONNECTED' } });

    const { getByTestId } = render(<DashboardScreen />);

    // Heading and button share the wording, so the testID is the unambiguous handle.
    await waitFor(() => expect(getByTestId('connect-health-button')).toBeTruthy());

    fireEvent.press(getByTestId('connect-health-button'));
    expect(mockNavigate).toHaveBeenCalledWith('ConnectHealth');
  });

  it('does not offer the connect step to a connected user with no data yet', async () => {
    mockApi({ records: [], connection: { status: 'CONNECTED' } });

    const { queryByTestId, getByText } = render(<DashboardScreen />);

    await waitFor(() => expect(getByText(/No data yet/i)).toBeTruthy());
    expect(queryByTestId('connect-health-button')).toBeNull();
  });

  it('shows an empty state when there are no records yet', async () => {
    mockApi({ records: [] });

    const { getByText } = render(<DashboardScreen />);

    await waitFor(() => expect(getByText(/No data yet/i)).toBeTruthy());
  });

  // A cold launch before the network is up fails the first load; the reload a
  // sync triggers must bring the data back rather than leave the error up.
  it('recovers from a failed load when a sync reloads the data', async () => {
    mockApi({ recordsError: new Error('network error') });
    const syncModule = require('../../src/sync/SyncProvider');
    const syncState = { state: 'idle', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 0, syncNow: jest.fn() };
    const spy = jest.spyOn(syncModule, 'useSync').mockReturnValue(syncState);
    const utils = render(<DashboardScreen />);
    await waitFor(() => expect(utils.getByText(/Something went wrong/i)).toBeTruthy());

    mockApi({ records: [] });
    spy.mockReturnValue({ ...syncState, dataVersion: 1 });
    utils.rerender(<DashboardScreen />);

    // The empty state replaces the error once the reload succeeds.
    expect(await utils.findByText(/No data yet/i)).toBeTruthy();
    expect(utils.queryByText(/Something went wrong/i)).toBeNull();
    spy.mockRestore();
  });

  it('shows an error state when the fetch fails', async () => {
    mockApi({ recordsError: new Error('network error') });

    const { getByText } = render(<DashboardScreen />);

    await waitFor(() => expect(getByText(/Something went wrong/i)).toBeTruthy());
  });

  it('prompts a reconnect instead of showing stale data when disconnected', async () => {
    mockApi({
      connection: { status: 'DISCONNECTED' },
      records: [{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }],
    });

    const { getByText, queryByText } = render(<DashboardScreen />);

    await waitFor(() => expect(getByText(/Reconnect your Google Health/i)).toBeTruthy());
    // The stale numbers must not be presented as if they were current.
    expect(queryByText(/9,000/)).toBeNull();
  });

  it('navigates to ConnectHealth from the reconnect prompt', async () => {
    mockApi({ connection: { status: 'DISCONNECTED' }, records: [] });

    const { getByTestId } = render(<DashboardScreen />);

    await waitFor(() => expect(getByTestId('reconnect-health-button')).toBeTruthy());
    fireEvent.press(getByTestId('reconnect-health-button'));

    expect(mockNavigate).toHaveBeenCalledWith('ConnectHealth');
  });

  it('does not prompt a reconnect while the connection is healthy', async () => {
    mockApi({
      connection: { status: 'CONNECTED' },
      records: [{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }],
    });

    const { getAllByText, queryByText } = render(<DashboardScreen />);

    await waitFor(() => expect(getAllByText(/9,000/).length).toBeGreaterThan(0));
    expect(queryByText(/Reconnect your Google Health/i)).toBeNull();
  });

  it('leaves sign-out to Profile once Home has data', async () => {
    mockApi({
      records: [{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }],
    });

    const { findByTestId, queryByTestId } = render(<DashboardScreen />);

    await findByTestId('metric-card-STEPS');
    expect(queryByTestId('sign-out-button')).toBeNull();
    expect(queryByTestId('settings-button')).toBeTruthy();
  });

  it('keeps sign-out reachable when Home cannot load', async () => {
    mockApi({ recordsError: new Error('boom') });

    const { getByTestId } = render(<DashboardScreen />);

    await waitFor(() => expect(getByTestId('sign-out-button')).toBeTruthy());
    fireEvent.press(getByTestId('sign-out-button'));

    expect(mockSignOut).toHaveBeenCalled();
  });

  it('greets by time of day', () => {
    expect(greetingFor(new Date(2026, 8, 29, 7))).toBe('Good morning');
    expect(greetingFor(new Date(2026, 8, 29, 13))).toBe('Good afternoon');
    expect(greetingFor(new Date(2026, 8, 29, 21))).toBe('Good evening');
  });

  it('keeps sign-out reachable from the reconnect prompt', async () => {
    mockApi({ connection: { status: 'DISCONNECTED' }, records: [] });

    const { getByTestId } = render(<DashboardScreen />);

    await waitFor(() => expect(getByTestId('sign-out-button')).toBeTruthy());
    fireEvent.press(getByTestId('sign-out-button'));

    expect(mockSignOut).toHaveBeenCalled();
  });

  it('opens Profile from the header', async () => {
    mockApi({
      records: [{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }],
    });

    const { getByTestId } = render(<DashboardScreen />);

    await waitFor(() => expect(getByTestId('settings-button')).toBeTruthy());
    fireEvent.press(getByTestId('settings-button'));

    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Profile' });
  });

  describe('habit logging and patterns', () => {
    const steps = [{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }];

    it('shows the "Anything to log today?" card below the tiles', async () => {
      mockApi({ records: steps, scores: [] });

      const { getByText, getByTestId, toJSON } = render(<DashboardScreen />);

      await waitFor(() => expect(getByText('Anything to log today?')).toBeTruthy());
      expect(getByTestId('nothing-today-button')).toBeTruthy();
      expect(apiFetch).toHaveBeenCalledWith('/me/habits/config');
      expect(apiFetch).toHaveBeenCalledWith('/me/habits/status?days=14');

      const tree = JSON.stringify(toJSON());
      expect(tree.indexOf('home-tiles')).toBeGreaterThanOrEqual(0);
      expect(tree.indexOf('home-tiles')).toBeLessThan(tree.indexOf('Anything to log today?'));
      expect(tree.indexOf('Anything to log today?')).toBeLessThan(tree.indexOf('metric-card-STEPS'));
    });

    it('keeps the rest of the dashboard when the habit endpoints fail, with a retry', async () => {
      mockApi({ records: steps, habitsError: new Error('boom') });

      const { getByText, getByTestId } = render(<DashboardScreen />);

      await waitFor(() => expect(getByText(/Habits are unavailable/i)).toBeTruthy());
      expect(getByTestId('habit-log-retry')).toBeTruthy();
      expect(getByTestId('metric-card-STEPS')).toBeTruthy();
    });
  });
});

describe('DashboardScreen: story ring on the avatar', () => {
  const steps = [{ id: '1', metricType: 'STEPS', value: 8000, recordedAt: '2026-09-01T00:00:00.000Z' }];
  const week = { id: 'w1', kind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04', line: 'A steady week.', personaId: 'luna', builtAt: '2026-10-05T09:00:00.000Z', openedAt: null };
  const ringOf = () => StyleSheet.flatten(screen.getByTestId('profile-story-ring').props.style);

  it("rings the avatar in the unwatched recap's coach colour, with a dot, and a week plays its story", async () => {
    mockApi({ records: steps, recaps: [week] });
    render(withCharacter(<DashboardScreen />));
    await waitFor(() => expect(screen.getByTestId('profile-story-ring-dot')).toBeTruthy());
    const scheme = (ringOf().borderColor === storyRingColor('luna', 'dark') ? 'dark' : 'light') as 'light' | 'dark';
    expect(ringOf()).toMatchObject({ borderColor: storyRingColor('luna', scheme) });
    expect(StyleSheet.flatten(screen.getByTestId('profile-story-ring-dot').props.style)).toMatchObject({ backgroundColor: storyRingColor('luna', scheme) });
    expect(screen.getByTestId('settings-button').props.accessibilityLabel).toBe('Profile. Your week is ready. Play your story');
    // The old Home card is gone.
    expect(screen.queryByTestId('recap-ready-card')).toBeNull();
    fireEvent.press(screen.getByTestId('settings-button'));
    expect(mockNavigate).toHaveBeenCalledWith('RecapStory', { id: 'w1' });
  });

  it('only a week rings the avatar: Home asks for weeks alone', async () => {
    mockApi({ records: steps, recaps: [week] });
    render(withCharacter(<DashboardScreen />));
    await waitFor(() => expect(screen.getByTestId('profile-story-ring-dot')).toBeTruthy());
    expect(apiFetch).toHaveBeenCalledWith('/me/recaps?kind=WEEK&limit=1');
  });

  it('without an unwatched recap the avatar has no ring and opens Profile as before', async () => {
    mockApi({ records: steps, recaps: [{ ...week, openedAt: '2026-10-05T10:00:00.000Z' }] });
    render(withCharacter(<DashboardScreen />));
    await waitFor(() => expect(screen.getByTestId('settings-button')).toBeTruthy());
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/me/recaps?kind=WEEK&limit=1'));
    expect(screen.queryByTestId('profile-story-ring-dot')).toBeNull();
    expect(ringOf()).toMatchObject({ borderWidth: 0 });
    expect(screen.getByTestId('settings-button').props.accessibilityLabel).toBe('Profile and settings');
    fireEvent.press(screen.getByTestId('settings-button'));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Profile' });
  });
});

describe('DashboardScreen: fallback character', () => {
  it("shows the user's character on a state Home cannot load", async () => {
    mockApi({ recordsError: new Error('network error') });
    const utils = render(withCharacter(<DashboardScreen />, { characterId: 'avo' }));

    await waitFor(() => expect(characterLabel(utils, 'dashboard-fallback-character')).toBe('character:avo:idle:56:playing:none'));
  });
});

describe('DashboardScreen: Home F', () => {
  const steps = [{ id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' }];
  const score = (type: 'RECOVERY' | 'SLEEP', value: number | null, date: string) =>
    ({ date, type, score: value, confidenceLevel: 'HIGH', algorithmVersion: 'v1', factors: [], coldStart: [] });
  const night = (date: string, minutes: number) => ({
    date, minutesAsleep: minutes, minutesInBed: null, bedtime: null, wakeTime: null, sleepScore: null, minutesAwake: null,
    stageMinutes: null, hasStages: false, mainMinutesAsleep: minutes, mainIsNap: false,
  });
  const sceneKey = () => screen.UNSAFE_getByType(HomeScene).props.scene.key;
  const FAKE: { doNotFake: Array<'nextTick' | 'setImmediate' | 'queueMicrotask'> } = { doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] };
  let restoreAppState: (() => void) | null = null;

  // Records every AppState 'change' handler. The preset's AppState.addEventListener is already a mock: spyOn returns
  // it, and mockRestore would strip its implementation for every later test, so the original goes back instead.
  function captureAppState(): Array<(state: string) => void> {
    const handlers: Array<(state: string) => void> = [];
    const preset: unknown = AppState.addEventListener;
    const original = jest.isMockFunction(preset) ? preset.getMockImplementation() : undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      handlers.push(handler as (state: string) => void);
      return { remove: jest.fn() } as never;
    });
    restoreAppState = () => (original ? spy.mockImplementation(original) : spy.mockRestore());
    return handlers;
  }

  afterEach(() => {
    jest.useRealTimers();
    restoreAppState?.();
    restoreAppState = null;
  });

  it('draws the scene, its tags and the three tiles from the reads; the old cards are gone', async () => {
    const today = todayCivil();
    mockApi({
      records: steps,
      scores: [score('RECOVERY', 68, today), score('SLEEP', 78, today)],
      nights: [night(today, 432)],
      forecast: READY,
      goal: { sleepGoalMinutes: 480, bedtimeGoal: '23:00', wakeGoal: null },
    });
    render(<DashboardScreen />);
    expect(await screen.findByLabelText('Sky: recovery 68, mostly clear, Good. Open Recovery')).toBeTruthy();
    expect(await screen.findByLabelText('Bed: sleep 78, 7h 12m. Open Sleep')).toBeTruthy();
    expect(screen.getByLabelText('Calendar: tomorrow likely 40 to 80. Open Tomorrow')).toBeTruthy();
    expect(screen.getByTestId('home-tile-recovery-value')).toHaveTextContent('68');
    await waitFor(() => expect(screen.getByTestId('home-tile-tomorrow-line')).toHaveTextContent('Bed by 23:00'));
    expect(apiFetch).toHaveBeenCalledWith(`/me/sleep?from=${today}&to=${today}`);
    expect(apiFetch).toHaveBeenCalledWith('/me/sleep/goal');
    expect(apiFetch).toHaveBeenCalledWith('/me/buddies/scene');
    for (const gone of ['recovery-score-card', 'sleep-score-card', 'tomorrow-card', 'home-buddies-row', 'coach-tile-character']) {
      expect(screen.queryByTestId(gone)).toBeNull();
    }
  });

  it('puts the page in order: scene, Today, tiles, habit log, Recaps, metrics', async () => {
    mockApi({ records: steps });
    const { toJSON } = render(<DashboardScreen />);
    await screen.findByTestId('recap-shelf');
    const tree = JSON.stringify(toJSON());
    const order = ['home-scene', 'home-today', 'home-tiles', 'habit-log', 'recap-shelf', 'metric-card-STEPS'].map((id) => tree.indexOf(id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('opens Recovery on today, Sleep, Forecast and Recaps from the tags and tiles', async () => {
    const today = todayCivil();
    mockApi({ records: steps, scores: [score('RECOVERY', 68, today)], forecast: READY });
    render(<DashboardScreen />);
    fireEvent.press(await screen.findByTestId('home-tag-recovery'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Recovery', { date: today });
    fireEvent.press(await screen.findByTestId('home-tile-sleep'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Sleep', undefined);
    fireEvent.press(screen.getByTestId('home-tag-tomorrow'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Forecast');
    fireEvent.press(screen.getByTestId('home-tag-recaps'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Recaps');
  });

  it('puts the scene\'s buddies on the ground, and shows only you on an older server', async () => {
    const buddy = { id: 'b1', handle: 'ava', displayName: 'Ava', coachId: 'mochi', kipColour: 'mint', mood: 'good', moodLine: 'Feeling great', unseenSticker: false };
    mockApi({ records: steps, buddyScene: { buddies: [buddy], total: 3, incomingRequests: 0 } });
    const first = render(<DashboardScreen />);
    fireEvent.press(await screen.findByTestId('home-buddy-b1'));
    expect(mockNavigate).toHaveBeenLastCalledWith('BuddyWeek', { buddyId: 'b1' });
    fireEvent.press(screen.getByTestId('home-scene-all'));
    expect(mockNavigate).toHaveBeenLastCalledWith('Tabs', { screen: 'Social' });
    first.unmount();

    mockApi({ records: steps, buddyScene: Object.assign(new Error('not found'), { status: 404 }) });
    render(<DashboardScreen />);
    await screen.findByTestId('home-scene');
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/me/buddies/scene'));
    expect(screen.queryByTestId('home-scene-all')).toBeNull();
    expect(screen.UNSAFE_getAllByType(Kip).filter((k) => String(k.props.testID).startsWith('home-scene-buddy-'))).toHaveLength(0);
  });

  it('counts unwatched recaps on the RECAPS tag from the shelf\'s own fetch', async () => {
    const week = (id: string, end: string) => ({ id, kind: 'WEEK', periodStart: addDays(end, -6), periodEnd: end, line: 'x', personaId: 'luna', builtAt: '2026-10-05T09:00:00.000Z', openedAt: null });
    mockApi({ records: steps, recaps: [week('w2', addDays(todayCivil(), -2)), week('w1', addDays(todayCivil(), -9))] });
    render(withCharacter(<DashboardScreen />));
    await waitFor(() => expect(screen.getByTestId('home-tag-recaps').props.accessibilityLabel).toBe('Mailbox: recaps, 2 new. Open Recaps'));
    expect((apiFetch as jest.Mock).mock.calls.filter(([p]) => p === '/me/recaps?limit=30')).toHaveLength(1);
  });

  it('puts the theme toggle, the sync line and the Profile ring over the sky; the status bar is light while focused', async () => {
    const syncModule = require('../../src/sync/SyncProvider');
    const spy = jest.spyOn(syncModule, 'useSync').mockReturnValue({ state: 'idle', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 0, syncNow: jest.fn() });
    mockApi({ records: steps });
    render(<DashboardScreen />);
    const header = await screen.findByTestId('home-header');
    expect(within(header).getByTestId('theme-toggle-button')).toBeTruthy();
    expect(within(header).getByTestId('sync-status-line')).toBeTruthy();
    expect(within(header).getByTestId('settings-button')).toBeTruthy();
    expect(screen.UNSAFE_getByType(StatusBar).props.style).toBe('light');
    fire('blur');
    expect(screen.UNSAFE_queryAllByType(StatusBar)).toHaveLength(0);
    fire('focus');
    expect(screen.UNSAFE_getByType(StatusBar).props.style).toBe('light');
    spy.mockRestore();
  });

  describe('the status bar after scrolling past the scene', () => {
    const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
    // The scene is 300 points tall with no extra sky until the header lays out: past it at 300 - 47.
    const scrollTo = (y: number) => fireEvent.scroll(screen.getByTestId('home-scroll'), { nativeEvent: { contentOffset: { x: 0, y } } });
    const strip = () => screen.queryByTestId('home-status-strip');

    let scheme: jest.SpyInstance | null = null;

    async function showIn(colorScheme: 'light' | 'dark') {
      scheme = jest.spyOn(nativewind, 'useColorScheme').mockReturnValue({ colorScheme, setColorScheme: jest.fn(), toggleColorScheme: jest.fn() } as never);
      mockApi({ records: steps });
      render(<SafeAreaInsetsContext.Provider value={INSETS}><DashboardScreen /></SafeAreaInsetsContext.Provider>);
      await screen.findByTestId('home-scene');
    }

    afterEach(() => {
      scheme?.mockRestore();
      scheme = null;
    });

    it('turns dark on a page-coloured strip in the light theme, and back to light over the sky', async () => {
      await showIn('light');
      expect(screen.UNSAFE_getByType(StatusBar).props.style).toBe('light');
      expect(strip()).toBeNull();
      scrollTo(254);
      expect(screen.UNSAFE_getByType(StatusBar).props.style).toBe('dark');
      expect(StyleSheet.flatten(strip()!.props.style)).toMatchObject({ position: 'absolute', top: 0, height: 47, backgroundColor: COLORS.light.background });
      scrollTo(252);
      expect(screen.UNSAFE_getByType(StatusBar).props.style).toBe('light');
      expect(strip()).toBeNull();
    });

    it('stays light on a dark strip in the dark theme', async () => {
      await showIn('dark');
      scrollTo(400);
      expect(screen.UNSAFE_getByType(StatusBar).props.style).toBe('light');
      expect(StyleSheet.flatten(strip()!.props.style)).toMatchObject({ backgroundColor: COLORS.dark.background });
    });
  });

  it('reads the header before the scene\'s tags', async () => {
    mockApi({ records: steps });
    const { toJSON } = render(<DashboardScreen />);
    await screen.findByTestId('home-scene');
    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf('home-header')).toBeGreaterThanOrEqual(0);
    expect(tree.indexOf('home-header')).toBeLessThan(tree.indexOf('home-tag-sleep'));
  });

  it('changes the greeting at noon while Home stays focused', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 13, 11, 59, 30), ...FAKE });
    mockApi({ records: steps });
    render(<DashboardScreen />);
    expect(await screen.findByText('Good morning')).toBeTruthy();
    act(() => jest.advanceTimersByTime(30_000));
    expect(screen.getByText('Good afternoon')).toBeTruthy();
    expect(sceneKey()).toBe('fallback');
  });

  it('a short night overrides the weather', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 13, 9, 0), ...FAKE });
    mockApi({ records: steps, scores: [score('RECOVERY', 68, '2026-10-13')], nights: [night('2026-10-13', 310)] });
    render(<DashboardScreen />);
    await waitFor(() => expect(sceneKey()).toBe('short'));
    expect(screen.getByTestId('home-today-hint')).toHaveTextContent('Short night overrides KIP’s mood');
    expect(screen.getByTestId('home-tile-sleep-line')).toHaveTextContent('5h 10m · short');
  });

  it('recomputes the state at 20:00, on focus and on return to the foreground, with no timer while blurred', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 13, 19, 59, 30), ...FAKE });
    const appHandlers = captureAppState();
    mockApi({ records: steps });
    render(<DashboardScreen />);
    await screen.findByTestId('home-scene');
    expect(sceneKey()).toBe('fallback');

    act(() => jest.advanceTimersByTime(30_000));
    expect(sceneKey()).toBe('night');

    // Blurred: 05:00 passes with no timer running, until Home is focused again.
    fire('blur');
    act(() => jest.advanceTimersByTime(9 * 3_600_000 + 60_000));
    expect(sceneKey()).toBe('night');
    fire('focus');
    expect(sceneKey()).toBe('fallback');

    act(() => jest.setSystemTime(new Date(2026, 9, 14, 22, 0)));
    act(() => appHandlers.forEach((h) => h('active')));
    expect(sceneKey()).toBe('night');
  });

  it('rolls the day at midnight while Home stays focused, still at night', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 13, 23, 50), ...FAKE });
    mockApi({ records: steps });
    render(<DashboardScreen />);
    await screen.findByTestId('home-scene');
    act(() => jest.advanceTimersByTime(10 * 60_000));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/me/sleep?from=2026-10-14&to=2026-10-14'));
    expect(sceneKey()).toBe('night');
  });

  it('follows the day change: refetches the scores and never shows yesterday\'s short night', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 13, 9, 0), ...FAKE });
    const appHandlers = captureAppState();
    mockApi({ records: steps, scores: [score('RECOVERY', 68, '2026-10-13')], nights: [night('2026-10-13', 310)] });
    render(<DashboardScreen />);
    await waitFor(() => expect(sceneKey()).toBe('short'));
    const scoreReads = () => (apiFetch as jest.Mock).mock.calls.filter(([p]) => p === '/me/scores?days=7').length;
    const before = scoreReads();

    // Day 2's sleep read stays in flight: day 1's night must not stand in for it.
    const base = (apiFetch as jest.Mock).getMockImplementation()!;
    (apiFetch as jest.Mock).mockImplementation((path: string) => (path === '/me/sleep?from=2026-10-14&to=2026-10-14' ? new Promise(() => {}) : base(path)));
    act(() => jest.setSystemTime(new Date(2026, 9, 14, 9, 0)));
    act(() => appHandlers.forEach((h) => h('active')));

    expect(sceneKey()).not.toBe('short');
    expect(screen.queryByText('5h 10m · short')).toBeNull();
    await waitFor(() => expect(scoreReads()).toBe(before + 1));
    expect(apiFetch).toHaveBeenCalledWith('/me/sleep?from=2026-10-14&to=2026-10-14');
    expect(sceneKey()).not.toBe('short');
  });

  it('keeps the scene, the tiles and the metrics when the scores and sleep reads fail', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 13, 10, 0), ...FAKE });
    mockApi({ records: steps, scoresError: new Error('boom'), sleepError: new Error('boom') });
    render(<DashboardScreen />);
    await screen.findByTestId('home-tile-recovery');
    expect(sceneKey()).toBe('fallback');
    expect(screen.getByTestId('home-tile-sleep')).toBeTruthy();
    expect(screen.getByTestId('home-tiles')).toBeTruthy();
    expect(screen.getByTestId('metric-card-STEPS')).toBeTruthy();
  });

  it('leaves the status bar alone when Home mounts unfocused', async () => {
    mockFocused = false;
    mockApi({ records: steps });
    render(<DashboardScreen />);
    await screen.findByTestId('home-scene');
    expect(screen.UNSAFE_queryAllByType(StatusBar)).toHaveLength(0);
    fire('focus');
    expect(screen.UNSAFE_getByType(StatusBar).props.style).toBe('light');
  });

  it('reads the new day\'s night after midnight', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 13, 23, 50), ...FAKE });
    mockApi({ records: steps });
    render(<DashboardScreen />);
    await screen.findByTestId('home-scene');
    expect(apiFetch).toHaveBeenCalledWith('/me/sleep?from=2026-10-13&to=2026-10-13');
    act(() => jest.setSystemTime(new Date(2026, 9, 14, 0, 30)));
    fire('focus');
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/me/sleep?from=2026-10-14&to=2026-10-14'));
  });

  it('shows the scene-shaped skeleton while Home loads', () => {
    mockApi({});
    const base = (apiFetch as jest.Mock).getMockImplementation()!;
    (apiFetch as jest.Mock).mockImplementation((path: string) => (path === '/me/biometrics' ? new Promise(() => {}) : base(path)));
    render(<DashboardScreen />);
    expect(screen.getByTestId('home-loading-scene')).toBeTruthy();
    expect(screen.getAllByTestId('home-loading-tile')).toHaveLength(3);
  });
});
