import { prisma } from '../../src/db/client';
import { authHeaderFor } from '../helpers/auth';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { ar1, dateAt, seededRandom } from './helpers';

export { createUser } from '../scoring/dbHelpers';

export async function authed(userId: string) {
  return authHeaderFor(userId);
}

export interface ScenarioOptions {
  start: string;
  days: number;
  seed: number;
  /** z shift applied to the night `lag` days after each exposed day (negative = worse). 0 = pure noise. */
  effect: number;
  lag?: number;
  habitType?: string;
  /** Logged value on an exposed day and on a "none" day. */
  exposedValue?: number;
}

/**
 * Seeds one user with `days` observed habit days (each a log: exposed value or
 * an explicit 0) and UserDailyFeatures rows whose hrvZ carries the effect. Only
 * the HRV z-series is written, so it is the only series with anything to test.
 */
export async function seedScenario(userId: string, o: ScenarioOptions): Promise<number[]> {
  const rand = seededRandom(o.seed);
  const lag = o.lag ?? 1;
  const habit = Array.from({ length: o.days }, () => (rand() < 0.4 ? 1 : 0));
  const noise = ar1(rand, o.days + 6, 0.3);

  await prisma.habitLog.createMany({
    data: habit.map((h, i) => ({
      userId,
      habitType: o.habitType ?? 'ALCOHOL',
      value: h === 1 ? (o.exposedValue ?? 3) : 0,
      unit: 'drinks',
      loggedAt: new Date(`${dateAt(o.start, i)}T20:00:00Z`),
      habitDay: civilDateToUtcMidnight(dateAt(o.start, i)),
    })),
  });

  await prisma.userDailyFeatures.createMany({
    data: noise.map((v, d) => {
      const z = v + (d - lag >= 0 && d - lag < o.days ? o.effect * habit[d - lag]! : 0);
      return {
        userId,
        date: civilDateToUtcMidnight(dateAt(o.start, d)),
        algorithmVersion: 'v1',
        hrvZ: z,
        hrvBaselineDeviationPct: z * 10,
      };
    }),
  });
  return habit;
}
