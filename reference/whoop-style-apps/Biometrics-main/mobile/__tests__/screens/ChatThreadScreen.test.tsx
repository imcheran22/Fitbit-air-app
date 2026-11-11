import React from 'react';
import { Alert, AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../../src/api/client';
import { blockBuddy } from '../../src/api/buddies';
import {
  fetchThread, fileReport, markChatRead, sendCard, sendStickerMessage, sendText, setReaction, unsendMessage, type Message, type Thread,
} from '../../src/api/chats';
import { refreshSocial } from '../../src/lib/socialStore';
import { ChatThreadScreen } from '../../src/screens/ChatThreadScreen';

jest.mock('../../src/api/chats', () => ({
  ...jest.requireActual('../../src/api/chats'),
  fetchThread: jest.fn(),
  markChatRead: jest.fn(() => Promise.resolve()),
  sendText: jest.fn(),
  sendStickerMessage: jest.fn(),
  sendCard: jest.fn(),
  unsendMessage: jest.fn(() => Promise.resolve()),
  setReaction: jest.fn(),
  clearReaction: jest.fn(() => Promise.resolve()),
  fileReport: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/api/buddies', () => ({ ...jest.requireActual('../../src/api/buddies'), blockBuddy: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/lib/buddiesStore', () => ({ refreshBuddies: jest.fn() }));
const CHECKED_IN = { me: { person: { id: 'me' }, checkIn: { mood: 'RESTED', localDate: '2026-10-08', updatedAt: '' } }, stories: [{ author: { id: 'ben' }, unseen: true }], unread: { requests: 0, stickers: 0, chats: 0 } };
let mockHome: object = CHECKED_IN;
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(() => Promise.resolve()), useSocial: () => ({ status: 'ready', home: mockHome }) }));
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: { buddyId: string; quote?: unknown } = { buddyId: 'ben' };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, replace: mockReplace }),
  useRoute: () => ({ params: mockParams }),
  // Runs on mount like a first focus (and its cleanup on unmount).
  useFocusEffect: (cb: () => (() => void) | void) => { const React = require('react'); React.useEffect(cb, []); },
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderScreen = () => render(<SafeAreaProvider initialMetrics={metrics}><ChatThreadScreen /></SafeAreaProvider>);
const ben = { id: 'ben', handle: 'ben.walks', displayName: 'Ben', coachId: 'mochi' };
const T = (h: number, m = 0) => new Date(2026, 9, 8, h, m).toISOString();
const msg = (id: string, over: Partial<Message> = {}): Message => ({ id, mine: false, kind: 'TEXT', text: id, sticker: null, card: null, replyTo: null, reactions: [], createdAt: T(9), ...over });
const thread = (messages: Message[], over: Partial<Thread> = {}): Thread => ({ buddy: ben, messages, nextBefore: null, seenAt: null, activeAt: null, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  // A test that fails early must not hand its unused one-off answers to the next one.
  for (const fn of [fetchThread, sendText, sendStickerMessage, sendCard, setReaction]) (fn as jest.Mock).mockReset();
  mockParams = { buddyId: 'ben' };
  mockHome = CHECKED_IN;
  // The jest AppState has no state of its own: the app is in the foreground unless a test says otherwise.
  AppState.currentState = 'active';
});
// A failing fake-timer test must not leave its clock to the next one.
afterEach(() => jest.useRealTimers());

