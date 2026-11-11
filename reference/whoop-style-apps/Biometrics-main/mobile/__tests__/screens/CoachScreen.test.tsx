import React from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet } from 'react-native';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import { CoachScreen } from '../../src/screens/CoachScreen';
import { useKeyboardVisible } from '../../src/lib/useKeyboardVisible';
import { FLOATING_BAR_HEIGHT, FLOATING_BAR_MARGIN } from '../../src/navigation/tabBarLayout';
import {
  CoachConsentRequiredError,
  CoachDisabledError,
  CoachTimeoutError,
  deleteCoachMemory,
  fetchCoachStatus,
  fetchConversation,
  fetchLatestConversation,
  fetchTodaySummary,
  listConversations,
  StaleConversationError,
  type CoachStatusDTO,
  type MemoryDTO,
  type TodaySummaryDTO,
} from '../../src/api/coach';
import { streamCoachMessage } from '../../src/api/coachStream';
import { answer, doneEvent, openTurn, scriptTurn } from '../../jest-mocks/coachStreamFake';
import { withCharacter } from '../../jest-mocks/characterContext';
import type { ThinkingTextId } from '../../src/components/characters/thinking';
import { GENERAL_QUESTIONS, suggestedQuestions } from '../../src/lib/coachToday';
import { followUpsFor } from '../../src/lib/coachAnswers';
import { DIALOG_INK, DIALOG_TEXT_CLASS } from '../../src/components/coach/thinking/Dialog';
import { FONTS } from '../../src/theme';

jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  fetchCoachStatus: jest.fn(),
  fetchLatestConversation: jest.fn(),
  fetchTodaySummary: jest.fn(),
  fetchConversation: jest.fn(),
  listConversations: jest.fn(),
  deleteCoachMemory: jest.fn(),
}));
jest.mock('../../src/api/coachStream', () => ({
  ...jest.requireActual('../../src/api/coachStream'),
  streamCoachMessage: jest.fn(),
}));
jest.mock('../../src/lib/useKeyboardVisible', () => ({ useKeyboardVisible: jest.fn(() => false) }));

const mockNavigate = jest.fn();
const mockSetParams = jest.fn();
let mockFocusListener: (() => void) | undefined;
let mockParams: unknown;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    setParams: mockSetParams,
    goBack: jest.fn(),
    addListener: (_event: string, cb: () => void) => {
      mockFocusListener = cb;
      return () => {
        mockFocusListener = undefined;
      };
    },
  }),
  useRoute: () => ({ params: mockParams }),
}));

const stream = streamCoachMessage as jest.Mock;

const status: CoachStatusDTO = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'kit',
  personaChosen: true,
  personas: [],
};

const today: TodaySummaryDTO = {
  date: '2026-09-30',
  hasData: true,
  sentence: { text: "Recovery's 26, about half your usual.", spans: [{ text: "Recovery's " }, { text: '26', metric: 'recovery' }, { text: ', about half your usual.' }], source: 'template' },
  bars: [
    { metric: 'recovery', label: 'Recovery', value: 26, usual: 58, unit: 'score', display: '26', usualDisplay: '58', status: 'below', scaleMax: 100 },
    { metric: 'sleep', label: 'Sleep', value: 408, usual: 433, unit: 'minutes', display: '6h 48m', usualDisplay: '7h 13m', status: 'near', scaleMax: 606 },
    { metric: 'hrv', label: 'HRV', value: 41, usual: 52, unit: 'ms', display: '41', usualDisplay: '52', status: 'below', scaleMax: 72.8 },
    { metric: 'rhr', label: 'Rest HR', value: 58, usual: 58, unit: 'bpm', display: '58', usualDisplay: '58', status: 'near', scaleMax: 81.2 },
  ],
};

const CARD = {
  headline: 'Decent night, broken after 4am',
  tiles: [{ factId: 'sleep.total', label: 'total', display: '6h 48m', value: 408, usual: 433, status: 'below' as const }],
  source: 'Sleep · last night vs your 30-day usual',
};
// The chips the device picks for CARD after "How did I sleep?" (R37: from the lib, not hard-coded).
const SLEEP_FOLLOW_UP = followUpsFor(CARD, 'How did I sleep?')[0]!;
const PROPOSAL: MemoryDTO = { id: 'm1', category: 'SCHEDULE', value: 'Trains at 6am', status: 'PENDING', createdAt: '2026-09-20T00:00:00.000Z' };
const SAFETY = { type: 'safety' as const, text: "I'm really sorry you're feeling this way.", resources: ['Call or text 988 (US)', 'Text HOME to 741741'] };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function openChat(thinkingText?: ThinkingTextId) {
  // No CharacterProvider by default (Mochi, the steps thinking text).
  const utils = render(thinkingText ? withCharacter(<CoachScreen />, { thinkingText }) : <CoachScreen />);
  await utils.findByTestId('coach-input');
  return utils;
}

