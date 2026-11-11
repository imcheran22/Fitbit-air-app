// Test helpers for screens that stream coach answers. Kept out of __tests__ so
// jest does not collect it as a suite (like characterContext.tsx). Each test
// file mocks ../src/api/coachStream itself and passes the mocked function in.
import { act } from '@testing-library/react-native';
import type { CoachStreamEvent, SendCoachMessageInput } from '../src/api/coach';
import { CoachStreamAbortedError } from '../src/api/coachStream';

type StreamMock = jest.Mock;
type OnEvent = (event: CoachStreamEvent) => void;

export function doneEvent(overrides: Partial<Extract<CoachStreamEvent, { type: 'done' }>> = {}): CoachStreamEvent {
  return { type: 'done', messageId: `a-${Math.random().toString(36).slice(2, 8)}`, conversationId: 'conv-1', engine: 'local', durationMs: 3000, ...overrides };
}

// A whole answer: one text event per sentence, then done.
export function answer(text: string, overrides: Partial<Extract<CoachStreamEvent, { type: 'done' }>> = {}): CoachStreamEvent[] {
  return [{ type: 'text', sentence: text }, doneEvent(overrides)];
}

// The next call emits `events` then resolves, or rejects with `error`.
export function scriptTurn(stream: StreamMock, events: CoachStreamEvent[], error?: unknown): void {
  stream.mockImplementationOnce(async (_body: SendCoachMessageInput, onEvent: OnEvent) => {
    for (const event of events) onEvent(event);
    if (error) throw error;
  });
}

// The next call stays open for the test to drive; it rejects with
// CoachStreamAbortedError when its signal aborts (stop, new chat, unmount).
export function openTurn(stream: StreamMock) {
  let onEvent: OnEvent = () => {};
  let resolve: () => void = () => {};
  let signal: AbortSignal | undefined;
  stream.mockImplementationOnce(
    (_body: SendCoachMessageInput, emit: OnEvent, s: AbortSignal) =>
      new Promise<void>((res, rej) => {
        onEvent = emit;
        resolve = res;
        signal = s;
        s.addEventListener('abort', () => rej(new CoachStreamAbortedError()));
      }),
  );
  return {
    emit: async (...events: CoachStreamEvent[]) =>
      act(async () => {
        for (const event of events) onEvent(event);
      }),
    finish: async (...events: CoachStreamEvent[]) =>
      act(async () => {
        for (const event of events) onEvent(event);
        resolve();
      }),
    get signal() {
      return signal;
    },
  };
}
