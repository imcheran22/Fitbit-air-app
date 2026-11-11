import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { deleteUserAccount } from '../../src/users/deletion';
import { handleHash } from '../../src/buddies/identity';
import { updateIdentity } from '../../src/buddies/handles';
import * as rateLimit from '../../src/lib/rateLimit';
import { saveCheckIn } from '../../src/social/checkins';
import { api, buddyUser, pairUp } from './helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
afterEach(() => jest.restoreAllMocks());

const uniq = () => `h${randomUUID().replace(/-/g, '').slice(0, 10)}`;
const noop = { deleteSubscription: async () => {}, revokeToken: async () => {}, log: () => {} };

it('GET /me/buddies/me reports no identity yet, the prefill and the mood notice', async () => {
  const user = await buddyUser({ handle: null, displayName: null, name: 'Sam Rivera', notice: false });
  const res = await (await api()).get('/me/buddies/me').set(await authHeaderFor(user.id));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ handle: null, displayName: null, displayNamePrefill: 'Sam', moodNoticeSeen: false, checkInStreak: 0, buddyCount: 0 });
});

it("GET /me/buddies/me adds the passport's check-in streak, buddy count and joined date", async () => {
  const user = await buddyUser({ timezone: 'America/Los_Angeles' });
  // 02:00 UTC on Mar 15 is still Mar 14 in Los Angeles.
  await prisma.user.update({ where: { id: user.id }, data: { createdAt: new Date('2026-03-15T02:00:00Z') } });
  for (const b of [await buddyUser(), await buddyUser()]) await pairUp(user.id, b.id);
  await pairUp((await buddyUser()).id, (await buddyUser()).id);
  await saveCheckIn(user.id, 'RESTED', new Date());

  const res = await (await api()).get('/me/buddies/me').set(await authHeaderFor(user.id));

  expect(res.body).toMatchObject({ checkInStreak: 1, buddyCount: 2, joinedOn: '2026-03-14' });
  expect(res.headers['cache-control']).toBe('private, no-store');
});

it('first setup needs both fields, stores the handle lowercase without its @, and sanitises the name', async () => {
  const user = await buddyUser({ handle: null, displayName: null });
  const h = uniq();
  const headers = await authHeaderFor(user.id);
  const half = await (await api()).put('/me/handle').set(headers).send({ handle: h });
  expect([half.status, half.body]).toEqual([400, { error: 'setup_incomplete' }]);
  const res = await (await api()).put('/me/handle').set(headers).send({ handle: `@${h.toUpperCase()}`, displayName: ' Sam​ ' });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ handle: h, displayName: 'Sam' });
});

it('answers invalid_handle / invalid_display_name with the problem', async () => {
  const user = await buddyUser();
  const headers = await authHeaderFor(user.id);
  const bad = await (await api()).put('/me/handle').set(headers).send({ handle: 'Team_Lead' });
  expect([bad.status, bad.body]).toEqual([400, { error: 'invalid_handle', problem: 'reserved' }]);
  const name = await (await api()).put('/me/handle').set(headers).send({ displayName: 'the admin' });
  expect([name.status, name.body]).toEqual([400, { error: 'invalid_display_name', problem: 'reserved' }]);
  const empty = await (await api()).put('/me/handle').set(headers).send({});
  expect([empty.status, empty.body]).toEqual([400, { error: 'setup_incomplete' }]);
});

it('a handle another user has (any case) is taken, and unavailable to everyone else', async () => {
  const owner = await buddyUser();
  const other = await buddyUser();
  const headers = await authHeaderFor(other.id);
  const res = await (await api()).put('/me/handle').set(headers).send({ handle: owner.handle!.toUpperCase() });
  expect([res.status, res.body]).toEqual([409, { error: 'handle_taken' }]);
  const check = await (await api()).get('/me/handle/availability').query({ handle: `@${owner.handle}` }).set(headers);
  expect(check.body).toEqual({ handle: owner.handle, available: false });
  const own = await (await api()).get('/me/handle/availability').query({ handle: owner.handle! }).set(await authHeaderFor(owner.id));
  expect(own.body).toEqual({ handle: owner.handle, available: true });
  const invalid = await (await api()).get('/me/handle/availability').query({ handle: 'a' }).set(headers);
  expect([invalid.status, invalid.body]).toEqual([400, { error: 'invalid_handle', problem: 'length' }]);
});

