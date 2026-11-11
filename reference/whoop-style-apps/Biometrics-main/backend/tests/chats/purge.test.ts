import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { orderedPair } from '../../src/buddies/pairs';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { block, blockBuddy, unpair } from '../../src/buddies/relations';
import { listChats, unreadChatsCount } from '../../src/chats/inbox';
import { listThread, markRead, sendMessage, setReaction } from '../../src/chats/messages';
import { getNotes } from '../../src/chats/notes';
import { getCamp } from '../../src/social/camp';
import { loadStoryRings } from '../../src/social/stories';
import { runSocialSweep } from '../../src/social/sweep';
import { buildTimeline } from '../../src/social/timeline';
import { deleteUserAccount } from '../../src/users/deletion';
import { RecordingQueue, buddyUser, pairUp } from '../buddies/helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
beforeEach(() => setBuddyNotifyQueue(new RecordingQueue()));
afterEach(() => {
  setBuddyNotifyQueue(null);
  jest.restoreAllMocks();
});

const NOW = new Date('2026-10-08T18:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

async function talking() {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  const hi = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'hi' }, NOW);
  await sendMessage(sam.id, me.id, { kind: 'STICKER', sticker: 'CHEER' }, NOW);
  await setReaction(sam.id, me.id, hi.id, 'HEART', NOW);
  await markRead(sam.id, me.id, NOW);
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { userAId_userBId: orderedPair(me.id, sam.id) } });
  return { me, sam, conversationId: conversation.id };
}

async function chatRows(conversationId: string) {
  const [conversations, messages, reads] = await Promise.all([
    prisma.conversation.count({ where: { id: conversationId } }),
    prisma.message.count({ where: { conversationId } }),
    prisma.conversationRead.count({ where: { conversationId } }),
  ]);
  return { conversations, messages, reads };
}

it('unpair deletes the conversation for both people, with its messages, reactions and reads; a re-pair starts empty', async () => {
  const { me, sam, conversationId } = await talking();
  const ben = await buddyUser();
  await pairUp(me.id, ben.id);
  await sendMessage(ben.id, me.id, { kind: 'TEXT', text: 'still here' }, NOW);
  await unpair(sam.id, me.id, NOW);
  expect(await chatRows(conversationId)).toEqual({ conversations: 0, messages: 0, reads: 0 });
  expect(await prisma.messageReaction.count({ where: { reactorId: sam.id } })).toBe(0);
  // The sticker message went with the conversation, and the Sticker row with the pair.
  expect(await prisma.sticker.count({ where: { OR: [{ fromUserId: sam.id }, { toUserId: sam.id }] } })).toBe(0);
  expect((await listChats(me.id, undefined, NOW)).chats.map((c) => c.buddy.id)).toEqual([ben.id]);
  expect((await listChats(sam.id, undefined, NOW)).chats).toEqual([]);
  expect(await unreadChatsCount(me.id)).toBe(1);
  await expect(listThread(me.id, sam.id, undefined, NOW)).rejects.toMatchObject({ code: 'not_buddies' });
  await pairUp(me.id, sam.id);
  expect((await listThread(me.id, sam.id, undefined, NOW)).messages).toEqual([]);
  expect((await listThread(sam.id, me.id, undefined, NOW)).messages).toEqual([]);
});

it('a block, from either side, deletes it too', async () => {
  for (const blockerIsMe of [true, false]) {
    const { me, sam, conversationId } = await talking();
    if (blockerIsMe) await blockBuddy(me.id, sam.id, NOW);
    else await blockBuddy(sam.id, me.id, NOW);
    expect([blockerIsMe, await chatRows(conversationId)]).toEqual([blockerIsMe, { conversations: 0, messages: 0, reads: 0 }]);
    expect(await prisma.messageReaction.count({ where: { reactorId: sam.id } })).toBe(0);
    await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'hello?' }, NOW)).rejects.toMatchObject({ code: 'not_buddies' });
    expect(await prisma.conversation.count({ where: orderedPair(me.id, sam.id) })).toBe(0);
  }
});

it('a block between people with no pair still clears a conversation left behind', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  const conversation = await prisma.conversation.create({ data: orderedPair(me.id, sam.id) });
  await prisma.message.create({ data: { conversationId: conversation.id, senderId: sam.id, kind: 'TEXT', text: 'left behind' } });
  await block(me.id, sam.id, NOW);
  expect(await chatRows(conversation.id)).toEqual({ conversations: 0, messages: 0, reads: 0 });
});

it('unpair and block leave reports in place', async () => {
  for (const end of ['unpair', 'block'] as const) {
    const { me, sam } = await talking();
    const message = await prisma.message.findFirstOrThrow({ where: { senderId: sam.id } });
    await prisma.report.create({ data: { reporterId: me.id, reportedUserId: sam.id, targetType: 'MESSAGE', targetId: message.id, reason: 'SPAM' } });
    if (end === 'unpair') await unpair(me.id, sam.id, NOW);
    else await blockBuddy(me.id, sam.id, NOW);
    expect([end, await prisma.report.count({ where: { reporterId: me.id } })]).toEqual([end, 1]);
  }
});