it('shows the header, a card, a sticker, a text with its reaction, the day chip and Seen, and marks the thread read once', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([
    msg('c1', { kind: 'CARD', text: null, card: { type: 'checkin', available: true, about: 'sender', localDate: '2026-10-08', mood: 'TIRED' }, createdAt: T(7, 31) }),
    msg('s1', { mine: true, kind: 'STICKER', text: null, sticker: 'REST_UP', createdAt: T(7, 40) }),
    msg('t1', { text: 'rough night lol', createdAt: T(8), reactions: [{ kind: 'HEART', mine: true }] }),
    msg('t2', { mine: true, text: 'early night tonight?', createdAt: T(8, 5) }),
  ], { seenAt: T(8, 6), activeAt: new Date(Date.now() - 60_000).toISOString() }));
  renderScreen();
  expect(await screen.findByTestId('thread-name')).toHaveTextContent('Ben');
  expect(screen.getByTestId('thread-sub')).toHaveTextContent('Active now · @ben.walks');
  expect(screen.getByTestId('thread-avatar-active')).toBeTruthy();
  expect(screen.getByTestId('message-c1-card')).toHaveTextContent(/Ben shared their check-in.*MORNING CHECK-IN.*Woke up tired/);
  expect(screen.getByTestId('message-s1-sticker')).toHaveTextContent('Rest up');
  expect(screen.getByTestId('message-t1-text')).toHaveTextContent('rough night lol');
  expect(screen.getByTestId('message-t1-reactions')).toHaveTextContent('Heart');
  expect(screen.getByTestId('chip-c1')).toHaveTextContent(/^\w{3,9} \d/);
  expect(screen.getByTestId('thread-seen')).toHaveTextContent('Seen');
  expect(markChatRead).toHaveBeenCalledTimes(1);
  expect(markChatRead).toHaveBeenCalledWith('ben');
  expect(refreshSocial).toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('thread-info'));
  expect(mockNavigate).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'ben' });
});

it('sends a text: the draft clears and the message lands; a refused send keeps the draft and says why', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  (sendText as jest.Mock)
    .mockResolvedValueOnce({ message: msg('n1', { mine: true, text: 'hi Ben', createdAt: T(10) }) })
    .mockRejectedValueOnce(new ApiError(400, 'x', 'invalid_message'));
  renderScreen();
  fireEvent.changeText(await screen.findByTestId('composer-input'), '  hi Ben ');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(sendText).toHaveBeenCalledWith('ben', 'hi Ben', undefined);
  expect(screen.getByTestId('message-n1-text')).toHaveTextContent('hi Ben');
  expect(screen.getByTestId('composer-input').props.value).toBe('');
  fireEvent.changeText(screen.getByTestId('composer-input'), 'again');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(screen.getByTestId('thread-error')).toHaveTextContent('Messages are 1 to 1,000 characters.');
  expect(screen.getByTestId('composer-input').props.value).toBe('again');
});

it('a staged quote goes out as a card with the next text; a removed one does not', async () => {
  mockParams = { buddyId: 'ben', quote: { request: { type: 'story_frame', at: T(7) }, label: "Ben's check-in" } };
  (fetchThread as jest.Mock).mockResolvedValue(thread([]));
  (sendCard as jest.Mock).mockResolvedValue({
    message: msg('q1', { mine: true, kind: 'CARD', text: 'same', card: { type: 'checkin', available: true, about: 'recipient', localDate: '2026-10-08', mood: null }, createdAt: T(10) }),
  });
  renderScreen();
  expect(await screen.findByTestId('composer-quote')).toHaveTextContent("Replying to Ben's check-in");
  expect(screen.getByTestId('thread-empty')).toHaveTextContent('Say hi to Ben.');
  fireEvent.changeText(screen.getByTestId('composer-input'), 'same');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(sendCard).toHaveBeenCalledWith('ben', { type: 'story_frame', at: T(7) }, 'same', undefined);
  expect(screen.queryByTestId('composer-quote')).toBeNull();
  expect(screen.getByTestId('message-q1-card')).toHaveTextContent(/^You replied to their check-in/);
});

it('removing a staged quote sends a plain text', async () => {
  mockParams = { buddyId: 'ben', quote: { request: { type: 'note' }, label: "Ben's note" } };
  (fetchThread as jest.Mock).mockResolvedValue(thread([]));
  (sendText as jest.Mock).mockResolvedValue({ message: msg('n1', { mine: true, text: 'hey', createdAt: T(10) }) });
  renderScreen();
  fireEvent.press(await screen.findByTestId('composer-quote-clear'));
  fireEvent.changeText(screen.getByTestId('composer-input'), 'hey');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(sendText).toHaveBeenCalledWith('ben', 'hey', undefined);
  expect(sendCard).not.toHaveBeenCalled();
});

