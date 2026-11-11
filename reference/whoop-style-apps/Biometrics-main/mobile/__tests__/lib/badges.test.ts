import { achievementsFixture, familyFixture } from '../../jest-mocks/achievementsFixture';
import type { AchievementFamily } from '../../src/api/achievements';
import {
  TOTAL_LEVELS, coachLine, countLabel, earnedCount, familyStatus, ladderRow, levelTitle, levelsEarnedBetween, nextUp,
  shortDay, shortLevelTitle, valueLine,
} from '../../src/lib/badges';

const CANVAS = achievementsFixture({
  SLEEP_GOAL: { level: 2, current: 9, best: 11 },
  STEADY_BEDTIME: { level: 3, current: 15 },
  STEP_GOAL: { level: 1, current: 5 },
  CHECK_IN: { level: 2, current: 16 },
  BEST_RECOVERY_WEEK: { level: 1, current: 1 },
});

it('names levels, counts and dates', () => {
  expect(levelTitle('SLEEP_GOAL', 3)).toBe('Sleep goal streak III');
  expect(shortLevelTitle('CHECK_IN', 2)).toBe('Check-in II');
  expect(countLabel('SLEEP_GOAL', 1)).toBe('1 night');
  expect(countLabel('STEP_GOAL', 14)).toBe('14 days');
  expect(countLabel('EVERY_DAY_LOGGED', 3)).toBe('3 months');
  expect(shortDay('2026-10-08')).toBe('Oct 8');
});

it('counts the levels earned out of 35', () => {
  expect(TOTAL_LEVELS).toBe(35);
  expect(earnedCount(CANVAS)).toBe(9);
});

it('picks the family closest to its next level, catalogue order on a tie, none when all are at the top', () => {
  // Steps 5/7 (71%) beats sleep 9/14 (64%) and check-in 16/30 (53%).
  expect(nextUp(CANVAS)).toEqual({ family: 'STEP_GOAL', nextLevel: 2, current: 5, threshold: 7 });
  expect(nextUp(achievementsFixture())).toEqual({ family: 'SLEEP_GOAL', nextLevel: 1, current: 0, threshold: 3 });
  const all: AchievementFamily[] = ['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH'];
  const top = achievementsFixture(Object.fromEntries(all.map((f) => [f, { level: 5 }])) as Partial<Record<AchievementFamily, { level: number }>>);
  expect(nextUp(top)).toBeNull();
});

it('writes the celebration lines', () => {
  expect(valueLine('SLEEP_GOAL', 14)).toBe('14 nights in a row at your sleep goal.');
  expect(valueLine('EVERY_DAY_LOGGED', 1)).toBe('1 month with every day logged.');
  expect(coachLine('SLEEP_GOAL', 3, [3, 7, 14, 30, 100])).toBe('16 more nights for Diamond');
  expect(coachLine('STEADIEST_MONTH', 1, [1, 2, 4, 6, 12])).toBe('1 more month for Silver');
  expect(coachLine('CHECK_IN', 5, [7, 14, 30, 60, 180])).toBe('Top level!');
  // No level yet: the whole first threshold is left, never "Top level!".
  expect(coachLine('SLEEP_GOAL', 0, [3, 7, 14, 30, 100])).toBe('3 more nights for Bronze');
  expect(coachLine('STEADIEST_MONTH', 0, [1, 2, 4, 6, 12])).toBe('1 more month for Bronze');
});

it('describes each rung of the ladder: earned with its date, the next one with what is left, the rest locked', () => {
  const f = familyFixture('SLEEP_GOAL', { level: 2, current: 9, levels: [{ level: 1, value: 3, earnedOn: '2026-10-08' }, { level: 2, value: 7, earnedOn: '2026-10-12' }] });
  expect(ladderRow(f, 1)).toEqual({ level: 1, earned: true, text: 'Earned Oct 8', tag: 'EARNED' });
  expect(ladderRow(f, 3)).toEqual({ level: 3, earned: false, text: '5 more nights in a row', tag: 'NEXT' });
  expect(ladderRow(f, 4)).toEqual({ level: 4, earned: false, text: 'Locked', tag: null });
  const months = familyFixture('EVERY_DAY_LOGGED', { level: 1, current: 2, levels: [{ level: 1, value: 1, earnedOn: '2026-10-31' }] });
  expect(ladderRow(months, 2)).toEqual({ level: 2, earned: false, text: '1 more month', tag: 'NEXT' });
});

it('sums up a family for the Badges list', () => {
  expect(familyStatus(familyFixture('SLEEP_GOAL', { level: 2, current: 9 }))).toBe('Level II · Silver · 9 / 14 nights');
  expect(familyStatus(familyFixture('EVERY_DAY_LOGGED'))).toBe('Not yet · 0 / 1 month');
  expect(familyStatus(familyFixture('CHECK_IN', { level: 5, current: 200 }))).toBe('Level V · Coach');
});

it('lists the levels earned in a date range, optionally one kind only', () => {
  const a = achievementsFixture({
    SLEEP_GOAL: { level: 2, levels: [{ level: 1, value: 3, earnedOn: '2026-09-30' }, { level: 2, value: 7, earnedOn: '2026-10-05' }] },
    CHECK_IN: { level: 1, levels: [{ level: 1, value: 7, earnedOn: '2026-10-11' }] },
    EVERY_DAY_LOGGED: { level: 1, levels: [{ level: 1, value: 1, earnedOn: '2026-10-31' }] },
  });
  expect(levelsEarnedBetween(a, '2026-10-05', '2026-10-11')).toEqual([{ family: 'SLEEP_GOAL', level: 2 }, { family: 'CHECK_IN', level: 1 }]);
  expect(levelsEarnedBetween(a, '2026-10-01', '2026-10-31', 'streak')).toEqual([{ family: 'SLEEP_GOAL', level: 2 }, { family: 'CHECK_IN', level: 1 }]);
  expect(levelsEarnedBetween(a, '2026-10-01', '2026-10-31', 'monthly')).toEqual([{ family: 'EVERY_DAY_LOGGED', level: 1 }]);
  expect(levelsEarnedBetween(null, '2026-10-01', '2026-10-31')).toEqual([]);
});
