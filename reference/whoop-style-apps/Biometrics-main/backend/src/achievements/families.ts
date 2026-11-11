// Per-family day markers (spec 2026-10-06 §2 and §4). Pure: the inputs are already loaded.
//   Sleep goal:     each night's SLEEP rollup (wake date) vs the sleep goal in effect that night.
//   Steady bedtime: the main session's start within 30 min of the bedtime goal in effect; with no
//                   goal, of the median of the previous 14 nights with a bedtime (needs 7).
//   Step goal:      finished local days (today never counts) with steps >= STEPS_GOAL.
//   Check-in:       habit days with an on-time check-in; today counts once it exists.
//   Monthly:        BUILT month recaps from the start date whose stored milestones have the key.

import type { AchievementFamily } from '@prisma/client';
import { STEPS_GOAL } from '../coach/tools/metrics';
import type { RecapData, RecapMilestones } from '../recap/types';
import { dateRange, shiftDate } from '../scoring/dates';
import { ALL_FAMILIES, FAMILIES, type MonthlyMilestone } from './catalogue';
import {
  BEDTIME_WINDOW_MINUTES, bedtimeSeries, changeInEffect, circularDistance, familyStartDate, goalChangesOf, hhmmToNoonMinutes,
  usualBedtimeBefore, type GoalChangeRow,
} from './goalHistory';
import { earnedLevels, summariseRuns, type EarnedLevel, type MarkedDay } from './runs';

export interface StreakInputs {
  /** The user's local date now: the last night that can have ended; steps days end before it. */
  today: string;
  /** The habit day now (04:00-local boundary). */
  habitToday: string;
  /** User.achievementsSince. */
  since: string;
  /** SLEEP and STEPS rollups and main-session bedtimes, including the nights before `since`. */
  data: RecapData;
  /** Any order; only SLEEP_MINUTES rows are read. */
  sleepChanges: readonly GoalChangeRow[];
  /** Any order; only BEDTIME rows are read. */
  bedtimeChanges: readonly GoalChangeRow[];
  /** The stored goals, used only when a user has no GoalChange row of that kind. */
  currentSleepGoal: number;
  currentBedtime: string | null;
  onTimeHabitDays: ReadonlySet<string>;
}

export interface MonthRecap { periodStart: string; periodEnd: string; milestones: RecapMilestones | undefined }
export interface FamilyStanding { family: AchievementFamily; current: number; best: number }
export interface FamilyResult extends FamilyStanding { reached: EarnedLevel[] }

const datesFrom = (from: string, to: string): string[] => (from <= to ? dateRange(from, to) : []);

export function sleepGoalDays(inp: Pick<StreakInputs, 'today' | 'since' | 'data' | 'sleepChanges' | 'currentSleepGoal'>): MarkedDay[] {
  const changes = goalChangesOf(inp.sleepChanges, 'SLEEP_MINUTES');
  return datesFrom(familyStartDate(inp.since, changes), inp.today).map((date): MarkedDay => {
    const minutes = inp.data.get(date)?.sleepMinutes;
    if (minutes === undefined || minutes <= 0) return { date, mark: 'none' };
    const goal = changeInEffect(changes, date)?.sleepMinutes ?? inp.currentSleepGoal;
    return { date, mark: minutes >= goal ? 'hit' : 'miss' };
  });
}

export function steadyBedtimeDays(inp: StreakInputs): MarkedDay[] {
  const changes = goalChangesOf(inp.bedtimeChanges, 'BEDTIME');
  const series = bedtimeSeries(inp.data);
  return datesFrom(familyStartDate(inp.since, changes), inp.today).map((date): MarkedDay => {
    const bedtime = inp.data.get(date)?.bedtime;
    if (bedtime === undefined) return { date, mark: 'none' };
    const change = changeInEffect(changes, date);
    const goal = change ? change.bedtime : inp.currentBedtime;
    const target = goal !== null ? hhmmToNoonMinutes(goal) : usualBedtimeBefore(series, date);
    if (target === null) return { date, mark: 'skip' };
    return { date, mark: circularDistance(bedtime, target) <= BEDTIME_WINDOW_MINUTES ? 'hit' : 'miss' };
  });
}

export function stepGoalDays(inp: StreakInputs): MarkedDay[] {
  return datesFrom(inp.since, shiftDate(inp.today, -1)).map((date): MarkedDay => {
    const steps = inp.data.get(date)?.steps;
    if (steps === undefined || steps <= 0) return { date, mark: 'none' };
    return { date, mark: steps >= STEPS_GOAL ? 'hit' : 'miss' };
  });
}

export function checkInDays(inp: StreakInputs): MarkedDay[] {
  return datesFrom(inp.since, inp.habitToday).map((date): MarkedDay => {
    if (inp.onTimeHabitDays.has(date)) return { date, mark: 'hit' };
    return { date, mark: date === inp.habitToday ? 'skip' : 'none' };
  });
}

/** The last day of each qualifying month, oldest first. */
export function monthlyHits(months: readonly MonthRecap[], since: string, key: MonthlyMilestone): string[] {
  return months
    .filter((m) => m.periodStart >= since && m.milestones?.[key] !== undefined)
    .sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1))
    .map((m) => m.periodEnd);
}

function streakDays(family: AchievementFamily, inp: StreakInputs): MarkedDay[] {
  switch (family) {
    case 'SLEEP_GOAL':
      return sleepGoalDays(inp);
    case 'STEADY_BEDTIME':
      return steadyBedtimeDays(inp);
    case 'STEP_GOAL':
      return stepGoalDays(inp);
    case 'CHECK_IN':
      return checkInDays(inp);
    default:
      throw new Error(`${family} is not a streak family`);
  }
}

/** Each family's current and best value and every level the data supports, in catalogue order. */
export function familyResults(inp: StreakInputs, months: readonly MonthRecap[], families: readonly AchievementFamily[] = ALL_FAMILIES): FamilyResult[] {
  return FAMILIES.filter((def) => families.includes(def.family)).map((def): FamilyResult => {
    if (def.kind === 'monthly') {
      const hits = monthlyHits(months, inp.since, def.milestone!);
      return { family: def.family, current: hits.length, best: hits.length, reached: earnedLevels([{ hits, broken: false }], def.thresholds) };
    }
    const checkIn = def.family === 'CHECK_IN';
    const summary = summariseRuns(streakDays(def.family, inp), { today: checkIn ? inp.habitToday : inp.today, pausable: !checkIn });
    return { family: def.family, current: summary.current, best: summary.best, reached: earnedLevels(summary.runs, def.thresholds) };
  });
}
