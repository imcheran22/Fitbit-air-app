import { fetch as expoFetch } from 'expo/fetch';
import { apiResponse } from './client';
import {
  COACH_REQUEST_TIMEOUT_MS,
  CoachTimeoutError,
  mapCoachError,
  toAnswerCard,
  type CoachErrorCode,
  type CoachStreamEvent,
  type MemoryDTO,
  type SendCoachMessageInput,
} from './coach';
import { createSseParser, type SseMessage } from './sseParser';

// Transport: expo/fetch. In Expo SDK 57 its Response.body is a ReadableStream
// fed by the native URLSession / OkHttp delegate as bytes arrive (see
// node_modules/expo/ios/Fetch/NativeResponse.swift, "didReceiveResponseData"),
// so server-sent events reach JS while the answer is still being written.
// React Native's own fetch buffers the whole body, and XMLHttpRequest progress
// events would need the full text re-sliced on every tick, so neither is used.

// The stream closed (or the connection dropped) before the server said how the
// turn ended. Whatever arrived before it is still valid.
export class CoachStreamInterruptedError extends Error {
  constructor() {
    super('The answer stopped arriving');
    this.name = 'CoachStreamInterruptedError';
    Object.setPrototypeOf(this, CoachStreamInterruptedError.prototype);
  }
}

// The caller aborted (the user pressed stop).
export class CoachStreamAbortedError extends Error {
  constructor() {
    super('The answer was stopped');
    this.name = 'CoachStreamAbortedError';
    Object.setPrototypeOf(this, CoachStreamAbortedError.prototype);
  }
}

const ERROR_CODES: readonly string[] = ['model_unavailable', 'timeout', 'validation_failed', 'consent_required', 'internal'];

function record(data: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(data);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function memoryProposals(raw: unknown): MemoryDTO[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is MemoryDTO => !!m && typeof m === 'object' && typeof (m as MemoryDTO).id === 'string' && typeof (m as MemoryDTO).value === 'string',
  );
}

// One SSE message -> a typed event, or null for anything malformed or unknown
// (skipped, never fatal). The SSE event name decides the type; `data` is the
// event's JSON, and a `type` inside it is ignored.
export function parseCoachEvent(message: SseMessage): CoachStreamEvent | null {
  const data = record(message.data);
  if (!data) return null;
  switch (message.event) {
    case 'status':
      return typeof data.label === 'string'
        ? {
            type: 'status',
            label: data.label,
            // An unknown step is dropped: the label still shows, as a stepless status.
            ...(data.step === 'route' || data.step === 'facts' || data.step === 'write' ? { step: data.step } : {}),
            ...(typeof data.conversationId === 'string' ? { conversationId: data.conversationId } : {}),
          }
        : null;
    case 'text':
      return typeof data.sentence === 'string' && data.sentence.trim() ? { type: 'text', sentence: data.sentence } : null;
    case 'card': {
      const card = toAnswerCard(data.card);
      return card ? { type: 'card', card } : null;
    }
    case 'memory': {
      const proposals = memoryProposals(data.proposals);
      return proposals.length > 0 ? { type: 'memory', proposals } : null;
    }
    case 'safety':
      return typeof data.text === 'string'
        ? {
            type: 'safety',
            text: data.text,
            resources: Array.isArray(data.resources) ? data.resources.filter((r): r is string => typeof r === 'string') : [],
            ...(typeof data.conversationId === 'string' ? { conversationId: data.conversationId } : {}),
          }
        : null;
    case 'done':
      if (typeof data.messageId !== 'string' || typeof data.conversationId !== 'string') return null;
      return {
        type: 'done',
        messageId: data.messageId,
        conversationId: data.conversationId,
        engine: data.engine === 'hosted' ? 'hosted' : 'local',
        durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
        ...(data.stopped === true ? { stopped: true } : {}),
      };
    case 'error':
      return {
        type: 'error',
        code: typeof data.code === 'string' && ERROR_CODES.includes(data.code) ? (data.code as CoachErrorCode) : 'internal',
        retryable: data.retryable === true,
      };
    default:
      return null;
  }
}

// Carries an error thrown by onEvent past the stream's own error mapping.
class CallerError {
  constructor(readonly error: unknown) {}
}

// Events after which the server has said how the turn ended.
const TERMINAL: ReadonlySet<CoachStreamEvent['type']> = new Set(['done', 'error', 'safety']);

// Sends one message and calls `onEvent` for each event as it arrives. Resolves
// once the stream ends after a done/error/safety event. Rejects with a mapped
// coach error for an HTTP failure (403, 404, ...), CoachStreamAbortedError
// when `signal` aborts, CoachTimeoutError after COACH_REQUEST_TIMEOUT_MS
// (longer than the server's budget), and CoachStreamInterruptedError when the
// stream ends early; once a done/error/safety event has arrived, a later abort,
// timeout or drop resolves instead. An error thrown by `onEvent` cancels the
// request and is rethrown unchanged. Events already delivered stay delivered.
export async function streamCoachMessage(
  body: SendCoachMessageInput,
  onEvent: (event: CoachStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new CoachStreamAbortedError();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, COACH_REQUEST_TIMEOUT_MS);

  const failure = (error: unknown, midStream: boolean): unknown => {
    if (signal?.aborted) return new CoachStreamAbortedError();
    if (timedOut) return new CoachTimeoutError();
    return midStream ? new CoachStreamInterruptedError() : mapCoachError(error);
  };

  try {
    let res: Response;
    try {
      res = await apiResponse(
        '/me/coach/message',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
        expoFetch as unknown as typeof fetch,
      );
    } catch (error) {
      throw failure(error, false);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new CoachStreamInterruptedError();
    const decoder = new TextDecoder();
    const parser = createSseParser();
    let ended = false;
    const deliver = (messages: SseMessage[]) => {
      for (const message of messages) {
        const event = parseCoachEvent(message);
        if (!event) continue;
        if (TERMINAL.has(event.type)) ended = true;
        try {
          onEvent(event);
        } catch (error) {
          throw new CallerError(error);
        }
      }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        deliver(parser.push(decoder.decode(value, { stream: true })));
        // A stop pressed inside onEvent must not wait for the next chunk.
        if (signal?.aborted) throw new CoachStreamAbortedError();
      }
      deliver(parser.push(decoder.decode()));
      deliver(parser.end());
    } catch (error) {
      // The caller's own bug is theirs to see, not a network fault.
      if (error instanceof CallerError) throw error.error;
      // The server already said how the turn ended: a later stop, timeout or
      // dropped connection loses nothing.
      if (ended) return;
      throw failure(error, true);
    }
    if (!ended) throw new CoachStreamInterruptedError();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    // Close the connection however this ended (a no-op after a normal end), so
    // the server stops writing and stores what was shown as a stopped answer.
    controller.abort();
  }
}
