import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { clearReaction, listThread, markRead, sendMessage, setReaction, unsendMessage } from '../../src/chats/messages';
import { saveCheckIn } from '../../src/social/checkins';
import { RecordingQueue, api, buddyUser, pairUp } from '../buddies/helpers';

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
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

async function chat() {
  const me = await buddyUser({ displayName: 'Ana' });
  const sam = await buddyUser({ displayName: 'Sam' });
  await pairUp(me.id, sam.id);
  const theirs = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'rough night lol' }, NOW);
  const mine = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'early night tonight?', replyToMessageId: theirs.id }, at(1));
  return { me, sam, theirs, mine };
}

it('one reaction per person per message: react, change it, both people react', async () => {
  const { me, sam, theirs } = await chat();
  expect(await setReaction(me.id, sam.id, theirs.id, 'HEART', at(2))).toEqual({ reactions: [{ kind: 'HEART', mine: true }] });
  expect(await setReaction(me.id, sam.id, theirs.id, 'STAR', at(3))).toEqual({ reactions: [{ kind: 'STAR', mine: true }] });
  await setReaction(sam.id, me.id, theirs.id, 'CHEER', at(4));
  const seenBySam = (await listThread(sam.id, me.id, undefined, at(5))).messages.find((m) => m.id === theirs.id)!;
  expect(seenBySam.reactions).toEqual([{ kind: 'STAR', mine: false }, { kind: 'CHEER', mine: true }]);
  expect(await prisma.messageReaction.count({ where: { messageId: theirs.id } })).toBe(2);
});

it('refuses an unknown kind before the limiter, and a missing, unsent or other conversation\'s message as message_gone', async () => {
  const { me, sam, theirs } = await chat();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  for (const kind of ['KISS', undefined, 3]) await expect(setReaction(me.id, sam.id, theirs.id, kind, at(2))).rejects.toMatchObject({ code: 'invalid_reaction' });
  expect(spy).not.toHaveBeenCalled();
  const ben = await buddyUser();
  await pairUp(me.id, ben.id);
  const elsewhere = await sendMessage(ben.id, me.id, { kind: 'TEXT', text: 'hey' }, NOW);
  await unsendMessage(sam.id, me.id, theirs.id, at(2));
  for (const id of [theirs.id, elsewhere.id, '00000000-0000-4000-8000-000000000000', 'nope']) {
    await expect(setReaction(me.id, sam.id, id, 'HEART', at(3))).rejects.toMatchObject({ code: 'message_gone' });
  }
  const stranger = await buddyUser();
  await expect(setReaction(stranger.id, sam.id, elsewhere.id, 'HEART', at(3))).rejects.toMatchObject({ code: 'not_buddies' });
});

it('reactions spend the 60-a-minute bucket, failing closed; clearing never touches it', async () => {
  const { me, sam, theirs } = await chat();
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockResolvedValueOnce('limited').mockResolvedValueOnce('unavailable');
  await expect(setReaction(me.id, sam.id, theirs.id, 'HEART', at(2))).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(setReaction(me.id, sam.id, theirs.id, 'HEART', at(2))).rejects.toMatchObject({ code: 'try_later' });
  expect(spy).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.reaction, me.id);
  spy.mockReset();
  spy.mockRejectedValue(new Error('redis down'));
  await prisma.messageReaction.create({ data: { messageId: theirs.id, reactorId: me.id, kind: 'HEART' } });
  await clearReaction(me.id, sam.id, theirs.id);
  await clearReaction(me.id, sam.id, theirs.id); // nothing left: still fine
  expect(spy).not.toHaveBeenCalled();
  expect(await prisma.messageReaction.count({ where: { messageId: theirs.id } })).toBe(0);
});

it('unsend hides my message from both of us, clears what it said and its reactions, and a reply to it reads as gone', async () => {
  const { me, sam, theirs, mine } = await chat();
  const reply = await sendMessage(sam.id, me.id, { kind: 'TEXT', text: 'maybe', replyToMessageId: mine.id }, at(2));
  await setReaction(sam.id, me.id, mine.id, 'HEART', at(3));
  const spy = jest.spyOn(rateLimit, 'consumeRateLimit');
  await unsendMessage(me.id, sam.id, mine.id, at(4));
  await unsendMessage(me.id, sam.id, mine.id, at(5)); // twice: fine
  expect(spy).not.toHaveBeenCalled();
  for (const [viewer, other] of [[me.id, sam.id], [sam.id, me.id]]) {
    const thread = await listThread(viewer, other, undefined, at(6));
    expect(thread.messages.map((m) => m.id)).toEqual([theirs.id, reply.id]);
    expect(thread.messages[1]!.replyTo).toEqual({ id: mine.id, gone: true });
  }
  const row = await prisma.message.findUniqueOrThrow({ where: { id: mine.id } });
  expect([row.text, row.sticker, row.card, row.deletedAt?.toISOString()]).toEqual([null, null, null, at(4).toISOString()]);
  expect(await prisma.messageReaction.count({ where: { messageId: mine.id } })).toBe(0);
});

