import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { encryptToken } from '../../src/crypto/tokenCipher';
import { USER_OWNED_MODELS, delegateFor, type OwnedCounts, type UserOwnedModel } from '../../src/users/deletion';

/** A user with the given email and no data. */
export async function createUserWithEmail(email: string) {
  return prisma.user.create({
    data: { email, name: 'Test User'},
  });
}

/**
 * Gives the user at least one row in EVERY user-owned table. It is written out
 * by hand on purpose: when a table is added to USER_OWNED_MODELS,
 * `countOwnedRows` reports 0 for it until it is seeded here, and the tests
 * that expect a row in every table fail, so a new table is forced into these
 * deletion tests.
 *
 * `opts.subscriptionId` sets HealthConnection.webhookSubscriptionId; the stored
 * refresh token is `refreshToken` (encrypted at rest, as in production).
 */
export async function seedAllOwnedRows(
  userId: string,
  opts: { refreshToken?: string; subscriptionId?: string | null } = {},
): Promise<void> {
  const day = new Date('2026-09-01T00:00:00.000Z');
  const uniq = randomUUID();

  await prisma.biometricRecord.create({ data: { userId, metricType: 'HRV', value: 51, recordedAt: day } });
  await prisma.sleepSession.create({
    data: { userId, startTime: new Date('2026-08-31T22:00:00Z'), endTime: new Date('2026-09-01T06:00:00Z'), minutesAsleep: 450 },
  });
  await prisma.userDailyFeatures.create({ data: { userId, date: day, algorithmVersion: 'v-test' } });
  await prisma.baselineSnapshot.create({ data: { userId, metric: 'HRV', date: day, daysOfHistory: 3, algorithmVersion: 'v-test' } });
  await prisma.dailyScore.create({
    data: { userId, date: day, type: 'RECOVERY', algorithmVersion: 'v-test', confidenceLevel: 'HIGH', factors: [] },
  });
  await prisma.scoreInputFlag.create({ data: { userId, metric: 'HRV', date: day, flag: 'OUTLIER', value: 1, median: 2, mad: 3 } });
  await prisma.habitLog.create({
    data: { userId, habitType: 'CAFFEINE', value: 2, unit: 'cups', loggedAt: day, habitDay: day },
  });
  await prisma.habitCheckIn.create({ data: { userId, habitDay: day } });
  await prisma.habitType.create({
    data: { userId, type: `custom-${uniq}`, label: 'Custom', unit: 'units', exposureThreshold: 1 },
  });
  await prisma.habitCorrelation.create({
    data: { userId, habitType: 'CAFFEINE', factor: 'hrvZ', lagDays: 1, status: 'CANDIDATE', lastEvaluatedAt: day, lastRunKey: '2026-W36' },
  });
  const conversation = await prisma.coachConversation.create({ data: { userId } });
  await prisma.coachMessage.create({ data: { conversationId: conversation.id, userId, role: 'USER', text: 'seed message' } });
  await prisma.coachMemory.create({ data: { userId, category: 'PREFERENCE', value: 'seed memory' } });
  await prisma.coachDigest.create({ data: { userId, text: 'seed digest', personaId: 'default', weekStart: day } });
  await prisma.coachDaySummary.create({ data: { userId, date: day, text: 'seed summary', spans: [], source: 'TEMPLATE' } });
  await prisma.recap.create({
    data: { userId, kind: 'WEEK', periodStart: day, periodEnd: new Date('2026-09-07T00:00:00.000Z'), status: 'SKIPPED', sleepGoalMinutes: 480 },
  });
  await prisma.achievement.create({
    data: { userId, family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: day, weekStart: new Date('2026-08-31T00:00:00.000Z'), monthStart: day },
  });
  await prisma.goalChange.create({ data: { userId, kind: 'SLEEP_MINUTES', sleepMinutes: 480, effectiveOn: day, resetsStreak: false } });
  await prisma.coachConsent.create({ data: { userId, version: 'v-test' } });
  await prisma.pushToken.create({ data: { userId, token: `push-${uniq}`, platform: 'ios' } });
  await prisma.session.create({
    data: { userId, token: `session-${uniq}`, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  await prisma.account.create({ data: { userId, providerId: 'google', accountId: `google-${uniq}` } });
  await prisma.healthConnection.create({
    data: {
      userId,
      healthUserId: `health-${uniq}`,
      encryptedAccessToken: encryptToken('seed-access-token'),
      encryptedRefreshToken: encryptToken(opts.refreshToken ?? 'seed-refresh-token'),
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
      webhookSubscriptionId: opts.subscriptionId === undefined ? `sub-${uniq}` : opts.subscriptionId,
    },
  });
}

/** Row count per owned table for one user. */
export async function countOwnedRows(userId: string): Promise<Omit<OwnedCounts, 'User'>> {
  const counts = {} as Omit<OwnedCounts, 'User'>;
  for (const model of USER_OWNED_MODELS) {
    counts[model as UserOwnedModel] = await delegateFor(prisma, model).count({ where: { userId } });
  }
  return counts;
}

export function totalRows(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}
