import { cardStats, compareChanges, goalLabel, milestoneTiles, monthName, readyCardTitle, recapTitle, shortDate, signedChange, storyRingHint, weekdayName, weekRange } from '../../src/lib/recapCopy';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';

it('names periods and days', () => {
  expect(monthName('2026-09-01')).toBe('September');
  expect(shortDate('2026-09-28')).toBe('Sep 28');
  expect(weekdayName('2026-09-29')).toBe('Tuesday');
  expect(recapTitle({ kind: 'MONTH', periodStart: '2026-09-01' })).toBe('September 2026');
  expect(recapTitle({ kind: 'WEEK', periodStart: '2026-09-28' })).toBe('Week of Sep 28');
  expect(readyCardTitle({ kind: 'MONTH', periodStart: '2026-09-01' })).toBe('Your September recap is ready');
  expect(readyCardTitle({ kind: 'WEEK', periodStart: '2026-09-28' })).toBe('Your week is ready');
  expect(goalLabel(480)).toBe('8h');
  expect(goalLabel(450)).toBe('7h 30m');
});

it('says a new recap is ready on a ringed avatar, and what a tap does', () => {
  expect(storyRingHint({ kind: 'WEEK', periodStart: '2026-09-28' })).toBe('Your week is ready. Play your story');
  expect(storyRingHint({ kind: 'MONTH', periodStart: '2026-09-01' })).toBe('Your September recap is ready. Open your recap');
});

it('lists up to four card stats in a fixed order, skipping missing ones', () => {
  expect(cardStats({ nightsWithData: 25, avgSleepMinutes: 425, longestOnGoalStreak: 6, bestRecovery: { date: '2026-09-09', score: 88 }, steps: { total: 210000, dailyAverage: 7000 } })).toEqual([
    { key: 'avgSleep', label: 'Average sleep', value: '7h 5m' },
    { key: 'streak', label: 'Longest streak', value: '6 nights' },
    { key: 'bestRecovery', label: 'Best recovery', value: '88' },
    { key: 'steps', label: 'Steps a day', value: '7,000' },
  ]);
  expect(cardStats({ nightsWithData: 9, longestOnGoalStreak: 1 }).map((s) => s.value)).toEqual(['1 night']);
});

it('shows only the comparisons present, each as a signed change coloured by whether it is better', () => {
  expect(compareChanges({ avgSleepDelta: 18, bedtimeSpreadDelta: -9, avgRecoveryDelta: -4 })).toEqual([
    { key: 'avgSleep', label: 'Average sleep', text: '+18m', tone: 'better' },
    // A smaller bedtime spread is steadier, so a minus is better.
    { key: 'spread', label: 'Bedtime spread', text: '−9m', tone: 'better' },
    { key: 'recovery', label: 'Recovery average', text: '−4 pts', tone: 'worse' },
  ]);
  expect(compareChanges({ bedtimeSpreadDelta: 15 })).toEqual([{ key: 'spread', label: 'Bedtime spread', text: '+15m', tone: 'worse' }]);
  expect(compareChanges({ avgSleepDelta: 0 })).toEqual([{ key: 'avgSleep', label: 'Average sleep', text: '0m', tone: 'same' }]);
  expect(compareChanges(undefined)).toEqual([]);
});

it('lists all four milestones in a fixed order, the ones not hit locked and without a count', () => {
  expect(milestoneTiles({ streak: { nights: 6 }, bestRecoveryWeek: { weekStart: '2026-09-07', avgRecovery: 80 }, everyDayLogged: { days: 30 }, steadiestMonth: { spreadMinutes: 10 } })).toEqual([
    { key: 'streak', label: '6 nights on goal in a row', glyph: 'star', earned: true },
    { key: 'bestRecoveryWeek', label: 'Best recovery week', glyph: 'heart', earned: true },
    { key: 'everyDayLogged', label: 'Every night logged', glyph: 'calendar', earned: true },
    { key: 'steadiestMonth', label: 'Steadiest bedtimes yet', glyph: 'moon', earned: true },
  ]);
  expect(milestoneTiles({ bestRecoveryWeek: { weekStart: '2026-09-07', avgRecovery: 80 } }).map((t) => [t.key, t.label, t.earned])).toEqual([
    ['streak', 'Nights on goal in a row', false],
    ['bestRecoveryWeek', 'Best recovery week', true],
    ['everyDayLogged', 'Every night logged', false],
    ['steadiestMonth', 'Steadiest bedtimes yet', false],
  ]);
  expect(milestoneTiles(undefined).every((t) => !t.earned)).toBe(true);
  expect(milestoneTiles({ streak: { nights: 1 } })[0]!.label).toBe('1 night on goal in a row');
});

