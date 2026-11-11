import React from 'react';
import { AccessibilityInfo, Keyboard, ScrollView, StyleSheet, TextInput } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../../src/api/client';
import { clearCampNote, fetchCamp, saveCampNote, sayGoodnight, undoGoodnight, type Camp, type CampMember } from '../../src/api/social';
import { refreshSocial } from '../../src/lib/socialStore';
import { fileReport } from '../../src/api/chats';
import { blockBuddy } from '../../src/api/buddies';
import { chromeBottom, fireBox, PEEK_RESERVE, seatBoxes, type Box } from '../../src/components/social/campSceneGeometry';
import { CampfireScreen } from '../../src/screens/CampfireScreen';
import { PersonKip } from '../../src/components/kip/PersonKip';
import { getMyKipColour, resetMyKipColour, setMyKipColour } from '../../src/lib/kip/myKipColour';
import { GlassSurface } from '../../src/components/ui/glass-surface';
import { FONTS } from '../../src/theme';

jest.mock('../../src/api/social', () => ({
  ...jest.requireActual('../../src/api/social'),
  fetchCamp: jest.fn(),
  saveCampNote: jest.fn(),
  clearCampNote: jest.fn(),
  sayGoodnight: jest.fn(),
  undoGoodnight: jest.fn(),
}));
let mockChats: boolean | null = true;
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(), useChatsAvailable: () => mockChats }));
jest.mock('../../src/api/chats', () => ({ ...jest.requireActual('../../src/api/chats'), fileReport: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), blockBuddy: jest.fn(() => Promise.resolve()) }));
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  // Runs on mount like a first focus; mockRefocus() runs the latest callback again, as a later focus would.
  useFocusEffect: (cb: () => void) => { mockFocus.current = cb; const React = require('react'); React.useEffect(cb, []); },
}));
const mockFocus: { current: (() => void) | null } = { current: null };
const mockRefocus = () => mockFocus.current?.();
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><CampfireScreen /></SafeAreaProvider>);
const person = (id: string) => ({ id, handle: id, displayName: id.toUpperCase(), coachId: 'mochi' });
const member = (id: string, over: Partial<CampMember> = {}): CampMember => ({ person: person(id), mine: false, asleep: false, asleepSince: null, onTime: null, note: null, ...over });
const camp = (over: Partial<Camp> = {}): Camp => ({
  night: true,
  members: [
    member('me', { mine: true }),
    member('sam', { asleep: true, asleepSince: '2026-10-08T05:15:00.000Z', onTime: true, note: 'on time tonight' }),
    member('ben', { note: 'bed soon' }),
  ],
  fire: { lit: 3, of: 5, segments: 3 },
  nightsLitThisWeek: 2,
  goodnight: null,
  goodnightOpen: true,
  goodnightOpensAt: '20:00',
  ...over,
});

beforeEach(() => { jest.clearAllMocks(); mockChats = true; });

it('draws the night camp: moon, bubbles over coaches, my add-note bubble, asleep coaches with z z, the lit fire and the panel', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  expect(await screen.findByTestId('camp-scene-night')).toBeTruthy();
  expect(screen.getByTestId('camp-moon')).toBeTruthy();
  expect(screen.getByTestId('camp-fire-lit')).toBeTruthy();
  expect(screen.getByTestId('camp-bubble-sam')).toHaveTextContent('on time tonight');
  expect(screen.getByTestId('camp-bubble-add')).toHaveTextContent('+ ADD A NOTE');
  expect(screen.getByTestId('camp-zz-sam')).toHaveTextContent('zz');
  expect(screen.queryByTestId('camp-zz-ben')).toBeNull();
  expect(screen.getByTestId('camp-headline')).toHaveTextContent('1 asleep · 2 by the fire');
  expect(screen.getByTestId('camp-fire-count')).toHaveTextContent('3/5');
  // The panel's two section labels are pixel SectionLabels (owner ruling, spec §6); the scene is untouched.
  for (const label of ["TONIGHT'S FIRE", /^WHO'S HERE · \d+$/]) {
    const el = screen.getByText(label);
    expect(String(el.props.className).split(' ')).toEqual(expect.arrayContaining(['text-label', 'uppercase']));
    expect(StyleSheet.flatten(el.props.style).fontFamily).toBe(FONTS.pixel);
  }
  expect(screen.getByTestId('camp-fire-line')).toHaveTextContent('2 more on time lights it fully');
  expect(screen.getByTestId('camp-fire-segment-2')).toHaveStyle({ backgroundColor: '#F97316' });
  expect(screen.getByTestId('camp-fire-segment-3')).toHaveStyle({ backgroundColor: '#2E323B' });
  expect(screen.getByTestId('camp-nights-lit')).toHaveTextContent('Lit 2 nights');
  // 12-hour times on the Campfire.
  expect(screen.getByTestId('camp-who-sam')).toHaveTextContent(/SAM asleep since \d{1,2}:\d{2} (AM|PM) · on time/);
  expect(screen.getByTestId('camp-who-status-ben')).toHaveTextContent('awake · bed soon');
  expect(screen.getByTestId('camp-who-ben')).toHaveTextContent(/^BEN awake · bed soon/);
  // A buddy's note row carries its "Report note" link.
  expect(screen.getByTestId('camp-report-ben')).toHaveTextContent('Report note');
  expect(screen.getByTestId('camp-who-me')).toHaveTextContent('You awake');
  expect(screen.getByTestId('camp-goodnight-say')).toBeTruthy();
  expect(screen.queryByTestId('camp-more')).toBeNull();
});

