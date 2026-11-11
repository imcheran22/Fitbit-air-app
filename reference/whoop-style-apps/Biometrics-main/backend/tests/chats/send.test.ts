import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { orderedPair } from '../../src/buddies/pairs';
import * as notifyQueue from '../../src/buddies/notifyQueue';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import * as presence from '../../src/chats/presence';
import { blockBuddy, unpair } from '../../src/buddies/relations';
import { sendMessage } from '../../src/chats/messages';
import { RecordingQueue, api, buddyUser, pairUp } from '../buddies/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
let queue: RecordingQueue;
beforeEach(() => {
  queue = new RecordingQueue();
  setBuddyNotifyQueue(queue);
});
afterEach(() => {
  setBuddyNotifyQueue(null);
  jest.restoreAllMocks();
});

const NOW = new Date('2026-10-08T18:00:00Z');
// Built at run time so no editor or tool can turn the lone surrogate into other bytes.
const LONE_SURROGATE = String.fromCharCode(0xd800);

async function buddies() {
  const me = await buddyUser({ displayName: 'Ana' });
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(me.id, sam.id, new Date('2026-10-01T00:00:00Z'));
  return { me, sam };
}
const post = async (from: string, to: string, body: object) => (await api()).post(`/me/chats/${to}/messages`).set(await authHeaderFor(from)).send(body);

it("sends a text: one ordered conversation made on first use, the message, the bumped pair and the sender's read", async () => {
  const { me, sam } = await buddies();
  const first = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: '  early night tonight?  ' }, NOW);
  expect(first).toEqual({ id: expect.any(String), mine: true, kind: 'TEXT', text: 'early night tonight?', sticker: null, card: null, replyTo: null, reactions: [], createdAt: NOW.toISOString() });
  const later = new Date(NOW.getTime() + 60_000);
  await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'rough night lol' }, later);
  const conversations = await prisma.conversation.findMany({ where: orderedPair(me.id, sam.id) });
  expect(conversations).toHaveLength(1);
  expect(conversations[0]!.lastMessageAt.toISOString()).toBe(later.toISOString());
  expect(await prisma.message.count({ where: { conversationId: conversations[0]!.id } })).toBe(2);
  const pair = await prisma.buddyPair.findUniqueOrThrow({ where: { userAId_userBId: orderedPair(me.id, sam.id) } });
  expect(pair.lastActivityAt.toISOString()).toBe(later.toISOString());
  const reads = await prisma.conversationRead.findMany({ where: { conversationId: conversations[0]!.id }, orderBy: { lastReadAt: 'asc' }, select: { readerId: true, lastReadAt: true } });
  expect(reads).toEqual([{ readerId: me.id, lastReadAt: NOW }, { readerId: sam.id, lastReadAt: later }]);
});

it('two first messages at once make one conversation', async () => {
  const { me, sam } = await buddies();
  await Promise.all([sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'a' }, NOW), sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'b' }, NOW)]);
  expect(await prisma.conversation.count({ where: orderedPair(me.id, sam.id) })).toBe(1);
  expect(await prisma.message.count({ where: { conversation: orderedPair(me.id, sam.id) } })).toBe(2);
});

it('refuses an invalid text before the limiter, and stores nothing', async () => {
  const { me, sam } = await buddies();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  const bodies = [
    { kind: 'TEXT', text: '   ' }, { kind: 'TEXT', text: 'x'.repeat(1001) }, { kind: 'TEXT' }, { kind: 'TEXT', text: 42 },
    { kind: 'TEXT', text: `hi${LONE_SURROGATE}` }, { kind: 'VOICE', text: 'hi' }, {}, ['TEXT'],
  ];
  for (const body of bodies) {
    const res = await post(me.id, sam.id, body);
    expect([body, res.status, res.body]).toEqual([body, 400, { error: 'invalid_message' }]);
  }
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(0);
});

