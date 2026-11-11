import { act, renderHook } from '@testing-library/react-native';
import {
  CoachConsentRequiredError,
  CoachDisabledError,
  CoachTimeoutError,
  StaleConversationError,
  TooManyMessagesError,
  TurnInProgressError,
  type CoachStreamEvent,
  type MemoryDTO,
  type SendCoachMessageInput,
} from '../../src/api/coach';
import { CoachStreamAbortedError, CoachStreamInterruptedError, streamCoachMessage } from '../../src/api/coachStream';
import { fromHistory, useCoachConversation, type UseCoachConversationOptions } from '../../src/lib/useCoachConversation';

jest.mock('../../src/api/coachStream', () => ({
  ...jest.requireActual('../../src/api/coachStream'),
  streamCoachMessage: jest.fn(),
}));

const stream = streamCoachMessage as jest.Mock;

const CARD = {
  headline: 'Decent night, broken after 4am',
  tiles: [{ factId: 'sleep.total', label: 'total', display: '6h 48m', value: 408 }],
  source: 'Sleep · last night',
};
const PROPOSAL: MemoryDTO = { id: 'mem1', category: 'SCHEDULE', value: 'Trains at 6am', status: 'PENDING', createdAt: '2026-09-30T08:00:00.000Z' };
const done = (over: Partial<Extract<CoachStreamEvent, { type: 'done' }>> = {}): CoachStreamEvent => ({
  type: 'done',
  messageId: 'a1',
  conversationId: 'c1',
  engine: 'local',
  durationMs: 4000,
  ...over,
});

// One scripted turn: emits `events`, then resolves, or rejects with `error`.
function turn(events: CoachStreamEvent[], error?: unknown) {
  stream.mockImplementationOnce(async (_body: SendCoachMessageInput, onEvent: (e: CoachStreamEvent) => void) => {
    for (const e of events) onEvent(e);
    if (error) throw error;
  });
}

// A turn the test drives by hand; it rejects with CoachStreamAbortedError when stopped.
function openTurn() {
  let emit!: (e: CoachStreamEvent) => void;
  let finish!: () => void;
  let signal!: AbortSignal;
  stream.mockImplementationOnce(
    (_body: SendCoachMessageInput, onEvent: (e: CoachStreamEvent) => void, s: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        emit = onEvent;
        finish = resolve;
        signal = s;
        s.addEventListener('abort', () => reject(new CoachStreamAbortedError()));
      }),
  );
  return {
    emit: (e: CoachStreamEvent) => act(() => emit(e)),
    finish: () => act(async () => finish()),
    get signal() {
      return signal;
    },
  };
}

function setup(options: UseCoachConversationOptions = {}) {
  return renderHook(() => useCoachConversation(options));
}

beforeEach(() => {
  stream.mockReset();
});

