import type { DailyScore } from '@prisma/client';
import { computeDailyScore } from '../../src/scoring/compute';
import { toDailyScoreDTO } from '../../src/scoring/dto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createUser, seedHistory, seedSessions, day } from './dbHelpers';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Spec 2026-10-03 §2 "Sleep goal and scores": every score records the goal it
// used, so "vs your goal" never has to guess what the goal was that day.
describe('the sleep goal on stored factors', () => {
  it('stores goalMinutes on SLEEP_DEBT and SLEEP_DURATION only', async () => {
    const user = await createUser({ sleepGoalMinutes: 450 });
    const last = await seedHistory(user.id, '2026-06-01', 45);
    await seedSessions(user.id, '2026-06-01', 45);
    expect(await computeDailyScore(user.id, last)).toBe('scored');

    const rows = await prisma.dailyScore.findMany({ where: { userId: user.id, date: day(last) } });
    const factors = rows.flatMap((r) => r.factors as Array<Record<string, unknown>>);
    const byFactor = Object.fromEntries(factors.map((f) => [f.factor, f]));
    expect(byFactor.SLEEP_DEBT!.goalMinutes).toBe(450);
    expect(byFactor.SLEEP_DURATION!.goalMinutes).toBe(450);
    for (const f of factors.filter((x) => x.factor !== 'SLEEP_DEBT' && x.factor !== 'SLEEP_DURATION')) {
      expect(f).not.toHaveProperty('goalMinutes');
    }
  });

  it('toDailyScoreDTO passes goalMinutes through, and omits it when the stored factor has none', () => {
    const base = { factor: 'SLEEP_DEBT', z: 0.5, weight: 0.3, contribution: 0.15, points: 1, imputed: false, excluded: false };
    const row = (factors: unknown[]) =>
      ({
        id: 'x',
        userId: 'u',
        date: new Date('2026-09-01T00:00:00Z'),
        type: 'RECOVERY',
        score: 60,
        confidenceLevel: 'HIGH',
        algorithmVersion: 'v3',
        factors,
      }) as unknown as DailyScore;

    expect(toDailyScoreDTO(row([{ ...base, goalMinutes: 450 }]), []).factors[0]!.goalMinutes).toBe(450);
    expect(toDailyScoreDTO(row([base]), []).factors[0]).not.toHaveProperty('goalMinutes');
  });
});
