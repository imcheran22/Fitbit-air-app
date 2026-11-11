import { randomUUID } from 'crypto';
import { syncQueue, connection } from '../../src/sync/queue';
import {
  enqueueScoreCompute,
  scheduleNightlyScoreSweep,
  scoreJobId,
  COMPUTE_DAILY_SCORE_JOB,
  SCORE_DEBOUNCE_MS,
  SCORE_SWEEP_JOB,
  SCORE_SWEEP_CRON,
} from '../../src/scoring/queue';

afterAll(async () => {
  await syncQueue.removeJobScheduler(SCORE_SWEEP_JOB).catch(() => undefined);
  await syncQueue.close();
  await connection.quit();
});

describe('score job enqueueing (debounce)', () => {
  it('queues one computeDailyScore job, delayed 5 minutes, under a deterministic id', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    await enqueueScoreCompute('user-1', '2026-09-01', { queue: { add } });

    expect(add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = add.mock.calls[0]!;
    expect(name).toBe(COMPUTE_DAILY_SCORE_JOB);
    expect(data).toEqual({ userId: 'user-1', date: '2026-09-01' });
    expect(opts.jobId).toBe(scoreJobId('user-1', '2026-09-01'));
    expect(opts.delay).toBe(SCORE_DEBOUNCE_MS);
    expect(SCORE_DEBOUNCE_MS).toBe(5 * 60 * 1000);
    // A retained job would keep the id occupied and swallow every later enqueue.
    expect(opts.removeOnComplete).toBe(true);
    expect(opts.removeOnFail).toBe(true);
  });

  it('uses the same job id for the same user+date and different ids otherwise', () => {
    expect(scoreJobId('u', '2026-09-01')).toBe(scoreJobId('u', '2026-09-01'));
    expect(scoreJobId('u', '2026-09-01')).not.toBe(scoreJobId('u', '2026-09-02'));
    expect(scoreJobId('u', '2026-09-01')).not.toBe(scoreJobId('v', '2026-09-01'));
    // BullMQ rejects ':' in a custom job id.
    expect(scoreJobId('u', '2026-09-01')).not.toContain(':');
  });

  // The real BullMQ behavior, not a fake: an add() with an id that already
  // exists is a no-op, which is what makes the burst collapse.
  it('collapses a burst of webhooks for one user+day into a single delayed job', async () => {
    const userId = randomUUID();
    const first = await enqueueScoreCompute(userId, '2026-09-01');
    const second = await enqueueScoreCompute(userId, '2026-09-01');
    const third = await enqueueScoreCompute(userId, '2026-09-01');
    const otherDay = await enqueueScoreCompute(userId, '2026-09-02');

    try {
      expect(second.id).toBe(first.id);
      expect(third.id).toBe(first.id);
      expect(otherDay.id).not.toBe(first.id);

      const delayed = await syncQueue.getJobs(['delayed']);
      const mine = delayed.filter((j) => j.data?.userId === userId);
      expect(mine).toHaveLength(2); // one per day, not one per webhook
      expect(mine.every((j) => j.name === COMPUTE_DAILY_SCORE_JOB)).toBe(true);
    } finally {
      await first.remove().catch(() => undefined);
      await otherDay.remove().catch(() => undefined);
    }
  });
});

describe('nightly score sweep scheduler', () => {
  it('registers the sweep as a repeatable scheduler and stays idempotent across restarts', async () => {
    await scheduleNightlyScoreSweep();
    await scheduleNightlyScoreSweep();

    const schedulers = await syncQueue.getJobSchedulers();
    const sweeps = schedulers.filter((s) => s.key === SCORE_SWEEP_JOB);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0]!.pattern).toBe(SCORE_SWEEP_CRON);
  });
});
