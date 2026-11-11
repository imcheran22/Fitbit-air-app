import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { blockBuddy, fetchBuddyWeek, sendSticker, setMuted, unpair } from '../../src/api/buddies';
import { PersonKip } from '../../src/components/kip/PersonKip';
import { refreshBuddies } from '../../src/lib/buddiesStore';
import { refreshSocial } from '../../src/lib/socialStore';
import { BuddyWeekScreen } from '../../src/screens/BuddyWeekScreen';

jest.mock('../../src/api/buddies', () => ({
  ...jest.requireActual('../../src/api/buddies'),
  fetchBuddyWeek: jest.fn(),
  sendSticker: jest.fn(),
  setMuted: jest.fn(),
  unpair: jest.fn(),
  blockBuddy: jest.fn(),
}));
jest.mock('../../src/lib/buddiesStore', () => ({ refreshBuddies: jest.fn() }));
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn() }));
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, setOptions: jest.fn() }),
  useRoute: () => ({ params: { buddyId: 'b1' } }),
}));

const dates = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
const WEEK = {
  buddy: { id: 'b1', handle: 'sam', displayName: 'Sam', coachId: 'pengu', kipColour: 'sky' },
  mood: 'low',
  moodLine: 'Running low today · on a 4-night streak',
  muted: false,
  tiles: dates.map((date, i) => ({ date, mood: i === 6 ? 'none' : 'good' })),
  shares: ['sleepScore', 'streaks'],
  numbers: { sleepScore: dates.map((date, i) => ({ date, value: i === 6 ? null : 80 + i })) },
  badges: [{ family: 'SLEEP_GOAL', level: 2 }],
};
const coded = (code: string, status = 403) => Object.assign(new Error(code), { status, code });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
// The find waits outside act: inside an outer act the loaded week would not render until act ends.
async function pressOnceShown(testID: string) {
  const target = await screen.findByTestId(testID);
  await act(async () => fireEvent.press(target));
}
const pressDestructive = () =>
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());

beforeEach(() => {
  jest.clearAllMocks();
  (fetchBuddyWeek as jest.Mock).mockResolvedValue(WEEK);
});

it('shows the mood line, 7 tiles, only the shared rows, badge levels and the sharing summary', async () => {
  render(<BuddyWeekScreen />);
  expect(await screen.findByTestId('buddy-week-line')).toHaveTextContent('Running low today · on a 4-night streak');
  expect(screen.getByText('This week')).toBeTruthy();
  expect(screen.getByTestId('week-tile-0').props.accessibilityLabel).toBe('Sunday: well rested');
  expect(screen.getByTestId('week-tile-6').props.accessibilityLabel).toBe('Saturday: no data');
  expect(screen.getByTestId('number-row-sleepScore')).toHaveTextContent(/^Sleep score/);
  // Each number names its day; a day without a reading says so, never 0.
  expect(screen.getByTestId('number-sleepScore-0').props.accessibilityLabel).toBe('Sunday: Sleep score 80');
  expect(screen.getByTestId('number-sleepScore-6').props.accessibilityLabel).toBe('Saturday: Sleep score, no data');
  expect(screen.queryByTestId('number-row-recovery')).toBeNull();
  expect(screen.queryByTestId('number-row-steps')).toBeNull();
  expect(screen.getByTestId('week-badges')).toHaveTextContent('Sleep goal streak II');
  expect(screen.getByTestId('buddy-week-summary')).toHaveTextContent('Sam shares mood, sleep score and streaks & badges');
});

it("shows the buddy as their KIP in their mood, and no coach naming", async () => {
  render(<BuddyWeekScreen />);
  await screen.findByTestId('buddy-week-line');
  expect(screen.UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'sky', state: 'low', size: 96 });
  expect(screen.getByText('@sam')).toBeTruthy();
  expect(screen.queryByText(/Coach:/)).toBeNull();
  expect(screen.queryByText(/Pengu/)).toBeNull();
});

it('shows a day without a reading as a dash, never as 0, and no rows or badges the server did not send', async () => {
  (fetchBuddyWeek as jest.Mock).mockResolvedValue({
    ...WEEK,
    moodLine: 'Running low today',
    shares: ['steps'],
    numbers: { steps: dates.map((date, i) => ({ date, value: i === 0 ? null : 1000 })) },
    badges: undefined,
  });
  render(<BuddyWeekScreen />);
  await screen.findByTestId('number-row-steps');
  expect(screen.getByTestId('number-steps-0')).toHaveTextContent('–');
  expect(screen.getByTestId('number-steps-1')).toHaveTextContent('1,000');
  expect(screen.queryByText('0')).toBeNull();
  expect(screen.queryByTestId('number-row-sleepScore')).toBeNull();
  expect(screen.queryByTestId('week-badges')).toBeNull();
  expect(screen.queryByText(/streak/)).toBeNull();
  expect(screen.getByTestId('buddy-week-summary')).toHaveTextContent('Sam shares mood and steps');
});

