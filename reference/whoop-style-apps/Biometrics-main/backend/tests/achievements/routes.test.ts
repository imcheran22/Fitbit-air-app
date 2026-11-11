import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { createUser, daysAgo, todayUtc } from '../coach/helpers';
import { seedNight } from '../recap/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await connection.quit();
  await prisma.$disconnect();
});

const day = civilDateToUtcMidnight;
const server = async () => request(await testServer(createApp()));
type Body = { families: Array<{ family: string; level: number; current: number }>; uncelebrated: Array<{ id: string; family: string; level: number; value: number; earnedOn: string }> };
const family = (body: Body, f: string) => body.families.find((x) => x.family === f);

async function startedUser() {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { achievementsSince: day(daysAgo(10)) } });
  return user;
}

it('requires a session', async () => {
  expect((await (await server()).get('/me/achievements')).status).toBe(401);
  expect((await (await server()).post('/me/achievements/celebrated').send({ ids: [] })).status).toBe(401);
});

it('starts a new user today on the first load and answers every family locked', async () => {
  const user = await createUser();
  const res = await (await server()).get('/me/achievements').set(await authHeaderFor(user.id));
  expect(res.status).toBe(200);
  expect(res.headers['cache-control']).toBe('private, no-store');
  expect(res.body.since).toBe(todayUtc());
  expect(res.body.families).toHaveLength(7);
  expect(res.body.families[0]).toEqual({ family: 'SLEEP_GOAL', kind: 'streak', level: 0, thresholds: [3, 7, 14, 30, 100], levels: [], current: 0, best: 0, nextThreshold: 3 });
  expect(res.body.uncelebrated).toEqual([]);
  expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(2);
});

it("starts a user whose zone was synced first on their own local date, not UTC's", async () => {
  // 20:00 UTC on Oct 6 is already Oct 7 in Auckland (NZDT, UTC+13). The app waits for its sign-in
  // time zone sync before the first badge load; pin only Date so Prisma and supertest keep real timers.
  jest.useFakeTimers({
    now: new Date('2026-10-06T20:00:00Z'),
    doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
  });
  try {
    const user = await createUser();
    const h = await authHeaderFor(user.id);
    expect((await (await server()).put('/me/timezone').set(h).send({ timezone: 'Pacific/Auckland' })).status).toBe(200);
    const res = await (await server()).get('/me/achievements').set(h);
    expect(res.body.since).toBe('2026-10-07');
    const after = await prisma.user.findUnique({ where: { id: user.id }, select: { achievementsSince: true } });
    expect(after?.achievementsSince).toEqual(day('2026-10-07'));

    // The same instant for a user still on the UTC default is Oct 6: the race this guards against.
    const utc = await createUser();
    const utcRes = await (await server()).get('/me/achievements').set(await authHeaderFor(utc.id));
    expect(utcRes.body.since).toBe('2026-10-06');
  } finally {
    jest.useRealTimers();
  }
});

it('evaluates inline at most once per 10 minutes, and a check-in clears the bound', async () => {
  const user = await startedUser();
  await seedNight(user.id, daysAgo(3), { minutes: 500 });
  await seedNight(user.id, daysAgo(2), { minutes: 500 });
  const h = await authHeaderFor(user.id);
  const first = await (await server()).get('/me/achievements').set(h);
  expect(family(first.body, 'SLEEP_GOAL')).toMatchObject({ level: 0, current: 2 });

  await seedNight(user.id, daysAgo(1), { minutes: 500 });
  const cached = await (await server()).get('/me/achievements').set(h);
  expect(family(cached.body, 'SLEEP_GOAL')).toMatchObject({ level: 0, current: 2 });

  await (await server()).post('/me/habits/check-ins').set(h).send({});
  const fresh = await (await server()).get('/me/achievements').set(h);
  expect(family(fresh.body, 'SLEEP_GOAL')).toMatchObject({ level: 1, current: 3 });
  expect(fresh.body.uncelebrated).toEqual([expect.objectContaining({ family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: daysAgo(1) })]);
});

it('a goal save clears the bound too', async () => {
  const user = await startedUser();
  await seedNight(user.id, daysAgo(3), { minutes: 500 });
  await seedNight(user.id, daysAgo(2), { minutes: 500 });
  const h = await authHeaderFor(user.id);
  await (await server()).get('/me/achievements').set(h);
  await seedNight(user.id, daysAgo(1), { minutes: 500 });
  expect((await (await server()).put('/me/sleep/goal').set(h).send({ wakeGoal: '07:00' })).status).toBe(200);
  const fresh = await (await server()).get('/me/achievements').set(h);
  expect(family(fresh.body, 'SLEEP_GOAL')).toMatchObject({ level: 1, current: 3 });
});

it("marks only the caller's own levels celebrated, ignoring unknown ids", async () => {
  const user = await startedUser();
  for (const n of [3, 2, 1]) await seedNight(user.id, daysAgo(n), { minutes: 500 });
  const h = await authHeaderFor(user.id);
  const first = await (await server()).get('/me/achievements').set(h);
  const mine = first.body.uncelebrated[0].id as string;
  const other = await startedUser();
  const theirs = await prisma.achievement.create({
    data: { userId: other.id, family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: day(daysAgo(1)), weekStart: day(daysAgo(1)), monthStart: day(daysAgo(1)) },
  });

  const res = await (await server()).post('/me/achievements/celebrated').set(h).send({ ids: [mine, theirs.id, '00000000-0000-4000-8000-000000000000'] });

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ celebrated: 1 });
  expect((await (await server()).get('/me/achievements').set(h)).body.uncelebrated).toEqual([]);
  expect((await prisma.achievement.findUniqueOrThrow({ where: { id: theirs.id } })).celebratedAt).toBeNull();
});

it('rejects a celebrated body that is not a short list of ids', async () => {
  const h = await authHeaderFor((await startedUser()).id);
  const many = Array(51).fill('00000000-0000-4000-8000-000000000000');
  for (const body of [{}, { ids: [] }, { ids: 'x' }, { ids: ['not-a-uuid'] }, { ids: many }]) {
    const res = await (await server()).post('/me/achievements/celebrated').set(h).send(body);
    expect([res.status, res.body]).toEqual([400, { error: 'invalid_ids' }]);
  }
});