it('quick stickers send a sticker message; "+" shares my check-in', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  (sendStickerMessage as jest.Mock).mockResolvedValue({ message: msg('k1', { mine: true, kind: 'STICKER', text: null, sticker: 'CHEER', createdAt: T(10) }) });
  (sendCard as jest.Mock).mockResolvedValue({
    message: msg('k2', { mine: true, kind: 'CARD', text: null, card: { type: 'checkin', available: true, about: 'sender', localDate: '2026-10-08', mood: 'RESTED' }, createdAt: T(10, 1) }),
  });
  renderScreen();
  // Found outside act: inside it, the first load's answer would wait for the act to end.
  const cheer = await screen.findByTestId('composer-sticker-CHEER');
  await act(async () => fireEvent.press(cheer));
  expect(sendStickerMessage).toHaveBeenCalledWith('ben', 'CHEER', undefined);
  expect(screen.getByTestId('message-k1-sticker')).toHaveTextContent('Cheer');
  await act(async () => fireEvent.press(screen.getByTestId('composer-checkin')));
  expect(sendCard).toHaveBeenCalledWith('ben', { type: 'my_checkin' }, undefined, undefined);
  expect(screen.getByTestId('message-k2-card')).toHaveTextContent(/^You shared your check-in/);
});

it('"+" is off until I have checked in today', async () => {
  mockHome = { ...CHECKED_IN, me: { person: { id: 'me' }, checkIn: null } };
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  renderScreen();
  expect(await screen.findByTestId('composer-checkin')).toBeDisabled();
});

it('a long press opens the actions: react, reply, unsend mine, report theirs, then block too', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1', { text: 'rough night lol' }), msg('m1', { mine: true, text: 'oops', createdAt: T(9, 1) })]));
  (setReaction as jest.Mock).mockResolvedValue({ reactions: [{ kind: 'HEART', mine: true }] });
  (sendText as jest.Mock).mockResolvedValue({
    message: msg('r1', { mine: true, text: 'same', replyTo: { id: 't1', gone: false, mine: false, kind: 'TEXT', text: 'rough night lol', sticker: null, cardType: null }, createdAt: T(10) }),
  });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  renderScreen();
  fireEvent(await screen.findByTestId('message-t1'), 'longPress');
  await act(async () => fireEvent.press(screen.getByTestId('react-HEART')));
  expect(setReaction).toHaveBeenCalledWith('ben', 't1', 'HEART');
  expect(screen.getByTestId('message-t1-reactions')).toHaveTextContent('Heart');
  fireEvent(screen.getByTestId('message-t1'), 'longPress');
  fireEvent.press(screen.getByTestId('message-reply'));
  expect(screen.getByTestId('composer-reply')).toHaveTextContent("Replying to Ben's message");
  fireEvent.changeText(screen.getByTestId('composer-input'), 'same');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(sendText).toHaveBeenCalledWith('ben', 'same', 't1');
  expect(screen.getByTestId('message-r1-reply')).toHaveTextContent('Ben: rough night lol');
  expect(screen.queryByTestId('composer-reply')).toBeNull();
  fireEvent(screen.getByTestId('message-m1'), 'longPress');
  expect(screen.queryByTestId('message-report')).toBeNull();
  await act(async () => fireEvent.press(screen.getByTestId('message-unsend')));
  expect(unsendMessage).toHaveBeenCalledWith('ben', 'm1');
  expect(screen.queryByTestId('message-m1')).toBeNull();
  // Report (theirs only): the owner-approved sheet. Spam is picked and block unticked to start with.
  fireEvent(screen.getByTestId('message-t1'), 'longPress');
  fireEvent.press(screen.getByTestId('message-report'));
  expect(screen.getByTestId('report-spam')).toBeChecked();
  expect(screen.getByTestId('report-block')).not.toBeChecked();
  fireEvent.press(screen.getByTestId('report-harassment'));
  fireEvent.press(screen.getByTestId('report-block'));
  expect(screen.getByTestId('report-harassment')).toBeChecked();
  expect(screen.getByTestId('report-spam')).not.toBeChecked();
  expect(screen.getByTestId('report-block')).toBeChecked();
  await act(async () => fireEvent.press(screen.getByTestId('report-submit')));
  expect(fileReport).toHaveBeenCalledWith('message', 't1', 'harassment');
  // Ticked: blocked once the report is filed (no second dialog), then back out of the thread.
  expect(alert).not.toHaveBeenCalled();
  expect(blockBuddy).toHaveBeenCalledWith('ben');
  expect((blockBuddy as jest.Mock).mock.invocationCallOrder[0]).toBeGreaterThan((fileReport as jest.Mock).mock.invocationCallOrder[0]!);
  expect(mockGoBack).toHaveBeenCalled();
  alert.mockRestore();
});