describe('useCoachConversation: a streamed answer', () => {
  it('shows the question at once, the status while waiting, then the answer sentence by sentence', async () => {
    const live = openTurn();
    const { result } = setup();

    act(() => result.current.send('  How did I sleep?  '));
    expect(result.current.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'How did I sleep?'],
      ['assistant', ''],
    ]);
    expect(result.current.streaming).toBe(true);
    expect(result.current.waiting).toBe(true);
    expect(stream).toHaveBeenCalledWith({ message: 'How did I sleep?' }, expect.any(Function), expect.any(Object));

    live.emit({ type: 'status', label: 'Looking at your sleep…' });
    expect(result.current.statusLabel).toBe('Looking at your sleep…');

    live.emit({ type: 'text', sentence: 'Mostly clear skies.' });
    expect(result.current.waiting).toBe(false);
    live.emit({ type: 'text', sentence: 'The cloud was the early wake-ups.' });
    live.emit({ type: 'card', card: CARD });
    live.emit({ type: 'memory', proposals: [PROPOSAL] });
    const answer = result.current.messages[1]!;
    expect(answer.text).toBe('Mostly clear skies. The cloud was the early wake-ups.');
    expect(answer.state).toBe('streaming');
    expect(answer.card).toEqual(CARD);
    expect(answer.memoryProposals).toEqual([PROPOSAL]);

    live.emit(done());
    await live.finish();

    expect(result.current.streaming).toBe(false);
    expect(result.current.conversationId).toBe('c1');
    expect(result.current.messages[1]).toEqual(expect.objectContaining({ id: 'a1', state: 'done', fresh: true }));
    expect(result.current.answeredAt).toEqual(expect.any(Number));
    expect(result.current.error).toBeNull();
  });

  it('continues the same conversation on the next question', async () => {
    turn([{ type: 'text', sentence: 'One.' }, done()]);
    turn([{ type: 'text', sentence: 'Two.' }, done({ messageId: 'a2' })]);
    const { result } = setup();

    await act(async () => result.current.send('First'));
    await act(async () => result.current.send('Second'));

    expect(stream.mock.calls[1][0]).toEqual({ message: 'Second', conversationId: 'c1' });
    expect(result.current.messages.map((m) => m.text)).toEqual(['First', 'One.', 'Second', 'Two.']);
  });

  it('ignores an empty question and a second one while an answer is streaming', async () => {
    openTurn();
    const { result } = setup();

    act(() => result.current.send('   '));
    expect(stream).not.toHaveBeenCalled();
    act(() => result.current.send('First'));
    act(() => result.current.send('Second'));
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it('notes an answer the on-device model wrote when the user chose Claude', async () => {
    turn([{ type: 'text', sentence: 'Hi.' }, done({ engine: 'local' })]);
    const { result } = setup({ preferredEngine: 'hosted' });

    await act(async () => result.current.send('Hello'));

    expect(result.current.messages[1]!.answeredLocally).toBe(true);
  });
});

