import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fetchBuddyPage, fetchIdentity } from '../../src/api/buddies';
import { resetBuddies } from '../../src/lib/buddiesStore';
import { BuddiesScreen } from '../../src/screens/BuddiesScreen';

jest.mock('../../src/api/buddies', () => ({
  ...jest.requireActual('../../src/api/buddies'),
  fetchIdentity: jest.fn(),
  fetchBuddyPage: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, addListener: () => () => undefined }),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
  NavigationContext: require('react').createContext(undefined),
}));

const person = (id: string, name: string) => ({ id, handle: id, displayName: name, coachId: 'pengu' });
const row = (id: string, name: string, over: object = {}) => ({ ...person(id, name), mood: 'good', moodLine: 'Well rested', unseenSticker: false, ...over });
const EMPTY_PAGE = { buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  resetBuddies();
  (fetchIdentity as jest.Mock).mockResolvedValue({ handle: 'me', displayName: 'Me', displayNamePrefill: '', moodNoticeSeen: true });
});

it('is the plain buddy list: mood lines, the unseen sticker dot, paging, and a row opens the week', async () => {
  (fetchBuddyPage as jest.Mock).mockImplementation(async (cursor?: string) =>
    cursor === 'c2'
      ? { buddies: [row('b3', 'Cy')], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 }
      : { buddies: [row('b1', 'Ana', { unseenSticker: true }), row('b2', 'Ben', { mood: 'low', moodLine: 'Running low today' })], nextCursor: 'c2', incomingRequests: 0, outgoingRequests: 0 },
  );
  render(<BuddiesScreen />);
  expect(await screen.findByTestId('buddy-row-b1')).toBeTruthy();
  expect(screen.queryByTestId('buddies-tabs')).toBeNull(); // Requests moved to Chats, Activity to the Social timeline
  expect(screen.getByTestId('buddy-row-b2-mood')).toHaveTextContent('Running low today');
  expect(screen.getByTestId('buddy-row-b1-unseen')).toBeTruthy();
  await act(async () => fireEvent(screen.getByTestId('buddies-list'), 'onEndReached'));
  expect(await screen.findByTestId('buddy-row-b3')).toBeTruthy();
  fireEvent.press(screen.getByTestId('buddy-row-b2'));
  expect(mockNavigate).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'b2' });
});

it('drops a buddy repeated across pages and stops at the last page', async () => {
  (fetchBuddyPage as jest.Mock).mockImplementation(async (cursor?: string) =>
    cursor === 'c2'
      ? { buddies: [row('b2', 'Ben'), row('b3', 'Cy'), row('b3', 'Cy')], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 }
      : { buddies: [row('b1', 'Ana'), row('b2', 'Ben')], nextCursor: 'c2', incomingRequests: 0, outgoingRequests: 0 },
  );
  render(<BuddiesScreen />);
  expect(await screen.findByTestId('buddy-row-b1')).toBeTruthy();
  await act(async () => fireEvent(screen.getByTestId('buddies-list'), 'onEndReached'));
  expect(await screen.findByTestId('buddy-row-b3')).toBeTruthy();
  expect(screen.getAllByTestId('buddy-row-b2')).toHaveLength(1);
  expect(screen.getAllByTestId('buddy-row-b3')).toHaveLength(1);
  await act(async () => fireEvent(screen.getByTestId('buddies-list'), 'onEndReached'));
  expect((fetchBuddyPage as jest.Mock).mock.calls.filter(([c]) => c === 'c2')).toHaveLength(1);
});

it('an empty list still offers "Add a buddy", which opens Pair up', async () => {
  (fetchBuddyPage as jest.Mock).mockResolvedValue(EMPTY_PAGE);
  render(<BuddiesScreen />);
  expect(await screen.findByTestId('buddies-empty')).toBeTruthy();
  fireEvent.press(screen.getByTestId('buddies-add'));
  expect(mockNavigate).toHaveBeenCalledWith('PairUp');
});
