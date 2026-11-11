import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { confirmMoodNotice } from '../../src/api/buddies';
import { MoodNoticeSheet } from '../../src/components/buddies/MoodNoticeSheet';
import { useMoodNoticeGate } from '../../src/components/buddies/useMoodNoticeGate';

jest.mock('../../src/api/buddies', () => ({ confirmMoodNotice: jest.fn() }));
const confirm = confirmMoodNotice as jest.Mock;

function Harness({ seen, action }: { seen: boolean; action: () => void }) {
  const gate = useMoodNoticeGate(seen);
  return (
    <>
      <Pressable testID="pair-action" onPress={() => gate.run(action)}><Text>Pair</Text></Pressable>
      <MoodNoticeSheet {...gate.sheet} />
    </>
  );
}

beforeEach(() => jest.clearAllMocks());

it('shows the notice once before the first pairing action, then runs it; later actions go straight through', async () => {
  confirm.mockResolvedValue(undefined);
  const action = jest.fn();
  render(<Harness seen={false} action={action} />);
  fireEvent.press(screen.getByTestId('pair-action'));
  expect(await screen.findByTestId('mood-notice')).toBeTruthy();
  expect(action).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByTestId('mood-notice-confirm')));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByTestId('pair-action'));
  expect(action).toHaveBeenCalledTimes(2);
  expect(confirm).toHaveBeenCalledTimes(1);
});

it('never shows for someone who already saw it; a failed confirm keeps the action back', async () => {
  const action = jest.fn();
  const first = render(<Harness seen action={action} />);
  fireEvent.press(screen.getByTestId('pair-action'));
  expect(action).toHaveBeenCalledTimes(1);
  first.unmount();

  confirm.mockRejectedValue(new Error('offline'));
  render(<Harness seen={false} action={action} />);
  fireEvent.press(screen.getByTestId('pair-action'));
  await act(async () => fireEvent.press(await screen.findByTestId('mood-notice-confirm')));
  expect(action).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('mood-notice-failed')).toBeTruthy();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

it('a double tap on "Got it" confirms once and runs the action once', async () => {
  confirm.mockResolvedValue(undefined);
  const action = jest.fn();
  render(<Harness seen={false} action={action} />);
  fireEvent.press(screen.getByTestId('pair-action'));
  await act(async () => {
    fireEvent.press(screen.getByTestId('mood-notice-confirm'));
    fireEvent.press(screen.getByTestId('mood-notice-confirm'));
  });
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenCalledTimes(1);
});

it('"Not now" during an in-flight confirm drops the action', async () => {
  const pending = deferred();
  confirm.mockReturnValue(pending.promise);
  const action = jest.fn();
  render(<Harness seen={false} action={action} />);
  fireEvent.press(screen.getByTestId('pair-action'));
  fireEvent.press(screen.getByTestId('mood-notice-confirm'));
  fireEvent.press(screen.getByTestId('mood-notice-cancel'));
  await act(async () => pending.resolve());
  expect(action).not.toHaveBeenCalled();
  // Confirmed all the same: the next action goes straight through.
  fireEvent.press(screen.getByTestId('pair-action'));
  expect(action).toHaveBeenCalledTimes(1);
});

it('unmounting during an in-flight confirm drops the action', async () => {
  const pending = deferred();
  confirm.mockReturnValue(pending.promise);
  const action = jest.fn();
  const view = render(<Harness seen={false} action={action} />);
  fireEvent.press(screen.getByTestId('pair-action'));
  fireEvent.press(screen.getByTestId('mood-notice-confirm'));
  view.unmount();
  await act(async () => pending.resolve());
  expect(action).not.toHaveBeenCalled();
});

// A caller that kept the first `run` (a memoised callback) must not see the sheet again after confirming.
function StaleRunHarness({ action }: { action: () => void }) {
  const gate = useMoodNoticeGate(false);
  const firstRun = React.useRef(gate.run).current;
  return (
    <>
      <Pressable testID="pair-action" onPress={() => firstRun(action)}><Text>Pair</Text></Pressable>
      <MoodNoticeSheet {...gate.sheet} />
    </>
  );
}

it('a memoised run goes straight through after the notice was confirmed', async () => {
  confirm.mockResolvedValue(undefined);
  const action = jest.fn();
  render(<StaleRunHarness action={action} />);
  fireEvent.press(screen.getByTestId('pair-action'));
  await act(async () => fireEvent.press(screen.getByTestId('mood-notice-confirm')));
  expect(action).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByTestId('pair-action'));
  expect(action).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId('mood-notice')).toBeNull();
});

it('confirming again after a failure clears the failure line', async () => {
  const pending = deferred();
  confirm.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(pending.promise);
  render(<Harness seen={false} action={jest.fn()} />);
  fireEvent.press(screen.getByTestId('pair-action'));
  await act(async () => fireEvent.press(screen.getByTestId('mood-notice-confirm')));
  expect(screen.getByTestId('mood-notice-failed')).toBeTruthy();
  fireEvent.press(screen.getByTestId('mood-notice-confirm'));
  expect(screen.queryByTestId('mood-notice-failed')).toBeNull();
  await act(async () => pending.resolve());
});
