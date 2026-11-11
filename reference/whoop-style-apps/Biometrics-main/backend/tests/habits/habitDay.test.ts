import { habitDayFor, habitDayForOrUtc } from '../../src/habits/habitDay';
import { localCivilDate } from '../../src/biometrics/civilDate';
import { HABIT_DAY_START_HOUR } from '../../src/habits/config';

describe('habitDayFor: the 04:00-local boundary', () => {
  it('starts the habit day at 04:00 local', () => {
    expect(HABIT_DAY_START_HOUR).toBe(4);
  });

  it('puts a 01:00 local log on the PREVIOUS habit day', () => {
    // 2026-09-10 01:00 in Los Angeles (PDT, UTC-7) = 08:00Z
    expect(habitDayFor(new Date('2026-09-10T08:00:00Z'), 'America/Los_Angeles')).toBe('2026-09-09');
  });

  it('puts a 04:00 local log on the current habit day', () => {
    expect(habitDayFor(new Date('2026-09-10T11:00:00Z'), 'America/Los_Angeles')).toBe('2026-09-10');
  });

  it('puts 03:59 on the previous day and 00:00 on the previous day', () => {
    expect(habitDayFor(new Date('2026-09-10T10:59:00Z'), 'America/Los_Angeles')).toBe('2026-09-09');
    expect(habitDayFor(new Date('2026-09-10T07:00:00Z'), 'America/Los_Angeles')).toBe('2026-09-09');
  });

  it('keeps an evening log on its own day', () => {
    expect(habitDayFor(new Date('2026-09-11T03:30:00Z'), 'America/Los_Angeles')).toBe('2026-09-10'); // 20:30 local
  });

  it('rolls back across a month boundary', () => {
    expect(habitDayFor(new Date('2026-10-01T02:00:00Z'), 'UTC')).toBe('2026-09-30');
  });

  it('follows the zone it is given, not the server zone', () => {
    const instant = new Date('2026-09-10T02:00:00Z');
    expect(habitDayFor(instant, 'UTC')).toBe('2026-09-09'); // 02:00 UTC -> before 04:00
    expect(habitDayFor(instant, 'Asia/Kolkata')).toBe('2026-09-10'); // 07:30 IST
  });

  it('is correct on a DST-change night (wall clock, not four absolute hours)', () => {
    // US spring-forward 2026-03-08: 02:00 -> 03:00 in Los Angeles. 10:30Z is 03:30 PDT (before 04:00).
    expect(habitDayFor(new Date('2026-03-08T10:30:00Z'), 'America/Los_Angeles')).toBe('2026-03-07');
    // 11:00Z is 04:00 PDT.
    expect(habitDayFor(new Date('2026-03-08T11:00:00Z'), 'America/Los_Angeles')).toBe('2026-03-08');
  });

  it('agrees with the score-day convention: outside the boundary hours it IS the local civil date', () => {
    // Stat Engine section 2 buckets by localCivilDate; habit days must only differ from it inside [00:00, 04:00).
    for (const iso of ['2026-09-10T15:00:00Z', '2026-09-10T20:00:00Z', '2026-09-11T00:00:00Z']) {
      expect(habitDayFor(new Date(iso), 'America/New_York')).toBe(localCivilDate(new Date(iso), 'America/New_York'));
    }
  });
});

describe('habitDayForOrUtc', () => {
  it('is habitDayFor, falling back to UTC for a zone Intl does not know', () => {
    expect(habitDayForOrUtc(new Date('2026-10-06T02:00:00Z'), 'Pacific/Auckland')).toBe('2026-10-06');
    expect(habitDayForOrUtc(new Date('2026-10-06T02:00:00Z'), 'Not/AZone')).toBe('2026-10-05');
  });
});
