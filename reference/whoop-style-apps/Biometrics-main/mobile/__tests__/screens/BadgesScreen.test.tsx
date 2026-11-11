import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { BadgesScreen } from '../../src/screens/BadgesScreen';

jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/timezone', () => require('../../jest-mocks/timezoneSettled'));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  NavigationContext: require('react').createContext(undefined),
}));
const load = fetchAchievements as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
});

it('lists the seven families with their rule and status, and opens one', async () => {
  load.mockResolvedValue(achievementsFixture({ SLEEP_GOAL: { level: 2, current: 9 } }));
  render(withCharacter(<BadgesScreen />));
  expect(await screen.findByTestId('badges-row-SLEEP_GOAL-status')).toHaveTextContent('Level II · Silver · 9 / 14 nights');
  expect(screen.getByTestId('badges-row-EVERY_DAY_LOGGED-status')).toHaveTextContent('Not yet · 0 / 1 month');
  expect(screen.getByTestId('badges-row-STEP_GOAL')).toHaveTextContent('Finished days in a row at 10,000 steps', { exact: false });
  fireEvent.press(screen.getByTestId('badges-row-CHECK_IN'));
  expect(mockNavigate).toHaveBeenCalledWith('BadgeDetail', { family: 'CHECK_IN' });
});

it('says badges are not available against an old backend, and offers a retry after an error', async () => {
  load.mockResolvedValue(null);
  const first = render(withCharacter(<BadgesScreen />));
  expect(await screen.findByTestId('badges-unavailable')).toBeTruthy();
  first.unmount();

  resetAchievements();
  load.mockRejectedValueOnce(new Error('offline'));
  render(withCharacter(<BadgesScreen />));
  expect(await screen.findByTestId('badges-error')).toBeTruthy();
  load.mockResolvedValue(achievementsFixture());
  await act(async () => fireEvent.press(screen.getByTestId('badges-retry')));
  expect(await screen.findByTestId('badges-row-SLEEP_GOAL')).toBeTruthy();
});

it('reloads the badges each time the screen comes back into focus', async () => {
  load.mockResolvedValue(achievementsFixture());
  const focus: Array<() => void> = [];
  const navigation = {
    addListener: jest.fn((_event: string, cb: () => void) => {
      focus.push(cb);
      return () => undefined;
    }),
  };
  render(withCharacter(
    <NavigationContext.Provider value={navigation as never}>
      <BadgesScreen />
    </NavigationContext.Provider>,
  ));
  expect(await screen.findByTestId('badges-row-SLEEP_GOAL')).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(1);
  expect(navigation.addListener).toHaveBeenCalledWith('focus', expect.any(Function));

  load.mockResolvedValue(achievementsFixture({ SLEEP_GOAL: { level: 1, current: 3 } }));
  await act(async () => focus.forEach((cb) => cb()));
  await waitFor(() => expect(screen.getByTestId('badges-row-SLEEP_GOAL-status')).toHaveTextContent('Level I · Bronze · 3 / 7 nights'));
  expect(load).toHaveBeenCalledTimes(2);
});