it('the report sheet: Cancel files nothing; Report without the tick files the picked reason and does not block', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1', { text: 'rough night lol' })]));
  renderScreen();
  fireEvent(await screen.findByTestId('message-t1'), 'longPress');
  fireEvent.press(screen.getByTestId('message-report'));
  expect(screen.getByTestId('report-sheet')).toHaveTextContent(/Report message.*Ben won't be told\. Reports are kept for review\..*Spam.*Harassment.*Something else.*Also block Ben/);
  fireEvent.press(screen.getByTestId('report-other'));
  fireEvent.press(screen.getByTestId('report-cancel'));
  expect(screen.queryByTestId('report-sheet')).toBeNull();
  expect(fileReport).not.toHaveBeenCalled();
  // Opened again: it starts fresh (Spam picked).
  fireEvent(screen.getByTestId('message-t1'), 'longPress');
  fireEvent.press(screen.getByTestId('message-report'));
  expect(screen.getByTestId('report-spam')).toBeChecked();
  fireEvent.press(screen.getByTestId('report-other'));
  await act(async () => fireEvent.press(screen.getByTestId('report-submit')));
  expect(fileReport).toHaveBeenCalledWith('message', 't1', 'other');
  expect(screen.queryByTestId('report-sheet')).toBeNull();
  expect(blockBuddy).not.toHaveBeenCalled();
  expect(mockGoBack).not.toHaveBeenCalled();
});

it('a report that fails says why and blocks no one, even when ticked', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  (fileReport as jest.Mock).mockRejectedValueOnce(new ApiError(404, 'x', 'report_target_gone'));
  renderScreen();
  fireEvent(await screen.findByTestId('message-t1'), 'longPress');
  fireEvent.press(screen.getByTestId('message-report'));
  fireEvent.press(screen.getByTestId('report-block'));
  await act(async () => fireEvent.press(screen.getByTestId('report-submit')));
  expect(screen.getByTestId('report-error')).toBeTruthy();
  expect(screen.getByTestId('report-sheet')).toBeTruthy();
  expect(blockBuddy).not.toHaveBeenCalled();
});

// Final review M2: while a report is in flight the sheet can't be dismissed (backdrop, Android back, drag), so a
// ticked block can never run after the person closed the sheet; the flow then completes as usual.
it('a report in flight ignores a dismissal; once filed, the ticked block runs as usual', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  let file: () => void = () => undefined;
  (fileReport as jest.Mock).mockImplementationOnce(() => new Promise<void>((resolve) => { file = resolve; }));
  renderScreen();
  fireEvent(await screen.findByTestId('message-t1'), 'longPress');
  fireEvent.press(screen.getByTestId('message-report'));
  // The rows are named for screen readers by their text.
  expect(screen.getByLabelText('Harassment')).toBe(screen.getByTestId('report-harassment'));
  fireEvent.press(screen.getByLabelText('Also block Ben'));
  fireEvent.press(screen.getByTestId('report-submit'));
  fireEvent.press(screen.getByTestId('report-sheet-backdrop'));
  await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
  expect(screen.getByTestId('report-sheet')).toBeTruthy();
  expect(blockBuddy).not.toHaveBeenCalled();
  await act(async () => file());
  expect(blockBuddy).toHaveBeenCalledWith('ben');
  expect(mockGoBack).toHaveBeenCalled();
});

