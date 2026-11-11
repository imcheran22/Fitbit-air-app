// Account deletion (App Store requirement; the coach spec's section 5 also
// assumes it). Two parts:
//
//   1. Best effort at Google, never blocking: delete the webhook subscription
//      and revoke the OAuth grant. Google being down, or the grant already
//      being revoked, must not leave the user unable to delete their account.
//   2. Local deletion of every row the user owns, in ONE transaction, then the
//      User row itself.
//
// USER_OWNED_MODELS is the single ordered list of tables that hold a user's
// data. Account deletion and the test-fixture purge (scripts/purgeTestFixtures.ts)
// both walk it, and a test introspects the Prisma schema to fail if a model
// with a `userId` column is ever missing from it, so a future table cannot
// silently outlive its user.

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db/client';
import { decryptToken } from '../crypto/tokenCipher';
import { revokeHealthToken } from '../health/oauth';
import { deleteUserSubscription } from '../health/subscriber';
import { holdHandle } from '../buddies/holds';
import { purgeSocialJsonMentions } from '../buddies/models';

/**
 * Every model that carries a `userId`, in an FK-safe delete order: children
 * before parents (CoachMessage references CoachConversation), and all of them
 * before the User row their foreign keys point at. Names are Prisma model names
 * as they appear in the schema.
 */
export const USER_OWNED_MODELS = [
  'BiometricRecord',
  'SleepSession',
  'UserDailyFeatures',
  'BaselineSnapshot',
  'DailyScore',
  'ScoreInputFlag',
  'HabitLog',
  'HabitCheckIn',
  'HabitType',
  'HabitCorrelation',
  'CoachMessage',
  'CoachConversation',
  'CoachMemory',
  'CoachDigest',
  'CoachDaySummary',
  'Recap',
  'Achievement',
  'GoalChange',
  'CoachConsent',
  'PushToken',
  'Session',
  'Account',
  'HealthConnection',
] as const;

export type UserOwnedModel = (typeof USER_OWNED_MODELS)[number];

/** Per-table row counts, as returned by deletion and by the fixture purge: one entry per owned table, plus the users. */
export type OwnedCounts = Record<UserOwnedModel | 'User', number>;

type BulkDelegate = {
  deleteMany(args: { where: object }): Prisma.PrismaPromise<{ count: number }>;
  count(args: { where: object }): Prisma.PrismaPromise<number>;
};

/** The Prisma delegate for a model name (`CoachMessage` -> `client.coachMessage`). */
export function delegateFor(client: PrismaClient, model: UserOwnedModel | 'User'): BulkDelegate {
  const key = (model.charAt(0).toLowerCase() + model.slice(1)) as Uncapitalize<UserOwnedModel | 'User'>;
  return client[key] as unknown as BulkDelegate;
}

/**
 * Deletes, in ONE transaction and in USER_OWNED_MODELS order, the rows of every
 * owned table matching `ownedWhere` and then the users matching `userWhere`.
 * Returns per-table counts.
 */
export async function deleteOwnedRows(client: PrismaClient, ownedWhere: object, userWhere: object): Promise<OwnedCounts> {
  const models = [...USER_OWNED_MODELS, 'User'] as const;
  const results = await client.$transaction(
    models.map((model) => delegateFor(client, model).deleteMany({ where: model === 'User' ? userWhere : ownedWhere })),
  );
  const counts = {} as OwnedCounts;
  models.forEach((model, i) => {
    counts[model] = results[i]!.count;
  });
  return counts;
}

export interface AccountDeletionDeps {
  deleteSubscription: (subscriptionId: string) => Promise<void>;
  revokeToken: (refreshToken: string) => Promise<void>;
  log: (message: string) => void;
}

const defaultDeps: AccountDeletionDeps = {
  deleteSubscription: deleteUserSubscription,
  revokeToken: revokeHealthToken,
  log: (message) => console.error(message),
};

export interface AccountDeletionSummary {
  /** Whether the Google-side steps succeeded; both are false when the user had no connection. */
  googleSubscriptionDeleted: boolean;
  googleTokenRevoked: boolean;
  counts: OwnedCounts;
}

// Only the error's own message is logged: ours carry an HTTP status, never a
// token. The token itself only ever exists in memory for the revoke call.
function describe(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

/**
 * Deletes the user and everything they own. Idempotent: for an unknown user it
 * deletes nothing and does not throw.
 */
export async function deleteUserAccount(
  userId: string,
  deps: Partial<AccountDeletionDeps> = {},
): Promise<AccountDeletionSummary> {
  const { deleteSubscription, revokeToken, log } = { ...defaultDeps, ...deps };
  let googleSubscriptionDeleted = false;
  let googleTokenRevoked = false;

  try {
    const conn = await prisma.healthConnection.findUnique({ where: { userId } });
    if (conn) {
      if (conn.webhookSubscriptionId) {
        try {
          await deleteSubscription(conn.webhookSubscriptionId);
          googleSubscriptionDeleted = true;
        } catch (err) {
          log(`Account deletion: failed to delete Google Health subscription for user ${userId}: ${describe(err)}`);
        }
      }
      try {
        await revokeToken(decryptToken(conn.encryptedRefreshToken));
        googleTokenRevoked = true;
      } catch (err) {
        log(`Account deletion: failed to revoke Google token for user ${userId}: ${describe(err)}`);
      }
    }
  } catch (err) {
    log(`Account deletion: could not read the Google Health connection for user ${userId}: ${describe(err)}`);
  }

  // A deleted account's handle is held for 30 days (buddies spec §2). Best effort: a failure here
  // must not stop the deletion. previousOwnerId is nulled by the cascade when the User row goes.
  // Only the error class is logged: a Prisma message can echo the handle.
  try {
    const owner = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true } });
    if (owner?.handle) await holdHandle(prisma, owner.handle, userId, new Date());
  } catch (err) {
    log(`Account deletion: could not hold the handle for user ${userId}: ${err instanceof Error ? err.name : 'unknown error'}`);
  }

  const counts = await deleteOwnedRows(prisma, { userId }, { id: userId });

  // Week-highlight caches name people inside JSON, beyond any cascade (buddies/models.ts). After the rows are gone,
  // so a buddy's rebuild racing this deletion can't cache the id again from rows that still existed. Best effort:
  // reads gate every cached actor against the live circle anyway. Only the error class is logged.
  try {
    await purgeSocialJsonMentions(prisma, userId);
  } catch (err) {
    log(`Account deletion: could not purge social mentions for user ${userId}: ${err instanceof Error ? err.name : 'unknown error'}`);
  }

  return { googleSubscriptionDeleted, googleTokenRevoked, counts };
}
