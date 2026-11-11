// backend/tests/coach/daySummaryJob.test.ts
import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { migrateTestDb } from '../setupTestDb';
import { COACH_CONSENT_VERSION, COACH_HOSTED_CONSENT_VERSION } from '../../src/coach/consent';
import { summaryEngineDeps } from '../../src/coach/answer/today';
import { NoopCoachTelemetry } from '../../src/coach/telemetry';
import { QueueEvents } from 'bullmq';
import {
  COACH_DAY_SUMMARY_JOB,
  COACH_SUMMARY_QUEUE,
  coachSummaryQueue,
  daySummaryJobId,
  refreshDaySummaryAfterScore,
  runDaySummaryJob,
  startDaySummaryWorker,
} from '../../src/coach/daySummaryJob';
import { getSummaryConcurrency } from '../../src/coach/config';
import type { FactSheet } from '../../src/coach/answer/facts';
import type { CoachModelProvider } from '../../src/coach/model/provider';
import { FakeClock, createUser } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await coachSummaryQueue.close();
  await prisma.$disconnect();
  await connection.quit();
});

let savedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.COACH_ENABLED;
  process.env.COACH_ENABLED = 'true';
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.COACH_ENABLED;
  else process.env.COACH_ENABLED = savedFlag;
  jest.restoreAllMocks();
});

const NOW = new Date('2026-09-30T12:00:00Z');

function fakeQueue(fail = false, { active = false } = {}) {
  const add = jest.fn(async (..._args: unknown[]) => {
    if (fail) throw new Error('redis down');
    return {};
  });
  // The day's job, as BullMQ holds it: absent, or there and running.
  const getJob = jest.fn(async (_id: string) => (active ? { isActive: async () => true } : undefined));
  return { queue: { add, getJob } as never, add, getJob };
}

async function consentedUser(timezone = 'UTC') {
  const user = await createUser({ timezone });
  await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
  return user;
}

