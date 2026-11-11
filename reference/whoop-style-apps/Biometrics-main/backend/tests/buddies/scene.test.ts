import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { api, buddyUser, pairUp } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function checkIn(authorId: string, localDate: string, createdAt: Date) {
  return prisma.checkIn.create({ data: { authorId, localDate: civilDateToUtcMidnight(localDate), mood: 'RESTED', createdAt } });
}

async function scene(userId: string) {
  return (await api()).get('/me/buddies/scene').set(await authHeaderFor(userId));
}

it('orders buddies by their latest check-in, newest first, and returns at most two', async () => {
  const me = await buddyUser();
  const [a, b, c] = [await buddyUser({ displayName: 'Ava' }), await buddyUser({ displayName: 'Bo' }), await buddyUser({ displayName: 'Cy' })];
  await pairUp(me.id, a.id, ago(30));
  await pairUp(me.id, b.id, ago(20));
  await pairUp(me.id, c.id, ago(10));
  await checkIn(a.id, '2026-10-12', ago(600));
  await checkIn(a.id, '2026-10-13', ago(5));
  await checkIn(b.id, '2026-10-13', ago(60));
  await checkIn(c.id, '2026-10-13', ago(120));

  const res = await scene(me.id);
  expect(res.status).toBe(200);
  expect(res.body.buddies.map((r: { id: string }) => r.id)).toEqual([a.id, b.id]);
  expect(res.body.total).toBe(3);
  expect(res.body.incomingRequests).toBe(0);
});

it('an edited check-in does not move a buddy up', async () => {
  const me = await buddyUser();
  const [a, b] = [await buddyUser(), await buddyUser()];
  await pairUp(me.id, a.id, ago(30));
  await pairUp(me.id, b.id, ago(20));
  const old = await checkIn(a.id, '2026-10-13', ago(90));
  await checkIn(b.id, '2026-10-13', ago(45));
  await prisma.checkIn.update({ where: { id: old.id }, data: { mood: 'TIRED' } });

  const res = await scene(me.id);
  expect(res.body.buddies.map((r: { id: string }) => r.id)).toEqual([b.id, a.id]);
});

it('puts buddies who never checked in after, in the list order', async () => {
  const me = await buddyUser();
  const [quiet, newer, talker] = [await buddyUser(), await buddyUser(), await buddyUser()];
  await pairUp(me.id, quiet.id, ago(30));
  await pairUp(me.id, newer.id, ago(10));
  await pairUp(me.id, talker.id, ago(50));
  await checkIn(talker.id, '2026-10-13', ago(5));

  const res = await scene(me.id);
  expect(res.body.buddies.map((r: { id: string }) => r.id)).toEqual([talker.id, newer.id]);
});

it('leaves muted buddies out but still counts them', async () => {
  const me = await buddyUser();
  const [muted, other] = [await buddyUser(), await buddyUser()];
  await pairUp(me.id, muted.id, ago(30));
  await pairUp(me.id, other.id, ago(20));
  await checkIn(muted.id, '2026-10-13', ago(1));
  await prisma.buddyMute.create({ data: { muterId: me.id, mutedId: muted.id } });

  const res = await scene(me.id);
  expect(res.body.buddies.map((r: { id: string }) => r.id)).toEqual([other.id]);
  expect(res.body.total).toBe(2);
});

it('sends people, moods and flags only: no check-in time or date', async () => {
  const me = await buddyUser();
  const a = await buddyUser({ displayName: 'Ava' });
  await pairUp(me.id, a.id, ago(30));
  await checkIn(a.id, '2026-10-13', ago(5));

  const res = await scene(me.id);
  expect(Object.keys(res.body).sort()).toEqual(['buddies', 'incomingRequests', 'total']);
  expect(Object.keys(res.body.buddies[0]).sort()).toEqual(['coachId', 'displayName', 'handle', 'id', 'kipColour', 'mood', 'moodLine', 'unseenSticker']);
  expect(JSON.stringify(res.body)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
});

it('looks across all buddies, beyond the first list page', async () => {
  const me = await buddyUser();
  const oldest = await buddyUser();
  await pairUp(me.id, oldest.id, ago(10_000));
  for (let i = 0; i < 30; i++) await pairUp(me.id, (await buddyUser()).id, ago(100 - i));
  await checkIn(oldest.id, '2026-10-13', ago(1));

  const res = await scene(me.id);
  expect(res.body.buddies[0].id).toBe(oldest.id);
  expect(res.body.total).toBe(31);
});

it('counts incoming requests, and answers an empty scene for someone with no buddies', async () => {
  const me = await buddyUser();
  const asker = await buddyUser();
  await prisma.buddyRequest.create({ data: { fromUserId: asker.id, toUserId: me.id } });

  const res = await scene(me.id);
  expect(res.body).toEqual({ buddies: [], total: 0, incomingRequests: 1 });
});

it('requires auth', async () => {
  const res = await (await api()).get('/me/buddies/scene');
  expect(res.status).toBe(401);
});
