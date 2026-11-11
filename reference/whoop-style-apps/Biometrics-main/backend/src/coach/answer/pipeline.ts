// The answer pipeline (spec 2026-09-30, section 2): "facts first, one pass".
//
//   crisis classifier -> memory feedback -> route -> status (step 'route') -> fact
//   sheet -> status ('facts') -> status ('write') -> ONE streamed model call -> each sentence validated as it completes
//   (dropped when it fails, the rest keeps streaming; a closing stock question
//   or offer is dropped once another sentence was shown) -> one regeneration only
//   when no sentence at all could be shown -> card resolved from the fact sheet
//   -> memory block through the existing memory validation -> the clean reply,
//   card, engine and duration persisted -> done.
//
// Nothing shown is ever retracted: a sentence is only emitted once validated.
// Errors are events (spec section 6), never a template reply: model
// unreachable/failed -> model_unavailable, budget -> timeout, two failed
// attempts -> validation_failed, anything else -> internal. Only a finished
// (or stopped-with-text) answer is persisted, so Retry resends cleanly.
// It replaced the multi-round tool loop (removed in phase 5).

import { randomUUID } from 'crypto';
import { localCivilDateOrUtc } from '../../biometrics/civilDate';
import { prisma } from '../../db/client';
import { CoachClock, systemClock } from '../clock';
import { classifyCrisis, CRISIS_RESOURCES, SAFETY_REPLY } from '../guardrails/crisis';
import {
  createPendingMemories,
  MAX_PROPOSALS_PER_TURN,
  MemoryDTO,
  MemoryProposal,
  resolvePendingMemories,
  validateMemoryInput,
} from '../memory';
import type { CoachModelProvider } from '../model/provider';
import { resolvePersona } from '../personas';
import type { CoachEventAttributes, CoachEventName, CoachTelemetry } from '../telemetry';
import type { AnswerCard } from './card';
import { isStockCheckIn } from './checkIn';
import { buildFactSheet, defaultFactData, FactData, FactSheet } from './facts';
import { cleanLegacyText } from './history';
import { parseModelOutput } from './parse';
import { buildAnswerSystemPrompt, buildRegenerationNote } from './prompt';
import { AnswerRoute, routeQuestion } from './route';
import { sentenceSplitter } from './sentences';
import { resolveCard, SentenceVerdict, validateSentence } from './validate';

export type AnswerEngine = 'local' | 'hosted';

export type AnswerEvent =
  // conversationId is sent before anything is stored, so a client whose first turn is
  // stopped or dropped before `done` still continues the same conversation. When that
  // turn stores nothing, the id was never created and the next message gets a 404.
  | { type: 'status'; step: AnswerStep; label: string; conversationId: string }
  | { type: 'text'; sentence: string }
  | { type: 'card'; card: AnswerCard }
  | { type: 'memory'; proposals: MemoryDTO[] }
  | { type: 'safety'; text: string; resources: unknown[]; conversationId: string }
  | { type: 'done'; messageId: string; conversationId: string; engine: AnswerEngine; durationMs: number; stopped?: boolean }
  | { type: 'error'; code: 'model_unavailable' | 'timeout' | 'validation_failed' | 'consent_required' | 'internal'; retryable: boolean };

export interface AnswerInput {
  userId: string;
  /** Already trimmed and length-checked by the route. */
  message: string;
  /** Prior turns of this conversation, oldest first (the route loads the last ANSWER_HISTORY_WINDOW). */
  history: Array<{ role: 'user' | 'assistant'; text: string }>;
  /**
   * An existing conversation the caller has checked belongs to the user; omitted starts a
   * new one, whose id is reserved up front and only created when the turn is stored.
   */
  conversationId?: string;
  safetyOverride?: boolean;
  /** Aborted when the user taps stop (the client went away). */
  signal?: AbortSignal;
  /** When the message arrived; the user row is stamped with it. */
  receivedAt?: Date;
}

