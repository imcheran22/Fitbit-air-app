import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { createPair, createPairTx, orderedPair } from '../../src/buddies/pairs';
import { redeemCode } from '../../src/buddies/codes';
import { block } from '../../src/buddies/relations';
import { RecordingQueue, RecordingSender, addToken, api, buddyUser, pairUp } from './helpers';

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
afterEach(() => setBuddyNotifyQueue(null));

async function pairWithHistory() {
  const a = await buddyUser();
  const b = await buddyUser();
  const pair = await pairUp(a.id, b.id);
  const s1 = await prisma.sticker.create({ data: { fromUserId: a.id, toUserId: b.id, kind: 'CHEER' } });
  const s2 = await prisma.sticker.create({ data: { fromUserId: b.id, toUserId: a.id, kind: 'STAR' } });
  await prisma.buddyActivity.createMany({
    data: [
      { recipientId: b.id, actorId: a.id, kind: 'STICKER', refId: s1.id },
      { recipientId: a.id, actorId: b.id, kind: 'STICKER', refId: s2.id },
      { recipientId: a.id, actorId: b.id, kind: 'PAIRED', refId: pair.id },
    ],
  });
  return { a, b };
}
const between = async (a: string, b: string) => ({
  pairs: await prisma.buddyPair.count({ where: orderedPair(a, b) }),
  stickers: await prisma.sticker.count({ where: { OR: [{ fromUserId: a, toUserId: b }, { fromUserId: b, toUserId: a }] } }),
  activity: await prisma.buddyActivity.count({ where: { OR: [{ recipientId: a, actorId: b }, { recipientId: b, actorId: a }] } }),
});

it('unpair is silent and removes the pair, stickers and Activity between the two, and closes pending requests', async () => {
  const { a, b } = await pairWithHistory();
  const other = await buddyUser();
  await prisma.sticker.create({ data: { fromUserId: other.id, toUserId: a.id, kind: 'HEART' } });
  const res = await (await api()).delete(`/me/buddies/${b.id}`).set(await authHeaderFor(a.id));
  expect(res.status).toBe(204);
  expect(await between(a.id, b.id)).toEqual({ pairs: 0, stickers: 0, activity: 0 });
  expect(await prisma.sticker.count({ where: { toUserId: a.id } })).toBe(1);
  expect((await (await api()).delete(`/me/buddies/${b.id}`).set(await authHeaderFor(a.id))).status).toBe(204);
});

it('unpair closes requests between the two either way: PENDING cancelled, DECLINED withdrawn', async () => {
  const { a, b } = await pairWithHistory();
  const mine = await prisma.buddyRequest.create({ data: { fromUserId: a.id, toUserId: b.id } });
  const theirs = await prisma.buddyRequest.create({ data: { fromUserId: b.id, toUserId: a.id, status: 'DECLINED', respondedAt: new Date() } });
  expect((await (await api()).delete(`/me/buddies/${b.id}`).set(await authHeaderFor(a.id))).status).toBe(204);
  expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe('CANCELLED');
  const declined = await prisma.buddyRequest.findUniqueOrThrow({ where: { id: theirs.id } });
  expect([declined.status, declined.withdrawnAt === null]).toEqual(['DECLINED', false]);
});

it('block from a buddy also withdraws my declined request to them and cancels my pending one', async () => {
  const { a, b } = await pairWithHistory();
  const pending = await prisma.buddyRequest.create({ data: { fromUserId: a.id, toUserId: b.id } });
  const declined = await prisma.buddyRequest.create({ data: { fromUserId: a.id, toUserId: b.id, status: 'DECLINED', respondedAt: new Date() } });
  await (await api()).post(`/me/buddies/${b.id}/block`).set(await authHeaderFor(a.id));
  expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('CANCELLED');
  expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: declined.id } })).withdrawnAt).not.toBeNull();
});

it('a block that lands while a redeem is pairing waits for it and removes the pair: no pair across a block', async () => {
  const owner = await buddyUser();
  const redeemer = await buddyUser();
  const code = (await (await api()).post('/me/buddies/code').set(await authHeaderFor(owner.id))).body.code as string;
  let blocking: Promise<void> | null = null;
  let blockSettled = false;
  let settledDuringPairing: boolean | null = null;
  const now = new Date();
  await redeemCode(redeemer.id, code, now, {
    // Inside the redeem transaction, after its block re-check: the owner blocks the redeemer now.
    createPairTx: async (tx, a, b, at) => {
      blocking = block(owner.id, redeemer.id, now).then(() => {
        blockSettled = true;
      });
      await new Promise((r) => setTimeout(r, 300));
      // The block is still waiting on the pair lock this transaction holds.
      settledDuringPairing = blockSettled;
      return createPairTx(tx, a, b, at);
    },
  });
  await blocking;
  expect(settledDuringPairing).toBe(false);
  expect(await prisma.buddyBlock.count({ where: { blockerId: owner.id, blockedId: redeemer.id } })).toBe(1);
  expect(await prisma.buddyPair.count({ where: orderedPair(owner.id, redeemer.id) })).toBe(0);
  expect(await prisma.buddyActivity.count({ where: { OR: [{ recipientId: owner.id }, { recipientId: redeemer.id }] } })).toBe(0);
});

