import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fetchSocialHome, type SocialHome } from '../../src/api/social';
import { resetSocial } from '../../src/lib/socialStore';
import { SocialScreen } from '../../src/screens/SocialScreen';

jest.mock('../../src/api/social', () => ({
  ...jest.requireActual('../../src/api/social'),
  fetchSocialHome: jest.fn(),
  markStickersSeen: jest.fn().mockResolvedValue(undefined),
  sayGoodnight: jest.fn(),
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
const home = (over: Partial<SocialHome> = {}): SocialHome => ({
  me: { person: person('me'), checkIn: null, goodnight: null },
  camp: { checkedIn: 1, members: 3, faces: [], night: true, awake: 3, asleep: 0, goodnightOpen: true },
  stories: [],
  highlights: null,
  timeline: [],
  unread: { requests: 0, stickers: 0 },
  ...over,
});

beforeEach(() => {
  mockNavigate.mockReset();
  (fetchSocialHome as jest.Mock).mockReset();
  resetSocial();
});

it('an S2 server at night: the banner opens the Campfire, and the evening timeline offers goodnight', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home());
  renderScreen();
  expect(await screen.findByTestId('camp-banner-line')).toHaveTextContent('3 awake · 0 asleep');
  fireEvent.press(screen.getByTestId('camp-banner'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Campfire');
  expect(screen.getByTestId('timeline-goodnight-say')).toBeTruthy();
});

it('by day: no goodnight in the timeline, and the banner still opens the camp', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({ camp: { checkedIn: 2, members: 3, faces: [], night: false, awake: 3, asleep: 0, goodnightOpen: false } }));
  renderScreen();
  expect(await screen.findByTestId('camp-banner-line')).toHaveTextContent('2 checked in');
  expect(screen.queryByTestId('timeline-goodnight-say')).toBeNull();
  fireEvent.press(screen.getByTestId('camp-banner'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Campfire');
});

it('the goodnight row follows my window, not the scene: 17:30 with an 18:00 goal is still day, yet open', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({ camp: { checkedIn: 2, members: 3, faces: [], night: false, awake: 3, asleep: 0, goodnightOpen: true } }));
  renderScreen();
  expect(await screen.findByTestId('camp-banner-line')).toHaveTextContent('2 checked in');
  expect(screen.getByTestId('timeline-goodnight-say')).toBeTruthy();
});

it('the goodnight row follows my window, not the scene: 19:30 with no goal is night, yet closed until 20:00', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({ camp: { checkedIn: 2, members: 3, faces: [], night: true, awake: 3, asleep: 0, goodnightOpen: false } }));
  renderScreen();
  expect(await screen.findByTestId('camp-banner-line')).toHaveTextContent('3 awake · 0 asleep');
  expect(screen.queryByTestId('timeline-goodnight-say')).toBeNull();
});

it('the camp timeline rows: a goodnight and a camp note, worded, with no tap, and never the note text', async () => {
  const sam = person('sam');
  sam.displayName = 'Sam';
  const ben = person('ben');
  ben.displayName = 'Ben';
  const timeline = [
    { id: 'g1', kind: 'goodnight', at: '2026-10-07T21:00:00.000Z', actor: sam, mine: false, onTime: true },
    // A server that wrongly sent the note text: the row still never shows it.
    { id: 'n1', kind: 'camp_note', at: '2026-10-07T20:00:00.000Z', actor: ben, mine: false, text: 'secret words' },
  ] as unknown as SocialHome['timeline'];
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({ timeline }));
  renderScreen();
  expect(await screen.findByTestId('timeline-g1')).toHaveTextContent(/Sam said goodnight, on time/);
  expect(screen.getByTestId('timeline-n1')).toHaveTextContent(/Ben left a camp note/);
  expect(screen.queryByTestId('timeline-g1-action')).toBeNull();
  expect(screen.queryByTestId('timeline-n1-action')).toBeNull();
  expect(screen.queryByText(/secret words/)).toBeNull();
});

it('an S1 server (no camp.night, no me.goodnight): the static banner, and nothing offers goodnight', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({ me: { person: person('me'), checkIn: null }, camp: { checkedIn: 2, members: 3, faces: [] } }));
  renderScreen();
  expect(await screen.findByTestId('camp-banner-line')).toHaveTextContent('2 checked in');
  fireEvent.press(screen.getByTestId('camp-banner'));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(screen.queryByTestId('timeline-goodnight-say')).toBeNull();
});

it('my own ring opens my story marked as mine', async () => {
  (fetchSocialHome as jest.Mock).mockResolvedValue(home({
    me: { person: person('me'), checkIn: { mood: 'RESTED', localDate: '2026-10-07', updatedAt: '2026-10-07T08:00:00.000Z' }, goodnight: null },
  }));
  renderScreen();
  fireEvent.press(await screen.findByTestId('story-me'));
  expect(mockNavigate).toHaveBeenLastCalledWith('SocialStory', { authorId: 'me', mine: true });
});