describe('refreshDaySummaryAfterScore', () => {
  it("queues one summary job, keyed by user and day, when today's scores land", async () => {
    const user = await consentedUser();
    const { queue, add } = fakeQueue();

    expect(await refreshDaySummaryAfterScore(user.id, '2026-09-30', { queue, now: () => NOW })).toBe(true);

    expect(add).toHaveBeenCalledWith(
      COACH_DAY_SUMMARY_JOB,
      { userId: user.id, date: '2026-09-30' },
      { jobId: daySummaryJobId(user.id, '2026-09-30'), removeOnComplete: true, removeOnFail: true, attempts: 1 },
    );
    expect(daySummaryJobId(user.id, '2026-09-30')).toBe(`coach-summary-${user.id}-2026-09-30`);
  });

  it("goes on the coach-summary queue, not the sync worker's queue", async () => {
    const user = await consentedUser();
    const add = jest.spyOn(coachSummaryQueue, 'add').mockResolvedValue({} as never);
    jest.spyOn(coachSummaryQueue, 'getJob').mockResolvedValue(undefined);

    expect(await refreshDaySummaryAfterScore(user.id, '2026-09-30', { now: () => NOW })).toBe(true);

    expect(coachSummaryQueue.name).toBe(COACH_SUMMARY_QUEUE);
    expect(COACH_SUMMARY_QUEUE).not.toBe('health-sync');
    expect(add).toHaveBeenCalledWith(COACH_DAY_SUMMARY_JOB, { userId: user.id, date: '2026-09-30' }, expect.anything());
  });

  it("queues one follow-up when the day's summary is already being written, so new scores are not dropped", async () => {
    const user = await consentedUser();
    const { queue, add, getJob } = fakeQueue(false, { active: true });

    expect(await refreshDaySummaryAfterScore(user.id, '2026-09-30', { queue, now: () => NOW })).toBe(true);

    expect(getJob).toHaveBeenCalledWith(daySummaryJobId(user.id, '2026-09-30'));
    expect(add).toHaveBeenCalledWith(
      COACH_DAY_SUMMARY_JOB,
      { userId: user.id, date: '2026-09-30' },
      expect.objectContaining({ jobId: `${daySummaryJobId(user.id, '2026-09-30')}-again` }),
    );
  });

  it("uses the user's local day", async () => {
    const user = await consentedUser('Pacific/Auckland'); // already 1 October there
    const { queue, add } = fakeQueue();
    expect(await refreshDaySummaryAfterScore(user.id, '2026-09-30', { queue, now: () => NOW })).toBe(false);
    expect(await refreshDaySummaryAfterScore(user.id, '2026-10-01', { queue, now: () => NOW })).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a past day (backfill, sweep)', async () => consentedUser(), '2026-09-28'],
    ['a user without the coach consent', async () => createUser(), '2026-09-30'],
  ])('queues nothing for %s', async (_label, makeUser, date) => {
    const user = await makeUser();
    const { queue, add } = fakeQueue();
    expect(await refreshDaySummaryAfterScore(user.id, date, { queue, now: () => NOW })).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it('queues nothing while the coach is off', async () => {
    process.env.COACH_ENABLED = 'false';
    const user = await consentedUser();
    const { queue, add } = fakeQueue();
    expect(await refreshDaySummaryAfterScore(user.id, '2026-09-30', { queue, now: () => NOW })).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it('never fails the score job: a queue error is logged by name and swallowed', async () => {
    const user = await consentedUser();
    const { queue } = fakeQueue(true);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await refreshDaySummaryAfterScore(user.id, '2026-09-30', { queue, now: () => NOW })).toBe(false);
    expect(errors).toHaveBeenCalledWith(JSON.stringify({ event: 'coach.day_summary_enqueue_failed', error: 'Error' }));
  });
});

describe('runDaySummaryJob', () => {
  it('rewrites the stored sentence from fresh data (forced)', async () => {
    const user = await consentedUser();
    const day = civilDateToUtcMidnight('2026-09-30');
    await prisma.coachDaySummary.create({ data: { userId: user.id, date: day, text: 'stale', spans: [], source: 'AI' } });
    const sheet: FactSheet = {
      route: 'today',
      facts: [{ id: 'recovery.today', label: 'Recovery today', value: 71, unit: 'score', display: '71', usual: 58 }],
      notes: [],
    };
    const provider: CoachModelProvider = {
      id: 'fake',
      async *stream() {
        yield 'Recovery is up at 71. Go enjoy a longer walk today.';
      },
    };

    const outcome = await runDaySummaryJob(
      { userId: user.id, date: '2026-09-30' },
      {
        loadSheet: async () => sheet,
        now: () => NOW,
        clock: new FakeClock(),
        selectProvider: async () => ({ requested: 'local', provider, servedBy: () => 'local' }),
      },
    );

    expect(outcome).toBe('ai');
    const row = await prisma.coachDaySummary.findUniqueOrThrow({ where: { userId_date: { userId: user.id, date: day } } });
    expect(row.text).toBe('Recovery is up at 71. Go enjoy a longer walk today.');
  });
});

describe('runDaySummaryJob: a job that starts after midnight', () => {
  it("skips a day that is no longer the user's today, writing nothing", async () => {
    const user = await consentedUser('Pacific/Auckland'); // 1 October there at NOW
    const loadSheet = jest.fn();

    const outcome = await runDaySummaryJob({ userId: user.id, date: '2026-09-30' }, { loadSheet, now: () => NOW });

    expect(outcome).toBe('skipped_other_day');
    expect(loadSheet).not.toHaveBeenCalled();
    expect(await prisma.coachDaySummary.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('the coach-summary worker', () => {
  let savedConcurrency: string | undefined;
  beforeEach(() => {
    savedConcurrency = process.env.COACH_SUMMARY_CONCURRENCY;
  });
  afterEach(() => {
    if (savedConcurrency === undefined) delete process.env.COACH_SUMMARY_CONCURRENCY;
    else process.env.COACH_SUMMARY_CONCURRENCY = savedConcurrency;
  });

  it.each([
    [undefined, 1],
    ['', 1],
    ['abc', 1],
    ['0', 1],
    ['-3', 1],
    ['2', 2],
    ['2.7', 2],
    ['50', 8],
  ])('reads COACH_SUMMARY_CONCURRENCY=%p as %p', (raw, expected) => {
    if (raw === undefined) delete process.env.COACH_SUMMARY_CONCURRENCY;
    else process.env.COACH_SUMMARY_CONCURRENCY = raw;
    expect(getSummaryConcurrency()).toBe(expected);
  });

  it('writes one summary at a time by default, on its own queue', async () => {
    delete process.env.COACH_SUMMARY_CONCURRENCY;
    const worker = startDaySummaryWorker({ autorun: false });
    try {
      expect(worker.name).toBe(COACH_SUMMARY_QUEUE);
      expect(worker.concurrency).toBe(1);
    } finally {
      await worker.close();
    }
  });

  it('processes a queued summary job', async () => {
    // A day that is long past, so the job skips without a model; the outcome is the job's return value.
    const user = await consentedUser();
    const events = new QueueEvents(COACH_SUMMARY_QUEUE, { connection: connection.duplicate() });
    const worker = startDaySummaryWorker();
    try {
      await events.waitUntilReady();
      const job = await coachSummaryQueue.add(
        COACH_DAY_SUMMARY_JOB,
        { userId: user.id, date: '2000-01-01' },
        { jobId: daySummaryJobId(user.id, '2000-01-01'), removeOnComplete: true, removeOnFail: true, attempts: 1 },
      );
      expect(await job.waitUntilFinished(events, 15_000)).toBe('skipped_other_day');
    } finally {
      await worker.close();
      await events.close();
    }
  });
});

describe('summaryEngineDeps', () => {
  const provider = (id: string): CoachModelProvider => ({
    id,
    async *stream() {},
  });
  const slots = {
    getProvider: () => provider('local'),
    getHostedProvider: () => provider('hosted'),
    clock: new FakeClock(),
    telemetry: new NoopCoachTelemetry(),
  };

  it("writes with the user's engine: local by default, hosted only when chosen and consented", async () => {
    const local = await consentedUser();
    expect((await summaryEngineDeps(slots).selectProvider!(local.id)).requested).toBe('local');

    const hosted = await consentedUser();
    await prisma.coachConsent.create({ data: { userId: hosted.id, version: COACH_HOSTED_CONSENT_VERSION, scope: 'HOSTED' } });
    await prisma.user.update({ where: { id: hosted.id }, data: { coachEngine: 'HOSTED' } });
    expect((await summaryEngineDeps(slots).selectProvider!(hosted.id)).requested).toBe('hosted');
    expect((await summaryEngineDeps({ ...slots, getHostedProvider: () => null }).selectProvider!(hosted.id)).requested).toBe('local');
  });
});
