import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ApiError } from '../../src/api/client';
import { sayGoodnight, undoGoodnight } from '../../src/api/social';
import { GoodnightButton } from '../../src/components/social/GoodnightButton';

jest.mock('../../src/api/social', () => ({ ...jest.requireActual('../../src/api/social'), sayGoodnight: jest.fn(), undoGoodnight: jest.fn() }));
const said = (undoInMs: number, onTime = false) => ({ localDate: '2026-10-07', at: new Date().toISOString(), onTime, undoUntil: new Date(Date.now() + undoInMs).toISOString() });

beforeEach(() => jest.clearAllMocks());

it('says goodnight once on a double tap, then tells the parent', async () => {
  let resolve!: (v: unknown) => void;
  (sayGoodnight as jest.Mock).mockReturnValue(new Promise((r) => { resolve = r; }));
  const onChanged = jest.fn();
  render(<GoodnightButton goodnight={null} onChanged={onChanged} />);
  act(() => {
    fireEvent.press(screen.getByTestId('goodnight-say'));
    fireEvent.press(screen.getByTestId('goodnight-say'));
  });
  await act(async () => resolve({ goodnight: said(600_000) }));
  expect(sayGoodnight).toHaveBeenCalledTimes(1);
  expect(onChanged).toHaveBeenCalledTimes(1);
});

it('shows "Goodnight said" with Undo only inside its window, and hides Undo when the window closes', () => {
  jest.useFakeTimers();
  try {
    render(<GoodnightButton goodnight={said(5_000, true)} onChanged={jest.fn()} />);
    expect(screen.getByTestId('goodnight-said')).toHaveTextContent('Goodnight said, on time');
    expect(screen.getByTestId('goodnight-undo')).toBeTruthy();
    act(() => jest.advanceTimersByTime(5_001));
    expect(screen.queryByTestId('goodnight-undo')).toBeNull();
    expect(screen.queryByTestId('goodnight-say')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it('offers no Undo once undoUntil has passed, though `at` was just now (the deadline is read, never computed)', () => {
  const g = { localDate: '2026-10-07', at: new Date().toISOString(), onTime: false, undoUntil: new Date(Date.now() - 1_000).toISOString() };
  render(<GoodnightButton goodnight={g} onChanged={jest.fn()} />);
  expect(screen.getByTestId('goodnight-said')).toHaveTextContent(/^Goodnight said$/);
  expect(screen.queryByTestId('goodnight-undo')).toBeNull();
});

it('judges a goodnight that arrives after mount against the clock now, not the clock at mount', () => {
  jest.useFakeTimers();
  try {
    const mountedAt = Date.now();
    const { rerender } = render(<GoodnightButton goodnight={null} onChanged={jest.fn()} />);
    act(() => jest.advanceTimersByTime(3_600_000));
    const stale = { localDate: '2026-10-07', at: new Date(mountedAt).toISOString(), onTime: false, undoUntil: new Date(mountedAt + 600_000).toISOString() };
    rerender(<GoodnightButton goodnight={stale} onChanged={jest.fn()} />);
    expect(screen.getByTestId('goodnight-said')).toBeTruthy();
    expect(screen.queryByTestId('goodnight-undo')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it('undoes, and says why when the server refuses', async () => {
  (undoGoodnight as jest.Mock).mockRejectedValueOnce(new ApiError(409, 'x', 'undo_expired'));
  const onChanged = jest.fn();
  render(<GoodnightButton goodnight={said(600_000)} onChanged={onChanged} />);
  await act(async () => fireEvent.press(screen.getByTestId('goodnight-undo')));
  expect(undoGoodnight).toHaveBeenCalledTimes(1);
  expect(onChanged).not.toHaveBeenCalled();
  expect(screen.getByTestId('goodnight-message')).toHaveTextContent("It's too late to undo that goodnight.");
});

it('names its buttons for screen readers and announces a refusal politely', async () => {
  (sayGoodnight as jest.Mock).mockRejectedValueOnce(new ApiError(409, 'x', 'goodnight_closed'));
  const { rerender } = render(<GoodnightButton goodnight={null} onChanged={jest.fn()} />);
  expect(screen.getByTestId('goodnight-say')).toHaveProp('accessibilityRole', 'button');
  await act(async () => fireEvent.press(screen.getByTestId('goodnight-say')));
  expect(screen.getByTestId('goodnight-message')).toHaveProp('accessibilityLiveRegion', 'polite');
  rerender(<GoodnightButton goodnight={said(600_000)} onChanged={jest.fn()} />);
  expect(screen.getByTestId('goodnight-undo')).toHaveProp('accessibilityRole', 'button');
  expect(screen.getByTestId('goodnight-undo')).toHaveProp('accessibilityLabel', 'Undo goodnight');
});

it('keeps "Goodnight said" from the server\'s answer when the re-read fails, until the parent has a new goodnight', async () => {
  const mine = said(600_000, true);
  (sayGoodnight as jest.Mock).mockResolvedValue({ goodnight: mine });
  (undoGoodnight as jest.Mock).mockResolvedValue(undefined);
  // The parent's re-read failed: it still passes no goodnight.
  const { rerender } = render(<GoodnightButton goodnight={null} onChanged={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByTestId('goodnight-say')));
  expect(screen.getByTestId('goodnight-said')).toHaveTextContent('Goodnight said, on time');
  expect(screen.getByTestId('goodnight-undo')).toBeTruthy();
  // Undo's answer is kept the same way: Say comes back though the parent still has nothing new.
  await act(async () => fireEvent.press(screen.getByTestId('goodnight-undo')));
  expect(screen.getByTestId('goodnight-say')).toBeTruthy();
  // A new goodnight from the parent wins over the local answer.
  const other = said(600_000, false);
  rerender(<GoodnightButton goodnight={other} onChanged={jest.fn()} />);
  expect(screen.getByTestId('goodnight-said')).toHaveTextContent(/^Goodnight said$/);
});

it('clears an old message when the goodnight changes', async () => {
  (sayGoodnight as jest.Mock).mockRejectedValueOnce(new ApiError(409, 'x', 'goodnight_closed'));
  const { rerender } = render(<GoodnightButton goodnight={null} onChanged={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByTestId('goodnight-say')));
  expect(screen.getByTestId('goodnight-message')).toBeTruthy();
  rerender(<GoodnightButton goodnight={said(600_000)} onChanged={jest.fn()} />);
  expect(screen.queryByTestId('goodnight-message')).toBeNull();
});

it('a tap the server refuses as too early says so', async () => {
  (sayGoodnight as jest.Mock).mockRejectedValueOnce(new ApiError(409, 'x', 'goodnight_closed'));
  render(<GoodnightButton goodnight={null} onChanged={jest.fn()} testID="timeline-goodnight" />);
  await act(async () => fireEvent.press(screen.getByTestId('timeline-goodnight-say')));
  expect(screen.getByTestId('timeline-goodnight-message')).toHaveTextContent('Goodnight opens this evening.');
});
