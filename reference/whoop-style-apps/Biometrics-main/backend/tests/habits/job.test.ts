import type { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { isoWeekKey, runHabitCorrelations } from '../../src/habits/job';
import { getConfirmedCorrelations } from '../../src/habits/correlations';
import { analyzeUser } from '../../src/habits/analysis';
import { runHabitCorrelationSweep } from '../../src/habits/sweep';
import {
  enqueueHabitCorrelations,
  habitCorrelationJobId,
  HABIT_CORRELATION_CRON,
  HABIT_CORRELATION_SWEEP_JOB,
  RUN_HABIT_CORRELATIONS_JOB,
  scheduleWeeklyHabitCorrelationSweep,
} from '../../src/habits/queue';
import { processSyncJob } from '../../src/sync/worker';
import { syncQueue, connection } from '../../src/sync/queue';
import { createUser, seedScenario } from './dbHelpers';
import { dateAt } from './helpers';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await syncQueue.removeJobScheduler(HABIT_CORRELATION_SWEEP_JOB).catch(() => undefined);
  await prisma.$disconnect();
  await syncQueue.close();
  await connection.quit();
});

// 90 observed habit days, 2026-04-01 .. 2026-06-28, and a "now" just after.
const START = '2026-04-01';
const NOW = new Date('2026-06-30T12:00:00Z');
const strongEffect = { start: START, days: 90, seed: 7, effect: -1.6 };

const rows = (userId: string) =>
  prisma.habitCorrelation.findMany({ where: { userId }, orderBy: [{ factor: 'asc' }, { lagDays: 'asc' }] });
const hrvLag1 = (userId: string) =>
  prisma.habitCorrelation.findUnique({
    where: { userId_habitType_factor_lagDays: { userId, habitType: 'ALCOHOL', factor: 'HRV', lagDays: 1 } },
  });

describe('isoWeekKey', () => {
  it.each([
    ['2026-09-21T12:00:00Z', '2026-W39'], // Monday
    ['2026-09-27T23:59:00Z', '2026-W39'], // Sunday, same week
    ['2026-09-28T00:00:00Z', '2026-W40'],
    ['2026-01-01T00:00:00Z', '2026-W01'], // Thursday
    ['2027-01-01T00:00:00Z', '2026-W53'], // Friday belongs to the previous ISO year
    ['2024-12-30T00:00:00Z', '2025-W01'],
  ])('%s -> %s', (iso, key) => {
    expect(isoWeekKey(new Date(iso))).toBe(key);
  });
});