describe('people as their KIPs', () => {
  afterEach(() => resetMyKipColour());

  const coloured = () => camp({
    members: [
      member('me', { mine: true }),
      { ...member('sam', { asleep: true, asleepSince: '2026-10-08T05:15:00.000Z', onTime: true }), person: { ...person('sam'), kipColour: 'mint' } },
      { ...member('ben'), person: { ...person('ben'), kipColour: 'ink' } },
    ],
  });

  it("draws each Who's here row in that member's colour, asleep members asleep, and me in my colour", async () => {
    setMyKipColour('lemon');
    (fetchCamp as jest.Mock).mockResolvedValue(coloured());
    renderScreen();
    await screen.findByTestId('camp-who-sam');
    expect(within(screen.getByTestId('camp-who-me')).UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: getMyKipColour(), state: 'none', size: 32 });
    expect(within(screen.getByTestId('camp-who-sam')).UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'mint', state: 'asleep', size: 32 });
    expect(within(screen.getByTestId('camp-who-ben')).UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'ink', state: 'none', size: 32 });
  });

  it('seats each member in the scene as their KIP, me in my colour', async () => {
    setMyKipColour('lemon');
    (fetchCamp as jest.Mock).mockResolvedValue(coloured());
    renderScreen();
    await screen.findByTestId('camp-coach-sam');
    expect(within(screen.getByTestId('camp-coach-me')).UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'lemon', state: 'none' });
    expect(within(screen.getByTestId('camp-coach-sam')).UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'mint', state: 'asleep' });
    expect(within(screen.getByTestId('camp-coach-ben')).UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'ink', state: 'none' });
  });

  it('my camp note previews over my KIP, and says it shows above my KIP', async () => {
    setMyKipColour('lemon');
    (fetchCamp as jest.Mock).mockResolvedValue(coloured());
    renderScreen();
    const slot = await screen.findByTestId('camp-note-slot');
    expect(within(slot).UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'lemon', size: 28 });
    expect(within(slot).getByText('Shows above your KIP until 6 AM or your morning check-in.')).toBeTruthy();
  });
});

it("a long note is one truncated line in the bubble and the whole note in Who's here", async () => {
  const long = 'heading to bed early, big race at dawn!!'; // 40 code points
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ members: [member('me', { mine: true }), member('ben', { note: long })] }));
  renderScreen();
  expect(await screen.findByTestId('camp-bubble-ben')).toHaveProp('numberOfLines', 1);
  expect(screen.getByTestId('camp-who-status-ben')).toHaveTextContent(`awake · ${long}`);
  expect(screen.getByTestId('camp-who-status-ben').props.numberOfLines).toBeUndefined();
});

it("an asleep member keeps their whole note in Who's here (their bubble is cut to a line)", async () => {
  const long = 'bed soon, night all, big race at dawn!!!'; // 40 code points
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ members: [member('me', { mine: true }), member('sam', { asleep: true, asleepSince: '2026-10-08T05:15:00.000Z', onTime: true, note: long })] }));
  renderScreen();
  expect(await screen.findByTestId('camp-bubble-sam')).toHaveProp('numberOfLines', 1);
  expect(screen.getByTestId('camp-who-status-sam')).toHaveTextContent(new RegExp(`^asleep since \\d{1,2}:\\d{2} (AM|PM) · on time · ${long}$`));
  expect(screen.getByTestId('camp-who-status-sam').props.numberOfLines).toBeUndefined();
});

