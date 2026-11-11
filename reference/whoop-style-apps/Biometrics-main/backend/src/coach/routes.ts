import { NextFunction, Response, Router } from 'express';
import { AuthedRequest, requireAuth } from '../auth/middleware';
import { prisma } from '../db/client';
import { CoachClock, systemClock } from './clock';
import { COACH_CONSENT, COACH_HOSTED_CONSENT, consentTextFor, grantConsent, hasCurrentConsent, revokeConsent, setEngineIfConsented } from './consent';
import { getAnswerBudgetMs, getCoachProvider, getHostedProvider, isCoachEnabled, isExpoPushProvider } from './config';
import { isExpoPushToken } from './push';
import { TurnInProgressError, TurnRateLimitedError, withTurnGuard } from './turnGuard';
import type { CoachModelProvider } from './model/provider';
import { toMemoryDTO, validateMemoryValue } from './memory';
import { cleanLegacyText, LEGACY_DISCLAIMER } from './answer/history';
import type { FactData } from './answer/facts';
import { ANSWER_HISTORY_WINDOW, AnswerDeps, AnswerEvent, runAnswer } from './answer/pipeline';
import { warmModel } from './answer/warm';
import { clearTodaySummary, generateTodaySummary, getTodaySummary, summaryEngineDeps, TodayDeps } from './answer/today';
import type { MemoryDTO } from './memory';
import { DEFAULT_PERSONA_ID, findPersona, isRetiredCharacterId, listPersonas, resolvePersona } from './personas';
import { isThinkingAttachment, isThinkingText, resolveThinkingAttachment, resolveThinkingText } from './thinking';
import { CRISIS_RESOURCES } from './guardrails/crisis';
import { selectEngine } from './engine';
import { CoachTelemetry, LoggerCoachTelemetry } from './telemetry';

export const MAX_MESSAGE_CHARS = 2000;
export const MAX_PUSH_TOKEN_CHARS = 512;
const MAX_TRANSCRIPT_MESSAGES = 200;

export interface CoachRouterDeps {
  getProvider: () => CoachModelProvider;
  /** The hosted engine's provider, or null while it is not offered (COACH_HOSTED_ENABLED + ANTHROPIC_API_KEY). */
  getHostedProvider: () => CoachModelProvider | null;
  /** Runs work after the response has been sent (the day summary). Default: fire and forget, failures logged. */
  background: (task: () => Promise<unknown>) => void;
  /** Overrides for the day summary's data and timing (tests). */
  today?: TodayDeps;
  telemetry: CoachTelemetry;
  clock: CoachClock;
  /** Overrides COACH_LOCAL_BUDGET_MS (tests). */
  answerBudgetMs?: number;
  /** Overrides the fact sheet's data access (tests). */
  factData?: FactData;
}

interface MessageRow {
  id: string;
  role: 'USER' | 'ASSISTANT';
  text: string;
  source: 'MODEL' | 'FALLBACK' | 'SAFETY' | null;
  card: unknown;
  engine: 'LOCAL' | 'HOSTED' | null;
  guardrailEvents: unknown;
  createdAt: Date;
}

const isStopped = (events: unknown): boolean =>
  Array.isArray(events) && events.some((e) => (e as { type?: unknown } | null)?.type === 'stopped');

/**
 * One transcript message, carrying everything the live stream showed so history
 * renders the same (spec 1.3): the resolved card, the engine, the stopped
 * marker, the safety resources and the memory chips proposed on it. Every key
 * an older app build reads (id, role, text, source, createdAt) keeps its shape.
 */
const messageDTO = (m: MessageRow, memoryProposals: MemoryDTO[] = []) => ({
  id: m.id,
  role: m.role === 'USER' ? 'user' : 'assistant',
  // Pre-redesign replies were stored with the disclaimer and memory note appended; the page shows
  // the disclaimer once as a footnote and memories as chips, so neither belongs in the text.
  text: m.role === 'ASSISTANT' ? cleanLegacyText(m.text) : m.text,
  source: m.source === null ? null : (m.source.toLowerCase() as 'model' | 'fallback' | 'safety'),
  // The resolved answer card, so history renders exactly as it did live; null for talk-only and older rows.
  card: typeof m.card === 'object' && m.card !== null && !Array.isArray(m.card) ? m.card : null,
  engine: m.engine === null ? null : (m.engine.toLowerCase() as 'local' | 'hosted'),
  stopped: isStopped(m.guardrailEvents),
  safety: m.source === 'SAFETY' ? { resources: [...CRISIS_RESOURCES] } : null,
  memoryProposals,
  createdAt: m.createdAt.toISOString(),
});

