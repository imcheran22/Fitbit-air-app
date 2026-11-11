import { randomUUID } from 'crypto';
import type { JobsOptions } from 'bullmq';
import { prisma } from '../../src/db/client';
import { connection, syncQueue } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { enqueueRecapJob, recapJobId, RECAP_BUILD_JOB } from '../../src/recap/queue';
import { runRecapSweep } from '../../src/recap/sweep';
import type { RecapJobData } from '../../src/recap/types';
import { createUser } from '../coach/helpers';
import { seedNight } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await syncQueue.close();
  await connection.quit();
  await prisma.$disconnect();
});

function fakeQueue(fail?: (data: RecapJobData) => boolean) {
  const adds: Array<{ name: string; data: RecapJobData; opts: JobsOptions }> = [];
  const queue = {
    add: async (name: string, data: RecapJobData, opts: JobsOptions) => {
      if (fail?.(data)) throw new Error('redis down');
      adds.push({ name, data, opts });
      return {} as never;
    },
  };
  return { adds, queue: queue as never };
}
async function sleeper(timezone = 'UTC') {
  const user = await createUser({ timezone });
  await seedNight(user.id, '2026-09-30', { minutes: 450 });
  return user;
}
const recapRow = (userId: string, over: Record<string, unknown>) =>
  prisma.recap.create({
    data: { userId, kind: 'WEEK', periodStart: civilDateToUtcMidnight('2026-09-28'), periodEnd: civilDateToUtcMidnight('2026-10-04'), status: 'BUILT', sleepGoalMinutes: 480, ...over },
  });
const weeks = (adds: Array<{ data: RecapJobData }>) => adds.filter((a) => a.data.kind === 'WEEK').map((a) => a.data.periodStart);

describe('runRecapSweep', () => {
  it('enqueues each due period once, with the dedupe job id', async () => {
    const user = await sleeper();
    const { adds, queue } = fakeQueue();
    const summary = await runRecapSweep({ queue, now: new Date('2026-10-01T09:00:00Z'), userIds: [user.id] });
    expect(summary).toEqual({ usersChecked: 1, jobsEnqueued: 2, failed: 0 });
    expect(adds.map((a) => a.data)).toEqual([
      { userId: user.id, kind: 'WEEK', periodStart: '2026-09-21' },
      { userId: user.id, kind: 'MONTH', periodStart: '2026-09-01' },
    ]);
    expect(adds[0]!.name).toBe(RECAP_BUILD_JOB);
    expect(adds[0]!.opts).toMatchObject({ jobId: `recap-${user.id}-WEEK-2026-09-21`, removeOnComplete: true });
  });

  it("decides due-ness in each user's own zone", async () => {
    const auckland = await sleeper('Pacific/Auckland');
    const utc = await sleeper('UTC');
    const { adds, queue } = fakeQueue();
    await runRecapSweep({ queue, now: new Date('2026-10-04T19:00:00Z'), userIds: [auckland.id, utc.id] });
    expect(weeks(adds.filter((a) => a.data.userId === auckland.id))).toEqual(['2026-09-28']);
    expect(weeks(adds.filter((a) => a.data.userId === utc.id))).not.toContain('2026-09-28');
    const early = fakeQueue();
    await runRecapSweep({ queue: early.queue, now: new Date('2026-10-05T07:59:00Z'), userIds: [utc.id] });
    expect(weeks(early.adds)).toEqual([]);
  });

  it('re-checks an existing row only inside the late window and only while it can still change', async () => {
    const now = new Date('2026-10-05T09:00:00Z');
    const unopened = await sleeper();
    await recapRow(unopened.id, {});
    const opened = await sleeper();
    await recapRow(opened.id, { openedAt: now });
    const rebuilt = await sleeper();
    await recapRow(rebuilt.id, { rebuiltAt: now });
    const skipped = await sleeper();
    await recapRow(skipped.id, { status: 'SKIPPED' });
    const { adds, queue } = fakeQueue();
    await runRecapSweep({ queue, now, userIds: [unopened.id, opened.id, rebuilt.id, skipped.id] });
    const weekUsers = adds.filter((a) => a.data.kind === 'WEEK').map((a) => a.data.userId).sort();
    expect(weekUsers).toEqual([unopened.id, skipped.id].sort());
    const later = fakeQueue();
    await runRecapSweep({ queue: later.queue, now: new Date('2026-10-08T09:00:00Z'), userIds: [skipped.id] });
    expect(weeks(later.adds)).toEqual([]);
  });

  it('ignores users with no sleep data, and one user failing does not stop the others', async () => {
    const empty = await createUser();
    const a = await sleeper();
    const b = await sleeper();
    const { adds, queue } = fakeQueue((data) => data.userId === a.id);
    const summary = await runRecapSweep({ queue, now: new Date('2026-10-05T09:00:00Z'), userIds: [empty.id, a.id, b.id] });
    expect(summary.usersChecked).toBe(2);
    expect(summary.failed).toBe(1);
    expect(adds.some((x) => x.data.userId === b.id)).toBe(true);
  });
});

describe('job id dedupe (real queue)', () => {
  it("ignores the sweep's add while the backfill's job with the same id is queued", async () => {
    const userId = randomUUID();
    await enqueueRecapJob({ userId, kind: 'WEEK', periodStart: '2026-09-28', noPush: true });
    await enqueueRecapJob({ userId, kind: 'WEEK', periodStart: '2026-09-28' });
    const job = await syncQueue.getJob(recapJobId(userId, 'WEEK', '2026-09-28'));
    expect(job!.data).toEqual({ userId, kind: 'WEEK', periodStart: '2026-09-28', noPush: true });
    await job!.remove();
  });
});