it('signs a change and says whether it is better: more sleep, a smaller spread, more recovery', () => {
  expect(signedChange('avgSleep', 18)).toEqual({ text: '+18m', tone: 'better' });
  expect(signedChange('avgSleep', -80)).toEqual({ text: '−1h 20m', tone: 'worse' });
  expect(signedChange('avgSleep', 0)).toEqual({ text: '0m', tone: 'same' });
  expect(signedChange('spread', -9)).toEqual({ text: '−9m', tone: 'better' });
  expect(signedChange('spread', 12)).toEqual({ text: '+12m', tone: 'worse' });
  expect(signedChange('recovery', 3)).toEqual({ text: '+3 pts', tone: 'better' });
  expect(signedChange('recovery', -1)).toEqual({ text: '−1 pt', tone: 'worse' });
  expect(signedChange('recovery', 0)).toEqual({ text: '0 pts', tone: 'same' });
});

it('names a week by its first and last day', () => {
  expect(weekRange('2026-09-28', '2026-10-04')).toBe('Sep 28 – Oct 4');
});

it('with badges, shows the three monthly families with progress toward the next level and a level-up mark', () => {
  const achievements = achievementsFixture({
    EVERY_DAY_LOGGED: { level: 1, current: 2, levels: [{ level: 1, value: 1, earnedOn: '2026-10-31' }] },
    BEST_RECOVERY_WEEK: { level: 5, current: 24 },
  });
  const tiles = milestoneTiles({ everyDayLogged: { days: 31 }, streak: { nights: 9 } }, { achievements, periodStart: '2026-10-01', periodEnd: '2026-10-31', latest: true });
  expect(tiles.map((t) => [t.key, t.earned, t.progress, t.levelUp])).toEqual([
    ['bestRecoveryWeek', false, 'Top level', false],
    ['everyDayLogged', true, '2 of 3 months for Silver', true],
    ['steadiestMonth', false, '0 of 1 month for Bronze', false],
  ]);
});

it('shows an older month without progress: only whether it hit the milestone and the level-up mark', () => {
  const achievements = achievementsFixture({ EVERY_DAY_LOGGED: { level: 2, current: 3, levels: [{ level: 1, value: 1, earnedOn: '2026-10-31' }, { level: 2, value: 3, earnedOn: '2026-12-31' }] } });
  const tiles = milestoneTiles({ everyDayLogged: { days: 31 } }, { achievements, periodStart: '2026-10-01', periodEnd: '2026-10-31', latest: false });
  expect(tiles.map((t) => [t.key, t.earned, t.progress, t.levelUp])).toEqual([
    ['bestRecoveryWeek', false, undefined, false],
    ['everyDayLogged', true, undefined, true],
    ['steadiestMonth', false, undefined, false],
  ]);
});

it('shows a month before the badge start date as three tiles without progress', () => {
  const tiles = milestoneTiles({ everyDayLogged: { days: 30 } }, { achievements: achievementsFixture({}, { since: '2026-10-07' }), periodStart: '2026-10-01', periodEnd: '2026-10-31', latest: true });
  expect(tiles.map((t) => [t.key, t.earned, t.progress, t.levelUp])).toEqual([
    ['bestRecoveryWeek', false, undefined, undefined],
    ['everyDayLogged', true, undefined, undefined],
    ['steadiestMonth', false, undefined, undefined],
  ]);
});
