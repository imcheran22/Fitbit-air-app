import React from 'react';
import { Linking, PixelRatio } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import { fetchRecap, type Recap } from '../../src/api/recaps';
import { fetchSleep, fetchSleepGoal } from '../../src/api/sleep';
import { captureToPng, saveImage, shareImage } from '../../src/lib/recapCapture';
import { RecapBuilderScreen } from '../../src/screens/RecapBuilderScreen';

jest.mock('../../src/api/recaps');
jest.mock('../../src/api/sleep');
jest.mock('../../src/api/achievements');
jest.mock('expo-secure-store');
jest.mock('../../src/lib/recapCapture', () => ({ captureToPng: jest.fn(), saveImage: jest.fn(), shareImage: jest.fn() }));
let mockParams: { id?: string; format: 'card' | 'story' | 'year' } = { id: 'r-month', format: 'card' };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }), useRoute: () => ({ params: mockParams }) }));

const MONTH: Recap = {
  id: 'r-month', kind: 'MONTH', periodStart: '2026-09-01', periodEnd: '2026-09-30', line: 'Six nights in a row on goal.', personaId: 'mochi',
  builtAt: '2026-10-01T09:00:00.000Z', openedAt: '2026-10-01T10:00:00.000Z', sleepGoalMinutes: 480, lineSource: 'ai', story: null, rebuiltAt: null,
  stats: { nightsWithData: 25, avgSleepMinutes: 455, longestOnGoalStreak: 6, bestRecovery: { date: '2026-09-09', score: 88 }, steps: { total: 210000, dailyAverage: 7000 } },
};
const URI = 'file:///cache/recap-1.png';
let store: Record<string, string>;
const preview = () => within(screen.getByTestId('builder-preview'));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'r-month', format: 'card' };
  store = {};
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) => Promise.resolve(store[k] ?? null));
  (SecureStore.setItemAsync as jest.Mock).mockImplementation((k: string, v: string) => {
    store[k] = v;
    return Promise.resolve();
  });
  (fetchRecap as jest.Mock).mockResolvedValue(MONTH);
  (fetchSleep as jest.Mock).mockResolvedValue({ nights: [], earliestDate: null, stagesBackfillPending: false });
  (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
  (captureToPng as jest.Mock).mockResolvedValue(URI);
  (saveImage as jest.Mock).mockResolvedValue('saved');
  (shareImage as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());

it('switches change the preview, and the export follows', async () => {
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('preview-quote')).toBeTruthy();
  expect(screen.getByTestId('builder-privacy')).toHaveTextContent('Only you see this until you share');
  fireEvent(screen.getByTestId('builder-include-quote'), 'valueChange', false);
  expect(preview().queryByTestId('preview-quote')).toBeNull();
  expect(screen.queryByTestId('export-quote')).toBeNull();
  fireEvent(screen.getByTestId('builder-include-steps'), 'valueChange', false);
  expect(preview().queryByTestId('preview-stat-steps')).toBeNull();
});

it('hides the switches of missing stats', async () => {
  (fetchRecap as jest.Mock).mockResolvedValue({ ...MONTH, stats: { nightsWithData: 9, avgSleepMinutes: 400 } });
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-include-avgSleep')).toBeTruthy();
  for (const key of ['steps', 'bestRecovery', 'streak']) expect(screen.queryByTestId(`builder-include-${key}`)).toBeNull();
});

it('remembers the choices per format in SecureStore', async () => {
  const first = render(withCharacter(<RecapBuilderScreen />));
  fireEvent(await first.findByTestId('builder-include-quote'), 'valueChange', false);
  await waitFor(() => expect(JSON.parse(store['recapInclude.card']!)).toEqual({ quote: false }));
  first.unmount();
  render(withCharacter(<RecapBuilderScreen />));
  await waitFor(() => expect(screen.getByTestId('builder-include-quote').props.value).toBe(false));
  expect(preview().queryByTestId('preview-quote')).toBeNull();
});

it.each([
  [2, 'card', 540, 675],
  [3, 'card', 360, 450],
  [2, 'year', 540, 540],
] as const)('lays the export view out for 1080 px at pixel ratio %i (%s)', async (ratio, format, width, height) => {
  jest.spyOn(PixelRatio, 'get').mockReturnValue(ratio);
  mockParams = format === 'year' ? { format } : { id: 'r-month', format };
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-export')).toHaveStyle({ width, height });
});