// Final review M3: a push or a navigate to the open thread without a quote keeps the one I staged.
it('opening the thread again without a quote keeps the staged one; a new quote replaces it', async () => {
  mockParams = { buddyId: 'ben', quote: { request: { type: 'note' }, label: "Ben's note" } };
  (fetchThread as jest.Mock).mockResolvedValue(thread([]));
  const view = renderScreen();
  expect(await screen.findByTestId('composer-quote')).toHaveTextContent("Replying to Ben's note");
  mockParams = { buddyId: 'ben' };
  view.rerender(<SafeAreaProvider initialMetrics={metrics}><ChatThreadScreen /></SafeAreaProvider>);
  expect(screen.getByTestId('composer-quote')).toHaveTextContent("Replying to Ben's note");
  mockParams = { buddyId: 'ben', quote: { request: { type: 'camp_note' }, label: "Ben's camp note" } };
  view.rerender(<SafeAreaProvider initialMetrics={metrics}><ChatThreadScreen /></SafeAreaProvider>);
  expect(screen.getByTestId('composer-quote')).toHaveTextContent("Replying to Ben's camp note");
});

it('re-reads the newest page every 5 seconds: a new message shows and is marked read; then "no longer buddies"', async () => {
  jest.useFakeTimers();
  (fetchThread as jest.Mock)
    .mockResolvedValueOnce(thread([msg('t1')]))
    .mockResolvedValueOnce(thread([msg('t1'), msg('t2', { text: 'you up?', createdAt: T(9, 5) })]))
    .mockRejectedValueOnce(new ApiError(403, 'x', 'not_buddies'));
  renderScreen();
  expect(await screen.findByTestId('message-t1')).toBeTruthy();
  expect(markChatRead).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(await screen.findByTestId('message-t2-text')).toHaveTextContent('you up?');
  expect(markChatRead).toHaveBeenCalledTimes(2);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(await screen.findByTestId('thread-gone')).toHaveTextContent("You're no longer buddies.");
  // The poll stops there (plan ruling P2).
  expect(fetchThread).toHaveBeenCalledTimes(3);
  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(fetchThread).toHaveBeenCalledTimes(3);
  jest.useRealTimers();
});

it('an older server says chats are not here yet and offers their week', async () => {
  (fetchThread as jest.Mock).mockResolvedValueOnce(null);
  renderScreen();
  expect(await screen.findByTestId('thread-unavailable')).toHaveTextContent("Chats aren't available yet.");
  fireEvent.press(screen.getByTestId('thread-open-week'));
  expect(mockReplace).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'ben' });
});