async function ask(utils: ReturnType<typeof render>, text: string) {
  fireEvent.changeText(utils.getByTestId('coach-input'), text);
  await act(async () => {
    fireEvent.press(utils.getByTestId('coach-send-button'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  stream.mockReset();
  mockParams = undefined;
  mockFocusListener = undefined;
  (useKeyboardVisible as jest.Mock).mockReturnValue(false);
  (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
  (fetchLatestConversation as jest.Mock).mockResolvedValue({ conversationId: null, messages: [] });
  (fetchTodaySummary as jest.Mock).mockResolvedValue(today);
  (listConversations as jest.Mock).mockResolvedValue([]);
  (deleteCoachMemory as jest.Mock).mockResolvedValue(undefined);
});

describe('CoachScreen: gating', () => {
  it('sends a not-yet-consented user to the consent screen, keeping the prefill', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, consented: false });
    mockParams = { prefill: 'Why did my score change today?' };
    render(<CoachScreen />);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('CoachConsent', { prefill: 'Why did my score change today?' }));
    expect(fetchLatestConversation).not.toHaveBeenCalled();
    expect(fetchTodaySummary).not.toHaveBeenCalled();
  });

  it('shows a review card, instead of bouncing back to consent, when the user returns without agreeing', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, consented: false });
    const { findByTestId, queryByTestId } = render(<CoachScreen />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));

    await act(async () => {
      mockFocusListener?.();
    });

    expect(await findByTestId('coach-needs-consent')).toBeTruthy();
    // No bounce: returning without agreeing does not navigate to consent again.
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(queryByTestId('coach-input')).toBeNull();
    fireEvent.press(await findByTestId('coach-review-consent-button'));
    expect(mockNavigate).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenLastCalledWith('CoachConsent', { prefill: undefined });
  });

  it('reloads when the tab regains focus after the user agreed', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, consented: false });
    const { findByTestId } = render(<CoachScreen />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));

    (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
    await act(async () => {
      mockFocusListener?.();
    });

    expect(await findByTestId('coach-input')).toBeTruthy();
  });

  it('does not lose a focus that fires during the first load: the stale result is discarded and one fresh load runs', async () => {
    const first = deferred<CoachStatusDTO>();
    (fetchCoachStatus as jest.Mock).mockReturnValueOnce(first.promise).mockResolvedValue(status);
    const { findByTestId } = render(<CoachScreen />);

    await act(async () => {
      mockFocusListener?.();
    });
    await act(async () => {
      first.resolve({ ...status, consented: false });
    });

    expect(await findByTestId('coach-input')).toBeTruthy();
    expect(fetchCoachStatus).toHaveBeenCalledTimes(2);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('keeps a live safety card, re-reads today but not the history, when the tab regains focus', async () => {
    scriptTurn(stream, [SAFETY, doneEvent()]);
    const utils = await openChat();
    await ask(utils, 'I feel awful');
    await utils.findByTestId('coach-safety-resources');

    await act(async () => {
      mockFocusListener?.();
    });

    expect(fetchLatestConversation).toHaveBeenCalledTimes(1);
    expect(fetchTodaySummary).toHaveBeenCalledTimes(2);
    expect(utils.getByTestId('coach-safety-resources')).toBeTruthy();
    expect(utils.getByText('I feel awful')).toBeTruthy();
  });

  it('opens the chat when the first history load fails, then retries it on the next focus and continues that conversation', async () => {
    (fetchLatestConversation as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      conversationId: 'conv-9',
      messages: [{ id: 'h1', role: 'assistant', text: 'Earlier answer', source: 'model', createdAt: '2026-09-19T10:00:00.000Z' }],
    });
    const utils = await openChat();
    expect(utils.queryByText('Earlier answer')).toBeNull();

    await act(async () => {
      mockFocusListener?.();
    });

    expect(await utils.findByText('Earlier answer')).toBeTruthy();
    scriptTurn(stream, answer('Next answer'));
    await ask(utils, 'And now?');
    expect(stream).toHaveBeenCalledWith({ message: 'And now?', conversationId: 'conv-9' }, expect.any(Function), expect.any(Object));
  });

  it('does not let a focus reload wipe a question whose answer is still streaming', async () => {
    (fetchLatestConversation as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const live = openTurn(stream);
    const utils = await openChat();
    await ask(utils, 'Hello');

    await act(async () => {
      mockFocusListener?.();
    });

    expect(fetchLatestConversation).toHaveBeenCalledTimes(1);
    await live.finish(...answer('Fresh answer'));
    expect(await utils.findByText('Fresh answer')).toBeTruthy();
    expect(utils.getByText('Hello')).toBeTruthy();
  });

  it('consumes a prefill param once applied, and fills the input again when the same text re-arrives', async () => {
    mockParams = { prefill: 'Why did my score change today?' };
    const utils = await openChat();
    expect(utils.getByTestId('coach-input').props.value).toBe('Why did my score change today?');
    expect(mockSetParams).toHaveBeenCalledWith({ prefill: undefined });
    expect(stream).not.toHaveBeenCalled();

    fireEvent.changeText(utils.getByTestId('coach-input'), '');
    mockParams = undefined;
    utils.rerender(<CoachScreen />);
    mockParams = { prefill: 'Why did my score change today?' };
    utils.rerender(<CoachScreen />);
    expect(utils.getByTestId('coach-input').props.value).toBe('Why did my score change today?');
  });

  it('still carries the prefill to the consent screen from the review card after the param was consumed', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, consented: false });
    mockParams = { prefill: 'Why did my score change today?' };
    const utils = render(<CoachScreen />);
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    mockParams = undefined;
    utils.rerender(<CoachScreen />);

    await act(async () => {
      mockFocusListener?.();
    });
    fireEvent.press(await utils.findByTestId('coach-review-consent-button'));

    expect(mockNavigate).toHaveBeenLastCalledWith('CoachConsent', { prefill: 'Why did my score change today?' });
  });

  it('shows no chat UI at all when the coach is disabled', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, enabled: false });
    const { findByTestId, queryByTestId } = render(<CoachScreen />);

    await findByTestId('coach-unavailable');
    expect(queryByTestId('coach-input')).toBeNull();
    expect(fetchLatestConversation).not.toHaveBeenCalled();
  });

  it('says so when the status check could not be completed, still lets you send, and hides the header actions', async () => {
    (fetchCoachStatus as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const utils = render(<CoachScreen />);

    expect(await utils.findByTestId('coach-status-unverified')).toBeTruthy();
    expect(utils.getByTestId('coach-input')).toBeTruthy();
    expect(utils.queryByTestId('coach-conversations-button')).toBeNull();
    expect(utils.queryByTestId('coach-new-chat-button')).toBeNull();
  });
});

