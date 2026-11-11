import type { SleepNight } from '../../src/api/sleep';
import { sleepHeatLevel } from '../../src/lib/heatmap';
import {
  clockAt, formatClock, formatDuration, formatTextDuration, isNapOnly, mainMinutes, mainSleepByDate, nightClock, nightUtcOffset,
  sleepRangeStats,
} from '../../src/lib/sleepStats';
import { makeNight } from '../../jest-mocks/sleepPageFixture';

function nights(entries: [string, number, string?][]): Map<string, SleepNight> {
  return new Map(
    entries.map(([date, minutesAsleep, bedtime]) => [
      date,
      { date, minutesAsleep, minutesInBed: null, bedtime: bedtime ?? null, wakeTime: null, sleepScore: null, minutesAwake: null, stageMinutes: null, hasStages: false },
    ]),
  );
}

describe('sleepHeatLevel', () => {
  it.each([
    [null, null],
    [0, 0],
    [300, 1], // 5h: under 75% of 8h
    [359, 1],
    [360, 2], // 6h
    [419, 2],
    [420, 3], // 7h
    [479, 3],
    [480, 4], // at goal
    [600, 4],
  ])('%s minutes -> level %s', (minutes, level) => {
    expect(sleepHeatLevel(minutes, 480)).toBe(level);
  });
});

describe('sleepRangeStats', () => {
  const TODAY = '2026-09-22';

  it('averages only nights with a record, and counts nights at goal', () => {
    const stats = sleepRangeStats(nights([['2026-09-20', 400], ['2026-09-22', 500]]), '2026-09-01', '2026-09-30', TODAY, 480);

    expect(stats.nights).toBe(2);
    expect(stats.averageMinutes).toBe(450);
    expect(stats.goalNights).toBe(1);
    expect(stats.longest).toEqual({ date: '2026-09-22', minutes: 500 });
  });

  it('counts tonight in the streak once it is recorded, and up to yesterday until then', () => {
    const recorded = nights([['2026-09-20', 490], ['2026-09-21', 480], ['2026-09-22', 485]]);
    expect(sleepRangeStats(recorded, '2026-09-01', '2026-09-30', TODAY, 480).streak).toBe(3);

    const notYet = nights([['2026-09-20', 490], ['2026-09-21', 480]]);
    expect(sleepRangeStats(notYet, '2026-09-01', '2026-09-30', TODAY, 480).streak).toBe(2);

    const shortLastNight = nights([['2026-09-21', 480], ['2026-09-22', 300]]);
    expect(sleepRangeStats(shortLastNight, '2026-09-01', '2026-09-30', TODAY, 480).streak).toBe(0);
  });

  it('averages bedtimes across midnight, and skips nights without one', () => {
    const stats = sleepRangeStats(
      nights([['2026-09-20', 450, '23:30'], ['2026-09-21', 450, '00:30'], ['2026-09-22', 450]]),
      '2026-09-01',
      '2026-09-30',
      TODAY,
      480,
    );

    expect(stats.averageBedtime).toBe('00:00');
  });

  it('is empty, not zero, for a range with no nights', () => {
    expect(sleepRangeStats(new Map(), '2026-09-01', '2026-09-30', TODAY, 480)).toEqual({
      nights: 0,
      averageMinutes: null,
      goalNights: 0,
      streak: 0,
      averageBedtime: null,
      longest: null,
    });
  });
});

describe('formatting', () => {
  it('formats durations and clock times', () => {
    expect(formatDuration(467)).toBe('7h 47m');
    expect(formatDuration(480)).toBe('8h 00m');
    // The coach's text style (backend durationDisplay), for the recap share images.
    expect(formatTextDuration(425)).toBe('7h 5m');
    expect(formatTextDuration(480)).toBe('8h 0m');
    expect(formatTextDuration(45)).toBe('45m');
    expect(formatTextDuration(424.6)).toBe('7h 5m');
    expect(formatClock('23:52')).toBe('11:52 pm');
    expect(formatClock('00:05')).toBe('12:05 am');
    expect(formatClock('12:00')).toBe('12:00 pm');
  });
});

// Stage segments are UTC instants; the night's local clock comes from its
// bedtime, the same local "HH:MM" the screen shows.
describe('night clock', () => {
  it('reads the night\'s UTC offset off its bedtime and first stage', () => {
    expect(nightUtcOffset('23:10', '2026-10-01T03:10:00.000Z')).toBe(-240);
    expect(nightUtcOffset('00:22', '2026-09-30T23:22:00.000Z')).toBe(60);
    expect(nightUtcOffset('05:40', '2026-10-01T00:10:00.000Z')).toBe(330);
  });

  it('rounds to the quarter hour, so a first stage a few minutes after bedtime still reads true', () => {
    expect(nightUtcOffset('23:10', '2026-10-01T03:16:00.000Z')).toBe(-240);
  });

  it('gives an instant\'s local "HH:MM" at that offset', () => {
    expect(clockAt('2026-10-01T03:35:00.000Z', -240)).toBe('23:35');
    expect(clockAt('2026-10-01T09:10:00.000Z', -240)).toBe('05:10');
    expect(clockAt('2026-09-30T23:22:00.000Z', 60)).toBe('00:22');
    expect(formatClock(clockAt('2026-10-01T03:35:00.000Z', -240))).toBe('11:35 pm');
  });
});

