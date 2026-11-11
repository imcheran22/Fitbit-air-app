import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { enqueueScoreCompute } from '../../src/scoring/queue';
import { localCivilDateOrUtc } from '../../src/biometrics/civilDate';
import { parseSleepGoalPatch, updateSleepGoal } from '../../src/users/goals';
import { createUser } from '../scoring/dbHelpers';

// A goal change asks for today's rescore; that would otherwise go to a real
// Redis queue and leave a delayed job behind. The enqueue itself is asserted below.
jest.mock('../../src/scoring/queue', () => ({
  COMPUTE_DAILY_SCORE_JOB: 'computeDailyScore',
  SCORE_SWEEP_JOB: 'scoreSweep',
  enqueueScoreCompute: jest.fn().mockResolvedValue(undefined),
}));

const enqueue = enqueueScoreCompute as jest.Mock;

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

beforeEach(() => {
  enqueue.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function put(userId: string, body: unknown) {
  return request(await testServer(createApp()))
    .put('/me/sleep/goal')
    .set(await authHeaderFor(userId))
    .send(body as object);
}

describe('GET /me/sleep/goal', () => {
  it('returns the defaults for a new user', async () => {
    const user = await createUser();
    const res = await request(await testServer(createApp())).get('/me/sleep/goal').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
  });
});

describe('PUT /me/sleep/goal', () => {
  it('saves a valid sleep goal and returns the saved goal', async () => {
    const user = await createUser();
    const res = await put(user.id, { sleepGoalMinutes: 450 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sleepGoalMinutes: 450, bedtimeGoal: null, wakeGoal: null });
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.sleepGoalMinutes).toBe(450);
  });

  it.each([
    ['below 240', { sleepGoalMinutes: 239 }],
    ['above 720', { sleepGoalMinutes: 721 }],
    ['a non-integer', { sleepGoalMinutes: 450.5 }],
    ['bedtime 24:00', { bedtimeGoal: '24:00' }],
    ['an unpadded hour', { bedtimeGoal: '7:00' }],
    ['an empty body', {}],
    ['a numeric wake goal', { wakeGoal: 7 }],
  ])('rejects %s with 400 invalid_goal and saves nothing', async (_label, body) => {
    const user = await createUser();
    const res = await put(user.id, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_goal' });
    const saved = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    expect(saved.sleepGoalMinutes).toBe(480);
    expect(saved.bedtimeGoal).toBeNull();
    expect(saved.wakeGoal).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('accepts the 240 and 720 bounds', () => {
    expect(parseSleepGoalPatch({ sleepGoalMinutes: 240 })).toEqual({ sleepGoalMinutes: 240 });
    expect(parseSleepGoalPatch({ sleepGoalMinutes: 720 })).toEqual({ sleepGoalMinutes: 720 });
    expect(parseSleepGoalPatch(null)).toBeNull();
    expect(parseSleepGoalPatch([])).toBeNull();
  });

  it('sets and then clears the bedtime goal with null', async () => {
    const user = await createUser();
    const set = await put(user.id, { bedtimeGoal: '23:30' });
    expect(set.status).toBe(200);
    expect(set.body.bedtimeGoal).toBe('23:30');

    const cleared = await put(user.id, { bedtimeGoal: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.bedtimeGoal).toBeNull();
  });

  it("enqueues exactly one rescore, for the user's local today, when the sleep goal changes", async () => {
    const user = await createUser({ timezone: 'Pacific/Kiritimati' });
    const res = await put(user.id, { sleepGoalMinutes: 420 });
    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [userId, date, opts] = enqueue.mock.calls[0]!;
    expect(userId).toBe(user.id);
    // Not the 5-minute webhook debounce: the user is looking at the score they just changed.
    expect(opts).toEqual({ delayMs: 0 });
    // Compared against the zone's today (UTC+14), which differs from UTC's for much of the day.
    expect([localCivilDateOrUtc(new Date(Date.now() - 60_000), 'Pacific/Kiritimati'), localCivilDateOrUtc(new Date(), 'Pacific/Kiritimati')]).toContain(date);
  });

  // Review Focus 3: bedtime and wake goals never affect scoring.
  it('enqueues nothing when only the bedtime and wake goals change', async () => {
    const user = await createUser();
    const res = await put(user.id, { bedtimeGoal: '23:00', wakeGoal: '07:00' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sleepGoalMinutes: 480, bedtimeGoal: '23:00', wakeGoal: '07:00' });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('enqueues nothing when the sleep goal is set to its current value', async () => {
    const user = await createUser({ sleepGoalMinutes: 450 });
    const res = await put(user.id, { sleepGoalMinutes: 450 });
    expect(res.status).toBe(200);
    expect(enqueue).not.toHaveBeenCalled();
  });

  // requireAuth already 401s a deleted user's token (sessions go with the user),
  // so the route's 404 is the race where the user goes between the two; the
  // helper's null is what drives it.
  it('updateSleepGoal returns null for a missing user', async () => {
    expect(await updateSleepGoal('00000000-0000-0000-0000-000000000000', { sleepGoalMinutes: 450 })).toBeNull();
  });
});