describe('CoachScreen: status unverified', () => {
  it('clears the "couldn\'t check" line and shows the header actions once an answer gets through', async () => {
    (fetchCoachStatus as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    scriptTurn(stream, answer('Hi.'));
    const utils = render(<CoachScreen />);
    await utils.findByTestId('coach-status-unverified');

    await ask(utils, 'Hello');

    expect(await utils.findByText('Hi.')).toBeTruthy();
    expect(utils.queryByTestId('coach-status-unverified')).toBeNull();
    expect(utils.getByTestId('coach-conversations-button')).toBeTruthy();
    expect(utils.getByTestId('coach-new-chat-button')).toBeTruthy();
  });

  it('keeps the line after a failed send', async () => {
    (fetchCoachStatus as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    scriptTurn(stream, [], new Error('offline'));
    const utils = render(<CoachScreen />);
    await utils.findByTestId('coach-status-unverified');

    await ask(utils, 'Hello');

    expect(await utils.findByTestId('coach-error')).toBeTruthy();
    expect(utils.getByTestId('coach-status-unverified')).toBeTruthy();
  });
});

describe('CoachScreen: the one disclaimer', () => {
  const pending = new Promise<TodaySummaryDTO>(() => {});
  it.each([
    ['with no data yet', () => (fetchTodaySummary as jest.Mock).mockResolvedValue({ date: '2026-09-30', hasData: false, sentence: null, bars: [] })],
    ['when the summary has nothing to compare', () => (fetchTodaySummary as jest.Mock).mockResolvedValue({ date: '2026-09-30', hasData: true, sentence: null, bars: [] })],
    ['when the summary fails', () => (fetchTodaySummary as jest.Mock).mockRejectedValue(new Error('offline'))],
    ['while the summary loads', () => (fetchTodaySummary as jest.Mock).mockReturnValue(pending)],
    ['when the status is unverified and the summary fails', () => {
      (fetchCoachStatus as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      (fetchTodaySummary as jest.Mock).mockRejectedValue(new Error('offline'));
    }],
    ['beside the summary', () => undefined],
  ])('shows exactly one "not medical advice" footnote %s', async (_name, arrange) => {
    arrange();
    const utils = render(<CoachScreen />);
    await utils.findByTestId('coach-input');
    await act(async () => {});

    expect(utils.getAllByTestId('coach-today-footnote')).toHaveLength(1);
    expect(utils.getByTestId('coach-today-footnote')).toHaveTextContent(/not medical advice/);
  });
});

describe('CoachScreen: scrolling', () => {
  let scrollToEnd: jest.SpyInstance;
  beforeEach(() => {
    scrollToEnd = jest.spyOn(ScrollView.prototype as unknown as { scrollToEnd: () => void }, 'scrollToEnd');
    scrollToEnd.mockClear();
  });
  afterEach(() => scrollToEnd.mockRestore());

  const scroller = (utils: ReturnType<typeof render>) => utils.getByTestId('coach-scroll');
  const grow = (utils: ReturnType<typeof render>) => fireEvent(scroller(utils), 'contentSizeChange', 390, 2000);
  const dragTo = (utils: ReturnType<typeof render>, y: number) => {
    fireEvent(scroller(utils), 'scrollBeginDrag');
    fireEvent(scroller(utils), 'scrollEndDrag', {
      nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 390, height: 2000 }, layoutMeasurement: { width: 390, height: 600 } },
    });
  };

  it('opens a restored conversation at the top, with today in view', async () => {
    (fetchLatestConversation as jest.Mock).mockResolvedValue({
      conversationId: 'conv-1',
      messages: [{ id: 'h1', role: 'assistant', text: 'Earlier answer', source: 'model', createdAt: 't' }],
    });
    const utils = await openChat();
    await utils.findByText('Earlier answer');

    grow(utils);

    expect(scrollToEnd).not.toHaveBeenCalled();
  });

  it('follows a new answer to the end, but not once the reader scrolls up, and again once they are back at the bottom', async () => {
    const live = openTurn(stream);
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');
    grow(utils);
    expect(scrollToEnd).toHaveBeenCalledTimes(1);

    dragTo(utils, 200);
    await live.emit({ type: 'text', sentence: 'Mostly clear skies.' });
    grow(utils);
    expect(scrollToEnd).toHaveBeenCalledTimes(1);

    dragTo(utils, 1350);
    await live.emit({ type: 'text', sentence: 'The cloud was the early wake-ups.' });
    grow(utils);
    expect(scrollToEnd).toHaveBeenCalledTimes(2);
  });

  it('jumps to the end on send even when the reader had scrolled up', async () => {
    scriptTurn(stream, answer('One.'));
    scriptTurn(stream, answer('Two.'));
    const utils = await openChat();
    await ask(utils, 'First');
    dragTo(utils, 0);
    scrollToEnd.mockClear();

    await ask(utils, 'Second');
    grow(utils);

    expect(scrollToEnd).toHaveBeenCalled();
  });
});

describe('CoachScreen: today and suggestions', () => {
  it('leads with the today summary and one footnote, then questions picked from it', async () => {
    const utils = await openChat();

    expect(await utils.findByTestId('coach-today-sentence')).toHaveTextContent("Recovery's 26, about half your usual.");
    expect(utils.getAllByTestId('coach-today-footnote')).toHaveLength(1);
    expect(utils.getByTestId('coach-empty')).toHaveTextContent(/What would you like to know\?/);
    expect(utils.getByTestId('coach-suggestion-0')).toHaveTextContent(/^Why is my recovery lower than usual today\?/);
    expect(utils.getByTestId('coach-suggestion-1')).toHaveTextContent(/^Why is my HRV lower than usual today\?/);
    suggestedQuestions(today).forEach((question, i) => expect(utils.getByTestId(`coach-suggestion-${i}`)).toHaveTextContent(question, { exact: false }));
  });

  it('asks about a bar when it is tapped, and a suggestion sends as-is leaving the field alone', async () => {
    scriptTurn(stream, answer('Mostly the short night.'));
    scriptTurn(stream, answer('Keep it light.'));
    const utils = await openChat();
    fireEvent.changeText(utils.getByTestId('coach-input'), 'half-written');

    const bar = await utils.findByTestId('today-bar-recovery');
    await act(async () => {
      fireEvent.press(bar);
    });
    expect(stream).toHaveBeenLastCalledWith({ message: 'Why is my recovery lower than usual today?' }, expect.any(Function), expect.any(Object));
    expect(utils.queryByTestId('coach-suggestion-0')).toBeNull();

    await act(async () => {
      fireEvent.press(utils.getByTestId('today-bar-hrv'));
    });
    expect(await utils.findByText('Keep it light.')).toBeTruthy();
    expect(utils.getByTestId('coach-input').props.value).toBe('half-written');
  });

  it('keeps the chat usable when the summary cannot load', async () => {
    (fetchTodaySummary as jest.Mock).mockRejectedValue(new Error('offline'));
    const utils = await openChat();

    await waitFor(() => expect(utils.queryByTestId('coach-today-loading')).toBeNull());
    expect(utils.queryByTestId('coach-today')).toBeNull();
    expect(utils.getByTestId('coach-suggestion-0')).toHaveTextContent(GENERAL_QUESTIONS[0]!, { exact: false });
  });

  it("names the character in the composer's placeholder", async () => {
    const utils = await openChat();

    expect(utils.getByTestId('coach-input').props.placeholder).toBe('Ask Mochi anything…');
  });
});

describe('CoachScreen: streamed answers', () => {
  it('shows the thinking row while waiting, then the answer as it arrives, then its card and follow-ups', async () => {
    const live = openTurn(stream);
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');

    expect(utils.getByText('How did I sleep?')).toBeTruthy();
    expect(utils.getByTestId('coach-input').props.value).toBe('');
    // Steps (the default) shows a personality line until the first status arrives.
    expect(utils.getByTestId('coach-thinking')).toHaveTextContent(/Mochi is mulling it over/);
    await live.emit({ type: 'status', label: 'Looking at your sleep…' });
    expect(utils.getByTestId('coach-thinking')).toHaveTextContent(/Looking at your sleep…/);
    expect(utils.getByTestId('thinking-step-status-active')).toBeTruthy();
    expect(utils.queryByTestId('chat-bubble-assistant')).toBeNull();

    await live.emit({ type: 'text', sentence: 'Mostly clear skies.' });
    // The ticked step stays up for 300 ms beside the first sentence, then goes.
    expect(utils.getByTestId('thinking-step-status-done')).toBeTruthy();
    // A real 300 ms timer: give it headroom when the whole suite loads the machine.
    await waitFor(() => expect(utils.queryByTestId('coach-thinking')).toBeNull(), { timeout: 3000 });
    expect(utils.getByTestId('chat-bubble-assistant')).toHaveTextContent('Mostly clear skies.');
    await live.emit({ type: 'text', sentence: 'The cloud was the early wake-ups.' });
    expect(utils.getByTestId('chat-bubble-assistant')).toHaveTextContent('Mostly clear skies. The cloud was the early wake-ups.');
    expect(utils.queryByTestId('follow-up-chips')).toBeNull();

    await live.finish({ type: 'card', card: CARD }, doneEvent());

    expect(utils.getByTestId('answer-card')).toHaveTextContent(/Decent night, broken after 4am/);
    expect(utils.getByTestId('follow-up-0')).toHaveTextContent(SLEEP_FOLLOW_UP);
    expect(utils.getAllByTestId('coach-today-footnote')).toHaveLength(1);
  });

  it('turns send into stop while streaming: stopping keeps the partial answer, marked "Stopped"', async () => {
    const live = openTurn(stream);
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');
    await live.emit({ type: 'text', sentence: 'Mostly clear skies.' });

    expect(utils.getByTestId('coach-send-button').props.accessibilityLabel).toBe('Stop');
    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-send-button'));
    });

    expect(live.signal?.aborted).toBe(true);
    expect(utils.getByText('Mostly clear skies.')).toBeTruthy();
    expect(utils.getByText('Stopped')).toBeTruthy();
    expect(utils.queryByTestId('coach-error')).toBeNull();
    expect(utils.queryByTestId('follow-up-chips')).toBeNull();
    expect(utils.getByTestId('coach-send-button').props.accessibilityLabel).toBe('Send');
  });

  it('sends a follow-up chip, continuing the conversation', async () => {
    scriptTurn(stream, [{ type: 'text', sentence: 'Mostly clear.' }, { type: 'card', card: CARD }, doneEvent({ conversationId: 'conv-1' })]);
    scriptTurn(stream, answer('Cooler room.'));
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');

    const chip = await utils.findByTestId('follow-up-0');
    await act(async () => {
      fireEvent.press(chip);
    });

    expect(stream).toHaveBeenLastCalledWith({ message: SLEEP_FOLLOW_UP, conversationId: 'conv-1' }, expect.any(Function), expect.any(Object));
    expect(await utils.findByText('Cooler room.')).toBeTruthy();
  });

  it("opens the card's source screen for the summary's day", async () => {
    scriptTurn(stream, [{ type: 'text', sentence: 'Mostly clear.' }, { type: 'card', card: CARD }, doneEvent()]);
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');

    fireEvent.press(await utils.findByTestId('answer-source'));

    expect(mockNavigate).toHaveBeenCalledWith('Sleep', { date: '2026-09-30' });
  });

  it('shows the memory the coach proposed, and undo deletes it', async () => {
    scriptTurn(stream, [{ type: 'text', sentence: 'Got it, mornings then.' }, { type: 'memory', proposals: [PROPOSAL] }, doneEvent()]);
    const utils = await openChat();
    await ask(utils, 'I train at 6am');

    expect(await utils.findByTestId('memory-chip-m1')).toHaveTextContent("I'll remember: Trains at 6am");
    fireEvent.press(utils.getByTestId('memory-chip-undo-m1'));
    await waitFor(() => expect(deleteCoachMemory).toHaveBeenCalledWith('m1'));
  });

  it('notes an answer the on-device model wrote for a user who chose Claude', async () => {
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ ...status, engine: 'hosted' });
    scriptTurn(stream, answer('Hi.', { engine: 'local', messageId: 'a-local' }));
    const utils = await openChat();
    await ask(utils, 'Hello');

    expect(await utils.findByTestId('coach-local-note-a-local')).toHaveTextContent('Answered by the on-device model');
  });

  it('shows follow-ups only under the latest finished answer', async () => {
    scriptTurn(stream, [{ type: 'text', sentence: 'Mostly clear.' }, { type: 'card', card: CARD }, doneEvent()]);
    scriptTurn(stream, answer('HRV is a measure of beat-to-beat variation.'));
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');
    expect(await utils.findByTestId('follow-up-chips')).toBeTruthy();

    await ask(utils, 'What is HRV?');

    expect(await utils.findByText('HRV is a measure of beat-to-beat variation.')).toBeTruthy();
    expect(utils.getAllByTestId('follow-up-chips')).toHaveLength(1);
    expect(utils.getByTestId('follow-up-0')).toHaveTextContent(followUpsFor(undefined)[0]!);
  });

  it('leaves no answer bubble, and the question not marked failed, when stopped before any text', async () => {
    const live = openTurn(stream);
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');

    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-send-button'));
    });

    expect(live.signal?.aborted).toBe(true);
    expect(utils.getByText('How did I sleep?')).toBeTruthy();
    expect(utils.queryByTestId('chat-bubble-assistant')).toBeNull();
    expect(utils.queryByText('Not sent')).toBeNull();
    expect(utils.queryByTestId('coach-error')).toBeNull();
  });

  // A live streamed answer has no fallback source any more (errors are events), so only a restored
  // legacy fallback row can be one; the live variant of this test could not fail and was removed.
  it('renders a restored fallback reply exactly like a normal one', async () => {
    (fetchLatestConversation as jest.Mock).mockResolvedValue({
      conversationId: 'conv-1',
      messages: [{ id: 'f', role: 'assistant', text: 'I could not put together a fuller answer.', source: 'fallback', createdAt: 't' }],
    });
    const utils = await openChat();

    expect(await utils.findByText('I could not put together a fuller answer.')).toBeTruthy();
    expect(utils.queryByTestId('coach-safety-resources')).toBeNull();
    expect(utils.queryByTestId('coach-error')).toBeNull();
  });

  it('shows no memory line when the answer carries no proposals', async () => {
    scriptTurn(stream, answer('Nice work.'));
    const utils = await openChat();
    await ask(utils, 'hello');

    expect(await utils.findByText('Nice work.')).toBeTruthy();
    expect(utils.queryByText(/I'll remember/)).toBeNull();
  });

  it('keeps a memory chip being edited when its answer finishes (the row is not remounted)', async () => {
    const live = openTurn(stream);
    const utils = await openChat();
    await ask(utils, 'I train at 6am');
    await live.emit({ type: 'text', sentence: 'Got it.' }, { type: 'memory', proposals: [PROPOSAL] });
    fireEvent.press(utils.getByTestId('memory-chip-edit-m1'));
    expect(utils.getByTestId('memory-chip-input-m1')).toBeTruthy();

    await live.finish(doneEvent({ messageId: 'server-1' }));

    expect(utils.getByTestId('memory-chip-input-m1')).toBeTruthy();
  });

  it('speaks the status line, without a timer, while waiting', async () => {
    const live = openTurn(stream);
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');
    await live.emit({ type: 'status', label: 'Looking at your sleep…' });

    expect(utils.getByTestId('coach-thinking').props.accessibilityLabel).toBe('Looking at your sleep');
    expect(utils.queryByTestId('coach-thinking-timer')).toBeNull();
  });

  it('uses the chosen thinking text, and only steps lingers after the answer starts', async () => {
    const live = openTurn(stream);
    const utils = await openChat('lines');
    await ask(utils, 'How did I sleep?');

    expect(utils.getByTestId('coach-thinking')).toHaveTextContent(/Mochi is mulling it over/);
    await live.emit({ type: 'status', step: 'route', label: 'Looking at your sleep…' });
    // Lines ignores step labels (spec §5).
    expect(utils.getByTestId('coach-thinking')).not.toHaveTextContent(/Looking at your sleep/);

    await live.emit({ type: 'text', sentence: 'Mostly clear skies.' });
    expect(utils.queryByTestId('coach-thinking')).toBeNull();
    await live.finish(doneEvent());
  });

  it('New chat inside the steps linger window shows no thinking row', async () => {
    const live = openTurn(stream);
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');
    await live.emit({ type: 'status', label: 'Looking at your sleep…' }, { type: 'text', sentence: 'Mostly clear skies.' });
    expect(utils.getByTestId('thinking-step-status-done')).toBeTruthy();

    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-new-chat-button'));
    });

    expect(utils.queryByTestId('coach-thinking')).toBeNull();
    expect(utils.getByTestId('coach-empty')).toBeTruthy();
  });

  it('a turn the server stopped does not linger on its steps', async () => {
    const live = openTurn(stream);
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');
    await live.emit({ type: 'status', label: 'Looking at your sleep…' });
    expect(utils.getByTestId('thinking-step-status-active')).toBeTruthy();

    await live.finish(doneEvent({ stopped: true }));

    expect(utils.queryByTestId('coach-thinking')).toBeNull();
  });

  it('a turn that fails does not linger on its steps', async () => {
    scriptTurn(stream, [{ type: 'status', label: 'Looking at your sleep…' }, { type: 'text', sentence: 'Mostly' }], new CoachTimeoutError());
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');

    expect(await utils.findByTestId('coach-error')).toBeTruthy();
    expect(utils.queryByTestId('coach-thinking')).toBeNull();
  });

  it('with the dialog thinking text, the streaming answer types into the same box, then reads as a normal message', async () => {
    const live = openTurn(stream);
    const utils = await openChat('dialog');
    await ask(utils, 'How did I sleep?');

    // The box with Mochi's name tab; its line types in from the first letter.
    expect(utils.getByTestId('thinking-dialog-tab')).toHaveTextContent('Mochi');
    await live.emit({ type: 'text', sentence: 'Mostly clear skies.' });

    expect(utils.queryByTestId('coach-thinking')).toBeNull();
    expect(utils.getByTestId('reply-frame-dialog')).toHaveTextContent(/Mostly clear skies\./);
    // The answer keeps the box's pixel text and light ink, not the row's Geist body.
    const streamed = within(utils.getByTestId('reply-frame-dialog')).getByText(/Mostly clear skies\./);
    expect(String(streamed.props.className).split(' ')).toEqual(expect.arrayContaining(DIALOG_TEXT_CLASS.split(' ')));
    expect(StyleSheet.flatten(streamed.props.style)).toEqual(expect.objectContaining({ fontFamily: FONTS.pixel, color: DIALOG_INK }));
    expect(utils.queryByTestId('chat-bubble-assistant')).toBeNull();

    await live.finish(doneEvent());
    expect(utils.queryByTestId('reply-frame-dialog')).toBeNull();
    expect(utils.getByTestId('chat-bubble-assistant')).toHaveTextContent('Mostly clear skies.');
  });

  it('with the placeholder thinking text, the streaming answer flows into the bubble', async () => {
    const live = openTurn(stream);
    const utils = await openChat('placeholder');
    await ask(utils, 'How did I sleep?');
    await live.emit({ type: 'text', sentence: 'Mostly clear skies.' });

    expect(utils.getByTestId('reply-frame-placeholder')).toHaveTextContent(/Mochi.*Mostly clear skies\./);
    await live.finish(doneEvent());
    expect(utils.queryByTestId('reply-frame-placeholder')).toBeNull();
  });

  it('announces a finished answer once, but not a safety reply', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    scriptTurn(stream, answer('Steady.'));
    scriptTurn(stream, [SAFETY, doneEvent()]);
    const utils = await openChat();
    await ask(utils, 'How am I?');
    await utils.findByText('Steady.');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Answer ready');

    await ask(utils, 'I feel awful');
    await utils.findByTestId('coach-safety-resources');
    expect(announce).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });

  it('marks the page title and the empty-chat prompt as headers', async () => {
    const utils = await openChat();

    const headers = utils.getAllByRole('header').map((h) => h.props.accessibilityLabel ?? h.props.children);
    expect(headers).toEqual(expect.arrayContaining(['Coach', 'What would you like to know?']));
  });

  it('does not allow sending an empty message', async () => {
    const utils = await openChat();

    await ask(utils, '   ');

    expect(stream).not.toHaveBeenCalled();
  });
});