describe('runHabitCorrelations: persistence rule end to end', () => {
  it('walks CANDIDATE -> CONFIRMED over two weekly runs, and only then surfaces it', async () => {
    const user = await createUser();
    await seedScenario(user.id, strongEffect);

    const first = await runHabitCorrelations(user.id, { now: NOW, runKey: '2026-W27' });
    expect(first).toMatchObject({ skipped: false });
    expect(first.passed).toBeGreaterThan(0);
    const candidate = await hrvLag1(user.id);
    expect(candidate).toMatchObject({ status: 'CANDIDATE', consecutivePasses: 1, consecutiveMisses: 0, lastRunKey: '2026-W27' });
    expect(candidate!.lastEvaluatedAt).toEqual(NOW);
    expect(candidate!.effectSizePercent).toBeLessThan(candidate!.comparisonPercent!);
    expect(candidate!.qValue).toBeLessThan(0.1);
    expect(Math.abs(candidate!.r!)).toBeGreaterThan(0.3);
    expect(await getConfirmedCorrelations(user.id)).toEqual([]);

    await runHabitCorrelations(user.id, { now: NOW, runKey: '2026-W28' });
    expect(await hrvLag1(user.id)).toMatchObject({ status: 'CONFIRMED', consecutivePasses: 2 });
    expect(await getConfirmedCorrelations(user.id)).toHaveLength(1);
  });

  // The runKey check before the writes is a read-then-act: two runs racing for
  // the same week both pass it, so the write itself has to refuse the second.
  // Racing two full runs does not reproduce the interleaving reliably (they
  // serialise), so this drives the write predicate directly, which is the part
  // the fix changed.
  it('a write stamped with this week\'s runKey cannot be advanced again by a second run', async () => {
    const user = await createUser();
    await seedScenario(user.id, strongEffect);
    await runHabitCorrelations(user.id, { now: NOW, runKey: '2026-W27' });

    const row = await hrvLag1(user.id);
    expect(row).toMatchObject({ consecutivePasses: 1, lastRunKey: '2026-W27' });

    // Exactly what a second run for the same week would attempt.
    const second = await prisma.habitCorrelation.updateMany({
      where: { id: row!.id, lastRunKey: { not: '2026-W27' } },
      data: { consecutivePasses: 2, status: 'CONFIRMED', lastEvaluatedAt: NOW, lastRunKey: '2026-W27' },
    });

    expect(second.count).toBe(0);
    expect(await hrvLag1(user.id)).toMatchObject({ status: 'CANDIDATE', consecutivePasses: 1 });
    expect(await getConfirmedCorrelations(user.id)).toEqual([]);
  });

  it('keeps a CONFIRMED row through one miss, retires it on the second, and re-confirms it after two passes', async () => {
    const user = await createUser();
    await seedScenario(user.id, strongEffect);
    await runHabitCorrelations(user.id, { now: NOW, runKey: 'w1' });
    await runHabitCorrelations(user.id, { now: NOW, runKey: 'w2' });
    expect((await hrvLag1(user.id))!.status).toBe('CONFIRMED');

    // The evidence disappears (every habit day deleted): untested reads as a miss.
    const logs = await prisma.habitLog.findMany({ where: { userId: user.id } });
    await prisma.habitLog.deleteMany({ where: { userId: user.id } });

    await runHabitCorrelations(user.id, { now: NOW, runKey: 'w3' });
    expect(await hrvLag1(user.id)).toMatchObject({ status: 'CONFIRMED', consecutiveMisses: 1, consecutivePasses: 0 });
    expect(await getConfirmedCorrelations(user.id)).toHaveLength(1); // one weak week does not erase a pattern

    await runHabitCorrelations(user.id, { now: NOW, runKey: 'w4' });
    expect(await hrvLag1(user.id)).toMatchObject({ status: 'RETIRED', consecutiveMisses: 2 });
    expect(await getConfirmedCorrelations(user.id)).toEqual([]);

    // The evidence returns: one pass is not enough, two consecutive are.
    await prisma.habitLog.createMany({ data: logs.map(({ id: _id, ...l }) => l) });
    await runHabitCorrelations(user.id, { now: NOW, runKey: 'w5' });
    expect(await hrvLag1(user.id)).toMatchObject({ status: 'RETIRED', consecutivePasses: 1 });
    expect(await getConfirmedCorrelations(user.id)).toEqual([]);
    await runHabitCorrelations(user.id, { now: NOW, runKey: 'w6' });
    expect(await hrvLag1(user.id)).toMatchObject({ status: 'CONFIRMED', consecutivePasses: 2 });
  });

  it('is idempotent per run key: repeating a week neither confirms a pattern nor counts a second miss', async () => {
    const user = await createUser();
    await seedScenario(user.id, strongEffect);

    await runHabitCorrelations(user.id, { now: NOW, runKey: '2026-W27' });
    const again = await runHabitCorrelations(user.id, { now: NOW, runKey: '2026-W27' });
    const third = await runHabitCorrelations(user.id, { now: NOW, runKey: '2026-W27' });

    expect(again).toEqual({ skipped: true, tested: 0, passed: 0 });
    expect(third.skipped).toBe(true);
    expect(await hrvLag1(user.id)).toMatchObject({ status: 'CANDIDATE', consecutivePasses: 1 });
    expect(await getConfirmedCorrelations(user.id)).toEqual([]);
  });

  it('defaults the run key to the ISO week of `now`', async () => {
    const user = await createUser();
    await seedScenario(user.id, strongEffect);
    await runHabitCorrelations(user.id, { now: NOW });
    expect((await hrvLag1(user.id))!.lastRunKey).toBe(isoWeekKey(NOW));
    expect((await runHabitCorrelations(user.id, { now: NOW })).skipped).toBe(true);
  });

  it('creates no rows for a user whose data shows nothing, and never for a user with no habit data', async () => {
    const noisy = await createUser();
    await seedScenario(noisy.id, { start: START, days: 90, seed: 99, effect: 0 });
    const empty = await createUser();

    await runHabitCorrelations(noisy.id, { now: NOW, runKey: 'a' });
    await runHabitCorrelations(empty.id, { now: NOW, runKey: 'a' });

    expect(await rows(noisy.id)).toEqual([]);
    expect(await rows(empty.id)).toEqual([]);
  });
});

