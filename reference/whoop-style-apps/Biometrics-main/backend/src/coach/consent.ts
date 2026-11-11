// Coach consent (spec section 5). The coach gives score values, factor
// breakdowns, daily metrics, habit logs, confirmed habit-pattern fields and
// goals to an LLM on every turn, which the rest of the app never does, so it is gated
// on its own explicit, versioned opt-in that the SERVER enforces. Bumping
// COACH_CONSENT_VERSION invalidates every stored consent: the next message is
// refused (403 consent_required) until the user re-consents to the new text.

import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client';

// Version 2: the coach can also read daily metrics (steps, resting heart rate,
// HRV, sleep time) with up to 90 days of history, and recent habit logs.
export const COACH_CONSENT_VERSION = '2';

export interface ConsentText {
  version: string;
  summary: string;
  dataItems: string[];
}

export const COACH_CONSENT: ConsentText = {
  version: COACH_CONSENT_VERSION,
  summary:
    'The coach uses an AI language model. When you send the coach a message, the items below are given to that model so ' +
    'it can answer, and only the items that message actually needs. Never sent: your sign-in or Google Health access ' +
    'tokens, or the free-text notes on your habit logs. The rest of the app works exactly the same if you decline, and ' +
    'you can withdraw this consent at any time.',
  dataItems: [
    'The messages you type to the coach in the current conversation',
    'Your Recovery Score and Sleep Score values, and how confident each one is',
    'The per-factor breakdown behind each score (for example HRV, resting heart rate, sleep debt, sleep duration, sleep efficiency and bedtime consistency)',
    'Your daily readings: steps, resting heart rate, HRV and time asleep, for a given day or up to the last 90 days',
    'What you logged in the habit log over up to the last 30 days (amounts only, never your notes)',
    'Habit patterns the app has already confirmed for you: the habit name, which factor it affects, the size of the effect and how many days it is based on',
    'Your goals, such as your sleep goal and the daily step goal',
  ],
};

// The hosted engine's own opt-in (spec 2026-09-30 section 3), on top of the
// coach consent above: switching to the hosted model sends the question and
// the fact sheet to Anthropic. A separate scope with its own version, so the
// two texts are bumped independently. The "hosted-" prefix keeps the two
// version strings from ever being equal.
export const COACH_HOSTED_CONSENT_VERSION = 'hosted-1';

export const COACH_HOSTED_CONSENT: ConsentText = {
  version: COACH_HOSTED_CONSENT_VERSION,
  summary:
    'Your question and a summary of your recent health numbers are sent to Anthropic to write the answer. ' +
    "Anthropic doesn't use it to train models. You can switch back any time.",
  dataItems: [
    'The question you type and the recent messages of the current conversation',
    'A short summary of the health numbers the answer needs: your scores and their usual values, last night’s sleep, HRV, resting heart rate, confirmed habit patterns, goals and what you asked the coach to remember',
    'The same summary for the one-sentence recap of your day at the top of the Coach page',
    'We never add your name, email, account id, sign-in or Google Health tokens, or the notes on your habit logs. ' +
      'Anything you type yourself, including your name if you write it, is sent as part of the conversation',
  ],
};

export type ConsentScope = 'local' | 'hosted';

const SCOPE_COLUMN = { local: 'LOCAL', hosted: 'HOSTED' } as const;
const SCOPE_VERSION = { local: COACH_CONSENT_VERSION, hosted: COACH_HOSTED_CONSENT_VERSION } as const;

export function consentTextFor(scope: ConsentScope): ConsentText {
  return scope === 'hosted' ? COACH_HOSTED_CONSENT : COACH_CONSENT;
}

/**
 * True when the user's latest un-revoked consent OF THIS SCOPE is for that
 * scope's CURRENT version. Scoped because the latest row overall may be the
 * other scope's: a hosted grant must never read as a stale local consent.
 */
