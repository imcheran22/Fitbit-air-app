/// <reference types="node" />
// Dev only: pairs an existing account (the demo account) with a second existing dev account and
// sends one sticker from the second, so the simulator pass sees the Home row, the list, a buddy's
// week and Activity.
//
//   DATABASE_URL=<local dev database> HANDLE_HOLD_SECRET=<the server's> node node_modules/.bin/ts-node --project tsconfig.evals.json scripts/seedBuddies.ts --email demo@example.com --buddy-email buddy@example.com
//
// ts-node loads no .env: set the same handle-hold key the dev server uses (its HANDLE_HOLD_SECRET, or
// BETTER_AUTH_SECRET when it has none), or held handles won't match.
// Refuses NODE_ENV=production and any non-local DATABASE_URL (assertDevDatabase, as the badge seed),
// and the same account twice or two accounts with a block either way, before writing anything.
// Gives each account a handle (dev_<8, 12 or 16 hex of its id>, the first one free and not held for
// someone else, claimed through updateIdentity like the app does) and a display name only where
// missing, marks the mood notice, pairs them and sends a Cheer (skipped once today's limit is
// reached). Nothing is queued: pairing and the sticker get a queue that drops everything, so no
// push is sent. Idempotent. Never runs on import. On failure it logs only the error's name.
import { prisma } from '../src/db/client';
import { BuddyError } from '../src/buddies/errors';
import { isHandleAvailable, updateIdentity } from '../src/buddies/handles';
import { checkHandle } from '../src/buddies/identity';
import type { NotifyQueue } from '../src/buddies/notifyQueue';
import { createPair, isBlockedEitherWay } from '../src/buddies/pairs';
import { sendSticker } from '../src/buddies/stickers';
import { connection, syncQueue } from '../src/sync/queue';
import { assertDevDatabase } from './seedAchievements';

type SeedEnv = { NODE_ENV?: string | undefined; DATABASE_URL?: string | undefined };

function seedError(name: string, message: string): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

export function parseArgs(argv: string[]): { email: string; buddyEmail: string } {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const email = value('--email');
  const buddyEmail = value('--buddy-email');
  if (!email || !buddyEmail) {
    throw seedError(
      'SeedUsageError',
      "Usage: HANDLE_HOLD_SECRET=<the server's> seedBuddies --email <email> --buddy-email <email> (or BETTER_AUTH_SECRET=<the server's> when the server has no HANDLE_HOLD_SECRET)",
    );
  }
  return { email, buddyEmail };
}

/** dev_ plus 8, 12 or 16 hex digits of the id: only [a-z0-9_], at most 20 characters, never a reserved word. */
function handleCandidates(userId: string): string[] {
  const hex = userId.replace(/-/g, '');
  return [8, 12, 16].map((n) => `dev_${hex.slice(0, n)}`).filter((h) => checkHandle(h).ok);
}

/** Claims the first free generated handle; a claim lost to a race (handle_taken) moves on to the next. */
async function claimHandle(userId: string, displayName: string, now: Date): Promise<void> {
  for (const handle of handleCandidates(userId)) {
    if (!(await isHandleAvailable(userId, handle, now))) continue;
    try {
      await updateIdentity(userId, { handle, displayName }, now);
      return;
    } catch (err) {
      if (!(err instanceof BuddyError && err.code === 'handle_taken')) throw err;
    }
  }
  throw seedError('SeedHandleUnavailable', 'No generated handle is free');
}

interface SeedUser { id: string; handle: string | null; displayName: string | null; buddyMoodNoticeAt: Date | null }

async function findUser(email: string): Promise<SeedUser> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, handle: true, displayName: true, buddyMoodNoticeAt: true } });
  if (!user) throw seedError('SeedUnknownUser', 'No user with that email');
  return user;
}

async function ready(user: SeedUser, fallbackName: string, now: Date): Promise<string> {
  // Whatever the owner already chose is kept.
  if (!user.handle) await claimHandle(user.id, user.displayName ?? fallbackName, now);
  else if (!user.displayName) await updateIdentity(user.id, { displayName: fallbackName }, now);
  if (!user.buddyMoodNoticeAt) await prisma.user.update({ where: { id: user.id }, data: { buddyMoodNoticeAt: now } });
  return user.id;
}

export async function seedBuddies({ email, buddyEmail, now = new Date(), env = process.env }: { email: string; buddyEmail: string; now?: Date; env?: SeedEnv }) {
  assertDevDatabase(env);
  const user = await findUser(email);
  const buddy = await findUser(buddyEmail);
  // Both refusals come before any identity write.
  if (user.id === buddy.id) throw seedError('SeedUsageError', 'Usage: the two emails must be different accounts');
  if (await isBlockedEitherWay(user.id, buddy.id)) throw seedError('SeedBlockedPair', 'One account has blocked the other');
  const userId = await ready(user, 'Demo', now);
  const buddyId = await ready(buddy, 'Dev buddy', now);
  // A queue that drops everything: the seed never queues pushes.
  const notifyQueue: NotifyQueue = { add: async () => undefined };
  const { created } = await createPair(userId, buddyId, now, { notifyQueue });
  let stickerId: string | null = null;
  try {
    stickerId = (await sendSticker(buddyId, userId, 'CHEER', now, { notifyQueue })).id;
  } catch (err) {
    if (!(err instanceof BuddyError && err.code === 'sticker_limit')) throw err;
  }
  return { userId, buddyId, paired: created, stickerId };
}

async function closeQuietly(close: () => Promise<unknown>): Promise<void> {
  try {
    await close();
  } catch {
    // The process is exiting anyway.
  }
}

/** The CLI body. Its imports open the shared Redis connection and queue, so they are closed here too. */
export async function main(argv: string[]): Promise<void> {
  try {
    const result = await seedBuddies(parseArgs(argv));
    console.info(JSON.stringify({ event: 'buddies.seeded', userId: result.userId, buddyId: result.buddyId, paired: result.paired, stickerId: result.stickerId }));
  } finally {
    await closeQuietly(() => prisma.$disconnect());
    await closeQuietly(() => syncQueue.close());
    await closeQuietly(() => connection.quit());
  }
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    // Only the error's name: messages can carry an email or connection details.
    console.error(JSON.stringify({ event: 'buddies.seed_failed', error: err instanceof Error ? err.name : 'Error' }));
    process.exit(1);
  });
}