it('answers not_buddies (403) for a stranger, oneself, a malformed id and across a block, storing nothing', async () => {
  const { me, sam } = await buddies();
  const stranger = await buddyUser();
  for (const to of [stranger.id, me.id, 'not-a-uuid']) {
    const res = await post(me.id, to, { kind: 'TEXT', text: 'hi' });
    expect([to, res.status, res.body]).toEqual([to, 403, { error: 'not_buddies' }]);
  }
  await blockBuddy(sam.id, me.id, NOW);
  expect((await post(me.id, sam.id, { kind: 'TEXT', text: 'hi' })).body).toEqual({ error: 'not_buddies' });
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(0);
  expect(await prisma.conversation.count({ where: orderedPair(me.id, sam.id) })).toBe(0);
});

it('spends the 30-a-minute and 500-a-day buckets on a text, failing closed', async () => {
  const { me, sam } = await buddies();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit')
    .mockResolvedValueOnce('limited')
    .mockResolvedValueOnce('unavailable')
    .mockResolvedValueOnce('ok')
    .mockResolvedValueOnce('limited');
  await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'a' }, NOW)).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'b' }, NOW)).rejects.toMatchObject({ code: 'try_later' });
  await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'c' }, NOW)).rejects.toMatchObject({ code: 'rate_limited' });
  expect(spy.mock.calls.map(([limit]) => limit.name)).toEqual(['message', 'message', 'message', 'message_day']);
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(0);
});

it('the 31st text in a minute is rate_limited', async () => {
  const { me, sam } = await buddies();
  // One fixed clock for every call: all 31 land in the same window.
  jest.spyOn(Date, 'now').mockReturnValue(Date.now());
  for (let i = 0; i < 30; i++) await sendMessage(me.id, sam.id, { kind: 'TEXT', text: `m${i}` }, NOW);
  await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'one more' }, NOW)).rejects.toMatchObject({ code: 'rate_limited' });
});

it('a sticker through the chat writes the Buddies sticker, its Activity row and a STICKER message, with one buddy_sticker job', async () => {
  const { me, sam } = await buddies();
  const message = await sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'HEART' }, NOW);
  expect(message).toMatchObject({ mine: true, kind: 'STICKER', sticker: 'HEART', text: null, card: null });
  const sticker = await prisma.sticker.findFirstOrThrow({ where: { fromUserId: me.id, toUserId: sam.id } });
  expect(sticker.kind).toBe('HEART');
  expect(await prisma.buddyActivity.count({ where: { recipientId: sam.id, actorId: me.id, kind: 'STICKER', refId: sticker.id } })).toBe(1);
  expect(queue.jobs.map((j) => j.data.kind)).toEqual(['buddy_sticker']);
  expect((await post(me.id, sam.id, { kind: 'STICKER', sticker: 'KISS' })).body).toEqual({ error: 'invalid_sticker' });
});

it("every sticker send lands in the thread, the Buddies route's too; the sixth of the day is sticker_limit", async () => {
  const { me, sam } = await buddies();
  const res = await (await api()).post(`/me/buddies/${sam.id}/stickers`).set(await authHeaderFor(me.id)).send({ kind: 'STAR' });
  expect([res.status, Object.keys(res.body)]).toEqual([201, ['id']]);
  for (let i = 0; i < 4; i++) await sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'CHEER' }, new Date());
  await expect(sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'CHEER' }, new Date())).rejects.toMatchObject({ code: 'sticker_limit' });
  expect(await prisma.message.count({ where: { senderId: me.id, kind: 'STICKER' } })).toBe(5);
});