it('by day: sky, no moon, unlit logs, and goodnight waits for my own opening time', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ night: false, goodnightOpen: false, goodnightOpensAt: '20:00' }));
  renderScreen();
  expect(await screen.findByTestId('camp-scene-day')).toBeTruthy();
  expect(screen.queryByTestId('camp-moon')).toBeNull();
  expect(screen.getByTestId('camp-fire-unlit')).toBeTruthy();
  // By day the bar is tonight's fire (goodnights count from the evening), and says so; nothing reads "Out".
  expect(screen.getByTestId('camp-fire-count')).toHaveTextContent('3/5 tonight');
  expect(screen.getByTestId('camp-fire-segment-2')).toHaveStyle({ backgroundColor: '#F97316' });
  expect(screen.queryByText(/Out/)).toBeNull();
  expect(screen.queryByTestId('camp-fire-line')).toBeNull();
  expect(screen.getByTestId('camp-headline')).toHaveTextContent('2 awake · 1 asleep');
  expect(screen.getByTestId('camp-goodnight-later')).toHaveTextContent('You can say goodnight from 8:00 PM');
  expect(screen.queryByTestId('camp-goodnight-say')).toBeNull();
});

it('an early goal opens goodnight before the night scene: 17:30 is still day, yet I can say it', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ night: false, goodnightOpen: true, goodnightOpensAt: '17:00' }));
  renderScreen();
  expect(await screen.findByTestId('camp-scene-day')).toBeTruthy();
  expect(screen.getByTestId('camp-goodnight-say')).toBeTruthy();
  expect(screen.queryByTestId('camp-goodnight-later')).toBeNull();
});

it('at 19:30 with no goal the scene is night but goodnight waits for 8:00 PM', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ night: true, goodnightOpen: false, goodnightOpensAt: '20:00' }));
  renderScreen();
  expect(await screen.findByTestId('camp-scene-night')).toBeTruthy();
  expect(screen.getByTestId('camp-goodnight-later')).toHaveTextContent('You can say goodnight from 8:00 PM');
  expect(screen.queryByTestId('camp-goodnight-say')).toBeNull();
});

