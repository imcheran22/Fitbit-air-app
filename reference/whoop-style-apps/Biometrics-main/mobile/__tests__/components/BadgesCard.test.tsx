import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements, type AchievementFamily } from '../../src/api/achievements';
import { BadgesCard } from '../../src/components/achievements/BadgesCard';
import { resetAchievements } from '../../src/lib/achievementsStore';
import { mixHex } from '../../src/lib/badgeArt';
import { COLORS, FONTS } from '../../src/theme';

jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/timezone', () => require('../../jest-mocks/timezoneSettled'));
let mockScheme: 'light' | 'dark' = 'light';
jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: mockScheme }) }));
const load = fetchAchievements as jest.Mock;
const FAMILIES: AchievementFamily[] = ['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH'];
const CANVAS = achievementsFixture({
  SLEEP_GOAL: { level: 2, current: 9, best: 11 },
  STEADY_BEDTIME: { level: 3, current: 15 },
  STEP_GOAL: { level: 1, current: 5 },
  CHECK_IN: { level: 2, current: 16 },
  BEST_RECOVERY_WEEK: { level: 1, current: 1 },
});

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  mockScheme = 'light';
});

it('shows the seven badges at their levels, the count out of 35 and the family closest to its next level', async () => {
  load.mockResolvedValue(CANVAS);
  const onSeeAll = jest.fn();
  const onOpen = jest.fn();
  render(withCharacter(<BadgesCard onSeeAll={onSeeAll} onOpen={onOpen} />));

  expect(await screen.findByTestId('badges-count')).toHaveTextContent('BADGES · 9 OF 35');
  for (const f of FAMILIES) expect(screen.getByTestId(`badges-card-${f}`)).toBeTruthy();
  expect(screen.getByTestId('badges-card-SLEEP_GOAL-icon').props.accessibilityLabel).toBe('Sleep goal streak, level II, Silver');
  expect(screen.getByTestId('badges-card-SLEEP_GOAL-label')).toHaveStyle({ color: COLORS.light.foreground });
  expect(screen.getByTestId('badges-card-EVERY_DAY_LOGGED-label')).toHaveStyle({ color: COLORS.light.muted });
  expect(screen.getByTestId('badges-next-up')).toHaveTextContent('Next up: Step goal streak II');
  expect(screen.getByTestId('badges-next-up-count')).toHaveTextContent('5 / 7 days');
  expect(screen.getByTestId('badges-next-up-bar')).toHaveStyle({ width: '71%', backgroundColor: '#CBD5E1' });
  // Light mode: a pale tier (Silver) on the light track gets a darker outline so the fill reads.
  expect(screen.getByTestId('badges-next-up-bar')).toHaveStyle({ borderWidth: 1, borderColor: mixHex('#CBD5E1', '#000000', 0.35) });
  expect(screen.getByTestId('badges-card-SLEEP_GOAL').props.accessibilityLabel).toBe('Sleep goal streak, level II, Silver');
  expect(screen.getByTestId('badges-card-EVERY_DAY_LOGGED').props.accessibilityLabel).toBe('Every day logged, locked');
  expect(screen.getByTestId('badges-see-all').props.accessibilityLabel).toBe('See all badges');

  fireEvent.press(screen.getByTestId('badges-see-all'));
  expect(onSeeAll).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByTestId('badges-card-CHECK_IN'));
  expect(onOpen).toHaveBeenCalledWith('CHECK_IN');
});

it('keeps the tile names to one line under their icons, and sets the count as the pixel label', async () => {
  load.mockResolvedValue(CANVAS);
  render(withCharacter(<BadgesCard onSeeAll={jest.fn()} onOpen={jest.fn()} />));
  const count = await screen.findByTestId('badges-count');
  expect(StyleSheet.flatten(count.props.style).fontFamily).toBe(FONTS.pixel);
  for (const f of FAMILIES) {
    const label = screen.getByTestId(`badges-card-${f}-label`);
    expect(label.props.numberOfLines).toBe(1);
    expect(String(label.props.className).split(' ')).toContain('text-caption');
  }
});

it('uses the dark palette for labels and drops the bar outline in dark mode', async () => {
  mockScheme = 'dark';
  load.mockResolvedValue(CANVAS);
  render(withCharacter(<BadgesCard onSeeAll={jest.fn()} onOpen={jest.fn()} />));
  expect(await screen.findByTestId('badges-count')).toHaveTextContent('BADGES · 9 OF 35');
  expect(screen.getByTestId('badges-card-SLEEP_GOAL-label')).toHaveStyle({ color: COLORS.dark.foreground });
  expect(screen.getByTestId('badges-card-EVERY_DAY_LOGGED-label')).toHaveStyle({ color: COLORS.dark.muted });
  expect(screen.getByTestId('badges-next-up-bar')).toHaveStyle({ borderWidth: 0 });
});

it('draws no outline on an empty bar in light mode (no sliver at 0%)', async () => {
  load.mockResolvedValue(achievementsFixture());
  render(withCharacter(<BadgesCard onSeeAll={jest.fn()} onOpen={jest.fn()} />));
  expect(await screen.findByTestId('badges-next-up-bar')).toHaveStyle({ width: '0%', borderWidth: 0 });
});

it('has no next-up row when every family is at the top level', async () => {
  load.mockResolvedValue(achievementsFixture(Object.fromEntries(FAMILIES.map((f) => [f, { level: 5 }])) as Partial<Record<AchievementFamily, { level: number }>>));
  render(withCharacter(<BadgesCard onSeeAll={jest.fn()} onOpen={jest.fn()} />));
  expect(await screen.findByTestId('badges-count')).toHaveTextContent('BADGES · 35 OF 35');
  expect(screen.queryByTestId('badges-next-up')).toBeNull();
});

it('stays hidden against a backend without badges (404) and on an error', async () => {
  load.mockResolvedValue(null);
  const first = render(withCharacter(<BadgesCard onSeeAll={jest.fn()} onOpen={jest.fn()} />));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await act(async () => {});
  expect(screen.queryByTestId('badges-card')).toBeNull();
  first.unmount();

  resetAchievements();
  load.mockRejectedValue(new Error('offline'));
  render(withCharacter(<BadgesCard onSeeAll={jest.fn()} onOpen={jest.fn()} />));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  await act(async () => {});
  expect(screen.queryByTestId('badges-card')).toBeNull();
});