describe('CoachScreen: history', () => {
  it('restores the latest conversation with its cards, safety card and memory chips', async () => {
    (fetchLatestConversation as jest.Mock).mockResolvedValue({
      conversationId: 'conv-1',
      messages: [
        { id: 'a', role: 'user', text: 'How did I sleep?', createdAt: 't' },
        { id: 'b', role: 'assistant', text: 'You slept a little less than usual.', source: 'model', createdAt: 't', card: CARD, memoryProposals: [PROPOSAL] },
        { id: 'c', role: 'user', text: 'I feel awful', createdAt: 't' },
        { id: 'd', role: 'assistant', text: 'Support is available.', source: 'safety', createdAt: 't', safety: { resources: ['Call or text 988 (US)'] } },
      ],
    });
    const utils = await openChat();

    expect(await utils.findByText('You slept a little less than usual.')).toBeTruthy();
    expect(utils.getAllByTestId('chat-bubble-user')[0]).toHaveTextContent('How did I sleep?');
    expect(utils.getByTestId('answer-card')).toBeTruthy();
    expect(utils.getByTestId('memory-chip-m1')).toBeTruthy();
    expect(utils.getByTestId('coach-safety-resources')).toHaveTextContent(/Call or text 988/);
    expect(utils.getByTestId('coach-safety-override')).toBeTruthy();
    expect(utils.queryByTestId('coach-empty')).toBeNull();
  });

  it('marks a stopped answer "Stopped", and reads user rows the server sends with a null source', async () => {
    (fetchLatestConversation as jest.Mock).mockResolvedValue({
      conversationId: 'conv-1',
      messages: [
        { id: 'a', role: 'user', text: 'How did I sleep?', source: null, createdAt: 't' },
        { id: 'b', role: 'assistant', text: 'Mostly clear', source: 'model', createdAt: 't', stopped: true },
      ],
    });
    const utils = await openChat();

    expect(await utils.findByTestId('coach-stopped-b')).toHaveTextContent('Stopped');
    expect(utils.getAllByTestId('chat-bubble-user')[0]).toHaveTextContent('How did I sleep?');
    expect(utils.queryByTestId('follow-up-chips')).toBeNull();
  });
});

