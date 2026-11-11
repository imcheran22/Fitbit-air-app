import type { AchievementFamily, Achievements, FamilyAchievements, FamilyKind } from '../api/achievements';
import { MONTH_SHORT } from './heatmap';

// Badge names, copy and selectors (spec 2026-10-06 §2 and §6), pure so the Profile card, the Badges
// screens, the celebration and the recap cards share one source.

export const FAMILY_ORDER: readonly AchievementFamily[] = [
  'SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH',
];
export const MAX_LEVEL = 5;
export const TOTAL_LEVELS = FAMILY_ORDER.length * MAX_LEVEL;

export const FAMILY_NAMES: Record<AchievementFamily, string> = {
  SLEEP_GOAL: 'Sleep goal streak',
  STEADY_BEDTIME: 'Steady bedtime',
  STEP_GOAL: 'Step goal streak',
  CHECK_IN: 'Daily check-in',
  BEST_RECOVERY_WEEK: 'Best recovery week',
  EVERY_DAY_LOGGED: 'Every day logged',
  STEADIEST_MONTH: 'Steadiest month',
};

export const FAMILY_SHORT: Record<AchievementFamily, string> = {
  SLEEP_GOAL: 'Sleep goal',
  STEADY_BEDTIME: 'Bedtime',
  STEP_GOAL: 'Steps',
  CHECK_IN: 'Check-in',
  BEST_RECOVERY_WEEK: 'Recovery',
  EVERY_DAY_LOGGED: 'Every day',
  STEADIEST_MONTH: 'Steadiest',
};

export const FAMILY_RULES: Record<AchievementFamily, string> = {
  SLEEP_GOAL: 'Nights in a row at or over your sleep goal',
  STEADY_BEDTIME: 'Nights in a row asleep within 30 min of your bedtime goal, or of your usual bedtime',
  STEP_GOAL: 'Finished days in a row at 10,000 steps',
  CHECK_IN: 'Days in a row checked in on "Anything to log today?" the same day',
  BEST_RECOVERY_WEEK: 'Your best week of the month beats last month’s best',
  EVERY_DAY_LOGGED: 'Sleep data for every day of the month',
  STEADIEST_MONTH: 'Your lowest bedtime spread yet (3+ earlier months)',
};

export const LEVEL_NUMERALS = ['I', 'II', 'III', 'IV', 'V'] as const;
export const TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Coach'] as const;

const UNIT: Record<AchievementFamily, 'night' | 'day' | 'month'> = {
  SLEEP_GOAL: 'night', STEADY_BEDTIME: 'night', STEP_GOAL: 'day', CHECK_IN: 'day',
  BEST_RECOVERY_WEEK: 'month', EVERY_DAY_LOGGED: 'month', STEADIEST_MONTH: 'month',
};

export function unitWord(family: AchievementFamily, n: number): string {
  return n === 1 ? UNIT[family] : `${UNIT[family]}s`;
}

export function countLabel(family: AchievementFamily, n: number): string {
  return `${n} ${unitWord(family, n)}`;
}

export function numeral(level: number): string {
  return LEVEL_NUMERALS[level - 1] ?? '';
}

export function tierName(level: number): string {
  return TIER_NAMES[level - 1] ?? '';
}

/** "Sleep goal streak, level II, Silver" or "Sleep goal streak, locked": a badge for screen readers. */
export function badgeLabel(family: AchievementFamily, level: number): string {
  return level > 0 ? `${FAMILY_NAMES[family]}, level ${numeral(level)}, ${tierName(level)}` : `${FAMILY_NAMES[family]}, locked`;
}

/** "Sleep goal streak III". */
export function levelTitle(family: AchievementFamily, level: number): string {
  return `${FAMILY_NAMES[family]} ${numeral(level)}`;
}

/** "Sleep goal II": under a small badge. */
export function shortLevelTitle(family: AchievementFamily, level: number): string {
  return `${FAMILY_SHORT[family]} ${numeral(level)}`;
}

