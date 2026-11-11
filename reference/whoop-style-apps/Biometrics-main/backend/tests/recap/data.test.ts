import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../coach/helpers';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { hasNewerInputs, loadRecapData, recapDataRange, scoresCaughtUp } from '../../src/recap/data';
import { computeRecapStats } from '../../src/recap/stats';
import { seedNight, seedNights } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const session = (userId: string, start: string, end: string, minutesAsleep: number) =>
  prisma.sleepSession.create({
    data: { userId, startTime: new Date(start), endTime: new Date(end), minutesAsleep, startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 },
  });

describe('loadRecapData', () => {
  it('reads sleep, steps, both scores and the main-session bedtime by civil date', async () => {
    const user = await createUser();
    await seedNight(user.id, '2026-10-01', { minutes: 455, bedtime: '22:00', sleepScore: 81, recovery: 64.5, steps: 9120 });
    const data = await loadRecapData(user.id, 'UTC', '2026-09-28', '2026-10-04');
    expect(data.get('2026-10-01')).toEqual({ sleepMinutes: 455, steps: 9120, sleepScore: 81, recovery: 64.5, bedtime: 600 });
  });

  it('leaves out zero rollups, null scores and dates outside the range', async () => {
    const user = await createUser();
    await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', value: 0, recordedAt: civilDateToUtcMidnight('2026-10-02') } });
    await prisma.dailyScore.create({
      data: { userId: user.id, date: civilDateToUtcMidnight('2026-10-02'), type: 'RECOVERY', algorithmVersion: 'v', score: null, confidenceLevel: 'LOW', factors: [] },
    });
    await seedNight(user.id, '2026-10-06', { minutes: 400 });
    const data = await loadRecapData(user.id, 'UTC', '2026-09-28', '2026-10-04');
    expect(data.get('2026-10-02')).toBeUndefined();
    expect(data.has('2026-10-06')).toBe(false);
  });

  it('reads an after-midnight bedtime as late (01:00 → 780), after a 23:30 one (690)', async () => {
    const user = await createUser();
    await seedNight(user.id, '2026-10-02', { minutes: 400, bedtime: '01:00' });
    await seedNight(user.id, '2026-10-03', { minutes: 400, bedtime: '23:30' });
    const data = await loadRecapData(user.id, 'UTC', '2026-09-28', '2026-10-04');
    expect(data.get('2026-10-02')?.bedtime).toBe(780);
    expect(data.get('2026-10-03')?.bedtime).toBe(690);
  });

  it('takes the bedtime from the main session (most minutes asleep), not an earlier shorter one', async () => {
    const user = await createUser();
    await seedNight(user.id, '2026-10-02', { minutes: 420, bedtime: '23:15' });
    // Same night (ends 10-02 at 00:30), started earlier, fewer minutes asleep: not the main session.
    await session(user.id, '2026-10-01T21:00:00Z', '2026-10-02T00:30:00Z', 60);
    const data = await loadRecapData(user.id, 'UTC', '2026-09-28', '2026-10-04');
    expect(data.get('2026-10-02')?.bedtime).toBe(675);
  });

  it('sets a bedtime only on dates with a positive SLEEP rollup', async () => {
    const user = await createUser();
    // A night ending 10-02 whose rollup is 0, and one ending 10-03 with no rollup (only steps).
    await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', value: 0, recordedAt: civilDateToUtcMidnight('2026-10-02') } });
    await session(user.id, '2026-10-01T22:00:00Z', '2026-10-02T06:00:00Z', 450);
    await session(user.id, '2026-10-02T22:00:00Z', '2026-10-03T06:00:00Z', 450);
    await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'STEPS', value: 5000, recordedAt: civilDateToUtcMidnight('2026-10-03') } });
    const data = await loadRecapData(user.id, 'UTC', '2026-09-28', '2026-10-04');
    expect(data.has('2026-10-02')).toBe(false);
    expect(data.get('2026-10-03')).toEqual({ steps: 5000 });
  });

  it("keys the night and reads the bedtime at the session's own offsets, not the user's zone", async () => {
    const user = await createUser();
    // 22:30–23:50 at −05:00 on Sep 30 is 12:30–13:50 Oct 1 in Tokyo (+09:00).
    await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', value: 75, recordedAt: civilDateToUtcMidnight('2026-09-30') } });
    await prisma.sleepSession.create({
      data: {
        userId: user.id,
        startTime: new Date('2026-10-01T03:30:00Z'),
        endTime: new Date('2026-10-01T04:50:00Z'),
        minutesAsleep: 75,
        startUtcOffsetSeconds: -5 * 3600,
        endUtcOffsetSeconds: -5 * 3600,
      },
    });
    const data = await loadRecapData(user.id, 'Asia/Tokyo', '2026-09-28', '2026-10-04');
    expect(data.get('2026-09-30')).toEqual({ sleepMinutes: 75, bedtime: 630 });
    expect(data.has('2026-10-01')).toBe(false);
  });
});

