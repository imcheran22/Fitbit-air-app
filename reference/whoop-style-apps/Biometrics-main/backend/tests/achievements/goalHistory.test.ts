import {
  bedtimeGoalResets, bedtimeSeries, changeInEffect, circularDistance, familyStartDate, goalChangesOf, hhmmToNoonMinutes,
  sleepGoalResets, usualBedtimeBefore, type GoalChangeRow,
} from '../../src/achievements/goalHistory';
import type { RecapData } from '../../src/recap/types';

const sleep = (effectiveOn: string, sleepMinutes: number, resetsStreak = false): GoalChangeRow =>
  ({ kind: 'SLEEP_MINUTES', sleepMinutes, bedtime: null, effectiveOn, resetsStreak });

describe('changeInEffect', () => {
  const changes = [sleep('2026-10-01', 480), sleep('2026-10-05', 510)];

  it('applies a change only to nights that end after its date', () => {
    // Raised in the evening of Oct 5: the night that ended that morning keeps 480.
    expect(changeInEffect(changes, '2026-10-05')?.sleepMinutes).toBe(480);
    expect(changeInEffect(changes, '2026-10-06')?.sleepMinutes).toBe(510);
  });

  it('uses the earliest row for nights before any change, and null with no rows', () => {
    expect(changeInEffect(changes, '2026-09-30')?.sleepMinutes).toBe(480);
    expect(changeInEffect(changes, '2026-10-01')?.sleepMinutes).toBe(480);
    expect(changeInEffect([], '2026-10-01')).toBeNull();
  });
});

describe('goalChangesOf', () => {
  it('keeps one kind, oldest first, without touching the input', () => {
    const bed: GoalChangeRow = { kind: 'BEDTIME', sleepMinutes: null, bedtime: '22:00', effectiveOn: '2026-10-02', resetsStreak: true };
    const rows = [sleep('2026-10-05', 510), bed, sleep('2026-09-30', 480), sleep('2026-10-03', 450)];
    expect(goalChangesOf(rows, 'SLEEP_MINUTES').map((c) => c.effectiveOn)).toEqual(['2026-09-30', '2026-10-03', '2026-10-05']);
    expect(goalChangesOf(rows, 'BEDTIME')).toEqual([bed]);
    expect(rows.map((c) => c.effectiveOn)).toEqual(['2026-10-05', '2026-10-02', '2026-09-30', '2026-10-03']);
  });
});

describe('familyStartDate', () => {
  it('restarts a family the night after an easing change, never before the start date', () => {
    expect(familyStartDate('2026-10-01', [sleep('2026-10-05', 420, true)])).toBe('2026-10-06');
    expect(familyStartDate('2026-10-01', [sleep('2026-10-05', 510, false)])).toBe('2026-10-01');
    expect(familyStartDate('2026-10-10', [sleep('2026-10-05', 420, true)])).toBe('2026-10-10');
    expect(familyStartDate('2026-10-01', [sleep('2026-10-03', 450, true), sleep('2026-10-08', 420, true)])).toBe('2026-10-09');
  });
});

describe('bedtime maths', () => {
  it('reads "HH:MM" as minutes since local noon, like the recap bedtimes', () => {
    expect(hhmmToNoonMinutes('22:30')).toBe(630);
    expect(hhmmToNoonMinutes('00:30')).toBe(750);
    expect(hhmmToNoonMinutes('12:00')).toBe(0);
  });

  it('measures distance on the 24-hour circle', () => {
    expect(circularDistance(690, 750)).toBe(60);
    expect(circularDistance(10, 1430)).toBe(20);
    expect(circularDistance(630, 630)).toBe(0);
  });

  it('collects the nights that have a bedtime, oldest first', () => {
    const data: RecapData = new Map([
      ['2026-10-03', { sleepMinutes: 400, bedtime: 640 }],
      ['2026-10-01', { sleepMinutes: 420, bedtime: 630 }],
      ['2026-10-02', { steps: 5000 }],
    ]);
    expect(bedtimeSeries(data)).toEqual([['2026-10-01', 630], ['2026-10-03', 640]]);
  });

  it('takes the median of the previous 14 nights with a bedtime, and needs 7', () => {
    const nights = (n: number) => Array.from({ length: n }, (_, i) => [`2026-09-${String(1 + i).padStart(2, '0')}`, 600 + i * 10] as const);
    expect(usualBedtimeBefore(nights(6), '2026-09-30')).toBeNull();
    // 7 nights: 600..660 → median 630.
    expect(usualBedtimeBefore(nights(7), '2026-09-30')).toBe(630);
    // 20 nights (600..790): only the last 14 before the date (660..790) count → median 725.
    expect(usualBedtimeBefore(nights(20), '2026-09-30')).toBe(725);
    // Strictly before the date: the night itself never counts.
    expect(usualBedtimeBefore(nights(7), '2026-09-07')).toBeNull();
  });
});

describe('resetsStreak', () => {
  it('resets the sleep streak only when the goal gets lower', () => {
    expect(sleepGoalResets(480, 450)).toBe(true);
    expect(sleepGoalResets(450, 480)).toBe(false);
    expect(sleepGoalResets(480, 480)).toBe(false);
  });

  it('resets the bedtime streak on a move of more than 30 minutes, measured on the circle', () => {
    expect(bedtimeGoalResets('22:30', '23:00', null)).toBe(false);
    expect(bedtimeGoalResets('22:30', '23:01', null)).toBe(true);
    expect(bedtimeGoalResets('23:30', '00:15', null)).toBe(true);
    expect(bedtimeGoalResets('23:50', '00:10', null)).toBe(false);
  });

  it('compares a first bedtime goal with the usual bedtime, and resets with none known', () => {
    expect(bedtimeGoalResets(null, '22:30', 640)).toBe(false);
    expect(bedtimeGoalResets(null, '22:30', 690)).toBe(true);
    expect(bedtimeGoalResets(null, '22:30', null)).toBe(true);
  });

  it('resets when the goal is cleared', () => {
    expect(bedtimeGoalResets('22:30', null, 630)).toBe(true);
    expect(bedtimeGoalResets(null, null, 630)).toBe(false);
  });
});
