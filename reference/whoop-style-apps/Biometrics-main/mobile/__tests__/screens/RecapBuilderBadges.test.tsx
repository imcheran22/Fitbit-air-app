import React from 'react';
import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { fetchRecap, type Recap } from '../../src/api/recaps';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { RecapBuilderScreen } from '../../src/screens/RecapBuilderScreen';

jest.mock('../../src/api/recaps');
jest.mock('../../src/api/sleep');
jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/timezone', () => require('../../jest-mocks/timezoneSettled'));
jest.mock('expo-secure-store');
jest.mock('../../src/lib/recapCapture', () => ({ captureToPng: jest.fn(), saveImage: jest.fn(), shareImage: jest.fn() }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }), useRoute: () => ({ params: { id: 'r-week', format: 'story' } }) }));

const WEEK: Recap = {
  id: 'r-week', kind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04', line: 'A calm week.', personaId: 'mochi',
  builtAt: '2026-10-05T09:00:00.000Z', openedAt: null, sleepGoalMinutes: 480, lineSource: 'ai', story: 'A calm week.', rebuiltAt: null,
  stats: { nightsWithData: 6, avgSleepMinutes: 455, nightsOnGoal: 5, weekStrip: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (fetchRecap as jest.Mock).mockResolvedValue(WEEK);
});

it("puts the week's badge levels on story frame 3, in the preview and in the shared image", async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 1, value: 3, earnedOn: '2026-09-20' }, { level: 2, value: 7, earnedOn: '2026-10-01' }] },
    STEP_GOAL: { level: 1, levels: [{ level: 1, value: 3, earnedOn: '2026-10-06' }] },
  }));
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-frame')).toBeTruthy();
  fireEvent.press(screen.getByTestId('builder-frame-2'));
  const exported = within(screen.getByTestId('builder-export'));
  expect(await exported.findByTestId('export-badges')).toHaveTextContent(/Sleep goal II/);
  expect(exported.queryByTestId('export-badge-SLEEP_GOAL-1')).toBeNull();
  expect(exported.queryByTestId('export-badge-STEP_GOAL-1')).toBeNull();
  expect(within(screen.getByTestId('builder-preview')).getByTestId('preview-badges')).toBeTruthy();
});

it('has a "Badges this week" switch, on by default and remembered, that takes the card off the preview and the image', async () => {
  const store: Record<string, string> = {};
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) => Promise.resolve(store[k] ?? null));
  (SecureStore.setItemAsync as jest.Mock).mockImplementation((k: string, v: string) => {
    store[k] = v;
    return Promise.resolve();
  });
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 2, value: 7, earnedOn: '2026-10-01' }] },
  }));
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-include-badges')).toBeTruthy();
  expect(screen.getByTestId('builder-include-badges').props.accessibilityLabel).toBe('Badges this week');
  await waitFor(() => expect(screen.getByTestId('builder-include-badges').props.value).toBe(true));
  fireEvent.press(screen.getByTestId('builder-frame-2'));
  expect(await within(screen.getByTestId('builder-export')).findByTestId('export-badges')).toBeTruthy();
  fireEvent(screen.getByTestId('builder-include-badges'), 'valueChange', false);
  expect(within(screen.getByTestId('builder-export')).queryByTestId('export-badges')).toBeNull();
  expect(within(screen.getByTestId('builder-preview')).queryByTestId('preview-badges')).toBeNull();
  await waitFor(() => expect(JSON.parse(store['recapInclude.story']!)).toEqual({ badges: false }));
});

it('leaves the card out when no level was earned that week', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture());
  render(withCharacter(<RecapBuilderScreen />));
  await screen.findByTestId('builder-frame');
  fireEvent.press(screen.getByTestId('builder-frame-2'));
  await act(async () => {});
  expect(screen.queryByTestId('export-badges')).toBeNull();
});

it('offers the "Badges this week" switch only when the week has a badge level', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture());
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-include-quote')).toBeTruthy();
  await act(async () => {});
  expect(screen.queryByTestId('builder-include-badges')).toBeNull();
});

it('does not offer the switch when badges are unavailable (a backend without them)', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(null);
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-include-quote')).toBeTruthy();
  await act(async () => {});
  expect(screen.queryByTestId('builder-include-badges')).toBeNull();
});
