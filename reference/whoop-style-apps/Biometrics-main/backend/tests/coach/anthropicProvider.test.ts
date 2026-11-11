// backend/tests/coach/anthropicProvider.test.ts
import Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicProvider,
  DEFAULT_HOSTED_MODEL,
  HOSTED_FALLBACK_BETA,
  HOSTED_MAX_TOKENS,
  HostedConfigError,
  HostedRefusalError,
  HostedTimeoutError,
  anthropicProviderFromEnv,
  getHostedFirstTextMs,
  toAnthropicMessages,
} from '../../src/coach/model/anthropic';
import type { CoachStreamRequest } from '../../src/coach/model/provider';
import { FakeClock } from './helpers';

// The real SDK is never called: the constructor is auto-mocked (so the env
// factory can be checked), and every provider under test gets a fake client.
jest.mock('@anthropic-ai/sdk');

type Event = { type: string; delta?: { type: string; text?: string }; content_block?: { type: string } };

/**
 * A fake of the slice of the SDK the provider uses: beta.messages.stream.
 * Like the SDK's stream, it fails with an abort error once the request signal
 * fires, and records when its iterator is closed early (the SDK aborts the HTTP
 * request on iterator.return()).
 */
function fakeClient(opts: { events?: Event[]; stopReason?: string; failWith?: Error } = {}) {
  const cancelled = { value: false };
  const stream = jest.fn((_body: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
    const events = opts.events ?? [];
    return {
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          async next(): Promise<IteratorResult<Event>> {
            if (opts.failWith) throw opts.failWith;
            if (options?.signal?.aborted) throw Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' });
            return i < events.length ? { value: events[i++]!, done: false } : { value: undefined, done: true };
          },
          async return(): Promise<IteratorResult<Event>> {
            cancelled.value = true;
            return { value: undefined, done: true };
          },
        };
      },
      finalMessage: async () => ({ stop_reason: opts.stopReason ?? 'end_turn', content: [] }),
    };
  });
  return { client: { beta: { messages: { stream } } } as unknown as Anthropic, stream, cancelled };
}

const textDelta = (text: string): Event => ({ type: 'content_block_delta', delta: { type: 'text_delta', text } });
/** A server-side fallback boundary: the model before it declined, the next one takes over. */
const fallbackStart: Event = { type: 'content_block_start', content_block: { type: 'fallback' } };

function streamRequest(overrides: Partial<CoachStreamRequest> = {}): CoachStreamRequest {
  return {
    system: 'You are Mochi.',
    messages: [{ role: 'user', content: 'How did I sleep?' }],
    maxTokens: 600,
    ...overrides,
  };
}

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of it) out.push(chunk);
  return out;
}

