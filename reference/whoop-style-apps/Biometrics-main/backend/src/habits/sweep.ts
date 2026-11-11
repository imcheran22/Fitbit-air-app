import { prisma } from '../db/client';
import { syncQueue } from '../sync/queue';
import { isoWeekKey } from './job';
import { enqueueHabitCorrelations, HabitJobQueue } from './queue';

export interface HabitSweepSummary {
  usersEnqueued: number;
}

/**
 * The weekly fan-out: one runHabitCorrelations job per user who has ever
 * logged a habit or checked in, or who still has a stored correlation row (a
 * user who stopped logging must still have their rows age toward RETIRED
 * rather than stay CONFIRMED forever). Per-user jobs, not one big loop, so one
 * user's failure retries alone.
 */
export async function runHabitCorrelationSweep({
  queue = syncQueue,
  now = new Date(),
}: { queue?: HabitJobQueue; now?: Date } = {}): Promise<HabitSweepSummary> {
  const [logged, checkedIn, withRows] = await Promise.all([
    prisma.habitLog.findMany({ distinct: ['userId'], select: { userId: true } }),
    prisma.habitCheckIn.findMany({ distinct: ['userId'], select: { userId: true } }),
    prisma.habitCorrelation.findMany({ distinct: ['userId'], select: { userId: true } }),
  ]);
  const userIds = new Set([...logged, ...checkedIn, ...withRows].map((r) => r.userId));
  const runKey = isoWeekKey(now);
  for (const userId of userIds) await enqueueHabitCorrelations(userId, runKey, { queue });
  return { usersEnqueued: userIds.size };
}