describe('getConfirmedCorrelations', () => {
  it('returns exactly the structured fields the coach tool will wrap, CONFIRMED rows only', async () => {
    const user = await createUser();
    const base = {
      userId: user.id,
      habitType: 'ALCOHOL',
      lagDays: 1,
      consecutivePasses: 2,
      consecutiveMisses: 0,
      lastEvaluatedAt: new Date(),
      lastRunKey: 'x',
      r: -0.5,
      pValue: 0.001,
      qValue: 0.01,
      effectSizePercent: -14,
      comparisonPercent: 3,
      sampleSize: 11,
      direction: 'lower',
      series: { days: [], habit: [], factor: [] },
    };
    await prisma.habitCorrelation.createMany({
      data: [
        { ...base, factor: 'HRV', status: 'CONFIRMED' },
        { ...base, factor: 'RHR', status: 'CANDIDATE' },
        { ...base, factor: 'SLEEP_DURATION', status: 'RETIRED' },
        { ...base, factor: 'SLEEP_EFFICIENCY', status: 'CONFIRMED', lagDays: 2, effectSizePercent: 4, comparisonPercent: -1, direction: 'higher' },
      ],
    });

    const out = await getConfirmedCorrelations(user.id);
    expect(out).toEqual([
      {
        habitType: 'ALCOHOL',
        exposureThreshold: 2,
        exposureUnit: 'drinks',
        factor: 'HRV',
        lagDays: 1,
        effectSizePercent: -14,
        comparisonPercent: 3,
        sampleSize: 11,
        direction: 'lower',
      },
      {
        habitType: 'ALCOHOL',
        exposureThreshold: 2,
        exposureUnit: 'drinks',
        factor: 'SLEEP_EFFICIENCY',
        lagDays: 2,
        effectSizePercent: 4,
        comparisonPercent: -1,
        sampleSize: 11,
        direction: 'higher',
      },
    ]);
    // No series, no internal statistics: a pre-composed sentence is never returned either.
    for (const row of out) expect(Object.keys(row).sort()).toEqual(
      ['comparisonPercent', 'direction', 'effectSizePercent', 'exposureThreshold', 'exposureUnit', 'factor', 'habitType', 'lagDays', 'sampleSize'],
    );
  });

  it("is scoped to the user and empty for one with no rows", async () => {
    const a = await createUser();
    const b = await createUser();
    await prisma.habitCorrelation.create({
      data: {
        userId: a.id, habitType: 'ALCOHOL', factor: 'HRV', lagDays: 1, status: 'CONFIRMED', consecutivePasses: 2,
        lastEvaluatedAt: new Date(), lastRunKey: 'x', effectSizePercent: 1, comparisonPercent: 2, sampleSize: 9,
        direction: 'lower', series: {},
      },
    });
    expect(await getConfirmedCorrelations(a.id)).toHaveLength(1);
    expect(await getConfirmedCorrelations(b.id)).toEqual([]);
  });
});

