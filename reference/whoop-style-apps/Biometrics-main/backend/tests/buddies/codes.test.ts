import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { CODE_ALPHABET, createCode, generateCode, normaliseCode, redeemCode } from '../../src/buddies/codes';
import { createPair, orderedPair } from '../../src/buddies/pairs';
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

async function codeFor(userId: string): Promise<string> {
  return (await (await api()).post('/me/buddies/code').set(await authHeaderFor(userId))).body.code;
}
const redeem = async (userId: string, code: string) => (await api()).post('/me/buddies/code/redeem').set(await authHeaderFor(userId)).send({ code });

describe('codes (pure)', () => {
  it('uses 8 characters from an alphabet without look-alikes', () => {
    expect(CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it('normalises case, spaces and dashes, and refuses anything else', () => {
    expect(normaliseCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normaliseCode('ab cd ef 23')).toBe('ABCDEF23');
    for (const bad of ['ABCDEFGO', 'ABCDEFG', 'ABCDEFGH2', 'ABCD_EFG', 42, null]) expect(normaliseCode(bad)).toBeNull();
  });
});

describe('pairing core', () => {
  it('stores the pair ordered, writes PAIRED Activity for both with the pair id, and pushes both once', async () => {
    const a = await buddyUser({ displayName: 'Ana' });
    const b = await buddyUser({ displayName: 'Ben' });
    await addToken(a.id);
    await addToken(b.id);
    const now = new Date('2026-10-07T12:00:00Z');
    const [first, second] = await Promise.all([createPair(a.id, b.id, now), createPair(b.id, a.id, now)]);
    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.pairId).toBe(second.pairId);
    const pair = await prisma.buddyPair.findUniqueOrThrow({ where: { userAId_userBId: orderedPair(a.id, b.id) } });
    const activity = await prisma.buddyActivity.findMany({ where: { refId: pair.id } });
    expect(activity.map((r) => [r.recipientId, r.actorId, r.kind]).sort()).toEqual([[a.id, b.id, 'PAIRED'], [b.id, a.id, 'PAIRED']].sort());
    // The request only enqueued; the job sends.
    expect(queue.jobs.map((j) => j.data.kind)).toEqual(['buddy_paired', 'buddy_paired']);
    await queue.drain(sender);
    expect(sender.titles().sort()).toEqual(['You and Ana are now buddies', 'You and Ben are now buddies']);
    const data = sender.calls.map((c) => c.payload.data);
    expect(data).toEqual(expect.arrayContaining([{ kind: 'buddy_paired', refId: a.id }, { kind: 'buddy_paired', refId: b.id }]));
  });
});

describe('pairing core: requests', () => {
  it('turns PENDING requests between the two (either way, hidden too) into ACCEPTED and leaves others alone', async () => {
    const a = await buddyUser();
    const b = await buddyUser();
    const c = await buddyUser();
    const ab = await prisma.buddyRequest.create({ data: { fromUserId: a.id, toUserId: b.id, hidden: true } });
    const ba = await prisma.buddyRequest.create({ data: { fromUserId: b.id, toUserId: a.id } });
    const ac = await prisma.buddyRequest.create({ data: { fromUserId: a.id, toUserId: c.id } });
    const now = new Date('2026-10-07T12:00:00Z');
    expect((await createPair(a.id, b.id, now)).created).toBe(true);
    const rows = await prisma.buddyRequest.findMany({ where: { id: { in: [ab.id, ba.id, ac.id] } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect([byId.get(ab.id)?.status, byId.get(ab.id)?.respondedAt]).toEqual(['ACCEPTED', now]);
    expect(byId.get(ba.id)?.status).toBe('ACCEPTED');
    expect(byId.get(ac.id)?.status).toBe('PENDING');
  });
});

/** Every Prisma call the redeem path could make (model delegates, raw SQL, transactions). */
async function countDbCalls(fn: () => Promise<unknown>): Promise<number> {
  const client = prisma as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;
  const methods = ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'];
  const spies: jest.SpyInstance[] = [];
  for (const model of ['user', 'buddyCode', 'buddyBlock', 'buddyPair', 'buddyRequest', 'buddyActivity']) {
    for (const m of methods) spies.push(jest.spyOn(client[model]!, m));
  }
  for (const m of ['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe', '$transaction']) spies.push(jest.spyOn(client as never, m as never));
  try {
    await fn().catch(() => undefined);
    return spies.reduce((n, s) => n + s.mock.calls.length, 0);
  } finally {
    for (const s of spies) s.mockRestore();
  }
}

describe('code routes', () => {
  it('needs a handle and the mood notice to create or redeem', async () => {
    const noHandle = await buddyUser({ handle: null });
    const noNotice = await buddyUser({ notice: false });
    const agent = await api();
    expect((await agent.post('/me/buddies/code').set(await authHeaderFor(noHandle.id))).body).toEqual({ error: 'handle_required' });
    const res = await agent.post('/me/buddies/code').set(await authHeaderFor(noNotice.id));
    expect([res.status, res.body]).toEqual([409, { error: 'mood_notice_required' }]);
    expect((await redeem(noNotice.id, 'ABCDEFGH')).body).toEqual({ error: 'mood_notice_required' });
  });

  it('a new code expires the older one; GET answers the active code', async () => {
    const owner = await buddyUser();
    const first = await codeFor(owner.id);
    const second = await codeFor(owner.id);
    expect(second).not.toBe(first);
    const old = await prisma.buddyCode.findUniqueOrThrow({ where: { code: first } });
    expect(old.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    const got = await (await api()).get('/me/buddies/code').set(await authHeaderFor(owner.id));
    expect(got.body.code).toBe(second);
    expect(new Date(got.body.expiresAt).getTime() - Date.now()).toBeGreaterThan(23.9 * 3600_000);
  });

  it('retries on a code collision and sweeps codes older than 7 days', async () => {
    const owner = await buddyUser();
    const other = await buddyUser();
    const old = new Date(Date.now() - 8 * 86_400_000);
    await prisma.buddyCode.create({ data: { code: 'ZZZZZZZZ', ownerId: other.id, createdAt: old, expiresAt: old } });
    await prisma.buddyCode.create({ data: { code: 'YYYYYYYY', ownerId: other.id, expiresAt: new Date(Date.now() + 3600_000) } });
    try {
      const codes = ['YYYYYYYY', 'XXXXXXXX'];
      const made = await createCode(owner.id, new Date(), { generate: () => codes.shift()! });
      expect(made.code).toBe('XXXXXXXX');
      expect(await prisma.buddyCode.findUnique({ where: { code: 'ZZZZZZZZ' } })).toBeNull();
    } finally {
      await prisma.buddyCode.deleteMany({ where: { code: { in: ['XXXXXXXX', 'YYYYYYYY', 'ZZZZZZZZ'] } } });
    }
  });

  it('redeeming pairs at once, marks the code used, and accepts a messy spelling', async () => {
    const owner = await buddyUser();
    const friend = await buddyUser();
    const code = await codeFor(owner.id);
    const res = await redeem(friend.id, `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`);
    expect([res.status, res.body]).toEqual([200, { buddyId: owner.id }]);
    const row = await prisma.buddyCode.findUniqueOrThrow({ where: { code } });
    expect(row.usedById).toBe(friend.id);
    expect(await prisma.buddyPair.count({ where: orderedPair(owner.id, friend.id) })).toBe(1);
  });

  it('answers the same code_invalid for unknown, expired, used, own and blocked-either-way codes', async () => {
    const owner = await buddyUser();
    const friend = await buddyUser();
    const blocker = await buddyUser();
    const blocked = await buddyUser();
    const expired = await codeFor(owner.id);
    await prisma.buddyCode.update({ where: { code: expired }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const used = await codeFor(owner.id);
    await redeem(friend.id, used);
    const own = await codeFor(blocker.id);
    await prisma.buddyBlock.create({ data: { blockerId: blocker.id, blockedId: blocked.id } });
    const theirs = await codeFor(blocked.id);
    const results = [
      await redeem(friend.id, 'ABCDEFGH'),
      await redeem(blocked.id, expired),
      await redeem(blocked.id, used),
      await redeem(blocker.id, own),
      await redeem(blocker.id, theirs),
      await redeem(blocked.id, own),
      await redeem(friend.id, 'not a code'),
    ];
    for (const r of results) expect([r.status, r.body]).toEqual([400, { error: 'code_invalid' }]);
  });

  it('does the same database work for unknown, used, expired, own and blocked codes', async () => {
    const owner = await buddyUser();
    const friend = await buddyUser();
    const blocker = await buddyUser();
    const blocked = await buddyUser();
    const expired = await codeFor(owner.id);
    await prisma.buddyCode.update({ where: { code: expired }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const used = await codeFor(owner.id);
    await redeem(friend.id, used);
    const own = await codeFor(blocker.id);
    await prisma.buddyBlock.create({ data: { blockerId: blocker.id, blockedId: blocked.id } });
    const now = new Date();
    const cases: Array<[string, string]> = [
      [friend.id, 'ABCDEFGH'],
      [blocked.id, expired],
      [blocked.id, used],
      [blocker.id, own],
      [blocked.id, own],
    ];
    const counts: number[] = [];
    for (const [userId, code] of cases) {
      counts.push(await countDbCalls(() => redeemCode(userId, code, now)));
      await expect(redeemCode(userId, code, now)).rejects.toMatchObject({ code: 'code_invalid' });
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(new Set(counts).size).toBe(1);
  });

  it('a failure while pairing rolls back the redeem: the code stays unused and nothing is enqueued', async () => {
    const owner = await buddyUser();
    const friend = await buddyUser();
    const code = await codeFor(owner.id);
    const failing = async () => {
      throw new Error('pair insert failed');
    };
    await expect(redeemCode(friend.id, code, new Date(), { createPairTx: failing })).rejects.toThrow('pair insert failed');
    const row = await prisma.buddyCode.findUniqueOrThrow({ where: { code } });
    expect([row.usedAt, row.usedById]).toEqual([null, null]);
    expect(queue.jobs).toEqual([]);
    expect((await redeem(friend.id, code)).status).toBe(200);
  });

  it('concurrent code creation leaves exactly one active code', async () => {
    const owner = await buddyUser();
    const now = new Date();
    await Promise.all(Array.from({ length: 8 }, () => createCode(owner.id, now)));
    expect(await prisma.buddyCode.count({ where: { ownerId: owner.id, usedAt: null, expiresAt: { gt: now } } })).toBe(1);
  });

  it("a new code doesn't wait on a key-share lock of the owner's row (a concurrent redeem's pair insert)", async () => {
    const owner = await buddyUser();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    // What the BuddyPair foreign-key check takes on the owner's User row while a redeem inserts the pair.
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${owner.id} FOR KEY SHARE`;
      locked();
      await held;
    });
    await isLocked;
    const creating = createCode(owner.id, new Date()).then(() => 'created');
    try {
      expect(await Promise.race([creating, new Promise((r) => setTimeout(() => r('waited'), 1500))])).toBe('created');
    } finally {
      release();
      await holder;
      await creating;
    }
  });

  it('answers a new code with Cache-Control private, no-store', async () => {
    const owner = await buddyUser();
    const res = await (await api()).post('/me/buddies/code').set(await authHeaderFor(owner.id));
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('concurrent redeems of one code: one pairs, the other gets code_invalid', async () => {
    const owner = await buddyUser();
    const x = await buddyUser();
    const y = await buddyUser();
    const code = await codeFor(owner.id);
    const results = await Promise.all([redeem(x.id, code), redeem(y.id, code)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await prisma.buddyPair.count({ where: { OR: [{ userAId: owner.id }, { userBId: owner.id }] } })).toBe(1);
  });

  it("a buddy's valid code is a success that adds no second pair", async () => {
    const owner = await buddyUser();
    const friend = await buddyUser();
    await pairUp(owner.id, friend.id);
    const code = await codeFor(owner.id);
    expect((await redeem(friend.id, code)).status).toBe(200);
    expect(await prisma.buddyPair.count({ where: orderedPair(owner.id, friend.id) })).toBe(1);
    expect((await prisma.buddyCode.findUniqueOrThrow({ where: { code } })).usedById).toBe(friend.id);
    expect(queue.jobs).toEqual([]);
  });

  it('limits redemption to 10 an hour', async () => {
    const user = await buddyUser();
    const agent = await api();
    const headers = await authHeaderFor(user.id);
    for (let i = 0; i < 10; i++) expect((await agent.post('/me/buddies/code/redeem').set(headers).send({ code: 'ABCDEFGH' })).status).toBe(400);
    const res = await agent.post('/me/buddies/code/redeem').set(headers).send({ code: 'ABCDEFGH' });
    expect([res.status, res.body]).toEqual([429, { error: 'rate_limited' }]);
  });
});
