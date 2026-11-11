import {
  backfillPeriods, daysSinceEnd, inLateWindow, isDue, lastCompletedPeriodStart, monthDay, periodEndOf, periodLabel,
  previousPeriodStart, weekdayName,
} from '../../src/recap/periods';

const at = (iso: string) => new Date(iso);
const WEEK = '2026-09-28'; // Mon 28 Sep – Sun 4 Oct 2026
const MONTH = '2026-09-01';

describe('period bounds', () => {
  it('ends weeks on Sunday and months on their last day, leap years included', () => {
    expect(periodEndOf('WEEK', WEEK)).toBe('2026-10-04');
    expect(periodEndOf('MONTH', '2026-02-01')).toBe('2026-02-28');
    expect(periodEndOf('MONTH', '2028-02-01')).toBe('2028-02-29');
    expect(previousPeriodStart('WEEK', WEEK)).toBe('2026-09-21');
    expect(previousPeriodStart('MONTH', '2026-01-01')).toBe('2025-12-01');
  });

  it('finds the last completed period from a local date', () => {
    expect(lastCompletedPeriodStart('WEEK', '2026-10-05')).toBe('2026-09-28'); // Monday
    expect(lastCompletedPeriodStart('WEEK', '2026-10-04')).toBe('2026-09-21'); // Sunday: this week is not over
    expect(lastCompletedPeriodStart('MONTH', '2026-10-01')).toBe('2026-09-01');
    expect(lastCompletedPeriodStart('MONTH', '2026-01-15')).toBe('2025-12-01');
    expect(daysSinceEnd('WEEK', WEEK, '2026-10-05')).toBe(1);
  });
});

describe('due window (UTC user)', () => {
  it.each([
    ['2026-10-04T12:00:00Z', false], // the week has not ended
    ['2026-10-05T07:59:00Z', false], // Monday 07:59
    ['2026-10-05T08:00:00Z', true], //  Monday 08:00
    ['2026-10-06T03:00:00Z', true], //  Tuesday, any hour
    ['2026-10-11T23:00:00Z', true], //  day 7
    ['2026-10-12T09:00:00Z', false], // day 8
  ])('WEEK at %s due=%s', (now, due) => {
    expect(isDue('WEEK', WEEK, at(now), 'UTC')).toBe(due);
  });

  it.each([
    ['2026-10-01T07:59:00Z', false],
    ['2026-10-01T08:00:00Z', true],
    ['2026-10-02T01:00:00Z', true],
    ['2026-10-10T20:00:00Z', true], //  day 10
    ['2026-10-11T09:00:00Z', false], // day 11
  ])('MONTH at %s due=%s', (now, due) => {
    expect(isDue('MONTH', MONTH, at(now), 'UTC')).toBe(due);
  });
});

describe('time zones far from UTC (Review Focus 1)', () => {
  it('Auckland (+13): due at Monday 08:00 local while UTC is still Sunday', () => {
    expect(isDue('WEEK', WEEK, at('2026-10-04T18:59:00Z'), 'Pacific/Auckland')).toBe(false); // Mon 07:59 NZDT
    expect(isDue('WEEK', WEEK, at('2026-10-04T19:00:00Z'), 'Pacific/Auckland')).toBe(true); // Mon 08:00 NZDT
  });

  it('Los Angeles (−7): not due at 01:00 local even though UTC is past Monday 08:00', () => {
    expect(isDue('WEEK', WEEK, at('2026-10-05T08:00:00Z'), 'America/Los_Angeles')).toBe(false);
    expect(isDue('WEEK', WEEK, at('2026-10-05T14:59:00Z'), 'America/Los_Angeles')).toBe(false);
    expect(isDue('WEEK', WEEK, at('2026-10-05T15:00:00Z'), 'America/Los_Angeles')).toBe(true);
  });

  it('falls back to UTC for a zone Intl does not know, without throwing', () => {
    expect(isDue('WEEK', WEEK, at('2026-10-05T08:00:00Z'), 'Not/AZone')).toBe(true);
  });
});

describe('late-data window, backfill and labels', () => {
  it('is open for the 3 days after the period ends', () => {
    expect(inLateWindow('WEEK', WEEK, '2026-10-05')).toBe(true);
    expect(inLateWindow('WEEK', WEEK, '2026-10-07')).toBe(true);
    expect(inLateWindow('WEEK', WEEK, '2026-10-08')).toBe(false);
    expect(inLateWindow('WEEK', WEEK, '2026-10-04')).toBe(false);
  });

  it('backfills the last 4 completed weeks and 3 completed months', () => {
    expect(backfillPeriods('2026-10-05')).toEqual([
      { kind: 'WEEK', periodStart: '2026-09-28' },
      { kind: 'WEEK', periodStart: '2026-09-21' },
      { kind: 'WEEK', periodStart: '2026-09-14' },
      { kind: 'WEEK', periodStart: '2026-09-07' },
      { kind: 'MONTH', periodStart: '2026-09-01' },
      { kind: 'MONTH', periodStart: '2026-08-01' },
      { kind: 'MONTH', periodStart: '2026-07-01' },
    ]);
  });

  it('labels days and periods without digits the model could misread', () => {
    expect(weekdayName('2026-10-01')).toBe('Thursday');
    expect(monthDay('2026-10-09')).toBe('Oct 9');
    expect(periodLabel('WEEK', WEEK)).toBe('the week of Sep 28');
    expect(periodLabel('MONTH', MONTH)).toBe('September 2026');
  });
});
