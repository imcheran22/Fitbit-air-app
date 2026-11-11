// Weekly synthesis digest: once a week, for each user who has the coach flag
// on, a CURRENT-version coach consent, and a persona whose proactivity is not
// 'reactive-only', write a short recap of the week and store it as a
// CoachDigest (one per user per local week, so the job is idempotent), then
// send a GENERIC push (push.ts).
//
// The recap uses the answer pipeline's building blocks (spec 2026-09-30):
// the `trends` fact sheet (answer/facts.ts), one streamed model call with the
// digest prompt (answer/prompt.ts), and every sentence checked by the same
// validator as a chat reply (answer/validate.ts). A sentence with a number
// that is not in the fact sheet, or a disallowed topic, is dropped; when no
// sentence survives, the model is asked once more; after that, or on a
// provider error or the time budget, the recap is composed on the server from
// the fact sheet (and validated too). A digest is therefore always made of
// validated sentences. The disclaimer is not stored in the text: the app shows
// it under the recap.
//
// This is a background job with no user-facing latency budget, but it is still
// bounded so a hung provider cannot stall the sweep. The clock is injectable so
// tests never sleep.
//
// Logging: ids, counts and reasons only. Never the digest text.

import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { shiftDate } from '../scoring/dates';
import { buildFactSheet, comparisonDiff, defaultFactData, Fact, FactData, FactSheet, formatValue } from './answer/facts';
import { buildDigestSystemPrompt, buildRegenerationNote } from './answer/prompt';
import { sentenceSplitter } from './answer/sentences';
import { validateSentence } from './answer/validate';
import { CoachClock, systemClock } from './clock';
import { COACH_CONSENT_VERSION, hasCurrentConsent } from './consent';
import { isCoachEnabled } from './config';
import type { CoachModelProvider, CoachStreamRequest } from './model/provider';
import { resolvePersona } from './personas';
import { sendCoachPush } from './coachPush';
import type { PushSender } from './push';
import type { CoachEventAttributes, CoachEventName, CoachTelemetry } from './telemetry';

export const DIGEST_BUDGET_MS = 60_000;
export const DIGEST_MAX_TOKENS = 500;
const MAX_ATTEMPTS = 2;
const USER_BATCH = 200;

export const DIGEST_REQUEST = 'Write my weekly recap for the past week.';

export interface DigestDeps {
  provider: CoachModelProvider;
  telemetry: CoachTelemetry;
  pushSender: PushSender;
  /** The fact sheet's data access. Defaults to the database readers (answer/facts.ts). */
  factData?: FactData;
  clock?: CoachClock;
  /** Injectable "now" so tests can pin the week. */
  now?: () => Date;
  budgetMs?: number;
  /** Restrict a run to these users (tests, manual backfill). Omit for the real sweep. */
  userIds?: string[];
}

export type DigestOutcome =
  | 'generated'
  | 'skipped_reactive_only'
  | 'skipped_no_consent'
  | 'skipped_exists'
  | 'skipped_no_data'
  | 'failed';

export interface DigestSweepSummary {
  enabled: boolean;
  usersChecked: number;
  generated: number;
  skipped: number;
  failed: number;
}