export async function hasCurrentConsent(
  userId: string,
  scope: ConsentScope = 'local',
  db: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const latest = await db.coachConsent.findFirst({
    where: { userId, revokedAt: null, scope: SCOPE_COLUMN[scope] },
    orderBy: { consentedAt: 'desc' },
    select: { version: true },
  });
  return latest?.version === SCOPE_VERSION[scope];
}

/** Advisory-lock namespace for consent changes ('Cons'); keeps them apart from the sync lock in biometrics/repository.ts. */
export const CONSENT_LOCK_NAMESPACE = 0x436f6e73;

/**
 * Serialises one user's consent grants, revokes and engine changes, for the rest
 * of the transaction. Without it, a revoke-all could commit between a hosted
 * grant's local-consent check and its insert, and the revoke's UPDATE (whose
 * snapshot predates the insert) would leave the new hosted row live behind a
 * revoked local consent. A transaction-scoped advisory lock rather than a User
 * row lock: account deletion removes consent rows before the User row, and sync
 * inserts take FOR KEY SHARE on it, so a row lock here could deadlock or stall
 * them. The two-key form lives in its own keyspace, apart from the sync lock.
 */
export async function lockConsent(db: Prisma.TransactionClient, userId: string): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${CONSENT_LOCK_NAMESPACE}::int4, hashtext(${userId}))`;
}

/**
 * Idempotent: a repeat grant for the current version of the scope does not add
 * a row. A hosted grant builds on the coach (local) consent: when the user does
 * not hold the current local consent at the moment of the insert it adds
 * nothing and returns false (the route answers 403 consent_required).
 * Otherwise returns true.
 */
export async function grantConsent(userId: string, scope: ConsentScope = 'local'): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockConsent(tx, userId);
    if (scope === 'hosted' && !(await hasCurrentConsent(userId, 'local', tx))) return false;
    if (await hasCurrentConsent(userId, scope, tx)) return true;
    await tx.coachConsent.create({ data: { userId, version: SCOPE_VERSION[scope], scope: SCOPE_COLUMN[scope] } });
    return true;
  });
}

/**
 * 'all' (the default, and what DELETE /me/coach/consent has always meant)
 * withdraws both scopes; 'hosted' withdraws only the hosted opt-in. Either way
 * the user is back on the local engine, in the same transaction, so no message
 * started after the revoke returns goes to the hosted model. (A request already
 * in flight is not stopped.)
 */
export async function revokeConsent(userId: string, scope: 'hosted' | 'all' = 'all'): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await lockConsent(tx, userId);
    await tx.coachConsent.updateMany({
      where: { userId, revokedAt: null, ...(scope === 'hosted' ? { scope: 'HOSTED' as const } : {}) },
      data: { revokedAt: now },
    });
    await tx.user.updateMany({ where: { id: userId }, data: { coachEngine: 'LOCAL' } });
  });
}

export type SetEngineResult = 'ok' | 'consent_required' | 'user_not_found';

/**
 * Stores the user's engine choice. HOSTED is written only while the user holds
 * both the current coach (local) consent and the current hosted consent, checked
 * under the same per-user consent lock as grant and revoke, so a concurrent revoke can
 * never leave HOSTED stored behind a withdrawn consent. LOCAL needs no consent.
 * Whether the hosted engine is offered at all is the caller's check.
 */
export async function setEngineIfConsented(userId: string, engine: 'local' | 'hosted'): Promise<SetEngineResult> {
  return prisma.$transaction(async (tx) => {
    await lockConsent(tx, userId);
    if (
      engine === 'hosted' &&
      (!(await hasCurrentConsent(userId, 'local', tx)) || !(await hasCurrentConsent(userId, 'hosted', tx)))
    ) {
      return 'consent_required';
    }
    const result = await tx.user.updateMany({
      where: { id: userId },
      data: { coachEngine: engine === 'hosted' ? 'HOSTED' : 'LOCAL' },
    });
    return result.count === 0 ? 'user_not_found' : 'ok';
  });
}
