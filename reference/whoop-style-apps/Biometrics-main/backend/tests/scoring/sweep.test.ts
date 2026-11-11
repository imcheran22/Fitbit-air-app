import { runScoreSweep } from '../../src/scoring/sweep';
import { computeDailyScore } from '../../src/scoring/compute';
import { COMPUTE_DAILY_SCORE_JOB, ScoreQueue } from '../../src/scoring/queue';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser, seedHistory, day } from './dbHelpers';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// The test DB is shared with other suites' users, so every assertion filters
// to the user under test.
interface Enqueued {
  userId: string;
  date: string;
  opts: any;
}

function fakeQueue(onAdd?: (e: Enqueued) => Promise<void>): { queue: ScoreQueue; added: Enqueued[] } {
  const added: Enqueued[] = [];
  const queue: ScoreQueue = {
    add: (async (name: string, data: any, opts: any) => {
      expect(name).toBe(COMPUTE_DAILY_SCORE_JOB);
      const e = { userId: data.userId, date: data.date, opts };
      added.push(e);
      await onAdd?.(e);
    }) as ScoreQueue['add'],
  };
  return { queue, added };
}

const NOW = new Date('2026-08-10T12:00:00Z');

describe('nightly score sweep', () => {
  it('back-fills every day that has inputs but no score, as debounce-free computeDailyScore jobs', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-08-03', 5); // 08-03 .. 08-07
    const { queue, added } = fakeQueue();

    await runScoreSweep({ queue, now: NOW });

    const mine = added.filter((a) => a.userId === user.id);
    expect(mine.map((a) => a.date).sort()).toEqual(['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']);
    expect(mine.every((a) => a.opts.delay === 0)).toBe(true);
  });

  it('enqueues nothing for days whose score is already newer than their data', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-08-03', 3);
    for (const d of ['2026-08-03', '2026-08-04', '2026-08-05']) await computeDailyScore(user.id, d);
    const { queue, added } = fakeQueue();

    await runScoreSweep({ queue, now: NOW });

    expect(added.filter((a) => a.userId === user.id)).toEqual([]);
  });

  it('recomputes only the day whose data is newer than its last score', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-08-03', 3);
    for (const d of ['2026-08-03', '2026-08-04', '2026-08-05']) await computeDailyScore(user.id, d);

    await prisma.biometricRecord.update({
      where: { userId_metricType_recordedAt: { userId: user.id, metricType: 'HRV', recordedAt: day('2026-08-04') } },
      data: { value: 61, syncedAt: new Date(Date.now() + 60_000) },
    });
    const { queue, added } = fakeQueue();

    await runScoreSweep({ queue, now: NOW });

    expect(added.filter((a) => a.userId === user.id).map((a) => a.date)).toEqual(['2026-08-04']);
  });

  it('does not back-fill beyond 90 days', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-04-01', 2); // ~130 days before NOW
    await seedHistory(user.id, '2026-08-05', 1);
    const { queue, added } = fakeQueue();

    await runScoreSweep({ queue, now: NOW });

    expect(added.filter((a) => a.userId === user.id).map((a) => a.date)).toEqual(['2026-08-05']);
  });

  it('ignores days that only have STEPS (not a score input)', async () => {
    const user = await createUser();
    await prisma.biometricRecord.create({
      data: { userId: user.id, metricType: 'STEPS', value: 9000, recordedAt: day('2026-08-05') },
    });
    const { queue, added } = fakeQueue();

    await runScoreSweep({ queue, now: NOW });

    expect(added.filter((a) => a.userId === user.id)).toEqual([]);
  });

  it('end to end: running the enqueued jobs produces a score for every back-filled day, and a second sweep is a no-op', async () => {
    const user = await createUser();
    await seedHistory(user.id, '2026-06-20', 45); // through 2026-08-03
    const inline = fakeQueue(async (e) => {
      if (e.userId === user.id) await computeDailyScore(e.userId, e.date);
    });

    await runScoreSweep({ queue: inline.queue, now: NOW });
    expect(await prisma.dailyScore.count({ where: { userId: user.id, type: 'RECOVERY' } })).toBe(45);

    const again = fakeQueue();
    await runScoreSweep({ queue: again.queue, now: NOW });
    expect(again.added.filter((a) => a.userId === user.id)).toEqual([]);
  });
});
