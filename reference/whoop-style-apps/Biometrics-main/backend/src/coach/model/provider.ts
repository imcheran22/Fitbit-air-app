// The coach model behind one streaming interface (spec 2026-09-30, sections
// 2.3 and 3). Implementations: OllamaProvider (model/ollama.ts, the local
// default), AnthropicProvider (model/anthropic.ts, opt-in hosted),
// UnconfiguredProvider (no model configured: every answer is a
// model_unavailable error) and ScriptedStreamProvider (deterministic test and
// eval double).
//
// Data minimization: a request carries only the system prompt (persona, date,
// fact sheet, rules) and the windowed conversation as clean text. No user id,
// email, name or token has a path into it.

/**
 * One streamed answer: the answer pipeline makes exactly one call per attempt,
 * with no tools. `system` carries the persona, the fact sheet and the output
 * contract; `messages` is the recent conversation, clean text only.
 */
export interface CoachStreamRequest {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** Output cap. The hosted provider ignores it and uses a fixed HOSTED_MAX_TOKENS, since thinking counts toward its limit. */
  maxTokens: number;
  /** Aborted on the answer budget or when the client stops; a real provider cancels the in-flight call. */
  signal?: AbortSignal;
}

export interface CoachModelProvider {
  /** Stable id for telemetry. */
  readonly id: string;
  /** Text deltas of one answer, in order. Throws on a transport or model failure. */
  stream(request: CoachStreamRequest): AsyncIterable<string>;
  /** Optional: load the model ahead of the first question. Must never throw. */
  warm?(): Promise<void>;
}

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super('No coach model provider is configured');
    this.name = 'ProviderNotConfiguredError';
  }
}

export class UnconfiguredProvider implements CoachModelProvider {
  readonly id = 'unconfigured';
  async *stream(): AsyncIterable<string> {
    throw new ProviderNotConfiguredError();
  }
}

export type StreamStep =
  /** The whole reply as one chunk. */
  | string
  /** The reply as these chunks, in order. */
  | string[]
  /** Fails before any text. */
  | Error
  /** Streams these chunks, then fails (a dropped connection). */
  | { chunks: string[]; error: Error }
  /** Full control: inspect the request, wait on the signal, advance a fake clock. */
  | ((request: CoachStreamRequest) => AsyncIterable<string>);

/**
 * Deterministic streaming provider for tests and evals: one script step per
 * stream() call, every request recorded, and a loud failure when the script
 * runs out (a test asserting "no further model call" relies on that).
 */
export class ScriptedStreamProvider implements CoachModelProvider {
  readonly id = 'scripted-stream';
  readonly requests: CoachStreamRequest[] = [];
  private cursor = 0;

  constructor(private readonly script: StreamStep[]) {}

  get callCount(): number {
    return this.requests.length;
  }

  async *stream(request: CoachStreamRequest): AsyncIterable<string> {
    this.requests.push(request);
    const step = this.script[this.cursor++];
    if (step === undefined) throw new Error('ScriptedStreamProvider: script exhausted');
    if (typeof step === 'function') {
      yield* step(request);
      return;
    }
    if (step instanceof Error) throw step;
    if (typeof step === 'string') {
      yield step;
      return;
    }
    if (Array.isArray(step)) {
      yield* step;
      return;
    }
    yield* step.chunks;
    throw step.error;
  }
}
