import type { Job } from 'bullmq';
import { connection, syncQueue } from '../../src/sync/queue';
import { processSyncJob } from '../../src/sync/worker';
import { RECAP_BUILD_JOB, RECAP_SWEEP_JOB } from '../../src/recap/queue';
import { runRecapSweep } from '../../src/recap/sweep';
import { runRecapJob } from '../../src/recap/build';
import { runSocialSweep } from '../../src/social/sweep';

jest.mock('../../src/recap/sweep', () => ({ runRecapSweep: jest.fn(async () => ({ usersChecked: 0, jobsEnqueued: 0, failed: 0 })) }));
jest.mock('../../src/recap/build', () => ({ runRecapJob: jest.fn(async () => 'built'), defaultRecapDeps: jest.fn(() => ({ marker: 'deps' })) }));
// The social sweep (S2) shares this tick; it is tested in tests/social/retention.test.ts on a pinned clock.
jest.mock('../../src/social/sweep', () => ({ runSocialSweep: jest.fn(async () => ({ notes: 0, highlights: 0, statusNotes: 0, reports: 0 })) }));

afterAll(async () => {
  await syncQueue.close();
  await connection.quit();
});

it('dispatches the recap sweep and recap build jobs', async () => {
  await processSyncJob({ name: RECAP_SWEEP_JOB, data: {} } as unknown as Job);
  expect(runRecapSweep).toHaveBeenCalledTimes(1);
  expect(runSocialSweep).toHaveBeenCalledTimes(1);
  const data = { userId: 'u1', kind: 'WEEK', periodStart: '2026-09-28' };
  await processSyncJob({ name: RECAP_BUILD_JOB, data } as unknown as Job);
  expect(runRecapJob).toHaveBeenCalledWith(data, { marker: 'deps' });
});

it('a failing social sweep never stops the recap sweep, and its message never reaches the logs', async () => {
  (runSocialSweep as jest.Mock).mockRejectedValueOnce(new Error('secret'));
  (runRecapSweep as jest.Mock).mockClear();
  const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  try {
    await processSyncJob({ name: RECAP_SWEEP_JOB, data: {} } as unknown as Job);
    expect(runRecapSweep).toHaveBeenCalledTimes(1);
    const logged = spies.flatMap((s) => s.mock.calls.map((c) => JSON.stringify(c)));
    expect(logged).toContain(JSON.stringify([JSON.stringify({ event: 'social.sweep_failed', error: 'Error' })]));
    for (const line of logged) expect(line).not.toContain('secret');
  } finally {
    for (const s of spies) s.mockRestore();
  }
});

it("the social sweep's pinned clock is honoured in the past and clamped to now in the future", async () => {
  const sweep = runSocialSweep as jest.Mock;
  sweep.mockClear();
  await processSyncJob({ name: RECAP_SWEEP_JOB, data: { now: '2025-02-10T12:00:00.000Z' } } as unknown as Job);
  expect(sweep.mock.calls[0][0]).toEqual(new Date('2025-02-10T12:00:00.000Z'));
  const before = Date.now();
  await processSyncJob({ name: RECAP_SWEEP_JOB, data: { now: '2999-01-01T00:00:00.000Z' } } as unknown as Job);
  const clamped = (sweep.mock.calls[1][0] as Date).getTime();
  expect(clamped).toBeGreaterThanOrEqual(before);
  expect(clamped).toBeLessThanOrEqual(Date.now());
});