describe('recapDataRange', () => {
  it('covers the previous week for a WEEK and every month since the first night for a MONTH', async () => {
    const user = await createUser();
    await seedNight(user.id, '2026-05-14', { minutes: 400 });
    expect(await recapDataRange(user.id, 'WEEK', '2026-09-28')).toEqual({ from: '2026-09-21', to: '2026-10-04' });
    expect(await recapDataRange(user.id, 'MONTH', '2026-09-01')).toEqual({ from: '2026-05-01', to: '2026-09-30' });
    const fresh = await createUser();
    expect(await recapDataRange(fresh.id, 'MONTH', '2026-09-01')).toEqual({ from: '2026-08-01', to: '2026-09-30' });
  });

  it('starts a MONTH range at the first positive SLEEP rollup, skipping zero rollups', async () => {
    const user = await createUser();
    await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', value: 0, recordedAt: civilDateToUtcMidnight('2026-01-10') } });
    await seedNight(user.id, '2026-04-20', { minutes: 400 });
    expect(await recapDataRange(user.id, 'MONTH', '2026-09-01')).toEqual({ from: '2026-04-01', to: '2026-09-30' });
  });

  it('loads enough history for the steadiest-month milestone (3 earlier eligible months)', async () => {
    const user = await createUser();
    // June–August: bedtimes alternate 22:00 / 23:30 (spread 45); September: all 22:30 (spread 0).
    for (const month of ['2026-06-01', '2026-07-01', '2026-08-01']) {
      await seedNights(user.id, month, Array<number>(8).fill(420), (i) => ({ bedtime: i % 2 === 0 ? '22:00' : '23:30' }));
    }
    await seedNights(user.id, '2026-09-01', Array<number>(8).fill(420));
    const { from, to } = await recapDataRange(user.id, 'MONTH', '2026-09-01');
    expect(from).toBe('2026-06-01');
    const stats = computeRecapStats('MONTH', '2026-09-01', await loadRecapData(user.id, 'UTC', from, to), 420);
    expect(stats.milestones?.steadiestMonth).toEqual({ spreadMinutes: 0 });
  });
});

