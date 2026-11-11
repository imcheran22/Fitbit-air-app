import React from 'react';
import { AppState, Modal } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements, markCelebrated } from '../../src/api/achievements';
import { CelebrationHost, MODAL_DISMISS_MS } from '../../src/components/achievements/CelebrationHost';
import { refreshAchievements, resetAchievements } from '../../src/lib/achievementsStore';

jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/timezone', () => require('../../jest-mocks/timezoneSettled'));
jest.mock('../../src/lib/recapCapture', () => ({ captureToPng: jest.fn(), saveImage: jest.fn(), shareImage: jest.fn() }));
// A fake signed-in container: the current route and its state events, driven by the tests.
const mockNav = { ready: true, route: 'Tabs', listeners: new Set<() => void>() };
jest.mock('../../src/navigation/navigationRef', () => ({
  ...jest.requireActual('../../src/navigation/navigationRef'),
  navigationRef: {
    isReady: () => mockNav.ready,
    getCurrentRoute: () => ({ key: mockNav.route, name: mockNav.route }),
    addListener: (_event: string, cb: () => void) => {
      mockNav.listeners.add(cb);
      return () => mockNav.listeners.delete(cb);
    },
  },
}));
const load = fetchAchievements as jest.Mock;
const post = markCelebrated as jest.Mock;

function navigateTo(route: string) {
  mockNav.route = route;
  mockNav.listeners.forEach((l) => l());
}

const TWO_FAMILIES = achievementsFixture({ SLEEP_GOAL: { level: 2 }, CHECK_IN: { level: 1 } }, {
  uncelebrated: [
    { id: 's1', family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-03' },
    { id: 's2', family: 'SLEEP_GOAL', level: 2, value: 7, earnedOn: '2026-10-07' },
    { id: 'c1', family: 'CHECK_IN', level: 1, value: 7, earnedOn: '2026-10-07' },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  post.mockResolvedValue(undefined);
  mockNav.ready = true;
  mockNav.route = 'Tabs';
  mockNav.listeners.clear();
});
afterEach(() => jest.restoreAllMocks());

it('celebrates one family at a time, highest level first, and marks each family celebrated on close', async () => {
  load.mockResolvedValue(TWO_FAMILIES);
  render(withCharacter(<CelebrationHost />));

  expect(await screen.findByTestId('celebration-title')).toHaveTextContent('SLEEP GOAL STREAK II');
  fireEvent.press(screen.getByTestId('celebration-done'));
  expect(post).toHaveBeenCalledWith(['s1', 's2']);
  await waitFor(() => expect(screen.getByTestId('celebration-title')).toHaveTextContent('DAILY CHECK-IN I'));
  fireEvent.press(screen.getByTestId('celebration-done'));
  expect(post).toHaveBeenLastCalledWith(['c1']);
  await waitFor(() => expect(screen.queryByTestId('celebration-title')).toBeNull());
});

// Unmounting one Modal and presenting another in the same commit drops the second on iOS.
it('swaps families inside one Modal, which goes only when the queue is empty', async () => {
  load.mockResolvedValue(TWO_FAMILIES);
  render(withCharacter(<CelebrationHost />));
  await screen.findByTestId('celebration-title');
  const modal = screen.UNSAFE_getByType(Modal);

  fireEvent.press(screen.getByTestId('celebration-done'));
  await waitFor(() => expect(screen.getByTestId('celebration-title')).toHaveTextContent('DAILY CHECK-IN I'));
  expect(screen.UNSAFE_getByType(Modal)).toBe(modal);
  expect(screen.getByTestId('celebration-done')).not.toBeDisabled();

  fireEvent.press(screen.getByTestId('celebration-done'));
  await waitFor(() => expect(screen.UNSAFE_queryByType(Modal)).toBeNull());
});

describe('behind a native modal route', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function renderOn(route: string) {
    mockNav.route = route;
    load.mockResolvedValue(TWO_FAMILIES);
    const view = render(withCharacter(<CelebrationHost />));
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
    return view;
  }

  it('waits while it is up, and shows once its dismissal has had time to finish', async () => {
    await renderOn('RecapStory');
    expect(screen.queryByTestId('celebration-screen')).toBeNull();

    act(() => navigateTo('MeetYourCoach'));
    expect(screen.queryByTestId('celebration-screen')).toBeNull();

    // The state flips to Tabs at once while the native dismissal still animates.
    act(() => navigateTo('Tabs'));
    expect(screen.queryByTestId('celebration-screen')).toBeNull();
    act(() => jest.advanceTimersByTime(MODAL_DISMISS_MS - 1));
    expect(screen.queryByTestId('celebration-screen')).toBeNull();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByTestId('celebration-title')).toHaveTextContent('SLEEP GOAL STREAK II');
  });

  it('keeps waiting when a modal route opens again within the delay', async () => {
    await renderOn('RecapStory');
    act(() => navigateTo('Tabs'));
    act(() => jest.advanceTimersByTime(MODAL_DISMISS_MS / 2));
    act(() => navigateTo('RecapStory'));
    act(() => jest.advanceTimersByTime(MODAL_DISMISS_MS));
    expect(screen.queryByTestId('celebration-screen')).toBeNull();

    act(() => navigateTo('Tabs'));
    act(() => jest.advanceTimersByTime(MODAL_DISMISS_MS));
    expect(screen.getByTestId('celebration-title')).toHaveTextContent('SLEEP GOAL STREAK II');
  });

  it('clears the pending release on unmount', async () => {
    const { unmount } = await renderOn('RecapStory');
    const before = jest.getTimerCount();
    act(() => navigateTo('Tabs'));
    expect(jest.getTimerCount()).toBe(before + 1);
    unmount();
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
  });
});

