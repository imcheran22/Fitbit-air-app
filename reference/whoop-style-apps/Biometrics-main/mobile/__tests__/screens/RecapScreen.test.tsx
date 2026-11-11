import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { HIDDEN_OK, withCharacter } from '../../jest-mocks/characterContext';
import { fetchAchievements } from '../../src/api/achievements';
import { refreshAchievements, resetAchievements } from '../../src/lib/achievementsStore';
import { ApiError } from '../../src/api/client';
import { fetchRecap, fetchRecaps, markRecapOpened, type Recap } from '../../src/api/recaps';
import { resetUnwatchedRecap } from '../../src/lib/unwatchedRecap';
import { changeColor } from '../../src/lib/recapTheme';
import { RecapScreen } from '../../src/screens/RecapScreen';

jest.mock('../../src/api/recaps');
jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/timezone', () => require('../../jest-mocks/timezoneSettled'));
jest.mock('expo-secure-store');
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockCanGoBack = true;
let mockParams: { id: string } = { id: 'r-month' };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, canGoBack: () => mockCanGoBack }),
  useRoute: () => ({ params: mockParams }),
  NavigationContext: require('react').createContext(undefined),
}));

const load = fetchRecap as jest.Mock;
const opened = markRecapOpened as jest.Mock;
const BASE = { personaId: 'mochi', builtAt: '2026-10-01T09:00:00.000Z', openedAt: null, sleepGoalMinutes: 480, lineSource: 'ai' as const, rebuiltAt: null };
const MONTH: Recap = {
  ...BASE, id: 'r-month', kind: 'MONTH', periodStart: '2026-09-01', periodEnd: '2026-09-30', line: 'Six nights in a row on goal, lovely.', story: null,
  stats: { nightsWithData: 25, avgSleepMinutes: 455, longestOnGoalStreak: 6, comparison: { avgSleepDelta: 18, avgRecoveryDelta: -4 }, milestones: { streak: { nights: 6 } } },
};
const WEEK: Recap = {
  ...BASE, id: 'r-week', kind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04', line: 'A steady week.', story: 'You hit your goal on 5 nights this week.',
  stats: { nightsWithData: 6, weekStrip: [] },
};
const GONE = () => new ApiError(404, 'Request to /me/recaps/x failed with 404', 'not_found');

beforeEach(() => {
  jest.clearAllMocks();
  // Each test opens its recap afresh (the store remembers what this session opened).
  resetUnwatchedRecap();
  mockParams = { id: 'r-month' };
  mockCanGoBack = true;
  load.mockResolvedValue(MONTH);
  opened.mockResolvedValue(undefined);
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  resetAchievements();
  (fetchAchievements as jest.Mock).mockResolvedValue(null);
  // The newest month recap is this one unless a test says otherwise.
  (fetchRecaps as jest.Mock).mockResolvedValue([{ id: 'r-month', kind: 'MONTH' }]);
});

it('shows a month with its coach in the quote card, every milestone (unearned ones locked) and signed changes for the comparisons present', async () => {
  render(withCharacter(<RecapScreen />));
  expect(await screen.findByTestId('recap-title')).toHaveTextContent('SEPTEMBER WITH MOCHI');
  expect(screen.getByRole('header', { name: 'September with Mochi' })).toBeTruthy();
  expect(screen.getByTestId('recap-line')).toHaveTextContent('“Six nights in a row on goal, lovely.”');
  expect(screen.getByTestId('recap-line-coach', HIDDEN_OK)).toBeTruthy();
  expect(screen.getByTestId('recap-milestones-streak').props.accessibilityLabel).toBe('6 nights on goal in a row, earned');
  expect(screen.getByTestId('recap-milestones-bestRecoveryWeek').props.accessibilityLabel).toBe('Best recovery week, locked');
  expect(screen.getByTestId('recap-milestones-everyDayLogged').props.accessibilityLabel).toBe('Every night logged, locked');
  expect(screen.getByTestId('recap-milestones-steadiestMonth').props.accessibilityLabel).toBe('Steadiest bedtimes yet, locked');
  expect(screen.getByText('Compared with last month')).toBeTruthy();
  expect(screen.getByTestId('recap-compare-avgSleep')).toHaveTextContent('Average sleep+18m');
  expect(screen.getByTestId('recap-compare-avgSleep-change')).toHaveStyle({ color: changeColor('better', 'light') });
  expect(screen.getByTestId('recap-compare-recovery')).toHaveTextContent('Recovery average−4 pts');
  expect(screen.getByTestId('recap-compare-recovery-change')).toHaveStyle({ color: changeColor('worse', 'light') });
  expect(screen.queryByTestId('recap-compare-spread')).toBeNull();
  fireEvent.press(screen.getByTestId('recap-make-share'));
  expect(mockNavigate).toHaveBeenCalledWith('RecapBuilder', { id: 'r-month', format: 'card' });
});

