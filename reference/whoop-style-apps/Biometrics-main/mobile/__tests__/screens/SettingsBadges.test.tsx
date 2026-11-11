import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { getTimezoneState } from '../../src/lib/timezone';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { SettingsScreen } from '../../src/screens/SettingsScreen';

jest.mock('../../src/lib/timezone');
jest.mock('../../src/api/achievements');

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  (getTimezoneState as jest.Mock).mockResolvedValue({ timezone: 'UTC', overridden: false });
});

it('shows the Badges card on Profile above the category cards', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({ SLEEP_GOAL: { level: 1 } }));
  render(<SettingsScreen />);
  expect(await screen.findByTestId('badges-card')).toBeTruthy();
  expect(screen.getByTestId('badges-count')).toHaveTextContent('BADGES · 1 OF 35');
  expect(screen.getByTestId('profile-category-health')).toBeTruthy();
});

it('leaves the card out against a backend without badges (404)', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(null);
  render(<SettingsScreen />);
  await waitFor(() => expect(fetchAchievements).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.queryByTestId('badges-card')).toBeNull();
  expect(screen.getByTestId('profile-category-health')).toBeTruthy();
});

it('refreshes the badges each time Profile comes back into focus', async () => {
  (fetchAchievements as jest.Mock).mockResolvedValue(null);
  // Other Profile parts (the story ring) listen for focus too, so keep every listener.
  const focus = new Set<() => void>();
  const navigation = {
    navigate: jest.fn(),
    addListener: jest.fn((_event: 'focus', cb: () => void) => {
      focus.add(cb);
      return () => focus.delete(cb);
    }),
  };
  render(
    <NavigationContext.Provider value={navigation as any}>
      <SettingsScreen />
    </NavigationContext.Provider>,
  );
  await waitFor(() => expect(fetchAchievements).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(screen.queryByTestId('badges-card')).toBeNull();

  // A level earned since (or a first load that failed) shows on the next visit to the tab.
  (fetchAchievements as jest.Mock).mockResolvedValue(achievementsFixture({ SLEEP_GOAL: { level: 1 } }));
  await act(async () => focus.forEach((cb) => cb()));
  await waitFor(() => expect(fetchAchievements).toHaveBeenCalledTimes(2));
  expect(await screen.findByTestId('badges-card')).toBeTruthy();
});