export const CONVERSATION_PAGE_SIZE = 20;
const TITLE_MAX_CHARS = 60;

/** The first question, on one line, cut to 60 characters. */
function conversationTitle(text: string | undefined): string {
  const line = (text ?? '').replace(/\s+/g, ' ').trim();
  return line.length <= TITLE_MAX_CHARS ? line : `${line.slice(0, TITLE_MAX_CHARS - 1)}…`;
}

/** Writes one server-sent event: `event: <type>` and the whole event as JSON data. */
function writeSse(res: Response, event: AnswerEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

/**
 * Streams the pipeline as SSE. A client that goes away (the user tapped stop,
 * or the network dropped) aborts the answer; the pipeline still runs to its
 * end so a partial reply is stored, but nothing more is written.
 */
async function streamAnswer(events: AsyncIterable<AnswerEvent>, res: Response, stop: AbortController): Promise<void> {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  let open = true;
  res.on('close', () => {
    open = false;
    if (!res.writableFinished) stop.abort();
  });
  // A client that left before the headers went out never fires 'close' again.
  if (res.destroyed) {
    open = false;
    stop.abort();
  }
  for await (const event of events) {
    if (open) writeSse(res, event);
  }
  if (open) res.end();
}

interface CollectedAnswer {
  safety?: { text: string; resources: unknown[] };
  memory?: MemoryDTO[];
  done?: Extract<AnswerEvent, { type: 'done' }>;
  error?: Extract<AnswerEvent, { type: 'error' }>;
}

/** Consumes the whole pipeline for the JSON response older app builds expect. */
async function collectAnswer(events: AsyncIterable<AnswerEvent>): Promise<CollectedAnswer> {
  const out: CollectedAnswer = {};
  for await (const e of events) {
    if (e.type === 'safety') out.safety = { text: e.text, resources: e.resources };
    else if (e.type === 'memory') out.memory = e.proposals;
    else if (e.type === 'done') out.done = e;
    else if (e.type === 'error') out.error = e;
  }
  return out;
}

/** Logs the failure class only: a Prisma or provider error message can echo request values. */
function logFailure(where: string, err: unknown): void {
  const name = err instanceof Error ? err.name : 'unknown';
  console.error(JSON.stringify({ event: 'coach.request_failed', where, error: name }));
}

export function createCoachRouter(overrides: Partial<CoachRouterDeps> = {}): Router {
  const deps: CoachRouterDeps = {
    getProvider: overrides.getProvider ?? getCoachProvider,
    getHostedProvider: overrides.getHostedProvider ?? getHostedProvider,
    background:
      overrides.background ??
      ((task) => {
        void task().catch((err) => logFailure('background', err));
      }),
    telemetry: overrides.telemetry ?? new LoggerCoachTelemetry(),
    clock: overrides.clock ?? systemClock,
  };
  const router = Router();

  // The day summary is written by the same engine the user's messages go to.
  const todayDeps: TodayDeps = { ...summaryEngineDeps(deps), ...overrides.today };

  // Auth first, so an unauthenticated caller learns nothing about the flag.
  function requireEnabled(_req: AuthedRequest, res: Response, next: NextFunction): void {
    if (!isCoachEnabled()) {
      res.status(404).json({ error: 'coach_disabled' });
      return;
    }
    next();
  }

  router.get('/me/coach/status', requireAuth, async (req: AuthedRequest, res) => {
    let warm = false;
    try {
      const userId = req.userId!;
      const enabled = isCoachEnabled();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { coachPersonaId: true, coachEngine: true, coachThinkingAttachment: true, coachThinkingText: true },
      });
      const storedPersonaId = user?.coachPersonaId ?? null;
      const hostedAvailable = enabled && deps.getHostedProvider() !== null;
      const localConsented = enabled ? await hasCurrentConsent(userId) : false;
      const hostedConsented = enabled ? await hasCurrentConsent(userId, 'hosted') : false;
      res.json({
        enabled,
        consented: localConsented,
        consent: { version: COACH_CONSENT.version, summary: COACH_CONSENT.summary, dataItems: COACH_CONSENT.dataItems },
        // The engine that will actually answer: a stored HOSTED choice only counts while it is offered and both
        // the coach consent and the hosted consent are current (the same rule PUT /me/coach/engine applies).
        engine: user?.coachEngine === 'HOSTED' && hostedAvailable && localConsented && hostedConsented ? 'hosted' : 'local',
        engines: {
          hosted: {
            available: hostedAvailable,
            consented: hostedConsented,
            consent: {
              version: COACH_HOSTED_CONSENT.version,
              summary: COACH_HOSTED_CONSENT.summary,
              dataItems: COACH_HOSTED_CONSENT.dataItems,
            },
          },
        },
        personaId: resolvePersona(storedPersonaId).id,
        // False until the user picks a character (Skip picks Mochi), so the app shows its picker once.
        // A stored id that is no longer live (a retired character the migration missed) re-opens it (R24).
        personaChosen: storedPersonaId !== null && findPersona(storedPersonaId) !== undefined,
        personas: listPersonas().map((p) => ({
          id: p.id,
          name: p.name,
          verbosity: p.verbosity,
          proactivity: p.proactivity,
          tagline: p.tagline ?? null,
          greeting: p.greeting ?? null,
        })),
        thinkingAttachment: resolveThinkingAttachment(user?.coachThinkingAttachment),
        thinkingText: resolveThinkingText(user?.coachThinkingText),
      });
      warm = enabled;
    } catch (err) {
      logFailure('status', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
    // The app hits status when it opens the Coach tab: load the model now so the first answer
    // skips the cold start. After the response, and never able to fail it.
    if (warm) {
      try {
        warmModel(deps.getProvider());
      } catch (err) {
        logFailure('status_warm', err);
      }
    }
  });

  router.post('/me/coach/consent', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    const version: unknown = req.body?.version;
    const rawScope: unknown = req.body?.scope;
    if (typeof version !== 'string') {
      res.status(400).json({ error: 'version must be a string' });
      return;
    }
    if (rawScope !== undefined && rawScope !== 'local' && rawScope !== 'hosted') {
      res.status(400).json({ error: "scope must be 'local' or 'hosted'" });
      return;
    }
    const scope = rawScope ?? 'local';
    if (version !== consentTextFor(scope).version) {
      res.status(409).json({ error: 'stale_consent_version' });
      return;
    }
    try {
      if (scope === 'hosted') {
        if (deps.getHostedProvider() === null) {
          res.status(404).json({ error: 'hosted_unavailable' });
          return;
        }
      }
      // The hosted opt-in builds on the coach consent: it only changes WHERE the answer is written.
      // grantConsent checks the local consent in the same transaction as the hosted insert.
      if (!(await grantConsent(req.userId!, scope))) {
        res.status(403).json({ error: 'consent_required' });
        return;
      }
      res.json({ consented: true });
    } catch (err) {
      logFailure('consent_grant', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  router.delete('/me/coach/consent', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    const scope = req.query.scope;
    if (scope !== undefined && scope !== 'hosted') {
      res.status(400).json({ error: "scope must be 'hosted' when given" });
      return;
    }
    try {
      await revokeConsent(req.userId!, scope === 'hosted' ? 'hosted' : 'all');
      res.status(204).end();
    } catch (err) {
      logFailure('consent_revoke', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  router.put('/me/coach/engine', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    const engine: unknown = req.body?.engine;
    if (engine !== 'local' && engine !== 'hosted') {
      res.status(400).json({ error: "engine must be 'local' or 'hosted'" });
      return;
    }
    const userId = req.userId!;
    try {
      if (engine === 'hosted' && deps.getHostedProvider() === null) {
        res.status(404).json({ error: 'hosted_unavailable' });
        return;
      }
      // Both consents are checked and the choice written under the per-user consent lock that grant and revoke take.
      const result = await setEngineIfConsented(userId, engine);
      if (result === 'consent_required') {
        res.status(403).json({ error: 'consent_required' });
        return;
      }
      if (result === 'user_not_found') {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({ engine });
    } catch (err) {
      logFailure('engine', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  // Bars and the template sentence are the user's own numbers, computed here with no model, so they
  // need the flag but not consent. The AI sentence is written in the background, and only with consent.
  router.get('/me/coach/today', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    try {
      // Only a consented user's sentence is ever written, so only then is a run worth scheduling
      // (generateTodaySummary checks again); otherwise every page load would queue a no-op.
      const canWrite = isCoachEnabled() && (await hasCurrentConsent(userId, 'local'));
      const summary = await getTodaySummary(userId, {
        ...todayDeps,
        ...(canWrite ? { onMissing: () => deps.background(() => generateTodaySummary(userId, todayDeps)) } : {}),
      });
      // Today's own numbers: never cached by a shared proxy, nor kept once the day moves on.
      res.set('Cache-Control', 'private, no-store');
      res.json(summary);
    } catch (err) {
      logFailure('today', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  // No requireEnabled: the character is also the app's look, so it can be chosen while the coach is off.
  router.put('/me/coach/persona', requireAuth, async (req: AuthedRequest, res) => {
    const requested: unknown = req.body?.personaId;
    // A retired v3 character (an old build's picker, or its Skip, which sends 'hoot') saves the default
    // instead of failing, so that build's picker does not reopen forever (R23). v1 and unknown ids stay 400.
    const persona = findPersona(requested) ?? (isRetiredCharacterId(requested) ? findPersona(DEFAULT_PERSONA_ID) : undefined);
    if (!persona) {
      res.status(400).json({ error: 'unknown_persona' });
      return;
    }
    try {
      const userId = req.userId!;
      const before = await prisma.user.findUnique({ where: { id: userId }, select: { coachPersonaId: true } });
      const result = await prisma.user.updateMany({ where: { id: userId }, data: { coachPersonaId: persona.id } });
      if (result.count === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      // Today's sentence was written in the old character's voice: drop it and write a new one in the
      // background (forced, so a run already in flight in the old voice is never reused), and only for a
      // user whose sentence may be written at all (the same gate GET /me/coach/today applies).
      // The switch is already saved: a failure here is logged and the request still answers 200, so the
      // app never shows a false error (and retries) for a character change that took effect.
      if (before && resolvePersona(before.coachPersonaId).id !== persona.id) {
        try {
          await clearTodaySummary(userId, todayDeps);
          if (isCoachEnabled() && (await hasCurrentConsent(userId, 'local'))) {
            deps.background(() => generateTodaySummary(userId, { ...todayDeps, force: true }));
          }
        } catch (err) {
          logFailure('persona_summary', err);
        }
      }
      res.json({ personaId: persona.id });
    } catch (err) {
      logFailure('persona', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  // A look, like the character: can be set while the coach is off.
  router.put('/me/coach/thinking', requireAuth, async (req: AuthedRequest, res) => {
    const { attachment, text } = (req.body ?? {}) as { attachment?: unknown; text?: unknown };
    const hasA = attachment !== undefined;
    const hasT = text !== undefined;
    if ((!hasA && !hasT) || (hasA && !isThinkingAttachment(attachment)) || (hasT && !isThinkingText(text))) {
      res.status(400).json({ error: 'unknown_thinking_style' });
      return;
    }
    try {
      // updateMany, not update: a user row that is gone is a 404 (as on PUT /me/coach/persona), not a 500.
      const userId = req.userId!;
      const result = await prisma.user.updateMany({
        where: { id: userId },
        data: { ...(hasA ? { coachThinkingAttachment: attachment as string } : {}), ...(hasT ? { coachThinkingText: text as string } : {}) },
      });
      const user =
        result.count === 0
          ? null
          : await prisma.user.findUnique({ where: { id: userId }, select: { coachThinkingAttachment: true, coachThinkingText: true } });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({ thinkingAttachment: resolveThinkingAttachment(user.coachThinkingAttachment), thinkingText: resolveThinkingText(user.coachThinkingText) });
    } catch (err) {
      logFailure('thinking', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  router.post('/me/coach/message', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    try {
      // Consent is enforced here, server-side, before the message is looked at.
      if (!(await hasCurrentConsent(userId))) {
        res.status(403).json({ error: 'consent_required' });
        return;
      }

      const { message, conversationId, safetyOverride } = (req.body ?? {}) as Record<string, unknown>;
      if (typeof message !== 'string' || message.trim().length === 0 || message.length > MAX_MESSAGE_CHARS) {
        res.status(400).json({ error: `message must be a string of 1 to ${MAX_MESSAGE_CHARS} characters` });
        return;
      }
      if (conversationId !== undefined && typeof conversationId !== 'string') {
        res.status(400).json({ error: 'conversationId must be a string' });
        return;
      }
      if (safetyOverride !== undefined && typeof safetyOverride !== 'boolean') {
        res.status(400).json({ error: 'safetyOverride must be a boolean' });
        return;
      }

      let history: Array<{ role: 'user' | 'assistant'; text: string }> = [];
      if (conversationId !== undefined) {
        const conversation = await prisma.coachConversation.findFirst({ where: { id: conversationId, userId } });
        if (!conversation) {
          res.status(404).json({ error: 'conversation_not_found' });
          return;
        }
        const prior = await prisma.coachMessage.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'desc' },
          take: ANSWER_HISTORY_WINDOW,
        });
        history = prior.reverse().map((m) => ({
          role: m.role === 'USER' ? 'user' : 'assistant',
          text: m.text,
        }));
      }

      const receivedAt = new Date();
      const wantsStream = (req.get('accept') ?? '').includes('text/event-stream');
      // The user's engine: hosted only while chosen, offered and consented, and a
      // hosted failure before any text is answered locally (done.engine says which).
      const selection = await selectEngine(userId, {
        local: deps.getProvider(),
        hosted: deps.getHostedProvider(),
        onFallback: (error) =>
          deps.telemetry.emit({ name: 'coach.hosted_fallback', userId, personaId: 'none', attributes: { error } }),
      });
      const engine = selection.requested;
      // A hosted message can still end up on the local model: start loading it now
      // (throttled, fire-and-forget) so a fallback does not pay the cold start.
      if (engine === 'hosted') {
        try {
          warmModel(deps.getProvider());
        } catch (err) {
          logFailure('message_warm', err);
        }
      }
      const answerDeps: AnswerDeps = {
        provider: selection.provider,
        engine,
        servedEngine: selection.servedBy,
        telemetry: deps.telemetry,
        clock: deps.clock,
        budgetMs: overrides.answerBudgetMs ?? getAnswerBudgetMs(engine),
        ...(overrides.factData ? { factData: overrides.factData } : {}),
      };
      const stop = new AbortController();
      const answer = runAnswer(
        {
          userId,
          message: message.trim(),
          history,
          ...(conversationId !== undefined ? { conversationId } : {}),
          safetyOverride: safetyOverride === true,
          receivedAt,
          signal: stop.signal,
        },
        answerDeps,
      );

      // Guarded here, not around the whole handler: validation and the history
      // read are cheap, and a 400 should not consume a rate-limit slot.
      if (wantsStream) {
        await withTurnGuard(userId, () => streamAnswer(answer, res, stop));
        return;
      }

      // An older app that gives up (its timeout, or the network dropped) stops the answer too:
      // what it was shown so far is stored as stopped, and the response below goes nowhere.
      res.on('close', () => {
        if (!res.writableFinished) stop.abort();
      });
      if (res.destroyed) stop.abort();
      const outcome = await withTurnGuard(userId, () => collectAnswer(answer));
      if (res.destroyed) return;
      if (outcome.error) {
        if (outcome.error.code === 'internal') res.status(500).json({ error: 'coach_unavailable' });
        else res.status(503).json({ error: outcome.error.code, retryable: outcome.error.retryable });
        return;
      }
      if (!outcome.done) {
        res.status(500).json({ error: 'coach_unavailable' });
        return;
      }
      const saved = await prisma.coachMessage.findUniqueOrThrow({ where: { id: outcome.done.messageId }, select: { createdAt: true, text: true } });
      // Old app builds only (this JSON path; the current app streams over SSE and shows the
      // disclaimer once as a page footnote). Those builds have no footnote, so the disclaimer is
      // appended to this RESPONSE only — never stored (R46). Memory proposals travel as
      // memoryProposals, never as text.
      res.json({
        conversationId: outcome.done.conversationId,
        message: {
          id: outcome.done.messageId,
          role: 'assistant',
          text: `${saved.text}\n\n${LEGACY_DISCLAIMER}`,
          source: outcome.safety ? 'safety' : 'model',
          createdAt: saved.createdAt.toISOString(),
        },
        ...(outcome.safety ? { safety: { resources: outcome.safety.resources, canContinue: true } } : {}),
        ...(outcome.memory && outcome.memory.length > 0 ? { memoryProposals: outcome.memory } : {}),
      });
    } catch (err) {
      // Neither is a server fault, so neither is logged as one.
      if (err instanceof TurnRateLimitedError) {
        res.set('Retry-After', String(err.retryAfterSeconds));
        res.status(429).json({ error: 'too_many_messages', retryAfterSeconds: err.retryAfterSeconds });
        return;
      }
      if (err instanceof TurnInProgressError) {
        res.status(409).json({ error: 'turn_in_progress' });
        return;
      }
      logFailure('message', err);
      if (res.headersSent) {
        if (!res.writableEnded) {
          writeSse(res, { type: 'error', code: 'internal', retryable: true });
          res.end();
        }
        return;
      }
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  async function sendConversation(userId: string, conversationId: string | null, res: Response): Promise<void> {
    if (conversationId === null) {
      res.json({ conversationId: null, messages: [] });
      return;
    }
    const rows = (
      await prisma.coachMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: MAX_TRANSCRIPT_MESSAGES,
      })
    ).reverse();
    // Memory chips go on the message that proposed them; rows from before
    // CoachMemory.messageId existed belong to no message and are not shown.
    const memories = await prisma.coachMemory.findMany({
      where: { userId, messageId: { in: rows.map((r) => r.id) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const byMessage = new Map<string, MemoryDTO[]>();
    for (const memory of memories) {
      const list = byMessage.get(memory.messageId!) ?? [];
      list.push(toMemoryDTO(memory));
      byMessage.set(memory.messageId!, list);
    }
    res.json({ conversationId, messages: rows.map((m) => messageDTO(m, byMessage.get(m.id))) });
  }

  // Past conversations for the conversations sheet, newest first, 20 per page;
  // the next page is ?before=<the last row's lastMessageAt>.
  router.get('/me/coach/conversations', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    const before = req.query.before;
    let beforeDate: Date | undefined;
    if (before !== undefined) {
      beforeDate = typeof before === 'string' ? new Date(before) : new Date(Number.NaN);
      if (Number.isNaN(beforeDate.getTime())) {
        res.status(400).json({ error: 'before must be an ISO date' });
        return;
      }
    }
    try {
      const rows = await prisma.coachConversation.findMany({
        where: {
          userId: req.userId!,
          // A conversation whose messages retention removed has nothing to open.
          messages: { some: {} },
          ...(beforeDate ? { lastMessageAt: { lt: beforeDate } } : {}),
        },
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        take: CONVERSATION_PAGE_SIZE,
        select: {
          id: true,
          lastMessageAt: true,
          _count: { select: { messages: true } },
          messages: { where: { role: 'USER' }, orderBy: { createdAt: 'asc' }, take: 1, select: { text: true } },
        },
      });
      res.json({
        conversations: rows.map((c) => ({
          id: c.id,
          title: conversationTitle(c.messages[0]?.text),
          lastMessageAt: c.lastMessageAt.toISOString(),
          messageCount: c._count.messages,
        })),
      });
    } catch (err) {
      logFailure('conversation_list', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  router.get('/me/coach/conversations/latest', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const latest = await prisma.coachConversation.findFirst({ where: { userId }, orderBy: { lastMessageAt: 'desc' } });
      await sendConversation(userId, latest?.id ?? null, res);
    } catch (err) {
      logFailure('conversation_latest', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  router.get('/me/coach/conversations/:id', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      const id = req.params.id as string;
      const conversation = await prisma.coachConversation.findFirst({ where: { id, userId }, select: { id: true } });
      if (!conversation) {
        res.status(404).json({ error: 'conversation_not_found' });
        return;
      }
      await sendConversation(userId, conversation.id, res);
    } catch (err) {
      logFailure('conversation', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  // ---- coach memory (spec sections 5 and 6) ----------------------------------
  // Viewing, editing and deleting memory never sends anything to the model
  // provider, so these routes need the flag but not consent: a user can always
  // see and remove what is stored about them.

  router.get('/me/coach/memory', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    try {
      const rows = await prisma.coachMemory.findMany({
        where: { userId: req.userId! },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      res.json({ entries: rows.map(toMemoryDTO) });
    } catch (err) {
      logFailure('memory_list', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  router.patch('/me/coach/memory/:id', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    try {
      const id = req.params.id as string;
      const existing = await prisma.coachMemory.findFirst({ where: { id, userId: req.userId! }, select: { id: true } });
      if (!existing) {
        res.status(404).json({ error: 'memory_not_found' });
        return;
      }
      // Same value rules as a model proposal: length and the health-fact classifier.
      const checked = validateMemoryValue(req.body?.value);
      if (!checked.ok) {
        res.status(400).json({ error: 'invalid_memory_value', reason: checked.reason });
        return;
      }
      const entry = await prisma.coachMemory.update({ where: { id }, data: { value: checked.value } });
      res.json({ entry: toMemoryDTO(entry) });
    } catch (err) {
      logFailure('memory_edit', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  router.delete('/me/coach/memory/:id', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    try {
      const result = await prisma.coachMemory.deleteMany({ where: { id: req.params.id as string, userId: req.userId! } });
      if (result.count === 0) {
        res.status(404).json({ error: 'memory_not_found' });
        return;
      }
      res.status(204).end();
    } catch (err) {
      logFailure('memory_delete', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  // ---- weekly digest ----------------------------------------------------------

  router.get('/me/coach/digests/latest', requireAuth, requireEnabled, async (req: AuthedRequest, res) => {
    try {
      const userId = req.userId!;
      // Merged into the weekly recap (spec 2026-10-04 §2): the latest BUILT WEEK recap's story, in
      // the same shape, falling back to the latest legacy CoachDigest when no recap has a story.
      const recap = await prisma.recap.findFirst({
        where: { userId, kind: 'WEEK', status: 'BUILT', story: { not: null } },
        orderBy: { periodStart: 'desc' },
        select: { id: true, story: true, builtAt: true },
      });
      if (recap?.story) {
        res.json({ digest: { id: recap.id, text: recap.story, createdAt: recap.builtAt.toISOString() } });
        return;
      }
      const digest = await prisma.coachDigest.findFirst({
        where: { userId },
        orderBy: [{ weekStart: 'desc' }, { createdAt: 'desc' }],
      });
      res.json({
        digest: digest ? { id: digest.id, text: cleanLegacyText(digest.text), createdAt: digest.createdAt.toISOString() } : null,
      });
    } catch (err) {
      logFailure('digest_latest', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  // ---- push tokens ------------------------------------------------------------

  // App-level since the recap (spec 2026-10-04 §2): recap pushes reach users with the coach off.
  const isToken = (v: unknown): v is string =>
    typeof v === 'string' && v.length > 0 && v.length <= MAX_PUSH_TOKEN_CHARS && !/\s/.test(v);

  router.post('/me/push-token', requireAuth, async (req: AuthedRequest, res) => {
    const { token, platform } = (req.body ?? {}) as Record<string, unknown>;
    if (!isToken(token)) {
      res.status(400).json({ error: 'token must be a non-empty string without whitespace' });
      return;
    }
    if (platform !== 'ios' && platform !== 'android') {
      res.status(400).json({ error: "platform must be 'ios' or 'android'" });
      return;
    }
    if (isExpoPushProvider() && !isExpoPushToken(token)) {
      res.status(400).json({ error: 'token must be an Expo push token' });
      return;
    }
    try {
      // A device token must never silently change hands: whoever holds the
      // string would otherwise redirect another account's coach notifications
      // to their own device. The update is scoped to this user's own rows and
      // the create leans on the unique constraint, so two concurrent claims
      // cannot race one through. A genuinely shared device still works --
      // signing out unregisters the token first (unregisterPushBestEffort).
      const claimed = await prisma.pushToken.updateMany({
        where: { token, userId: req.userId! },
        data: { platform },
      });
      if (claimed.count === 0) {
        try {
          await prisma.pushToken.create({ data: { userId: req.userId!, token, platform } });
        } catch (err) {
          if ((err as { code?: string } | null)?.code === 'P2002') {
            res.status(409).json({ error: 'token_registered_to_another_account' });
            return;
          }
          throw err;
        }
      }
      res.status(204).end();
    } catch (err) {
      logFailure('push_token_register', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  router.delete('/me/push-token', requireAuth, async (req: AuthedRequest, res) => {
    const token = (req.body ?? {}).token;
    if (!isToken(token)) {
      res.status(400).json({ error: 'token must be a non-empty string without whitespace' });
      return;
    }
    try {
      await prisma.pushToken.deleteMany({ where: { token, userId: req.userId! } });
      res.status(204).end();
    } catch (err) {
      logFailure('push_token_delete', err);
      res.status(500).json({ error: 'coach_unavailable' });
    }
  });

  return router;
}

export const coachRouter = createCoachRouter();