describe('series used by the job', () => {
  it('never uses sleepDebtRolling14d: a perfect debt/habit relationship with no z columns produces nothing', async () => {
    const user = await createUser();
    const habit = await seedScenario(user.id, { start: START, days: 90, seed: 5, effect: 0 });
    // Overwrite the features: z columns null, sleepDebtRolling14d perfectly tracking the habit at lag 1.
    await prisma.userDailyFeatures.updateMany({ where: { userId: user.id }, data: { hrvZ: null, hrvBaselineDeviationPct: null } });
    for (let i = 0; i < 90; i++) {
      await prisma.userDailyFeatures.updateMany({
        where: { userId: user.id, date: civilDateToUtcMidnight(dateAt(START, i + 1)) },
        data: { sleepDebtRolling14d: habit[i]! * 300 },
      });
    }

    const { hypotheses } = await analyzeUser(user.id, NOW);
    expect(hypotheses).toEqual([]);
    await runHabitCorrelations(user.id, { now: NOW, runKey: 'a' });
    expect(await rows(user.id)).toEqual([]);
  });

  it('drops days the Stat Engine flagged imputed: injected z=0 imputed days do not dilute the effect', async () => {
    const user = await createUser();
    const habit = await seedScenario(user.id, { start: START, days: 90, seed: 8, effect: -1.5 });
    // Impute 60% of the post-exposure nights: value pinned to baseline (z = 0), flagged.
    let toggle = 0;
    for (let i = 0; i < 90; i++) {
      if (habit[i] !== 1 || toggle++ % 5 >= 3) continue;
      await prisma.userDailyFeatures.updateMany({
        where: { userId: user.id, date: civilDateToUtcMidnight(dateAt(START, i + 1)) },
        data: { hrvZ: 0, hrvBaselineDeviationPct: 0, hrvZImputed: true },
      });
    }
    const honoured = (await analyzeUser(user.id, NOW)).hypotheses.find((h) => h.factor === 'HRV' && h.lagDays === 1)!;
    expect(honoured.passes).toBe(true);

    // Same data with the flag cleared (i.e. ignoring it) is measurably weaker.
    await prisma.userDailyFeatures.updateMany({ where: { userId: user.id }, data: { hrvZImputed: false } });
    const ignored = (await analyzeUser(user.id, NOW)).hypotheses.find((h) => h.factor === 'HRV' && h.lagDays === 1)!;
    expect(Math.abs(ignored.r)).toBeLessThan(Math.abs(honoured.r));
    expect(honoured.sampleSize).toBeLessThan(ignored.sampleSize);
  });

  it('counts an unlogged, un-checked-in day as missing, not as unexposed', async () => {
    const user = await createUser();
    await seedScenario(user.id, strongEffect);
    // Drop every "none" log: only exposed days remain observed.
    await prisma.habitLog.deleteMany({ where: { userId: user.id, value: 0 } });

    const out = await analyzeUser(user.id, NOW);
    expect(out.hypotheses).toEqual([]);
    expect(out.notEnoughData[0]).toMatchObject({ habitType: 'ALCOHOL', unexposedDays: 0, requiredEach: 8 });

    // A check-in on those days makes them observed and unexposed, and the habit becomes testable.
    const gone = Array.from({ length: 90 }, (_, i) => dateAt(START, i));
    await prisma.habitCheckIn.createMany({ data: gone.map((d) => ({ userId: user.id, habitDay: civilDateToUtcMidnight(d) })) });
    expect((await analyzeUser(user.id, NOW)).hypotheses.length).toBeGreaterThan(0);
  });
});