it('waits for the navigator to be ready', async () => {
  mockNav.ready = false;
  load.mockResolvedValue(TWO_FAMILIES);
  render(withCharacter(<CelebrationHost />));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(screen.queryByTestId('celebration-screen')).toBeNull();

  mockNav.ready = true;
  act(() => navigateTo('Tabs'));
  expect(screen.getByTestId('celebration-title')).toHaveTextContent('SLEEP GOAL STREAK II');
});

it('checks again when the app comes back to the foreground', async () => {
  const listeners: Array<(state: string) => void> = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (state: string) => void) => {
    listeners.push(cb);
    return { remove: jest.fn() };
  }) as never);
  load.mockResolvedValue(achievementsFixture());
  render(withCharacter(<CelebrationHost />));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId('celebration-title')).toBeNull();

  load.mockResolvedValue(achievementsFixture({ STEP_GOAL: { level: 1 } }, { uncelebrated: [{ id: 'p1', family: 'STEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-09' }] }));
  await act(async () => listeners.forEach((l) => l('active')));
  expect(await screen.findByTestId('celebration-title')).toHaveTextContent('STEP GOAL STREAK I');
});

it('shows nothing against a backend without badges (404)', async () => {
  load.mockResolvedValue(null);
  render(withCharacter(<CelebrationHost />));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(screen.queryByTestId('celebration-screen')).toBeNull();
});

it('keeps the family on screen until it is closed when a refresh brings a higher level for another one', async () => {
  load.mockResolvedValue(achievementsFixture({ CHECK_IN: { level: 1 } }, {
    uncelebrated: [{ id: 'c1', family: 'CHECK_IN', level: 1, value: 7, earnedOn: '2026-10-07' }],
  }));
  render(withCharacter(<CelebrationHost />));
  expect(await screen.findByTestId('celebration-title')).toHaveTextContent('DAILY CHECK-IN I');

  load.mockResolvedValue(TWO_FAMILIES);
  await act(() => refreshAchievements());
  expect(screen.getByTestId('celebration-title')).toHaveTextContent('DAILY CHECK-IN I');

  fireEvent.press(screen.getByTestId('celebration-done'));
  expect(post).toHaveBeenCalledWith(['c1']);
  await waitFor(() => expect(screen.getByTestId('celebration-title')).toHaveTextContent('SLEEP GOAL STREAK II'));
  fireEvent.press(screen.getByTestId('celebration-done'));
  expect(post).toHaveBeenLastCalledWith(['s1', 's2']);
  await waitFor(() => expect(screen.queryByTestId('celebration-title')).toBeNull());
});