it('seats eight coaches in the ring with no overlap, below the top chrome and above the Peek panel, on every phone size', () => {
  const overlaps = (a: Box, b: Box) =>
    a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
  for (const width of [375, 390, 393, 402, 414, 428, 430]) {
    for (const height of [667, 736, 812, 844, 852, 874, 896, 926, 932]) {
      for (const inset of [20, 47, 59]) {
        const seats = seatBoxes(width, height, inset);
        const fire = fireBox(width, height, inset);
        expect(seats).toHaveLength(8);
        seats.forEach((a, i) => {
          expect(a.left).toBeGreaterThanOrEqual(0);
          expect(a.left + a.width).toBeLessThanOrEqual(width);
          // A seat's box starts at its bubble: no bubble or coach under the pills, kicker or headline.
          expect(a.top).toBeGreaterThanOrEqual(chromeBottom(inset));
          expect(a.top + a.height).toBeLessThanOrEqual(height - PEEK_RESERVE); // above the Peek panel
          expect(overlaps(a, fire)).toBe(false);
          for (const b of seats.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
        });
      }
    }
  }
});

it('the chrome clearance is real: a taller top inset pushes the ring down, and a too-short screen would break it', () => {
  // 667 with a 20-pt inset leaves 60 px between the chrome and the seats; a 140-pt inset leaves none.
  expect(seatBoxes(375, 667, 20)[4]!.top - chromeBottom(20)).toBeGreaterThan(0);
  const deep = seatBoxes(375, 667, 140);
  expect(Math.min(...deep.map((s) => s.top))).toBeGreaterThanOrEqual(chromeBottom(140));
  // ...which squeezes the ring past the Peek panel: the check above is what keeps this from happening on real phones.
  expect(Math.max(...deep.map((s) => s.top + s.height))).toBeGreaterThan(667 - PEEK_RESERVE);
});

it('shares a note with a live count, refuses one over 40, and clears mine', async () => {
  (fetchCamp as jest.Mock).mockResolvedValueOnce(camp()).mockResolvedValue(camp({ members: [member('me', { mine: true, note: 'night all' })] }));
  (saveCampNote as jest.Mock).mockResolvedValue({ note: { text: 'night all', createdAt: '', expiresAt: '' } });
  (clearCampNote as jest.Mock).mockResolvedValue(undefined);
  renderScreen();
  await screen.findByTestId('camp-note-input');
  expect(screen.getByTestId('camp-note-share')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('camp-note-input'), 'x'.repeat(41));
  // The ring counts what's left; its label says what's used.
  expect(screen.getByTestId('camp-note-count')).toHaveTextContent('-1');
  expect(screen.getByTestId('camp-note-count')).toHaveProp('accessibilityLabel', '41 of 40 characters');
  expect(screen.getByTestId('camp-note-share')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('camp-note-input'), ' night all ');
  expect(screen.getByTestId('camp-note-count')).toHaveTextContent('31');
  expect(screen.getByTestId('camp-note-count')).toHaveProp('accessibilityLabel', '9 of 40 characters');
  await act(async () => fireEvent.press(screen.getByTestId('camp-note-share')));
  expect(saveCampNote).toHaveBeenCalledWith(' night all ');
  expect(refreshSocial).toHaveBeenCalled();
  expect(await screen.findByTestId('camp-bubble-me')).toHaveTextContent('night all');
  // Live: Edit note and Clear instead of the composer; Edit puts the note back in the draft.
  expect(screen.queryByTestId('camp-note-input')).toBeNull();
  expect(screen.getByTestId('camp-note-live')).toHaveTextContent('Live');
  fireEvent.press(screen.getByTestId('camp-note-edit'));
  expect(screen.getByTestId('camp-note-input')).toHaveProp('value', 'night all');
  await act(async () => fireEvent.press(screen.getByTestId('camp-note-clear')));
  expect(clearCampNote).toHaveBeenCalledTimes(1);
});

it('Share counts code points: exactly 40 enables it, whitespace alone never does, an emoji is one', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  const input = await screen.findByTestId('camp-note-input');
  fireEvent.changeText(input, 'x'.repeat(40));
  expect(screen.getByTestId('camp-note-count')).toHaveProp('accessibilityLabel', '40 of 40 characters');
  expect(screen.getByTestId('camp-note-share')).not.toBeDisabled();
  fireEvent.changeText(input, '   \n\t ');
  expect(screen.getByTestId('camp-note-count')).toHaveProp('accessibilityLabel', '0 of 40 characters');
  expect(screen.getByTestId('camp-note-share')).toBeDisabled();
  fireEvent.changeText(input, '🔥🌙 night');
  expect(screen.getByTestId('camp-note-count')).toHaveProp('accessibilityLabel', '8 of 40 characters');
  fireEvent.changeText(input, `${'x'.repeat(38)}🔥🌙`); // 40 code points, 42 UTF-16 units
  expect(screen.getByTestId('camp-note-count')).toHaveProp('accessibilityLabel', '40 of 40 characters');
  expect(screen.getByTestId('camp-note-share')).not.toBeDisabled();
});

it('a double tap on Share sends once; the draft empties as it is sent', async () => {
  let resolve!: (v: unknown) => void;
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  (saveCampNote as jest.Mock).mockReturnValue(new Promise((r) => { resolve = r; }));
  renderScreen();
  fireEvent.changeText(await screen.findByTestId('camp-note-input'), 'night all');
  act(() => {
    fireEvent.press(screen.getByTestId('camp-note-share'));
    fireEvent.press(screen.getByTestId('camp-note-share'));
  });
  expect(screen.getByTestId('camp-note-input')).toHaveProp('value', '');
  await act(async () => resolve({ note: { text: 'night all', createdAt: '', expiresAt: '' } }));
  expect(saveCampNote).toHaveBeenCalledTimes(1);
  expect(saveCampNote).toHaveBeenCalledWith('night all');
});

it('offers Clear from the share answer even when the re-read after sharing fails', async () => {
  (fetchCamp as jest.Mock).mockResolvedValueOnce(camp()).mockRejectedValue(new Error('offline'));
  (saveCampNote as jest.Mock).mockResolvedValue({ note: { text: 'night all', createdAt: '', expiresAt: '' } });
  (clearCampNote as jest.Mock).mockResolvedValue(undefined);
  renderScreen();
  fireEvent.changeText(await screen.findByTestId('camp-note-input'), 'night all');
  expect(screen.queryByTestId('camp-note-clear')).toBeNull();
  await act(async () => fireEvent.press(screen.getByTestId('camp-note-share')));
  expect(fetchCamp).toHaveBeenCalledTimes(2);
  await act(async () => fireEvent.press(screen.getByTestId('camp-note-clear')));
  expect(clearCampNote).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('camp-note-clear')).toBeNull();
});