describe('nightClock', () => {
  const stage = (start: string, end: string) => ({ start, end });

  it('tells stage times on the session\'s own offset', () => {
    const clock = nightClock({ bedtime: '22:30', startUtcOffsetSeconds: 3600, endUtcOffsetSeconds: 3600 }, [
      stage('2026-09-21T21:30:00.000Z', '2026-09-22T05:15:00.000Z'),
    ]);
    expect(clock.offset).toBe(60);
    expect(clock.at('2026-09-21T21:30:00.000Z')).toBe('22:30');
    expect(clock.at('2026-09-22T05:15:00.000Z')).toBe('06:15');
  });

  it('switches to the end offset from the middle of a night the clocks went back in', () => {
    // New York, 1 November 2026: EDT (-4h) at bedtime, EST (-5h) by morning.
    const clock = nightClock({ bedtime: '23:00', startUtcOffsetSeconds: -14400, endUtcOffsetSeconds: -18000 }, [
      stage('2026-11-01T03:00:00.000Z', '2026-11-01T07:00:00.000Z'),
      stage('2026-11-01T07:00:00.000Z', '2026-11-01T11:00:00.000Z'),
    ]);
    expect(clock.offset).toBe(-240);
    expect(clock.at('2026-11-01T03:30:00.000Z')).toBe('23:30');
    expect(clock.at('2026-11-01T06:59:00.000Z')).toBe('02:59');
    // At and after the midpoint (07:00Z) the end offset applies.
    expect(clock.at('2026-11-01T07:00:00.000Z')).toBe('02:00');
    expect(clock.at('2026-11-01T10:00:00.000Z')).toBe('05:00');
  });

  it('finds the midpoint from the latest end, not the last segment\'s', () => {
    // The first stage runs to 11:00Z; the last one ends at 05:00Z. Midpoint 07:00Z.
    const clock = nightClock({ bedtime: '23:00', startUtcOffsetSeconds: -14400, endUtcOffsetSeconds: -18000 }, [
      stage('2026-11-01T03:00:00.000Z', '2026-11-01T11:00:00.000Z'),
      stage('2026-11-01T04:00:00.000Z', '2026-11-01T05:00:00.000Z'),
    ]);
    expect(clock.at('2026-11-01T06:00:00.000Z')).toBe('02:00');
    expect(clock.at('2026-11-01T07:00:00.000Z')).toBe('02:00');
  });

  it('uses whichever offset it has when the other is unknown', () => {
    const clock = nightClock({ bedtime: '23:00', startUtcOffsetSeconds: null, endUtcOffsetSeconds: -18000 }, [
      stage('2026-11-01T04:00:00.000Z', '2026-11-01T11:00:00.000Z'),
    ]);
    expect(clock.offset).toBe(-300);
    expect(clock.at('2026-11-01T04:00:00.000Z')).toBe('23:00');
  });

  it('falls back to reading the offset off bedtime when the server sends none', () => {
    const clock = nightClock({ bedtime: '23:10', startUtcOffsetSeconds: null, endUtcOffsetSeconds: null }, [
      stage('2026-10-01T03:10:00.000Z', '2026-10-01T10:52:00.000Z'),
    ]);
    expect(clock.offset).toBe(-240);
    expect(clock.at('2026-10-01T03:35:00.000Z')).toBe('23:35');
  });

  it('reads UTC with neither offsets nor stages', () => {
    const clock = nightClock({ bedtime: '23:10', startUtcOffsetSeconds: null, endUtcOffsetSeconds: null }, []);
    expect(clock.offset).toBe(0);
  });
});

describe('main sleep', () => {
  it('reads the main session, falling back to the day total for an older server', () => {
    expect(mainMinutes(makeNight('2026-10-07', { minutesAsleep: 438, mainMinutesAsleep: 418 }))).toBe(418);
    expect(mainMinutes(makeNight('2026-10-07', { minutesAsleep: 438, mainMinutesAsleep: undefined }))).toBe(438);
    expect(isNapOnly(makeNight('2026-10-07', { mainIsNap: true }))).toBe(true);
    expect(isNapOnly(makeNight('2026-10-07', { mainIsNap: undefined }))).toBe(false);
  });

  it('keys nights by date with main-sleep minutes and drops nap-only dates', () => {
    const byDate = mainSleepByDate([
      makeNight('2026-10-06', { minutesAsleep: 455, mainMinutesAsleep: 420 }),
      makeNight('2026-10-07', { minutesAsleep: 45, mainMinutesAsleep: 45, mainIsNap: true }),
    ]);
    expect([...byDate.keys()]).toEqual(['2026-10-06']);
    expect(byDate.get('2026-10-06')!.minutesAsleep).toBe(420);
  });
});
