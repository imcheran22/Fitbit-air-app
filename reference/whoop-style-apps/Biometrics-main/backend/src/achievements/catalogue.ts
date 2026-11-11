// The badge catalogue (spec 2026-10-06 §2): seven families, five levels each — I Bronze, II Silver,
// III Gold, IV Diamond, V Coach. A level needs ONE run (or month count) of its length; nothing is
// cumulative across runs.

import type { AchievementFamily, GoalChangeKind } from '@prisma/client';

export type FamilyKind = 'streak' | 'monthly';
export type MonthlyMilestone = 'bestRecoveryWeek' | 'everyDayLogged' | 'steadiestMonth';
export type Thresholds = readonly [number, number, number, number, number];

export interface FamilyDef {
  family: AchievementFamily;
  kind: FamilyKind;
  thresholds: Thresholds;
  /** Monthly families: the Recap milestone key that makes a month count. */
  milestone?: MonthlyMilestone;
  /** Sleep families: the goal whose easing restarts the streak from the next night. */
  goalKind?: GoalChangeKind;
}

export const MAX_LEVEL = 5;

export const FAMILIES: readonly FamilyDef[] = [
  { family: 'SLEEP_GOAL', kind: 'streak', thresholds: [3, 7, 14, 30, 100], goalKind: 'SLEEP_MINUTES' },
  { family: 'STEADY_BEDTIME', kind: 'streak', thresholds: [3, 7, 14, 30, 100], goalKind: 'BEDTIME' },
  { family: 'STEP_GOAL', kind: 'streak', thresholds: [3, 7, 14, 30, 100] },
  { family: 'CHECK_IN', kind: 'streak', thresholds: [7, 14, 30, 60, 180] },
  { family: 'BEST_RECOVERY_WEEK', kind: 'monthly', thresholds: [1, 3, 6, 12, 24], milestone: 'bestRecoveryWeek' },
  { family: 'EVERY_DAY_LOGGED', kind: 'monthly', thresholds: [1, 3, 6, 12, 24], milestone: 'everyDayLogged' },
  { family: 'STEADIEST_MONTH', kind: 'monthly', thresholds: [1, 2, 4, 6, 12], milestone: 'steadiestMonth' },
];

export const ALL_FAMILIES: readonly AchievementFamily[] = FAMILIES.map((f) => f.family);

export function familyDef(family: AchievementFamily): FamilyDef {
  const def = FAMILIES.find((f) => f.family === family);
  if (!def) throw new Error(`Unknown achievement family ${family}`);
  return def;
}

/** Levels 1..5 whose threshold `best` reached. */
export function levelsReached(def: FamilyDef, best: number): number[] {
  return def.thresholds.flatMap((t, i) => (best >= t ? [i + 1] : []));
}

/** The threshold of the level above `level` (0..5); null at the top. */
export function nextThreshold(def: FamilyDef, level: number): number | null {
  return level >= MAX_LEVEL ? null : def.thresholds[level]!;
}
