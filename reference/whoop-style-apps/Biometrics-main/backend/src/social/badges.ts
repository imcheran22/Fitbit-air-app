// Which badges are "today's news" for an author (shared by story frames and the today timeline, so both agree).

import type { AchievementFamily } from '@prisma/client';
import { localCivilDateOrUtc } from '../biometrics/civilDate';
import { shiftDate } from '../scoring/dates';

export interface BadgeRow { userId: string; family: AchievementFamily; level: number; earnedOn: Date; createdAt: Date }

/**
 * A badge is today's news when it was awarded in the author's local today for a run that ended today or yesterday
 * (a backfill or first evaluation awarding an old run is not); a jump of several levels at once keeps only the top
 * one per author and family. `authorOf` gives an author's local today and timezone (undefined = not in the circle).
 */
export function todaysTopBadges<T extends BadgeRow>(rows: T[], authorOf: (userId: string) => { today: string; timezone: string } | undefined): T[] {
  const top = new Map<string, T>();
  for (const b of rows) {
    const author = authorOf(b.userId);
    if (!author || localCivilDateOrUtc(b.createdAt, author.timezone) !== author.today) continue;
    const earnedOn = b.earnedOn.toISOString().slice(0, 10);
    if (earnedOn !== author.today && earnedOn !== shiftDate(author.today, -1)) continue;
    const key = `${b.userId}:${b.family}`;
    if ((top.get(key)?.level ?? 0) < b.level) top.set(key, b);
  }
  return [...top.values()];
}
