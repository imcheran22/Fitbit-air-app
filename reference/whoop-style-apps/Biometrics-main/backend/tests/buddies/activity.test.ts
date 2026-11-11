import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { BUDDY_SHARING_CONSENT_VERSION } from '../../src/buddies/sharing';
import { listActivity } from '../../src/buddies/activity';
import { api, buddyUser, pairUp } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const NOW = new Date('2026-10-10T12:00:00Z');
const DAY = 86_400_000;

async function badgeFrom(actorId: string, recipientId: string) {
  const ach = await prisma.achievement.create({
    data: { userId: actorId, family: 'STEP_GOAL', level: 3, value: 14, earnedOn: civilDateToUtcMidnight('2026-10-09'), weekStart: civilDateToUtcMidnight('2026-10-05'), monthStart: civilDateToUtcMidnight('2026-10-01') },
  });
  await prisma.buddyActivity.create({ data: { recipientId, actorId, kind: 'BUDDY_BADGE', refId: ach.id, createdAt: NOW } });
}

it('builds DTOs at read time: names, sticker kind, badge level and request id, newest first', async () => {
  const me = await buddyUser();
  const sam = await buddyUser({ displayName: 'Sam' });
  const pair = await pairUp(me.id, sam.id);
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });
  const sticker = await prisma.sticker.create({ data: { fromUserId: sam.id, toUserId: me.id, kind: 'REST_UP' } });
  const req = await prisma.buddyRequest.create({ data: { fromUserId: sam.id, toUserId: me.id, status: 'ACCEPTED' } });
  await prisma.buddyActivity.createMany({
    data: [
      { recipientId: me.id, actorId: sam.id, kind: 'REQUEST', refId: req.id, createdAt: new Date(NOW.getTime() - 3000) },
      { recipientId: me.id, actorId: sam.id, kind: 'PAIRED', refId: pair.id, createdAt: new Date(NOW.getTime() - 2000) },
      { recipientId: me.id, actorId: sam.id, kind: 'STICKER', refId: sticker.id, createdAt: new Date(NOW.getTime() - 1000) },
    ],
  });
  await badgeFrom(sam.id, me.id);
  const page = await listActivity(me.id, undefined, NOW);
  expect(page.items.map((i) => [i.kind, i.actor.displayName, i.sticker ?? i.badge ?? i.requestId ?? null])).toEqual([
    ['badge', 'Sam', { family: 'STEP_GOAL', level: 3 }],
    ['sticker', 'Sam', 'REST_UP'],
    ['paired', 'Sam', null],
    ['request', 'Sam', req.id],
  ]);
  expect(page.unseen).toBe(4);
});

it("hides badge rows once the earner stops sharing streaks (or their consent goes stale), and drops rows whose sticker is gone", async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await pairUp(me.id, sam.id);
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });
  await badgeFrom(sam.id, me.id);
  await prisma.buddyActivity.create({ data: { recipientId: me.id, actorId: sam.id, kind: 'STICKER', refId: randomUUID(), createdAt: NOW } });
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: false } });
  expect((await listActivity(me.id, undefined, NOW)).items).toEqual([]);
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION - 1 } });
  const page = await listActivity(me.id, undefined, NOW);
  // The dangling sticker row is no item and no unseen count either.
  expect([page.items, page.unseen]).toEqual([[], 0]);
});

it('the unseen count ignores sticker and badge rows whose sticker or badge is gone', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  const pair = await pairUp(me.id, sam.id);
  await prisma.user.update({ where: { id: sam.id }, data: { shareStreaks: true, buddySharingConsentVersion: BUDDY_SHARING_CONSENT_VERSION } });
  await badgeFrom(sam.id, me.id);
  await prisma.buddyActivity.createMany({
    data: [
      { recipientId: me.id, actorId: sam.id, kind: 'PAIRED', refId: pair.id, createdAt: NOW },
      { recipientId: me.id, actorId: sam.id, kind: 'STICKER', refId: randomUUID(), createdAt: NOW },
      { recipientId: me.id, actorId: sam.id, kind: 'BUDDY_BADGE', refId: randomUUID(), createdAt: NOW },
    ],
  });
  const page = await listActivity(me.id, undefined, NOW);
  expect([page.items.map((i) => i.kind).sort(), page.unseen]).toEqual([['badge', 'paired'], 2]);
});

it("excludes rows from someone the recipient blocked (a backfill racing the block), items and unseen count alike", async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  const ana = await buddyUser();
  await prisma.buddyActivity.createMany({
    data: [
      { recipientId: me.id, actorId: sam.id, kind: 'REQUEST', refId: randomUUID(), createdAt: NOW },
      { recipientId: me.id, actorId: ana.id, kind: 'REQUEST', refId: randomUUID(), createdAt: NOW },
    ],
  });
  await prisma.buddyBlock.create({ data: { blockerId: me.id, blockedId: sam.id } });
  // A block the other way hides nothing from me: only my own blocks filter my Activity.
  await prisma.buddyBlock.create({ data: { blockerId: ana.id, blockedId: me.id } });
  const page = await listActivity(me.id, undefined, NOW);
  expect([page.items.map((i) => i.actor.id), page.unseen]).toEqual([[ana.id], 1]);
});