it('a refocus re-reads the camp; if that read fails, buddies keep their seats but not their notes until a good read', async () => {
  (fetchCamp as jest.Mock).mockResolvedValueOnce(camp()).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(camp());
  renderScreen();
  expect(await screen.findByTestId('camp-bubble-sam')).toHaveTextContent('on time tonight');
  await act(async () => mockRefocus());
  expect(fetchCamp).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('camp-coach-sam')).toBeTruthy();
  expect(screen.queryByTestId('camp-bubble-sam')).toBeNull();
  expect(screen.queryByTestId('camp-bubble-ben')).toBeNull();
  expect(screen.getByTestId('camp-who-status-ben')).toHaveTextContent(/^awake$/);
  await act(async () => mockRefocus());
  expect(screen.getByTestId('camp-bubble-sam')).toHaveTextContent('on time tonight');
});

it('an older read that lands after a newer one never overwrites it', async () => {
  let resolveOld!: (v: Camp) => void;
  (fetchCamp as jest.Mock)
    .mockReturnValueOnce(new Promise((r) => { resolveOld = r; }))
    .mockResolvedValueOnce(camp({ nightsLitThisWeek: 4 }));
  renderScreen();
  await act(async () => mockRefocus());
  expect(screen.getByTestId('camp-nights-lit')).toHaveTextContent('Lit 4 nights');
  await act(async () => resolveOld(camp({ nightsLitThisWeek: 1 })));
  expect(screen.getByTestId('camp-nights-lit')).toHaveTextContent('Lit 4 nights');
});

it("shows the server's reason when a note is refused, keeping the draft", async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  (saveCampNote as jest.Mock).mockRejectedValue(new ApiError(429, 'x', 'rate_limited'));
  renderScreen();
  fireEvent.changeText(await screen.findByTestId('camp-note-input'), 'hello');
  await act(async () => fireEvent.press(screen.getByTestId('camp-note-share')));
  expect(screen.getByTestId('camp-message')).toHaveTextContent('Too many tries. Please try again later.');
  expect(screen.getByTestId('camp-note-input')).toHaveProp('value', 'hello');
});

it('says goodnight, then offers Undo while it is fresh', async () => {
  const goodnight = { localDate: '2026-10-07', at: '2026-10-08T05:30:00.000Z', onTime: true, undoUntil: new Date(Date.now() + 600_000).toISOString() };
  (fetchCamp as jest.Mock).mockResolvedValueOnce(camp()).mockResolvedValue(camp({ goodnight }));
  (sayGoodnight as jest.Mock).mockResolvedValue({ goodnight });
  (undoGoodnight as jest.Mock).mockResolvedValue(undefined);
  renderScreen();
  // Found outside act: inside it, the load's re-render would wait for act to end and findBy would never see it.
  const say = await screen.findByTestId('camp-goodnight-say');
  await act(async () => fireEvent.press(say));
  expect(sayGoodnight).toHaveBeenCalledTimes(1);
  expect(await screen.findByTestId('camp-goodnight-said')).toHaveTextContent('Goodnight said, on time');
  expect(refreshSocial).toHaveBeenCalled();
  (refreshSocial as jest.Mock).mockClear();
  await act(async () => fireEvent.press(screen.getByTestId('camp-goodnight-undo')));
  expect(undoGoodnight).toHaveBeenCalledTimes(1);
  expect(refreshSocial).toHaveBeenCalledTimes(1);
});

it("a buddy's coach opens their thread and mine does not navigate; +N past eight; Message camp opens Chats; back goes back", async () => {
  const many = [member('me', { mine: true }), ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => member(id))];
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ members: many }));
  renderScreen();
  fireEvent.press(await screen.findByTestId('camp-coach-a'));
  expect(mockNavigate).toHaveBeenLastCalledWith('ChatThread', { buddyId: 'a' });
  mockNavigate.mockClear();
  fireEvent.press(screen.getByTestId('camp-coach-me'));
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(screen.getByTestId('camp-more')).toHaveTextContent('+2 here');
  expect(screen.getByTestId('camp-more')).toHaveProp('accessibilityLabel', '2 more at the camp');
  expect(screen.queryByTestId('camp-coach-h')).toBeNull();
  expect(screen.getByTestId('camp-who-i')).toBeTruthy();
  fireEvent.press(screen.getByTestId('camp-message-camp'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Chats');
  // Over the scene the back button matches "+N here" in height: 40 px (lg), with the standard 8-px corners.
  expect(String(screen.getByTestId('camp-back').props.className).split(' ')).toEqual(expect.arrayContaining(['h-[40px]', 'rounded-[8px]']));
  fireEvent.press(screen.getByTestId('camp-back'));
  expect(mockGoBack).toHaveBeenCalled();
});