it('colours a smaller bedtime spread as better, a bigger one as worse, and no change grey', async () => {
  load.mockResolvedValue({ ...MONTH, stats: { ...MONTH.stats, comparison: { bedtimeSpreadDelta: -9, avgSleepDelta: 0 } } });
  render(withCharacter(<RecapScreen />));
  await screen.findByTestId('recap-title');
  expect(screen.getByTestId('recap-compare-spread')).toHaveTextContent('Bedtime spread−9m');
  expect(screen.getByTestId('recap-compare-spread-change')).toHaveStyle({ color: changeColor('better', 'light') });
  expect(screen.getByTestId('recap-compare-avgSleep-change')).toHaveStyle({ color: changeColor('same', 'light') });
});

it('still shows the four milestones, all locked, and leaves out the comparison when the month has none', async () => {
  load.mockResolvedValue({ ...MONTH, stats: { nightsWithData: 3 } });
  render(withCharacter(<RecapScreen />));
  await screen.findByTestId('recap-title');
  for (const key of ['streak', 'bestRecoveryWeek', 'everyDayLogged', 'steadiestMonth']) {
    expect(screen.getByTestId(`recap-milestones-${key}`).props.accessibilityLabel).toMatch(/, locked$/);
  }
  expect(screen.queryByTestId('recap-compare')).toBeNull();
  expect(screen.queryByText('Compared with last month')).toBeNull();
});

it('shows a week as its story card with the paragraph under it', async () => {
  mockParams = { id: 'r-week' };
  load.mockResolvedValue(WEEK);
  render(withCharacter(<RecapScreen />));
  expect(await screen.findByTestId('recap-title')).toHaveTextContent('YOUR WEEK WITH MOCHI');
  expect(screen.getByTestId('recap-story-preview')).toBeTruthy();
  expect(screen.getByTestId('recap-story-text')).toHaveTextContent('You hit your goal on 5 nights this week.');
  fireEvent.press(screen.getByTestId('recap-make-share'));
  expect(mockNavigate).toHaveBeenCalledWith('RecapBuilder', { id: 'r-week', format: 'story' });
});

it("draws the week's preview with the builder's stored include choices", async () => {
  mockParams = { id: 'r-week' };
  load.mockResolvedValue({ ...WEEK, stats: { ...WEEK.stats, bestNight: { date: '2026-09-29', minutesAsleep: 485 } } });
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) => Promise.resolve(k === 'recapInclude.story' ? JSON.stringify({ bestNight: false, quote: false }) : null));
  render(withCharacter(<RecapScreen />));
  await screen.findByTestId('recap-story-title');
  expect(screen.queryByTestId('recap-story-best')).toBeNull();
  expect(screen.queryByTestId('recap-story-says')).toBeNull();
});

it('opens the story viewer from the preview and from "View story"', async () => {
  mockParams = { id: 'r-week' };
  load.mockResolvedValue(WEEK);
  render(withCharacter(<RecapScreen />));
  fireEvent.press(await screen.findByTestId('recap-story-preview'));
  expect(mockNavigate).toHaveBeenLastCalledWith('RecapStory', { recap: WEEK });
  mockNavigate.mockClear();
  fireEvent.press(screen.getByTestId('recap-view-story'));
  expect(mockNavigate).toHaveBeenLastCalledWith('RecapStory', { recap: WEEK });
  expect(screen.getByTestId('recap-story-preview').props.accessibilityLabel).toBe('View story');
});

it("names the recap's own coach after a coach switch, not the current one (ruling S6)", async () => {
  load.mockResolvedValue({ ...MONTH, personaId: 'luna' });
  const { unmount } = render(withCharacter(<RecapScreen />, { characterId: 'mochi' }));
  expect(await screen.findByTestId('recap-title')).toHaveTextContent('SEPTEMBER WITH LUNA');
  unmount();

  mockParams = { id: 'r-week' };
  load.mockResolvedValue({ ...WEEK, personaId: 'luna' });
  render(withCharacter(<RecapScreen />, { characterId: 'mochi' }));
  expect(await screen.findByTestId('recap-title')).toHaveTextContent('YOUR WEEK WITH LUNA');
  expect(screen.getByTestId('recap-story-title')).toHaveTextContent('How Luna saw my week');
});

