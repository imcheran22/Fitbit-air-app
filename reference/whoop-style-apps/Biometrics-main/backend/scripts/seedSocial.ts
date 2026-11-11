/// <reference types="node" />
// Dev only: gives the demo account something to see on Social (spec 2026-10-07 social S1 + S2). The buddy
// checks in TIRED and passes their step goal today; if the buddy already checked in today, that mood is
// OVERWRITTEN with TIRED. Their newest built recap with a non-blank line (if any) is shared, with that
// line as the previewed one. For the Campfire (S2) the buddy gets a camp note and a goodnight for their current
// evening, so the camp shows an asleep coach with a bubble. The demo account itself is left unchecked-in so the
// walkthrough shows the lock lifting. Run seedBuddies first: the two accounts must already be buddies.
// For Chats (S3) the two accounts get a short conversation (mine, then the buddy's unread reply with a Heart on mine),
// written once per pair, and the buddy a Chats note (upserted).
//
//   DATABASE_URL=<local dev database> node node_modules/.bin/ts-node --project tsconfig.evals.json scripts/seedSocial.ts --email demo@example.com --buddy-email buddy@example.com
//
// Refuses NODE_ENV=production and any non-local DATABASE_URL (assertDevDatabase, as the badge seed),
// an unknown email and two accounts that aren't buddies, before writing anything. Idempotent: the
// check-in, the camp note and the goodnight are upserted, the step goal and the share are created once. Nothing is queued. Never runs
// on import. On failure it logs only the error's name.
import { civilDateToUtcMidnight } from '../src/biometrics/civilDate';
import { orderedPair } from '../src/buddies/pairs';
import { findConversationId, writeMessageTx } from '../src/chats/conversations';
import { STATUS_NOTE_TTL_MS } from '../src/chats/notes';
import { STEPS_GOAL } from '../src/coach/tools/metrics';
import { prisma } from '../src/db/client';
import { saveCheckIn, todayFor } from '../src/social/checkins';
import { shareRecap } from '../src/social/recapShares';
import { recordStepGoal } from '../src/social/stepGoal';
import { eveningDate, isOnTime, nextSunrise } from '../src/social/night';
import { connection, syncQueue } from '../src/sync/queue';
import { assertDevDatabase } from './seedAchievements';

/** The buddy's camp note in the walkthrough (the canvas' line). */
export const SEED_CAMP_NOTE = 'bed soon, night all';
/** The demo conversation (the V5 thread board's lines). */
export const SEED_CHAT = {
  mine: 'early night tonight? the camp is lighting the fire at 10:30',
  theirs: 'rough night lol, the neighbours had a party',
} as const;
/** The buddy's Chats note (the V5 Chats board's line). */
export const SEED_STATUS_NOTE = 'early night tonight';

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
  if (!email || !buddyEmail) throw seedError('SeedUsageError', 'Usage: seedSocial --email <demo email> --buddy-email <buddy email> (env needs DATABASE_URL)');
  return { email, buddyEmail };
}

async function findUserId(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw seedError('SeedUnknownUser', 'No user with that email');
  return user.id;
}