it("only the sender can unsend: someone else's message, or a missing one, is message_gone", async () => {
  const { me, sam, theirs } = await chat();
  await expect(unsendMessage(me.id, sam.id, theirs.id, at(2))).rejects.toMatchObject({ code: 'message_gone' });
  await expect(unsendMessage(me.id, sam.id, 'nope', at(2))).rejects.toMatchObject({ code: 'message_gone' });
  expect((await prisma.message.findUniqueOrThrow({ where: { id: theirs.id } })).deletedAt).toBeNull();
});

it('unsending a sticker message leaves the Buddies sticker (it still counts toward the day)', async () => {
  const { me, sam } = await chat();
  const sticker = await sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'CHEER' }, at(2));
  await unsendMessage(me.id, sam.id, sticker.id, at(3));
  expect(await prisma.sticker.count({ where: { fromUserId: me.id, toUserId: sam.id } })).toBe(1);
});

it('routes: PUT reaction 200 { reactions }, DELETE reaction 204, DELETE message 204, a stranger is not_buddies', async () => {
  const { me, sam, theirs, mine } = await chat();
  const stranger = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const put = await agent.put(`/me/chats/${sam.id}/messages/${theirs.id}/reaction`).set(headers).send({ kind: 'STAR' });
  expect([put.status, put.body]).toEqual([200, { reactions: [{ kind: 'STAR', mine: true }] }]);
  expect((await agent.put(`/me/chats/${sam.id}/messages/${theirs.id}/reaction`).set(headers).send({ kind: 'KISS' })).body).toEqual({ error: 'invalid_reaction' });
  expect((await agent.delete(`/me/chats/${sam.id}/messages/${theirs.id}/reaction`).set(headers)).status).toBe(204);
  expect((await agent.delete(`/me/chats/${sam.id}/messages/${mine.id}`).set(headers)).status).toBe(204);
  expect((await agent.delete(`/me/chats/${stranger.id}/messages/${mine.id}`).set(headers)).body).toEqual({ error: 'not_buddies' });
  expect((await agent.delete(`/me/chats/${sam.id}/messages/${theirs.id}`).set(headers)).body).toEqual({ error: 'message_gone' });
});

// Beyond the plan's tests: the dispatch rules (a non-buddy always gets not_buddies; Seen follows the newest live
// message; no race with an unpair is a 500).

it('a non-buddy is not_buddies on all three, even with a malformed message id', async () => {
  const { me, theirs } = await chat();
  const stranger = await buddyUser();
  await expect(setReaction(me.id, stranger.id, 'nope', 'HEART', at(2))).rejects.toMatchObject({ code: 'not_buddies' });
  await expect(clearReaction(me.id, stranger.id, 'nope')).rejects.toMatchObject({ code: 'not_buddies' });
  await expect(unsendMessage(me.id, stranger.id, 'nope', at(2))).rejects.toMatchObject({ code: 'not_buddies' });
  await expect(unsendMessage(me.id, stranger.id, theirs.id, at(2))).rejects.toMatchObject({ code: 'not_buddies' });
});

it("clearing through one buddy's thread never touches my reaction in another's", async () => {
  const { me, sam } = await chat();
  const ben = await buddyUser();
  await pairUp(me.id, ben.id);
  const elsewhere = await sendMessage(ben.id, me.id, { kind: 'TEXT', text: 'hey' }, NOW);
  await setReaction(me.id, ben.id, elsewhere.id, 'STAR', at(2));
  await clearReaction(me.id, sam.id, elsewhere.id);
  expect(await prisma.messageReaction.count({ where: { messageId: elsewhere.id, reactorId: me.id } })).toBe(1);
});