/** "Oct 8". */
export function shortDay(date: string): string {
  return `${MONTH_SHORT[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}

/** Levels earned across every family: "BADGES · n OF 35". */
export function earnedCount(a: Achievements): number {
  return a.families.reduce((n, f) => n + f.level, 0);
}

export interface NextUp { family: AchievementFamily; nextLevel: number; current: number; threshold: number }

/** The family closest to its next level (current / next threshold); catalogue order on a tie. */
export function nextUp(a: Achievements): NextUp | null {
  let best: NextUp | null = null;
  let bestRatio = -1;
  for (const family of FAMILY_ORDER) {
    const f = a.families.find((x) => x.family === family);
    if (!f || f.nextThreshold === null) continue;
    const ratio = Math.min(f.current, f.nextThreshold) / f.nextThreshold;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = { family, nextLevel: f.level + 1, current: f.current, threshold: f.nextThreshold };
    }
  }
  return best;
}

const VALUE_LINES: Record<AchievementFamily, (count: string) => string> = {
  SLEEP_GOAL: (c) => `${c} in a row at your sleep goal.`,
  STEADY_BEDTIME: (c) => `${c} in a row asleep near your bedtime.`,
  STEP_GOAL: (c) => `${c} in a row at 10,000 steps.`,
  CHECK_IN: (c) => `${c} in a row checked in on time.`,
  BEST_RECOVERY_WEEK: (c) => `${c} with a best recovery week.`,
  EVERY_DAY_LOGGED: (c) => `${c} with every day logged.`,
  STEADIEST_MONTH: (c) => `${c} of your steadiest bedtimes yet.`,
};

/** The celebration's line under the level name. */
export function valueLine(family: AchievementFamily, value: number): string {
  return VALUE_LINES[family](countLabel(family, value));
}

/** The coach's fixed line: "<n> more <unit> for <next level>", or "Top level!". Level 0 counts from 0 to Bronze. */
export function coachLine(family: AchievementFamily, level: number, thresholds: readonly number[]): string {
  const reached = level < 1 ? 0 : thresholds[level - 1];
  const next = thresholds[Math.max(0, level)];
  if (level >= MAX_LEVEL || reached === undefined || next === undefined) return 'Top level!';
  const n = next - reached;
  return `${n} more ${unitWord(family, n)} for ${tierName(level + 1)}`;
}

export interface LadderRow { level: number; earned: boolean; text: string; tag: 'EARNED' | 'NEXT' | null }

/** One rung of the detail screen's ladder. */
export function ladderRow(f: FamilyAchievements, level: number): LadderRow {
  const earned = f.levels.find((l) => l.level === level);
  if (earned) return { level, earned: true, text: `Earned ${shortDay(earned.earnedOn)}`, tag: 'EARNED' };
  if (level === f.level + 1) {
    const n = Math.max(0, (f.thresholds[level - 1] ?? 0) - f.current);
    const more = `${n} more ${unitWord(f.family, n)}`;
    return { level, earned: false, text: f.kind === 'streak' ? `${more} in a row` : more, tag: 'NEXT' };
  }
  return { level, earned: false, text: 'Locked', tag: null };
}

/** "Level II · Silver · 9 / 14 nights", "Not yet · 0 / 1 month", "Level V · Coach". */
export function familyStatus(f: FamilyAchievements): string {
  const head = f.level > 0 ? `Level ${numeral(f.level)} · ${tierName(f.level)}` : 'Not yet';
  return f.nextThreshold === null ? head : `${head} · ${Math.min(f.current, f.nextThreshold)} / ${countLabel(f.family, f.nextThreshold)}`;
}

export interface BadgeRef { family: AchievementFamily; level: number }

/** Levels with earnedOn in [from, to], in catalogue then level order; [] with no badges. */
export function levelsEarnedBetween(a: Achievements | null, from: string, to: string, kind?: FamilyKind): BadgeRef[] {
  if (!a) return [];
  const out: BadgeRef[] = [];
  for (const family of FAMILY_ORDER) {
    const f = a.families.find((x) => x.family === family);
    if (!f || (kind !== undefined && f.kind !== kind)) continue;
    for (const l of [...f.levels].sort((x, y) => x.level - y.level)) {
      if (l.earnedOn >= from && l.earnedOn <= to) out.push({ family, level: l.level });
    }
  }
  return out;
}

/**
 * The same levels with each family's highest first (in the given family order), then the lower ones
 * (highest first), so a capped list shows the most families at their best (ruling F4).
 */
export function highestPerFamilyFirst(refs: readonly BadgeRef[]): BadgeRef[] {
  const byLevel = [...refs].sort((x, y) => y.level - x.level);
  const top: BadgeRef[] = [];
  const rest: BadgeRef[] = [];
  for (const family of new Set(refs.map((r) => r.family))) {
    const [best, ...lower] = byLevel.filter((r) => r.family === family);
    top.push(best!);
    rest.push(...lower);
  }
  return [...top, ...rest.sort((x, y) => y.level - x.level)];
}
