import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { AccessibilityInfo, StatusBar, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { withCharacter } from '../../jest-mocks/characterContext';
import type { Recap } from '../../src/api/recaps';
import { captureToPng, saveImage, shareImage } from '../../src/lib/recapCapture';
import { recapTint } from '../../src/lib/recapTheme';
import { STORY_FRAME_MS } from '../../src/lib/storyViewer';
import { RecapStoryScreen } from '../../src/screens/RecapStoryScreen';
import { ApiError } from '../../src/api/client';
import { fetchRecap, markRecapOpened } from '../../src/api/recaps';
import { resetUnwatchedRecap } from '../../src/lib/unwatchedRecap';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { resetAchievements } from '../../src/lib/achievementsStore';

jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/timezone', () => require('../../jest-mocks/timezoneSettled'));
jest.mock('expo-secure-store');
jest.mock('../../src/lib/recapCapture', () => ({ captureToPng: jest.fn(), saveImage: jest.fn(), shareImage: jest.fn() }));
let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => mockReduceMotion };
});
const mockGoBack = jest.fn();
const mockRecap: Recap = {
  id: 'r-week', kind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04', line: 'A steady week.', story: 'Five nights on goal and a calm Sunday.', personaId: 'luna',
  builtAt: '2026-10-05T09:00:00.000Z', openedAt: null, sleepGoalMinutes: 480, lineSource: 'ai', rebuiltAt: null,
  stats: { nightsWithData: 6, avgSleepMinutes: 455, nightsOnGoal: 5, longestOnGoalStreak: 3, bedtimeSpreadMinutes: 42, bestNight: { date: '2026-09-29', minutesAsleep: 485 }, weekStrip: [] },
};
const mockNavigate = jest.fn();
const mockReplace = jest.fn();
let mockParams: { recap: Recap } | { id: string } = { recap: mockRecap };
let mockStack: { index: number; routes: { name: string; params?: object }[] } = { index: 0, routes: [{ name: 'RecapStory' }] };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, canGoBack: () => true, navigate: mockNavigate, replace: mockReplace, getState: () => mockStack }),
  useRoute: () => ({ params: mockParams }),
}));
jest.mock('../../src/api/recaps', () => ({ fetchRecap: jest.fn(), markRecapOpened: jest.fn() }));

const URI = 'file:///cache/recap-1.png';
let store: Record<string, string>;
const eyebrow = () => screen.getByTestId('story-eyebrow');
const tap = (x: number) => fireEvent.press(screen.getByTestId('story-viewer-tap'), { nativeEvent: { locationX: x } });

const CONSENTED = { enabled: true, consented: true } as never;

async function open(character: Parameters<typeof withCharacter>[1] = {}) {
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      {withCharacter(<RecapStoryScreen />, character)}
    </SafeAreaProvider>,
  );
  // The stored include choices load first; Share and Save wait for them.
  await act(async () => {});
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetUnwatchedRecap();
  resetAchievements();
  (fetchAchievements as jest.Mock).mockResolvedValue(null);
  mockParams = { recap: mockRecap };
  mockStack = { index: 0, routes: [{ name: 'RecapStory' }] };
  (markRecapOpened as jest.Mock).mockResolvedValue(undefined);
  mockReduceMotion = false;
  store = {};
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) => Promise.resolve(store[k] ?? null));
  (captureToPng as jest.Mock).mockResolvedValue(URI);
  (saveImage as jest.Mock).mockResolvedValue('saved');
  (shareImage as jest.Mock).mockResolvedValue(undefined);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('opens on frame 1 and moves on by itself every five seconds, holding on the last frame with its end actions', async () => {
  await open();
  expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
  // The frame's own bar is hidden; the viewer draws its animated one over it.
  expect(screen.getByTestId('story-progress-slot')).toHaveStyle({ opacity: 0 });
  expect(screen.getByTestId('story-viewer-progress')).toBeTruthy();
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS));
  expect(eyebrow()).toHaveTextContent('MY WEEK · 2 OF 3');
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS));
  expect(eyebrow()).toHaveTextContent('MY WEEK · 3 OF 3');
  expect(screen.getByTestId('story-end-actions')).toBeTruthy();
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 3));
  expect(eyebrow()).toHaveTextContent('MY WEEK · 3 OF 3');
  expect(mockGoBack).not.toHaveBeenCalled();
});

it('a tap on the right half goes forward, on the left half back; a tap past the last frame does not close it', async () => {
  await open();
  tap(10000);
  expect(eyebrow()).toHaveTextContent('MY WEEK · 2 OF 3');
  tap(0);
  expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
  tap(10000);
  tap(10000);
  tap(10000);
  tap(10000);
  expect(eyebrow()).toHaveTextContent('MY WEEK · 3 OF 3');
  expect(mockGoBack).not.toHaveBeenCalled();
});