it('does not poll a server without chats (plan ruling P2)', async () => {
  jest.useFakeTimers();
  (fetchThread as jest.Mock).mockResolvedValue(null);
  renderScreen();
  expect(await screen.findByTestId('thread-unavailable')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(fetchThread).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

it('a refused send that says "no longer buddies" stops the poll too', async () => {
  jest.useFakeTimers();
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  (sendText as jest.Mock).mockRejectedValueOnce(new ApiError(403, 'x', 'not_buddies'));
  renderScreen();
  fireEvent.changeText(await screen.findByTestId('composer-input'), 'hi');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(screen.getByTestId('thread-gone')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(fetchThread).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

it('polls only while the app is active: the background stops it, coming back reads at once and resumes', async () => {
  jest.useFakeTimers();
  let onChange: ((s: string) => void) | undefined;
  // Once: the next screens get the default listener back.
  jest.spyOn(AppState, 'addEventListener').mockImplementationOnce((_type, fn) => {
    onChange = fn as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  renderScreen();
  expect(await screen.findByTestId('message-t1')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(fetchThread).toHaveBeenCalledTimes(2);
  await act(async () => onChange!('background'));
  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(fetchThread).toHaveBeenCalledTimes(2);
  await act(async () => onChange!('active'));
  expect(fetchThread).toHaveBeenCalledTimes(3);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(fetchThread).toHaveBeenCalledTimes(4);
  jest.useRealTimers();
});

it('a poll that was in flight when I sent does not hide the message I just sent', async () => {
  jest.useFakeTimers();
  let answerPoll: (t: Thread) => void = () => undefined;
  (fetchThread as jest.Mock)
    .mockResolvedValueOnce(thread([msg('t1')]))
    .mockImplementationOnce(() => new Promise<Thread>((resolve) => { answerPoll = resolve; }))
    .mockResolvedValueOnce(thread([msg('t1'), msg('n1', { mine: true, text: 'hi', createdAt: T(10) })]));
  (sendText as jest.Mock).mockResolvedValueOnce({ message: msg('n1', { mine: true, text: 'hi', createdAt: T(10) }) });
  renderScreen();
  expect(await screen.findByTestId('message-t1')).toBeTruthy();
  // The poll leaves before the send and answers after it, without the new message.
  await act(async () => { jest.advanceTimersByTime(5000); });
  fireEvent.changeText(screen.getByTestId('composer-input'), 'hi');
  await act(async () => fireEvent.press(screen.getByTestId('composer-send')));
  expect(screen.getByTestId('message-n1-text')).toHaveTextContent('hi');
  await act(async () => answerPoll(thread([msg('t1')])));
  expect(screen.getByTestId('message-n1-text')).toHaveTextContent('hi');
  // The next poll reads it from the server.
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(fetchThread).toHaveBeenCalledTimes(3);
  expect(screen.getByTestId('message-n1-text')).toHaveTextContent('hi');
  jest.useRealTimers();
});

it('"Seen" comes from the newest page only: an older page\'s seenAt is ignored', async () => {
  (fetchThread as jest.Mock)
    .mockResolvedValueOnce(thread([msg('m2', { mine: true, text: 'later', createdAt: T(9, 30) })], { nextBefore: 'cursor-1', seenAt: null }))
    .mockResolvedValueOnce(thread([msg('m1', { mine: true, text: 'earlier', createdAt: T(9) })], { nextBefore: null, seenAt: T(9, 30) }));
  renderScreen();
  expect(await screen.findByTestId('message-m2')).toBeTruthy();
  await act(async () => fireEvent(screen.getByTestId('thread-list'), 'endReached'));
  expect(fetchThread).toHaveBeenLastCalledWith('ben', 'cursor-1');
  expect(screen.getByTestId('message-m1-text')).toHaveTextContent('earlier');
  expect(screen.queryByTestId('thread-seen')).toBeNull();
});

it('a card its author no longer shares says so; a reply to an unsent message says it was unsent', async () => {
  (fetchThread as jest.Mock).mockResolvedValue(thread([
    msg('b1', { kind: 'CARD', text: 'nice', card: { type: 'badge', available: false, family: 'SLEEP_GOAL' } }),
    msg('r1', { mine: true, text: 'ok', replyTo: { id: 'x1', gone: true }, createdAt: T(9, 1) }),
  ]));
  renderScreen();
  expect(await screen.findByTestId('message-b1-card')).toHaveTextContent(/No longer shared/);
  expect(screen.getByTestId('message-r1-reply')).toHaveTextContent('Message unsent');
});

it('a read that answers after the app went to the background marks nothing read; back in view, it does', async () => {
  jest.useFakeTimers();
  let onChange: ((s: string) => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementationOnce((_type, fn) => {
    onChange = fn as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
  let answerPoll: (t: Thread) => void = () => undefined;
  const withNew = thread([msg('t1'), msg('t2', { text: 'you up?', createdAt: T(9, 5) })]);
  (fetchThread as jest.Mock)
    .mockResolvedValueOnce(thread([msg('t1')]))
    .mockImplementationOnce(() => new Promise<Thread>((resolve) => { answerPoll = resolve; }))
    .mockResolvedValue(withNew);
  renderScreen();
  expect(await screen.findByTestId('message-t1')).toBeTruthy();
  expect(markChatRead).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(5000); });
  AppState.currentState = 'background';
  await act(async () => onChange!('background'));
  await act(async () => answerPoll(withNew));
  expect(screen.getByTestId('message-t2-text')).toHaveTextContent('you up?');
  expect(markChatRead).toHaveBeenCalledTimes(1);
  AppState.currentState = 'active';
  await act(async () => onChange!('active'));
  expect(markChatRead).toHaveBeenCalledTimes(2);
});

it('a failed mark-read is tried again by the next read', async () => {
  jest.useFakeTimers();
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  (markChatRead as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  renderScreen();
  expect(await screen.findByTestId('message-t1')).toBeTruthy();
  expect(markChatRead).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(markChatRead).toHaveBeenCalledTimes(2);
  // That one went through: nothing new, nothing more to mark.
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(fetchThread).toHaveBeenCalledTimes(3);
  expect(markChatRead).toHaveBeenCalledTimes(2);
});

it('an older page fetched before an unsend cannot bring the unsent message back', async () => {
  let answerOlder: (t: Thread) => void = () => undefined;
  (fetchThread as jest.Mock)
    .mockResolvedValueOnce(thread([msg('m1', { mine: true, text: 'oops' }), msg('t2', { createdAt: T(9, 5) })], { nextBefore: 'c1' }))
    .mockImplementationOnce(() => new Promise<Thread>((resolve) => { answerOlder = resolve; }))
    .mockResolvedValueOnce(thread([msg('t0', { createdAt: T(8) })], { nextBefore: null }));
  renderScreen();
  expect(await screen.findByTestId('message-m1')).toBeTruthy();
  await act(async () => fireEvent(screen.getByTestId('thread-list'), 'endReached'));
  expect(fetchThread).toHaveBeenLastCalledWith('ben', 'c1');
  fireEvent(screen.getByTestId('message-m1'), 'longPress');
  await act(async () => fireEvent.press(screen.getByTestId('message-unsend')));
  expect(screen.queryByTestId('message-m1')).toBeNull();
  // The older page overlaps the window and still holds the message as it was before the unsend: dropped.
  await act(async () => answerOlder(thread([msg('t0', { createdAt: T(8) }), msg('m1', { mine: true, text: 'oops' })], { nextBefore: null })));
  expect(screen.queryByTestId('message-m1')).toBeNull();
  // The next scroll to the top reads it again.
  await act(async () => fireEvent(screen.getByTestId('thread-list'), 'endReached'));
  expect(fetchThread).toHaveBeenCalledTimes(3);
  expect(screen.getByTestId('message-t0')).toBeTruthy();
  expect(screen.queryByTestId('message-m1')).toBeNull();
});

it('leaving the screen stops the poll', async () => {
  jest.useFakeTimers();
  (fetchThread as jest.Mock).mockResolvedValue(thread([msg('t1')]));
  const view = renderScreen();
  expect(await screen.findByTestId('message-t1')).toBeTruthy();
  view.unmount();
  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(fetchThread).toHaveBeenCalledTimes(1);
});

it('a failed first load offers a retry; a message this app cannot draw is skipped', async () => {
  (fetchThread as jest.Mock)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(thread([msg('t1'), msg('v1', { kind: 'VOICE' as never, text: null })]));
  renderScreen();
  const retry = await screen.findByTestId('thread-retry');
  await act(async () => fireEvent.press(retry));
  expect(await screen.findByTestId('message-t1')).toBeTruthy();
  expect(screen.queryByTestId('message-v1')).toBeNull();
});