it('a changed handle is held 30 days as a keyed hash: others cannot claim it, its owner can reclaim it', async () => {
  const sam = await buddyUser();
  const old = sam.handle!;
  const other = await buddyUser();
  await (await api()).put('/me/handle').set(await authHeaderFor(sam.id)).send({ handle: uniq() });

  const hold = await prisma.handleHold.findUniqueOrThrow({ where: { handleHash: handleHash(old) } });
  expect(hold.previousOwnerId).toBe(sam.id);
  expect(JSON.stringify(await prisma.handleHold.findMany({ where: { previousOwnerId: sam.id } }))).not.toContain(old);

  const taken = await (await api()).put('/me/handle').set(await authHeaderFor(other.id)).send({ handle: old });
  expect([taken.status, taken.body]).toEqual([409, { error: 'handle_taken' }]);
  expect((await (await api()).get('/me/handle/availability').query({ handle: old }).set(await authHeaderFor(other.id))).body.available).toBe(false);

  expect((await (await api()).get('/me/handle/availability').query({ handle: old }).set(await authHeaderFor(sam.id))).body).toEqual({ handle: old, available: true });

  const back = await (await api()).put('/me/handle').set(await authHeaderFor(sam.id)).send({ handle: old });
  expect(back.status).toBe(200);
  expect(await prisma.handleHold.findUnique({ where: { handleHash: handleHash(old) } })).toBeNull();
});

it('a hold older than 30 days no longer blocks a claim', async () => {
  const other = await buddyUser();
  const h = uniq();
  await prisma.handleHold.create({ data: { handleHash: handleHash(h), previousOwnerId: null, releasedAt: new Date(Date.now() - 31 * 86_400_000) } });
  const res = await (await api()).put('/me/handle').set(await authHeaderFor(other.id)).send({ handle: h });
  expect(res.status).toBe(200);
});

it('a claim racing the owner moving away from the handle is taken (User unique or the new hold)', async () => {
  const owner = await buddyUser();
  const racer = await buddyUser();
  const contested = owner.handle!;
  const [move, claim] = await Promise.all([
    (await api()).put('/me/handle').set(await authHeaderFor(owner.id)).send({ handle: uniq() }),
    (await api()).put('/me/handle').set(await authHeaderFor(racer.id)).send({ handle: contested }),
  ]);
  expect(move.status).toBe(200);
  expect([claim.status, claim.body]).toEqual([409, { error: 'handle_taken' }]);
});

it('a handle change waits for a concurrent change of the same account, then holds the handle that change set', async () => {
  const sam = await buddyUser();
  const first = uniq();
  const second = uniq();
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let locked!: () => void;
  const isLocked = new Promise<void>((r) => (locked = r));
  const holder = prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: sam.id }, data: { handle: first } });
    locked();
    await held;
  });
  await isLocked;
  const change = updateIdentity(sam.id, { handle: second }, new Date());
  await new Promise((r) => setTimeout(r, 300));
  release();
  await holder;
  expect((await change).handle).toBe(second);
  // Without the row lock the change would read the handle from before `first` and never hold `first`.
  const hold = await prisma.handleHold.findUnique({ where: { handleHash: handleHash(first) } });
  expect(hold?.previousOwnerId).toBe(sam.id);
});

it("a deleted account's handle is held for 30 days", async () => {
  const gone = await buddyUser();
  const other = await buddyUser();
  await deleteUserAccount(gone.id, noop);
  const hold = await prisma.handleHold.findUniqueOrThrow({ where: { handleHash: handleHash(gone.handle!) } });
  expect(hold.previousOwnerId).toBeNull();
  const res = await (await api()).put('/me/handle').set(await authHeaderFor(other.id)).send({ handle: gone.handle });
  expect([res.status, res.body]).toEqual([409, { error: 'handle_taken' }]);
});

it('limits availability checks and handle saves to 30 a minute together', async () => {
  // One fixed clock: all 31 calls land in the same one-minute window, whenever the test runs.
  jest.spyOn(Date, 'now').mockReturnValue(Date.now());
  const user = await buddyUser();
  const headers = await authHeaderFor(user.id);
  const agent = await api();
  for (let i = 0; i < 30; i++) expect((await agent.get('/me/handle/availability').query({ handle: uniq() }).set(headers)).status).toBe(200);
  const res = await agent.put('/me/handle').set(headers).send({ displayName: 'Sam' });
  expect([res.status, res.body]).toEqual([429, { error: 'rate_limited' }]);
});

it('fails closed with try_later when the limiter cannot reach Redis', async () => {
  jest.spyOn(rateLimit, 'consumeRateLimit').mockResolvedValue('unavailable');
  const user = await buddyUser();
  const res = await (await api()).get('/me/handle/availability').query({ handle: uniq() }).set(await authHeaderFor(user.id));
  expect([res.status, res.body]).toEqual([503, { error: 'try_later' }]);
});

it('identity routes need a session', async () => {
  const agent = await api();
  for (const res of [
    await agent.get('/me/buddies/me'),
    await agent.get('/me/handle/availability').query({ handle: uniq() }),
    await agent.put('/me/handle').send({ handle: uniq(), displayName: 'Sam' }),
  ]) expect(res.status).toBe(401);
});

it('answers identity reads and saves with Cache-Control private, no-store', async () => {
  const user = await buddyUser();
  const headers = await authHeaderFor(user.id);
  const agent = await api();
  for (const res of [
    await agent.get('/me/buddies/me').set(headers),
    await agent.get('/me/handle/availability').query({ handle: uniq() }).set(headers),
    await agent.put('/me/handle').set(headers).send({ displayName: 'Sam' }),
  ]) expect([res.status, res.headers['cache-control']]).toEqual([200, 'private, no-store']);
});