it('pauses while pressed and held', async () => {
  await open();
  fireEvent(screen.getByTestId('story-viewer-tap'), 'pressIn');
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 3));
  expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
  fireEvent(screen.getByTestId('story-viewer-tap'), 'pressOut');
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS));
  expect(eyebrow()).toHaveTextContent('MY WEEK · 2 OF 3');
});

it('with reduce motion on, stays on a frame until tapped', async () => {
  mockReduceMotion = true;
  await open();
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 3));
  expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
  tap(10000);
  expect(eyebrow()).toHaveTextContent('MY WEEK · 2 OF 3');
});

it('closes on a swipe down, and springs back on a short drag', async () => {
  await open();
  act(() => fireGestureHandler(getByGestureTestId('story-viewer-swipe'), [{ state: State.BEGAN }, { state: State.ACTIVE, translationY: 30 }, { state: State.END, translationY: 30, velocityY: 50 }]));
  act(() => jest.advanceTimersByTime(1));
  expect(mockGoBack).not.toHaveBeenCalled();
  act(() => fireGestureHandler(getByGestureTestId('story-viewer-swipe'), [{ state: State.BEGAN }, { state: State.ACTIVE, translationY: 200 }, { state: State.END, translationY: 200, velocityY: 1200 }]));
  // runOnJS hands the close to the JS thread on the next tick.
  act(() => jest.advanceTimersByTime(1));
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

it('closes from the close button', async () => {
  await open();
  fireEvent.press(screen.getByTestId('story-viewer-close'));
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

it('shares the frame on screen, from the off-screen 1080-wide export, paused while it runs', async () => {
  await open();
  tap(10000);
  tap(10000);
  expect(screen.getByTestId('story-export-eyebrow')).toHaveTextContent('MY WEEK · 3 OF 3');
  // The exported frame draws its own full bar.
  expect(screen.getByTestId('story-export-progress-slot')).toHaveStyle({ opacity: 1 });
  let finish!: () => void;
  (shareImage as jest.Mock).mockImplementation(() => new Promise<void>((r) => (finish = r)));
  await act(async () => fireEvent.press(screen.getByTestId('story-viewer-share')));
  expect(captureToPng).toHaveBeenCalledTimes(1);
  expect(shareImage).toHaveBeenCalledWith(URI);
  // The share sheet is up: the story does not run out underneath it.
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 2));
  expect(screen.getByTestId('story-viewer-share')).toBeDisabled();
  await act(async () => finish());
  expect(screen.getByTestId('story-viewer-share')).not.toBeDisabled();
  // The export is the frame alone: no end actions, no viewer chrome.
  const exported = screen.getByTestId('story-export-view');
  for (const id of ['story-end-actions', 'story-viewer-header', 'story-viewer-reply', 'story-viewer-progress']) expect(within(exported).queryByTestId(id)).toBeNull();
});

it('saves the frame on screen and says so', async () => {
  await open();
  tap(10000);
  await act(async () => fireEvent.press(screen.getByTestId('story-viewer-save')));
  expect(captureToPng).toHaveBeenCalledTimes(1);
  expect(saveImage).toHaveBeenCalledWith(URI);
  expect(screen.getByTestId('story-viewer-notice')).toHaveTextContent('Saved to Photos.');
});

it("follows the builder's stored include choices", async () => {
  store['recapInclude.story'] = JSON.stringify({ bestNight: false });
  await open();
  tap(10000);
  expect(screen.queryByTestId('story-best')).toBeNull();
  expect(screen.queryByTestId('story-export-best')).toBeNull();
});

it('draws light status bar content and the chrome on the coach ground, whatever the app theme', async () => {
  await open();
  const bars = screen.UNSAFE_getAllByType(StatusBar);
  expect(bars[bars.length - 1]!.props.barStyle).toBe('light-content');
  const t = recapTint('luna');
  expect(screen.getByTestId('story-viewer-title')).toHaveStyle({ color: t.text });
  tap(10000);
  tap(10000);
  expect(StyleSheet.flatten(screen.getByTestId('story-end-full-recap').props.style)).toMatchObject({ backgroundColor: t.accent });
  expect(screen.getByTestId('story-end-full-recap-label')).toHaveStyle({ color: t.ground });
  expect(screen.getByTestId('story-end-again-label')).toHaveStyle({ color: t.text });
});

it('draws no frame until the stored include choices have loaded, then starts from frame 1', async () => {
  let finish!: (v: string | null) => void;
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(() => new Promise((r) => (finish = r)));
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      {withCharacter(<RecapStoryScreen />)}
    </SafeAreaProvider>,
  );
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 2));
  expect(screen.queryByTestId('story')).toBeNull();
  expect(screen.queryByTestId('story-export')).toBeNull();
  await act(async () => finish(JSON.stringify({ bestNight: false })));
  expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
  tap(10000);
  expect(screen.queryByTestId('story-best')).toBeNull();
});