describe('CoachScreen: header and conversations sheet', () => {
  it('starts a new chat from ✎', async () => {
    (fetchLatestConversation as jest.Mock).mockResolvedValue({
      conversationId: 'conv-1',
      messages: [{ id: 'h1', role: 'assistant', text: 'Earlier answer', source: 'model', createdAt: 't' }],
    });
    scriptTurn(stream, answer('Fresh.'));
    const utils = await openChat();
    await utils.findByText('Earlier answer');

    fireEvent.press(utils.getByTestId('coach-new-chat-button'));

    expect(utils.queryByText('Earlier answer')).toBeNull();
    expect(utils.getByTestId('coach-empty')).toBeTruthy();
    await ask(utils, 'Hello');
    expect(stream).toHaveBeenLastCalledWith({ message: 'Hello' }, expect.any(Function), expect.any(Object));
  });

  it('opens a past conversation from ☰', async () => {
    (listConversations as jest.Mock).mockResolvedValue([{ id: 'conv-7', title: 'What is HRV?', lastMessageAt: '2026-09-28T10:00:00.000Z' }]);
    (fetchConversation as jest.Mock).mockResolvedValue({
      conversationId: 'conv-7',
      messages: [
        { id: 'u', role: 'user', text: 'What is HRV?', createdAt: 't' },
        { id: 'a', role: 'assistant', text: "Think of it as your body's weather gauge.", source: 'model', createdAt: 't' },
      ],
    });
    const utils = await openChat();

    fireEvent.press(utils.getByTestId('coach-conversations-button'));
    const row = await utils.findByTestId('conversation-conv-7');
    await act(async () => {
      fireEvent.press(row);
    });

    expect(fetchConversation).toHaveBeenCalledWith('conv-7');
    expect(await utils.findByText("Think of it as your body's weather gauge.")).toBeTruthy();
  });

  it('closes the sheet and says so gently when a past conversation is gone, keeping the chat on screen', async () => {
    (fetchLatestConversation as jest.Mock).mockResolvedValue({
      conversationId: 'conv-1',
      messages: [{ id: 'h1', role: 'assistant', text: 'Earlier answer', source: 'model', createdAt: 't' }],
    });
    (listConversations as jest.Mock).mockResolvedValue([{ id: 'conv-7', title: 'What is HRV?', lastMessageAt: '2026-09-28T10:00:00.000Z' }]);
    (fetchConversation as jest.Mock).mockRejectedValue(new StaleConversationError());
    const utils = await openChat();
    await utils.findByText('Earlier answer');

    fireEvent.press(utils.getByTestId('coach-conversations-button'));
    const row = await utils.findByTestId('conversation-conv-7');
    await act(async () => {
      fireEvent.press(row);
    });

    expect(await utils.findByTestId('coach-conversation-gone')).toHaveTextContent(/no longer available/);
    expect(utils.queryByTestId('conversation-conv-7')).toBeNull();
    expect(utils.getByText('Earlier answer')).toBeTruthy();

    scriptTurn(stream, answer('Hi.'));
    await ask(utils, 'Hello');
    expect(utils.queryByTestId('coach-conversation-gone')).toBeNull();
  });

  it('says so gently, keeping the chat, when a past conversation cannot be opened', async () => {
    (listConversations as jest.Mock).mockResolvedValue([{ id: 'conv-7', title: 'What is HRV?', lastMessageAt: '2026-09-28T10:00:00.000Z' }]);
    (fetchConversation as jest.Mock).mockRejectedValue(new Error('offline'));
    scriptTurn(stream, answer('Hi.'));
    const utils = await openChat();
    await ask(utils, 'Hello');
    await utils.findByText('Hi.');

    fireEvent.press(utils.getByTestId('coach-conversations-button'));
    const row = await utils.findByTestId('conversation-conv-7');
    await act(async () => {
      fireEvent.press(row);
    });

    expect(await utils.findByTestId('coach-conversation-failed')).toHaveTextContent(/Couldn't open that conversation/);
    expect(utils.getByText('Hi.')).toBeTruthy();
  });

  it('does not let a past conversation that loads late wipe a question sent meanwhile', async () => {
    const past = deferred<{ conversationId: string; messages: unknown[] }>();
    (listConversations as jest.Mock).mockResolvedValue([{ id: 'conv-7', title: 'What is HRV?', lastMessageAt: '2026-09-28T10:00:00.000Z' }]);
    (fetchConversation as jest.Mock).mockReturnValue(past.promise);
    scriptTurn(stream, answer('Fresh answer.'));
    const utils = await openChat();

    fireEvent.press(utils.getByTestId('coach-conversations-button'));
    const row = await utils.findByTestId('conversation-conv-7');
    await act(async () => {
      fireEvent.press(row);
    });
    await ask(utils, 'Hello');
    await utils.findByText('Fresh answer.');
    await act(async () => {
      past.resolve({ conversationId: 'conv-7', messages: [{ id: 'old', role: 'assistant', text: 'Old answer', source: 'model', createdAt: 't' }] });
    });

    expect(utils.getByText('Fresh answer.')).toBeTruthy();
    expect(utils.getByText('Hello')).toBeTruthy();
    expect(utils.queryByText('Old answer')).toBeNull();
  });

  it('reaches the coach memory from ☰', async () => {
    const utils = await openChat();

    fireEvent.press(utils.getByTestId('coach-conversations-button'));
    fireEvent.press(await utils.findByTestId('conversations-memory'));

    expect(mockNavigate).toHaveBeenCalledWith('CoachMemory');
  });
});

describe('CoachScreen: errors and retry', () => {
  it('shows an error card with a retry that resends the same question without duplicating it', async () => {
    scriptTurn(stream, [{ type: 'error', code: 'model_unavailable', retryable: true }]);
    const utils = await openChat();
    await ask(utils, 'How is my recovery?');

    expect(await utils.findByTestId('coach-error')).toHaveTextContent("I couldn't answer that just now.");
    expect(utils.queryByTestId('coach-thinking')).toBeNull();

    scriptTurn(stream, answer('Steady.'));
    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-retry-button'));
    });

    expect(await utils.findByText('Steady.')).toBeTruthy();
    expect(stream).toHaveBeenCalledTimes(2);
    expect(utils.getAllByText('How is my recovery?')).toHaveLength(1);
    expect(utils.queryByTestId('coach-error')).toBeNull();
  });

  it('keeps the sentences that arrived when the stream drops, with the error under them', async () => {
    const { CoachStreamInterruptedError } = jest.requireActual('../../src/api/coachStream');
    scriptTurn(stream, [{ type: 'text', sentence: 'Mostly clear skies.' }], new CoachStreamInterruptedError());
    const utils = await openChat();
    await ask(utils, 'How did I sleep?');

    expect(utils.getByText('Mostly clear skies.')).toBeTruthy();
    expect(utils.getByTestId('coach-error')).toHaveTextContent(/^The answer stopped part-way\./);
  });

  it('explains a client timeout and marks the question not sent', async () => {
    scriptTurn(stream, [], new CoachTimeoutError());
    const utils = await openChat();
    await ask(utils, 'Hello');

    expect(await utils.findByTestId('coach-error')).toHaveTextContent(/too long/i);
    expect(utils.getByText('Not sent')).toBeTruthy();
  });

  it('sends the user to consent when the server says consent is required', async () => {
    scriptTurn(stream, [], new CoachConsentRequiredError());
    const utils = await openChat();
    await ask(utils, 'Hello');

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('CoachConsent', { prefill: undefined }));
  });

  it('shows the coach as unavailable when the server says it is disabled', async () => {
    scriptTurn(stream, [], new CoachDisabledError());
    const utils = await openChat();
    await ask(utils, 'Hello');

    expect(await utils.findByTestId('coach-unavailable')).toBeTruthy();
  });
});

