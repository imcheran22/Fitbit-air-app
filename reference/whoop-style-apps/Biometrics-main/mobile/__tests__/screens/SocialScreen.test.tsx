import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchSocialHome, markStickersSeen } from '../../src/api/social';
import { resetSocial } from '../../src/lib/socialStore';
import { SocialScreen } from '../../src/screens/SocialScreen';

jest.mock('../../src/api/social', () => ({
  ...jest.requireActual('../../src/api/social'),
  fetchSocialHome: jest.fn(),
  markStickersSeen: jest.fn().mockResolvedValue(undefined),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
  useIsFocused: () => true,
  useFocusEffect: (cb: () => void) => { const React = require('react'); React.useEffect(cb, []); },
}));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><SocialScreen /></SafeAreaProvider>);
const person = (id: string) => ({ id, handle: id, displayName: id.toUpperCase(), coachId: 'mochi' });
const home = {
  me: { person: person('me'), checkIn: null },
  camp: { checkedIn: 2, members: 4, faces: ['mochi', 'mochi'] },
  stories: [{ author: person('sam'), unseen: true, locked: true, frameCount: 1, latestAt: '2026-10-07T14:00:00.000Z' }],
  highlights: { weekStart: '2026-09-28', weekEnd: '2026-10-04', items: [{ type: 'comeback', actor: person('ben'), mine: false }] },
  timeline: [{ id: 't1', kind: 'step_goal', at: '2026-10-07T15:00:00.000Z', actor: person('sam'), mine: false }],
  unread: { requests: 2, stickers: 1 },
};
beforeEach(() => {
  mockNavigate.mockReset();
  (fetchSocialHome as jest.Mock).mockReset();
  (markStickersSeen as jest.Mock).mockClear();
  resetSocial();
});

it('renders every section in V5 order and routes each action', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home);
  renderScreen();
  expect(await screen.findByTestId('camp-banner')).toHaveTextContent(/THE CAMP/);
  expect(screen.getByTestId('camp-banner')).toHaveTextContent(/2 checked in/);
  expect(screen.getByTestId('camp-face-0')).toBeTruthy();
  expect(screen.getByTestId('camp-face-1')).toBeTruthy();
  expect(screen.getByTestId('stories-row')).toBeTruthy();
  expect(screen.getByTestId('highlights-carousel')).toBeTruthy();
  expect(screen.getByTestId('timeline-t1')).toBeTruthy();
  expect(screen.getByTestId('social-chats-icon')).toBeTruthy();
  expect(screen.getByTestId('social-chats-count')).toHaveTextContent('3');
  expect(screen.queryByTestId('social-add')).toBeNull();
  fireEvent.press(screen.getByTestId('story-sam'));
  expect(mockNavigate).toHaveBeenLastCalledWith('SocialStory', { authorId: 'sam' });
  fireEvent.press(screen.getByTestId('social-chats'));
  expect(mockNavigate).toHaveBeenLastCalledWith('ChatRequests'); // an S2 server: no chats, but requests wait
  fireEvent.press(screen.getByTestId('stories-see-all'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Buddies');
  fireEvent.press(screen.getByTestId('story-me'));
  expect(screen.getByTestId('checkin-sheet')).toBeTruthy();
});

it('marks shown stickers seen once, then refreshes so the dot clears', async () => {
  (fetchSocialHome as jest.Mock)
    .mockResolvedValueOnce(home)
    .mockResolvedValue({ ...home, unread: { requests: 2, stickers: 0 } });
  renderScreen();
  await screen.findByTestId('camp-banner');
  await waitFor(() => expect(markStickersSeen).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(fetchSocialHome).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId('social-chats-count')).toHaveTextContent('2');
  expect(markStickersSeen).toHaveBeenCalledTimes(1);
});

it('does not mark anything when there are no unseen stickers', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue({ ...home, unread: { requests: 0, stickers: 0 } });
  renderScreen();
  await screen.findByTestId('camp-banner');
  expect(markStickersSeen).not.toHaveBeenCalled();
  expect(screen.queryByTestId('social-chats-count')).toBeNull();
});

it('an older server shows the fallback card; a failure with nothing loaded shows retry', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValueOnce(null);
  const { unmount } = renderScreen();
  expect(await screen.findByTestId('social-unavailable')).toBeTruthy();
  fireEvent.press(screen.getByTestId('social-open-buddies'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Buddies');
  unmount();
  resetSocial();
  (fetchSocialHome as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...home, unread: { requests: 0, stickers: 0 } });
  renderScreen();
  expect(await screen.findByTestId('social-error')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('social-retry')));
  expect(await screen.findByTestId('stories-row')).toBeTruthy();
});

it('on a server with chats, the Chats button opens Chats and counts unread chats plus requests', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue({ ...home, unread: { requests: 2, stickers: 1, chats: 3 } });
  renderScreen();
  expect(await screen.findByTestId('social-chats-count')).toHaveTextContent('5');
  fireEvent.press(screen.getByTestId('social-chats'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Chats');
});