it('uses the design labels, lists what to include, and starts Best recovery off', async () => {
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-include-label')).toHaveTextContent('Include');
  expect(screen.getByTestId('builder-format')).toHaveTextContent('CardYear');
  expect(screen.getByTestId('builder-include-quote').props.accessibilityLabel).toBe('A line from your coach');
  await waitFor(() => expect(screen.getByTestId('builder-include-avgSleep').props.value).toBe(true));
  expect(screen.getByTestId('builder-include-bestRecovery').props.value).toBe(false);
  expect(preview().queryByTestId('preview-stat-bestRecovery')).toBeNull();
  fireEvent(screen.getByTestId('builder-include-bestRecovery'), 'valueChange', true);
  expect(preview().getByTestId('preview-stat-bestRecovery')).toBeTruthy();
  await waitFor(() => expect(JSON.parse(store['recapInclude.card']!)).toEqual({ bestRecovery: true }));
});

const WEEK: Recap = {
  ...MONTH, id: 'r-week', kind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04', story: 'A calm week.',
  stats: { nightsWithData: 6, avgSleepMinutes: 455, nightsOnGoal: 5, weekStrip: [] },
};

it('previews, saves and shares the story frame picked (1, 2 or 3)', async () => {
  mockParams = { id: 'r-week', format: 'story' };
  (fetchRecap as jest.Mock).mockResolvedValue(WEEK);
  render(withCharacter(<RecapBuilderScreen />));
  expect(await preview().findByText('MY WEEK · 1 OF 3')).toBeTruthy();
  expect(screen.getByTestId('builder-frame')).toHaveTextContent('123');
  expect(within(screen.getByTestId('builder-export')).getByText('MY WEEK · 1 OF 3')).toBeTruthy();
  fireEvent.press(screen.getByTestId('builder-frame-2'));
  expect(preview().getByText('MY WEEK · 3 OF 3')).toBeTruthy();
  expect(within(screen.getByTestId('builder-export')).getByText('MY WEEK · 3 OF 3')).toBeTruthy();
  expect(within(screen.getByTestId('builder-export')).getByTestId('export-story')).toHaveTextContent('A calm week.');
  const share = screen.getByTestId('builder-share');
  await waitFor(() => expect(share).toBeEnabled());
  fireEvent.press(share);
  await waitFor(() => expect(shareImage).toHaveBeenCalledWith(URI));
  expect(captureToPng).toHaveBeenCalledTimes(1);
});

it('offers no frame picker for the card', async () => {
  render(withCharacter(<RecapBuilderScreen />));
  await screen.findByTestId('preview-quote');
  expect(screen.queryByTestId('builder-frame')).toBeNull();
});

it('a 9:16 story exports at 1080×1920 (540×960 points at ratio 2)', async () => {
  jest.spyOn(PixelRatio, 'get').mockReturnValue(2);
  mockParams = { id: 'r-week', format: 'story' };
  (fetchRecap as jest.Mock).mockResolvedValue({ ...MONTH, id: 'r-week', kind: 'WEEK', periodStart: '2026-09-28', stats: { nightsWithData: 6, weekStrip: [] } });
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-export')).toHaveStyle({ width: 540, height: 960 });
});

it('shares the captured file', async () => {
  render(withCharacter(<RecapBuilderScreen />));
  fireEvent.press(await screen.findByTestId('builder-share'));
  await waitFor(() => expect(shareImage).toHaveBeenCalledWith(URI));
  expect(captureToPng).toHaveBeenCalledTimes(1);
});

it('explains a denied Photos permission and links to Settings; Share still works', async () => {
  (saveImage as jest.Mock).mockResolvedValue('denied');
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
  render(withCharacter(<RecapBuilderScreen />));
  fireEvent.press(await screen.findByTestId('builder-save'));
  expect(await screen.findByTestId('builder-notice')).toHaveTextContent('Photos access is off. Allow it in Settings to save images.');
  fireEvent.press(screen.getByTestId('builder-open-settings'));
  expect(openSettings).toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('builder-share'));
  await waitFor(() => expect(shareImage).toHaveBeenCalledWith(URI));
});

it('says so briefly when the capture fails, and shares nothing', async () => {
  (captureToPng as jest.Mock).mockRejectedValue(new Error('capture_failed'));
  render(withCharacter(<RecapBuilderScreen />));
  fireEvent.press(await screen.findByTestId('builder-share'));
  expect(await screen.findByTestId('builder-notice')).toHaveTextContent("The image couldn't be made. Please try again.");
  expect(shareImage).not.toHaveBeenCalled();
});