/** The Monday (civil date) of the ISO week containing `civilDate`: the digest's idempotency key. */
export function weekStartOf(civilDate: string): string {
  const dow = new Date(`${civilDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return shiftDate(civilDate, -((dow + 6) % 7));
}

/** The sleep goal is always present, so it alone is not something to recap. */
export function hasMaterial(sheet: FactSheet): boolean {
  return sheet.facts.some((f) => f.id !== 'sleep.goal');
}

/** Keeps only the sentences that pass the reply validator. */
function validatedSentences(text: string, sheet: FactSheet): { kept: string[]; dropped: Array<'unknown_number' | 'disallowed_topic'> } {
  const splitter = sentenceSplitter();
  const kept: string[] = [];
  const dropped: Array<'unknown_number' | 'disallowed_topic'> = [];
  for (const sentence of [...splitter.push(text), ...splitter.end()]) {
    const verdict = validateSentence(sentence, sheet);
    if (verdict.ok) kept.push(sentence);
    else dropped.push(verdict.reason);
  }
  return { kept, dropped };
}

function averageSentence(fact: Fact | undefined, lead: string, suffix = ''): string | null {
  if (!fact) return null;
  // The sheet's own comparison rule (facts.ts): a usual is mentioned only when the sheet states a difference.
  const usual = comparisonDiff(fact) ? `, against your usual ${formatValue(fact.unit, fact.usual!)}` : '';
  return `${lead} averaged ${fact.display}${suffix}${usual}.`;
}

/**
 * A habit label without its digit-bearing parenthetical ("Late caffeine (1+ cups) and next-day HRV" ->
 * "Late caffeine and next-day HRV"): the validator never accepts digits that live only in a label.
 */
function withoutLabelNumbers(label: string): string {
  return label.replace(/\s*\([^)]*\d[^)]*\)/g, '');
}

/**
 * The deterministic, server-composed recap (no model): fixed sentences filled
 * from the fact sheet, then put through the same validator as a model reply,
 * so a template bug can only lose a sentence, never publish an unvalidated
 * one. Null when there is nothing to say.
 */
export function composeDigestFallback(sheet: FactSheet): string | null {
  const byId = new Map(sheet.facts.map((f) => [f.id, f]));
  const lines = [
    averageSentence(byId.get('recovery.avg7'), 'Recovery', ' over the last 7 days'),
    averageSentence(byId.get('sleep.avg7'), 'Sleep', ' a night'),
    averageSentence(byId.get('hrv.avg7'), 'HRV'),
    averageSentence(byId.get('rhr.avg7'), 'Resting heart rate'),
    ...sheet.facts.filter((f) => f.id.startsWith('habit.')).slice(0, 2).map((f) => `${withoutLabelNumbers(f.label)}: ${f.display}.`),
  ].filter((l): l is string => l !== null);
  if (lines.length === 0) return null;
  const { kept } = validatedSentences(["Here's your week.", ...lines].join(' '), sheet);
  return kept.length > 1 ? kept.join(' ') : null;
}

interface Generated {
  text: string;
  source: 'model' | 'fallback';
  dropped: number;
  attempts: number;
}

async function streamText(provider: CoachModelProvider, request: CoachStreamRequest): Promise<string> {
  let raw = '';
  for await (const chunk of provider.stream(request)) raw += chunk;
  return raw;
}

export async function generateDigestText(
  deps: DigestDeps,
  persona: ReturnType<typeof resolvePersona>,
  today: string,
  sheet: FactSheet,
): Promise<Generated | null> {
  const clock = deps.clock ?? systemClock;
  const system = buildDigestSystemPrompt(persona, { today, sheet });
  const controller = new AbortController();
  let dropped = 0;
  let attempts = 0;

  async function run(): Promise<string | null> {
    let note: string | null = null;
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      attempts = n;
      const messages: CoachStreamRequest['messages'] = [{ role: 'user', content: DIGEST_REQUEST }];
      if (note) messages.push({ role: 'user', content: note });
      let raw: string;
      try {
        raw = await streamText(deps.provider, { system, messages, maxTokens: DIGEST_MAX_TOKENS, signal: controller.signal });
      } catch {
        return null;
      }
      const result = validatedSentences(raw, sheet);
      dropped += result.dropped.length;
      if (result.kept.length > 0) return result.kept.join(' ');
      note = buildRegenerationNote(result.dropped.length > 0 ? [...new Set(result.dropped)] : ['empty']);
    }
    return null;
  }

  let cancelTimer = () => {};
  const deadline = new Promise<'deadline'>((resolve) => {
    const handle = clock.setTimer(() => resolve('deadline'), deps.budgetMs ?? DIGEST_BUDGET_MS);
    cancelTimer = () => handle.cancel();
  });
  const running = run().catch((): null => null);
  let outcome: string | null | 'deadline';
  try {
    outcome = await Promise.race([running, deadline]);
  } finally {
    cancelTimer();
  }
  if (outcome === 'deadline') controller.abort();
  if (outcome !== 'deadline' && outcome !== null) return { text: outcome, source: 'model', dropped, attempts };

  const fallback = composeDigestFallback(sheet);
  return fallback === null ? null : { text: fallback, source: 'fallback', dropped, attempts };
}

export async function generateWeeklyDigestForUser(
  user: { id: string; timezone: string; coachPersonaId: string | null },
  deps: DigestDeps,
): Promise<DigestOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const persona = resolvePersona(user.coachPersonaId);
  const emit = (name: CoachEventName, attributes: CoachEventAttributes) =>
    deps.telemetry.emit({ name, userId: user.id, personaId: persona.id, attributes });
  const skip = (outcome: DigestOutcome): DigestOutcome => {
    emit('coach.digest_skipped', { reason: outcome });
    return outcome;
  };

  // Gating, cheapest first. The flag is checked by the caller (runWeeklyDigest).
  if (persona.proactivity === 'reactive-only') return skip('skipped_reactive_only');
  if (!(await hasCurrentConsent(user.id))) return skip('skipped_no_consent');

  const today = localCivilDateOrUtc(now, user.timezone);
  const weekStart = weekStartOf(today);
  const weekStartDate = civilDateToUtcMidnight(weekStart);
  const existing = await prisma.coachDigest.findUnique({
    where: { userId_weekStart: { userId: user.id, weekStart: weekStartDate } },
    select: { id: true },
  });
  if (existing) return skip('skipped_exists');

  const sheet = await buildFactSheet(user.id, 'trends', { ...(deps.factData ?? defaultFactData), today });
  if (!hasMaterial(sheet)) return skip('skipped_no_data');

  const generated = await generateDigestText(deps, persona, today, sheet);
  if (generated === null) return skip('skipped_no_data');

  try {
    await prisma.coachDigest.create({
      data: { userId: user.id, text: generated.text, personaId: persona.id, weekStart: weekStartDate },
    });
  } catch (err) {
    // Two runs for the same user+week raced: the unique key keeps exactly one, and only the winner pushes.
    if ((err as { code?: string } | null)?.code === 'P2002') return skip('skipped_exists');
    throw err;
  }
  emit('coach.digest_generated', { source: generated.source, dropped: generated.dropped, attempts: generated.attempts, weekStart });

  // The digest is stored; a push failure must not undo or repeat it.
  try {
    const devices = await sendCoachPush(deps.pushSender, user.id, 'weekly_digest');
    emit('coach.push_sent', { kind: 'weekly_digest', devices });
  } catch (err) {
    emit('coach.push_failed', { kind: 'weekly_digest', error: err instanceof Error ? err.name : 'unknown' });
  }
  return 'generated';
}

/** The scheduled job body. A no-op unless COACH_ENABLED. One user's failure never stops the sweep. */
export async function runWeeklyDigest(deps: DigestDeps): Promise<DigestSweepSummary> {
  const summary: DigestSweepSummary = { enabled: isCoachEnabled(), usersChecked: 0, generated: 0, skipped: 0, failed: 0 };
  if (!summary.enabled) return summary;

  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where: {
        ...(deps.userIds ? { id: { in: deps.userIds } } : {}),
        coachConsents: { some: { revokedAt: null, version: COACH_CONSENT_VERSION, scope: 'LOCAL' } },
      },
      select: { id: true, timezone: true, coachPersonaId: true },
      orderBy: { id: 'asc' },
      take: USER_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (users.length === 0) break;
    for (const user of users) {
      summary.usersChecked++;
      try {
        const outcome = await generateWeeklyDigestForUser(user, deps);
        if (outcome === 'generated') summary.generated++;
        else summary.skipped++;
      } catch (err) {
        summary.failed++;
        deps.telemetry.emit({
          name: 'coach.digest_failed',
          userId: user.id,
          personaId: resolvePersona(user.coachPersonaId).id,
          attributes: { error: err instanceof Error ? err.name : 'unknown' },
        });
      }
    }
    cursor = users[users.length - 1]!.id;
    if (users.length < USER_BATCH) break;
  }
  return summary;
}