it('stays on a frame while a screen reader is on, still stepping by tap', async () => {
  (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true);
  await open();
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 3));
  expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
  tap(10000);
  expect(eyebrow()).toHaveTextContent('MY WEEK · 2 OF 3');
});

it('pauses when a screen reader is turned on mid-story and runs again when it is off', async () => {
  const listeners: Array<(on: boolean) => void> = [];
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, fn: (on: boolean) => void) => {
    if (event === 'screenReaderChanged') listeners.push(fn);
    return { remove: jest.fn() };
  }) as never);
  await open();
  act(() => listeners.forEach((fn) => fn(true)));
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 3));
  expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
  act(() => listeners.forEach((fn) => fn(false)));
  act(() => jest.advanceTimersByTime(STORY_FRAME_MS));
  expect(eyebrow()).toHaveTextContent('MY WEEK · 2 OF 3');
});

describe('header and reply bar (design E)', () => {
  it('shows the recap coach, the week and Share / Close above the frame', async () => {
    await open();
    expect(screen.getByTestId('story-viewer-title')).toHaveTextContent('Luna · Your week');
    expect(screen.getByTestId('story-viewer-range')).toHaveTextContent('Sep 28 – Oct 4');
    expect(screen.getByTestId('story-viewer-coach')).toBeTruthy();
    expect(screen.getByTestId('story-viewer-share').props.accessibilityLabel).toBe('Share this frame');
    expect(screen.getByTestId('story-viewer-close').props.accessibilityLabel).toBe('Close story');
  });

  it('asks the coach about the week: closes the viewer onto the chat with the question in the composer, not sent', async () => {
    await open({ status: CONSENTED, characterId: 'mochi' });
    expect(screen.getByTestId('story-viewer-ask')).toHaveTextContent('Ask Mochi about your week…');
    fireEvent.press(screen.getByTestId('story-viewer-ask'));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Coach', params: { prefill: 'What stood out in my week of Sep 28 – Oct 4?' } }, { pop: true });
  });

  it('hides the ask bar when the coach is off or not consented, and keeps Save', async () => {
    await open({ status: { enabled: true, consented: false } as never });
    expect(screen.queryByTestId('story-viewer-ask')).toBeNull();
    expect(screen.getByTestId('story-viewer-save')).toBeTruthy();
  });

  it('holds the story while a finger is on the bar', async () => {
    await open({ status: CONSENTED });
    fireEvent(screen.getByTestId('story-viewer-ask'), 'pressIn');
    act(() => jest.advanceTimersByTime(STORY_FRAME_MS * 2));
    expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
    fireEvent(screen.getByTestId('story-viewer-ask'), 'pressOut');
    act(() => jest.advanceTimersByTime(STORY_FRAME_MS));
    expect(eyebrow()).toHaveTextContent('MY WEEK · 2 OF 3');
  });
});

