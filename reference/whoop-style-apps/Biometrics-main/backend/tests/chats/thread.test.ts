import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { orderedPair } from '../../src/buddies/pairs';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { BUDDY_SHARING_CONSENT_VERSION } from '../../src/buddies/sharing';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { listThread, markRead, sendMessage } from '../../src/chats/messages';
import { activeAtFor, touchPresence, updateChatSettings } from '../../src/chats/presence';
import { RecordingQueue, api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
beforeEach(() => setBuddyNotifyQueue(new RecordingQueue()));
afterEach(() => setBuddyNotifyQueue(null));

const NOW = new Date('2026-10-08T18:00:00Z');
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

async function buddies() {
  const me = await buddyUser({ displayName: 'Ana' });
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(me.id, sam.id);
  return { me, sam };
}
/** Messages written straight to the table (the limiter is not under test here), one a minute from `from`. */
async function seed(me: string, sam: string, count: number, from = 0) {
  const conversation = await prisma.conversation.upsert({ where: { userAId_userBId: orderedPair(me, sam) }, create: orderedPair(me, sam), update: {} });
  await prisma.message.createMany({
    data: Array.from({ length: count }, (_, i) => ({ conversationId: conversation.id, senderId: i % 2 === 0 ? sam : me, kind: 'TEXT' as const, text: `m${from + i}`, createdAt: at(from + i) })),
  });
  return conversation.id;
}

it('pages 50 at a time, oldest first on the wire, with a cursor for the page before; unsent messages never show', async () => {
  const { me, sam } = await buddies();
  const conversationId = await seed(me.id, sam.id, 53);
  await prisma.message.updateMany({ where: { conversationId, text: 'm52' }, data: { deletedAt: at(60), text: null } });
  // 52 visible (m0..m51): the newest 50 are m2..m51, the page before holds m0 and m1.
  const newest = await listThread(me.id, sam.id, undefined, at(100));
  expect(newest.messages.map((m) => m.text)).toEqual(Array.from({ length: 50 }, (_, i) => `m${i + 2}`));
  expect(newest.nextBefore).toEqual(expect.any(String));
  const older = await listThread(me.id, sam.id, newest.nextBefore, at(100));
  expect([older.messages.map((m) => m.text), older.nextBefore]).toEqual([['m0', 'm1'], null]);
  expect(newest.buddy).toEqual({ id: sam.id, handle: sam.handle, displayName: 'Sam', coachId: expect.any(String), kipColour: 'coral' });
  expect(newest.messages.find((m) => m.text === 'm2')!.mine).toBe(false);
  expect(newest.messages.find((m) => m.text === 'm3')!.mine).toBe(true);
});

it('a pair with no messages yet reads as an empty thread; a bad cursor is invalid_cursor', async () => {
  const { me, sam } = await buddies();
  expect(await listThread(me.id, sam.id, undefined, NOW)).toEqual({
    buddy: expect.objectContaining({ id: sam.id }), messages: [], nextBefore: null, seenAt: null, activeAt: null,
  });
  await expect(listThread(me.id, sam.id, 'not-a-cursor', NOW)).rejects.toMatchObject({ code: 'invalid_cursor' });
});

// Fix round 1: "Seen" is my newest message's time once the buddy read it, never their read time (that moves on every
// open and poll, so it would show when they are in the thread even with activity status off).
it('"Seen" is the time of my newest message once the buddy has read it, and only while it is the thread\'s newest', async () => {
  const { me, sam } = await buddies();
  const seen = async (now: Date, before?: string) => (await listThread(me.id, sam.id, before, now)).seenAt;
  await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'early night?' }, NOW);
  expect(await seen(at(1))).toBeNull();
  await markRead(sam.id, me.id, at(2));
  expect(await seen(at(3))).toBe(NOW.toISOString());
  // Re-reading later with nothing new changes nothing: their read time never shows.
  await markRead(sam.id, me.id, at(30));
  expect(await seen(at(31))).toBe(NOW.toISOString());
  // A newer message of mine is unseen until their read reaches it.
  const second = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'or a film?' }, at(32));
  expect(await seen(at(33))).toBeNull();
  await markRead(sam.id, me.id, at(34));
  expect(await seen(at(35))).toBe(second.createdAt);
  // Their reply after it: my newest is no longer the thread's newest.
  const reply = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'film' }, at(36));
  expect(await seen(at(37))).toBeNull();
  // Unsent, the reply no longer counts: my message is the newest live one again.
  await prisma.message.update({ where: { id: reply.id }, data: { deletedAt: at(38), text: null } });
  expect(await seen(at(39))).toBe(second.createdAt);
  // An older page answers for the whole thread, not for its own rows.
  const conversationId = (await prisma.message.findUniqueOrThrow({ where: { id: second.id } })).conversationId;
  await prisma.message.createMany({ data: Array.from({ length: 50 }, (_, i) => ({ conversationId, senderId: sam.id, kind: 'TEXT' as const, text: `old${i}`, createdAt: at(-100 + i) })) });
  const newest = await listThread(me.id, sam.id, undefined, at(40));
  expect(newest.nextBefore).toEqual(expect.any(String));
  expect(await seen(at(40), newest.nextBefore!)).toBe(second.createdAt);
});

