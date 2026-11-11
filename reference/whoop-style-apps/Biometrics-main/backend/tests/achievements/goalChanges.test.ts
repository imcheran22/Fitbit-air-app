import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { connection } from '../../src/sync/queue';
import {
  EVALUATION_TTL_SECONDS, MARKER_TIMEOUT_MS, clearAchievementsMarker, evaluationVersion, markEvaluated, markerKey, readEvaluated, versionKey,
} from '../../src/achievements/marker';
import * as goalChanges from '../../src/achievements/goalChanges';
import { updateSleepGoal } from '../../src/users/goals';
import { migrateTestDb } from '../setupTestDb';
import { createUser } from '../scoring/dbHelpers';
import { seedNights } from '../recap/helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await connection.quit();
  await prisma.$disconnect();
});

const day = civilDateToUtcMidnight;
const NOW = new Date('2026-10-06T09:00:00Z');
const LATER_SAME_DAY = new Date('2026-10-06T20:00:00Z');
const NEXT_DAY = new Date('2026-10-07T09:00:00Z');

async function rows(userId: string, kind: 'SLEEP_MINUTES' | 'BEDTIME') {
  const list = await prisma.goalChange.findMany({ where: { userId, kind }, orderBy: { effectiveOn: 'asc' } });
  return list.map((r) => [r.effectiveOn.toISOString().slice(0, 10), kind === 'SLEEP_MINUTES' ? r.sleepMinutes : r.bedtime, r.resetsStreak]);
}

/** Marks the user evaluated the way GET /me/achievements does: version read first, then the standings. */
async function evaluate(userId: string, standings: Parameters<typeof markEvaluated>[2]) {
  await markEvaluated(userId, await evaluationVersion(userId), standings);
}

describe('the evaluation marker', () => {
  it('holds the standings for up to 10 minutes and is gone once cleared', async () => {
    const user = await createUser();
    expect(await readEvaluated(user.id)).toBeNull();
    await evaluate(user.id, [{ family: 'SLEEP_GOAL', current: 2, best: 5 }]);
    expect(await readEvaluated(user.id)).toEqual([{ family: 'SLEEP_GOAL', current: 2, best: 5 }]);
    const ttl = await connection.ttl(markerKey(user.id));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(EVALUATION_TTL_SECONDS);
    await clearAchievementsMarker(user.id);
    expect(await readEvaluated(user.id)).toBeNull();
  });

  it('ignores a marker written by an evaluation that a save overtook, so the next load evaluates again', async () => {
    const user = await createUser();
    expect(await evaluationVersion(user.id)).toBe(0);
    // An evaluation reads the version, then a check-in or goal save lands before it writes its marker.
    const version = await evaluationVersion(user.id);
    await clearAchievementsMarker(user.id);
    await markEvaluated(user.id, version, [{ family: 'SLEEP_GOAL', current: 1, best: 1 }]);
    expect(await readEvaluated(user.id)).toBeNull();
    // The next evaluation reads the new version and its marker holds.
    expect(await evaluationVersion(user.id)).toBe(1);
    await evaluate(user.id, [{ family: 'SLEEP_GOAL', current: 2, best: 2 }]);
    expect(await readEvaluated(user.id)).toEqual([{ family: 'SLEEP_GOAL', current: 2, best: 2 }]);
    expect(await connection.ttl(versionKey(user.id))).toBeGreaterThan(EVALUATION_TTL_SECONDS);
  });

  it('reads a Redis failure as "not evaluated" and logs only the event, the user id and the error class', async () => {
    const user = await createUser();
    await evaluate(user.id, []);
    const mget = jest.spyOn(connection, 'mget').mockRejectedValueOnce(new Error('down'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await readEvaluated(user.id)).toBeNull();
      expect(JSON.parse(String(log.mock.calls[0]![0]))).toEqual({ event: 'achievements.marker_read_failed', userId: user.id, error: 'Error' });
    } finally {
      mget.mockRestore();
      log.mockRestore();
    }
  });

  it('gives up on a Redis call that never answers (the connection queues while Redis is down)', async () => {
    const user = await createUser();
    const never = new Promise<never>(() => {});
    const mget = jest.spyOn(connection, 'mget').mockReturnValueOnce(never as ReturnType<typeof connection.mget>);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const started = Date.now();
      expect(await readEvaluated(user.id)).toBeNull();
      expect(Date.now() - started).toBeGreaterThanOrEqual(MARKER_TIMEOUT_MS - 50);
      expect(JSON.parse(String(log.mock.calls[0]![0]))).toEqual({ event: 'achievements.marker_read_failed', userId: user.id, error: 'TimeoutError' });
    } finally {
      mget.mockRestore();
      log.mockRestore();
    }
  });

  it('writes no marker when the version could not be read', async () => {
    const user = await createUser();
    const get = jest.spyOn(connection, 'get').mockRejectedValueOnce(new Error('down'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const version = await evaluationVersion(user.id);
      expect(version).toBeNull();
      expect(JSON.parse(String(log.mock.calls[0]![0]))).toEqual({ event: 'achievements.version_read_failed', userId: user.id, error: 'Error' });
      await markEvaluated(user.id, version, []);
      expect(await connection.exists(markerKey(user.id))).toBe(0);
    } finally {
      get.mockRestore();
      log.mockRestore();
    }
  });
});

