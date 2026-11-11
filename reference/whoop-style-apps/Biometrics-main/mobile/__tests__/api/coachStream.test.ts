import { fetch as expoFetch } from 'expo/fetch';
import { ApiError, setBaseUrl } from '../../src/api/client';
import {
  COACH_REQUEST_TIMEOUT_MS,
  CoachConsentRequiredError,
  CoachTimeoutError,
  StaleConversationError,
  TooManyMessagesError,
  TurnInProgressError,
  type CoachStreamEvent,
} from '../../src/api/coach';
import { authClient } from '../../src/auth/authClient';
import { CoachStreamAbortedError, CoachStreamInterruptedError, parseCoachEvent, streamCoachMessage } from '../../src/api/coachStream';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const fetchMock = expoFetch as unknown as jest.Mock;
const encoder = new TextEncoder();

function sse(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

const DONE = { messageId: 'm1', conversationId: 'c1', engine: 'local', durationMs: 5200 };
const CARD = {
  headline: 'Decent night, broken after 4am',
  tiles: [{ factId: 'sleep.total', label: 'total', display: '6h 48m', value: 408, usual: 433, status: 'below' }],
  source: 'Sleep · last night vs your 30-day usual',
};
const PROPOSAL = { id: 'mem1', category: 'SCHEDULE', value: 'Trains at 6am', status: 'PENDING', createdAt: '2026-09-30T08:00:00.000Z' };

// A streaming Response whose body yields `chunks` (strings or raw bytes), then
// either ends or -- with `hang` -- waits until the request is aborted, the way
// expo/fetch rejects a pending read on abort.
function respond(chunks: Array<string | Uint8Array>, { hang = false, failAfter = false } = {}) {
  fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
    const queue = chunks.map((c) => (typeof c === 'string' ? encoder.encode(c) : c));
    const reader = {
      read: jest.fn(async () => {
        if (queue.length > 0) return { done: false, value: queue.shift() };
        if (failAfter) throw new TypeError('Network connection was lost');
        if (!hang) return { done: true, value: undefined };
        return new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          if (signal.aborted) reject(new Error('aborted'));
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }),
      releaseLock: jest.fn(),
    };
    return { ok: true, status: 200, body: { getReader: () => reader }, json: async () => ({}) };
  });
}

function respondStatus(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => body, body: null });
}

async function collect(promise: (onEvent: (e: CoachStreamEvent) => void) => Promise<void>) {
  const events: CoachStreamEvent[] = [];
  let error: unknown;
  await promise((e) => events.push(e)).catch((e) => {
    error = e;
  });
  return { events, error };
}

beforeEach(() => {
  setBaseUrl('https://api.example.com');
  fetchMock.mockReset();
});