it('sends a sticker and says it was sent; the daily limit and an unpaired buddy are explained', async () => {
  (sendSticker as jest.Mock).mockResolvedValueOnce({ id: 's1' }).mockRejectedValueOnce(coded('sticker_limit', 429)).mockRejectedValueOnce(coded('not_buddies'));
  render(<BuddyWeekScreen />);
  await pressOnceShown('sticker-STAR');
  expect(sendSticker).toHaveBeenCalledWith('b1', 'STAR');
  expect(screen.getByTestId('buddy-week-note')).toHaveTextContent(/^Sent a Star to Sam\.$/);
  await act(async () => fireEvent.press(screen.getByTestId('sticker-HEART')));
  expect(screen.getByTestId('buddy-week-note')).toHaveTextContent("That's 5 stickers to this buddy today. Try again tomorrow.");
  // Unpaired or blocked meanwhile: the week goes away and nothing is offered any more.
  await act(async () => fireEvent.press(screen.getByTestId('sticker-CHEER')));
  expect(screen.getByTestId('buddy-week-gone')).toHaveTextContent("You're no longer buddies.");
  expect(screen.queryByTestId('sticker-STAR')).toBeNull();
  expect(screen.queryByTestId('buddy-unpair')).toBeNull();
  expect(screen.queryByTestId('number-row-sleepScore')).toBeNull();
  expect(refreshBuddies).toHaveBeenCalled();
  expect(refreshSocial).toHaveBeenCalled();
});

it('sends once for a double tap in one frame', async () => {
  const send = deferred<{ id: string }>();
  (sendSticker as jest.Mock).mockReturnValue(send.promise);
  render(<BuddyWeekScreen />);
  const star = await screen.findByTestId('sticker-STAR');
  act(() => {
    fireEvent.press(star);
    fireEvent.press(star);
    fireEvent.press(screen.getByTestId('sticker-HEART'));
  });
  expect(sendSticker).toHaveBeenCalledTimes(1);
  await act(async () => send.resolve({ id: 's1' }));
  await act(async () => fireEvent.press(screen.getByTestId('sticker-HEART')));
  expect(sendSticker).toHaveBeenCalledTimes(2);
});

it("says so when they are no longer buddies (a 403 not_buddies), instead of hiding buddies", async () => {
  (fetchBuddyWeek as jest.Mock).mockRejectedValue(coded('not_buddies'));
  render(<BuddyWeekScreen />);
  expect(await screen.findByTestId('buddy-week-gone')).toHaveTextContent("You're no longer buddies.");
});

it('treats a 404 as gone and another failure as a manual retry, never a loop', async () => {
  (fetchBuddyWeek as jest.Mock).mockRejectedValueOnce(coded('not_found', 404));
  const { unmount } = render(<BuddyWeekScreen />);
  expect(await screen.findByTestId('buddy-week-gone')).toBeTruthy();
  unmount();

  (fetchBuddyWeek as jest.Mock).mockReset().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(WEEK);
  render(<BuddyWeekScreen />);
  expect(await screen.findByTestId('buddy-week-error')).toBeTruthy();
  expect(fetchBuddyWeek).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.press(screen.getByTestId('buddy-week-retry')));
  expect(await screen.findByTestId('buddy-week-line')).toBeTruthy();
  expect(fetchBuddyWeek).toHaveBeenCalledTimes(2);
});

it('mutes silently, and unpairs after a confirmation', async () => {
  (setMuted as jest.Mock).mockResolvedValue({ muted: true });
  (unpair as jest.Mock).mockResolvedValue(undefined);
  const alert = pressDestructive();
  render(<BuddyWeekScreen />);
  await pressOnceShown('buddy-mute');
  expect(setMuted).toHaveBeenCalledWith('b1', true);
  expect(screen.getByTestId('buddy-mute')).toHaveTextContent('Unmute');
  await act(async () => fireEvent.press(screen.getByTestId('buddy-unpair')));
  await waitFor(() => expect(unpair).toHaveBeenCalledWith('b1'));
  expect(refreshBuddies).toHaveBeenCalled();
  expect(refreshSocial).toHaveBeenCalled();
  expect(mockGoBack).toHaveBeenCalled();
  alert.mockRestore();
});

it('keeps the mute state and explains when muting fails', async () => {
  (setMuted as jest.Mock).mockRejectedValue(coded('try_later', 503));
  render(<BuddyWeekScreen />);
  await pressOnceShown('buddy-mute');
  expect(screen.getByTestId('buddy-mute')).toHaveTextContent('Mute');
  expect(screen.getByTestId('buddy-week-note')).toHaveTextContent("Couldn't do that right now. Try again in a minute.");
});

