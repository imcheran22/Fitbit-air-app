import {
  campOnEvening, countLitNights, eveningDate, fireSegments, goodnightOpensAt, isGoodnightOpen, isNight, isOnTime,
  localInstant, nextSunrise, onTimeNightsByViewerEvening, zoneOrUtc,
} from '../../src/social/night';

// Pure functions, but run through the backend helper like every backend suite (its globalSetup needs the test DB).
const LA = 'America/Los_Angeles'; // PDT = UTC−7 in October
const at = (iso: string) => new Date(iso);

it('night is 19:00–05:59 in the given zone; an unknown zone reads as UTC', () => {
  expect(isNight(at('2026-10-08T01:59:00Z'), LA)).toBe(false); // 18:59
  expect(isNight(at('2026-10-08T02:00:00Z'), LA)).toBe(true); // 19:00
  expect(isNight(at('2026-10-08T12:59:00Z'), LA)).toBe(true); // 05:59
  expect(isNight(at('2026-10-08T13:00:00Z'), LA)).toBe(false); // 06:00
  expect(isNight(at('2026-10-07T12:00:00Z'), 'Not/AZone')).toBe(false);
  expect(isNight(at('2026-10-07T20:00:00Z'), 'Not/AZone')).toBe(true);
  expect([zoneOrUtc(LA), zoneOrUtc('Not/AZone')]).toEqual([LA, 'UTC']);
});

it('"Say goodnight" opens at min(20:00, goal − 60 min) and closes at 05:59; the scene keeps 19:00', () => {
  expect(goodnightOpensAt(null)).toBe('20:00');
  expect(goodnightOpensAt('18:00')).toBe('17:00');
  expect(goodnightOpensAt('20:30')).toBe('19:30');
  expect(goodnightOpensAt('23:00')).toBe('20:00');
  expect(goodnightOpensAt('00:30')).toBe('20:00'); // a goal before noon is after midnight
  expect(goodnightOpensAt('12:00')).toBe('11:00'); // the earliest possible opening
  expect(goodnightOpensAt('nonsense')).toBe('20:00'); // a bad goal reads as none
  // An 18:00 goal opens at 17:00 (LA, PDT).
  expect(isGoodnightOpen(at('2026-10-07T23:59:00Z'), LA, '18:00')).toBe(false); // 16:59
  expect(isGoodnightOpen(at('2026-10-08T00:00:00Z'), LA, '18:00')).toBe(true); // 17:00
  // No goal: 19:30 is night for the scene, but goodnight waits for 20:00.
  expect(isNight(at('2026-10-08T02:30:00Z'), LA)).toBe(true); // 19:30
  expect(isGoodnightOpen(at('2026-10-08T02:30:00Z'), LA, null)).toBe(false); // 19:30
  expect(isGoodnightOpen(at('2026-10-08T03:00:00Z'), LA, null)).toBe(true); // 20:00
  // A 23:00 goal opens at 20:00 like no goal; every window closes at 06:00.
  expect(isGoodnightOpen(at('2026-10-08T02:59:00Z'), LA, '23:00')).toBe(false); // 19:59
  expect(isGoodnightOpen(at('2026-10-08T12:59:00Z'), LA, '23:00')).toBe(true); // 05:59
  expect(isGoodnightOpen(at('2026-10-08T13:00:00Z'), LA, '18:00')).toBe(false); // 06:00
});

it('a goodnight between 00:00 and 05:59 belongs to the evening before', () => {
  expect(eveningDate(at('2026-10-08T05:30:00Z'), LA)).toBe('2026-10-07'); // 22:30 Oct 7
  expect(eveningDate(at('2026-10-08T07:30:00Z'), LA)).toBe('2026-10-07'); // 00:30 Oct 8
  expect(eveningDate(at('2026-10-08T12:59:00Z'), LA)).toBe('2026-10-07'); // 05:59 Oct 8
  expect(eveningDate(at('2026-10-08T13:00:00Z'), LA)).toBe('2026-10-08'); // 06:00 Oct 8
});