it('a reply names a live message of the same conversation; anything else is message_gone and stores nothing', async () => {
  const { me, sam } = await buddies();
  const ben = await buddyUser();
  await pairUp(me.id, ben.id);
  const original = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'rough night lol' }, NOW);
  const elsewhere = await sendMessage(ben.id, me.id, { kind: 'TEXT', text: 'hey' }, NOW);
  const reply = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'oh no', replyToMessageId: original.id }, NOW);
  expect(reply.replyTo).toEqual({ id: original.id, gone: false, mine: false, kind: 'TEXT', text: 'rough night lol', sticker: null, cardType: null });
  const sticker = await sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'REST_UP', replyToMessageId: original.id }, NOW);
  expect(sticker.replyTo).toMatchObject({ id: original.id, gone: false });
  const before = await prisma.message.count({ where: { senderId: me.id } });
  for (const replyToMessageId of [elsewhere.id, '00000000-0000-4000-8000-000000000000', 'nope', 7]) {
    await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'x', replyToMessageId }, NOW)).rejects.toMatchObject({ code: 'message_gone' });
  }
  await expect(sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'STAR', replyToMessageId: elsewhere.id }, NOW)).rejects.toMatchObject({ code: 'message_gone' });
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(before);
  expect(await prisma.sticker.count({ where: { fromUserId: me.id, kind: 'STAR' } })).toBe(0);
});

it('route: 201 { message }, and auth is required', async () => {
  const { me, sam } = await buddies();
  const res = await post(me.id, sam.id, { kind: 'TEXT', text: 'hi' });
  expect([res.status, res.body.message.text, res.body.message.mine]).toEqual([201, 'hi', true]);
  expect((await (await api()).post(`/me/chats/${sam.id}/messages`).send({ kind: 'TEXT', text: 'hi' })).status).toBe(401);
});

// Tripwire only: it sees console calls on this path in this process. The real check is the backend-wide grep (Task 19).
it('never logs the text (tripwire)', async () => {
  const { me, sam } = await buddies();
  const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'secret chat words' }, NOW);
  await expect(sendMessage(me.id, sam.id, { kind: 'TEXT', text: `secret chat words ${'x'.repeat(1000)}` }, NOW)).rejects.toMatchObject({ code: 'invalid_message' });
  for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain('secret chat');
});

it('a send that commits after a later one is stamped after it: no stamp goes back, no message hides behind a read', async () => {
  const { me, sam } = await buddies();
  const t1 = new Date(NOW.getTime() + 1_000);
  const t2 = new Date(NOW.getTime() + 2_000);
  // Sam's request arrived first (t1) but waited on the pair lock; mine (t2) committed before it.
  const mine = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'first to commit' }, t2);
  const theirs = await sendMessage(sam.id, me.id, { kind: 'STICKER', sticker: 'HEART' }, t1);
  expect(new Date(theirs.createdAt).getTime()).toBeGreaterThan(new Date(mine.createdAt).getTime());
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { userAId_userBId: orderedPair(me.id, sam.id) } });
  expect(conversation.lastMessageAt.toISOString()).toBe(theirs.createdAt);
  const myRead = await prisma.conversationRead.findFirstOrThrow({ where: { conversationId: conversation.id, readerId: me.id } });
  const samRead = await prisma.conversationRead.findFirstOrThrow({ where: { conversationId: conversation.id, readerId: sam.id } });
  // Unread for me (after my read mark); Sam's own read covers it.
  expect(new Date(theirs.createdAt).getTime()).toBeGreaterThan(myRead.lastReadAt.getTime());
  expect(samRead.lastReadAt.toISOString()).toBe(theirs.createdAt);
});

// Ruling P1: the message a send returns is read inside its transaction, so an unpair racing the send answers
// not_buddies (it landed first) or the sent message (it landed after), never a Prisma P2025 or a 500.
it('an unpair that lands between the limiter and the write answers not_buddies and stores nothing', async () => {
  const { me, sam } = await buddies();
  jest.spyOn(rateLimit, 'consumeRateLimit')
    .mockResolvedValueOnce('ok')
    .mockImplementationOnce(async () => {
      await unpair(sam.id, me.id, NOW);
      return 'ok';
    });
  const res = await post(me.id, sam.id, { kind: 'TEXT', text: 'hi' });
  expect([res.status, res.body]).toEqual([403, { error: 'not_buddies' }]);
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(0);
  expect(await prisma.conversation.count({ where: orderedPair(me.id, sam.id) })).toBe(0);
});