describe('useCoachConversation: stop', () => {
  it('keeps the partial answer, marks it stopped, and does not celebrate', async () => {
    const live = openTurn();
    const { result } = setup();
    act(() => result.current.send('How did I sleep?'));
    live.emit({ type: 'text', sentence: 'Mostly clear skies.' });

    await act(async () => result.current.stop());

    expect(live.signal.aborted).toBe(true);
    expect(result.current.streaming).toBe(false);
    expect(result.current.messages[1]).toEqual(expect.objectContaining({ text: 'Mostly clear skies.', state: 'stopped' }));
    expect(result.current.error).toBeNull();
    expect(result.current.answeredAt).toBeNull();
  });

  it('does not celebrate a turn the server ended as stopped, and marks it stopped', async () => {
    turn([{ type: 'text', sentence: 'Mostly clear skies.' }, done({ stopped: true })]);
    const { result } = setup();

    await act(async () => {
      result.current.send('How did I sleep?');
    });

    expect(result.current.messages[1]).toEqual(expect.objectContaining({ id: 'a1', state: 'stopped' }));
    expect(result.current.answeredAt).toBeNull();
  });

  it('keeps a live answer\'s client key when its id becomes the server\'s', async () => {
    const live = openTurn();
    const { result } = setup();
    act(() => result.current.send('How did I sleep?'));
    live.emit({ type: 'text', sentence: 'Mostly clear skies.' });
    const key = result.current.messages[1]!.clientKey;
    expect(key).toBeTruthy();

    live.emit(done());
    await live.finish();

    expect(result.current.messages[1]).toEqual(expect.objectContaining({ id: 'a1', clientKey: key }));
  });

  it('has a stable stop that is safe before any turn and when pressed repeatedly', async () => {
    const { result, rerender } = setup();
    const stop = result.current.stop;
    await act(async () => stop());
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();

    const live = openTurn();
    act(() => result.current.send('How did I sleep?'));
    live.emit({ type: 'text', sentence: 'Mostly clear skies.' });
    rerender({});
    expect(result.current.stop).toBe(stop);

    await act(async () => {
      result.current.stop();
      result.current.stop();
    });
    await act(async () => result.current.stop());

    expect(live.signal.aborted).toBe(true);
    expect(result.current.messages[1]).toEqual(expect.objectContaining({ text: 'Mostly clear skies.', state: 'stopped' }));
    expect(result.current.error).toBeNull();
    expect(result.current.streaming).toBe(false);
  });

  it('drops the empty answer when stopped before anything arrived, keeping the question', async () => {
    const live = openTurn();
    const { result } = setup();
    act(() => result.current.send('How did I sleep?'));

    await act(async () => result.current.stop());

    expect(live.signal.aborted).toBe(true);
    expect(result.current.messages).toEqual([expect.objectContaining({ role: 'user', text: 'How did I sleep?' })]);
    expect(result.current.messages[0]!.failed).toBeUndefined();
    expect(result.current.streaming).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps the conversation of a first turn stopped before done: the next question continues it', async () => {
    const live = openTurn();
    const { result } = setup();
    act(() => result.current.send('How did I sleep?'));
    live.emit({ type: 'status', label: 'Looking at your sleep…', conversationId: 'c-new' });
    expect(result.current.conversationId).toBe('c-new');
    live.emit({ type: 'text', sentence: 'Mostly clear skies.' });

    await act(async () => result.current.stop());
    expect(result.current.conversationId).toBe('c-new');

    turn([{ type: 'status', label: 'Thinking…', conversationId: 'c-new' }, { type: 'text', sentence: 'Sure.' }, done({ messageId: 'a2', conversationId: 'c-new' })]);
    await act(async () => result.current.send('And tonight?'));

    expect(stream.mock.calls[1][0]).toEqual({ message: 'And tonight?', conversationId: 'c-new' });
    expect(result.current.conversationId).toBe('c-new');
    expect(result.current.messages.map((m) => m.text)).toEqual(['How did I sleep?', 'Mostly clear skies.', 'And tonight?', 'Sure.']);
  });

  it('keeps the conversation of a first turn whose stream dropped before done', async () => {
    turn([{ type: 'status', label: 'Thinking…', conversationId: 'c-new' }, { type: 'text', sentence: 'Partly.' }], new CoachStreamInterruptedError());
    turn([{ type: 'text', sentence: 'Two.' }, done({ messageId: 'a2', conversationId: 'c-new' })]);
    const { result } = setup();

    await act(async () => result.current.send('First'));
    expect(result.current.error?.kind).toBe('interrupted');
    expect(result.current.conversationId).toBe('c-new');

    await act(async () => result.current.send('Second'));
    expect(stream.mock.calls[1][0]).toEqual({ message: 'Second', conversationId: 'c-new' });
  });

  it('starts afresh, once, when a stopped first turn stored nothing and its id is unknown', async () => {
    const live = openTurn();
    const { result } = setup();
    act(() => result.current.send('How did I sleep?'));
    live.emit({ type: 'status', label: 'Thinking…', conversationId: 'never-stored' });
    await act(async () => result.current.stop());

    turn([], new StaleConversationError());
    turn([{ type: 'status', label: 'Thinking…', conversationId: 'c2' }, { type: 'text', sentence: 'Hi.' }, done({ conversationId: 'c2' })]);
    await act(async () => result.current.send('Hello'));

    expect(stream.mock.calls[1][0]).toEqual({ message: 'Hello', conversationId: 'never-stored' });
    expect(stream.mock.calls[2][0]).toEqual({ message: 'Hello' });
    expect(result.current.conversationId).toBe('c2');
  });
});