export interface AnswerDeps {
  provider: CoachModelProvider;
  /** The engine selected for this message. */
  engine: AnswerEngine;
  /**
   * The engine that actually answered, when it can differ from `engine` (a hosted
   * call that fell back to the local model). Read after streaming, so the stored
   * reply, the done event and telemetry all name the model that wrote the text.
   */
  servedEngine?: () => AnswerEngine;
  telemetry: CoachTelemetry;
  clock?: CoachClock;
  /** End-to-end budget for this answer (COACH_LOCAL_BUDGET_MS / COACH_HOSTED_BUDGET_MS). */
  budgetMs?: number;
  factData?: FactData;
  loadUser?: (userId: string) => Promise<{ timezone: string; coachPersonaId: string | null }>;
  /** The per-sentence check. Only the eval harness replaces it (to prove its own number check); never the server. */
  validate?: (sentence: string, sheet: FactSheet) => SentenceVerdict;
}

export const DEFAULT_ANSWER_BUDGET_MS = 45_000;
export const ANSWER_MAX_TOKENS = 600;
export const ANSWER_HISTORY_WINDOW = 10;
const MAX_ATTEMPTS = 2;

export type AnswerStep = 'route' | 'facts' | 'write';

/**
 * What the app's "What it's doing" list shows (spec 2026-10-01 §5). Per route,
 * because each loads different data (facts.ts) and a general question is not
 * about the user's day: every label names work that route really does.
 */
export const STEP_LABELS: Record<AnswerRoute, Record<AnswerStep, string>> = {
  today: { route: 'Looking at your day…', facts: 'Comparing today with your usual…', write: 'Writing it up…' },
  sleep: { route: 'Looking at your sleep…', facts: 'Going through your recent nights…', write: 'Writing it up…' },
  trends: { route: 'Looking at your trends…', facts: 'Comparing your last 30 days…', write: 'Writing it up…' },
  general: { route: 'Thinking it over…', facts: 'Checking your goals…', write: 'Writing an answer…' },
};

/** Persisted on the assistant row: reasons and counts only, never text. */
export type AnswerGuardrailEvent =
  | { type: 'sentence_dropped'; reason: 'unknown_number' | 'disallowed_topic' | 'stock_question'; attempt: number }
  | { type: 'regenerated' }
  | { type: 'card_dropped' }
  | { type: 'stopped' };

async function defaultLoadUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, coachPersonaId: true } });
  return { timezone: user?.timezone ?? 'UTC', coachPersonaId: user?.coachPersonaId ?? null };
}

const DEADLINE = Symbol('deadline');
const STOPPED = Symbol('stopped');
type Interrupt = typeof DEADLINE | typeof STOPPED;

interface AttemptResult {
  outcome: 'ok' | 'deadline' | 'stopped' | 'model_error';
  accepted: string[];
  rejected: Array<'unknown_number' | 'disallowed_topic'>;
  raw: string;
}