it('an unpair right after the send commits still answers the sent message, text or sticker', async () => {
  const { me, sam } = await buddies();
  const realTransaction = prisma.$transaction.bind(prisma) as (...args: unknown[]) => Promise<unknown>;
  // The unpair (which deletes the conversation too) lands the moment the send's transaction commits.
  const unpairOnCommit = () =>
    jest.spyOn(prisma, '$transaction').mockImplementationOnce((async (...args: unknown[]) => {
      const out = await realTransaction(...args);
      await unpair(sam.id, me.id, NOW);
      return out;
    }) as never);
  unpairOnCommit();
  const text = await post(me.id, sam.id, { kind: 'TEXT', text: 'hi' });
  expect([text.status, text.body.message]).toEqual([201, expect.objectContaining({ mine: true, kind: 'TEXT', text: 'hi' })]);
  expect(await prisma.message.count({ where: { id: text.body.message.id } })).toBe(0);
  await pairUp(me.id, sam.id, NOW);
  unpairOnCommit();
  const sticker = await post(me.id, sam.id, { kind: 'STICKER', sticker: 'HEART' });
  expect([sticker.status, sticker.body.message]).toEqual([201, expect.objectContaining({ mine: true, kind: 'STICKER', sticker: 'HEART' })]);
  expect(await prisma.message.count({ where: { id: sticker.body.message.id } })).toBe(0);
});

// Final review I1: once the message is committed, the send answers it. A failure after the commit (the push enqueue,
// touching presence) is logged by class only; a 500 there would make the app resend and store the message twice.
it('a failure after the commit still answers the stored message, once, text or sticker, and logs ids and a class only', async () => {
  const { me, sam } = await buddies();
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  const failure = Object.assign(new Error('pool timeout'), { name: 'PrismaClientInitializationError' });
  jest.spyOn(presence, 'touchPresence').mockRejectedValue(failure);
  const text = await post(me.id, sam.id, { kind: 'TEXT', text: 'secret after commit' });
  expect([text.status, text.body.message?.text]).toEqual([201, 'secret after commit']);
  const sticker = await post(me.id, sam.id, { kind: 'STICKER', sticker: 'HEART' });
  expect([sticker.status, sticker.body.message?.sticker]).toEqual([201, 'HEART']);
  jest.spyOn(notifyQueue, 'enqueueBuddyNotice').mockRejectedValueOnce(failure);
  const again = await post(me.id, sam.id, { kind: 'TEXT', text: 'second secret' });
  expect(again.status).toBe(201);
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(3);
  const logged = errors.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
  expect(logged).toEqual([
    { event: 'chats.after_send_failed', messageId: text.body.message.id, error: 'PrismaClientInitializationError' },
    { event: 'chats.after_send_failed', messageId: sticker.body.message.id, error: 'PrismaClientInitializationError' },
    { event: 'chats.after_send_failed', messageId: again.body.message.id, error: 'PrismaClientInitializationError' },
  ]);
  for (const call of errors.mock.calls) expect(JSON.stringify(call)).not.toMatch(/secret|Ana|Sam/);
});

it("the sender's name for the push is read before the write: a failed read stores nothing, so a retry can't duplicate", async () => {
  const { me, sam } = await buddies();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const real = prisma.user.findUnique.bind(prisma.user);
  jest.spyOn(prisma.user, 'findUnique').mockImplementation(((args: Parameters<typeof real>[0]) =>
    args.where.id === me.id && args.select && 'handle' in args.select ? Promise.reject(new Error('pool timeout')) : real(args)) as never);
  const res = await post(me.id, sam.id, { kind: 'TEXT', text: 'hi' });
  expect(res.status).toBe(500);
  expect(await prisma.message.count({ where: { senderId: me.id } })).toBe(0);
});
