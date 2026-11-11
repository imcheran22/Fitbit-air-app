import { OllamaHttpError, OllamaProvider, OllamaStreamError, thinkFilter } from '../../src/coach/model/ollama';
import type { CoachStreamRequest } from '../../src/coach/model/provider';

const BASE = 'http://localhost:11434';

/** NDJSON lines as the byte chunks Ollama might send, cut at arbitrary byte offsets (mid-line, mid-character). */
function ndjsonBytes(lines: unknown[], cuts: number[]): Uint8Array[] {
  const bytes = new TextEncoder().encode(lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
  const out: Uint8Array[] = [];
  let last = 0;
  for (const cut of [...cuts, bytes.length]) {
    out.push(bytes.slice(last, cut));
    last = cut;
  }
  return out.filter((c) => c.length > 0);
}

function streamingFetch(chunks: Uint8Array[], status = 200) {
  return jest.fn(async (_url: string, _init: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    }),
  })) as unknown as jest.Mock & typeof fetch;
}

const delta = (content: string) => ({ model: 'm', message: { role: 'assistant', content }, done: false });
const DONE = { model: 'm', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' };

function req(over: Partial<CoachStreamRequest> = {}): CoachStreamRequest {
  return { system: 'SYS', messages: [{ role: 'user', content: 'How did I sleep?' }], maxTokens: 600, ...over };
}

async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe('OllamaProvider.stream', () => {
  it('posts a streaming chat with think off, a 24h keep-alive, the token budget and the abort signal', async () => {
    const fetchImpl = streamingFetch(ndjsonBytes([delta('Hi.'), DONE], []));
    const provider = new OllamaProvider({ baseUrl: `${BASE}/`, model: 'qwen3.6:35b', fetchImpl });
    const controller = new AbortController();

    await collect(provider.stream(req({ signal: controller.signal })));

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/api/chat`);
    expect(init.signal).toBe(controller.signal);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: 'qwen3.6:35b',
      stream: true,
      think: false,
      keep_alive: '24h',
      options: { temperature: 0.3, num_ctx: 8192, num_predict: 600 },
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'How did I sleep?' },
      ],
    });
    expect(body).not.toHaveProperty('tools');
  });

  it('yields the content deltas, however the bytes are cut, and stops at done', async () => {
    const lines = [delta('You slept '), delta('6h 48m — '), delta('not bad. '), DONE, delta('after done')];
    const fetchImpl = streamingFetch(ndjsonBytes(lines, [5, 40, 97, 98, 99, 130]));
    const provider = new OllamaProvider({ baseUrl: BASE, model: 'm', fetchImpl });

    expect((await collect(provider.stream(req()))).join('')).toBe('You slept 6h 48m — not bad. ');
  });

  it('reads a final line without a trailing newline', async () => {
    const bytes = new TextEncoder().encode(`${JSON.stringify(delta('Hi.'))}\n${JSON.stringify(DONE)}`);
    const provider = new OllamaProvider({ baseUrl: BASE, model: 'm', fetchImpl: streamingFetch([bytes]) });
    expect(await collect(provider.stream(req()))).toEqual(['Hi.']);
  });

  it('never yields reasoning, even when the think tags are split across deltas', async () => {
    const lines = [delta('<thi'), delta('nk>plan the answer</th'), delta('ink>Rest '), delta('today.'), DONE];
    const provider = new OllamaProvider({ baseUrl: BASE, model: 'm', fetchImpl: streamingFetch(ndjsonBytes(lines, [])) });
    expect((await collect(provider.stream(req()))).join('')).toBe('Rest today.');
  });

  it('uses OLLAMA_KEEP_ALIVE when configured', async () => {
    const fetchImpl = streamingFetch(ndjsonBytes([DONE], []));
    const provider = new OllamaProvider({ baseUrl: BASE, model: 'm', keepAlive: '2h', fetchImpl });
    await collect(provider.stream(req()));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).keep_alive).toBe('2h');
  });

  it('throws OllamaHttpError on a non-2xx answer', async () => {
    const provider = new OllamaProvider({ baseUrl: BASE, model: 'missing', fetchImpl: streamingFetch([], 404) });
    await expect(collect(provider.stream(req()))).rejects.toEqual(new OllamaHttpError(404));
  });

  it('throws OllamaStreamError on an error line or a malformed line, without echoing it', async () => {
    const withError = new OllamaProvider({
      baseUrl: BASE,
      model: 'm',
      fetchImpl: streamingFetch(ndjsonBytes([delta('Part'), { error: 'secret request text' }], [])),
    });
    const got: string[] = [];
    const err = await (async () => {
      try {
        for await (const c of withError.stream(req())) got.push(c);
      } catch (e) {
        return e as Error;
      }
      return null;
    })();
    expect(got).toEqual(['Part']);
    expect(err).toBeInstanceOf(OllamaStreamError);
    expect(err!.message).not.toContain('secret');

    const malformed = new OllamaProvider({ baseUrl: BASE, model: 'm', fetchImpl: streamingFetch(ndjsonBytes(['{not json'], [])) });
    await expect(collect(malformed.stream(req()))).rejects.toBeInstanceOf(OllamaStreamError);
  });

  it('propagates an abort', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted')))),
    ) as unknown as typeof fetch;
    const provider = new OllamaProvider({ baseUrl: BASE, model: 'm', fetchImpl });
    const pending = collect(provider.stream(req({ signal: controller.signal })));
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
  });
});

describe('OllamaProvider.warm', () => {
  it('asks Ollama to load the model (an empty chat) with a 24h keep-alive', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200 })) as unknown as jest.Mock & typeof fetch;
    const provider = new OllamaProvider({ baseUrl: BASE, model: 'qwen3.6:35b', fetchImpl });
    await provider.warm();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE}/api/chat`);
    expect(JSON.parse(init.body)).toEqual({
      model: 'qwen3.6:35b',
      messages: [],
      keep_alive: '24h',
      options: { temperature: 0.3, num_ctx: 8192 },
    });
  });

  // A different num_ctx makes Ollama reload the model, so a warm-up that loads at
  // the default context (65536 on the owner's Mac) makes the next answer cold.
  it.each([
    ['defaults', {}],
    ['configured context, temperature and keep-alive', { numCtx: 16384, temperature: 0.5, keepAlive: '2h' }],
  ])('loads the model with the same model, keep-alive and load options a streamed answer uses (%s)', async (_name, over) => {
    const warmFetch = jest.fn(async () => ({ ok: true, status: 200 })) as unknown as jest.Mock & typeof fetch;
    const streamFetch = streamingFetch(ndjsonBytes([delta('Hi.'), DONE], []));
    await new OllamaProvider({ baseUrl: BASE, model: 'qwen3.6:35b', fetchImpl: warmFetch, ...over }).warm();
    await collect(new OllamaProvider({ baseUrl: BASE, model: 'qwen3.6:35b', fetchImpl: streamFetch, ...over }).stream(req()));

    const warmBody = JSON.parse(warmFetch.mock.calls[0][1].body);
    const streamBody = JSON.parse(streamFetch.mock.calls[0][1].body as string);
    // num_predict is a per-answer output budget, not a load option.
    const { num_predict: _perAnswer, ...streamLoadOptions } = streamBody.options;
    expect(warmBody.options).toEqual(streamLoadOptions);
    expect(warmBody.options.num_ctx).toBe(streamBody.options.num_ctx);
    expect(warmBody.model).toBe(streamBody.model);
    expect(warmBody.keep_alive).toBe(streamBody.keep_alive);
  });

  it('never throws', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    await expect(new OllamaProvider({ baseUrl: BASE, model: 'm', fetchImpl }).warm()).resolves.toBeUndefined();
  });
});

describe('thinkFilter', () => {
  it('drops think blocks across calls and flushes a held-back partial tag at the end', () => {
    const f = thinkFilter();
    expect(f('Hello <')).toBe('Hello ');
    expect(f('b>bold')).toBe('<b>bold');
    expect(f(' <think>x')).toBe(' ');
    expect(f('y</think> ok <thi')).toBe(' ok ');
    expect(f('', true)).toBe('<thi');
  });
});