it('a page that drops a dangling item still carries the cursor to the next page', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  await prisma.buddyActivity.createMany({
    data: [
      { recipientId: me.id, actorId: sam.id, kind: 'PAIRED', refId: randomUUID(), createdAt: new Date(NOW.getTime() - 1000) },
      { recipientId: me.id, actorId: sam.id, kind: 'STICKER', refId: randomUUID(), createdAt: new Date(NOW.getTime() - 2000) },
      { recipientId: me.id, actorId: sam.id, kind: 'PAIRED', refId: randomUUID(), createdAt: new Date(NOW.getTime() - 3000) },
    ],
  });
  const first = await listActivity(me.id, undefined, NOW, 2);
  expect(first.items).toHaveLength(1);
  expect(first.nextCursor).not.toBeNull();
  const second = await listActivity(me.id, first.nextCursor, NOW, 2);
  expect([second.items.map((i) => i.kind), second.nextCursor]).toEqual([['paired'], null]);
});

it('keeps 90 days (older rows are swept on read) and pages 30 at a time', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  const pair = await pairUp(me.id, sam.id);
  await prisma.buddyActivity.create({ data: { recipientId: me.id, actorId: sam.id, kind: 'PAIRED', refId: pair.id, createdAt: new Date(NOW.getTime() - 91 * DAY) } });
  await prisma.buddyActivity.createMany({
    data: Array.from({ length: 31 }, (_, i) => ({ recipientId: me.id, actorId: sam.id, kind: 'PAIRED' as const, refId: randomUUID(), createdAt: new Date(NOW.getTime() - i * 1000) })),
  });
  const first = await listActivity(me.id, undefined, NOW);
  expect(first.items).toHaveLength(30);
  const second = await listActivity(me.id, first.nextCursor, NOW);
  expect([second.items.length, second.nextCursor]).toEqual([1, null]);
  expect(await prisma.buddyActivity.count({ where: { recipientId: me.id } })).toBe(31);
});

it('the routes list and mark everything seen', async () => {
  const me = await buddyUser();
  const sam = await buddyUser();
  const pair = await pairUp(me.id, sam.id);
  await prisma.buddyActivity.create({ data: { recipientId: me.id, actorId: sam.id, kind: 'PAIRED', refId: pair.id } });
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  expect((await agent.get('/me/buddies/activity').set(headers)).body).toMatchObject({ unseen: 1, nextCursor: null });
  expect((await agent.post('/me/buddies/activity/seen').set(headers)).body).toEqual({ seen: 1 });
  const after = (await agent.get('/me/buddies/activity').set(headers)).body;
  expect([after.unseen, after.items[0].seen]).toEqual([0, true]);
});

it('backfills a visible PENDING request that has no Activity row (a lost enqueue), as a request item with only its id', async () => {
  const me = await buddyUser();
  const sam = await buddyUser({ displayName: 'Sam' });
  const req = await prisma.buddyRequest.create({ data: { fromUserId: sam.id, toUserId: me.id, createdAt: new Date(NOW.getTime() - 1000) } });
  const page = await listActivity(me.id, undefined, NOW);
  expect(page.items).toEqual([
    { id: expect.any(String), kind: 'request', createdAt: req.createdAt.toISOString(), seen: false, actor: expect.objectContaining({ id: sam.id, displayName: 'Sam' }), requestId: req.id },
  ]);
  expect(page.unseen).toBe(1);
});

it('does not backfill a PENDING request from a sender the viewer has blocked, nor a hidden one', async () => {
  const me = await buddyUser();
  const blocked = await buddyUser();
  const swallowed = await buddyUser();
  await prisma.buddyBlock.create({ data: { blockerId: me.id, blockedId: blocked.id } });
  await prisma.buddyRequest.create({ data: { fromUserId: blocked.id, toUserId: me.id, createdAt: new Date(NOW.getTime() - 1000) } });
  await prisma.buddyRequest.create({ data: { fromUserId: swallowed.id, toUserId: me.id, hidden: true, createdAt: new Date(NOW.getTime() - 1000) } });
  const page = await listActivity(me.id, undefined, NOW);
  expect([page.items, page.unseen]).toEqual([[], 0]);
  expect(await prisma.buddyActivity.count({ where: { recipientId: me.id } })).toBe(0);
});

it('request items carry no status: declined, cancelled and pending requests render identically', async () => {
  const me = await buddyUser();
  const senders = await Promise.all([buddyUser(), buddyUser(), buddyUser()]);
  const statuses = ['PENDING', 'DECLINED', 'CANCELLED'] as const;
  for (const [i, s] of senders.entries()) {
    const at = new Date(NOW.getTime() - (i + 1) * 1000);
    const req = await prisma.buddyRequest.create({ data: { fromUserId: s.id, toUserId: me.id, status: statuses[i], createdAt: at } });
    await prisma.buddyActivity.upsert({
      where: { recipientId_kind_refId: { recipientId: me.id, kind: 'REQUEST', refId: req.id } },
      create: { recipientId: me.id, actorId: s.id, kind: 'REQUEST', refId: req.id, createdAt: at },
      update: {},
    });
  }
  const page = await listActivity(me.id, undefined, NOW);
  expect(page.items.map((i) => Object.keys(i).sort())).toEqual(Array(3).fill(['actor', 'createdAt', 'id', 'kind', 'requestId', 'seen']));
});

it('rejects a malformed cursor with 400 invalid_cursor and sends no-store', async () => {
  const me = await buddyUser();
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const bad = await agent.get('/me/buddies/activity?cursor=nope').set(headers);
  expect([bad.status, bad.body.error]).toEqual([400, 'invalid_cursor']);
  const ok = await agent.get('/me/buddies/activity').set(headers);
  expect(ok.headers['cache-control']).toBe('private, no-store');
});