export async function seedSocial({ email, buddyEmail, now = new Date(), env = process.env }: { email: string; buddyEmail: string; now?: Date; env?: SeedEnv }): Promise<{ buddyCheckedIn: boolean; stepGoal: boolean; recapShared: boolean; campNote: boolean; goodnight: boolean; chat: boolean; statusNote: boolean }> {
  assertDevDatabase(env);
  const userId = await findUserId(email);
  const buddyId = await findUserId(buddyEmail);
  // The same account twice has no pair either, so this also refuses it.
  if (!(await prisma.buddyPair.findUnique({ where: { userAId_userBId: orderedPair(userId, buddyId) } }))) {
    throw seedError('SeedNotBuddies', 'The two accounts are not buddies (run seedBuddies first)');
  }
  await saveCheckIn(buddyId, 'TIRED', now);
  // A rollup point for the buddy's local today, past the goal: recordStepGoal stores the day only.
  const { today } = await todayFor(buddyId, now);
  await recordStepGoal(buddyId, [{ recordedAt: civilDateToUtcMidnight(today), value: STEPS_GOAL + 1500 }], now);
  // shareRecap refuses a recap without a line (the line is what buddies see), so pick one that has it;
  // its stored line is what the owner would have previewed. A blank (empty or whitespace-only) line counts
  // as none: Prisma can't filter on trim, so the newest non-blank one is picked here, before shareRecap
  // could throw after the writes above.
  const candidates = await prisma.recap.findMany({
    where: { userId: buddyId, status: 'BUILT', line: { not: null } },
    orderBy: { periodStart: 'desc' },
    select: { id: true, line: true },
  });
  const recap = candidates.find((r) => r.line !== null && r.line.trim() !== '') ?? null;
  if (recap) await shareRecap(buddyId, recap.id, recap.line, now);
  // The buddy's camp, written directly: the goodnight route only opens at night and the walkthrough runs whenever.
  // The note is stamped a second after `now`, so the check-in above (stamped at or before `now`) does not clear it.
  const buddy = await prisma.user.findUniqueOrThrow({ where: { id: buddyId }, select: { timezone: true, bedtimeGoal: true } });
  const noteAt = new Date(now.getTime() + 1000);
  const note = { text: SEED_CAMP_NOTE, createdAt: noteAt, expiresAt: nextSunrise(noteAt, buddy.timezone) };
  await prisma.campNote.upsert({ where: { authorId: buddyId }, create: { authorId: buddyId, ...note }, update: note });
  const evening = civilDateToUtcMidnight(eveningDate(now, buddy.timezone));
  await prisma.goodnight.upsert({
    where: { authorId_localDate: { authorId: buddyId, localDate: evening } },
    create: { authorId: buddyId, localDate: evening, at: now, onTime: isOnTime(now, buddy.timezone, buddy.bedtimeGoal) },
    update: {},
  });
  // The demo chat, written directly (no limiter, no push): mine 30 minutes ago, the buddy's reply 20 minutes ago with a
  // Heart on mine, so the demo account has one unread conversation. Once per pair: a re-run finds the reply and stops.
  const chat = await prisma.$transaction(async (tx) => {
    const existing = await findConversationId(userId, buddyId, tx);
    if (existing && (await tx.message.count({ where: { conversationId: existing, text: SEED_CHAT.theirs } })) > 0) return false;
    const mine = await writeMessageTx(tx, { senderId: userId, recipientId: buddyId, kind: 'TEXT', text: SEED_CHAT.mine, now: new Date(now.getTime() - 30 * 60_000) });
    const theirsAt = new Date(now.getTime() - 20 * 60_000);
    await writeMessageTx(tx, { senderId: buddyId, recipientId: userId, kind: 'TEXT', text: SEED_CHAT.theirs, now: theirsAt });
    await tx.messageReaction.createMany({ data: [{ messageId: mine, reactorId: buddyId, kind: 'HEART', createdAt: theirsAt }], skipDuplicates: true });
    return true;
  });
  const statusNote = { text: SEED_STATUS_NOTE, createdAt: now, expiresAt: new Date(now.getTime() + STATUS_NOTE_TTL_MS) };
  await prisma.statusNote.upsert({ where: { authorId: buddyId }, create: { authorId: buddyId, ...statusNote }, update: statusNote });
  return { buddyCheckedIn: true, stepGoal: true, recapShared: recap !== null, campNote: true, goodnight: true, chat, statusNote: true };
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
    const result = await seedSocial(parseArgs(argv));
    console.info(JSON.stringify({ event: 'social.seeded', ...result }));
  } finally {
    await closeQuietly(() => prisma.$disconnect());
    await closeQuietly(() => syncQueue.close());
    await closeQuietly(() => connection.quit());
  }
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    // Only the error's name: messages can carry an email or connection details.
    console.error(JSON.stringify({ event: 'social.seed_failed', error: err instanceof Error ? err.name : 'Error' }));
    process.exit(1);
  });
}
