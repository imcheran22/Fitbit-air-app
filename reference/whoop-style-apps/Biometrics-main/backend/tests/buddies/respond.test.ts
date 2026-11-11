import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { orderedPair } from '../../src/buddies/pairs';
import { RecordingQueue, RecordingSender, addToken, api, buddyUser, pairUp } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
let sender: RecordingSender;
let queue: RecordingQueue;
beforeEach(() => {
  sender = new RecordingSender();
  queue = new RecordingQueue();
  setBuddyNotifyQueue(queue);
});
afterEach(() => setBuddyNotifyQueue(null));

const DAY = 86_400_000;
const act = async (userId: string, id: string, verb: 'accept' | 'decline' | 'cancel') =>
  (await api()).post(`/me/buddies/requests/${id}/${verb}`).set(await authHeaderFor(userId));
const outgoing = async (userId: string) => (await (await api()).get('/me/buddies/requests').set(await authHeaderFor(userId))).body.outgoing;
const request = (from: string, to: string, over: object = {}) => prisma.buddyRequest.create({ data: { fromUserId: from, toUserId: to, ...over } });

it('accepting pairs the two, pushes buddy_paired to both, and a second accept is a no-op', async () => {
  const from = await buddyUser({ displayName: 'Ana' });
  const to = await buddyUser({ displayName: 'Ben' });
  await addToken(from.id);
  await addToken(to.id);
  const row = await request(from.id, to.id);
  const res = await act(to.id, row.id, 'accept');
  expect([res.status, res.body]).toEqual([200, { ok: true, buddyId: from.id }]);
  expect((await act(to.id, row.id, 'accept')).body).toEqual({ ok: true, buddyId: from.id });
  expect(await prisma.buddyPair.count({ where: orderedPair(from.id, to.id) })).toBe(1);
  expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('ACCEPTED');
  await queue.drain(sender);
  expect(sender.titles().sort()).toEqual(['You and Ana are now buddies', 'You and Ben are now buddies']);
  expect(await outgoing(from.id)).toEqual([]);
});

