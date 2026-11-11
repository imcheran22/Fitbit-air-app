import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fetchBlocked, fetchBuddyPage, unblock } from '../../src/api/buddies';
import { BlockedPeopleScreen } from '../../src/screens/BlockedPeopleScreen';

jest.mock('../../src/api/buddies', () => ({
  ...jest.requireActual('../../src/api/buddies'),
  fetchBlocked: jest.fn(),
  unblock: jest.fn(),
  fetchBuddyPage: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (fetchBuddyPage as jest.Mock).mockResolvedValue({ buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 });
});

it('lists blocked people and unblocks one', async () => {
  (fetchBlocked as jest.Mock).mockResolvedValue([{ userId: 'u1', handle: 'sam', displayName: 'Sam' }]);
  (unblock as jest.Mock).mockResolvedValue(undefined);
  render(<BlockedPeopleScreen />);
  expect(await screen.findByText('Sam')).toBeTruthy();
  expect(screen.getByText('@sam')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('unblock-u1')));
  expect(unblock).toHaveBeenCalledWith('u1');
  expect(await screen.findByTestId('blocked-empty')).toBeTruthy();
  // The shared buddies copy is re-read after an unblock.
  expect(fetchBuddyPage).toHaveBeenCalled();
});

it('shows a neutral empty state when no one is blocked', async () => {
  (fetchBlocked as jest.Mock).mockResolvedValue([]);
  render(<BlockedPeopleScreen />);
  expect(await screen.findByText("You haven't blocked anyone.")).toBeTruthy();
});

it('a double tap unblocks once; a failure keeps the row and explains', async () => {
  (fetchBlocked as jest.Mock).mockResolvedValue([{ userId: 'u1', handle: 'sam', displayName: 'Sam' }]);
  let reject!: (e: unknown) => void;
  (unblock as jest.Mock).mockImplementation(() => new Promise((_, r) => { reject = r; }));
  render(<BlockedPeopleScreen />);
  const button = await screen.findByTestId('unblock-u1');
  fireEvent.press(button);
  fireEvent.press(button);
  expect(unblock).toHaveBeenCalledTimes(1);
  await act(async () => reject(Object.assign(new Error('x'), { code: 'try_later' })));
  expect(screen.getByText('Sam')).toBeTruthy();
  expect(screen.getByTestId('blocked-error').props.children).toBe("Couldn't do that right now. Try again in a minute.");
  expect(fetchBuddyPage).not.toHaveBeenCalled();
});
