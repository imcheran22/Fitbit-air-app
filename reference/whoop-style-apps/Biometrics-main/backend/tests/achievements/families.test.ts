import {
  checkInDays, familyResults, monthlyHits, sleepGoalDays, stepGoalDays, steadyBedtimeDays, type MonthRecap, type StreakInputs,
} from '../../src/achievements/families';
import type { GoalChangeRow } from '../../src/achievements/goalHistory';
import type { DayData } from '../../src/recap/types';
import { shiftDate } from '../../src/scoring/dates';

function inputs(over: Partial<StreakInputs> = {}): StreakInputs {
  return {
    today: '2026-10-10', habitToday: '2026-10-10', since: '2026-10-01', data: new Map(),
    sleepChanges: [], bedtimeChanges: [], currentSleepGoal: 480, currentBedtime: null, onTimeHabitDays: new Set(), ...over,
  };
}
const data = (entries: Array<[string, DayData]>) => new Map(entries);
const marks = (days: { date: string; mark: string }[]) => days.map((d) => `${d.date.slice(8)}:${d.mark}`);
const change = (kind: GoalChangeRow['kind'], effectiveOn: string, value: number | string | null, resetsStreak = false): GoalChangeRow => ({
  kind, effectiveOn, resetsStreak,
  sleepMinutes: kind === 'SLEEP_MINUTES' ? (value as number) : null,
  bedtime: kind === 'BEDTIME' ? (value as string | null) : null,
});

describe('sleep goal', () => {
  it('marks each night from the start date to today against the goal; nights before the start never count', () => {
    const inp = inputs({
      today: '2026-10-04',
      data: data([['2026-09-30', { sleepMinutes: 500 }], ['2026-10-01', { sleepMinutes: 480 }], ['2026-10-02', { sleepMinutes: 479 }], ['2026-10-04', { sleepMinutes: 0 }]]),
    });
    expect(marks(sleepGoalDays(inp))).toEqual(['01:hit', '02:miss', '03:none', '04:none']);
  });

  it('judges a night by the goal in effect before its wake date: raising keeps the streak', () => {
    const inp = inputs({
      today: '2026-10-06',
      sleepChanges: [change('SLEEP_MINUTES', '2026-10-01', 480), change('SLEEP_MINUTES', '2026-10-05', 510)],
      data: data([['2026-10-05', { sleepMinutes: 490 }], ['2026-10-06', { sleepMinutes: 500 }]]),
    });
    // Raised on Oct 5: the night that ended that morning keeps 480, Oct 6 is judged on 510.
    expect(marks(sleepGoalDays(inp)).slice(-2)).toEqual(['05:hit', '06:miss']);
  });

  it('restarts from the night after an easing change', () => {
    const inp = inputs({
      today: '2026-10-07',
      sleepChanges: [change('SLEEP_MINUTES', '2026-10-01', 480), change('SLEEP_MINUTES', '2026-10-05', 420, true)],
      data: data([['2026-10-05', { sleepMinutes: 450 }], ['2026-10-06', { sleepMinutes: 430 }], ['2026-10-07', { sleepMinutes: 425 }]]),
    });
    expect(marks(sleepGoalDays(inp))).toEqual(['06:hit', '07:hit']);
  });

  it('is empty when the restart is still ahead', () => {
    const inp = inputs({ today: '2026-10-05', sleepChanges: [change('SLEEP_MINUTES', '2026-10-05', 420, true)] });
    expect(sleepGoalDays(inp)).toEqual([]);
  });

  it('reads unsorted rows of mixed kinds as one kind, oldest first', () => {
    const inp = inputs({
      today: '2026-10-06',
      // A BEDTIME reset must not restart the sleep streak; the newer SLEEP row must not lose to an older one listed after it.
      sleepChanges: [
        change('SLEEP_MINUTES', '2026-10-05', 510), change('BEDTIME', '2026-10-04', '22:00', true), change('SLEEP_MINUTES', '2026-09-30', 480),
      ],
      data: data([['2026-10-05', { sleepMinutes: 490 }], ['2026-10-06', { sleepMinutes: 500 }]]),
    });
    expect(marks(sleepGoalDays(inp))).toEqual(['01:none', '02:none', '03:none', '04:none', '05:hit', '06:miss']);
  });
});