it('an older server says the camp is not open yet; a failure offers a retry', async () => {
  (fetchCamp as jest.Mock).mockResolvedValueOnce(null);
  const { unmount } = renderScreen();
  expect(await screen.findByTestId('camp-unavailable')).toHaveTextContent(/isn't open yet/);
  unmount();
  (fetchCamp as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(camp());
  renderScreen();
  expect(await screen.findByTestId('camp-error')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('camp-retry')));
  expect(await screen.findByTestId('campfire')).toBeTruthy();
});

it('names the moon, the fire, the seats, the composer and the fire strength for screen readers', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  expect(await screen.findByTestId('camp-moon')).toHaveProp('accessibilityLabel', 'The moon is up');
  expect(screen.getByTestId('camp-fire-lit')).toHaveProp('accessibilityLabel', 'The fire is lit');
  expect(screen.getByTestId('camp-coach-sam')).toHaveProp('accessibilityRole', 'button');
  expect(screen.getByTestId('camp-coach-sam')).toHaveProp('accessibilityLabel', 'SAM, asleep');
  expect(screen.getByTestId('camp-coach-me')).toHaveProp('accessibilityLabel', 'You. Write your camp note');
  expect(screen.getByTestId('camp-note-input')).toHaveProp('accessibilityLabel', 'Your camp note');
  expect(screen.getByTestId('camp-note-share')).toHaveProp('accessibilityRole', 'button');
  expect(screen.getByTestId('camp-fire-strength')).toHaveProp('accessibilityValue', { min: 0, max: 5, now: 3 });
});

const handle = () => screen.getByTestId('camp-panel-handle');

it('starts at Peek; the handle steps Peek → Half → Full → Peek', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  await screen.findByTestId('campfire');
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, peek');
  expect(handle()).toHaveProp('accessibilityHint', 'Shows more');
  // Every stop's content is in the one scroll view, whatever the stop.
  expect(screen.getByTestId('camp-panel-scroll')).toHaveProp('scrollEnabled', false);
  expect(screen.getByTestId('camp-note-input')).toBeTruthy();
  expect(screen.getByTestId('camp-message-camp')).toBeTruthy();
  fireEvent.press(handle());
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, half open');
  fireEvent.press(handle());
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, fully open');
  expect(handle()).toHaveProp('accessibilityHint', 'Shows less');
  expect(screen.getByTestId('camp-panel-scroll')).toHaveProp('scrollEnabled', true);
  fireEvent.press(handle());
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, peek');
});

it('tapping my coach opens Half and focuses the note input', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  await screen.findByTestId('camp-coach-me');
  const focus = screen.UNSAFE_getByType(TextInput).instance.focus as jest.Mock;
  focus.mockClear();
  fireEvent.press(screen.getByTestId('camp-coach-me'));
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, half open');
  expect(focus).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
});

it('the handle is adjustable: increment goes up a stop, decrement down, stopping at either end', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  await screen.findByTestId('campfire');
  expect(handle()).toHaveProp('accessibilityRole', 'adjustable');
  // The state is read once, in the label.
  expect(handle().props.accessibilityValue?.text).toBeUndefined();
  const act11y = (actionName: string) => fireEvent(handle(), 'accessibilityAction', { nativeEvent: { actionName } });
  act11y('decrement');
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, peek');
  act11y('increment');
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, half open');
  act11y('increment');
  act11y('increment');
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, fully open');
  act11y('decrement');
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, half open');
});

it('a quick-pick chip fills the draft', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  fireEvent.press(await screen.findByTestId('camp-chip-1'));
  expect(screen.getByTestId('camp-note-input')).toHaveProp('value', 'early start tmrw');
  expect(screen.getByTestId('camp-note-share')).not.toBeDisabled();
});

