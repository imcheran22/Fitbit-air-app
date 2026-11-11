import type { AchievementFamily, Achievements } from '../api/achievements';
import type { RecapComparison, RecapKind, RecapMilestones, RecapStats } from '../api/recaps';
import { countLabel, tierName } from './badges';
import type { MilestoneTile } from './milestones';
import { MONTH_LONG, MONTH_SHORT } from './heatmap';
import { formatShortDuration, formatTextDuration } from './sleepStats';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

export function monthName(periodStart: string): string {
  return MONTH_LONG[Number(periodStart.slice(5, 7)) - 1]!;
}

export function shortDate(date: string): string {
  return `${MONTH_SHORT[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}

export function weekdayName(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

export function recapTitle(r: { kind: RecapKind; periodStart: string }): string {
  return r.kind === 'MONTH' ? `${monthName(r.periodStart)} ${r.periodStart.slice(0, 4)}` : `Week of ${shortDate(r.periodStart)}`;
}

export function readyCardTitle(r: { kind: RecapKind; periodStart: string }): string {
  return r.kind === 'MONTH' ? `Your ${monthName(r.periodStart)} recap is ready` : 'Your week is ready';
}

/** A ringed avatar's accessibility hint: what is ready and what a tap does (a week plays its story). */
export function storyRingHint(r: { kind: RecapKind; periodStart: string }): string {
  return `${readyCardTitle(r)}. ${r.kind === 'WEEK' ? 'Play your story' : 'Open your recap'}`;
}

/** 480 → "8h", 450 → "7h 30m". */
export function goalLabel(minutes: number): string {
  const m = Math.round(minutes);
  return m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export type CardStatKey = 'avgSleep' | 'streak' | 'bestRecovery' | 'steps';
export interface CardStat {
  key: CardStatKey;
  label: string;
  value: string;
}

/** The monthly card's stats, in a fixed order (spec §3: avg sleep, longest streak, best recovery, steps). */
export function cardStats(stats: RecapStats): CardStat[] {
  const out: CardStat[] = [];
  if (stats.avgSleepMinutes !== undefined) out.push({ key: 'avgSleep', label: 'Average sleep', value: formatTextDuration(stats.avgSleepMinutes) });
  if ((stats.longestOnGoalStreak ?? 0) > 0) out.push({ key: 'streak', label: 'Longest streak', value: plural(stats.longestOnGoalStreak!, 'night') });
  if (stats.bestRecovery) out.push({ key: 'bestRecovery', label: 'Best recovery', value: String(stats.bestRecovery.score) });
  if (stats.steps) out.push({ key: 'steps', label: 'Steps a day', value: stats.steps.dailyAverage.toLocaleString('en-US') });
  return out;
}

/** "Sep 28 – Oct 4". */
export function weekRange(periodStart: string, periodEnd: string): string {
  return `${shortDate(periodStart)} – ${shortDate(periodEnd)}`;
}

export type ChangeKey = 'avgSleep' | 'spread' | 'recovery';
export type ChangeTone = 'better' | 'worse' | 'same';

/**
 * A stored comparison as a signed change ("+18m", "−9m", "+3 pts") and whether it is better: more
 * sleep, a smaller bedtime spread and more recovery are better. Minus is U+2212, as in the design.
 */
export function signedChange(key: ChangeKey, delta: number): { text: string; tone: ChangeTone } {
  const d = Math.round(delta);
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  const size = key === 'recovery' ? `${Math.abs(d)} ${Math.abs(d) === 1 ? 'pt' : 'pts'}` : formatShortDuration(Math.abs(d));
  const better = key === 'spread' ? d < 0 : d > 0;
  return { text: `${sign}${size}`, tone: d === 0 ? 'same' : better ? 'better' : 'worse' };
}

export interface CompareChange {
  key: ChangeKey;
  label: string;
  /** "+18m", "−9m", "+3 pts". */
  text: string;
  tone: ChangeTone;
}

/**
 * "Compared with last month": only the comparisons the server could make, each a signed change the
 * screen colours by tone (a smaller bedtime spread is the better direction).
 */
export function compareChanges(c: RecapComparison | undefined): CompareChange[] {
  const rows: CompareChange[] = [];
  const add = (key: ChangeKey, label: string, delta: number | undefined) => {
    if (delta !== undefined) rows.push({ key, label, ...signedChange(key, delta) });
  };
  add('avgSleep', 'Average sleep', c?.avgSleepDelta);
  add('spread', 'Bedtime spread', c?.bedtimeSpreadDelta);
  add('recovery', 'Recovery average', c?.avgRecoveryDelta);
  return rows;
}

export type MilestoneKey = keyof RecapMilestones;

export interface MilestoneTileContent extends MilestoneTile {
  key: MilestoneKey;
}

export interface MonthBadges {
  achievements: Achievements;
  periodStart: string;
  periodEnd: string;
  /** This is the newest month recap: only it shows progress toward the next level. */
  latest: boolean;
}

const MONTHLY_FAMILY: Partial<Record<MilestoneKey, AchievementFamily>> = {
  bestRecoveryWeek: 'BEST_RECOVERY_WEEK',
  everyDayLogged: 'EVERY_DAY_LOGGED',
  steadiestMonth: 'STEADIEST_MONTH',
};

/**
 * The month's milestones as tiles. Without badges (a backend older than them, or not loaded yet):
 * all four kinds, as before. With badges (achievements spec §6): the three monthly families only —
 * the Sleep goal streak badge replaced the streak tile. For a month on or after the badge start
 * date, each tile says whether a level of its family was earned in this month; only the newest
 * month recap also shows progress toward the next level (an older month's progress would be
 * today's, not that month's). A locked tile says what the milestone is, never how close the month came.
 */
export function milestoneTiles(m: RecapMilestones | undefined, badges?: MonthBadges): MilestoneTileContent[] {
  const tiles: MilestoneTileContent[] = [
    { key: 'streak', label: m?.streak ? `${plural(m.streak.nights, 'night')} on goal in a row` : 'Nights on goal in a row', glyph: 'star', earned: !!m?.streak },
    { key: 'bestRecoveryWeek', label: 'Best recovery week', glyph: 'heart', earned: !!m?.bestRecoveryWeek },
    { key: 'everyDayLogged', label: 'Every night logged', glyph: 'calendar', earned: !!m?.everyDayLogged },
    { key: 'steadiestMonth', label: 'Steadiest bedtimes yet', glyph: 'moon', earned: !!m?.steadiestMonth },
  ];
  if (!badges) return tiles;
  const { achievements, periodStart, periodEnd, latest } = badges;
  return tiles
    .filter((tile) => tile.key !== 'streak')
    .map((tile) => {
      const f = achievements.families.find((x) => x.family === MONTHLY_FAMILY[tile.key]);
      if (!f || periodStart < achievements.since) return tile;
      const levelUp = f.levels.some((l) => l.earnedOn >= periodStart && l.earnedOn <= periodEnd);
      if (!latest) return { ...tile, levelUp };
      const progress = f.nextThreshold === null
        ? 'Top level'
        : `${Math.min(f.current, f.nextThreshold)} of ${countLabel(f.family, f.nextThreshold)} for ${tierName(f.level + 1)}`;
      return { ...tile, progress, levelUp };
    });
}