describe('CoachScreen: safety reply', () => {
  it('shows the resources, and resends the same message with safetyOverride without a duplicate bubble', async () => {
    scriptTurn(stream, [SAFETY, doneEvent({ conversationId: 'conv-1' })]);
    const utils = await openChat();
    await ask(utils, 'I feel awful about my sleep and everything');

    expect(utils.getByTestId('coach-safety-resources')).toHaveTextContent(/Text HOME to 741741/);
    expect(utils.queryByTestId('answer-card')).toBeNull();
    expect(utils.queryByTestId('follow-up-chips')).toBeNull();

    scriptTurn(stream, answer('Your sleep was shorter than usual.'));
    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-safety-override'));
    });

    expect(await utils.findByText('Your sleep was shorter than usual.')).toBeTruthy();
    expect(stream).toHaveBeenLastCalledWith(
      { message: 'I feel awful about my sleep and everything', conversationId: 'conv-1', safetyOverride: true },
      expect.any(Function),
      expect.any(Object),
    );
    expect(utils.getAllByText('I feel awful about my sleep and everything')).toHaveLength(1);
    expect(utils.queryByTestId('coach-safety-override')).toBeNull();
  });
});

describe('CoachScreen: tab bar clearance', () => {
  const clearance = FLOATING_BAR_HEIGHT + FLOATING_BAR_MARGIN + 16;

  it('clears the floating bar with a wrapper the keyboard-avoiding view cannot override', async () => {
    const { getByTestId } = await openChat();

    expect(StyleSheet.flatten(getByTestId('coach-clearance').props.style).paddingBottom).toBe(clearance);
  });

  it('drops the clearance while the keyboard is open, because the bar hides', async () => {
    (useKeyboardVisible as jest.Mock).mockReturnValue(true);
    const { getByTestId } = await openChat();

    expect(StyleSheet.flatten(getByTestId('coach-clearance').props.style).paddingBottom).toBe(0);
  });
});