it('double accept at the same moment makes one pair and two successes', async () => {
  const from = await buddyUser();
  const to = await buddyUser();
  const row = await request(from.id, to.id);
  const results = await Promise.all([act(to.id, row.id, 'accept'), act(to.id, row.id, 'accept')]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  expect(await prisma.buddyPair.count({ where: orderedPair(from.id, to.id) })).toBe(1);
});

it('accepting needs the mood notice; only the recipient may accept or decline; only the sender may cancel', async () => {
  const from = await buddyUser();
  const to = await buddyUser({ notice: false });
  const stranger = await buddyUser();
  const row = await request(from.id, to.id);
  expect((await act(to.id, row.id, 'accept')).body).toEqual({ error: 'mood_notice_required' });
  for (const [who, verb] of [[from.id, 'accept'], [stranger.id, 'accept'], [from.id, 'decline'], [to.id, 'cancel'], [stranger.id, 'cancel']] as const) {
    const res = await act(who, row.id, verb);
    expect([verb, res.status, res.body]).toEqual([verb, 404, { error: 'request_gone' }]);
  }
  expect((await act(from.id, randomUUID(), 'cancel')).body).toEqual({ error: 'request_gone' });
  expect((await act(from.id, 'not-a-uuid', 'cancel')).body).toEqual({ error: 'request_gone' });
});

it('a decline is silent: the recipient stops seeing it, the sender still sees it pending; repeats are no-ops', async () => {
  const from = await buddyUser();
  const to = await buddyUser();
  const row = await request(from.id, to.id);
  expect((await act(to.id, row.id, 'decline')).body).toEqual({ ok: true });
  expect((await act(to.id, row.id, 'decline')).body).toEqual({ ok: true });
  expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('DECLINED');
  expect((await (await api()).get('/me/buddies/requests').set(await authHeaderFor(to.id))).body.incoming).toEqual([]);
  expect((await outgoing(from.id)).map((r: { id: string }) => r.id)).toEqual([row.id]);
});

it('cancelling a declined request withdraws it for the sender but keeps it DECLINED, so the swallow still applies', async () => {
  const from = await buddyUser();
  const to = await buddyUser();
  await addToken(to.id);
  const row = await request(from.id, to.id);
  await act(to.id, row.id, 'decline');
  expect((await act(from.id, row.id, 'cancel')).body).toEqual({ ok: true });
  const after = await prisma.buddyRequest.findUniqueOrThrow({ where: { id: row.id } });
  expect([after.status, after.withdrawnAt !== null]).toEqual(['DECLINED', true]);
  expect(await outgoing(from.id)).toEqual([]);
  await (await api()).post('/me/buddies/requests').set(await authHeaderFor(from.id)).send({ handle: to.handle });
  const again = await prisma.buddyRequest.findFirstOrThrow({ where: { fromUserId: from.id, toUserId: to.id, status: 'PENDING' } });
  expect(again.hidden).toBe(true);
  await queue.drain(sender);
  expect(sender.calls).toHaveLength(0);
});

it('cancelling a pending request removes it for both; a repeat is a no-op', async () => {
  const from = await buddyUser();
  const to = await buddyUser();
  const row = await request(from.id, to.id);
  expect((await act(from.id, row.id, 'cancel')).body).toEqual({ ok: true });
  expect((await act(from.id, row.id, 'cancel')).body).toEqual({ ok: true });
  expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('CANCELLED');
  expect((await (await api()).get('/me/buddies/requests').set(await authHeaderFor(to.id))).body.incoming).toEqual([]);
});

it('an expired or hidden request cannot be accepted', async () => {
  const from = await buddyUser();
  const to = await buddyUser();
  const old = await request(from.id, to.id, { createdAt: new Date(Date.now() - 15 * DAY) });
  expect((await act(to.id, old.id, 'accept')).body).toEqual({ error: 'request_gone' });
  const other = await buddyUser();
  const hidden = await request(other.id, to.id, { hidden: true });
  expect((await act(to.id, hidden.id, 'accept')).body).toEqual({ error: 'request_gone' });
  expect((await act(to.id, hidden.id, 'decline')).body).toEqual({ error: 'request_gone' });
});

describe('rulings: blocks, hidden rows and the sender view', () => {
  it('a block either way makes the request un-acceptable and pairs no one', async () => {
    for (const blockerIsRecipient of [true, false]) {
      const from = await buddyUser();
      const to = await buddyUser();
      const row = await request(from.id, to.id);
      await prisma.buddyBlock.create({ data: blockerIsRecipient ? { blockerId: to.id, blockedId: from.id } : { blockerId: from.id, blockedId: to.id } });
      expect((await act(to.id, row.id, 'accept')).body).toEqual({ error: 'request_gone' });
      expect((await act(to.id, row.id, 'decline')).body).toEqual({ error: 'request_gone' });
      expect(await prisma.buddyPair.count({ where: orderedPair(from.id, to.id) })).toBe(0);
      expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('PENDING');
    }
    expect(queue.jobs).toHaveLength(0);
  });

  it('accept needs a handle', async () => {
    const from = await buddyUser();
    const to = await buddyUser({ handle: null });
    const row = await request(from.id, to.id);
    expect((await act(to.id, row.id, 'accept')).body).toEqual({ error: 'handle_required' });
  });

  it('accepting when already paired (by a code meanwhile) succeeds without a second buddy_paired', async () => {
    const from = await buddyUser();
    const to = await buddyUser();
    const row = await request(from.id, to.id);
    await pairUp(from.id, to.id);
    expect((await act(to.id, row.id, 'accept')).body).toEqual({ ok: true, buddyId: from.id });
    expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('ACCEPTED');
    expect(queue.jobs).toHaveLength(0);
  });

  it('accepting withdraws a declined request the other way, so nothing reads "Pending" next to the buddy', async () => {
    const a = await buddyUser();
    const b = await buddyUser();
    const declined = await request(b.id, a.id, { status: 'DECLINED', respondedAt: new Date() });
    const row = await request(a.id, b.id);
    expect((await act(b.id, row.id, 'accept')).body).toEqual({ ok: true, buddyId: a.id });
    expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: declined.id } })).withdrawnAt).not.toBeNull();
    expect(await outgoing(b.id)).toEqual([]);
  });

  it('cancelling a hidden request answers exactly like cancelling a visible one and removes it for the sender', async () => {
    const from = await buddyUser();
    const to = await buddyUser();
    const visible = await request(from.id, to.id);
    const other = await buddyUser();
    const hidden = await request(from.id, other.id, { hidden: true });
    const a = await act(from.id, visible.id, 'cancel');
    const b = await act(from.id, hidden.id, 'cancel');
    expect([b.status, b.body]).toEqual([a.status, a.body]);
    expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: hidden.id } })).status).toBe('CANCELLED');
    expect(await outgoing(from.id)).toEqual([]);
  });

  it('cancel of an accepted or expired request is a quiet no-op', async () => {
    const from = await buddyUser();
    const to = await buddyUser();
    const old = await request(from.id, to.id, { status: 'EXPIRED', createdAt: new Date(Date.now() - 15 * DAY) });
    const accepted = await request(from.id, to.id, { status: 'ACCEPTED' });
    expect((await act(from.id, old.id, 'cancel')).body).toEqual({ ok: true });
    expect((await act(from.id, accepted.id, 'cancel')).body).toEqual({ ok: true });
    expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('EXPIRED');
    expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: accepted.id } })).status).toBe('ACCEPTED');
  });

  it('decline after accept is request_gone, accept after decline is request_gone', async () => {
    const from = await buddyUser();
    const to = await buddyUser();
    const r1 = await request(from.id, to.id);
    await act(to.id, r1.id, 'accept');
    expect((await act(to.id, r1.id, 'decline')).body).toEqual({ error: 'request_gone' });
    const other = await buddyUser();
    const r2 = await request(other.id, to.id);
    await act(to.id, r2.id, 'decline');
    expect((await act(to.id, r2.id, 'accept')).body).toEqual({ error: 'request_gone' });
  });
});