// A send locks the pair row, then the conversation; unpair deletes the pair first, then the conversation: one waits
// for the other, never a deadlock. Either the send lands first (and its message goes with the conversation) or the
// unpair does (and the send is not_buddies).
it('a message racing an unpair is either deleted with the conversation or refused, never left behind', async () => {
  for (let i = 0; i < 5; i++) {
    const { me, sam, conversationId } = await talking();
    const [send, end] = await Promise.allSettled([
      sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'racing' }, NOW),
      unpair(sam.id, me.id, NOW),
    ]);
    expect(end.status).toBe('fulfilled');
    if (send.status === 'rejected') expect(send.reason).toMatchObject({ code: 'not_buddies' });
    expect(await chatRows(conversationId)).toEqual({ conversations: 0, messages: 0, reads: 0 });
    expect(await prisma.conversation.count({ where: orderedPair(me.id, sam.id) })).toBe(0);
    expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(0);
  }
});

it('a message racing a block is either deleted with the conversation or refused, never left behind', async () => {
  for (let i = 0; i < 5; i++) {
    const { me, sam, conversationId } = await talking();
    const [send, end] = await Promise.allSettled([
      sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'racing' }, NOW),
      block(sam.id, me.id, NOW),
    ]);
    expect(end.status).toBe('fulfilled');
    if (send.status === 'rejected') expect(send.reason).toMatchObject({ code: 'not_buddies' });
    expect(await chatRows(conversationId)).toEqual({ conversations: 0, messages: 0, reads: 0 });
    expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(0);
  }
});

it("an ex-buddy's notes, camp note, story, timeline items and camp presence are hidden at read time", async () => {
  const LA = 'America/Los_Angeles';
  const NIGHT = new Date('2026-10-08T05:30:00Z'); // Oct 7, 22:30 in Los Angeles
  const me = await buddyUser({ timezone: LA });
  const sam = await buddyUser({ timezone: LA });
  const ana = await buddyUser({ timezone: LA });
  for (const u of [sam, ana]) await pairUp(me.id, u.id);
  for (const u of [sam, ana]) {
    await prisma.goodnight.create({ data: { authorId: u.id, localDate: civilDateToUtcMidnight('2026-10-07'), at: new Date('2026-10-08T05:00:00Z'), onTime: true } });
    await prisma.campNote.create({ data: { authorId: u.id, text: `camp ${u.id}`, createdAt: new Date('2026-10-08T05:05:00Z'), expiresAt: new Date('2026-10-08T13:00:00Z') } });
    await prisma.statusNote.create({ data: { authorId: u.id, text: `chats ${u.id}`, createdAt: new Date('2026-10-08T05:05:00Z'), expiresAt: new Date('2026-10-09T05:05:00Z') } });
  }
  const seen = async () => ({
    notes: (await getNotes(me.id, NIGHT)).buddies.map((n) => n.person.id).sort(),
    camp: (await getCamp(me.id, NIGHT)).members.filter((m) => !m.mine).map((m) => m.person.id).sort(),
    rings: (await loadStoryRings(me.id, NIGHT)).rings.map((r) => r.author.id).sort(),
    timeline: [...new Set((await buildTimeline(me.id, NIGHT)).map((i) => i.actor.id))].sort(),
  });
  const both = [sam.id, ana.id].sort();
  expect(await seen()).toEqual({ notes: both, camp: both, rings: both, timeline: both });
  await unpair(me.id, sam.id, NIGHT);
  await blockBuddy(ana.id, me.id, NIGHT);
  expect(await seen()).toEqual({ notes: [], camp: [], rings: [], timeline: [] });
  const json = JSON.stringify([await getNotes(me.id, NIGHT), await getCamp(me.id, NIGHT)]);
  expect(json).not.toMatch(/camp |chats /);
});

