import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CoachConsentRequiredError,
  CoachDisabledError,
  CoachTimeoutError,
  StaleConversationError,
  TooManyMessagesError,
  TurnInProgressError,
  toAnswerCard,
  type AnswerCardDTO,
  type CoachConversationDTO,
  type CoachEngineDTO,
  type CoachHistoryMessageDTO,
  type CoachStreamEvent,
  type MemoryDTO,
  type SendCoachMessageInput,
} from '../api/coach';
import { CoachStreamAbortedError, CoachStreamInterruptedError, streamCoachMessage } from '../api/coachStream';

export interface CoachChatMessage {
  id: string;
  // A live answer's first id, kept when `id` becomes the server's on `done`, so
  // its row is not remounted (losing memory-chip edits or focus). Absent on history.
  clientKey?: string;
  role: 'user' | 'assistant';
  // An assistant message's sentences, joined as they arrive.
  text: string;
  source?: string;
  // Assistant only. 'interrupted': an error or a dropped stream ended it early.
  state?: 'streaming' | 'done' | 'stopped' | 'interrupted';
  card?: AnswerCardDTO;
  memoryProposals?: MemoryDTO[];
  safety?: {
    resources: string[];
    // The user message that triggered it, resent if they say it was a false alarm.
    originalMessage: string;
    overridden: boolean;
  };
  // The user chose Claude but this answer came from the on-device model.
  answeredLocally?: boolean;
  // User only: the request never reached the coach.
  failed?: boolean;
  // Arrived in this session (fades in); history does not.
  fresh?: boolean;
}

export interface CoachTurnError {
  // unavailable: the model could not answer (also any unknown failure);
  // timeout: it took too long; interrupted: the stream dropped part-way;
  // busy: an earlier answer for this user is still being written (409);
  // rate_limited: the per-user message limit (429).
  kind: 'unavailable' | 'timeout' | 'interrupted' | 'busy' | 'rate_limited';
  retryable: boolean;
  // rate_limited only, when the server said how long to wait.
  retryAfterSeconds?: number;
  // Whether any of the answer (text, card or safety reply) was shown before the
  // turn failed. A turn that failed with only a status event, or nothing, had
  // its connection drop before the coach could answer.
  received: boolean;
  // Resent as-is by retry() (never carries the conversation id; that is added fresh).
  request: SendCoachMessageInput;
  // The local user message this turn answers, marked "not sent" on failure and cleared
  // by retry(). Absent for a turn that added no user message (the safety override).
  userMessageId?: string;
}

// One row of the "thinking" checklist: a pipeline step ('route' | 'facts' | 'write'),
// or 'status' for a stepless label from an older server. `done` once the next step
// (or the answer's first sentence) arrives.
export interface ThinkingStep {
  id: string;
  label: string;
  done: boolean;
}

export interface UseCoachConversationOptions {
  // The user's engine setting, to flag an answer the device wrote instead.
  preferredEngine?: CoachEngineDTO;
  onConsentRequired?: () => void;
  onDisabled?: () => void;
}

function strings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [];
}

// A failed request -> the error card. Anything unrecognised is 'unavailable'
// and retryable, so a new server error never strands the user.
function thrownError(thrown: unknown, turn: Pick<CoachTurnError, 'request' | 'userMessageId' | 'received'>): CoachTurnError {
  if (thrown instanceof CoachTimeoutError) return { kind: 'timeout', retryable: true, ...turn };
  if (thrown instanceof CoachStreamInterruptedError) return { kind: 'interrupted', retryable: true, ...turn };
  if (thrown instanceof TurnInProgressError) return { kind: 'busy', retryable: true, ...turn };
  if (thrown instanceof TooManyMessagesError) {
    return { kind: 'rate_limited', retryable: true, ...(thrown.retryAfterSeconds !== undefined ? { retryAfterSeconds: thrown.retryAfterSeconds } : {}), ...turn };
  }
  return { kind: 'unavailable', retryable: true, ...turn };
}

// History rows -> messages, rendered exactly as they were live (spec 1.3). A
// safety card counts as settled once the conversation went on after it.
export function fromHistory(rows: CoachHistoryMessageDTO[]): CoachChatMessage[] {
  return rows.map((row, index) => {
    if (row.role === 'user') return { id: row.id, role: 'user', text: row.text };
    const card = toAnswerCard(row.card);
    const previousUser = rows.slice(0, index).reverse().find((r) => r.role === 'user');
    return {
      id: row.id,
      role: 'assistant',
      text: row.text,
      ...(row.source ? { source: row.source } : {}),
      state: row.stopped ? 'stopped' : 'done',
      ...(card ? { card } : {}),
      ...(row.memoryProposals && row.memoryProposals.length > 0 ? { memoryProposals: row.memoryProposals } : {}),
      ...(row.source === 'safety'
        ? { safety: { resources: strings(row.safety?.resources), originalMessage: previousUser?.text ?? '', overridden: index < rows.length - 1 } }
        : {}),
    };
  });
}