describe('updateSleepGoal writes the goal history', () => {
  it('records a lowered sleep goal as a reset, with the goal before it dated the day before', async () => {
    const user = await createUser();
    await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-06', 450, true]]);
  });

  it('keeps only the last change of a day: lowering and restoring the same day is no reset', async () => {
    const user = await createUser();
    await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW);
    await updateSleepGoal(user.id, { sleepGoalMinutes: 480 }, LATER_SAME_DAY);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-06', 480, false]]);
  });

  it('records a raised goal without a reset, and compares a later day with the goal before that day', async () => {
    const user = await createUser();
    await updateSleepGoal(user.id, { sleepGoalMinutes: 510 }, NOW);
    await updateSleepGoal(user.id, { sleepGoalMinutes: 495 }, NEXT_DAY);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-06', 510, false], ['2026-10-07', 495, true]]);
  });

  it("compares a change made on a starting row's day with the starting goal", async () => {
    const user = await createUser();
    await prisma.goalChange.create({ data: { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day('2026-10-06'), resetsStreak: false } });
    await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-06', 450, true]]);
    await updateSleepGoal(user.id, { sleepGoalMinutes: 480 }, LATER_SAME_DAY);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-06', 480, false]]);
  });

  it('writes nothing when a value does not change, or for the wake goal', async () => {
    const user = await createUser();
    await updateSleepGoal(user.id, { sleepGoalMinutes: 480, wakeGoal: '07:00' }, NOW);
    expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
  });

  it('stores only the value of its own kind on every row', async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { bedtimeGoal: '23:00' } });
    await updateSleepGoal(user.id, { sleepGoalMinutes: 450, bedtimeGoal: '22:45' }, NOW);
    const all = await prisma.goalChange.findMany({ where: { userId: user.id } });
    expect(all).toHaveLength(4);
    for (const row of all) {
      if (row.kind === 'SLEEP_MINUTES') expect(row.bedtime).toBeNull();
      else expect(row.sleepMinutes).toBeNull();
    }
  });

  it("dates a change by the user's local day (Pacific/Auckland is already Oct 7)", async () => {
    const user = await createUser({ timezone: 'Pacific/Auckland' });
    await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, LATER_SAME_DAY);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-06', 480, false], ['2026-10-07', 450, true]]);
  });

  it('resets the bedtime streak when the goal moves more than 30 minutes or is cleared', async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { bedtimeGoal: '23:00' } });
    await updateSleepGoal(user.id, { bedtimeGoal: '23:30' }, NOW);
    expect(await rows(user.id, 'BEDTIME')).toEqual([['2026-10-05', '23:00', false], ['2026-10-06', '23:30', false]]);
    await updateSleepGoal(user.id, { bedtimeGoal: '23:31' }, LATER_SAME_DAY);
    expect((await rows(user.id, 'BEDTIME')).at(-1)).toEqual(['2026-10-06', '23:31', true]);
    await updateSleepGoal(user.id, { bedtimeGoal: null }, NEXT_DAY);
    expect((await rows(user.id, 'BEDTIME')).at(-1)).toEqual(['2026-10-07', null, true]);
  });

  it('compares a first bedtime goal with the usual bedtime of the previous nights', async () => {
    const near = await createUser();
    await seedNights(near.id, '2026-09-25', Array(10).fill(450), () => ({ bedtime: '23:30' }));
    await updateSleepGoal(near.id, { bedtimeGoal: '23:15' }, NOW);
    expect((await rows(near.id, 'BEDTIME')).at(-1)).toEqual(['2026-10-06', '23:15', false]);

    const far = await createUser();
    await seedNights(far.id, '2026-09-25', Array(10).fill(450), () => ({ bedtime: '23:30' }));
    await updateSleepGoal(far.id, { bedtimeGoal: '22:30' }, NOW);
    expect((await rows(far.id, 'BEDTIME')).at(-1)).toEqual(['2026-10-06', '22:30', true]);

    const unknown = await createUser();
    await updateSleepGoal(unknown.id, { bedtimeGoal: '23:00' }, NOW);
    expect((await rows(unknown.id, 'BEDTIME')).at(-1)).toEqual(['2026-10-06', '23:00', true]);
  });

  it('clears the evaluation marker on every save', async () => {
    const user = await createUser();
    await evaluate(user.id, []);
    await updateSleepGoal(user.id, { wakeGoal: '07:00' }, NOW);
    expect(await readEvaluated(user.id)).toBeNull();
  });

  it('still saves and returns the goal when clearing the marker never answers', async () => {
    const user = await createUser();
    const hanging = { incr: () => hanging, expire: () => hanging, del: () => hanging, exec: () => new Promise(() => {}) };
    const multi = jest.spyOn(connection, 'multi').mockReturnValueOnce(hanging as unknown as ReturnType<typeof connection.multi>);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await updateSleepGoal(user.id, { bedtimeGoal: '23:00' }, NOW)).toEqual({ sleepGoalMinutes: 480, bedtimeGoal: '23:00', wakeGoal: null });
      expect(JSON.parse(String(log.mock.calls[0]![0]))).toEqual({ event: 'achievements.marker_clear_failed', userId: user.id, error: 'TimeoutError' });
    } finally {
      multi.mockRestore();
      log.mockRestore();
    }
  });

  it('puts a change on a later day already in the history (a save made further east), not before it', async () => {
    const user = await createUser({ sleepGoalMinutes: 510 });
    await prisma.goalChange.createMany({
      data: [
        { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day('2026-10-05'), resetsStreak: false },
        { userId: user.id, kind: 'SLEEP_MINUTES', sleepMinutes: 510, effectiveOn: day('2026-10-07'), resetsStreak: false },
      ],
    });
    await updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW);
    expect(await rows(user.id, 'SLEEP_MINUTES')).toEqual([['2026-10-05', 480, false], ['2026-10-07', 450, true]]);
  });

  it('returns null and writes nothing for an unknown user', async () => {
    expect(await updateSleepGoal('00000000-0000-4000-8000-000000000000', { sleepGoalMinutes: 450 }, NOW)).toBeNull();
  });

  it('saves the goal and its history in one transaction: a failed GoalChange write saves neither', async () => {
    const user = await createUser();
    await evaluate(user.id, []);
    const spy = jest.spyOn(goalChanges, 'recordGoalChanges').mockImplementationOnce(async (tx, userId) => {
      // Part of the history is written, then the write fails: everything must roll back.
      await tx.goalChange.create({ data: { userId, kind: 'SLEEP_MINUTES', sleepMinutes: 450, effectiveOn: day('2026-10-06'), resetsStreak: true } });
      throw new Error('goal change write failed');
    });
    try {
      await expect(updateSleepGoal(user.id, { sleepGoalMinutes: 450 }, NOW)).rejects.toThrow('goal change write failed');
    } finally {
      spy.mockRestore();
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sleepGoalMinutes).toBe(480);
    expect(await prisma.goalChange.count({ where: { userId: user.id } })).toBe(0);
    // Nothing was saved, so the evaluation marker is left as it was.
    expect(await readEvaluated(user.id)).toEqual([]);
  });

  it('reads the usual bedtime before the transaction starts', async () => {
    const user = await createUser();
    const usual = jest.spyOn(goalChanges, 'usualBedtime');
    const transaction = jest.spyOn(prisma, '$transaction');
    try {
      await updateSleepGoal(user.id, { bedtimeGoal: '23:00' }, NOW);
      expect(usual).toHaveBeenCalledTimes(1);
      expect(usual.mock.invocationCallOrder[0]!).toBeLessThan(transaction.mock.invocationCallOrder[0]!);
    } finally {
      usual.mockRestore();
      transaction.mockRestore();
    }
  });
});
