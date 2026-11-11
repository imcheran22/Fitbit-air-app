import React from 'react';
import { AppState, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { fetchRecaps, type RecapSummary } from '../../src/api/recaps';
import { RecapShelf } from '../../src/components/recap/RecapShelf';
import { addDays, todayCivil } from '../../src/lib/heatmap';
import { useRecapShelf } from '../../src/lib/recap/useRecapShelf';
import { recapTint, STORY_RING_NEUTRAL, storyRingColor } from '../../src/lib/recapTheme';
import { openRecap, resetUnwatchedRecap } from '../../src/lib/unwatchedRecap';

jest.mock('../../src/api/recaps', () => ({ fetchRecaps: jest.fn(), markRecapOpened: jest.fn(() => Promise.resolve()) }));
let mockScheme: 'light' | 'dark' = 'dark';
jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: mockScheme }) }));

const navigate = jest.fn();
const listeners: Record<string, () => void> = {};
const navigation = { navigate, addListener: (e: string, fn: () => void) => ((listeners[e] = fn), () => undefined) };

const TODAY = todayCivil();
const recap = (over: Partial<RecapSummary>): RecapSummary => ({
  id: 'x', kind: 'WEEK', periodStart: addDays(TODAY, -8), periodEnd: addDays(TODAY, -2), line: 'A line.', personaId: 'mochi',
  builtAt: '2026-10-05T09:00:00.000Z', openedAt: null, ...over,
});
const WEEK = recap({ id: 'w-new' });
const MONTH = recap({ id: 'm-sep', kind: 'MONTH', periodStart: '2026-09-01', periodEnd: '2026-09-30', personaId: 'luna', openedAt: 'x' });

function Shelf() {
  return <RecapShelf navigation={navigation} shelf={useRecapShelf(navigation)} />;
}

async function show() {
  render(withCharacter(<Shelf />));
  await act(async () => {});
}

beforeEach(() => {
  jest.clearAllMocks();
  resetUnwatchedRecap();
  mockScheme = 'dark';
  (fetchRecaps as jest.Mock).mockResolvedValue([MONTH, WEEK]);
});

it('shows Recaps with See all and a circle per recap, newest first', async () => {
  await show();
  expect(fetchRecaps).toHaveBeenCalledWith({ limit: 30 });
  expect(screen.getByTestId('recap-shelf-title')).toHaveTextContent(/recaps/i);
  const items = screen.getAllByTestId(/^recap-shelf-item-/);
  expect(items.map((i) => i.props.testID)).toEqual(['recap-shelf-item-w-new', 'recap-shelf-item-m-sep']);
  expect(within(items[0]!).getByTestId('recap-shelf-badge-w-new')).toHaveTextContent(/^WK \d+$/);
  expect(within(items[0]!).getByTestId('recap-shelf-label-w-new')).toHaveTextContent('This week');
  expect(within(items[1]!).getByTestId('recap-shelf-badge-m-sep')).toHaveTextContent('SEP');
  expect(within(items[1]!).getByTestId('recap-shelf-label-m-sep')).toHaveTextContent('September');
  fireEvent.press(screen.getByTestId('recap-shelf-see-all'));
  expect(navigate).toHaveBeenCalledWith('Recaps');
});

it.each(['dark', 'light'] as const)("rings an unwatched recap in its coach's colour and a watched one in neutral (%s), on the coach's ground", async (scheme) => {
  mockScheme = scheme;
  await show();
  const ring = (id: string) => StyleSheet.flatten(screen.getByTestId(`recap-shelf-ring-${id}`).props.style);
  expect(ring('w-new').borderColor).toBe(storyRingColor('mochi', scheme));
  expect(ring('m-sep').borderColor).toBe(STORY_RING_NEUTRAL[scheme]);
  expect(StyleSheet.flatten(screen.getByTestId('recap-shelf-circle-m-sep').props.style).backgroundColor).toBe(recapTint('luna').ground);
  expect(screen.getByTestId('recap-shelf-item-w-new').props.accessibilityLabel).toMatch(/, new$/);
});

it('plays a week as its story and opens a month on its recap screen', async () => {
  await show();
  fireEvent.press(screen.getByTestId('recap-shelf-item-w-new'));
  expect(navigate).toHaveBeenCalledWith('RecapStory', { id: 'w-new' });
  fireEvent.press(screen.getByTestId('recap-shelf-item-m-sep'));
  expect(navigate).toHaveBeenCalledWith('Recap', { id: 'm-sep' });
});

it('turns a ring neutral as soon as that recap is opened, and reloads on focus', async () => {
  await show();
  await act(async () => openRecap('w-new'));
  expect(StyleSheet.flatten(screen.getByTestId('recap-shelf-ring-w-new').props.style).borderColor).toBe(STORY_RING_NEUTRAL.dark);
  (fetchRecaps as jest.Mock).mockResolvedValue([recap({ id: 'w-newer', periodStart: addDays(TODAY, -1), periodEnd: addDays(TODAY, 5) }), WEEK, MONTH]);
  await act(async () => listeners.focus!());
  expect(screen.getByTestId('recap-shelf-item-w-newer')).toBeTruthy();
});

it('keeps Recaps and See all with no recaps, with a one-line hint and no circles', async () => {
  (fetchRecaps as jest.Mock).mockResolvedValue([]);
  await show();
  expect(screen.getByTestId('recap-shelf')).toBeTruthy();
  expect(screen.queryByTestId('recap-shelf-row')).toBeNull();
  expect(screen.getByTestId('recap-shelf-empty')).toHaveTextContent('Your first recap arrives after your first full week of sleep.');
  fireEvent.press(screen.getByTestId('recap-shelf-see-all'));
  expect(navigate).toHaveBeenCalledWith('Recaps');
});

it('keeps Recaps and See all while loading, without circles or the empty hint', async () => {
  (fetchRecaps as jest.Mock).mockReturnValue(new Promise(() => {}));
  await show();
  expect(screen.getByTestId('recap-shelf-see-all')).toBeTruthy();
  expect(screen.queryByTestId('recap-shelf-row')).toBeNull();
  expect(screen.queryByTestId('recap-shelf-empty')).toBeNull();
});

it('keeps See all when the list fails to load, and keeps what it has when a reload fails', async () => {
  (fetchRecaps as jest.Mock).mockRejectedValueOnce(new Error('500'));
  await show();
  expect(screen.getByTestId('recap-shelf-see-all')).toBeTruthy();
  expect(screen.queryByTestId('recap-shelf-row')).toBeNull();
  expect(screen.queryByTestId('recap-shelf-empty')).toBeNull();
  await act(async () => listeners.focus!());
  expect(screen.getByTestId('recap-shelf-row')).toBeTruthy();
  (fetchRecaps as jest.Mock).mockRejectedValueOnce(new Error('500'));
  await act(async () => listeners.focus!());
  expect(screen.getByTestId('recap-shelf-item-w-new')).toBeTruthy();
});

it('reloads when the app comes back to the foreground', async () => {
  let onAppState: ((s: string) => void) | undefined;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
    onAppState = fn;
    return { remove: jest.fn() };
  }) as never);
  await show();
  (fetchRecaps as jest.Mock).mockResolvedValue([recap({ id: 'w-fresh', periodEnd: addDays(TODAY, -1) }), WEEK, MONTH]);
  await act(async () => onAppState!('active'));
  expect(screen.getByTestId('recap-shelf-item-w-fresh')).toBeTruthy();
  spy.mockRestore();
});
