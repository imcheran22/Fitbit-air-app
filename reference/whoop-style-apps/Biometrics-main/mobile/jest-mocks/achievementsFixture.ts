// Badge test data. Kept out of __tests__ so jest does not collect it as a suite (like forecastFixture.ts).
import type { AchievementFamily, Achievements, FamilyAchievements } from '../src/api/achievements';

export const FAMILY_THRESHOLDS: Record<AchievementFamily, number[]> = {
  SLEEP_GOAL: [3, 7, 14, 30, 100],
  STEADY_BEDTIME: [3, 7, 14, 30, 100],
  STEP_GOAL: [3, 7, 14, 30, 100],
  CHECK_IN: [7, 14, 30, 60, 180],
  BEST_RECOVERY_WEEK: [1, 3, 6, 12, 24],
  EVERY_DAY_LOGGED: [1, 3, 6, 12, 24],
  STEADIEST_MONTH: [1, 2, 4, 6, 12],
};
const ORDER = Object.keys(FAMILY_THRESHOLDS) as AchievementFamily[];
const MONTHLY: ReadonlySet<AchievementFamily> = new Set(['BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH']);

/** One family as the server answers it; nextThreshold follows `over.level` unless given. */
export function familyFixture(family: AchievementFamily, over: Partial<FamilyAchievements> = {}): FamilyAchievements {
  const level = over.level ?? 0;
  const thresholds = FAMILY_THRESHOLDS[family];
  return {
    family, kind: MONTHLY.has(family) ? 'monthly' : 'streak', level, thresholds, levels: [], current: 0, best: 0,
    nextThreshold: level >= 5 ? null : thresholds[level]!, ...over,
  };
}

export function achievementsFixture(
  families: Partial<Record<AchievementFamily, Partial<FamilyAchievements>>> = {},
  over: Partial<Achievements> = {},
): Achievements {
  return { since: '2026-10-01', families: ORDER.map((f) => familyFixture(f, families[f])), uncelebrated: [], ...over };
}
