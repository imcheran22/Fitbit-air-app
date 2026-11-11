import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { fetchCamp, type Camp } from '../../src/api/social';
import { CampfireScreen } from '../../src/screens/CampfireScreen';

// The scene's clock stops when CampScene is `still` (CampSceneClock.test), which also leaves out the sparks: this
// checks, by the sparks, that the screen makes the scene still with Reduce Motion and while the page is not in front.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: jest.fn(() => false) };
});
jest.mock('../../src/api/social', () => ({ ...jest.requireActual('../../src/api/social'), fetchCamp: jest.fn() }));
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(), useChatsAvailable: () => true }));
const mockFocus: { cleanup: (() => void) | void; cb: (() => (() => void) | void) | null } = { cleanup: undefined, cb: null };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  // Runs on mount like a first focus; the test calls the cleanup (a blur) and the callback again (a refocus).
  useFocusEffect: (cb: () => (() => void) | void) => {
    mockFocus.cb = cb;
    const React = require('react');
    React.useEffect(() => {
      mockFocus.cleanup = cb();
    }, []);
  },
}));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const camp: Camp = {
  night: true,
  members: [{ person: { id: 'me', handle: 'me', displayName: 'Me', coachId: 'mochi' }, mine: true, asleep: false, asleepSince: null, onTime: null, note: null }],
  fire: { lit: 3, of: 5, segments: 3 },
  nightsLitThisWeek: 2,
  goodnight: null,
  goodnightOpen: true,
  goodnightOpensAt: '20:00',
};
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><CampfireScreen /></SafeAreaProvider>);
const still = () => screen.queryAllByTestId(/^camp-spark-/).length === 0;

beforeEach(() => (fetchCamp as jest.Mock).mockResolvedValue(camp));

it('moves while in front, and stops when the page loses focus until it is back', async () => {
  renderScreen();
  await screen.findByTestId('campfire');
  expect(screen.queryAllByTestId(/^camp-spark-/)).toHaveLength(5);
  await act(async () => {
    if (typeof mockFocus.cleanup === 'function') mockFocus.cleanup();
  });
  expect(still()).toBe(true);
  await act(async () => {
    mockFocus.cleanup = mockFocus.cb?.();
  });
  expect(still()).toBe(false);
});

it('is one still frame with Reduce Motion: no sparks', async () => {
  (useReducedMotion as jest.Mock).mockReturnValue(true);
  renderScreen();
  await screen.findByTestId('campfire');
  expect(still()).toBe(true);
  (useReducedMotion as jest.Mock).mockReturnValue(false);
});