it('on time = at or before the bedtime goal + 15 min, or 23:00 with no goal, across midnight', () => {
  expect(isOnTime(at('2026-10-08T05:45:00Z'), LA, '22:30')).toBe(true); // 22:45
  expect(isOnTime(at('2026-10-08T05:46:00Z'), LA, '22:30')).toBe(false); // 22:46
  expect(isOnTime(at('2026-10-08T06:00:00Z'), LA, null)).toBe(true); // 23:00
  expect(isOnTime(at('2026-10-08T06:01:00Z'), LA, null)).toBe(false); // 23:01
  expect(isOnTime(at('2026-10-08T07:30:00Z'), LA, null)).toBe(false); // 00:30 is after 23:00
  expect(isOnTime(at('2026-10-08T07:40:00Z'), LA, '00:30')).toBe(true); // 00:40 <= 00:45: the goal wraps midnight
  expect(isOnTime(at('2026-10-08T05:00:00Z'), LA, '00:30')).toBe(true); // 22:00, before a past-midnight goal
  expect(isOnTime(at('2026-10-08T07:30:00Z'), LA, '23:45')).toBe(false); // 00:30 > 24:00
  expect(isOnTime(at('2026-10-08T05:45:00Z'), LA, 'nonsense')).toBe(true); // a bad goal reads as none: 22:45 <= 23:00
});

describe('edges (final wave)', () => {
  const NZ = 'Pacific/Auckland'; // NZDT = UTC+13 in October

  it("an Auckland evening turns at her own 06:00", () => {
    expect(eveningDate(at('2026-10-07T16:59:00Z'), NZ)).toBe('2026-10-07'); // 05:59 Oct 8 NZDT
    expect(eveningDate(at('2026-10-07T17:00:00Z'), NZ)).toBe('2026-10-08'); // 06:00 Oct 8 NZDT
  });

  it('with no goal, 23:00 is on time and 23:01 is not', () => {
    expect(isOnTime(at('2026-10-08T06:00:00Z'), LA, null)).toBe(true); // 23:00
    expect(isOnTime(at('2026-10-08T06:01:00Z'), LA, null)).toBe(false); // 23:01
  });

  it('localInstant honours DST: LA spring-forward evening, NZ spring-forward morning', () => {
    expect(localInstant('2026-03-08', '19:00', LA).toISOString()).toBe('2026-03-09T02:00:00.000Z'); // 19:00 PDT
    expect(localInstant('2026-09-27', '06:00', NZ).toISOString()).toBe('2026-09-26T17:00:00.000Z'); // 06:00 NZDT
  });

  it('an 18:00 goal: on time through 18:15, late from 18:16 and after midnight', () => {
    expect(isOnTime(at('2026-10-08T01:15:00Z'), LA, '18:00')).toBe(true); // 18:15
    expect(isOnTime(at('2026-10-08T01:16:00Z'), LA, '18:00')).toBe(false); // 18:16
    expect(isOnTime(at('2026-10-08T09:00:00Z'), LA, '18:00')).toBe(false); // 02:00
  });

  it('the noon pivot: an 11:59 goal is after midnight (opens 20:00), a 12:00 goal is that day (opens 11:00)', () => {
    expect(goodnightOpensAt('11:59')).toBe('20:00');
    expect(goodnightOpensAt('12:00')).toBe('11:00');
    expect(isGoodnightOpen(at('2026-10-07T17:59:00Z'), LA, '12:00')).toBe(false); // 10:59
    expect(isGoodnightOpen(at('2026-10-07T18:00:00Z'), LA, '12:00')).toBe(true); // 11:00
    expect(isGoodnightOpen(at('2026-10-07T18:00:00Z'), LA, '11:59')).toBe(false); // 11:00
  });

  it('seconds never make a goodnight late: 22:45:59 against a 22:30 goal is on time', () => {
    expect(isOnTime(at('2026-10-08T05:45:59Z'), LA, '22:30')).toBe(true);
  });
});

it('a camp note clears at the next 06:00 in its zone, DST included', () => {
  expect(nextSunrise(at('2026-10-08T05:30:00Z'), LA).toISOString()).toBe('2026-10-08T13:00:00.000Z'); // 22:30 → 06:00 PDT
  expect(nextSunrise(at('2026-10-08T10:00:00Z'), LA).toISOString()).toBe('2026-10-08T13:00:00.000Z'); // 03:00 → that morning
  expect(nextSunrise(at('2026-10-08T13:00:00Z'), LA).toISOString()).toBe('2026-10-09T13:00:00.000Z'); // 06:00 sharp → tomorrow
  expect(nextSunrise(at('2026-11-01T05:00:00Z'), LA).toISOString()).toBe('2026-11-01T14:00:00.000Z'); // 22:00 PDT Oct 31 → 06:00 PST
  expect(nextSunrise(at('2026-10-07T20:00:00Z'), 'Pacific/Auckland').toISOString()).toBe('2026-10-08T17:00:00.000Z'); // 09:00 NZDT → 06:00 next day
  expect(localInstant('2026-10-08', '06:00', 'Not/AZone').toISOString()).toBe('2026-10-08T06:00:00.000Z');
});