it('with a screen reader on, starts at Half and the panel scrolls at every stop', async () => {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValueOnce(true);
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  await screen.findByTestId('campfire');
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, half open');
  expect(screen.getByTestId('camp-panel-scroll')).toHaveProp('scrollEnabled', true);
  fireEvent(handle(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(screen.getByTestId('camp-panel-scroll')).toHaveProp('scrollEnabled', true);
});

it('a drag snaps to a stop: a slow drag to the nearest, a flick one stop its way', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  await screen.findByTestId('campfire');
  // runOnJS hands the snap back to the JS thread a tick later; the spring then settles before the next drag.
  const drag = (translationY: number, velocityY: number) => act(async () => {
    fireGestureHandler(getByGestureTestId('camp-panel-drag'), [
      { state: State.BEGAN }, { state: State.ACTIVE, translationY }, { state: State.END, translationY, velocityY },
    ]);
    await new Promise((r) => setTimeout(r, 1200));
  });
  // Jest's window is 1334 tall, no insets: peek 1228, half 534, full 147. Up 500 slowly ends nearer Half.
  await drag(-500, -100);
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, half open');
  // A short flick up goes one stop: Full.
  await drag(-20, -900);
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, fully open');
  // A short slow drag down stays at Full.
  await drag(40, 50);
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, fully open');
  // A flick down goes one stop: Half, not Peek.
  await drag(30, 1500);
  expect(handle()).toHaveProp('accessibilityLabel', 'Camp details, half open');
}, 15000);

it('the panel is dark glass even when the app is light', async () => {
  const { colorScheme } = require('nativewind');
  colorScheme.set('light');
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  await screen.findByTestId('campfire');
  expect(screen.UNSAFE_getByType(GlassSurface).props.scheme).toBe('dark');
  colorScheme.set('system');
});

it('keeps "Live until" from the share answer after the re-read, while that is still my note', async () => {
  const expiresAt = new Date(2026, 9, 8, 6, 0).toISOString();
  (fetchCamp as jest.Mock).mockResolvedValueOnce(camp()).mockResolvedValue(camp({ members: [member('me', { mine: true, note: 'night all' })] }));
  (saveCampNote as jest.Mock).mockResolvedValue({ note: { text: 'night all', createdAt: '', expiresAt } });
  renderScreen();
  fireEvent.changeText(await screen.findByTestId('camp-note-input'), 'night all');
  await act(async () => fireEvent.press(screen.getByTestId('camp-note-share')));
  expect(fetchCamp).toHaveBeenCalledTimes(2);
  expect(await screen.findByTestId('camp-bubble-me')).toHaveTextContent('night all');
  expect(screen.getByTestId('camp-note-live')).toHaveTextContent('Live until 6:00 AM');
  // A later read with a different note of mine (changed elsewhere) drops the old expiry.
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ members: [member('me', { mine: true, note: 'other' })] }));
  await act(async () => mockRefocus());
  expect(screen.getByTestId('camp-note-live')).toHaveTextContent(/^Live$/);
});

it('Cancel leaves an edit without sending: the live note stays', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp({ members: [member('me', { mine: true, note: 'night all' })] }));
  renderScreen();
  fireEvent.press(await screen.findByTestId('camp-note-edit'));
  fireEvent.changeText(screen.getByTestId('camp-note-input'), 'changed my mind');
  fireEvent.press(screen.getByTestId('camp-note-cancel'));
  expect(saveCampNote).not.toHaveBeenCalled();
  expect(screen.queryByTestId('camp-note-input')).toBeNull();
  expect(screen.getByTestId('camp-note-edit')).toBeTruthy();
  expect(screen.getByTestId('camp-bubble-me')).toHaveTextContent('night all');
  // A fresh composer has no Cancel: there's nothing to go back to.
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  await act(async () => mockRefocus());
  expect(screen.getByTestId('camp-note-input')).toBeTruthy();
  expect(screen.queryByTestId('camp-note-cancel')).toBeNull();
});