// The suites share one database, so the sweep never runs on the real clock here: a far-past clock with far-past
// fixtures reaches only this file's rows (other suites' notes expire, and their reports are made, in 2026).
it('the sweep deletes expired Chats notes and reports older than 90 days, and keeps the rest', async () => {
  const SWEEP_NOW = new Date('2025-02-10T12:00:00Z');
  const a = await buddyUser();
  const b = await buddyUser();
  await prisma.statusNote.create({ data: { authorId: a.id, text: 'old', createdAt: new Date(SWEEP_NOW.getTime() - 2 * DAY), expiresAt: new Date(SWEEP_NOW.getTime() - DAY) } });
  await prisma.statusNote.create({ data: { authorId: b.id, text: 'live', createdAt: new Date(SWEEP_NOW.getTime() - DAY / 2), expiresAt: new Date(SWEEP_NOW.getTime() + DAY / 2) } });
  const old = await prisma.report.create({ data: { reporterId: a.id, reportedUserId: b.id, targetType: 'STATUS_NOTE', targetId: b.id, reason: 'SPAM', createdAt: new Date(SWEEP_NOW.getTime() - 91 * DAY) } });
  const recent = await prisma.report.create({ data: { reporterId: b.id, reportedUserId: a.id, targetType: 'STATUS_NOTE', targetId: a.id, reason: 'OTHER', createdAt: new Date(SWEEP_NOW.getTime() - 89 * DAY) } });
  const result = await runSocialSweep(SWEEP_NOW);
  expect(result.statusNotes).toBeGreaterThanOrEqual(1);
  expect(result.reports).toBeGreaterThanOrEqual(1);
  expect(await prisma.statusNote.findMany({ where: { authorId: { in: [a.id, b.id] } }, select: { text: true } })).toEqual([{ text: 'live' }]);
  expect((await prisma.report.findMany({ where: { id: { in: [old.id, recent.id] } }, select: { id: true } })).map((r) => r.id)).toEqual([recent.id]);
});

// Gated races (final review M1, M9/T11): the next transaction pauses at `model.method` and starts `racer` there, then
// goes on once the racer is waiting on a lock of this database (or after 3 s), so the two overlap the same way every run.
type Delegates = Record<string, Record<string, (...args: unknown[]) => unknown>>;
async function racerWaiting(): Promise<void> {
  for (let i = 0; i < 150; i++) {
    const [row] = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (row && row.n > 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}
function gateNextTransaction(model: string, method: string, racer: () => Promise<unknown>): () => Promise<PromiseSettledResult<unknown>> {
  let raced: Promise<PromiseSettledResult<unknown>> | null = null;
  const real = prisma.$transaction.bind(prisma) as (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) => Promise<unknown>;
  jest.spyOn(prisma, '$transaction').mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>, opts?: unknown) =>
    real((tx) => {
      const delegates = tx as Delegates;
      const gated = new Proxy(delegates[model]!, {
        get: (target, key) => {
          const value = target[key as string];
          if (key !== method || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value;
          return async (...args: unknown[]) => {
            if (!raced) {
              raced = racer().then((value) => ({ status: 'fulfilled' as const, value }), (reason: unknown) => ({ status: 'rejected' as const, reason }));
              await racerWaiting();
            }
            return value.apply(target, args);
          };
        },
      });
      return fn(new Proxy(delegates, { get: (target, key) => (key === model ? gated : (target as Record<string | symbol, unknown>)[key]) }));
    }, opts)) as never);
  return () => raced ?? Promise.resolve({ status: 'fulfilled', value: undefined });
}
const quiet = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };

// M1: block stores the BuddyBlock row (its foreign keys hold both User rows FOR KEY SHARE) right after the pair lock,
// before any row lock, so an account deletion that starts mid-block waits for it instead of deadlocking (40P01).
it('an account deletion that starts mid-block waits for the block: both finish, nothing is left behind', async () => {
  const { me, sam, conversationId } = await talking();
  const raced = gateNextTransaction('conversation', 'deleteMany', () => deleteUserAccount(me.id, quiet));
  await expect(block(sam.id, me.id, NOW)).resolves.toBeUndefined();
  expect((await raced()).status).toBe('fulfilled');
  expect(await prisma.user.count({ where: { id: me.id } })).toBe(0);
  expect(await chatRows(conversationId)).toEqual({ conversations: 0, messages: 0, reads: 0 });
  expect(await prisma.buddyBlock.count({ where: { OR: [{ blockerId: me.id }, { blockedId: me.id }] } })).toBe(0);
  expect(await prisma.buddyPair.count({ where: orderedPair(me.id, sam.id) })).toBe(0);
});

it('blocking an account already deleted ends quietly and stores nothing', async () => {
  const { me, sam } = await talking();
  await deleteUserAccount(me.id, quiet);
  await expect(block(sam.id, me.id, NOW)).resolves.toBeUndefined();
  expect(await prisma.buddyBlock.count({ where: { blockerId: sam.id } })).toBe(0);
});

// M9 (T11): the send holds the pair lock with its message written; a block arriving then waits, and its delete takes
// the new message with the conversation. The send still answers what it stored.
it('a block that arrives while a send holds the pair waits, then deletes the conversation with the new message', async () => {
  const { me, sam, conversationId } = await talking();
  const raced = gateNextTransaction('message', 'findUniqueOrThrow', () => block(sam.id, me.id, NOW));
  const sent = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'just in time' }, NOW);
  expect(sent).toMatchObject({ mine: true, text: 'just in time' });
  expect((await raced()).status).toBe('fulfilled');
  expect(await chatRows(conversationId)).toEqual({ conversations: 0, messages: 0, reads: 0 });
  expect(await prisma.message.count({ where: { id: sent.id } })).toBe(0);
  expect(await prisma.buddyBlock.count({ where: { blockerId: sam.id, blockedId: me.id } })).toBe(1);
});