it('falls back to the current coach when the recap has no coach we know', async () => {
  load.mockResolvedValue({ ...MONTH, personaId: null });
  render(withCharacter(<RecapScreen />, { characterId: 'boba' }));
  expect(await screen.findByTestId('recap-title')).toHaveTextContent('SEPTEMBER WITH BOBA');
});

it('marks the recap opened once, when it is shown', async () => {
  const { rerender } = render(withCharacter(<RecapScreen />));
  await screen.findByTestId('recap-title');
  await waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
  expect(opened).toHaveBeenCalledWith('r-month');
  rerender(withCharacter(<RecapScreen />));
  await screen.findByTestId('recap-title');
  expect(opened).toHaveBeenCalledTimes(1);
});

it('keeps the recap on screen when marking it opened fails', async () => {
  opened.mockRejectedValue(new Error('offline'));
  render(withCharacter(<RecapScreen />));
  await screen.findByTestId('recap-title');
  await waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId('recap-title')).toHaveTextContent('SEPTEMBER WITH MOCHI');
  expect(screen.queryByTestId('recap-error')).toBeNull();
});

it("says a gone or someone else's recap isn't available, and never marks it opened (Review Focus 5)", async () => {
  load.mockRejectedValue(GONE());
  render(withCharacter(<RecapScreen />));
  expect(await screen.findByTestId('recap-missing')).toHaveTextContent("This recap isn't available.");
  expect(screen.queryByTestId('recap-loading')).toBeNull();
  expect(opened).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('recap-missing-back'));
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

it('takes a missing recap opened with nothing behind it (a cold-start push) home', async () => {
  mockCanGoBack = false;
  load.mockRejectedValue(GONE());
  render(withCharacter(<RecapScreen />));
  fireEvent.press(await screen.findByTestId('recap-missing-back'));
  expect(mockGoBack).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('Tabs');
});

it('offers a retry after another failure', async () => {
  load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(MONTH);
  render(withCharacter(<RecapScreen />));
  fireEvent.press(await screen.findByTestId('recap-retry'));
  expect(await screen.findByTestId('recap-title')).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(2);
});

it('shows the new recap, never a stale one, when a push re-opens this screen with another id (T19 ruling)', async () => {
  let resolveMonth!: (r: Recap) => void;
  load.mockImplementation((id: string) => (id === 'r-month' ? new Promise<Recap>((r) => (resolveMonth = r)) : Promise.resolve(WEEK)));
  const { rerender } = render(withCharacter(<RecapScreen />));
  // The push lands while the first recap is still loading: same screen, new params.
  mockParams = { id: 'r-week' };
  rerender(withCharacter(<RecapScreen />));
  expect(await screen.findByTestId('recap-title')).toHaveTextContent('YOUR WEEK WITH MOCHI');
  // The first recap's answer arrives late and is dropped.
  await act(async () => resolveMonth(MONTH));
  expect(screen.getByTestId('recap-title')).toHaveTextContent('YOUR WEEK WITH MOCHI');
  await waitFor(() => expect(opened).toHaveBeenCalledWith('r-week'));
  expect(opened).not.toHaveBeenCalledWith('r-month');
});

it("shows badge progress on the month's tiles, a level-up mark, and the streak badges earned that month", async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 1, value: 3, earnedOn: '2026-08-30' }, { level: 2, value: 7, earnedOn: '2026-09-12' }] },
    EVERY_DAY_LOGGED: { level: 1, current: 1, levels: [{ level: 1, value: 1, earnedOn: '2026-09-30' }] },
  }, { since: '2026-08-15' }));
  load.mockResolvedValue({ ...MONTH, stats: { ...MONTH.stats, milestones: { everyDayLogged: { days: 30 } } } });
  render(withCharacter(<RecapScreen />));
  expect(await screen.findByTestId('recap-milestones-everyDayLogged-progress')).toHaveTextContent('1 of 3 months for Silver');
  expect(screen.getByTestId('recap-milestones-everyDayLogged-levelup')).toHaveTextContent('LEVEL UP');
  expect(screen.queryByTestId('recap-milestones-streak')).toBeNull();
  expect(screen.getByText('Badges earned in September')).toBeTruthy();
  expect(screen.getByTestId('recap-month-badge-SLEEP_GOAL-2')).toHaveTextContent('Sleep goal II');
  expect(screen.queryByTestId('recap-month-badge-SLEEP_GOAL-1')).toBeNull();
  expect(screen.queryByTestId('recap-month-badge-EVERY_DAY_LOGGED-1')).toBeNull();
  expect(fetchRecaps).toHaveBeenCalledWith({ kind: 'MONTH', limit: 1 });
});

