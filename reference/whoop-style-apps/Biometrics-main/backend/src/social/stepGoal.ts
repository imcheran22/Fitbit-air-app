// "Passed the step goal today" (spec 2026-10-07 social §5): written by the sync the first time a STEPS rollup for
// the user's LOCAL today reaches STEPS_GOAL. Stores the day only — never a step count. Buddies see it only while
// the author effectively shares steps (gated at read time, not here).

import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { STEPS_GOAL } from '../coach/tools/metrics';
import { prisma } from '../db/client';
import { todayFor } from './checkins';

export async function recordStepGoal(userId: string, points: ReadonlyArray<{ recordedAt: Date; value: number }>, now: Date): Promise<boolean> {
  const { today } = await todayFor(userId, now);
  const todayPoint = points.find((p) => p.recordedAt.toISOString().slice(0, 10) === today);
  if (!todayPoint || todayPoint.value < STEPS_GOAL) return false;
  const created = await prisma.stepGoalEvent.createMany({
    data: [{ authorId: userId, localDate: civilDateToUtcMidnight(today), at: now }],
    skipDuplicates: true,
  });
  return created.count === 1;
}
