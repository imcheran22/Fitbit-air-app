import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { connection, syncQueue } from '../../src/sync/queue';
import { main, parseArgs, seedBuddies } from '../../scripts/seedBuddies';
import { handleHash } from '../../src/buddies/identity';
import { orderedPair } from '../../src/buddies/pairs';
import { STICKERS_PER_BUDDY_PER_DAY } from '../../src/buddies/stickers';
import { migrateTestDb } from '../setupTestDb';

// The seed never touches Redis, but its imports open the shared connection: stub it so the CLI's
// closers can be checked.
jest.mock('../../src/sync/queue', () => ({
  connection: { quit: jest.fn().mockResolvedValue('OK') },
  syncQueue: { close: jest.fn().mockResolvedValue(undefined), add: jest.fn() },
}));

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const LOCAL = { DATABASE_URL: 'postgresql://dev@localhost:5432/biometrics_dev' };
const NOW = new Date('2026-10-07T12:00:00Z');
const newUser = (email: string) => prisma.user.create({ data: { email, name: 'Test User' } });

it('refuses production and non-local databases', async () => {
  await expect(seedBuddies({ email: 'a@example.com', buddyEmail: 'b@example.com', env: { ...LOCAL, NODE_ENV: 'production' } })).rejects.toMatchObject({ name: 'SeedProductionRefused' });
  await expect(seedBuddies({ email: 'a@example.com', buddyEmail: 'b@example.com', env: { DATABASE_URL: 'postgresql://dev@db.example.com/x' } })).rejects.toMatchObject({ name: 'SeedNonLocalRefused' });
});

it('reads both emails and names a usage error', () => {
  expect(parseArgs(['node', 's', '--email', 'a@x.com', '--buddy-email', 'b@x.com'])).toEqual({ email: 'a@x.com', buddyEmail: 'b@x.com' });
  expect(() => parseArgs(['node', 's', '--email', 'a@x.com'])).toThrow('Usage');
  // The handle-hold key must match the server's, or held handles don't match.
  expect(() => parseArgs(['node', 's'])).toThrow(/HANDLE_HOLD_SECRET.*BETTER_AUTH_SECRET/);
});

it('sets up both identities, pairs them and sends one sticker; a second run adds no pair', async () => {
  const a = await newUser(`seed-a-${randomUUID()}@example.com`);
  const b = await newUser(`seed-b-${randomUUID()}@example.com`);
  const first = await seedBuddies({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL });
  expect(first).toMatchObject({ userId: a.id, buddyId: b.id, paired: true, stickerId: expect.any(String) });
  const users = await prisma.user.findMany({ where: { id: { in: [a.id, b.id] } } });
  for (const u of users) expect([u.handle !== null, u.displayName !== null, u.buddyMoodNoticeAt !== null]).toEqual([true, true, true]);
  const identities = async () =>
    (await prisma.user.findMany({ where: { id: { in: [a.id, b.id] } }, orderBy: { id: 'asc' }, select: { handle: true, displayName: true, buddyMoodNoticeAt: true } }));
  const before = await identities();
  const second = await seedBuddies({ email: a.email, buddyEmail: b.email, now: new Date(NOW.getTime() + 60_000), env: LOCAL });
  expect(second.paired).toBe(false);
  expect(await prisma.buddyPair.count({ where: orderedPair(a.id, b.id) })).toBe(1);
  // The second run leaves both identities exactly as the first one set them.
  expect(await identities()).toEqual(before);
});

it('refuses unknown accounts, and the CLI closes Prisma, the queue and Redis', async () => {
  await expect(seedBuddies({ email: `nobody-${randomUUID()}@example.com`, buddyEmail: 'x@example.com', env: LOCAL })).rejects.toMatchObject({ name: 'SeedUnknownUser' });
  const disconnect = jest.spyOn(prisma, '$disconnect').mockResolvedValue(undefined);
  await expect(main(['node', 's'])).rejects.toThrow('Usage');
  expect(disconnect).toHaveBeenCalled();
  expect(syncQueue.close).toHaveBeenCalled();
  expect(connection.quit).toHaveBeenCalled();
  disconnect.mockRestore();
});

it('keeps an identity already set, skips a generated handle that is taken or held, and enqueues nothing', async () => {
  (syncQueue.add as jest.Mock).mockClear();
  const a = await newUser(`seed-a-${randomUUID()}@example.com`);
  const b = await newUser(`seed-b-${randomUUID()}@example.com`);
  const own = `own_${a.id.replace(/-/g, '').slice(0, 12)}`;
  await prisma.user.update({ where: { id: a.id }, data: { handle: own, displayName: 'Mine' } });
  // b's first generated handle belongs to someone else; the second is held for someone else.
  const hex = b.id.replace(/-/g, '');
  const other = await newUser(`seed-o-${randomUUID()}@example.com`);
  await prisma.user.update({ where: { id: other.id }, data: { handle: `dev_${hex.slice(0, 8)}` } });
  await prisma.handleHold.create({ data: { handleHash: handleHash(`dev_${hex.slice(0, 12)}`), previousOwnerId: other.id, releasedAt: NOW } });

  await seedBuddies({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL });
  const ua = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
  const ub = await prisma.user.findUniqueOrThrow({ where: { id: b.id } });
  expect([ua.handle, ua.displayName]).toEqual([own, 'Mine']);
  expect([ub.handle, ub.displayName]).toEqual([`dev_${hex.slice(0, 16)}`, 'Dev buddy']);
  expect(syncQueue.add).not.toHaveBeenCalled();
  await prisma.handleHold.deleteMany({ where: { previousOwnerId: other.id } });
});

it("returns stickerId null once today's sticker limit is reached, instead of failing", async () => {
  const a = await newUser(`seed-a-${randomUUID()}@example.com`);
  const b = await newUser(`seed-b-${randomUUID()}@example.com`);
  for (let i = 0; i < STICKERS_PER_BUDDY_PER_DAY; i++) await seedBuddies({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL });
  const again = await seedBuddies({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL });
  expect(again).toMatchObject({ paired: false, stickerId: null });
  expect(await prisma.sticker.count({ where: { fromUserId: b.id, toUserId: a.id } })).toBe(STICKERS_PER_BUDDY_PER_DAY);
});

it('refuses to pair an account with itself, before writing any identity', async () => {
  const a = await newUser(`seed-a-${randomUUID()}@example.com`);
  await expect(seedBuddies({ email: a.email, buddyEmail: a.email, now: NOW, env: LOCAL })).rejects.toMatchObject({ name: 'SeedUsageError' });
  const after = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
  expect([after.handle, after.displayName, after.buddyMoodNoticeAt]).toEqual([null, null, null]);
});

it.each(['first', 'second'] as const)('refuses a pair where one account blocked the other (%s blocks), before writing any identity', async (blocker) => {
  const a = await newUser(`seed-a-${randomUUID()}@example.com`);
  const b = await newUser(`seed-b-${randomUUID()}@example.com`);
  await prisma.buddyBlock.create({ data: blocker === 'first' ? { blockerId: a.id, blockedId: b.id } : { blockerId: b.id, blockedId: a.id } });
  await expect(seedBuddies({ email: a.email, buddyEmail: b.email, now: NOW, env: LOCAL })).rejects.toMatchObject({ name: 'SeedBlockedPair' });
  const users = await prisma.user.findMany({ where: { id: { in: [a.id, b.id] } } });
  for (const u of users) expect([u.handle, u.displayName, u.buddyMoodNoticeAt]).toEqual([null, null, null]);
  expect(await prisma.buddyPair.count({ where: orderedPair(a.id, b.id) })).toBe(0);
});