it('shows an older month recap without progress, keeping its level-up mark and "Badges earned"', async () => {
  (fetchRecaps as jest.Mock).mockResolvedValue([{ id: 'r-newer-month', kind: 'MONTH' }]);
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 2, value: 7, earnedOn: '2026-09-12' }] },
    EVERY_DAY_LOGGED: { level: 1, current: 2, levels: [{ level: 1, value: 1, earnedOn: '2026-09-30' }] },
  }, { since: '2026-08-15' }));
  load.mockResolvedValue({ ...MONTH, stats: { ...MONTH.stats, milestones: { everyDayLogged: { days: 30 } } } });
  render(withCharacter(<RecapScreen />));
  expect(await screen.findByTestId('recap-milestones-everyDayLogged-levelup')).toHaveTextContent('LEVEL UP');
  expect(screen.getByTestId('recap-milestones-everyDayLogged').props.accessibilityLabel).toBe('Every night logged, earned, level up');
  expect(screen.queryByTestId('recap-milestones-everyDayLogged-progress')).toBeNull();
  expect(screen.queryByTestId('recap-milestones-steadiestMonth-progress')).toBeNull();
  expect(screen.getByTestId('recap-month-badge-SLEEP_GOAL-2')).toBeTruthy();
});

it('shows a month before the badge start date without progress, and no "Badges earned" section', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({}, { since: '2026-10-07' }));
  render(withCharacter(<RecapScreen />));
  await screen.findByTestId('recap-title');
  await waitFor(() => expect(screen.queryByTestId('recap-milestones-streak')).toBeNull());
  expect(screen.getByTestId('recap-milestones-everyDayLogged')).toBeTruthy();
  expect(screen.queryByTestId('recap-milestones-everyDayLogged-progress')).toBeNull();
  expect(screen.queryByTestId('recap-month-badges')).toBeNull();
});

it('keeps the four original tiles against a backend without badges (404)', async () => {
  render(withCharacter(<RecapScreen />));
  await screen.findByTestId('recap-title');
  await act(async () => {});
  expect(screen.getByTestId('recap-milestones-streak').props.accessibilityLabel).toBe('6 nights on goal in a row, earned');
  expect(screen.queryByTestId('recap-milestones-everyDayLogged-progress')).toBeNull();
  expect(screen.queryByTestId('recap-month-badges')).toBeNull();
});

it('reloads badges already in the store when the month opens, so a level earned since shows up', async () => {
  // Loaded earlier in the session, before this month's level.
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({ EVERY_DAY_LOGGED: { level: 0, current: 0 } }, { since: '2026-08-15' }));
  await act(async () => {
    await refreshAchievements();
  });
  (fetchAchievements as jest.Mock).mockClear();
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    EVERY_DAY_LOGGED: { level: 1, current: 1, levels: [{ level: 1, value: 1, earnedOn: '2026-09-30' }] },
  }, { since: '2026-08-15' }));
  load.mockResolvedValue({ ...MONTH, stats: { ...MONTH.stats, milestones: { everyDayLogged: { days: 30 } } } });
  render(withCharacter(<RecapScreen />));
  expect(await screen.findByTestId('recap-milestones-everyDayLogged-levelup')).toHaveTextContent('LEVEL UP');
  expect(screen.getByTestId('recap-milestones-everyDayLogged-progress')).toHaveTextContent('1 of 3 months for Silver');
  expect(fetchAchievements).toHaveBeenCalledTimes(1);
});

it('shows no progress when the newest-month lookup fails, keeping the level-up mark and "Badges earned"', async () => {
  (fetchRecaps as jest.Mock).mockRejectedValue(new Error('offline'));
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 2, value: 7, earnedOn: '2026-09-12' }] },
    EVERY_DAY_LOGGED: { level: 1, current: 1, levels: [{ level: 1, value: 1, earnedOn: '2026-09-30' }] },
  }, { since: '2026-08-15' }));
  load.mockResolvedValue({ ...MONTH, stats: { ...MONTH.stats, milestones: { everyDayLogged: { days: 30 } } } });
  render(withCharacter(<RecapScreen />));
  expect(await screen.findByTestId('recap-milestones-everyDayLogged-levelup')).toHaveTextContent('LEVEL UP');
  await act(async () => {});
  expect(fetchRecaps).toHaveBeenCalledWith({ kind: 'MONTH', limit: 1 });
  expect(screen.queryByTestId('recap-milestones-everyDayLogged-progress')).toBeNull();
  expect(screen.queryByTestId('recap-milestones-steadiestMonth-progress')).toBeNull();
  expect(screen.getByTestId('recap-month-badge-SLEEP_GOAL-2')).toBeTruthy();
});