it('with the keyboard up, the panel scrolls and brings the composer (and Share) into view', async () => {
  type KeyboardEvent = { endCoordinates: { height: number }; duration: number };
  const handlers: Record<string, (e: KeyboardEvent) => void> = {};
  const listen = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: (e: KeyboardEvent) => void) => {
    handlers[event] = cb;
    return { remove: jest.fn() };
  }) as never);
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  await screen.findByTestId('camp-note-input');
  const layout = (testID: string, y: number, height: number) =>
    fireEvent(screen.getByTestId(testID), 'layout', { nativeEvent: { layout: { x: 0, y, width: 390, height } } });
  layout('camp-panel-header', 0, 110);
  layout('camp-note-slot', 14, 500);
  layout('camp-note-composer', 120, 300);
  fireEvent.changeText(screen.getByTestId('camp-note-input'), 'night all');
  const scrollTo = screen.UNSAFE_getByType(ScrollView).instance.scrollTo as jest.Mock;
  scrollTo.mockClear();
  expect(screen.getByTestId('camp-panel-scroll')).toHaveProp('scrollEnabled', false);
  const show = handlers.keyboardWillShow ?? handlers.keyboardDidShow;
  act(() => show!({ endCoordinates: { height: 336 }, duration: 250 }));
  expect(screen.getByTestId('camp-panel-scroll')).toHaveProp('scrollEnabled', true);
  expect(scrollTo).toHaveBeenCalled();
  expect(scrollTo.mock.calls.at(-1)![0].y).toBeGreaterThan(0);
  // Typing removes the chips: the composer shrinks and is revealed again.
  layout('camp-note-composer', 120, 140);
  const hide = handlers.keyboardWillHide ?? handlers.keyboardDidHide;
  act(() => hide!({ endCoordinates: { height: 0 }, duration: 250 }));
  expect(screen.getByTestId('camp-panel-scroll')).toHaveProp('scrollEnabled', false);
  listen.mockRestore();
});

it('the chips are starting points: they show while the draft is empty', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  fireEvent.changeText(await screen.findByTestId('camp-note-input'), 'night');
  expect(screen.queryByTestId('camp-chip-0')).toBeNull();
  fireEvent.changeText(screen.getByTestId('camp-note-input'), '');
  expect(screen.getByTestId('camp-chip-0')).toBeTruthy();
});

it("a buddy's coach with a camp note opens their thread with the note staged", async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  fireEvent.press(await screen.findByTestId('camp-coach-ben'));
  expect(mockNavigate).toHaveBeenLastCalledWith('ChatThread', { buddyId: 'ben', quote: { request: { type: 'camp_note' }, label: "BEN's camp note" } });
});

it('on a server without chats, a coach opens their week and Message camp opens Buddies; no Report link', async () => {
  mockChats = false;
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  fireEvent.press(await screen.findByTestId('camp-coach-ben'));
  expect(mockNavigate).toHaveBeenLastCalledWith('BuddyWeek', { buddyId: 'ben' });
  fireEvent.press(screen.getByTestId('camp-message-camp'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Buddies');
  expect(screen.queryByTestId('camp-report-ben')).toBeNull();
});

it("reports a buddy's camp note from Who's here; a ticked Also block blocks them too, with no second confirm", async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  expect(await screen.findByTestId('camp-report-ben')).toBeTruthy();
  expect(screen.queryByTestId('camp-report-me')).toBeNull();
  fireEvent.press(screen.getByTestId('camp-report-ben'));
  fireEvent.press(screen.getByTestId('report-other'));
  expect(fileReport).not.toHaveBeenCalled(); // a reason is a choice, not a filing
  fireEvent.press(screen.getByTestId('report-block'));
  await act(async () => fireEvent.press(screen.getByTestId('report-submit')));
  expect(fileReport).toHaveBeenCalledWith('camp_note', 'ben', 'other');
  expect(blockBuddy).toHaveBeenCalledWith('ben');
  expect(refreshSocial).toHaveBeenCalled();
});

it('without the block box ticked, Report files the camp note and blocks no one', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  renderScreen();
  fireEvent.press(await screen.findByTestId('camp-report-ben'));
  await act(async () => fireEvent.press(screen.getByTestId('report-submit')));
  expect(fileReport).toHaveBeenCalledWith('camp_note', 'ben', 'spam');
  expect(blockBuddy).not.toHaveBeenCalled();
  expect(refreshSocial).not.toHaveBeenCalled();
});

it('a block that fails after the report says so and changes nothing', async () => {
  (fetchCamp as jest.Mock).mockResolvedValue(camp());
  (blockBuddy as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  renderScreen();
  fireEvent.press(await screen.findByTestId('camp-report-ben'));
  fireEvent.press(screen.getByTestId('report-block'));
  await act(async () => fireEvent.press(screen.getByTestId('report-submit')));
  expect(blockBuddy).toHaveBeenCalledWith('ben');
  expect(refreshSocial).not.toHaveBeenCalled();
  expect(screen.getByTestId('camp-message')).toHaveTextContent('Something went wrong. Please try again.');
});