it('"Seen" is reciprocal: either person turning read receipts off (through the settings route) hides it', async () => {
  const { me, sam } = await buddies();
  await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'early night?' }, NOW);
  await markRead(sam.id, me.id, at(2));
  const agent = await api();
  const seen = async () => (await listThread(me.id, sam.id, undefined, at(3))).seenAt;
  expect(await seen()).toBe(NOW.toISOString());
  for (const who of [sam.id, me.id]) {
    const headers = await authHeaderFor(who);
    const off = await agent.put('/me/chats/settings').set(headers).send({ readReceipts: false });
    expect([off.status, off.headers['cache-control'], off.body]).toEqual([200, 'private, no-store', { readReceipts: false, activityStatus: true }]);
    expect([who, await seen()]).toEqual([who, null]);
    await agent.put('/me/chats/settings').set(headers).send({ readReceipts: true });
  }
  expect(await seen()).toBe(NOW.toISOString());
});

it('read receipts off never touch unread: my read still moves, and the buddy\'s read is not mine to change', async () => {
  const { me, sam } = await buddies();
  const agent = await api();
  await agent.put('/me/chats/settings').set(await authHeaderFor(me.id)).send({ readReceipts: false });
  await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'hi' }, NOW);
  await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'hey' }, at(1));
  await markRead(me.id, sam.id, at(5));
  const reads = await prisma.conversationRead.findMany({ select: { readerId: true, lastReadAt: true }, where: { readerId: { in: [me.id, sam.id] } } });
  const readOf = (id: string) => reads.find((r) => r.readerId === id)?.lastReadAt.toISOString();
  // Mine moved to now; Sam's stays at his own send, so my message still counts as unread for him.
  expect([readOf(me.id), readOf(sam.id)]).toEqual([at(5).toISOString(), NOW.toISOString()]);
});

it('showing activity status is reciprocal through the settings route', async () => {
  const { me, sam } = await buddies();
  await touchPresence(sam.id, NOW);
  const agent = await api();
  const active = async () => (await listThread(me.id, sam.id, undefined, at(5))).activeAt;
  expect(await active()).toBe(NOW.toISOString());
  for (const who of [sam.id, me.id]) {
    const headers = await authHeaderFor(who);
    expect((await agent.put('/me/chats/settings').set(headers).send({ activityStatus: false })).body).toEqual({ readReceipts: true, activityStatus: false });
    expect([who, await active()]).toEqual([who, null]);
    await agent.put('/me/chats/settings').set(headers).send({ activityStatus: true });
  }
  expect(await active()).toBe(NOW.toISOString());
});

it('updating the settings of a missing account is a coded refusal', async () => {
  await expect(updateChatSettings('00000000-0000-4000-8000-000000000000', { readReceipts: false })).rejects.toMatchObject({ code: 'not_buddies' });
});