export async function* runAnswer(input: AnswerInput, deps: AnswerDeps): AsyncGenerator<AnswerEvent, void, undefined> {
  const clock = deps.clock ?? systemClock;
  const startedAt = clock.now();
  const receivedAt = input.receivedAt ?? new Date();
  const budget = deps.budgetMs ?? DEFAULT_ANSWER_BUDGET_MS;
  const factData = deps.factData ?? defaultFactData;
  const servedEngine = (): AnswerEngine => deps.servedEngine?.() ?? deps.engine;
  const controller = new AbortController();
  const guardrailEvents: AnswerGuardrailEvent[] = [];
  // A new conversation's id is reserved now (status/safety carry it) and its row is created
  // by persist(), so a turn that stores nothing leaves no empty conversation behind.
  const isNewConversation = input.conversationId === undefined;
  const conversationId = input.conversationId ?? randomUUID();

  // Budget and stop, as promises every await is raced against.
  let cancelTimer = () => {};
  const deadline = new Promise<Interrupt>((resolve) => {
    const handle = clock.setTimer(() => resolve(DEADLINE), budget);
    cancelTimer = () => handle.cancel();
  });
  const stopped = new Promise<Interrupt>((resolve) => {
    if (input.signal?.aborted) resolve(STOPPED);
    input.signal?.addEventListener('abort', () => resolve(STOPPED), { once: true });
  });
  const race = <T>(p: Promise<T>): Promise<T | Interrupt> => {
    p.catch(() => {}); // a loser that rejects later must not become an unhandled rejection
    return Promise.race([p, deadline, stopped]);
  };

  let personaId = 'unknown';
  const emit = (name: CoachEventName, attributes: CoachEventAttributes) =>
    deps.telemetry.emit({ name, userId: input.userId, personaId, attributes });
  const fail = (code: Extract<AnswerEvent, { type: 'error' }>['code']): AnswerEvent => {
    emit('coach.answer_error', { code, engine: servedEngine() });
    return { type: 'error', code, retryable: true };
  };

  async function persist(reply: {
    text: string;
    source: 'MODEL' | 'SAFETY';
    card: AnswerCard | null;
    model: boolean;
    proposals: MemoryProposal[];
  }): Promise<{ messageId: string; conversationId: string; durationMs: number; memories: MemoryDTO[] }> {
    const durationMs = clock.now() - startedAt;
    // The assistant row is stamped strictly after the user row so transcript order is unambiguous.
    const repliedAt = new Date(Math.max(Date.now(), receivedAt.getTime() + 1));
    const saved = await prisma.$transaction(async (tx) => {
      const id = conversationId;
      if (isNewConversation) {
        await tx.coachConversation.create({ data: { id, userId: input.userId, createdAt: receivedAt, lastMessageAt: repliedAt } });
      } else {
        await tx.coachConversation.update({ where: { id }, data: { lastMessageAt: repliedAt } });
      }
      await tx.coachMessage.create({
        data: { conversationId: id, userId: input.userId, role: 'USER', text: input.message, createdAt: receivedAt },
      });
      const assistant = await tx.coachMessage.create({
        data: {
          conversationId: id,
          userId: input.userId,
          role: 'ASSISTANT',
          text: reply.text,
          source: reply.source,
          ...(guardrailEvents.length > 0 ? { guardrailEvents: [...guardrailEvents] } : {}),
          ...(reply.card ? { card: reply.card as object } : {}),
          ...(reply.model ? { engine: servedEngine() === 'hosted' ? ('HOSTED' as const) : ('LOCAL' as const), durationMs } : {}),
          createdAt: repliedAt,
        },
      });
      // Proposals are written in the same transaction as the reply that shows them, stamped
      // with this conversation: a PENDING row the user never received must never exist,
      // because their next message in the thread would silently confirm it.
      const memories = reply.proposals.length > 0 ? await createPendingMemories(input.userId, reply.proposals, id, tx) : [];
      // Linked to this reply so history shows their chips on it.
      if (memories.length > 0) {
        await tx.coachMemory.updateMany({
          where: { id: { in: memories.map((m) => m.id) }, userId: input.userId },
          data: { messageId: assistant.id },
        });
      }
      return { id, assistantId: assistant.id, memories };
    });
    return { messageId: saved.assistantId, conversationId: saved.id, durationMs, memories: saved.memories };
  }

  try {
    // 1. Crisis first, unchanged: the fixed, non-model safety reply. The classifier is pure,
    // so it runs before anything that can fail, and the reply and its resources reach the
    // user before anything is written: a failure after that can add an error, never replace it.
    const crisis = classifyCrisis(input.message);
    if (crisis.triggered && !input.safetyOverride) {
      yield { type: 'safety', text: SAFETY_REPLY, resources: [...CRISIS_RESOURCES], conversationId };
      try {
        personaId = resolvePersona((await (deps.loadUser ?? defaultLoadUser)(input.userId)).coachPersonaId).id;
      } catch {
        /* the persona only labels telemetry */
      }
      emit('coach.safety_classifier', { triggered: true, overridden: false });
      const saved = await persist({ text: SAFETY_REPLY, source: 'SAFETY', card: null, model: false, proposals: [] });
      yield { type: 'done', messageId: saved.messageId, conversationId: saved.conversationId, engine: servedEngine(), durationMs: saved.durationMs };
      return;
    }

    let user: { timezone: string; coachPersonaId: string | null };
    try {
      user = await (deps.loadUser ?? defaultLoadUser)(input.userId);
    } catch {
      yield fail('internal');
      return;
    }
    const persona = resolvePersona(user.coachPersonaId);
    personaId = persona.id;
    if (crisis.triggered || input.safetyOverride) {
      emit('coach.safety_classifier', { triggered: crisis.triggered, overridden: Boolean(input.safetyOverride) });
    }

    // 2. Feedback on memory proposed earlier in this conversation. Best effort.
    try {
      const resolution = await resolvePendingMemories(input.userId, input.message, input.conversationId ?? null);
      if (resolution.confirmed + resolution.dismissed > 0) {
        emit('coach.memory_resolved', { confirmed: resolution.confirmed, dismissed: resolution.dismissed });
      }
    } catch {
      /* memory is best-effort context */
    }

    // 3. Route, and tell the user what is happening.
    const previousUserMessage = [...input.history].reverse().find((m) => m.role === 'user')?.text;
    const route = routeQuestion(input.message, previousUserMessage);
    yield { type: 'status', step: 'route', label: STEP_LABELS[route].route, conversationId };

    // 4. The fact sheet.
    const today = localCivilDateOrUtc(clock.now(), user.timezone);
    let sheet: FactSheet;
    try {
      const built = await race(buildFactSheet(input.userId, route, { ...factData, today }));
      if (built === STOPPED) return;
      if (built === DEADLINE) {
        controller.abort();
        emit('coach.latency_budget_exceeded', { budgetMs: budget, engine: servedEngine() });
        yield fail('timeout');
        return;
      }
      sheet = built;
    } catch {
      yield fail('internal');
      return;
    }
    yield { type: 'status', step: 'facts', label: STEP_LABELS[route].facts, conversationId };

    const system = buildAnswerSystemPrompt(persona, { today, sheet });
    // A turn with nothing left after cleaning (an old row that held only the disclaimer or a
    // memory note) is dropped: the hosted API rejects an empty message.
    const messages = [
      ...input.history
        .map((m) => ({ role: m.role, content: m.role === 'assistant' ? cleanLegacyText(m.text) : m.text.trim() }))
        .filter((m) => m.content.length > 0)
        .slice(-ANSWER_HISTORY_WINDOW),
      { role: 'user' as const, content: input.message },
    ];

    // 5. One streamed call per attempt, validated sentence by sentence.
    async function* attempt(n: number, extra: string | null): AsyncGenerator<AnswerEvent, AttemptResult, undefined> {
      const result: AttemptResult = { outcome: 'ok', accepted: [], rejected: [], raw: '' };
      const splitter = sentenceSplitter();
      const handle = function* (sentences: string[]): Generator<AnswerEvent> {
        for (const sentence of sentences) {
          const verdict = (deps.validate ?? validateSentence)(sentence, sheet);
          // A closing offer or check-in reads as automated; drop it once the reply already has a sentence,
          // so the reply still reads (these are always the last sentence, so nothing reads disjointed).
          if (verdict.ok && result.accepted.length > 0 && isStockCheckIn(sentence)) {
            guardrailEvents.push({ type: 'sentence_dropped', reason: 'stock_question', attempt: n });
            emit('coach.answer_sentence_dropped', { reason: 'stock_question', attempt: n, route });
            continue;
          }
          if (verdict.ok) {
            result.accepted.push(sentence);
            yield { type: 'text', sentence };
          } else {
            result.rejected.push(verdict.reason);
            guardrailEvents.push({ type: 'sentence_dropped', reason: verdict.reason, attempt: n });
            emit('coach.answer_sentence_dropped', { reason: verdict.reason, attempt: n, route });
          }
        }
      };
      let iterator: AsyncIterator<string>;
      try {
        iterator = deps.provider
          .stream({
            system,
            messages: extra ? [...messages, { role: 'user', content: extra }] : messages,
            maxTokens: ANSWER_MAX_TOKENS,
            signal: controller.signal,
          })
          [Symbol.asyncIterator]();
      } catch {
        return { ...result, outcome: 'model_error' };
      }
      for (;;) {
        let next: IteratorResult<string> | Interrupt;
        try {
          next = await race(iterator.next());
        } catch {
          return { ...result, outcome: 'model_error' };
        }
        if (next === DEADLINE || next === STOPPED) {
          // Stop the model now, not when the generator finally unwinds. return() is not awaited:
          // on a generator still suspended in next() it only settles once that next() does.
          controller.abort();
          iterator.return?.()?.catch(() => {});
          return { ...result, outcome: next === DEADLINE ? 'deadline' : 'stopped' };
        }
        if (next.done) break;
        result.raw += next.value;
        yield* handle(splitter.push(next.value));
      }
      yield* handle(splitter.end());
      return result;
    }

    let result: AttemptResult | null = null;
    let attempts = 0;
    let note: string | null = null;
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      attempts = n;
      if (n === 1) yield { type: 'status', step: 'write', label: STEP_LABELS[route].write, conversationId };
      result = yield* attempt(n, note);
      if (result.outcome !== 'ok' || result.accepted.length > 0) break;
      if (n < MAX_ATTEMPTS) {
        const reasons = result.rejected.length > 0 ? [...new Set(result.rejected)] : (['empty'] as const);
        guardrailEvents.push({ type: 'regenerated' });
        emit('coach.answer_regenerated', { route, reasons: reasons.join(',') });
        note = buildRegenerationNote(reasons);
      }
    }
    if (!result) throw new Error('unreachable');

    if (result.outcome === 'model_error') {
      yield fail('model_unavailable');
      return;
    }
    if (result.outcome === 'deadline') {
      emit('coach.latency_budget_exceeded', { budgetMs: budget, engine: servedEngine() });
      yield fail('timeout');
      return;
    }
    if (result.outcome === 'stopped') {
      // Stop: keep what the user already saw, marked; not a full answer (no card, no memory).
      if (result.accepted.length === 0) return;
      guardrailEvents.push({ type: 'stopped' });
      const saved = await persist({ text: result.accepted.join(' '), source: 'MODEL', card: null, model: true, proposals: [] });
      yield { type: 'done', messageId: saved.messageId, conversationId: saved.conversationId, engine: servedEngine(), durationMs: saved.durationMs, stopped: true };
      return;
    }
    if (result.accepted.length === 0) {
      yield fail('validation_failed');
      return;
    }

    // 6. Card and memory blocks from the text after the fence.
    const parsed = parseModelOutput(result.raw);
    const card = resolveCard(parsed.card, sheet);
    if (parsed.card && !card) guardrailEvents.push({ type: 'card_dropped' });
    if (card) yield { type: 'card', card };

    const proposals: MemoryProposal[] = [];
    for (const item of parsed.memory ?? []) {
      if (proposals.length >= MAX_PROPOSALS_PER_TURN) break;
      const checked = validateMemoryInput(item);
      if (checked.ok) proposals.push({ category: checked.category, value: checked.value });
      else emit('coach.memory_rejected', { reason: checked.reason });
    }
    // 7. Persist the clean reply with its proposals in one transaction, then finish. If that
    // fails with proposals, the answer is still valid: store it once more without them.
    const reply = { text: result.accepted.join(' '), source: 'MODEL' as const, card, model: true };
    let saved: Awaited<ReturnType<typeof persist>>;
    try {
      saved = await persist({ ...reply, proposals });
    } catch (err) {
      if (proposals.length === 0) throw err;
      saved = await persist({ ...reply, proposals: [] });
    }
    const memories = saved.memories;
    if (memories.length > 0) {
      emit('coach.memory_proposed', { count: memories.length });
      yield { type: 'memory', proposals: memories };
    }
    emit('coach.answer_done', {
      route,
      engine: servedEngine(),
      sentences: result.accepted.length,
      dropped: result.rejected.length,
      card: card !== null,
      attempts,
      durationMs: saved.durationMs,
    });
    yield { type: 'done', messageId: saved.messageId, conversationId: saved.conversationId, engine: servedEngine(), durationMs: saved.durationMs };
  } catch {
    // Error names only are ever logged by the caller; the event carries the code.
    yield fail('internal');
  } finally {
    cancelTimer();
    controller.abort();
  }
}