it('"Seen" after an unsend follows the newest live message', async () => {
  const { me, sam } = await chat(); // theirs at NOW, mine at +1
  const seen = async (now: Date) => (await listThread(me.id, sam.id, undefined, now)).seenAt;
  const later = await sendMessage(me.id, sam.id, { kind: 'TEXT', text: 'or a film?' }, at(2));
  await markRead(sam.id, me.id, at(3));
  expect(await seen(at(4))).toBe(later.createdAt);
  // My newest goes: my earlier message is the newest live one, and the buddy's read already covers it.
  await unsendMessage(me.id, sam.id, later.id, at(5));
  expect(await seen(at(6))).toBe(at(1).toISOString());
  // Unsending that too leaves their message as the newest: nothing of mine to be seen.
  const mine = (await listThread(me.id, sam.id, undefined, at(7))).messages.find((m) => m.mine)!;
  await unsendMessage(me.id, sam.id, mine.id, at(8));
  expect(await seen(at(9))).toBeNull();
});

it('a conversation deleted under a reaction or an unsend (an unpair) answers with a code, never a 500', async () => {
  const { me, sam, theirs, mine } = await chat();
  await prisma.conversation.deleteMany({ where: { messages: { some: { id: theirs.id } } } });
  await expect(setReaction(me.id, sam.id, theirs.id, 'HEART', at(2))).rejects.toMatchObject({ code: 'message_gone' });
  await expect(unsendMessage(me.id, sam.id, mine.id, at(2))).rejects.toMatchObject({ code: 'message_gone' });
  await expect(clearReaction(me.id, sam.id, theirs.id)).resolves.toBeUndefined();
  // The reactor's account gone mid-write: the FK failure is not_buddies, not a 500.
  const reacting = await chat();
  jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(Object.assign(new Error('fk'), { code: 'P2003' }));
  await expect(setReaction(reacting.me.id, reacting.sam.id, reacting.theirs.id, 'HEART', at(2))).rejects.toMatchObject({ code: 'not_buddies' });
});

it('a reaction racing an unsend never outlives it', async () => {
  for (let i = 0; i < 5; i += 1) {
    const { me, sam, mine } = await chat();
    const [reacted] = await Promise.allSettled([setReaction(sam.id, me.id, mine.id, 'HEART', at(2)), unsendMessage(me.id, sam.id, mine.id, at(2))]);
    if (reacted.status === 'rejected') expect(reacted.reason).toMatchObject({ code: 'message_gone' });
    expect(await prisma.messageReaction.count({ where: { messageId: mine.id } })).toBe(0);
  }
});

// Final review M5: two reactions stamped in the same millisecond keep one order between reads (by reactor), so the
// badges never swap places from one poll to the next.
it('reactions in the same millisecond keep a stable order, by reactor', async () => {
  const { me, sam, theirs } = await chat();
  const [first, second] = [me, sam].sort((a, b) => (a.id < b.id ? -1 : 1)) as [typeof me, typeof me];
  const other = (u: typeof me) => (u.id === me.id ? sam.id : me.id);
  // The later reactor in id order reacts first, so insertion order is the reverse of the expected order.
  await setReaction(second.id, other(second), theirs.id, 'STAR', at(2));
  const { reactions } = await setReaction(first.id, other(first), theirs.id, 'HEART', at(2));
  expect(reactions.map((r) => r.kind)).toEqual(['HEART', 'STAR']);
  const thread = await listThread(me.id, sam.id, undefined, at(3));
  expect(thread.messages.find((m) => m.id === theirs.id)!.reactions.map((r) => r.kind)).toEqual(['HEART', 'STAR']);
});

it('unsending a card or a sticker message clears its card and its sticker', async () => {
  const { me, sam } = await chat();
  await saveCheckIn(me.id, 'RESTED', at(-60));
  const card = await sendMessage(me.id, sam.id, { kind: 'CARD', card: { type: 'my_checkin' }, text: 'look' }, at(2));
  const sticker = await sendMessage(me.id, sam.id, { kind: 'STICKER', sticker: 'STAR' }, at(3));
  expect([card.card, sticker.sticker]).toEqual([expect.objectContaining({ type: 'checkin' }), 'STAR']);
  for (const id of [card.id, sticker.id]) await unsendMessage(me.id, sam.id, id, at(4));
  const rows = await prisma.message.findMany({ where: { id: { in: [card.id, sticker.id] } }, select: { kind: true, text: true, sticker: true, card: true, deletedAt: true } });
  expect(rows.map((r) => [r.kind, r.text, r.sticker, r.card, r.deletedAt?.toISOString()]).sort()).toEqual([
    ['CARD', null, null, null, at(4).toISOString()],
    ['STICKER', null, null, null, at(4).toISOString()],
  ]);
});