it('marking read while an unpair deletes the conversation ends quietly', async () => {
  const { me, sam } = await buddies();
  await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'hi' }, NOW);
  // The conversation is found, then deleted (as an unpair does) before the read is written.
  const real = prisma.conversation.findUnique.bind(prisma.conversation);
  const spy = jest.spyOn(prisma.conversation, 'findUnique').mockImplementationOnce(((args: Parameters<typeof real>[0]) =>
    real(args).then(async (row) => {
      await prisma.conversation.deleteMany({ where: orderedPair(me.id, sam.id) });
      return row;
    })) as unknown as typeof prisma.conversation.findUnique);
  try {
    await expect(markRead(me.id, sam.id, at(1))).resolves.toBeUndefined();
  } finally {
    spy.mockRestore();
  }
  expect(await prisma.conversationRead.count({ where: { readerId: me.id } })).toBe(0);
});

it('reading moves my read and marks their stickers seen, even before any message', async () => {
  const { me, sam } = await buddies();
  const kim = await buddyUser({ displayName: 'Kim' });
  await pairUp(me.id, kim.id);
  await prisma.sticker.create({ data: { fromUserId: sam.id, toUserId: me.id, kind: 'CHEER', sentAt: NOW } });
  await prisma.sticker.create({ data: { fromUserId: kim.id, toUserId: me.id, kind: 'CHEER', sentAt: NOW } });
  await markRead(me.id, sam.id, at(1));
  // Sam's sticker is seen; another buddy's stays unseen until their thread is read.
  const unseen = await prisma.sticker.findMany({ where: { toUserId: me.id, seenAt: null }, select: { fromUserId: true } });
  expect(unseen).toEqual([{ fromUserId: kim.id }]);
  await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'hi' }, at(2));
  await markRead(me.id, sam.id, at(3));
  const read = await prisma.conversationRead.findFirstOrThrow({ where: { readerId: me.id } });
  expect(read.lastReadAt.toISOString()).toBe(at(3).toISOString());
});

it('activity status: touched at most once a minute, shown within 24 h only while both share it', async () => {
  const { me, sam } = await buddies();
  await touchPresence(sam.id, NOW);
  await touchPresence(sam.id, at(0.5)); // within the minute: unchanged
  expect((await prisma.user.findUniqueOrThrow({ where: { id: sam.id } })).lastActiveAt?.toISOString()).toBe(NOW.toISOString());
  await touchPresence(sam.id, at(1));
  expect((await prisma.user.findUniqueOrThrow({ where: { id: sam.id } })).lastActiveAt?.toISOString()).toBe(at(1).toISOString());
  expect((await listThread(me.id, sam.id, undefined, at(5))).activeAt).toBe(at(1).toISOString());
  expect((await listThread(me.id, sam.id, undefined, at(1 + 24 * 60 + 1))).activeAt).toBeNull();
  await prisma.user.update({ where: { id: me.id }, data: { chatActivityStatus: false } });
  expect((await listThread(me.id, sam.id, undefined, at(5))).activeAt).toBeNull();
  // Pure rule, both ways.
  const seenAt = { chatActivityStatus: true, lastActiveAt: NOW };
  expect(activeAtFor({ chatActivityStatus: true }, seenAt, at(10))).toBe(NOW.toISOString());
  expect(activeAtFor({ chatActivityStatus: true }, { ...seenAt, chatActivityStatus: false }, at(10))).toBeNull();
  expect(activeAtFor({ chatActivityStatus: false }, seenAt, at(10))).toBeNull();
  expect(activeAtFor({ chatActivityStatus: true }, { chatActivityStatus: true, lastActiveAt: null }, at(10))).toBeNull();
});

it('reading a thread and sending touch my presence', async () => {
  const { me, sam } = await buddies();
  await listThread(me.id, sam.id, undefined, NOW);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).lastActiveAt?.toISOString()).toBe(NOW.toISOString());
  await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'hi' }, at(2));
  expect((await prisma.user.findUniqueOrThrow({ where: { id: sam.id } })).lastActiveAt?.toISOString()).toBe(at(2).toISOString());
});