describe('weekly job wiring', () => {
  it('enqueues one job per user with logs, check-ins or stored rows, under a per-week deterministic id', async () => {
    const logger = await createUser();
    const checker = await createUser();
    const rowOnly = await createUser();
    const idle = await createUser();
    await prisma.habitLog.create({
      data: { userId: logger.id, habitType: 'ALCOHOL', value: 1, unit: 'drinks', loggedAt: NOW, habitDay: civilDateToUtcMidnight('2026-06-29') },
    });
    await prisma.habitCheckIn.create({ data: { userId: checker.id, habitDay: civilDateToUtcMidnight('2026-06-29') } });
    await prisma.habitCorrelation.create({
      data: {
        userId: rowOnly.id, habitType: 'ALCOHOL', factor: 'HRV', lagDays: 1, status: 'CONFIRMED',
        lastEvaluatedAt: NOW, lastRunKey: 'old', sampleSize: 0,
      },
    });

    const added: { name: string; data: any; opts: any }[] = [];
    const queue = { add: (async (name: string, data: any, opts: any) => void added.push({ name, data, opts })) as any };
    const summary = await runHabitCorrelationSweep({ queue, now: NOW });

    const mine = added.filter((a) => [logger.id, checker.id, rowOnly.id, idle.id].includes(a.data.userId));
    expect(mine.map((a) => a.data.userId).sort()).toEqual([logger.id, checker.id, rowOnly.id].sort());
    expect(summary.usersEnqueued).toBeGreaterThanOrEqual(3);
    for (const a of mine) {
      expect(a.name).toBe(RUN_HABIT_CORRELATIONS_JOB);
      expect(a.data.runKey).toBe('2026-W27');
      expect(a.opts.jobId).toBe(habitCorrelationJobId(a.data.userId, '2026-W27'));
      expect(a.opts.jobId).not.toContain(':');
    }
  });

  it('uses one job id per user+week so a repeated sweep collapses in BullMQ', async () => {
    expect(habitCorrelationJobId('u', '2026-W27')).toBe(habitCorrelationJobId('u', '2026-W27'));
    expect(habitCorrelationJobId('u', '2026-W27')).not.toBe(habitCorrelationJobId('u', '2026-W28'));
    expect(habitCorrelationJobId('u', '2026-W27')).not.toBe(habitCorrelationJobId('v', '2026-W27'));

    const userId = randomUUID();
    const first = await enqueueHabitCorrelations(userId, '2026-W27');
    const second = await enqueueHabitCorrelations(userId, '2026-W27');
    try {
      expect(second.id).toBe(first.id);
    } finally {
      await first.remove().catch(() => undefined);
    }
  });

  it('registers a weekly repeatable scheduler, injectable and idempotent', async () => {
    const upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
    await scheduleWeeklyHabitCorrelationSweep({ upsertJobScheduler } as any);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      HABIT_CORRELATION_SWEEP_JOB,
      { pattern: HABIT_CORRELATION_CRON },
      { name: HABIT_CORRELATION_SWEEP_JOB },
    );
    // Weekly: day-of-week field is fixed, day-of-month and month are wildcards.
    const [, , dayOfMonth, month, dayOfWeek] = HABIT_CORRELATION_CRON.split(' ');
    expect([dayOfMonth, month]).toEqual(['*', '*']);
    expect(dayOfWeek).toMatch(/^[0-6]$/);

    await scheduleWeeklyHabitCorrelationSweep();
    await scheduleWeeklyHabitCorrelationSweep();
    const schedulers = await syncQueue.getJobSchedulers();
    const mine = schedulers.filter((s) => s.key === HABIT_CORRELATION_SWEEP_JOB);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.pattern).toBe(HABIT_CORRELATION_CRON);
  });

  it('the worker dispatches the per-user job to runHabitCorrelations with its run key', async () => {
    const user = await createUser();
    // The worker runs on the real clock, so this scenario ends shortly before today.
    const start = dateAt(new Date().toISOString().slice(0, 10), -100);
    await seedScenario(user.id, { ...strongEffect, start });
    const job = { name: RUN_HABIT_CORRELATIONS_JOB, data: { userId: user.id, runKey: 'worker-run' } } as Job;

    await processSyncJob(job);
    expect((await hrvLag1(user.id))?.lastRunKey).toBe('worker-run');
    await processSyncJob(job); // BullMQ retry of the same job: no double count
    expect(await hrvLag1(user.id)).toMatchObject({ status: 'CANDIDATE', consecutivePasses: 1 });
  });
});