// The conversation on the Coach page: messages, the streaming turn, stop,
// retry and history (spec 1.3-1.5, 6). The screen owns loading and gating;
// this owns everything between "send" and "done".
export function useCoachConversation({ preferredEngine, onConsentRequired, onDisabled }: UseCoachConversationOptions = {}) {
  const [messages, setMessages] = useState<CoachChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [steps, setSteps] = useState<ThinkingStep[]>([]);
  // When the latest answer finished, for the character's "answering" mood.
  const [answeredAt, setAnsweredAt] = useState<number | null>(null);
  const [error, setError] = useState<CoachTurnError | null>(null);

  const conversationIdRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const mounted = useRef(true);
  const seq = useRef(0);
  // Bumped by newChat()/restore(): a turn from an earlier chat never writes into the new one.
  const generation = useRef(0);
  const options = useRef({ preferredEngine, onConsentRequired, onDisabled });
  options.current = { preferredEngine, onConsentRequired, onDisabled };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const runTurn = useCallback(async (request: SendCoachMessageInput, userMessageId?: string) => {
    if (streamingRef.current) return;
    const turn = { request, ...(userMessageId !== undefined ? { userMessageId } : {}) };
    const gen = generation.current;
    const live = () => mounted.current && generation.current === gen;
    const controller = new AbortController();
    controllerRef.current = controller;
    streamingRef.current = true;
    setStreaming(true);
    setStatusLabel(null);
    setSteps([]);
    setError(null);
    setAnsweredAt(null);
    seq.current += 1;
    const pendingId = `pending-${seq.current}`;
    // Becomes the server's message id on `done`. Every update below captures
    // it by value when it is queued, never reads it later.
    let answerId = pendingId;
    setMessages((prev) => [...prev, { id: pendingId, clientKey: pendingId, role: 'assistant', text: '', state: 'streaming', fresh: true }]);

    // Captures the id now: a queued update must find the message under the id it had.
    const patch = (fn: (m: CoachChatMessage) => CoachChatMessage) => {
      const id = answerId;
      setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
    };
    let received = false;
    // Answer content shown (text, card or safety): the same test as `kept` below.
    let shown = false;
    let safetyTurn = false;
    // The server ended the turn early (a stop it saw first): not a finished answer.
    let stoppedTurn = false;
    let consentEvent = false;
    let eventError: CoachTurnError | null = null;

    // A new conversation's id arrives before anything is stored: held from then on, a
    // first turn stopped or dropped before `done` still continues the same conversation.
    const adoptConversation = (id: string | undefined) => {
      if (!id || conversationIdRef.current === id) return;
      conversationIdRef.current = id;
      setConversationId(id);
    };

    // The answer has started (or the turn ended): tick whatever step is still open.
    const tickAllSteps = () =>
      setSteps((prev) => (prev.some((s) => !s.done) ? prev.map((s) => (s.done ? s : { ...s, done: true })) : prev));

    const onEvent = (event: CoachStreamEvent) => {
      if (!live()) return;
      received = true;
      switch (event.type) {
        case 'status':
          adoptConversation(event.conversationId);
          setStatusLabel(event.label);
          setSteps((prev) => {
            const id = event.step ?? 'status';
            // The same step again (or a second stepless label): update it in place.
            if (prev.some((s) => s.id === id)) return prev.map((s) => (s.id === id ? { ...s, label: event.label } : s));
            return [...prev.map((s) => (s.done ? s : { ...s, done: true })), { id, label: event.label, done: false }];
          });
          break;
        case 'text':
          shown = true;
          tickAllSteps();
          patch((m) => ({ ...m, text: m.text ? `${m.text} ${event.sentence}` : event.sentence }));
          break;
        case 'card':
          shown = true;
          // A card-only answer has no text event: the card ends the steps (R15).
          tickAllSteps();
          patch((m) => ({ ...m, card: event.card }));
          break;
        case 'memory':
          patch((m) => ({ ...m, memoryProposals: [...(m.memoryProposals ?? []), ...event.proposals] }));
          break;
        case 'safety':
          adoptConversation(event.conversationId);
          safetyTurn = true;
          shown = true;
          patch((m) => ({
            ...m,
            text: event.text,
            source: 'safety',
            safety: { resources: event.resources, originalMessage: request.message, overridden: false },
          }));
          break;
        case 'done': {
          adoptConversation(event.conversationId);
          if (event.stopped) stoppedTurn = true;
          tickAllSteps();
          const id = answerId;
          const local = options.current.preferredEngine === 'hosted' && event.engine === 'local';
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === id) return { ...m, id: event.messageId, state: event.stopped ? 'stopped' : 'done', ...(local ? { answeredLocally: true } : {}) };
              // A resend under safetyOverride settles the earlier safety card.
              if (request.safetyOverride && m.safety && !m.safety.overridden && m.safety.originalMessage === request.message) {
                return { ...m, safety: { ...m.safety, overridden: true } };
              }
              return m;
            }),
          );
          answerId = event.messageId;
          break;
        }
        case 'error':
          if (event.code === 'consent_required') consentEvent = true;
          // 'internal' also stands for any code this build does not know: fail safe to Retry.
          else eventError = { kind: event.code === 'timeout' ? 'timeout' : 'unavailable', retryable: event.code === 'internal' || event.retryable, received: shown, ...turn };
          break;
      }
    };

    let body: SendCoachMessageInput = conversationIdRef.current ? { ...request, conversationId: conversationIdRef.current } : request;
    let thrown: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      thrown = null;
      try {
        await streamCoachMessage(body, onEvent, controller.signal);
      } catch (e) {
        thrown = e;
      }
      // Transcripts are retained for 90 days, so a held id can be gone; so is the id
      // a first turn announced and then never stored (stopped before any text, or an
      // error). Drop it and ask again as a new conversation, once.
      if (thrown instanceof StaleConversationError && body.conversationId && !received && live()) {
        conversationIdRef.current = null;
        setConversationId(null);
        body = request;
        continue;
      }
      break;
    }

    if (controllerRef.current === controller) controllerRef.current = null;
    if (!live()) return;
    streamingRef.current = false;
    setStreaming(false);
    setStatusLabel(null);
    // `steps` is kept: the thinking text lingers on them briefly after the turn
    // (and an errored turn keeps the rows it had). The next turn clears them.

    if (thrown instanceof CoachStreamAbortedError) {
      // Stopped: the partial text stays, marked, and is not a full answer. A
      // stop before anything arrived leaves no empty bubble behind.
      const id = answerId;
      setMessages((prev) =>
        prev.flatMap((m) => (m.id !== id ? [m] : m.text || m.card || m.safety ? [{ ...m, state: 'stopped' as const }] : [])),
      );
      return;
    }

    const failure: CoachTurnError | null =
      eventError ??
      (thrown && !(thrown instanceof CoachConsentRequiredError) && !(thrown instanceof CoachDisabledError) ? thrownError(thrown, { ...turn, received: shown }) : null);

    if (thrown || consentEvent || failure) {
      const id = answerId;
      setMessages((prev) => {
        const answer = prev.find((m) => m.id === id);
        const kept = !!answer && (!!answer.text || !!answer.card || !!answer.safety);
        let next = kept ? prev.map((m) => (m.id === id ? { ...m, state: 'interrupted' as const } : m)) : prev.filter((m) => m.id !== id);
        // Nothing came back at all: the question never reached the coach. Matched by id, so
        // an earlier question with the same text is never marked.
        if (!received && userMessageId !== undefined) next = next.map((m) => (m.id === userMessageId ? { ...m, failed: true } : m));
        return next;
      });
      if (thrown instanceof CoachConsentRequiredError || consentEvent) options.current.onConsentRequired?.();
      else if (thrown instanceof CoachDisabledError) options.current.onDisabled?.();
      else setError(failure);
      return;
    }

    // A turn can end on `safety` with no `done` (the stream closed right after
    // it): settle the reply here, since no `done` will.
    patch((m) => (m.state === 'streaming' ? { ...m, state: 'done' } : m));
    // A crisis-safety reply is not a moment for the character to celebrate.
    // Nor is an answer that was stopped part-way.
    if (!safetyTurn && !stoppedTurn) setAnsweredAt(Date.now());
  }, []);

  // Returns false when nothing was sent (empty, or an answer is still streaming).
  const send = useCallback(
    (text: string): boolean => {
      const message = text.trim();
      if (!message || streamingRef.current) return false;
      seq.current += 1;
      const userMessageId = `local-${seq.current}`;
      setMessages((prev) => [...prev, { id: userMessageId, role: 'user', text: message }]);
      void runTurn({ message }, userMessageId);
      return true;
    },
    [runTurn],
  );

  const stop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    if (!error || !error.retryable || streamingRef.current) return;
    const { request, userMessageId } = error;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      const trimmed = last && last.role === 'assistant' && last.state === 'interrupted' ? prev.slice(0, -1) : prev;
      return trimmed.map((m) => (m.id === userMessageId && m.failed ? { ...m, failed: undefined } : m));
    });
    void runTurn(request, userMessageId);
  }, [error, runTurn]);

  const overrideSafety = useCallback(
    (originalMessage: string) => {
      if (streamingRef.current) return;
      void runTurn({ message: originalMessage, safetyOverride: true });
    },
    [runTurn],
  );

  const reset = useCallback((next: CoachChatMessage[], id: string | null) => {
    generation.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    streamingRef.current = false;
    conversationIdRef.current = id;
    setStreaming(false);
    setStatusLabel(null);
    setSteps([]);
    setError(null);
    setAnsweredAt(null);
    setConversationId(id);
    setMessages(next);
  }, []);

  const newChat = useCallback(() => reset([], null), [reset]);

  const restore = useCallback(
    (conversation: CoachConversationDTO) => reset(fromHistory(conversation.messages), conversation.conversationId),
    [reset],
  );

  const last = messages[messages.length - 1];
  const waiting = streaming && !!last && last.role === 'assistant' && !last.text && !last.safety;

  return { messages, conversationId, streaming, waiting, statusLabel, steps, answeredAt, error, send, stop, retry, overrideSafety, newChat, restore };
}
