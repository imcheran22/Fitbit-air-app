import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { storeSleepSessions } from '../../src/biometrics/repository';
import { enqueueScoreCompute } from '../../src/scoring/queue';
import { testServer } from '../helpers/server';

// The route asks for score recomputes; those would otherwise go to a real Redis
// queue and leave delayed jobs behind. The enqueue itself is asserted below.
jest.mock('../../src/scoring/queue', () => ({
  COMPUTE_DAILY_SCORE_JOB: 'computeDailyScore',
  SCORE_SWEEP_JOB: 'scoreSweep',
  enqueueScoreCompute: jest.fn().mockResolvedValue(undefined),
}));

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createUser() {
  return prisma.user.create({
    data: { email: `tz-${randomUUID()}@example.com`, name: 'Test User'},
  });
}

describe('PUT /me/timezone', () => {
  it('defaults a new user to UTC', async () => {
    const user = await createUser();
    expect(user.timezone).toBe('UTC');
  });

  // The rollups are re-keyed under the new zone, so every score built on one is
  // stale. Waiting for the nightly sweep meant a day of scores computed against
  // the old day boundaries.
  it('asks for a score recompute on every re-keyed day', async () => {
    (enqueueScoreCompute as jest.Mock).mockClear();
    const user = await createUser();
    const authHeader = await authHeaderFor(user.id);
    await storeSleepSessions(user.id, [
      { startTime: new Date('2026-09-01T22:00:00Z'), endTime: new Date('2026-09-02T06:00:00Z'), minutesAsleep: 420, startUtcOffsetSeconds: null, endUtcOffsetSeconds: null },
    ]);
    (enqueueScoreCompute as jest.Mock).mockClear();

    const res = await request(await testServer(createApp()))
      .put('/me/timezone')
      .set(authHeader)
      .send({ timezone: 'America/Los_Angeles' });

    expect(res.status).toBe(200);
    expect(enqueueScoreCompute).toHaveBeenCalled();
    const dates = (enqueueScoreCompute as jest.Mock).mock.calls.map((c) => c[1]);
    expect(dates.length).toBeGreaterThan(0);
    expect((enqueueScoreCompute as jest.Mock).mock.calls.every((c) => c[0] === user.id)).toBe(true);
  });

  it('stores a valid IANA zone and echoes it back', async () => {
    const user = await createUser();
    const authHeader = await authHeaderFor(user.id);

    const res = await request(await testServer(createApp()))
      .put('/me/timezone')
      .set(authHeader)
      .send({ timezone: 'America/Los_Angeles' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ timezone: 'America/Los_Angeles' });
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.timezone).toBe('America/Los_Angeles');
  });

  it.each([
    ['an unknown zone', { timezone: 'Mars/Olympus_Mons' }],
    ['an empty string', { timezone: '' }],
    ['a UTC offset, which is not an IANA name', { timezone: '+05:00' }],
    ['a non-string', { timezone: 42 }],
    ['a missing field', {}],
  ])('rejects %s with 400 and leaves the stored zone alone', async (_label, body) => {
    const user = await createUser();
    const authHeader = await authHeaderFor(user.id);

    const res = await request(await testServer(createApp())).put('/me/timezone').set(authHeader).send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.timezone).toBe('UTC');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(await testServer(createApp())).put('/me/timezone').send({ timezone: 'UTC' });
    expect(res.status).toBe(401);
  });

  it('recomputes the SLEEP rollups when the timezone changes', async () => {
    const user = await createUser();
    // Ends 05:30Z Sep 3: UTC date Sep 3, Los Angeles date Sep 2.
    await storeSleepSessions(user.id, [
      { startTime: new Date('2026-09-02T20:00:00Z'), endTime: new Date('2026-09-03T05:30:00Z'), minutesAsleep: 500 },
    ]);
    const dates = async () =>
      (await prisma.biometricRecord.findMany({ where: { userId: user.id, metricType: 'SLEEP' } })).map((r) =>
        r.recordedAt.toISOString().slice(0, 10),
      );
    expect(await dates()).toEqual(['2026-09-03']);
    const authHeader = await authHeaderFor(user.id);

    await request(await testServer(createApp()))
      .put('/me/timezone')
      .set(authHeader)
      .send({ timezone: 'America/Los_Angeles' })
      .expect(200);

    expect(await dates()).toEqual(['2026-09-02']);
  });

  it('leaves sessions that carry their own UTC offset where the offset puts them, moving only the rest', async () => {
    const user = await createUser();
    await storeSleepSessions(user.id, [
      // No offset: follows the zone (UTC Sep 3, Los Angeles Sep 2).
      { startTime: new Date('2026-09-02T20:00:00Z'), endTime: new Date('2026-09-03T05:30:00Z'), minutesAsleep: 500 },
      // Offset +09:00: ends 22:00Z Sep 5 = Sep 6 local, whatever the zone is.
      {
        startTime: new Date('2026-09-05T14:00:00Z'),
        endTime: new Date('2026-09-05T22:00:00Z'),
        minutesAsleep: 430,
        startUtcOffsetSeconds: 32400,
        endUtcOffsetSeconds: 32400,
      },
    ]);
    const authHeader = await authHeaderFor(user.id);

    await request(await testServer(createApp()))
      .put('/me/timezone')
      .set(authHeader)
      .send({ timezone: 'America/Los_Angeles' })
      .expect(200);

    const rows = await prisma.biometricRecord.findMany({
      where: { userId: user.id, metricType: 'SLEEP' },
      orderBy: { recordedAt: 'asc' },
    });
    expect(rows.map((r) => [r.recordedAt.toISOString().slice(0, 10), r.value])).toEqual([
      ['2026-09-02', 500],
      ['2026-09-06', 430],
    ]);
  });

  it('is idempotent: repeating the same PUT leaves the rollups unchanged (and repairs a half-finished one)', async () => {
    const user = await createUser();
    await storeSleepSessions(user.id, [
      { startTime: new Date('2026-09-02T20:00:00Z'), endTime: new Date('2026-09-03T05:30:00Z'), minutesAsleep: 500 },
    ]);
    const authHeader = await authHeaderFor(user.id);
    const putExpecting200 = async () =>
      request(await testServer(createApp())).put('/me/timezone').set(authHeader).send({ timezone: 'America/Los_Angeles' }).expect(200);

    await putExpecting200();
    await putExpecting200();

    const rows = await prisma.biometricRecord.findMany({ where: { userId: user.id, metricType: 'SLEEP' } });
    expect(rows.map((r) => [r.recordedAt.toISOString().slice(0, 10), r.value])).toEqual([['2026-09-02', 500]]);
  });
});