it('block from a buddy: unpairs, cancels my request, hides theirs, and their codes stop working for me', async () => {
  const { a, b } = await pairWithHistory();
  await prisma.buddyRequest.create({ data: { fromUserId: b.id, toUserId: a.id } });
  const res = await (await api()).post(`/me/buddies/${b.id}/block`).set(await authHeaderFor(a.id));
  expect([res.status, res.body]).toEqual([200, { ok: true }]);
  expect(await between(a.id, b.id)).toEqual({ pairs: 0, stickers: 0, activity: 0 });
  expect((await prisma.buddyRequest.findFirstOrThrow({ where: { fromUserId: b.id, toUserId: a.id } })).hidden).toBe(true);
  const code = (await (await api()).post('/me/buddies/code').set(await authHeaderFor(b.id))).body.code;
  expect((await (await api()).post('/me/buddies/code/redeem').set(await authHeaderFor(a.id)).send({ code })).body).toEqual({ error: 'code_invalid' });
  expect((await (await api()).get('/me/blocks').set(await authHeaderFor(a.id))).body).toEqual({ blocked: [{ userId: b.id, handle: b.handle, displayName: 'Sam' }] });
});

it('block from an incoming request row hides it and cancels my own request to them', async () => {
  const me = await buddyUser();
  const them = await buddyUser();
  const theirs = await prisma.buddyRequest.create({ data: { fromUserId: them.id, toUserId: me.id } });
  const mine = await prisma.buddyRequest.create({ data: { fromUserId: me.id, toUserId: them.id, status: 'DECLINED', respondedAt: new Date() } });
  const res = await (await api()).post(`/me/buddies/requests/${theirs.id}/block`).set(await authHeaderFor(me.id));
  expect([res.status, res.body]).toEqual([200, { ok: true }]);
  expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: theirs.id } })).hidden).toBe(true);
  expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: mine.id } })).withdrawnAt).not.toBeNull();
  // The blocker cannot block from a request that is not theirs to see.
  expect((await (await api()).post(`/me/buddies/requests/${theirs.id}/block`).set(await authHeaderFor(them.id))).body).toEqual({ error: 'request_gone' });
});

it('unblock lifts the block; rows already hidden stay hidden', async () => {
  const me = await buddyUser();
  const them = await buddyUser();
  const theirs = await prisma.buddyRequest.create({ data: { fromUserId: them.id, toUserId: me.id } });
  await (await api()).post(`/me/buddies/requests/${theirs.id}/block`).set(await authHeaderFor(me.id));
  expect((await (await api()).delete(`/me/blocks/${them.id}`).set(await authHeaderFor(me.id))).status).toBe(204);
  expect(await prisma.buddyBlock.count({ where: { blockerId: me.id } })).toBe(0);
  expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: theirs.id } })).hidden).toBe(true);
});

it('unpair and block clear mutes both ways: a re-pair starts unmuted and its buddy_paired push goes out', async () => {
  const { a, b } = await pairWithHistory();
  await addToken(a.id);
  await prisma.buddyMute.createMany({ data: [{ muterId: a.id, mutedId: b.id }, { muterId: b.id, mutedId: a.id }] });
  await (await api()).delete(`/me/buddies/${b.id}`).set(await authHeaderFor(a.id));
  expect(await prisma.buddyMute.count({ where: { OR: [{ muterId: a.id }, { muterId: b.id }] } })).toBe(0);

  await createPair(a.id, b.id, new Date('2026-10-07T12:00:00Z'));
  const sender = new RecordingSender();
  await queue.drain(sender);
  expect(sender.calls.map((c) => [c.payload.kind, c.payload.data])).toEqual([['buddy_paired', { kind: 'buddy_paired', refId: b.id }]]);

  await prisma.buddyMute.create({ data: { muterId: a.id, mutedId: b.id } });
  await (await api()).post(`/me/buddies/${b.id}/block`).set(await authHeaderFor(a.id));
  expect(await prisma.buddyMute.count({ where: { OR: [{ muterId: a.id }, { muterId: b.id }] } })).toBe(0);
});

