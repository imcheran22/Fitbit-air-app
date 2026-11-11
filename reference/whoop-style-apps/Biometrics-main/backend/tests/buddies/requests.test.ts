import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import * as rateLimit from '../../src/lib/rateLimit';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { handleHash } from '../../src/buddies/identity';
import { countRequests, recipientSees, sendRequest, senderPendingWhere, senderSeesPending } from '../../src/buddies/requests';
import { createPair } from '../../src/buddies/pairs';
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
afterEach(() => {
  setBuddyNotifyQueue(null);
  jest.restoreAllMocks();
});

const DAY = 86_400_000;
const send = async (fromId: string, handle: string) => (await api()).post('/me/buddies/requests').set(await authHeaderFor(fromId)).send({ handle });
const lists = async (userId: string) => (await (await api()).get('/me/buddies/requests').set(await authHeaderFor(userId))).body;
const rowsBetween = (from: string, to: string) => prisma.buddyRequest.findMany({ where: { fromUserId: from, toUserId: to } });

describe('who sees a request (pure)', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const row = (over: object) => ({ status: 'PENDING' as const, hidden: false, createdAt: new Date(now.getTime() - DAY), withdrawnAt: null, ...over });
  it.each([
    ['pending', {}, true, true],
    ['declined', { status: 'DECLINED' }, true, false],
    ['hidden', { hidden: true }, true, false],
    ['withdrawn after a decline', { status: 'DECLINED', withdrawnAt: now }, false, false],
    ['accepted', { status: 'ACCEPTED' }, false, false],
    ['cancelled', { status: 'CANCELLED' }, false, false],
    ['expired', { status: 'EXPIRED' }, false, false],
    ['14 days old', { createdAt: new Date(now.getTime() - 14 * DAY) }, false, false],
  ])('%s: sender sees pending %s, recipient sees %s', (_name, over, sender, recipient) => {
    expect(senderSeesPending(row(over), now)).toBe(sender);
    expect(recipientSees(row(over), now)).toBe(recipient);
  });
});