describe('end actions (design B)', () => {
  async function atEnd() {
    await open();
    tap(10000);
    tap(10000);
    expect(screen.queryByTestId('story-viewer-reply')).toBeNull();
  }

  it('See full recap replaces the viewer with that recap', async () => {
    await atEnd();
    fireEvent.press(screen.getByTestId('story-end-full-recap'));
    expect(mockReplace).toHaveBeenCalledWith('Recap', { id: 'r-week' });
  });

  it('See full recap goes back when the story was opened from that recap', async () => {
    mockStack = { index: 1, routes: [{ name: 'Recap', params: { id: 'r-week' } }, { name: 'RecapStory' }] };
    await atEnd();
    fireEvent.press(screen.getByTestId('story-end-full-recap'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('Share this week opens the builder on the story format', async () => {
    await atEnd();
    fireEvent.press(screen.getByTestId('story-end-share'));
    expect(mockReplace).toHaveBeenCalledWith('RecapBuilder', { id: 'r-week', format: 'story' });
  });

  it('Watch again restarts at frame 1 and runs again', async () => {
    await atEnd();
    fireEvent.press(screen.getByTestId('story-end-again'));
    expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
    expect(screen.getByTestId('story-viewer-reply')).toBeTruthy();
    act(() => jest.advanceTimersByTime(STORY_FRAME_MS));
    expect(eyebrow()).toHaveTextContent('MY WEEK · 2 OF 3');
  });
});

describe('the story is the recap', () => {
  it('marks the recap opened once', async () => {
    await open();
    tap(10000);
    expect(markRecapOpened).toHaveBeenCalledTimes(1);
    expect(markRecapOpened).toHaveBeenCalledWith('r-week');
  });

  it('does not post again for a recap already opened on the server', async () => {
    mockParams = { recap: { ...mockRecap, openedAt: '2026-10-05T10:00:00.000Z' } };
    await open();
    expect(markRecapOpened).not.toHaveBeenCalled();
  });

  it("a week's push tapped while a story is up shows that week from its first frame", async () => {
    await open();
    tap(10000);
    mockParams = { recap: { ...mockRecap, id: 'r-next', periodStart: '2026-10-05', periodEnd: '2026-10-11' } };
    screen.rerender(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        {withCharacter(<RecapStoryScreen />)}
      </SafeAreaProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('story-viewer-range')).toHaveTextContent('Oct 5 – Oct 11');
    expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
    expect(markRecapOpened).toHaveBeenCalledWith('r-next');
  });

  it("a push for another recap while a story is up loads and plays that one", async () => {
    await open();
    tap(10000);
    mockParams = { id: 'r-next' };
    (fetchRecap as jest.Mock).mockResolvedValue({ ...mockRecap, id: 'r-next', periodStart: '2026-10-05', periodEnd: '2026-10-11' });
    screen.rerender(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
        {withCharacter(<RecapStoryScreen />)}
      </SafeAreaProvider>,
    );
    await act(async () => {});
    expect(fetchRecap).toHaveBeenCalledWith('r-next');
    expect(screen.getByTestId('story-viewer-range')).toHaveTextContent('Oct 5 – Oct 11');
    expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
  });

  it('loads a week by id (avatar, shelf) and plays it', async () => {
    mockParams = { id: 'r-week' };
    (fetchRecap as jest.Mock).mockResolvedValue(mockRecap);
    await open();
    await act(async () => {});
    expect(fetchRecap).toHaveBeenCalledWith('r-week');
    expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
    expect(markRecapOpened).toHaveBeenCalledWith('r-week');
  });

  it("says a recap that is gone isn't available, with a way back", async () => {
    mockParams = { id: 'r-gone' };
    (fetchRecap as jest.Mock).mockRejectedValue(new ApiError(404, 'gone', 'not_found'));
    await open();
    await act(async () => {});
    expect(screen.getByTestId('story-viewer-missing')).toHaveTextContent("This recap isn't available.");
    fireEvent.press(screen.getByTestId('story-viewer-missing-back'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(markRecapOpened).not.toHaveBeenCalled();
  });

  it('offers a retry when the recap could not be loaded', async () => {
    mockParams = { id: 'r-week' };
    (fetchRecap as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(mockRecap);
    await open();
    await act(async () => {});
    expect(screen.getByTestId('story-viewer-error')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('story-viewer-retry')));
    expect(eyebrow()).toHaveTextContent('MY WEEK · 1 OF 3');
  });

  it('a month reached by id opens its recap screen instead', async () => {
    mockParams = { id: 'r-month' };
    (fetchRecap as jest.Mock).mockResolvedValue({ ...mockRecap, id: 'r-month', kind: 'MONTH' });
    await open();
    await act(async () => {});
    expect(mockReplace).toHaveBeenCalledWith('Recap', { id: 'r-month' });
    expect(screen.queryByTestId('story')).toBeNull();
  });
});

it('frame 3 shows the badge levels earned that week, on screen and in the shared image', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 2, value: 7, earnedOn: '2026-10-01' }] },
    STEP_GOAL: { level: 1, levels: [{ level: 1, value: 3, earnedOn: '2026-10-06' }] },
  }));
  mockReduceMotion = true;
  await open();
  await act(async () => {});
  tap(10000);
  tap(10000);
  expect(eyebrow()).toHaveTextContent('MY WEEK · 3 OF 3');
  expect(screen.getByTestId('story-badges')).toHaveTextContent(/Sleep goal II/);
  expect(screen.queryByTestId('story-badge-STEP_GOAL-1')).toBeNull();
  expect(screen.getByTestId('story-export-badges')).toBeTruthy();
});

it('frame 3 has no badge card when the server has no badges (404)', async () => {
  mockReduceMotion = true;
  await open();
  await act(async () => {});
  tap(10000);
  tap(10000);
  expect(eyebrow()).toHaveTextContent('MY WEEK · 3 OF 3');
  expect(screen.queryByTestId('story-badges')).toBeNull();
  expect(screen.queryByTestId('story-export-badges')).toBeNull();
  expect(screen.getByTestId('story-story')).toBeTruthy();
});

it('frame 3 has no badge card when loading the badges fails', async () => {
  (fetchAchievements as jest.Mock).mockRejectedValue(new Error('network'));
  mockReduceMotion = true;
  await open();
  await act(async () => {});
  tap(10000);
  tap(10000);
  expect(eyebrow()).toHaveTextContent('MY WEEK · 3 OF 3');
  expect(screen.queryByTestId('story-badges')).toBeNull();
  expect(screen.queryByTestId('story-export-badges')).toBeNull();
  expect(screen.getByTestId('story-story')).toBeTruthy();
});