it('mute needs a buddy; unmute always works; the muted person is told nothing', async () => {
  const { a, b } = await pairWithHistory();
  const stranger = await buddyUser();
  const agent = await api();
  expect((await agent.put(`/me/buddies/${b.id}/mute`).set(await authHeaderFor(a.id)).send({ muted: true })).body).toEqual({ muted: true });
  expect(await prisma.buddyMute.count({ where: { muterId: a.id, mutedId: b.id } })).toBe(1);
  expect((await agent.put(`/me/buddies/${stranger.id}/mute`).set(await authHeaderFor(a.id)).send({ muted: true })).body).toEqual({ error: 'not_buddies' });
  expect((await agent.put(`/me/buddies/${b.id}/mute`).set(await authHeaderFor(a.id)).send({ muted: 'yes' })).body).toEqual({ error: 'invalid_settings' });
  expect((await agent.put(`/me/buddies/${b.id}/mute`).set(await authHeaderFor(a.id)).send({ muted: false })).body).toEqual({ muted: false });
  // Unmuting any well-formed id never fails, even a stranger or oneself.
  for (const id of [stranger.id, a.id]) {
    const res = await agent.put(`/me/buddies/${id}/mute`).set(await authHeaderFor(a.id)).send({ muted: false });
    expect([id, res.status, res.body]).toEqual([id, 200, { muted: false }]);
  }
});

it('unpair of someone who is not a buddy writes nothing: their requests to me stay pending to them, Activity intact', async () => {
  const me = await buddyUser();
  const them = await buddyUser();
  const pending = await prisma.buddyRequest.create({ data: { fromUserId: them.id, toUserId: me.id, toHandleAtSend: me.handle } });
  const declined = await prisma.buddyRequest.create({
    data: { fromUserId: them.id, toUserId: me.id, status: 'DECLINED', respondedAt: new Date(), toHandleAtSend: me.handle },
  });
  await prisma.buddyActivity.createMany({
    data: [
      { recipientId: me.id, actorId: them.id, kind: 'REQUEST', refId: pending.id },
      { recipientId: them.id, actorId: me.id, kind: 'PAIRED', refId: pending.id },
    ],
  });
  expect((await (await api()).delete(`/me/buddies/${them.id}`).set(await authHeaderFor(me.id))).status).toBe(204);
  const outgoing = (await (await api()).get('/me/buddies/requests').set(await authHeaderFor(them.id))).body.outgoing as Array<{ id: string }>;
  expect(outgoing.map((o) => o.id).sort()).toEqual([pending.id, declined.id].sort());
  expect(await between(me.id, them.id)).toEqual({ pairs: 0, stickers: 0, activity: 2 });
});

it('block from a request row (not buddies) clears my Activity about them but never theirs about me', async () => {
  const me = await buddyUser();
  const them = await buddyUser();
  const theirs = await prisma.buddyRequest.create({ data: { fromUserId: them.id, toUserId: me.id } });
  const mine = await prisma.buddyRequest.create({ data: { fromUserId: me.id, toUserId: them.id, status: 'EXPIRED' } });
  await prisma.buddyActivity.createMany({
    data: [
      { recipientId: me.id, actorId: them.id, kind: 'REQUEST', refId: theirs.id },
      { recipientId: them.id, actorId: me.id, kind: 'REQUEST', refId: mine.id },
    ],
  });
  await (await api()).post(`/me/buddies/requests/${theirs.id}/block`).set(await authHeaderFor(me.id));
  expect(await prisma.buddyActivity.count({ where: { recipientId: me.id, actorId: them.id } })).toBe(0);
  expect(await prisma.buddyActivity.count({ where: { recipientId: them.id, actorId: me.id } })).toBe(1);
});

it('the blocked list is never cached', async () => {
  const me = await buddyUser();
  const res = await (await api()).get('/me/blocks').set(await authHeaderFor(me.id));
  expect([res.status, res.headers['cache-control']]).toEqual([200, 'private, no-store']);
});

it('block and mute on someone who is not a buddy, or a malformed id, answer 403 not_buddies', async () => {
  const me = await buddyUser();
  const stranger = await buddyUser();
  for (const id of [stranger.id, 'nope', me.id]) {
    const res = await (await api()).post(`/me/buddies/${id}/block`).set(await authHeaderFor(me.id));
    expect([id, res.status, res.body]).toEqual([id, 403, { error: 'not_buddies' }]);
  }
});
