import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements } from '../../src/api/achievements';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { tierColors, tierTextColor } from '../../src/lib/badgeArt';
import { BadgeDetailScreen } from '../../src/screens/BadgeDetailScreen';

jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/timezone', () => require('../../jest-mocks/timezoneSettled'));
let mockParams: { family: string } | undefined = { family: 'SLEEP_GOAL' };
let mockScheme: 'light' | 'dark' = 'light';
jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: mockScheme }) }));
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockParams }),
  NavigationContext: require('react').createContext(undefined),
}));
const load = fetchAchievements as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  mockScheme = 'light';
});

it('shows the big badge, current and best, and the ladder of five levels', async () => {
  mockParams = { family: 'SLEEP_GOAL' };
  load.mockResolvedValue(achievementsFixture({
    SLEEP_GOAL: { level: 2, current: 9, best: 11, levels: [{ level: 1, value: 3, earnedOn: '2026-10-08' }, { level: 2, value: 7, earnedOn: '2026-10-12' }] },
  }));
  render(withCharacter(<BadgeDetailScreen />));
  expect(await screen.findByTestId('badge-detail-title')).toHaveTextContent('SLEEP GOAL STREAK');
  expect(screen.getByTestId('badge-detail-icon').props.accessibilityLabel).toBe('Sleep goal streak, level II, Silver');
  expect(screen.getByTestId('badge-detail-current')).toHaveTextContent('CURRENT STREAK9 nights');
  expect(screen.getByTestId('badge-detail-best')).toHaveTextContent('BEST STREAK11 nights');
  expect(screen.getByTestId('badge-detail-level-1')).toHaveTextContent('Level I · Bronze · 3 nights', { exact: false });
  expect(screen.getByTestId('badge-detail-level-1-sub')).toHaveTextContent('Earned Oct 8');
  expect(screen.getByTestId('badge-detail-level-1-tag')).toHaveTextContent('EARNED');
  expect(screen.getByTestId('badge-detail-level-3-sub')).toHaveTextContent('5 more nights in a row');
  expect(screen.getByTestId('badge-detail-level-3-tag')).toHaveTextContent('NEXT');
  expect(screen.getByTestId('badge-detail-level-3-icon').props.accessibilityLabel).toBe('Sleep goal streak, locked');
  expect(screen.getByTestId('badge-detail-level-5')).toHaveTextContent('Level V · Coach · 100 nights', { exact: false });
  expect(screen.getByTestId('badge-detail-level-5-sub')).toHaveTextContent('Locked');
  expect(screen.queryByTestId('badge-detail-level-5-tag')).toBeNull();
});

it('shows a monthly family as one month count', async () => {
  mockParams = { family: 'EVERY_DAY_LOGGED' };
  load.mockResolvedValue(achievementsFixture({ EVERY_DAY_LOGGED: { level: 1, current: 2, best: 2, levels: [{ level: 1, value: 1, earnedOn: '2026-10-31' }] } }));
  render(withCharacter(<BadgeDetailScreen />));
  expect(await screen.findByTestId('badge-detail-current')).toHaveTextContent('MONTHS SO FAR2 months');
  expect(screen.queryByTestId('badge-detail-best')).toBeNull();
  expect(screen.getByTestId('badge-detail-level-2-sub')).toHaveTextContent('1 more month');
});

it('says the badge is not available against an old backend', async () => {
  load.mockResolvedValue(null);
  render(withCharacter(<BadgeDetailScreen />));
  expect(await screen.findByTestId('badge-detail-missing')).toBeTruthy();
});

it('offers a retry when the badges could not be loaded', async () => {
  mockParams = { family: 'SLEEP_GOAL' };
  load.mockRejectedValueOnce(new Error('offline'));
  render(withCharacter(<BadgeDetailScreen />));
  expect(await screen.findByTestId('badge-detail-error')).toBeTruthy();
  expect(screen.queryByTestId('badge-detail-missing')).toBeNull();
  load.mockResolvedValue(achievementsFixture());
  await act(async () => fireEvent.press(screen.getByTestId('badge-detail-retry')));
  expect(await screen.findByTestId('badge-detail-title')).toHaveTextContent('SLEEP GOAL STREAK');
});

const ladder = () => achievementsFixture({
  SLEEP_GOAL: { level: 2, current: 9, best: 11, levels: [{ level: 1, value: 3, earnedOn: '2026-10-08' }, { level: 2, value: 7, earnedOn: '2026-10-12' }] },
});

it('marks the pixel title as the header', async () => {
  mockParams = { family: 'SLEEP_GOAL' };
  load.mockResolvedValue(ladder());
  render(withCharacter(<BadgeDetailScreen />));
  expect((await screen.findByTestId('badge-detail-title')).props.accessibilityRole).toBe('header');
  expect(screen.getByRole('header', { name: 'Sleep goal streak' })).toBeTruthy();
});

it('writes the ladder tags in a readable tier colour in light mode and the ring colour in dark mode', async () => {
  mockParams = { family: 'SLEEP_GOAL' };
  load.mockResolvedValue(ladder());
  const view = render(withCharacter(<BadgeDetailScreen />));
  const silver = tierColors(2, '#000000').ring;
  expect(await screen.findByTestId('badge-detail-level-2-tag')).toHaveStyle({ color: tierTextColor(2, '#000000', false) });
  expect(screen.getByTestId('badge-detail-level-2-tag')).not.toHaveStyle({ color: silver });
  view.unmount();

  mockScheme = 'dark';
  render(withCharacter(<BadgeDetailScreen />));
  expect(await screen.findByTestId('badge-detail-level-2-tag')).toHaveStyle({ color: silver });
});

it('shows the missing state when opened without a family', async () => {
  mockParams = undefined;
  load.mockResolvedValue(ladder());
  render(withCharacter(<BadgeDetailScreen />));
  await waitFor(() => expect(load).toHaveBeenCalled());
  expect(await screen.findByTestId('badge-detail-missing')).toBeTruthy();
});

it('reloads the badges each time the screen comes back into focus', async () => {
  mockParams = { family: 'SLEEP_GOAL' };
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
      <BadgeDetailScreen />
    </NavigationContext.Provider>,
  ));
  expect(await screen.findByTestId('badge-detail-level-1-sub')).toHaveTextContent('3 more nights in a row');
  expect(load).toHaveBeenCalledTimes(1);
  expect(navigation.addListener).toHaveBeenCalledWith('focus', expect.any(Function));

  load.mockResolvedValue(ladder());
  await act(async () => focus.forEach((cb) => cb()));
  await waitFor(() => expect(screen.getByTestId('badge-detail-level-1-sub')).toHaveTextContent('Earned Oct 8'));
  expect(load).toHaveBeenCalledTimes(2);
});