it('routes: GET messages and POST read answer not_buddies for a stranger; settings read and save; presence is 204', async () => {
  const { me, sam } = await buddies();
  const stranger = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const thread = await agent.get(`/me/chats/${sam.id}/messages`).set(headers);
  expect([thread.status, thread.headers['cache-control'], Object.keys(thread.body).sort()]).toEqual([200, 'private, no-store', ['activeAt', 'buddy', 'messages', 'nextBefore', 'seenAt']]);
  for (const path of [`/me/chats/${stranger.id}/messages`, '/me/chats/nope/messages', `/me/chats/${me.id}/messages`]) {
    const res = await agent.get(path).set(headers);
    expect([path, res.status, res.body]).toEqual([path, 403, { error: 'not_buddies' }]);
  }
  expect((await agent.post(`/me/chats/${sam.id}/read`).set(headers)).status).toBe(204);
  expect((await agent.post(`/me/chats/${stranger.id}/read`).set(headers)).body).toEqual({ error: 'not_buddies' });
  expect((await agent.get(`/me/chats/${sam.id}/messages?before=junk`).set(headers)).body).toEqual({ error: 'invalid_cursor' });
  expect((await agent.get('/me/chats/settings').set(headers)).body).toEqual({ readReceipts: true, activityStatus: true });
  expect((await agent.put('/me/chats/settings').set(headers).send({ readReceipts: false })).body).toEqual({ readReceipts: false, activityStatus: true });
  for (const bad of [{}, { readReceipts: 'no' }, { typing: true }]) {
    expect((await agent.put('/me/chats/settings').set(headers).send(bad)).body).toEqual({ error: 'invalid_settings' });
  }
  expect((await agent.post('/me/presence').set(headers)).status).toBe(204);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).lastActiveAt).not.toBeNull();
});

// Card gate (Task 5 fix): a page serves a card's number only while it is still shared, like a single read.
it('a badge card in a page serves its level only while its author still shares streaks', async () => {
  const { me, sam } = await buddies();
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });
  const badgeAt = at(-120);
  const day = civilDateToUtcMidnight;
  await prisma.achievement.create({
    data: { userId: sam.id, family: 'SLEEP_GOAL', level: 3, value: 14, earnedOn: day('2026-10-08'), weekStart: day('2026-10-05'), monthStart: day('2026-10-01'), createdAt: badgeAt },
  });
  await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'look' }, NOW);
  await sendMessage(me.id, sam.id, { kind: 'CARD', card: { type: 'story_frame', at: badgeAt.toISOString() } }, at(1));
  const cardOf = async (viewer: string, buddy: string) => (await listThread(viewer, buddy, undefined, at(2))).messages.find((m) => m.kind === 'CARD')!.card;
  expect(await cardOf(me.id, sam.id)).toEqual({ type: 'badge', available: true, family: 'SLEEP_GOAL', level: 3 });
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: false } });
  for (const [viewer, buddy] of [[me.id, sam.id], [sam.id, me.id]]) {
    expect(await cardOf(viewer, buddy)).toEqual({ type: 'badge', available: false, family: 'SLEEP_GOAL' });
  }
});

// Final review M4: a send is stamped max(now, lastMessageAt + 1 ms), and another instance's clock may run ahead, so
// a message can carry a time just after the reader's now. Reading the thread must still cover it.
it('marking read covers a live message stamped just after my now', async () => {
  const { me, sam } = await buddies();
  const ahead = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'hi' }, new Date(NOW.getTime() + 5));
  await markRead(me.id, sam.id, NOW);
  const read = await prisma.conversationRead.findFirstOrThrow({ where: { readerId: me.id } });
  expect(read.lastReadAt.toISOString()).toBe(ahead.createdAt);
  // Never back: a later read at an earlier now leaves it.
  await markRead(me.id, sam.id, new Date(NOW.getTime() - 60_000));
  expect((await prisma.conversationRead.findFirstOrThrow({ where: { readerId: me.id } })).lastReadAt.toISOString()).toBe(ahead.createdAt);
});
