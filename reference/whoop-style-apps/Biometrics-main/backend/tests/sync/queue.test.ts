import {
  syncQueue,
  connection,
  enqueueFetchJob,
  enqueueBackfillJob,
  enqueueImmediateTokenRefreshSweep,
  enqueueSleepHistoryBackfill,
  enqueueSleepStagesBackfill,
  SLEEP_HISTORY_BACKFILL_JOB,
  SLEEP_STAGES_BACKFILL_JOB,
  scheduleTokenRefreshSweep,
  TOKEN_REFRESH_SWEEP_JOB,
  TOKEN_REFRESH_SWEEP_INTERVAL_MS,
} from '../../src/sync/queue';

afterAll(async () => {
  await syncQueue.removeJobScheduler(TOKEN_REFRESH_SWEEP_JOB).catch(() => undefined);
  await syncQueue.close();
  await connection.quit();
});

describe('sync queue', () => {
  it('enqueues a fetch job with the expected name and data', async () => {
    const job = await enqueueFetchJob({ userId: 'u1', metricType: 'STEPS', date: '2026-09-01' });
    expect(job.name).toBe('fetch');
    expect(job.data).toEqual({ userId: 'u1', metricType: 'STEPS', date: '2026-09-01' });
  });

  it('enqueues a backfill job with the expected name and data', async () => {
    const job = await enqueueBackfillJob({ userId: 'u1', startDate: '2026-08-01', endDate: '2026-09-01' });
    expect(job.name).toBe('backfill');
    expect(job.data).toEqual({ userId: 'u1', startDate: '2026-08-01', endDate: '2026-09-01' });
  });

  // Scheduling the sweep on the queue (rather than a per-process setInterval)
  // is what keeps several backend instances from redundantly refreshing the
  // same connection and fanning out avoidable rate-limited calls to Google.
  it('registers the token refresh sweep as a repeatable scheduler', async () => {
    await scheduleTokenRefreshSweep();

    const schedulers = await syncQueue.getJobSchedulers();
    const sweep = schedulers.find((s) => s.key === TOKEN_REFRESH_SWEEP_JOB);

    expect(sweep).toBeDefined();
    expect(Number(sweep?.every)).toBe(TOKEN_REFRESH_SWEEP_INTERVAL_MS);
  });

  it('is idempotent, so restarting an instance does not stack up schedulers', async () => {
    await scheduleTokenRefreshSweep();
    await scheduleTokenRefreshSweep();

    const schedulers = await syncQueue.getJobSchedulers();
    const sweeps = schedulers.filter((s) => s.key === TOKEN_REFRESH_SWEEP_JOB);

    expect(sweeps).toHaveLength(1);
  });

  // The repeatable schedule's first tick is a full interval out, so startup
  // also enqueues one sweep directly. BullMQ rejects a custom job id containing
  // ':', which is only caught by actually enqueueing it.
  it('enqueues a startup sweep with an acceptable job id', async () => {
    const job = await enqueueImmediateTokenRefreshSweep();

    expect(job.name).toBe(TOKEN_REFRESH_SWEEP_JOB);
    expect(job.id).toBe(`${TOKEN_REFRESH_SWEEP_JOB}-startup`);

    await job.remove().catch(() => undefined);
  });

  // These two jobs are the only path that sets their marker, so a transient
  // 429 or timeout must be retried, not dropped until the next server start.
  it.each([
    ['history', enqueueSleepHistoryBackfill, SLEEP_HISTORY_BACKFILL_JOB],
    ['stage', enqueueSleepStagesBackfill, SLEEP_STAGES_BACKFILL_JOB],
  ] as const)('the sleep %s backfill retries with exponential backoff', async (_, enqueue, name) => {
    const add = jest.spyOn(syncQueue, 'add').mockResolvedValue(undefined as never);
    try {
      await enqueue('u1');
      expect(add).toHaveBeenCalledWith(name, { userId: 'u1' }, expect.objectContaining({
        jobId: `${name}-u1`,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 4,
        backoff: { type: 'exponential', delay: 60_000 },
      }));
    } finally {
      add.mockRestore();
    }
  });
});
