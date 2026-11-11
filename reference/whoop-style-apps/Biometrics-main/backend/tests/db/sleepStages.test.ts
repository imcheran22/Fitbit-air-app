import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../coach/helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

it('stores stages under a session and deletes them with it', async () => {
  const user = await createUser();
  const session = await prisma.sleepSession.create({
    data: {
      userId: user.id, startTime: new Date('2026-09-30T23:00:00Z'), endTime: new Date('2026-10-01T07:00:00Z'), minutesAsleep: 420,
      sleepType: 'STAGES', mainSleep: true, minutesInSleepPeriod: 480, deepMinutes: 80, lightMinutes: 240, remMinutes: 100, awakeMinutes: 60,
      stages: { create: [{ type: 'LIGHT', startTime: new Date('2026-09-30T23:10:00Z'), endTime: new Date('2026-09-30T23:40:00Z') }] },
    },
  });
  expect(await prisma.sleepStage.count({ where: { sessionId: session.id } })).toBe(1);
  await prisma.sleepSession.delete({ where: { id: session.id } });
  expect(await prisma.sleepStage.count({ where: { sessionId: session.id } })).toBe(0);
});

it('adds nullable bedtime and wake goals and a stage backfill marker', async () => {
  const created = await createUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id }, select: { bedtimeGoal: true, wakeGoal: true } });
  expect(user).toEqual({ bedtimeGoal: null, wakeGoal: null });
  const conn = await prisma.healthConnection.create({
    data: {
      userId: created.id,
      healthUserId: `stages-${randomUUID()}`,
      encryptedAccessToken: 'x',
      encryptedRefreshToken: 'x',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    },
  });
  expect(conn.sleepStagesBackfilledAt).toBeNull();
});
