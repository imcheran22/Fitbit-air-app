// The hourly recap sweep (spec 2026-10-04 §2). For each user with sleep data and each kind, only
// the most recent finished period can be due (the windows are shorter than a period). With no row
// it is enqueued when due; with a row it is re-checked only inside the late-data window and only
// while it can still change (SKIPPED, or BUILT and neither opened nor rebuilt).

import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { syncQueue } from '../sync/queue';
import { inLateWindow, isDue, lastCompletedPeriodStart } from './periods';
import { enqueueRecapJob, RecapQueue } from './queue';
import { RECAP_KINDS } from './types';

const USER_BATCH = 200;

export interface RecapSweepSummary {
  usersChecked: number;
  jobsEnqueued: number;
  failed: number;
}

/** Users with at least one SLEEP rollup, in id order, a batch at a time. `userIds` restricts the run (tests). */
export async function* usersWithSleepData(userIds?: string[]): AsyncGenerator<{ id: string; timezone: string }> {
  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where: { ...(userIds ? { id: { in: userIds } } : {}), biometricRecords: { some: { metricType: 'SLEEP' } } },
      select: { id: true, timezone: true },
      orderBy: { id: 'asc' },
      take: USER_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    yield* users;
    if (users.length < USER_BATCH) return;
    cursor = users[users.length - 1]!.id;
  }
}

export async function runRecapSweep({ queue = syncQueue, now = new Date(), userIds }: { queue?: RecapQueue; now?: Date; userIds?: string[] } = {}): Promise<RecapSweepSummary> {
  const summary: RecapSweepSummary = { usersChecked: 0, jobsEnqueued: 0, failed: 0 };
  for await (const user of usersWithSleepData(userIds)) {
    summary.usersChecked++;
    try {
      const today = localCivilDateOrUtc(now, user.timezone);
      const periods = RECAP_KINDS.map((kind) => ({ kind, periodStart: lastCompletedPeriodStart(kind, today) }));
      const rows = await prisma.recap.findMany({
        where: { userId: user.id, OR: periods.map((p) => ({ kind: p.kind, periodStart: civilDateToUtcMidnight(p.periodStart) })) },
        select: { kind: true, status: true, openedAt: true, rebuiltAt: true },
      });
      for (const p of periods) {
        const row = rows.find((r) => r.kind === p.kind);
        const wanted = row
          ? inLateWindow(p.kind, p.periodStart, today) && (row.status === 'SKIPPED' || (row.openedAt === null && row.rebuiltAt === null))
          : isDue(p.kind, p.periodStart, now, user.timezone);
        if (!wanted) continue;
        await enqueueRecapJob({ userId: user.id, kind: p.kind, periodStart: p.periodStart }, { queue });
        summary.jobsEnqueued++;
      }
    } catch (err) {
      // One user's failure never blocks the others (spec §2). Ids and error class only.
      summary.failed++;
      console.error(JSON.stringify({ event: 'recap.sweep_user_failed', userId: user.id, error: err instanceof Error ? err.name : 'unknown' }));
    }
  }
  return summary;
}
