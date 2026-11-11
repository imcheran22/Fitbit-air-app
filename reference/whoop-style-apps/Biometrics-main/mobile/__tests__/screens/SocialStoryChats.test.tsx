import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchStory, markStorySeen } from '../../src/api/social';
import { SocialStoryScreen } from '../../src/screens/SocialStoryScreen';

jest.mock('../../src/api/social', () => ({ ...jest.requireActual('../../src/api/social'), fetchStory: jest.fn(), markStorySeen: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), sendSticker: jest.fn().mockResolvedValue({ id: 's' }) }));
let mockUnread: object = { requests: 0, stickers: 0, chats: 0 };
jest.mock('../../src/lib/socialStore', () => ({
  refreshSocial: jest.fn(),
  useSocial: () => ({ status: 'ready', home: { me: { person: { id: 'me' }, checkIn: null }, unread: mockUnread } }),
}));
const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
let mockAuthorId = 'sam';
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
  useRoute: () => ({ params: { authorId: mockAuthorId } }),
}));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><SocialStoryScreen /></SafeAreaProvider>);
const story = (authorId: string) => ({
  author: { id: authorId, handle: authorId, displayName: authorId === 'me' ? 'Me' : 'Sam', coachId: 'mochi' },
  localDate: '2026-10-07',
  frames: [{ kind: 'checkin', at: '2026-10-07T14:00:00.000Z', locked: false, mood: 'TIRED' }],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthorId = 'sam';
  mockUnread = { requests: 0, stickers: 0, chats: 0 };
});

it("Message closes the story and opens Sam's thread with the frame staged", async () => {
  (fetchStory as jest.Mock).mockResolvedValue(story('sam'));
  renderScreen();
  const button = await screen.findByTestId('story-message-button');
  await act(async () => fireEvent.press(button));
  expect(mockGoBack).toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('ChatThread', {
    buddyId: 'sam',
    quote: { request: { type: 'story_frame', at: '2026-10-07T14:00:00.000Z' }, label: "Sam's check-in" },
  });
  expect(screen.getByTestId('story-reply-CHEER')).toBeTruthy(); // the sticker replies stay
});

it('Message stops the story and runs once: a double tap and the frame running out add no second navigation or close', async () => {
  (fetchStory as jest.Mock).mockResolvedValue(story('sam'));
  jest.useFakeTimers();
  try {
    renderScreen();
    const button = await screen.findByTestId('story-message-button');
    expect(markStorySeen).toHaveBeenCalledTimes(1); // the one frame is the last: seen on open
    await act(async () => fireEvent.press(button));
    await act(async () => fireEvent.press(button));
    // Well past the frame's time: the last frame would have ended and closed the viewer.
    await act(async () => jest.advanceTimersByTime(8000));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(markStorySeen).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('no Message button on my own story, or on a server without chats', async () => {
  (fetchStory as jest.Mock).mockResolvedValue(story('me'));
  mockAuthorId = 'me';
  const { unmount } = renderScreen();
  await screen.findByTestId('story-frame-0');
  expect(screen.queryByTestId('story-message-button')).toBeNull();
  unmount();
  mockAuthorId = 'sam';
  mockUnread = { requests: 0, stickers: 0 };
  (fetchStory as jest.Mock).mockResolvedValue(story('sam'));
  renderScreen();
  await screen.findByTestId('story-frame-0');
  expect(screen.queryByTestId('story-message-button')).toBeNull();
});
