import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { sendSticker } from '../../src/api/buddies';
import { fetchHighlights, type HighlightItem } from '../../src/api/social';
import { HighlightsScreen } from '../../src/screens/HighlightsScreen';

jest.mock('../../src/api/social', () => ({ ...jest.requireActual('../../src/api/social'), fetchHighlights: jest.fn() }));
jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), sendSticker: jest.fn() }));
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn() }));
const fetchMock = fetchHighlights as jest.Mock;
const send = sendSticker as jest.Mock;
const sam = { id: 'sam', handle: 'sam', displayName: 'Sam', coachId: 'mochi' };
const me = { id: 'me', handle: 'me', displayName: 'Me', coachId: 'mochi' };

beforeEach(() => jest.clearAllMocks());

it('lists every highlight of last week, or says the week was quiet', async () => {
  fetchMock.mockResolvedValueOnce({ weekStart: '2026-09-28', weekEnd: '2026-10-04', items: [{ type: 'comeback', actor: sam, mine: false }] });
  const { unmount } = render(<HighlightsScreen />);
  expect(await screen.findByText('Sam bounced back to rested')).toBeTruthy();
  expect(screen.getByTestId('highlights-heading')).toHaveTextContent('WEEK 40 HIGHLIGHTS');
  expect(screen.getByRole('header', { name: 'Week 40 highlights' })).toBeTruthy();
  unmount();
  fetchMock.mockResolvedValueOnce(null);
  render(<HighlightsScreen />);
  expect(await screen.findByTestId('highlights-quiet')).toBeTruthy();
});

it('cheers a buddy once on a double tap, never on my own highlight', async () => {
  let resolve!: (v: unknown) => void;
  send.mockReturnValue(new Promise((r) => { resolve = r; }));
  fetchMock.mockResolvedValueOnce({ weekStart: '2026-09-28', weekEnd: '2026-10-04', items: [
    { type: 'checked_in_every_day', actor: sam, mine: false },
    { type: 'most_stickers_sent', count: 4, actor: me, mine: true },
  ] });
  render(<HighlightsScreen />);
  await screen.findByTestId('highlights-item-0');
  expect(screen.queryByTestId('highlights-item-1-cheer')).toBeNull();
  act(() => {
    fireEvent.press(screen.getByTestId('highlights-item-0-cheer'));
    fireEvent.press(screen.getByTestId('highlights-item-0-cheer'));
  });
  await act(async () => resolve({ id: 'x' }));
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith('sam', 'CHEER');
});

it('shows the server message when a cheer fails', async () => {
  send.mockRejectedValue(Object.assign(new Error('x'), { status: 429, code: 'sticker_limit' }));
  fetchMock.mockResolvedValueOnce({ weekStart: '2026-09-28', weekEnd: '2026-10-04', items: [{ type: 'comeback', actor: sam, mine: false }] });
  render(<HighlightsScreen />);
  await screen.findByTestId('highlights-item-0');
  await act(async () => fireEvent.press(screen.getByTestId('highlights-item-0-cheer')));
  expect(screen.getByTestId('highlights-message')).toBeTruthy();
});

it('skips unknown types (quiet when nothing is left), and retries after an error', async () => {
  const also = { type: 'also', actor: sam, mine: false } as unknown as HighlightItem;
  fetchMock.mockResolvedValueOnce({ weekStart: '2026-09-28', weekEnd: '2026-10-04', items: [also] });
  const { unmount } = render(<HighlightsScreen />);
  expect(await screen.findByTestId('highlights-quiet')).toBeTruthy();
  unmount();
  fetchMock.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 500 }));
  fetchMock.mockResolvedValueOnce({ weekStart: '2026-09-28', weekEnd: '2026-10-04', items: [also, { type: 'comeback', actor: sam, mine: false }] });
  render(<HighlightsScreen />);
  fireEvent.press(await screen.findByTestId('highlights-retry'));
  expect(await screen.findByText('Sam bounced back to rested')).toBeTruthy();
  expect(screen.queryByTestId('highlights-item-1')).toBeNull();
});