describe('POST /me/buddies/requests', () => {
  it('needs a handle and the mood notice', async () => {
    const target = await buddyUser();
    expect((await send((await buddyUser({ handle: null })).id, target.handle!)).body).toEqual({ error: 'handle_required' });
    expect((await send((await buddyUser({ notice: false })).id, target.handle!)).body).toEqual({ error: 'mood_notice_required' });
  });

  it('own handle → own_handle; unknown, malformed or held handles → not_found; a handle you blocked → blocked_by_you', async () => {
    const me = await buddyUser();
    const blocked = await buddyUser();
    await prisma.buddyBlock.create({ data: { blockerId: me.id, blockedId: blocked.id } });
    const held = `held${randomUUID().slice(0, 8)}`;
    await prisma.handleHold.create({ data: { handleHash: handleHash(held), previousOwnerId: null, releasedAt: new Date() } });
    const own = await send(me.id, `@${me.handle!.toUpperCase()}`);
    expect([own.status, own.body]).toEqual([400, { error: 'own_handle' }]);
    for (const h of ['nobody_here_x', 'x', held]) expect([h, (await send(me.id, h)).body]).toEqual([h, { error: 'not_found' }]);
    const b = await send(me.id, blocked.handle!);
    expect([b.status, b.body]).toEqual([409, { error: 'blocked_by_you' }]);
  });

  it('stores a request, writes REQUEST Activity, and pushes the nameless request push with the request id', async () => {
    const me = await buddyUser({ displayName: 'Ana' });
    const target = await buddyUser();
    await addToken(target.id);
    const res = await send(me.id, `@${target.handle}`);
    expect([res.status, res.body]).toEqual([200, { ok: true }]);
    const [row] = await rowsBetween(me.id, target.id);
    expect(row).toMatchObject({ status: 'PENDING', hidden: false });
    // The route only enqueued; the job writes the REQUEST Activity and sends.
    expect(queue.jobs.map((j) => j.data)).toEqual([{ kind: 'buddy_request', recipientId: target.id, actorId: me.id, refId: row!.id, slots: {} }]);
    await queue.drain(sender);
    expect(await prisma.buddyActivity.count({ where: { recipientId: target.id, actorId: me.id, kind: 'REQUEST', refId: row!.id } })).toBe(1);
    expect(sender.calls.map((c) => [c.payload.title, c.payload.data])).toEqual([['Someone wants to be your buddy', { kind: 'buddy_request', refId: row!.id }]]);
    expect((await lists(target.id)).incoming).toEqual([
      { id: row!.id, createdAt: row!.createdAt.toISOString(), from: { id: me.id, handle: me.handle, displayName: 'Ana', coachId: expect.any(String), kipColour: 'coral' } },
    ]);
    expect((await lists(me.id)).outgoing).toEqual([{ id: row!.id, createdAt: row!.createdAt.toISOString(), toHandle: target.handle }]);
  });

  it('is a success no-op when already buddies or already pending', async () => {
    const me = await buddyUser();
    const buddy = await buddyUser();
    const target = await buddyUser();
    await pairUp(me.id, buddy.id);
    expect((await send(me.id, buddy.handle!)).body).toEqual({ ok: true });
    expect(await rowsBetween(me.id, buddy.id)).toHaveLength(0);
    await send(me.id, target.handle!);
    expect((await send(me.id, target.handle!)).body).toEqual({ ok: true });
    expect(await rowsBetween(me.id, target.id)).toHaveLength(1);
  });

  it('to someone who blocked you: the same success, a hidden row, no Activity, no push', async () => {
    const me = await buddyUser();
    const target = await buddyUser();
    await addToken(target.id);
    await prisma.buddyBlock.create({ data: { blockerId: target.id, blockedId: me.id } });
    expect([(await send(me.id, target.handle!)).status, (await send(me.id, target.handle!)).body]).toEqual([200, { ok: true }]);
    const rows = await rowsBetween(me.id, target.id);
    expect(rows.map((r) => [r.status, r.hidden])).toEqual([['PENDING', true]]);
    // Enqueued like a real one; the job drops it.
    expect(queue.jobs).toHaveLength(1);
    await queue.drain(sender);
    expect(await prisma.buddyActivity.count({ where: { recipientId: target.id } })).toBe(0);
    expect(sender.calls).toHaveLength(0);
    expect((await lists(target.id)).incoming).toEqual([]);
    expect((await lists(me.id)).outgoing).toHaveLength(1);
  });

  it('within 30 days of a decline a new request is swallowed: hidden, same success, no push, no Activity', async () => {
    const me = await buddyUser();
    const target = await buddyUser();
    await addToken(target.id);
    // A request the target declined 20 days ago (sent 21 days ago, so the sender no longer sees it).
    await prisma.buddyRequest.create({
      data: { fromUserId: me.id, toUserId: target.id, status: 'DECLINED', createdAt: new Date(Date.now() - 21 * DAY), respondedAt: new Date(Date.now() - 20 * DAY) },
    });
    expect((await send(me.id, target.handle!)).body).toEqual({ ok: true });
    const fresh = (await rowsBetween(me.id, target.id)).find((r) => r.status === 'PENDING');
    expect(fresh?.hidden).toBe(true);
    expect(queue.jobs).toHaveLength(1);
    await queue.drain(sender);
    expect(sender.calls).toHaveLength(0);
    expect(await prisma.buddyActivity.count({ where: { recipientId: target.id } })).toBe(0);
  });

  it('a decline that a later pairing superseded no longer swallows: after an unpair a new request is visible', async () => {
    const me = await buddyUser();
    const target = await buddyUser();
    await prisma.buddyRequest.create({
      data: { fromUserId: me.id, toUserId: target.id, status: 'DECLINED', createdAt: new Date(Date.now() - 3 * DAY), respondedAt: new Date(Date.now() - 2 * DAY) },
    });
    await createPair(me.id, target.id, new Date(Date.now() - DAY), { notifyQueue: queue });
    expect((await (await api()).delete(`/me/buddies/${me.id}`).set(await authHeaderFor(target.id))).status).toBe(204);
    queue.jobs = [];
    expect((await send(me.id, target.handle!)).body).toEqual({ ok: true });
    const fresh = (await rowsBetween(me.id, target.id)).find((r) => r.status === 'PENDING');
    expect(fresh?.hidden).toBe(false);
  });

  it('crossed requests pair at once', async () => {
    const me = await buddyUser();
    const target = await buddyUser();
    await prisma.buddyRequest.create({ data: { fromUserId: target.id, toUserId: me.id } });
    expect((await send(me.id, target.handle!)).body).toEqual({ ok: true });
    expect(await prisma.buddyPair.count({ where: { OR: [{ userAId: me.id }, { userBId: me.id }] } })).toBe(1);
    expect((await rowsBetween(target.id, me.id))[0]!.status).toBe('ACCEPTED');
  });

  it('a mutual ask pairs even when the first request was declined or swallowed, and leaves no outgoing row', async () => {
    for (const first of ['declined', 'swallowed'] as const) {
      const a = await buddyUser();
      const x = await buddyUser();
      await prisma.buddyRequest.create({
        data: first === 'declined'
          ? { fromUserId: a.id, toUserId: x.id, status: 'DECLINED', respondedAt: new Date() }
          : { fromUserId: a.id, toUserId: x.id, hidden: true },
      });
      expect((await send(x.id, a.handle!)).body).toEqual({ ok: true });
      expect([first, await prisma.buddyPair.count({ where: { OR: [{ userAId: a.id }, { userBId: a.id }] } })]).toEqual([first, 1]);
      expect([first, (await lists(a.id)).outgoing, (await lists(x.id)).outgoing]).toEqual([first, [], []]);
      expect(await rowsBetween(x.id, a.id)).toHaveLength(0);
    }
  });

  it('a mutual ask across a block never pairs', async () => {
    // a blocked x: x's request to a is stored hidden, no pair.
    const a = await buddyUser();
    const x = await buddyUser();
    await prisma.buddyRequest.create({ data: { fromUserId: a.id, toUserId: x.id, status: 'DECLINED', respondedAt: new Date() } });
    await prisma.buddyBlock.create({ data: { blockerId: a.id, blockedId: x.id } });
    expect((await send(x.id, a.handle!)).body).toEqual({ ok: true });
    expect(await prisma.buddyPair.count({ where: { OR: [{ userAId: a.id }, { userBId: a.id }] } })).toBe(0);
    expect((await rowsBetween(x.id, a.id)).map((r) => [r.status, r.hidden])).toEqual([['PENDING', true]]);
    // x blocked b: x's send answers blocked_by_you.
    const b = await buddyUser();
    await prisma.buddyRequest.create({ data: { fromUserId: b.id, toUserId: x.id } });
    await prisma.buddyBlock.create({ data: { blockerId: x.id, blockedId: b.id } });
    expect((await send(x.id, b.handle!)).body).toEqual({ error: 'blocked_by_you' });
    expect(await prisma.buddyPair.count({ where: { OR: [{ userAId: b.id }, { userBId: b.id }] } })).toBe(0);
  });

  it('pairing by code or by accepting removes a declined request from the outgoing list', async () => {
    const a = await buddyUser();
    const x = await buddyUser();
    await prisma.buddyRequest.create({ data: { fromUserId: a.id, toUserId: x.id, status: 'DECLINED', respondedAt: new Date() } });
    const code = (await (await api()).post('/me/buddies/code').set(await authHeaderFor(x.id))).body.code;
    expect((await (await api()).post('/me/buddies/code/redeem').set(await authHeaderFor(a.id)).send({ code })).status).toBe(200);
    expect((await lists(a.id)).outgoing).toEqual([]);
    expect(await prisma.buddyRequest.count({ where: { fromUserId: a.id, ...senderPendingWhere(new Date()) } })).toBe(0);

    // Accepting pairs through createPair (the accept route is a later task); a declined row the other way goes too.
    const b = await buddyUser();
    const y = await buddyUser();
    const asked = await prisma.buddyRequest.create({ data: { fromUserId: y.id, toUserId: b.id } });
    await prisma.buddyRequest.create({ data: { fromUserId: b.id, toUserId: y.id, status: 'DECLINED', respondedAt: new Date() } });
    await createPair(b.id, y.id, new Date(), { notifyQueue: queue });
    expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: asked.id } })).status).toBe('ACCEPTED');
    expect([(await lists(b.id)).outgoing, (await lists(y.id)).outgoing]).toEqual([[], []]);
  });

  it('the outgoing list shows the handle as it was when sent', async () => {
    const me = await buddyUser();
    const target = await buddyUser();
    const original = target.handle!;
    await send(me.id, original);
    await prisma.user.update({ where: { id: target.id }, data: { handle: `n${randomUUID().replace(/-/g, '').slice(0, 12)}` } });
    expect((await lists(me.id)).outgoing.map((r: { toHandle: string }) => r.toHandle)).toEqual([original]);
  });

  it('concurrent identical sends store one PENDING row', async () => {
    const me = await buddyUser();
    const target = await buddyUser();
    const results = await Promise.all([send(me.id, target.handle!), send(me.id, target.handle!), send(me.id, target.handle!)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await prisma.buddyRequest.count({ where: { fromUserId: me.id, toUserId: target.id, status: 'PENDING' } })).toBe(1);
  });

  it('simultaneous crossed sends make one pair', async () => {
    const a = await buddyUser();
    const b = await buddyUser();
    await Promise.all([send(a.id, b.handle!), send(b.id, a.handle!)]);
    expect(await prisma.buddyPair.count({ where: { OR: [{ userAId: a.id }, { userBId: a.id }] } })).toBe(1);
    expect(await prisma.buddyRequest.count({ where: { OR: [{ fromUserId: a.id }, { fromUserId: b.id }], status: 'PENDING' } })).toBe(0);
  });

  it('caps what the sender sees as pending at 20, counting hidden and declined rows', async () => {
    const me = await buddyUser();
    const targets = await Promise.all(Array.from({ length: 21 }, () => buddyUser()));
    await prisma.buddyRequest.create({ data: { fromUserId: me.id, toUserId: targets[0]!.id, hidden: true } });
    await prisma.buddyRequest.create({ data: { fromUserId: me.id, toUserId: targets[1]!.id, status: 'DECLINED', respondedAt: new Date() } });
    for (const t of targets.slice(2, 20)) expect((await send(me.id, t.handle!)).status).toBe(200);
    const res = await send(me.id, targets[20]!.handle!);
    expect([res.status, res.body]).toEqual([409, { error: 'too_many_pending' }]);
  });

  it('applies the 50-a-day limit to new requests, failing closed', async () => {
    const me = await buddyUser();
    const target = await buddyUser();
    const spy = jest.spyOn(rateLimit, 'consumeRateLimit').mockResolvedValueOnce('limited').mockResolvedValueOnce('unavailable');
    expect((await send(me.id, target.handle!)).body).toEqual({ error: 'rate_limited' });
    expect((await send(me.id, target.handle!)).body).toEqual({ error: 'try_later' });
    expect(spy).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.buddyRequest, me.id);
  });

  it('every send spends the daily bucket before the lookup, so probing unknown handles stops at 50', async () => {
    const me = await buddyUser();
    // One fixed clock for every call: the 50 sends and the 51st land in the same daily window.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now());
    for (let i = 0; i < 50; i++) await expect(sendRequest(me.id, `nobody${randomUUID().slice(0, 8)}`, new Date())).rejects.toMatchObject({ code: 'not_found' });
    const res = await send(me.id, `nobody${randomUUID().slice(0, 8)}`);
    expect([res.status, res.body]).toEqual([429, { error: 'rate_limited' }]);
  });

  it('a swallowed request and a real one run the same route path: one job of the same shape each', async () => {
    const swallower = await buddyUser();
    const real = await buddyUser();
    const target = await buddyUser();
    await addToken(target.id);
    await prisma.buddyRequest.create({
      data: { fromUserId: swallower.id, toUserId: target.id, status: 'DECLINED', createdAt: new Date(Date.now() - 21 * DAY), respondedAt: new Date(Date.now() - 20 * DAY) },
    });
    const a = await send(swallower.id, target.handle!);
    const b = await send(real.id, target.handle!);
    expect([a.status, a.body]).toEqual([b.status, b.body]);
    const shape = (j: { name: string; data: object; opts: unknown }) => [j.name, Object.keys(j.data).sort(), j.opts, (j.data as { kind: string }).kind];
    expect(queue.jobs).toHaveLength(2);
    expect(shape(queue.jobs[0]!)).toEqual(shape(queue.jobs[1]!));
    await queue.drain(sender);
    const realRow = (await rowsBetween(real.id, target.id))[0]!;
    expect(sender.calls.map((c) => c.payload.data)).toEqual([{ kind: 'buddy_request', refId: realRow.id }]);
  });

  it('a real, a blocked-by-target and a swallowed send do the same database work', async () => {
    const counts: number[] = [];
    for (const setup of ['real', 'blocked', 'swallowed', 'blocked-crossed'] as const) {
      const me = await buddyUser();
      const target = await buddyUser();
      if (setup === 'blocked' || setup === 'blocked-crossed') await prisma.buddyBlock.create({ data: { blockerId: target.id, blockedId: me.id } });
      // The target blocked me after I declined their request: their row still looks pending to them.
      if (setup === 'blocked-crossed') await prisma.buddyRequest.create({ data: { fromUserId: target.id, toUserId: me.id, status: 'DECLINED', respondedAt: new Date() } });
      if (setup === 'swallowed') {
        await prisma.buddyRequest.create({
          data: { fromUserId: me.id, toUserId: target.id, status: 'DECLINED', createdAt: new Date(Date.now() - 21 * DAY), respondedAt: new Date(Date.now() - 20 * DAY) },
        });
      }
      counts.push(await countDbCalls(() => sendRequest(me.id, target.handle, new Date(), { notifyQueue: queue })));
      expect((await rowsBetween(me.id, target.id)).find((r) => r.status === 'PENDING')?.hidden).toBe(setup !== 'real');
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(new Set(counts).size).toBe(1);
    expect(queue.jobs).toHaveLength(4);
  });

  it('a visible request from someone who blocked you never pairs: your request is stored hidden', async () => {
    const me = await buddyUser();
    const target = await buddyUser();
    await prisma.buddyRequest.create({ data: { fromUserId: target.id, toUserId: me.id } });
    await prisma.buddyBlock.create({ data: { blockerId: target.id, blockedId: me.id } });
    expect((await send(me.id, target.handle!)).body).toEqual({ ok: true });
    expect(await prisma.buddyPair.count({ where: { OR: [{ userAId: me.id }, { userBId: me.id }] } })).toBe(0);
    expect((await rowsBetween(me.id, target.id)).map((r) => [r.status, r.hidden])).toEqual([['PENDING', true]]);
    expect((await lists(target.id)).incoming).toEqual([]);
    expect((await lists(me.id)).outgoing).toHaveLength(1);
  });

  it('a hanging enqueue never hangs the route', async () => {
    const me = await buddyUser();
    const target = await buddyUser();
    setBuddyNotifyQueue({ add: () => new Promise(() => {}) });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const started = Date.now();
    const res = await send(me.id, target.handle!);
    expect([res.status, res.body]).toEqual([200, { ok: true }]);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(errors.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toContain('buddies.notify_enqueue_failed');
  });
});