describe('steady bedtime', () => {
  const pre = (from: string, n: number, bedtime: number): Array<[string, DayData]> =>
    Array.from({ length: n }, (_, i) => [shiftDate(from, i), { sleepMinutes: 450, bedtime }]);

  it('compares with the bedtime goal in effect, within 30 minutes either side', () => {
    const inp = inputs({
      today: '2026-10-03',
      bedtimeChanges: [change('BEDTIME', '2026-09-30', '22:30')],
      data: data([['2026-10-01', { sleepMinutes: 450, bedtime: 660 }], ['2026-10-02', { sleepMinutes: 450, bedtime: 661 }], ['2026-10-03', { sleepMinutes: 450, bedtime: 600 }]]),
    });
    expect(marks(steadyBedtimeDays(inp))).toEqual(['01:hit', '02:miss', '03:hit']);
  });

  it('with no goal, uses the median of the previous 14 nights, including nights before the start date', () => {
    const inp = inputs({ today: '2026-10-01', data: data([...pre('2026-09-20', 11, 630), ['2026-10-01', { sleepMinutes: 450, bedtime: 650 }]]) });
    expect(marks(steadyBedtimeDays(inp))).toEqual(['01:hit']);
  });

  it('with no goal and fewer than 7 prior nights, a night neither counts nor breaks', () => {
    const inp = inputs({ today: '2026-10-01', data: data([...pre('2026-09-28', 3, 630), ['2026-10-01', { sleepMinutes: 450, bedtime: 640 }]]) });
    expect(marks(steadyBedtimeDays(inp))).toEqual(['01:skip']);
  });

  it('marks a night without a bedtime as no data, and a cleared goal falls back to the median', () => {
    const inp = inputs({
      today: '2026-10-02',
      bedtimeChanges: [change('BEDTIME', '2026-09-01', '21:00'), change('BEDTIME', '2026-09-30', null, true)],
      data: data([...pre('2026-09-15', 14, 630), ['2026-10-01', { sleepMinutes: 450, bedtime: 640 }], ['2026-10-02', { steps: 9000 }]]),
    });
    expect(marks(steadyBedtimeDays(inp))).toEqual(['01:hit', '02:none']);
  });

  it('reads the bedtime rows as one kind, oldest first, whatever order they arrive in', () => {
    const inp = inputs({
      today: '2026-10-01',
      // A SLEEP_MINUTES reset must not restart this family; the 22:30 row (newer) is the goal in effect.
      bedtimeChanges: [change('BEDTIME', '2026-09-29', '22:30'), change('SLEEP_MINUTES', '2026-09-30', 420, true), change('BEDTIME', '2026-09-01', '21:00')],
      data: data([['2026-10-01', { sleepMinutes: 450, bedtime: 660 }]]),
    });
    expect(marks(steadyBedtimeDays(inp))).toEqual(['01:hit']);
  });
});

describe('step goal', () => {
  it('counts finished local days only, at 10,000 steps or more', () => {
    const inp = inputs({
      since: '2026-10-07',
      data: data([['2026-10-07', { steps: 9999 }], ['2026-10-08', { steps: 10000 }], ['2026-10-10', { steps: 25000 }]]),
    });
    // Today (Oct 10) is never counted until it is over.
    expect(marks(stepGoalDays(inp))).toEqual(['07:miss', '08:hit', '09:none']);
  });
});

describe('daily check-in', () => {
  it('counts on-time check-ins only; a past habit day without one is no data, today waits', () => {
    const inp = inputs({ since: '2026-10-01', habitToday: '2026-10-05', onTimeHabitDays: new Set(['2026-10-01', '2026-10-02', '2026-10-04']) });
    expect(marks(checkInDays(inp))).toEqual(['01:hit', '02:hit', '03:none', '04:hit', '05:skip']);
    const done = inputs({ since: '2026-10-04', habitToday: '2026-10-05', onTimeHabitDays: new Set(['2026-10-04', '2026-10-05']) });
    expect(marks(checkInDays(done))).toEqual(['04:hit', '05:hit']);
  });
});

describe('monthly families', () => {
  const months: MonthRecap[] = [
    { periodStart: '2026-12-01', periodEnd: '2026-12-31', milestones: { everyDayLogged: { days: 31 } } },
    { periodStart: '2026-09-01', periodEnd: '2026-09-30', milestones: { everyDayLogged: { days: 30 } } },
    { periodStart: '2026-10-01', periodEnd: '2026-10-31', milestones: { everyDayLogged: { days: 31 } } },
    { periodStart: '2026-11-01', periodEnd: '2026-11-30', milestones: {} },
  ];

  it('counts months whose 1st is on or after the start date and whose recap has the milestone', () => {
    expect(monthlyHits(months, '2026-10-01', 'everyDayLogged')).toEqual(['2026-10-31', '2026-12-31']);
    expect(monthlyHits(months, '2026-10-07', 'everyDayLogged')).toEqual(['2026-12-31']);
    expect(monthlyHits(months, '2026-10-01', 'steadiestMonth')).toEqual([]);
  });
});

describe('familyResults', () => {
  it('awards a finished streak from its best run, dated when each threshold was reached', () => {
    const nights: Array<[string, DayData]> = Array.from({ length: 7 }, (_, i) => [shiftDate('2026-10-01', i), { sleepMinutes: 500 }]);
    const inp = inputs({ data: data([...nights, ['2026-10-08', { sleepMinutes: 400 }]]) });
    const [sleep] = familyResults(inp, [], ['SLEEP_GOAL']);
    expect(sleep).toEqual({
      family: 'SLEEP_GOAL', current: 0, best: 7,
      reached: [{ level: 1, value: 3, earnedOn: '2026-10-03' }, { level: 2, value: 7, earnedOn: '2026-10-07' }],
    });
  });

  it('returns every family in catalogue order by default, monthly ones from recaps', () => {
    const results = familyResults(inputs(), [{ periodStart: '2026-10-01', periodEnd: '2026-10-31', milestones: { steadiestMonth: { spreadMinutes: 12 } } }]);
    expect(results.map((r) => r.family)).toEqual(['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'BEST_RECOVERY_WEEK', 'EVERY_DAY_LOGGED', 'STEADIEST_MONTH']);
    expect(results[6]).toEqual({ family: 'STEADIEST_MONTH', current: 1, best: 1, reached: [{ level: 1, value: 1, earnedOn: '2026-10-31' }] });
  });

  it('breaks the check-in streak as soon as a habit day without an on-time check-in is over', () => {
    const days = Array.from({ length: 8 }, (_, i) => shiftDate('2026-10-01', i));
    const inp = inputs({ habitToday: '2026-10-10', onTimeHabitDays: new Set(days) });
    const [checkIn] = familyResults(inp, [], ['CHECK_IN']);
    // Oct 9 had none and is over: broken, no pause.
    expect(checkIn).toMatchObject({ current: 0, best: 8, reached: [{ level: 1, value: 7, earnedOn: '2026-10-07' }] });
  });
});
