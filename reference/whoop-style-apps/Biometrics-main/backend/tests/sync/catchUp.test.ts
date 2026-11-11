import { syncQueue, connection } from '../../src/sync/queue';
import {
  CATCH_UP_SWEEP_JOB,
  CATCH_UP_SWEEP_INTERVAL_MS,
  catchUpJobId,
  catchUpState,
  catchUpWindow,
  enqueueCatchUp,
  scheduleCatchUpSweep,
} from '../../src/sync/catchUp';

describe('catchUpWindow', () => {
  it('starts the day before the last sync and ends after today', () => {
    expect(catchUpWindow(new Date('2026-09-23T15:42:00Z'), '2026-09-24', 'UTC')).toEqual({
      startDate: '2026-09-22',
      endDate: '2026-09-25',
    });
  });

  it('uses the civil date of the last sync in the user time zone', () => {
    // 02:00 UTC on the 23rd is still the evening of the 22nd in New York.
    expect(catchUpWindow(new Date('2026-09-23T02:00:00Z'), '2026-09-24', 'America/New_York')).toEqual({
      startDate: '2026-09-21',
      endDate: '2026-09-25',
    });
  });

  it('caps the window at 14 days', () => {
    expect(catchUpWindow(new Date('2026-07-01T00:00:00Z'), '2026-09-24', 'UTC')).toEqual({
      startDate: '2026-09-11',
      endDate: '2026-09-25',
    });
  });

  it('covers the last 14 days when there was never a sync', () => {
    expect(catchUpWindow(null, '2026-09-24', 'UTC')).toEqual({ startDate: '2026-09-11', endDate: '2026-09-25' });
  });

  it('still covers yesterday and today when the last sync was today', () => {
    expect(catchUpWindow(new Date('2026-09-24T09:00:00Z'), '2026-09-24', 'UTC')).toEqual({
      startDate: '2026-09-23',
      endDate: '2026-09-25',
    });
  });
});

describe('catch-up queueing', () => {
  const userId = `u-catchup-${Date.now()}`;

  afterEach(async () => {
    jest.restoreAllMocks();
    await syncQueue.remove(catchUpJobId(userId)).catch(() => undefined);
  });

  afterAll(async () => {
    await syncQueue.removeJobScheduler(CATCH_UP_SWEEP_JOB).catch(() => undefined);
    await syncQueue.close();
    await connection.quit();
  });

  it('queues one catch-up per user, however often it is asked', async () => {
    await enqueueCatchUp(userId);
    await enqueueCatchUp(userId);
    const job = await syncQueue.getJob(catchUpJobId(userId));
    expect(job?.name).toBe('catchUp');
    expect(job?.data).toEqual({ userId });
    const pending = await syncQueue.getJobs(['waiting', 'delayed', 'prioritized']);
    expect(pending.filter((j) => j.id === catchUpJobId(userId))).toHaveLength(1);
    expect(await catchUpState(userId)).toBe('syncing');
  });

  it('reports idle when there is no job', async () => {
    expect(await catchUpState(`nobody-${Date.now()}`)).toBe('idle');
  });

  it('reports failed for a failed job, and replaces it on the next request', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(syncQueue, 'getJob').mockResolvedValue({ getState: async () => 'failed', remove } as never);
    expect(await catchUpState(userId)).toBe('failed');

    const add = jest.spyOn(syncQueue, 'add').mockResolvedValue({} as never);
    await enqueueCatchUp(userId);
    expect(remove).toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith('catchUp', { userId }, expect.objectContaining({ jobId: catchUpJobId(userId) }));
  });

  // A webhook fetch or a reconnect backfill can bring the data up to date after
  // a catch-up failed; that old failure must not keep saying "Couldn't sync".
  it('reports idle for a failed job older than the last successful sync', async () => {
    const failedAt = Date.now() - 600_000;
    jest.spyOn(syncQueue, 'getJob').mockResolvedValue({ getState: async () => 'failed', finishedOn: failedAt } as never);
    expect(await catchUpState(userId, new Date(failedAt + 60_000))).toBe('idle');
    expect(await catchUpState(userId, new Date(failedAt - 60_000))).toBe('failed');
    expect(await catchUpState(userId, null)).toBe('failed');
  });

  it('registers the 3-hour backstop sweep', async () => {
    await scheduleCatchUpSweep();
    const sweep = (await syncQueue.getJobSchedulers()).find((s) => s.key === CATCH_UP_SWEEP_JOB);
    expect(Number(sweep?.every)).toBe(CATCH_UP_SWEEP_INTERVAL_MS);
  });
});