describe('useCoachConversation: errors and retry', () => {
  it('keeps sentences that arrived before an error event, and retry replaces them with a fresh answer', async () => {
    turn([{ type: 'text', sentence: 'Partly there.' }, { type: 'error', code: 'model_unavailable', retryable: true }]);
    const { result } = setup();

    await act(async () => result.current.send('How did I sleep?'));

    expect(result.current.messages[1]).toEqual(expect.objectContaining({ text: 'Partly there.', state: 'interrupted' }));
    expect(result.current.error).toEqual({ kind: 'unavailable', retryable: true, received: true, request: { message: 'How did I sleep?' }, userMessageId: 'local-1' });
    expect(result.current.messages[0]!.failed).toBeUndefined();

    turn([{ type: 'text', sentence: 'All there.' }, done()]);
    await act(async () => result.current.retry());

    expect(stream).toHaveBeenLastCalledWith({ message: 'How did I sleep?' }, expect.any(Function), expect.any(Object));
    expect(result.current.messages.map((m) => m.text)).toEqual(['How did I sleep?', 'All there.']);
    expect(result.current.error).toBeNull();
  });

  it('drops the empty answer and marks the question not sent when the request itself failed', async () => {
    turn([], new Error('offline'));
    const { result } = setup();

    await act(async () => result.current.send('Hello'));

    expect(result.current.messages).toEqual([expect.objectContaining({ role: 'user', text: 'Hello', failed: true })]);
    expect(result.current.error).toEqual({ kind: 'unavailable', retryable: true, received: false, request: { message: 'Hello' }, userMessageId: 'local-1' });
    expect(result.current.answeredAt).toBeNull();
  });

  it('reports a dropped stream as interrupted, keeping what arrived', async () => {
    turn([{ type: 'text', sentence: 'Mostly clear skies.' }], new CoachStreamInterruptedError());
    const { result } = setup();

    await act(async () => result.current.send('How did I sleep?'));

    expect(result.current.messages[1]).toEqual(expect.objectContaining({ text: 'Mostly clear skies.', state: 'interrupted' }));
    expect(result.current.error?.kind).toBe('interrupted');
    expect(result.current.error?.received).toBe(true);
  });

  // R41: the error card words a drop before anything arrived differently.
  it('says whether anything arrived before the stream dropped', async () => {
    turn([], new CoachStreamInterruptedError());
    const { result } = setup();

    await act(async () => result.current.send('How did I sleep?'));

    expect(result.current.error).toEqual(expect.objectContaining({ kind: 'interrupted', received: false }));
  });

  // R42: a status line is not an answer; only shown text, a card or a safety reply counts.
  it('counts a drop right after the status event as dropped before any answer', async () => {
    turn([{ type: 'status', label: 'Thinking…' }], new CoachStreamInterruptedError());
    const { result } = setup();

    await act(async () => result.current.send('How did I sleep?'));

    expect(result.current.error).toEqual(expect.objectContaining({ kind: 'interrupted', received: false }));
  });

  it('counts a card alone as an answer shown', async () => {
    turn(
      [{ type: 'card', card: { headline: 'Short night', tiles: [{ factId: 'sleep.total', label: 'total', display: '6h 48m', value: 408 }], source: 'Today' } }],
      new CoachStreamInterruptedError(),
    );
    const { result } = setup();

    await act(async () => result.current.send('How did I sleep?'));

    expect(result.current.error).toEqual(expect.objectContaining({ kind: 'interrupted', received: true }));
  });

  it('reports a client timeout, and a server timeout event, as a timeout', async () => {
    turn([], new CoachTimeoutError());
    const { result } = setup();
    await act(async () => result.current.send('Hello'));
    expect(result.current.error?.kind).toBe('timeout');

    turn([{ type: 'error', code: 'timeout', retryable: true }]);
    await act(async () => result.current.retry());
    expect(result.current.error?.kind).toBe('timeout');
  });

  it('hands consent-required, from the HTTP status or an error event, to the screen', async () => {
    const onConsentRequired = jest.fn();
    turn([], new CoachConsentRequiredError());
    turn([{ type: 'error', code: 'consent_required', retryable: false }]);
    const { result } = setup({ onConsentRequired });

    await act(async () => result.current.send('One'));
    await act(async () => result.current.send('Two'));

    expect(onConsentRequired).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it('shows a gentle, retryable "still answering" state when a previous turn is still running', async () => {
    const onConsentRequired = jest.fn();
    turn([], new TurnInProgressError());
    const { result } = setup({ onConsentRequired });

    await act(async () => result.current.send('Hello'));

    expect(result.current.error).toEqual({ kind: 'busy', retryable: true, received: false, request: { message: 'Hello' }, userMessageId: 'local-1' });
    expect(result.current.messages).toEqual([expect.objectContaining({ role: 'user', text: 'Hello', failed: true })]);
    expect(onConsentRequired).not.toHaveBeenCalled();

    turn([{ type: 'text', sentence: 'Hi.' }, done()]);
    await act(async () => result.current.retry());
    expect(result.current.messages.map((m) => [m.text, m.failed])).toEqual([
      ['Hello', undefined],
      ['Hi.', undefined],
    ]);
    expect(result.current.error).toBeNull();
  });

  it('reports the message limit with how long to wait', async () => {
    turn([], new TooManyMessagesError(30));
    turn([], new TooManyMessagesError());
    const { result } = setup();

    await act(async () => result.current.send('Hello'));
    expect(result.current.error).toEqual({ kind: 'rate_limited', retryable: true, received: false, retryAfterSeconds: 30, request: { message: 'Hello' }, userMessageId: 'local-1' });

    await act(async () => result.current.retry());
    expect(result.current.error).toEqual({ kind: 'rate_limited', retryable: true, received: false, request: { message: 'Hello' }, userMessageId: 'local-1' });
  });

  it('fails safe to a retryable card for an internal or unknown error code', async () => {
    turn([{ type: 'error', code: 'internal', retryable: false }]);
    const { result } = setup();

    await act(async () => result.current.send('Hello'));

    expect(result.current.error).toEqual({ kind: 'unavailable', retryable: true, received: false, request: { message: 'Hello' }, userMessageId: 'local-1' });
    expect(result.current.streaming).toBe(false);
  });

  it('hands a disabled coach to the screen', async () => {
    const onDisabled = jest.fn();
    turn([], new CoachDisabledError());
    const { result } = setup({ onDisabled });

    await act(async () => result.current.send('Hello'));

    expect(onDisabled).toHaveBeenCalledTimes(1);
  });

  it('starts a new conversation, once, when the old one is gone', async () => {
    turn([{ type: 'text', sentence: 'One.' }, done({ conversationId: 'old' })]);
    turn([], new StaleConversationError());
    turn([{ type: 'text', sentence: 'Two.' }, done({ messageId: 'a2', conversationId: 'new' })]);
    const { result } = setup();

    await act(async () => result.current.send('First'));
    await act(async () => result.current.send('Second'));

    expect(stream.mock.calls[1][0]).toEqual({ message: 'Second', conversationId: 'old' });
    expect(stream.mock.calls[2][0]).toEqual({ message: 'Second' });
    expect(result.current.conversationId).toBe('new');
    expect(result.current.messages.map((m) => m.text)).toEqual(['First', 'One.', 'Second', 'Two.']);
  });

  it('marks only the failed question "not sent" when an earlier one had the same text, and retry clears only it', async () => {
    turn([{ type: 'text', sentence: 'One.' }, done()]);
    turn([], new Error('offline'));
    const { result } = setup();

    await act(async () => result.current.send('Same'));
    await act(async () => result.current.send('Same'));

    expect(result.current.messages.map((m) => [m.role, m.text, m.failed])).toEqual([
      ['user', 'Same', undefined],
      ['assistant', 'One.', undefined],
      ['user', 'Same', true],
    ]);
    const failedId = result.current.messages[2]!.id;
    expect(result.current.error?.userMessageId).toBe(failedId);

    turn([], new Error('offline'));
    await act(async () => result.current.retry());
    expect(result.current.messages.map((m) => m.failed)).toEqual([undefined, undefined, true]);
    expect(result.current.error?.userMessageId).toBe(failedId);

    turn([{ type: 'text', sentence: 'Two.' }, done({ messageId: 'a2' })]);
    await act(async () => result.current.retry());
    expect(result.current.messages.map((m) => [m.text, m.failed])).toEqual([
      ['Same', undefined],
      ['One.', undefined],
      ['Same', undefined],
      ['Two.', undefined],
    ]);
  });

  it('does nothing on retry when the error is not retryable', async () => {
    turn([{ type: 'error', code: 'validation_failed', retryable: false }]);
    const { result } = setup();

    await act(async () => result.current.send('Hello'));
    expect(result.current.error).toEqual({ kind: 'unavailable', retryable: false, received: false, request: { message: 'Hello' }, userMessageId: 'local-1' });

    await act(async () => result.current.retry());
    expect(stream).toHaveBeenCalledTimes(1);
    expect(result.current.error?.retryable).toBe(false);
    expect(result.current.streaming).toBe(false);
  });
});

describe('useCoachConversation: safety', () => {
  it('shows the safety reply with its resources, does not celebrate, and resends with the override', async () => {
    turn([{ type: 'safety', text: "I'm really sorry you're feeling this way.", resources: ['Call or text 988 (US)'] }, done()]);
    const { result } = setup();

    await act(async () => result.current.send('I feel awful'));

    expect(result.current.messages[1]).toEqual(
      expect.objectContaining({
        text: "I'm really sorry you're feeling this way.",
        safety: { resources: ['Call or text 988 (US)'], originalMessage: 'I feel awful', overridden: false },
      }),
    );
    expect(result.current.answeredAt).toBeNull();

    turn([{ type: 'text', sentence: 'Your sleep was short.' }, done({ messageId: 'a2' })]);
    await act(async () => result.current.overrideSafety('I feel awful'));

    expect(stream).toHaveBeenLastCalledWith({ message: 'I feel awful', conversationId: 'c1', safetyOverride: true }, expect.any(Function), expect.any(Object));
    expect(result.current.messages.filter((m) => m.text === 'I feel awful')).toHaveLength(1);
    expect(result.current.messages[1]!.safety!.overridden).toBe(true);
    expect(result.current.answeredAt).toEqual(expect.any(Number));
  });

  it('keeps the conversation named on the safety event when the stream drops before done', async () => {
    turn([{ type: 'safety', text: 'Sorry.', resources: [], conversationId: 'c-safe' }], new CoachStreamInterruptedError());
    const { result } = setup();
    await act(async () => result.current.send('I feel awful'));
    expect(result.current.conversationId).toBe('c-safe');
  });

  it('marks no question "not sent" when an override resend fails (it added none)', async () => {
    turn([{ type: 'safety', text: 'Sorry.', resources: [] }, done()]);
    turn([], new Error('offline'));
    const { result } = setup();
    await act(async () => result.current.send('I feel awful'));
    await act(async () => result.current.overrideSafety('I feel awful'));

    expect(result.current.messages.some((m) => m.failed)).toBe(false);
    expect(result.current.error).toEqual({ kind: 'unavailable', retryable: true, received: false, request: { message: 'I feel awful', safetyOverride: true } });
  });
});

describe('useCoachConversation: a turn that ends on safety alone', () => {
  it('settles the safety reply when no done follows, and the override still resends', async () => {
    turn([{ type: 'safety', text: 'Support is available.', resources: ['Call 988'] }]);
    const { result } = setup();

    await act(async () => result.current.send('I feel awful'));

    expect(result.current.streaming).toBe(false);
    expect(result.current.waiting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.answeredAt).toBeNull();
    expect(result.current.conversationId).toBeNull();
    expect(result.current.messages[1]).toEqual(
      expect.objectContaining({ state: 'done', safety: { resources: ['Call 988'], originalMessage: 'I feel awful', overridden: false } }),
    );

    turn([{ type: 'text', sentence: 'Your sleep was short.' }, done({ messageId: 'a2' })]);
    await act(async () => result.current.overrideSafety('I feel awful'));

    expect(stream).toHaveBeenLastCalledWith({ message: 'I feel awful', safetyOverride: true }, expect.any(Function), expect.any(Object));
    expect(result.current.messages[1]!.safety!.overridden).toBe(true);
    expect(result.current.messages[2]).toEqual(expect.objectContaining({ id: 'a2', text: 'Your sleep was short.', state: 'done' }));
  });
});

describe('useCoachConversation: new chat and history', () => {
  it('clears the conversation, and stops an answer in flight', async () => {
    turn([{ type: 'text', sentence: 'One.' }, done()]);
    const { result } = setup();
    await act(async () => result.current.send('First'));
    const live = openTurn();
    act(() => result.current.send('Second'));

    await act(async () => result.current.newChat());

    expect(live.signal.aborted).toBe(true);
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversationId).toBeNull();
    expect(result.current.streaming).toBe(false);
  });

  it('restores a conversation with its cards, safety card and memory chips', () => {
    const { result } = setup();

    act(() =>
      result.current.restore({
        conversationId: 'c9',
        messages: [
          { id: 'u1', role: 'user', text: 'How did I sleep?', createdAt: 't' },
          { id: 'a1', role: 'assistant', text: 'Mostly clear.', source: 'model', createdAt: 't', card: CARD, memoryProposals: [PROPOSAL] },
        ],
      }),
    );

    expect(result.current.conversationId).toBe('c9');
    expect(result.current.messages[1]).toEqual(
      expect.objectContaining({ text: 'Mostly clear.', card: CARD, memoryProposals: [PROPOSAL], state: 'done' }),
    );
  });
});

describe('useCoachConversation: progress steps', () => {
  it('builds the steps list, ticking each step when the next arrives (Review Focus 3)', async () => {
    const live = openTurn();
    const { result } = setup();
    expect(result.current.steps).toEqual([]);

    act(() => result.current.send('How did I sleep?'));
    live.emit({ type: 'status', step: 'route', label: 'Looking at your sleep…', conversationId: 'c1' });
    expect(result.current.steps).toEqual([{ id: 'route', label: 'Looking at your sleep…', done: false }]);
    live.emit({ type: 'status', step: 'facts', label: 'Going through your recent nights…' });
    expect(result.current.steps).toEqual([
      { id: 'route', label: 'Looking at your sleep…', done: true },
      { id: 'facts', label: 'Going through your recent nights…', done: false },
    ]);
    live.emit({ type: 'status', step: 'write', label: 'Writing it up…' });
    expect(result.current.steps.map((s) => s.done)).toEqual([true, true, false]);
    expect(result.current.statusLabel).toBe('Writing it up…');

    live.emit({ type: 'text', sentence: 'You slept well.' });
    expect(result.current.steps).toHaveLength(3);
    expect(result.current.steps.every((s) => s.done)).toBe(true);
    live.emit({ type: 'text', sentence: 'Deep sleep was up.' });
    expect(result.current.steps.every((s) => s.done)).toBe(true);
    live.emit(done());
    await live.finish();

    // Kept, all ticked, after the turn ends: the thinking text lingers on them.
    expect(result.current.streaming).toBe(false);
    expect(result.current.steps).toEqual([
      { id: 'route', label: 'Looking at your sleep…', done: true },
      { id: 'facts', label: 'Going through your recent nights…', done: true },
      { id: 'write', label: 'Writing it up…', done: true },
    ]);
  });

  it('ticks the open step on a card, so a card-only answer does not linger unticked (R15)', async () => {
    const live = openTurn();
    const { result } = setup();

    act(() => result.current.send('How did I sleep?'));
    live.emit({ type: 'status', step: 'route', label: 'Looking at your sleep…', conversationId: 'c1' });
    live.emit({ type: 'status', step: 'facts', label: 'Going through your recent nights…' });
    expect(result.current.steps.map((s) => s.done)).toEqual([true, false]);
    live.emit({ type: 'card', card: CARD });
    expect(result.current.steps).toEqual([
      { id: 'route', label: 'Looking at your sleep…', done: true },
      { id: 'facts', label: 'Going through your recent nights…', done: true },
    ]);
    await live.finish();
  });

  it('ticks the open step on done when nothing else did (R15)', async () => {
    const live = openTurn();
    const { result } = setup();

    act(() => result.current.send('hi'));
    live.emit({ type: 'status', step: 'route', label: 'Thinking it over…', conversationId: 'c1' });
    expect(result.current.steps).toEqual([{ id: 'route', label: 'Thinking it over…', done: false }]);
    live.emit(done());
    expect(result.current.steps).toEqual([{ id: 'route', label: 'Thinking it over…', done: true }]);
    await live.finish();
  });

  it('shows a stepless status (older server) as one step, updating its label rather than adding another', async () => {
    const live = openTurn();
    const { result } = setup();

    act(() => result.current.send('hi'));
    live.emit({ type: 'status', label: 'Thinking…' });
    expect(result.current.steps).toEqual([{ id: 'status', label: 'Thinking…', done: false }]);
    live.emit({ type: 'status', label: 'Still thinking…' });
    expect(result.current.steps).toEqual([{ id: 'status', label: 'Still thinking…', done: false }]);
    live.emit({ type: 'text', sentence: 'Hello.' });
    expect(result.current.steps).toEqual([{ id: 'status', label: 'Still thinking…', done: true }]);
    await live.finish();
  });

  it('keeps the steps it has when the stream errors after the first one', async () => {
    turn([{ type: 'status', step: 'route', label: 'Thinking it over…' }, { type: 'error', code: 'internal', retryable: true }]);
    const { result } = setup();

    await act(async () => result.current.send('hi'));
    expect(result.current.streaming).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.steps).toEqual([{ id: 'route', label: 'Thinking it over…', done: false }]);
  });

  it('starts each send, and a retry, with no steps', async () => {
    turn([{ type: 'status', step: 'route', label: 'Thinking it over…' }, { type: 'error', code: 'internal', retryable: true }]);
    const { result } = setup();
    await act(async () => result.current.send('hi'));
    expect(result.current.error).not.toBeNull();

    const live = openTurn();
    act(() => result.current.retry());
    expect(result.current.steps).toEqual([]);
    live.emit({ type: 'status', step: 'route', label: 'Looking at your sleep…' });
    expect(result.current.steps).toEqual([{ id: 'route', label: 'Looking at your sleep…', done: false }]);
    await live.finish();

    const next = openTurn();
    act(() => result.current.send('again'));
    expect(result.current.steps).toEqual([]);
    next.emit({ type: 'status', step: 'facts', label: 'Going through your recent nights…' });
    expect(result.current.steps).toEqual([{ id: 'facts', label: 'Going through your recent nights…', done: false }]);
  });

  it('starts the next send after a stop with no steps, and a new chat clears them', async () => {
    const live = openTurn();
    const { result } = setup();
    act(() => result.current.send('hi'));
    live.emit({ type: 'status', step: 'route', label: 'Thinking it over…' });
    await act(async () => result.current.stop());
    expect(result.current.streaming).toBe(false);

    const next = openTurn();
    act(() => result.current.send('again'));
    expect(result.current.steps).toEqual([]);
    next.emit({ type: 'status', step: 'route', label: 'Thinking it over…' });
    next.emit(done());
    await next.finish();
    // The turn's done event ticks the step it left open (R15).
    expect(result.current.steps).toEqual([{ id: 'route', label: 'Thinking it over…', done: true }]);

    await act(async () => result.current.newChat());
    expect(result.current.steps).toEqual([]);
  });
});

