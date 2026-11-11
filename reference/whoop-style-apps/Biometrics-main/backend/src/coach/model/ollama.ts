// A coach model provider backed by a local Ollama server (POST /api/chat with
// stream:true).
//
// Why local: the spec's section 5 gate exists because a hosted provider sends
// health data off the machine. A model served by Ollama on this host keeps every
// request (tool results + the user's message) on the loopback interface, so by
// default this provider refuses any OLLAMA_URL that is not loopback. Pointing it
// at a self-hosted server elsewhere is an explicit, separate decision
// (OLLAMA_ALLOW_REMOTE=true).
//
// Adapter notes:
// - The system prompt is the one LEADING system message (Qwen-family chat
//   templates accept no other); a regeneration note arrives as a user turn.
// - Reasoning models may inline <think>...</think> even with `think: false`;
//   thinkFilter() drops it from the stream, even split across deltas, so it can
//   never reach the user.

import type { CoachModelProvider, CoachStreamRequest } from './provider';

export interface OllamaProviderOptions {
  baseUrl: string;
  model: string;
  temperature?: number | undefined;
  numCtx?: number | undefined;
  /** How long Ollama keeps the model loaded between answers (default 24h). */
  keepAlive?: string | undefined;
  allowRemote?: boolean | undefined;
  fetchImpl?: typeof fetch | undefined;
}

/** A non-2xx answer from Ollama (e.g. 404 for a model that is not pulled). The body is never echoed: it can contain request text. */
export class OllamaHttpError extends Error {
  constructor(readonly status: number) {
    super(`Ollama request failed with ${status}`);
    this.name = 'OllamaHttpError';
  }
}

/** A streamed answer that Ollama ended with an error line, or a line that is not JSON. Never echoes the line. */
export class OllamaStreamError extends Error {
  constructor(reason: 'error_line' | 'malformed_line' | 'no_body') {
    super(`Ollama stream failed: ${reason}`);
    this.name = 'OllamaStreamError';
  }
}

/** How long the model stays loaded after an answer: a cold load costs ~14 s on the owner's Mac. */
export const STREAM_KEEP_ALIVE = '24h';

export class OllamaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaConfigError';
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return LOOPBACK_HOSTS.has(host) || /^127\./.test(host);
  } catch {
    return false;
  }
}

/** Length of the longest suffix of `s` that is a proper prefix of `tag`. */
function partialTagSuffix(s: string, tag: string): number {
  for (let k = Math.min(tag.length - 1, s.length); k > 0; k--) {
    if (s.endsWith(tag.slice(0, k))) return k;
  }
  return 0;
}

/**
 * Drops <think>...</think> from a stream of deltas, even split across
 * them, holding back a partial tag until the next delta decides it. Call
 * with final=true once at the end to flush what was held back.
 */
export function thinkFilter(): (text: string, final?: boolean) => string {
  let inThink = false;
  let carry = '';
  return (text, final = false) => {
    let s = carry + text;
    carry = '';
    let out = '';
    while (s.length > 0) {
      if (inThink) {
        const end = s.indexOf('</think>');
        if (end === -1) {
          const k = partialTagSuffix(s, '</think>');
          carry = s.slice(s.length - k);
          s = '';
        } else {
          s = s.slice(end + '</think>'.length);
          inThink = false;
        }
      } else {
        const start = s.indexOf('<think>');
        if (start === -1) {
          const k = partialTagSuffix(s, '<think>');
          out += s.slice(0, s.length - k);
          carry = s.slice(s.length - k);
          s = '';
        } else {
          out += s.slice(0, start);
          s = s.slice(start + '<think>'.length);
          inThink = true;
        }
      }
    }
    if (final) {
      if (!inThink) out += carry;
      carry = '';
    }
    return out;
  };
}

/** One NDJSON line of /api/chat with stream:true: its content delta, and whether it is the last line. */
function parseStreamLine(line: string): { text: string; done: boolean } {
  let json: { message?: { content?: unknown }; done?: unknown; error?: unknown };
  try {
    json = JSON.parse(line);
  } catch {
    throw new OllamaStreamError('malformed_line');
  }
  if (json.error !== undefined) throw new OllamaStreamError('error_line');
  return { text: typeof json.message?.content === 'string' ? json.message.content : '', done: json.done === true };
}