it('the fire has five segments by the share of the camp in bed on time', () => {
  expect([0, 1, 2, 3, 4, 5].map((lit) => fireSegments(lit, 5))).toEqual([0, 1, 2, 3, 4, 5]);
  // 10% and 20% → 1, 30% → 2, 80% → 4, 90% → 5.
  expect([fireSegments(1, 10), fireSegments(2, 10), fireSegments(3, 10), fireSegments(8, 10), fireSegments(9, 10)]).toEqual([1, 1, 2, 4, 5]);
  expect(fireSegments(3, 0)).toBe(0);
});

it("an evening's camp is the viewer and the buddies paired by its 19:00 in the viewer's zone", () => {
  // LA Mon Oct 5, 19:00 PDT = 2026-10-06T02:00Z.
  const pairedAt = new Map([['a', at('2026-10-06T01:59:00Z')], ['b', at('2026-10-06T02:00:00Z')], ['c', at('2026-10-06T02:01:00Z')]]);
  expect([...campOnEvening('2026-10-05', 'me', pairedAt, LA)].sort()).toEqual(['a', 'b', 'me']);
  expect([...campOnEvening('2026-10-06', 'me', pairedAt, LA)].sort()).toEqual(['a', 'b', 'c', 'me']);
  expect([...campOnEvening('2026-10-04', 'me', pairedAt, LA)]).toEqual(['me']); // the viewer always counts
});

it("counts the nights whose fire reached 3 segments, each with that night's camp", () => {
  const four = () => new Set(['me', 'a', 'b', 'c']);
  const gn = (date: string, ...ids: string[]) => ids.map((authorId) => ({ authorId, date }));
  // A camp of 4: Mon 3 on time (4 segments), Tue 1 (2), Wed 2 (3).
  const week = [...gn('2026-10-05', 'me', 'a', 'b'), ...gn('2026-10-06', 'a'), ...gn('2026-10-07', 'a', 'c')];
  expect(countLitNights(week, four)).toBe(2);
  expect(countLitNights([], four)).toBe(0);
  // Monday and Tuesday's camp was me + a (b and c paired on Wednesday): Monday is 2 of 2 (b's goodnight that night is
  // ignored) and Tuesday is a alone, 1 of 2 (3 segments, lit). Counted against all four, Tuesday would be 1 of 4
  // (2 segments, unlit).
  const campOn = (date: string) => (date === '2026-10-05' || date === '2026-10-06' ? new Set(['me', 'a']) : four());
  expect(countLitNights([...gn('2026-10-05', 'me', 'a', 'b'), ...gn('2026-10-06', 'a')], campOn)).toBe(2);
  expect(countLitNights([...gn('2026-10-05', 'me', 'a', 'b'), ...gn('2026-10-06', 'a')], four)).toBe(1);
  // A night's on-time count is per person: a duplicate row never counts twice.
  expect(countLitNights(gn('2026-10-05', 'a', 'a', 'a'), four)).toBe(0);
});

it("files on-time goodnights under the viewer's evening they were said in, never the author's own date", () => {
  const rows = [
    { authorId: 'me', at: at('2026-10-08T05:30:00Z'), onTime: true }, // my Wed 22:30
    { authorId: 'ana', at: at('2026-10-08T09:00:00Z'), onTime: true }, // her Thu 22:00 NZDT (her Oct 8), my Thu 02:00
    { authorId: 'kai', at: at('2026-10-08T09:10:00Z'), onTime: false }, // late: never part of a lit night
    { authorId: 'hal', at: at('2026-10-08T15:00:00Z'), onTime: true }, // his 05:00 HST (his Oct 7), my Thu 08:00
  ];
  expect(onTimeNightsByViewerEvening(rows, LA)).toEqual([
    { authorId: 'me', date: '2026-10-07' },
    { authorId: 'ana', date: '2026-10-07' },
    { authorId: 'hal', date: '2026-10-08' },
  ]);
});