describe('streamCoachMessage', () => {
  it('POSTs through expo/fetch asking for an event stream, with the session cookie', async () => {
    respond([sse('done', DONE)]);
    await streamCoachMessage({ message: 'How did I sleep?', conversationId: 'c1' }, () => {});

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/me/coach/message');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toEqual(
      expect.objectContaining({ Accept: 'text/event-stream', 'Content-Type': 'application/json', Cookie: 'biometrics.session_token=test' }),
    );
    expect(JSON.parse(init.body)).toEqual({ message: 'How did I sleep?', conversationId: 'c1' });
  });

  it('delivers every event in order and resolves on the stream end after done', async () => {
    respond([
      sse('status', { label: 'Looking at your sleep…' }),
      sse('text', { sentence: 'Mostly clear skies.' }),
      sse('text', { sentence: 'The cloud was the early wake-ups.' }),
      sse('card', { card: CARD }),
      sse('memory', { proposals: [PROPOSAL] }),
      sse('done', DONE),
    ]);
    const { events, error } = await collect((on) => streamCoachMessage({ message: 'How did I sleep?' }, on));

    expect(error).toBeUndefined();
    expect(events).toEqual([
      { type: 'status', label: 'Looking at your sleep…' },
      { type: 'text', sentence: 'Mostly clear skies.' },
      { type: 'text', sentence: 'The cloud was the early wake-ups.' },
      { type: 'card', card: CARD },
      { type: 'memory', proposals: [PROPOSAL] },
      { type: 'done', ...DONE },
    ]);
  });

  it('reassembles an event split across chunks, including a multi-byte character split between bytes', async () => {
    const bytes = encoder.encode(sse('text', { sentence: 'Grey start… easy day.' }));
    const cut = bytes.indexOf(0xe2) + 1; // inside the three bytes of "…"
    respond([bytes.slice(0, 9), bytes.slice(9, cut), bytes.slice(cut), sse('done', DONE)]);
    const { events } = await collect((on) => streamCoachMessage({ message: 'Hi' }, on));

    expect(events[0]).toEqual({ type: 'text', sentence: 'Grey start… easy day.' });
  });

  it('skips malformed events and keeps going', async () => {
    respond([
      'event: text\ndata: {not json\n\n',
      sse('text', { nope: true }),
      sse('mystery', { a: 1 }),
      sse('text', { sentence: 'Still here.' }),
      sse('done', DONE),
    ]);
    const { events } = await collect((on) => streamCoachMessage({ message: 'Hi' }, on));

    expect(events.map((e) => e.type)).toEqual(['text', 'done']);
  });

  it('resolves after an error event: the server has said how the turn ended', async () => {
    respond([sse('text', { sentence: 'Partly there.' }), sse('error', { code: 'timeout', retryable: true })]);
    const { events, error } = await collect((on) => streamCoachMessage({ message: 'Hi' }, on));

    expect(error).toBeUndefined();
    expect(events[1]).toEqual({ type: 'error', code: 'timeout', retryable: true });
  });

  it('resolves after a safety event even when no done follows', async () => {
    respond([sse('safety', { text: 'Support is available.', resources: ['Call or text 988 (US)', 7] })]);
    const { events, error } = await collect((on) => streamCoachMessage({ message: 'Hi' }, on));

    expect(error).toBeUndefined();
    expect(events).toEqual([{ type: 'safety', text: 'Support is available.', resources: ['Call or text 988 (US)'] }]);
  });

  it('rejects with CoachStreamInterruptedError when the stream closes before the turn ended, after delivering what came', async () => {
    respond([sse('text', { sentence: 'Mostly clear skies.' })]);
    const { events, error } = await collect((on) => streamCoachMessage({ message: 'Hi' }, on));

    expect(events).toEqual([{ type: 'text', sentence: 'Mostly clear skies.' }]);
    expect(error).toBeInstanceOf(CoachStreamInterruptedError);
  });

  it('rejects with CoachStreamInterruptedError when the connection drops mid-stream', async () => {
    respond([sse('text', { sentence: 'Mostly clear skies.' })], { failAfter: true });
    const { events, error } = await collect((on) => streamCoachMessage({ message: 'Hi' }, on));

    expect(events).toHaveLength(1);
    expect(error).toBeInstanceOf(CoachStreamInterruptedError);
  });

  it('maps HTTP errors before the stream starts to the coach errors', async () => {
    respondStatus(403, { error: 'consent_required' });
    await expect(streamCoachMessage({ message: 'Hi' }, () => {})).rejects.toBeInstanceOf(CoachConsentRequiredError);
    respondStatus(404, { error: 'conversation_not_found' });
    await expect(streamCoachMessage({ message: 'Hi', conversationId: 'gone' }, () => {})).rejects.toBeInstanceOf(StaleConversationError);
  });

  it('stops when the caller aborts: the request is cancelled and it rejects with CoachStreamAbortedError', async () => {
    respond([sse('text', { sentence: 'Mostly clear skies.' })], { hang: true });
    const controller = new AbortController();
    const events: CoachStreamEvent[] = [];
    const promise = streamCoachMessage({ message: 'Hi' }, (e) => {
      events.push(e);
      if (e.type === 'text') controller.abort();
    }, controller.signal);

    await expect(promise).rejects.toBeInstanceOf(CoachStreamAbortedError);
    expect(events).toHaveLength(1);
    expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
  });

  it('does not send at all when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(streamCoachMessage({ message: 'Hi' }, () => {}, controller.signal)).rejects.toBeInstanceOf(CoachStreamAbortedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rethrows an error thrown by onEvent unchanged and cancels the request', async () => {
    respond([sse('text', { sentence: 'Mostly clear skies.' })], { hang: true });
    const bug = new RangeError('render failed');
    const promise = streamCoachMessage({ message: 'Hi' }, () => {
      throw bug;
    });

    await expect(promise).rejects.toBe(bug);
    expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
  });

  it('cancels the request once it settles, even after a normal end', async () => {
    respond([sse('done', DONE)]);
    await streamCoachMessage({ message: 'Hi' }, () => {});
    expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
  });

  it('resolves when the caller aborts after the turn has ended', async () => {
    respond([sse('safety', { text: 'Support is available.', resources: [] }), sse('done', DONE)], { hang: true });
    const controller = new AbortController();
    const events: CoachStreamEvent[] = [];
    await expect(
      streamCoachMessage({ message: 'Hi' }, (e) => {
        events.push(e);
        if (e.type === 'done') controller.abort();
      }, controller.signal),
    ).resolves.toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(['safety', 'done']);
  });

  it('maps 409 turn_in_progress and 429 too_many_messages before the stream starts', async () => {
    respondStatus(409, { error: 'turn_in_progress' });
    await expect(streamCoachMessage({ message: 'Hi' }, () => {})).rejects.toBeInstanceOf(TurnInProgressError);

    respondStatus(429, { error: 'too_many_messages', retryAfterSeconds: 42 });
    const limited = await streamCoachMessage({ message: 'Hi' }, () => {}).catch((e) => e);
    expect(limited).toBeInstanceOf(TooManyMessagesError);
    expect(limited.retryAfterSeconds).toBe(42);

    respondStatus(429, { error: 'too_many_messages' });
    const unspecified = await streamCoachMessage({ message: 'Hi' }, () => {}).catch((e) => e);
    expect(unspecified).toBeInstanceOf(TooManyMessagesError);
    expect(unspecified.retryAfterSeconds).toBeUndefined();
  });

  it('signs out on a 401 before the stream starts', async () => {
    const signOut = authClient.signOut as jest.Mock;
    signOut.mockClear();
    respondStatus(401, { error: 'Invalid or expired token' });
    const error = await streamCoachMessage({ message: 'Hi' }, () => {}).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  describe('timeout', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('rejects with CoachTimeoutError when the headers never arrive', async () => {
      fetchMock.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            (init.signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      const promise = streamCoachMessage({ message: 'Hi' }, () => {});
      const assertion = expect(promise).rejects.toBeInstanceOf(CoachTimeoutError);

      await jest.advanceTimersByTimeAsync(COACH_REQUEST_TIMEOUT_MS);
      await assertion;
    });

    it('resolves when the timeout fires after the turn has ended', async () => {
      respond([sse('done', DONE)], { hang: true });
      const promise = streamCoachMessage({ message: 'Hi' }, () => {});
      const assertion = expect(promise).resolves.toBeUndefined();

      await jest.advanceTimersByTimeAsync(COACH_REQUEST_TIMEOUT_MS);
      await assertion;
    });

    it('aborts and rejects with CoachTimeoutError once the client timeout passes', async () => {
      respond([sse('status', { label: 'Thinking…' })], { hang: true });
      const promise = streamCoachMessage({ message: 'Hi' }, () => {});
      const assertion = expect(promise).rejects.toBeInstanceOf(CoachTimeoutError);

      await jest.advanceTimersByTimeAsync(COACH_REQUEST_TIMEOUT_MS - 1);
      expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await assertion;
      expect((fetchMock.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
    });
  });
});

describe('parseCoachEvent', () => {
  it('parses an optional step on status, dropping an unknown one', () => {
    expect(parseCoachEvent({ event: 'status', data: JSON.stringify({ label: 'Writing it up…', step: 'write' }) })).toEqual({ type: 'status', label: 'Writing it up…', step: 'write' });
    expect(parseCoachEvent({ event: 'status', data: JSON.stringify({ label: 'Looking at your sleep…', step: 'route', conversationId: 'c9' }) })).toEqual({
      type: 'status',
      label: 'Looking at your sleep…',
      step: 'route',
      conversationId: 'c9',
    });
    expect(parseCoachEvent({ event: 'status', data: JSON.stringify({ label: 'Thinking…', step: 'dance' }) })).toEqual({ type: 'status', label: 'Thinking…' });
    expect(parseCoachEvent({ event: 'status', data: JSON.stringify({ label: 'Thinking…', step: 3 }) })).toEqual({ type: 'status', label: 'Thinking…' });
  });

  it('reads the fields of each event type and ignores a type field inside the data', () => {
    expect(parseCoachEvent({ event: 'status', data: '{"type":"text","label":"Looking…"}' })).toEqual({ type: 'status', label: 'Looking…' });
    expect(parseCoachEvent({ event: 'status', data: '{"label":"Looking…","conversationId":"c9"}' })).toEqual({ type: 'status', label: 'Looking…', conversationId: 'c9' });
    expect(parseCoachEvent({ event: 'status', data: '{"label":"Looking…","conversationId":7}' })).toEqual({ type: 'status', label: 'Looking…' });
    expect(parseCoachEvent({ event: 'safety', data: '{"text":"Sorry.","resources":["988"],"conversationId":"c9"}' })).toEqual({
      type: 'safety',
      text: 'Sorry.',
      resources: ['988'],
      conversationId: 'c9',
    });
    expect(parseCoachEvent({ event: 'done', data: JSON.stringify({ ...DONE, engine: 'hosted', stopped: true }) })).toEqual({
      type: 'done',
      ...DONE,
      engine: 'hosted',
      stopped: true,
    });
  });

  it('reads an unknown error code as internal, not retryable unless the server says so', () => {
    expect(parseCoachEvent({ event: 'error', data: '{"code":"weird"}' })).toEqual({ type: 'error', code: 'internal', retryable: false });
  });

  it('drops a card event whose card has no rows, a done without ids, and memory rows without an id', () => {
    expect(parseCoachEvent({ event: 'card', data: JSON.stringify({ card: { headline: 'h', tiles: [], source: 's' } }) })).toBeNull();
    expect(parseCoachEvent({ event: 'done', data: '{"engine":"local"}' })).toBeNull();
    expect(parseCoachEvent({ event: 'memory', data: JSON.stringify({ proposals: [{ value: 'x' }, PROPOSAL] }) })).toEqual({
      type: 'memory',
      proposals: [PROPOSAL],
    });
  });
});