export class OllamaProvider implements CoachModelProvider {
  readonly id: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OllamaProviderOptions) {
    if (!options.model) throw new OllamaConfigError('OLLAMA_MODEL is required when COACH_PROVIDER=ollama');
    if (!options.allowRemote && !isLoopbackUrl(options.baseUrl)) {
      throw new OllamaConfigError(
        'OLLAMA_URL is not a loopback address; set OLLAMA_ALLOW_REMOTE=true only for a self-hosted server you control',
      );
    }
    this.id = `ollama:${options.model}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * The model options every chat call shares: streamed answers and the
   * warm-up. Ollama reloads the model whenever a load option (num_ctx
   * above all) differs from the loaded one, so the warm-up must load with
   * exactly these or the next answer pays a second cold load. Each caller adds
   * its own output budget (num_predict) on top.
   */
  private answerModelOptions(): { temperature: number; num_ctx: number } {
    return {
      temperature: this.options.temperature ?? 0.3,
      num_ctx: this.options.numCtx ?? 8192,
    };
  }

  private chatUrl(): string {
    return `${this.options.baseUrl.replace(/\/+$/, '')}/api/chat`;
  }

  /**
   * One answer, streamed (spec 2026-09-30, section 2.6): /api/chat with
   * stream:true returns NDJSON, one {message:{content}} delta per line and a
   * final {done:true}. No tools, thinking off, the model kept loaded for 24h.
   */
  async *stream(request: CoachStreamRequest): AsyncIterable<string> {
    const body = {
      model: this.options.model,
      stream: true,
      think: false,
      keep_alive: this.options.keepAlive ?? STREAM_KEEP_ALIVE,
      options: { ...this.answerModelOptions(), num_predict: request.maxTokens },
      messages: [{ role: 'system', content: request.system }, ...request.messages],
    };
    const res = await this.fetchImpl(this.chatUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (!res.ok) throw new OllamaHttpError(res.status);
    if (!res.body) throw new OllamaStreamError('no_body');

    const decoder = new TextDecoder();
    const filter = thinkFilter();
    let pending = '';
    const lines = function* (final: boolean): Generator<string> {
      let nl: number;
      while ((nl = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (line) yield line;
      }
      if (final && pending.trim()) {
        const line = pending.trim();
        pending = '';
        yield line;
      }
    };

    let done = false;
    const read = function* (final: boolean): Generator<string> {
      for (const line of lines(final)) {
        const delta = parseStreamLine(line);
        const text = filter(delta.text, delta.done);
        if (text) yield text;
        if (delta.done) {
          done = true;
          return;
        }
      }
    };
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      pending += decoder.decode(chunk, { stream: true });
      yield* read(false);
      if (done) return;
    }
    pending += decoder.decode();
    yield* read(true);
    if (!done) {
      const rest = filter('', true);
      if (rest) yield rest;
    }
  }

  /**
   * Loads the model into memory (an empty chat) so the first question skips the
   * cold start. It loads with the answer's own options (same num_ctx), so the
   * next stream() finds the model already loaded as it needs it. Never throws.
   */
  async warm(): Promise<void> {
    try {
      await this.fetchImpl(this.chatUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.options.model,
          messages: [],
          keep_alive: this.options.keepAlive ?? STREAM_KEEP_ALIVE,
          options: this.answerModelOptions(),
        }),
      });
    } catch {
      /* best effort: the first answer simply pays the cold start */
    }
  }
}

function envNumber(name: string, min = Number.MIN_VALUE): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) throw new OllamaConfigError(`${name} is not a valid value: ${raw}`);
  return n;
}

/** Builds the provider from OLLAMA_* environment variables. Throws OllamaConfigError on a bad configuration. */
export function ollamaProviderFromEnv(): OllamaProvider {
  const flag = (name: string) => ['true', '1'].includes(process.env[name]?.trim().toLowerCase() ?? '');
  return new OllamaProvider({
    baseUrl: process.env.OLLAMA_URL?.trim() || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL?.trim() ?? '',
    temperature: envNumber('OLLAMA_TEMPERATURE', 0),
    numCtx: envNumber('OLLAMA_NUM_CTX'),
    keepAlive: process.env.OLLAMA_KEEP_ALIVE?.trim() || undefined,
    allowRemote: flag('OLLAMA_ALLOW_REMOTE'),
  });
}