describe('fromHistory', () => {
  it('rebuilds a safety card, settled once the conversation went on, and a stopped answer', () => {
    const messages = fromHistory([
      { id: 'u1', role: 'user', text: 'I feel awful', createdAt: 't' },
      { id: 'a1', role: 'assistant', text: 'Support is available.', source: 'safety', createdAt: 't', safety: { resources: ['Call 988', 3] } },
      { id: 'u2', role: 'user', text: 'Sleep?', createdAt: 't' },
      { id: 'a2', role: 'assistant', text: 'Mostly', source: 'model', createdAt: 't', stopped: true },
      { id: 'u3', role: 'user', text: 'Again', createdAt: 't' },
      { id: 'a3', role: 'assistant', text: 'Support is available.', source: 'safety', createdAt: 't' },
    ]);

    expect(messages[1]!.safety).toEqual({ resources: ['Call 988'], originalMessage: 'I feel awful', overridden: true });
    expect(messages[3]!.state).toBe('stopped');
    expect(messages[5]!.safety).toEqual({ resources: [], originalMessage: 'Again', overridden: false });
  });

  it('renders a row stored before the redesign as plain talk, dropping a malformed card', () => {
    const [m] = fromHistory([{ id: 'a1', role: 'assistant', text: 'Old answer', source: 'fallback', createdAt: 't', card: { headline: 'x' } }]);
    expect(m).toEqual({ id: 'a1', role: 'assistant', text: 'Old answer', source: 'fallback', state: 'done' });
  });
});