it('offers the recap format and Year in pixels, which loads this year', async () => {
  render(withCharacter(<RecapBuilderScreen />));
  fireEvent.press(await screen.findByTestId('builder-format-year'));
  expect(await screen.findByTestId('preview-count')).toBeTruthy();
  expect(fetchSleep).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-01-01$/), expect.stringMatching(/^\d{4}-12-31$/));
  expect(screen.queryByTestId('builder-include-steps')).toBeNull();
});

it("draws the card with the recap's own coach and Year in pixels with the current one (ruling S6)", async () => {
  (fetchRecap as jest.Mock).mockResolvedValue({ ...MONTH, personaId: 'luna' });
  render(withCharacter(<RecapBuilderScreen />, { characterId: 'mochi' }));
  await screen.findByTestId('preview-quote');
  expect(characterLabel(screen, 'preview-coach')).toMatch(/^character:luna:/);
  expect(characterLabel(screen, 'export-coach')).toMatch(/^character:luna:/);
  fireEvent.press(screen.getByTestId('builder-format-year'));
  await screen.findByTestId('preview-count');
  expect(characterLabel(screen, 'preview-coach')).toMatch(/^character:mochi:/);
  expect(characterLabel(screen, 'export-coach')).toMatch(/^character:mochi:/);
});

it('keeps a switch flipped before the stored choices finish loading', async () => {
  let release!: (v: string | null) => void;
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(() => new Promise((r) => (release = r)));
  render(withCharacter(<RecapBuilderScreen />));
  fireEvent(await screen.findByTestId('builder-include-quote'), 'valueChange', false);
  release(JSON.stringify({ steps: false }));
  await waitFor(() => expect(screen.getByTestId('builder-include-steps').props.value).toBe(false));
  expect(screen.getByTestId('builder-include-quote').props.value).toBe(false);
  expect(preview().queryByTestId('preview-quote')).toBeNull();
});

it("won't export until the format's stored choices have loaded, also after a format switch", async () => {
  const reads: Record<string, (v: string | null) => void> = {};
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) => new Promise((r) => (reads[k] = r)));
  render(withCharacter(<RecapBuilderScreen />));
  await screen.findByTestId('preview-quote');
  expect(screen.getByTestId('builder-save')).toBeDisabled();
  expect(screen.getByTestId('builder-share')).toBeDisabled();
  await act(async () => reads['recapInclude.card']!(null));
  expect(screen.getByTestId('builder-share')).toBeEnabled();

  fireEvent.press(screen.getByTestId('builder-format-year'));
  await screen.findByTestId('preview-count');
  expect(screen.getByTestId('builder-share')).toBeDisabled();
  await act(async () => reads['recapInclude.year']!(JSON.stringify({ coach: false })));
  expect(screen.getByTestId('builder-share')).toBeEnabled();
  expect(preview().queryByTestId('preview-coach')).toBeNull();
});

it('runs one export at a time, even for presses in the same frame', async () => {
  let finish!: (uri: string) => void;
  (captureToPng as jest.Mock).mockImplementation(() => new Promise((r) => (finish = r)));
  render(withCharacter(<RecapBuilderScreen />));
  const share = await screen.findByTestId('builder-share');
  await waitFor(() => expect(share).toBeEnabled());
  // Both presses land before React re-renders with the button disabled.
  await act(async () => {
    const onPress = screen.UNSAFE_getByProps({ testID: 'builder-share' }).props.onPress as () => void;
    onPress();
    onPress();
  });
  expect(captureToPng).toHaveBeenCalledTimes(1);
  await act(async () => finish(URI));
  expect(shareImage).toHaveBeenCalledTimes(1);
});

it("says when the year couldn't be loaded and tries again", async () => {
  mockParams = { format: 'year' };
  (fetchSleep as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  render(withCharacter(<RecapBuilderScreen />));
  expect(await screen.findByTestId('builder-load-error')).toHaveTextContent("Your year couldn't be loaded.");
  fireEvent.press(screen.getByTestId('builder-retry'));
  expect(await screen.findByTestId('preview-count')).toBeTruthy();
  expect(screen.queryByTestId('builder-load-error')).toBeNull();
});