describe('freshness', () => {
  it('sees a SLEEP/STEPS syncedAt or a score updatedAt newer than the build, inside the period only', async () => {
    const user = await createUser();
    await seedNight(user.id, '2026-10-01', { minutes: 455, recovery: 60 });
    const builtAt = new Date('2026-10-05T09:00:00Z');
    expect(await hasNewerInputs(user.id, '2026-09-28', '2026-10-04', builtAt)).toBe(false);
    await seedNight(user.id, '2026-10-07', { minutes: 455, syncedAt: new Date('2026-10-05T10:00:00Z') });
    expect(await hasNewerInputs(user.id, '2026-09-28', '2026-10-04', builtAt)).toBe(false);
    await prisma.biometricRecord.updateMany({ where: { userId: user.id, metricType: 'SLEEP', recordedAt: civilDateToUtcMidnight('2026-10-01') }, data: { syncedAt: new Date('2026-10-05T10:00:00Z') } });
    expect(await hasNewerInputs(user.id, '2026-09-28', '2026-10-04', builtAt)).toBe(true);
  });

  it('sees a newer score updatedAt on its own', async () => {
    const user = await createUser();
    await seedNight(user.id, '2026-10-01', { minutes: 455, recovery: 60, scoredAt: new Date('2026-10-05T10:00:00Z') });
    expect(await hasNewerInputs(user.id, '2026-09-28', '2026-10-04', new Date('2026-10-05T09:00:00Z'))).toBe(true);
  });

  it('is not caught up while a night with a positive SLEEP rollup has no SLEEP score yet', async () => {
    const user = await createUser();
    await seedNight(user.id, '2026-10-01', { minutes: 455, sleepScore: 80, recovery: 60 });
    // Zero and absent rollups expect no score, so they never block.
    await prisma.biometricRecord.create({ data: { userId: user.id, metricType: 'SLEEP', value: 0, recordedAt: civilDateToUtcMidnight('2026-10-02') } });
    expect(await scoresCaughtUp(user.id, '2026-09-28', '2026-10-04')).toBe(true);
    // A late night synced before its debounced score exists: blocks, even with only RECOVERY.
    await seedNight(user.id, '2026-10-03', { minutes: 430, recovery: 55 });
    expect(await scoresCaughtUp(user.id, '2026-09-28', '2026-10-04')).toBe(false);
    await prisma.dailyScore.create({
      data: { userId: user.id, date: civilDateToUtcMidnight('2026-10-03'), type: 'SLEEP', algorithmVersion: 'v-test', score: 70, confidenceLevel: 'HIGH', factors: [], updatedAt: new Date('2026-10-05T07:00:00Z') },
    });
    expect(await scoresCaughtUp(user.id, '2026-09-28', '2026-10-04')).toBe(true);
  });

  it('a STEPS-only resync is newer input but leaves scoresCaughtUp alone', async () => {
    const user = await createUser();
    await seedNight(user.id, '2026-10-01', { minutes: 455, sleepScore: 80, steps: 8000 });
    const builtAt = new Date('2026-10-05T09:00:00Z');
    expect(await hasNewerInputs(user.id, '2026-09-28', '2026-10-04', builtAt)).toBe(false);
    await prisma.biometricRecord.updateMany({ where: { userId: user.id, metricType: 'STEPS' }, data: { syncedAt: new Date('2026-10-05T10:00:00Z') } });
    expect(await hasNewerInputs(user.id, '2026-09-28', '2026-10-04', builtAt)).toBe(true);
    expect(await scoresCaughtUp(user.id, '2026-09-28', '2026-10-04')).toBe(true);
  });

  it('waits until every scored date was scored after its SLEEP rollup last synced', async () => {
    const user = await createUser();
    // Seeded rollups sync at SYNCED (06:00) and are scored at SCORED (06:30).
    await seedNight(user.id, '2026-10-01', { minutes: 455, sleepScore: 80, recovery: 60 });
    expect(await scoresCaughtUp(user.id, '2026-09-28', '2026-10-04')).toBe(true);
    await prisma.biometricRecord.updateMany({ where: { userId: user.id, metricType: 'SLEEP', recordedAt: civilDateToUtcMidnight('2026-10-01') }, data: { syncedAt: new Date('2026-10-05T07:00:00Z') } });
    expect(await scoresCaughtUp(user.id, '2026-09-28', '2026-10-04')).toBe(false);
    await prisma.dailyScore.updateMany({ where: { userId: user.id }, data: { updatedAt: new Date('2026-10-05T07:00:00Z') } });
    expect(await scoresCaughtUp(user.id, '2026-09-28', '2026-10-04')).toBe(true);
  });
});