describe('GET /me/buddies/requests', () => {
  it('backfills a missing REQUEST Activity row for each visible incoming request, never for a hidden one', async () => {
    const me = await buddyUser();
    const from = await buddyUser();
    const hider = await buddyUser();
    const seen = await prisma.buddyRequest.create({ data: { fromUserId: from.id, toUserId: me.id } });
    await prisma.buddyRequest.create({ data: { fromUserId: hider.id, toUserId: me.id, hidden: true } });
    expect((await lists(me.id)).incoming.map((r: { id: string }) => r.id)).toEqual([seen.id]);
    await lists(me.id);
    const rows = await prisma.buddyActivity.findMany({ where: { recipientId: me.id } });
    expect(rows.map((r) => [r.kind, r.actorId, r.refId, r.createdAt.toISOString()])).toEqual([['REQUEST', from.id, seen.id, seen.createdAt.toISOString()]]);
  });

  it('leaves out requests from people the viewer blocked, in the list, the count and the Activity backfill', async () => {
    const me = await buddyUser();
    const blocked = await buddyUser();
    await prisma.buddyRequest.create({ data: { fromUserId: blocked.id, toUserId: me.id } });
    await prisma.buddyBlock.create({ data: { blockerId: me.id, blockedId: blocked.id } });
    expect((await lists(me.id)).incoming).toEqual([]);
    expect((await countRequests(me.id, new Date())).incoming).toBe(0);
    expect(await prisma.buddyActivity.count({ where: { recipientId: me.id } })).toBe(0);
  });

  it('drops requests 14 days after sending, and sweeps them to EXPIRED', async () => {
    const me = await buddyUser();
    const target = await buddyUser();
    const old = await prisma.buddyRequest.create({ data: { fromUserId: me.id, toUserId: target.id, createdAt: new Date(Date.now() - 15 * DAY) } });
    expect(await lists(target.id)).toEqual({ incoming: [], outgoing: [] });
    expect(await lists(me.id)).toEqual({ incoming: [], outgoing: [] });
    expect((await prisma.buddyRequest.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('EXPIRED');
  });
});

/** Every Prisma call the send path could make (model delegates, raw SQL, transactions). */
async function countDbCalls(fn: () => Promise<unknown>): Promise<number> {
  const client = prisma as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;
  const methods = ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'];
  const spies: jest.SpyInstance[] = [];
  for (const model of ['user', 'buddyBlock', 'buddyPair', 'buddyRequest', 'buddyActivity']) {
    for (const m of methods) spies.push(jest.spyOn(client[model]!, m));
  }
  for (const m of ['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe', '$transaction']) spies.push(jest.spyOn(client as never, m as never));
  try {
    await fn();
    return spies.reduce((n, s) => n + s.mock.calls.length, 0);
  } finally {
    for (const s of spies) s.mockRestore();
  }
}
