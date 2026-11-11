// The Profile passport's numbers (spec 2026-10-13 §2): the morning check-in streak, how many buddies the user
// has, and the local date they joined. Sent with the user's own identity only.

import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { checkInStreak } from '../social/checkins';

export interface ProfileStats {
  checkInStreak: number;
  buddyCount: number;
  /** YYYY-MM-DD in the user's zone. */
  joinedOn: string;
}

export async function getProfileStats(userId: string, now: Date): Promise<ProfileStats | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, timezone: true } });
  if (!user) return null;
  const [streak, buddyCount] = await Promise.all([
    checkInStreak(userId, now),
    prisma.buddyPair.count({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
  ]);
  return { checkInStreak: streak, buddyCount, joinedOn: localCivilDateOrUtc(user.createdAt, user.timezone) };
}