describe('toAnthropicMessages', () => {
  it('drops empty turns and any assistant turn before the first user turn', () => {
    expect(
      toAnthropicMessages([
        { role: 'assistant', content: 'Earlier reply cut by the history window.' },
        { role: 'user', content: '   ' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: '' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'How did I sleep?' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'How did I sleep?' },
    ]);
  });
});

describe('AnthropicProvider.stream', () => {
  it('sends the Opus 5.5 request shape: low effort, server-side fallback, no thinking or sampling params', async () => {
    const { client, stream } = fakeClient({ events: [textDelta('Hi.')] });
    const provider = new AnthropicProvider({ client });
    const caller = new AbortController();

    await collect(provider.stream(streamRequest({ signal: caller.signal })));

    expect(stream).toHaveBeenCalledTimes(1);
    const [body, options] = stream.mock.calls[0]!;
    expect(body).toEqual({
      model: DEFAULT_HOSTED_MODEL,
      max_tokens: HOSTED_MAX_TOKENS,
      system: 'You are Mochi.',
      messages: [{ role: 'user', content: 'How did I sleep?' }],
      output_config: { effort: 'low' },
      betas: [HOSTED_FALLBACK_BETA],
      fallbacks: 'default',
    });
    expect(DEFAULT_HOSTED_MODEL).toBe('claude-opus-5-5');
    expect(HOSTED_FALLBACK_BETA).toBe('server-side-fallback-2026-07-01');
    expect(HOSTED_MAX_TOKENS).toBe(2000);
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('temperature');
    // The SDK gets the caller's signal combined with the provider's own first-text timeout.
    expect(Object.keys(options!)).toEqual(['signal']);
    expect(options!.signal!.aborted).toBe(false);
    caller.abort();
    expect(options!.signal!.aborted).toBe(true);
  });

  it('uses the configured model', async () => {
    const { client, stream } = fakeClient({ events: [] });
    await collect(new AnthropicProvider({ client, model: 'claude-sonnet-5-5' }).stream(streamRequest()));
    expect(stream.mock.calls[0]![0]).toMatchObject({ model: 'claude-sonnet-5-5' });
  });

  it('yields only text deltas, in order', async () => {
    const { client } = fakeClient({
      events: [
        { type: 'message_start' },
        { type: 'content_block_start', content_block: { type: 'text' } },
        { type: 'content_block_delta', delta: { type: 'thinking_delta' } },
        textDelta('Your recovery '),
        textDelta('is 26.'),
        { type: 'content_block_stop' },
        { type: 'message_stop' },
      ],
    });
    expect(await collect(new AnthropicProvider({ client }).stream(streamRequest()))).toEqual(['Your recovery ', 'is 26.']);
  });

  it('throws HostedRefusalError when the whole fallback chain refused', async () => {
    const { client } = fakeClient({ events: [], stopReason: 'refusal' });
    await expect(collect(new AnthropicProvider({ client }).stream(streamRequest()))).rejects.toBeInstanceOf(HostedRefusalError);
  });

  it('throws HostedRefusalError after text was already yielded when the chain refused', async () => {
    const { client } = fakeClient({ events: [textDelta('Your recovery ')], stopReason: 'refusal' });
    const seen: string[] = [];
    const run = async () => {
      for await (const chunk of new AnthropicProvider({ client }).stream(streamRequest())) seen.push(chunk);
    };
    await expect(run()).rejects.toBeInstanceOf(HostedRefusalError);
    expect(seen).toEqual(['Your recovery ']);
  });

  it('streams the fallback model normally when the switch came before any text', async () => {
    const { client } = fakeClient({
      events: [{ type: 'message_start' }, fallbackStart, { type: 'content_block_stop' }, textDelta('Recovery is 26.')],
    });
    expect(await collect(new AnthropicProvider({ client }).stream(streamRequest()))).toEqual(['Recovery is 26.']);
  });

  it('stops with HostedRefusalError on a mid-reply model switch, never appending the second answer', async () => {
    const { client, cancelled } = fakeClient({
      events: [textDelta('Your recovery '), fallbackStart, { type: 'content_block_stop' }, textDelta('Recovery is 26.')],
    });
    const seen: string[] = [];
    const run = async () => {
      for await (const chunk of new AnthropicProvider({ client }).stream(streamRequest())) seen.push(chunk);
    };
    await expect(run()).rejects.toBeInstanceOf(HostedRefusalError);
    expect(seen).toEqual(['Your recovery ']);
    expect(cancelled.value).toBe(true);
  });

  it('cancels the SDK stream when the caller stops iterating', async () => {
    const { client, cancelled } = fakeClient({ events: [textDelta('One. '), textDelta('Two.')] });
    const iterator = new AnthropicProvider({ client }).stream(streamRequest())[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: 'One. ', done: false });
    await iterator.return?.();
    expect(cancelled.value).toBe(true);
  });

  it('stops with the abort error when the request signal fires', async () => {
    const controller = new AbortController();
    const { client } = fakeClient({ events: [textDelta('One. '), textDelta('Two.')] });
    const seen: string[] = [];
    const run = async () => {
      for await (const chunk of new AnthropicProvider({ client }).stream(streamRequest({ signal: controller.signal }))) {
        seen.push(chunk);
        controller.abort();
      }
    };
    await expect(run()).rejects.toMatchObject({ name: 'APIUserAbortError' });
    expect(seen).toEqual(['One. ']);
  });

  it('passes an SDK error through unchanged', async () => {
    const failure = Object.assign(new Error('overloaded'), { name: 'InternalServerError' });
    const { client } = fakeClient({ failWith: failure });
    await expect(collect(new AnthropicProvider({ client }).stream(streamRequest()))).rejects.toBe(failure);
  });

  it('passes its own first-text signal when the caller gives none', async () => {
    const { client, stream } = fakeClient({ events: [] });
    await collect(new AnthropicProvider({ client }).stream(streamRequest()));
    expect(stream.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('AnthropicProvider.stream time to first text', () => {
  /** An SDK stream that sends `events`, then nothing until its signal fires (then fails like the SDK). */
  function stallingClient(events: Event[] = []) {
    const stream = jest.fn((_body: Record<string, unknown>, options: { signal: AbortSignal }) => ({
      [Symbol.asyncIterator]() {
        let i = 0;
        return {
          next(): Promise<IteratorResult<Event>> {
            if (i < events.length) return Promise.resolve({ value: events[i++]!, done: false });
            return new Promise((_resolve, reject) => {
              const fail = () => reject(Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' }));
              if (options.signal.aborted) fail();
              else options.signal.addEventListener('abort', fail);
            });
          },
          async return(): Promise<IteratorResult<Event>> {
            return { value: undefined, done: true };
          },
        };
      },
      finalMessage: async () => ({ stop_reason: 'end_turn', content: [] }),
    }));
    return { client: { beta: { messages: { stream } } } as unknown as Anthropic, stream };
  }

  const flush = () => new Promise((r) => setImmediate(r));

  it('fails with HostedTimeoutError after 10 s without text, leaving the caller signal alone', async () => {
    const clock = new FakeClock();
    const { client, stream } = stallingClient();
    const caller = new AbortController();
    const provider = new AnthropicProvider({ client, clock });
    const run = collect(provider.stream(streamRequest({ signal: caller.signal })));
    run.catch(() => {});
    await flush();

    clock.advance(9_999);
    await flush();
    expect(stream.mock.calls[0]![1].signal.aborted).toBe(false);
    clock.advance(1);

    await expect(run).rejects.toBeInstanceOf(HostedTimeoutError);
    await expect(run).rejects.toMatchObject({ name: 'HostedTimeoutError' });
    expect(stream.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
  });

  it('a fallback boundary or blank text does not count as first text', async () => {
    const clock = new FakeClock();
    const { client } = stallingClient([fallbackStart, textDelta(' ')]);
    const run = collect(new AnthropicProvider({ client, clock, firstTextTimeoutMs: 5_000 }).stream(streamRequest()));
    run.catch(() => {});
    await flush();
    clock.advance(5_000);
    await expect(run).rejects.toBeInstanceOf(HostedTimeoutError);
  });

  it('clears the timer once the first text arrives', async () => {
    const clock = new FakeClock();
    const { client, stream } = stallingClient([textDelta('Recovery is 26.')]);
    const iterator = new AnthropicProvider({ client, clock }).stream(streamRequest())[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ value: 'Recovery is 26.', done: false });
    expect(clock.pendingTimers).toBe(0);
    clock.advance(60_000);
    expect(stream.mock.calls[0]![1].signal.aborted).toBe(false);
    await iterator.return?.();
  });

  it('reports a caller abort as the abort, not as a timeout', async () => {
    const clock = new FakeClock();
    const { client } = stallingClient();
    const caller = new AbortController();
    const run = collect(new AnthropicProvider({ client, clock }).stream(streamRequest({ signal: caller.signal })));
    run.catch(() => {});
    await flush();
    caller.abort();
    await expect(run).rejects.toMatchObject({ name: 'APIUserAbortError' });
    expect(clock.pendingTimers).toBe(0);
  });

  it('reads COACH_HOSTED_FIRST_TEXT_MS, clamped to 1 s - min(60 s, half the hosted budget), defaulting to 10 s', () => {
    const saved = process.env.COACH_HOSTED_FIRST_TEXT_MS;
    const savedBudget = process.env.COACH_HOSTED_BUDGET_MS;
    try {
      delete process.env.COACH_HOSTED_BUDGET_MS; // the 30 s default: at most 15 s to first text
      delete process.env.COACH_HOSTED_FIRST_TEXT_MS;
      expect(getHostedFirstTextMs()).toBe(10_000);
      process.env.COACH_HOSTED_FIRST_TEXT_MS = 'soon';
      expect(getHostedFirstTextMs()).toBe(10_000);
      process.env.COACH_HOSTED_FIRST_TEXT_MS = ' 8000 ';
      expect(getHostedFirstTextMs()).toBe(8_000);
      process.env.COACH_HOSTED_FIRST_TEXT_MS = '5';
      expect(getHostedFirstTextMs()).toBe(1_000);
      process.env.COACH_HOSTED_FIRST_TEXT_MS = '-1';
      expect(getHostedFirstTextMs()).toBe(1_000);
      // Final review I6: 60 s against a 30 s budget left the local fallback no time at all.
      process.env.COACH_HOSTED_FIRST_TEXT_MS = '60000';
      expect(getHostedFirstTextMs()).toBe(15_000);
      process.env.COACH_HOSTED_FIRST_TEXT_MS = '900000';
      expect(getHostedFirstTextMs()).toBe(15_000);
      process.env.COACH_HOSTED_BUDGET_MS = '200000';
      expect(getHostedFirstTextMs()).toBe(60_000);
      process.env.COACH_HOSTED_BUDGET_MS = '8000';
      delete process.env.COACH_HOSTED_FIRST_TEXT_MS;
      expect(getHostedFirstTextMs()).toBe(4_000); // the 10 s default, capped at half of 8 s
    } finally {
      if (saved === undefined) delete process.env.COACH_HOSTED_FIRST_TEXT_MS;
      else process.env.COACH_HOSTED_FIRST_TEXT_MS = saved;
      if (savedBudget === undefined) delete process.env.COACH_HOSTED_BUDGET_MS;
      else process.env.COACH_HOSTED_BUDGET_MS = savedBudget;
    }
  });
});

describe('anthropicProviderFromEnv', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    (Anthropic as unknown as jest.Mock).mockClear();
  });

  it('refuses to build without ANTHROPIC_API_KEY', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => anthropicProviderFromEnv()).toThrow(HostedConfigError);
    process.env.ANTHROPIC_API_KEY = '   ';
    expect(() => anthropicProviderFromEnv()).toThrow(HostedConfigError);
  });

  it('builds the SDK client with the key and one retry, and reads COACH_HOSTED_MODEL', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.COACH_HOSTED_MODEL = ' claude-opus-5 ';
    const provider = anthropicProviderFromEnv();
    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test', maxRetries: 1 });
    expect(provider.id).toBe('anthropic:claude-opus-5');
  });

  it('defaults the model to claude-opus-5-5', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    delete process.env.COACH_HOSTED_MODEL;
    expect(anthropicProviderFromEnv().id).toBe('anthropic:claude-opus-5-5');
  });
});
