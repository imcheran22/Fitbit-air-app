import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchStory } from '../../src/api/social';
import { SocialStoryScreen } from '../../src/screens/SocialStoryScreen';

jest.mock('../../src/api/social', () => ({ ...jest.requireActual('../../src/api/social'), fetchStory: jest.fn(), markStorySeen: jest.fn().mockResolvedValue(undefined) }));
// By default the Social home has not loaded yet: the viewer cannot tell from the store whose story this is.
let mockSocial: unknown = { status: 'idle' };
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(), useSocial: () => mockSocial }));
const mockGoBack = jest.fn();
let mockParams: { authorId: string; mine?: boolean } = { authorId: 'me', mine: true };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: mockParams }),
}));
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><SocialStoryScreen /></SafeAreaProvider>);
const sam = { id: 'sam', handle: 'sam', displayName: 'Sam', coachId: 'mochi' };
const at = '2026-10-08T05:00:00.000Z';

beforeEach(() => {
  jest.clearAllMocks();
  (fetchStory as jest.Mock).mockReset();
  mockParams = { authorId: 'me', mine: true };
  mockSocial = { status: 'idle' };
});

it('once the Social home has loaded, it decides whose story this is, over the route hint', async () => {
  mockParams = { authorId: 'sam', mine: true };
  mockSocial = { status: 'ready', home: { me: { person: { id: 'me' }, checkIn: null } } };
  (fetchStory as jest.Mock).mockResolvedValueOnce({ author: sam, localDate: '2026-10-07', frames: [{ kind: 'goodnight', at, onTime: true }] });
  renderScreen();
  expect(await screen.findByTestId('story-goodnight')).toHaveTextContent(/Sam said goodnight/);
  expect(screen.getByTestId('social-story-name')).toHaveTextContent('Sam');
  expect(screen.getByTestId('story-reply-CHEER')).toBeTruthy();
});

it("a buddy's goodnight frame is never locked: no Check in, though I haven't checked in", async () => {
  mockParams = { authorId: 'sam' };
  mockSocial = { status: 'ready', home: { me: { person: { id: 'me' }, checkIn: null } } };
  (fetchStory as jest.Mock).mockResolvedValueOnce({ author: sam, localDate: '2026-10-07', frames: [{ kind: 'goodnight', at, onTime: true }] });
  renderScreen();
  expect(await screen.findByTestId('story-goodnight')).toBeTruthy();
  expect(screen.queryByTestId('story-unlock')).toBeNull();
});

it('plays my goodnight frame as mine, with no replies, even before the Social home has loaded', async () => {
  (fetchStory as jest.Mock).mockResolvedValueOnce({ author: { ...sam, id: 'me' }, localDate: '2026-10-07', frames: [{ kind: 'goodnight', at, onTime: true }] });
  renderScreen();
  expect(await screen.findByTestId('story-goodnight')).toHaveTextContent(/You said goodnight.*On time/);
  expect(screen.getByTestId('social-story-name')).toHaveTextContent('You');
  expect(screen.queryByTestId('story-reply-CHEER')).toBeNull();
});

it("a buddy's late goodnight reads Off to bed, with replies", async () => {
  mockParams = { authorId: 'sam' };
  (fetchStory as jest.Mock).mockResolvedValueOnce({ author: sam, localDate: '2026-10-07', frames: [{ kind: 'goodnight', at, onTime: false }] });
  renderScreen();
  expect(await screen.findByTestId('story-goodnight')).toHaveTextContent(/Sam said goodnight.*Off to bed/);
  expect(screen.getByTestId('story-reply-CHEER')).toBeTruthy();
});

it('an empty story says there is nothing in it yet — not that it is gone', async () => {
  mockParams = { authorId: 'sam' };
  (fetchStory as jest.Mock).mockResolvedValueOnce({ author: sam, localDate: '2026-10-07', frames: [] });
  renderScreen();
  expect(await screen.findByTestId('social-story-empty')).toHaveTextContent(/Nothing in this story yet\./);
  expect(screen.queryByText(/anymore/)).toBeNull();
});
