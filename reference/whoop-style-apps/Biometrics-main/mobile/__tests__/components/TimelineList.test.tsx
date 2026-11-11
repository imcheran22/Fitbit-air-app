import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { sendSticker } from '../../src/api/buddies';
import { refreshSocial } from '../../src/lib/socialStore';
import { TimelineList } from '../../src/components/social/TimelineList';
import type { TimelineItem } from '../../src/api/social';

jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), sendSticker: jest.fn() }));
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn() }));
const send = sendSticker as jest.Mock;
const sam = { id: 'sam', handle: 'sam', displayName: 'Sam', coachId: 'mochi' };
const ana = { id: 'ana', handle: 'ana', displayName: 'Ana', coachId: 'mochi' };
const me = { id: 'me', handle: 'me', displayName: 'Me', coachId: 'mochi' };

const items: TimelineItem[] = [
  { id: 'c1', kind: 'checkin', at: '2026-10-07T14:31:00.000Z', actor: sam, mine: false, locked: false, mood: 'TIRED' },
  { id: 'c2', kind: 'checkin', at: '2026-10-07T15:00:00.000Z', actor: me, mine: true, locked: false, mood: 'RESTED' },
];
const locked: TimelineItem = { id: 'c3', kind: 'checkin', at: '2026-10-07T14:00:00.000Z', actor: ana, mine: false, locked: true };

beforeEach(() => jest.clearAllMocks());

it('offers Rest up on a tired check-in, sends once on a double tap, and has no action on mine', async () => {
  let resolve!: (v: unknown) => void;
  send.mockReturnValue(new Promise((r) => { resolve = r; }));
  render(<TimelineList items={items} />);
  expect(screen.getByTestId('timeline-c1')).toHaveTextContent(/Sam woke up tired/);
  expect(screen.getByTestId('timeline-c1-name')).toHaveTextContent('Sam');
  expect(screen.getByTestId('timeline-connector')).toBeTruthy();
  expect(screen.queryByTestId('timeline-c2-action')).toBeNull();
  act(() => {
    fireEvent.press(screen.getByTestId('timeline-c1-action'));
    fireEvent.press(screen.getByTestId('timeline-c1-action'));
  });
  await act(async () => resolve({ id: 'x' }));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith('sam', 'REST_UP');
  expect(refreshSocial).toHaveBeenCalled();
});

it('sends a Cheer on a step goal and can send again once the first one is done', async () => {
  send.mockResolvedValue({ id: 'x' });
  const goal: TimelineItem = { id: 's1', kind: 'step_goal', at: '2026-10-07T16:00:00.000Z', actor: sam, mine: false };
  render(<TimelineList items={[goal]} />);
  expect(screen.getByTestId('timeline-s1-action')).toHaveTextContent('Cheer');
  await act(async () => fireEvent.press(screen.getByTestId('timeline-s1-action')));
  await act(async () => fireEvent.press(screen.getByTestId('timeline-s1-action')));
  expect(send).toHaveBeenCalledTimes(2);
  expect(send).toHaveBeenCalledWith('sam', 'CHEER');
});

it("words a locked check-in without a mood and offers nothing on it", () => {
  render(<TimelineList items={[locked]} />);
  expect(screen.getByTestId('timeline-c3')).toHaveTextContent(/Ana checked in/);
  expect(screen.getByTestId('timeline-c3')).not.toHaveTextContent(/tired|rested|okay/i);
  expect(screen.queryByTestId('timeline-c3-action')).toBeNull();
  expect(screen.queryByTestId('timeline-connector')).toBeNull(); // one row: nothing to connect
});

it('shows the server message when a sticker fails, and an empty state', async () => {
  send.mockRejectedValue(Object.assign(new Error('x'), { status: 429, code: 'sticker_limit' }));
  const { rerender } = render(<TimelineList items={items} />);
  await act(async () => fireEvent.press(screen.getByTestId('timeline-c1-action')));
  expect(screen.getByTestId('timeline-message')).toBeTruthy();
  expect(refreshSocial).not.toHaveBeenCalled();
  rerender(<TimelineList items={[]} />);
  expect(screen.getByTestId('timeline-empty')).toBeTruthy();
});

it('skips items of a kind it does not know (a newer server)', () => {
  const chat = { id: 'g1', kind: 'chat', at: '2026-10-07T21:00:00.000Z', actor: sam, mine: false } as unknown as TimelineItem;
  const { rerender } = render(<TimelineList items={[chat, locked]} />);
  expect(screen.queryByTestId('timeline-g1')).toBeNull();
  expect(screen.getByTestId('timeline-c3')).toBeTruthy();
  expect(screen.queryByTestId('timeline-connector')).toBeNull(); // only one row is shown
  rerender(<TimelineList items={[chat]} />);
  expect(screen.getByTestId('timeline-empty')).toBeTruthy();
});

it('skips a goodnight without its on-time flag', () => {
  const goodnight = { id: 'g2', kind: 'goodnight', at: '2026-10-07T21:00:00.000Z', actor: sam, mine: false } as unknown as TimelineItem;
  render(<TimelineList items={[goodnight]} />);
  expect(screen.queryByTestId('timeline-g2')).toBeNull();
  expect(screen.getByTestId('timeline-empty')).toBeTruthy();
});