it('blocks after a confirmation; cancelling does nothing', async () => {
  (blockBuddy as jest.Mock).mockResolvedValue(undefined);
  const cancel = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'cancel')?.onPress?.());
  render(<BuddyWeekScreen />);
  await pressOnceShown('buddy-block');
  expect(cancel).toHaveBeenCalledWith('Block Sam?', expect.any(String), expect.any(Array));
  expect(blockBuddy).not.toHaveBeenCalled();
  cancel.mockRestore();

  const alert = pressDestructive();
  await act(async () => fireEvent.press(screen.getByTestId('buddy-block')));
  expect(blockBuddy).toHaveBeenCalledWith('b1');
  expect(refreshBuddies).toHaveBeenCalled();
  expect(refreshSocial).toHaveBeenCalled();
  expect(mockGoBack).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

it.each([
  ['mute', () => (setMuted as jest.Mock).mockRejectedValue(coded('not_buddies'))],
  ['unpair', () => (unpair as jest.Mock).mockRejectedValue(coded('not_buddies'))],
  ['block', () => (blockBuddy as jest.Mock).mockRejectedValue(coded('not_buddies'))],
])('a not_buddies answer to %s shows the gone state and offers nothing more', async (action, refuse) => {
  refuse();
  const alert = pressDestructive();
  render(<BuddyWeekScreen />);
  await pressOnceShown(`buddy-${action}`);
  expect(screen.getByTestId('buddy-week-gone')).toHaveTextContent("You're no longer buddies.");
  for (const id of ['buddy-mute', 'buddy-unpair', 'buddy-block', 'sticker-STAR', 'buddy-week-line']) expect(screen.queryByTestId(id)).toBeNull();
  expect(mockGoBack).not.toHaveBeenCalled();
  alert.mockRestore();
});

it('disables Mute, Unpair and Block while a sticker is on its way', async () => {
  const send = deferred<{ id: string }>();
  (sendSticker as jest.Mock).mockReturnValue(send.promise);
  const alert = pressDestructive();
  render(<BuddyWeekScreen />);
  await pressOnceShown('sticker-STAR');
  for (const id of ['buddy-mute', 'buddy-unpair', 'buddy-block', 'sticker-HEART']) expect(screen.getByTestId(id)).toBeDisabled();
  await act(async () => {
    fireEvent.press(screen.getByTestId('buddy-mute'));
    fireEvent.press(screen.getByTestId('buddy-unpair'));
    fireEvent.press(screen.getByTestId('buddy-block'));
  });
  expect(setMuted).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();
  expect(unpair).not.toHaveBeenCalled();
  expect(blockBuddy).not.toHaveBeenCalled();
  await act(async () => send.resolve({ id: 's1' }));
  for (const id of ['buddy-mute', 'buddy-unpair', 'buddy-block']) expect(screen.getByTestId(id)).not.toBeDisabled();
  alert.mockRestore();
});

it('shows no note after a successful mute', async () => {
  (setMuted as jest.Mock).mockResolvedValue({ muted: true });
  render(<BuddyWeekScreen />);
  await pressOnceShown('buddy-mute');
  expect(screen.getByTestId('buddy-mute')).toHaveTextContent('Unmute');
  expect(screen.queryByTestId('buddy-week-note')).toBeNull();
});

it('does not navigate when an unpair finishes after the screen is gone', async () => {
  const done = deferred<void>();
  (unpair as jest.Mock).mockReturnValue(done.promise);
  const alert = pressDestructive();
  const { unmount } = render(<BuddyWeekScreen />);
  await pressOnceShown('buddy-unpair');
  expect(unpair).toHaveBeenCalledTimes(1);
  unmount();
  await act(async () => done.resolve());
  expect(mockGoBack).not.toHaveBeenCalled();
  alert.mockRestore();
});

it('wraps a long buddy name in the pixel title instead of clipping it, and reads it in its own case', async () => {
  const long = 'Alexandria Montgomery-Vasquez';
  (fetchBuddyWeek as jest.Mock).mockResolvedValue({ ...WEEK, buddy: { ...WEEK.buddy, displayName: long } });
  render(<BuddyWeekScreen />);
  const title = await screen.findByTestId('buddy-week-name');
  expect(title).toHaveTextContent(long.toUpperCase());
  expect(title.props.numberOfLines).toBeUndefined();
  expect(screen.getByRole('header', { name: long })).toBeTruthy();
});

it('keeps the numbers grid in tabular figures that fit its 36-pt cells', async () => {
  (fetchBuddyWeek as jest.Mock).mockResolvedValue({ ...WEEK, shares: ['steps'], numbers: { steps: dates.map((date) => ({ date, value: 12345 })) } });
  render(<BuddyWeekScreen />);
  const cell = await screen.findByTestId('number-steps-0');
  expect(String(cell.props.className).split(' ')).toEqual(expect.arrayContaining(['w-9', 'text-fine', 'tabular-nums']));
});
