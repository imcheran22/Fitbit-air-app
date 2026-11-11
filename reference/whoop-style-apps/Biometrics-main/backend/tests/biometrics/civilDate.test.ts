import {
  isValidTimeZone,
  localCivilDate,
  civilDateToUtcMidnight,
  minutesSinceLocalNoon,
  parseUtcOffsetSeconds,
  sessionEndCivilDate,
  sessionStartMinutesSinceLocalNoon,
} from '../../src/biometrics/civilDate';

describe('isValidTimeZone', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Auckland'])('accepts %s', (tz) => {
    expect(isValidTimeZone(tz)).toBe(true);
  });

  it.each(['', 'Not/AZone', 'PST8PDT-ish', '+05:00', '-08:00', 'America/', 42, null, undefined, {}])(
    'rejects %p',
    (tz) => {
      expect(isValidTimeZone(tz)).toBe(false);
    },
  );
});

describe('localCivilDate', () => {
  it('is UTC-identical for UTC', () => {
    expect(localCivilDate(new Date('2026-09-02T23:59:59Z'), 'UTC')).toBe('2026-09-02');
    expect(localCivilDate(new Date('2026-09-03T00:00:00Z'), 'UTC')).toBe('2026-09-03');
  });

  // West of UTC: a session ending 22:30 local Sep 2 in Los Angeles (UTC-7 in
  // September) is 05:30Z on Sep 3 -- after UTC midnight, still local Sep 2.
  it('west of UTC: an end instant after UTC midnight but before local midnight is the earlier local date', () => {
    expect(localCivilDate(new Date('2026-09-03T05:30:00Z'), 'America/Los_Angeles')).toBe('2026-09-02');
    expect(localCivilDate(new Date('2026-09-03T07:00:00Z'), 'America/Los_Angeles')).toBe('2026-09-03');
  });

  // East of UTC: 00:30 local Sep 3 in Auckland (UTC+12 in early September)
  // is 12:30Z on Sep 2 -- before UTC midnight, already local Sep 3.
  it('east of UTC: an end instant before UTC midnight but after local midnight is the later local date', () => {
    expect(localCivilDate(new Date('2026-09-02T12:30:00Z'), 'Pacific/Auckland')).toBe('2026-09-03');
    expect(localCivilDate(new Date('2026-09-02T11:59:00Z'), 'Pacific/Auckland')).toBe('2026-09-02');
  });

  it('handles a half-hour offset zone', () => {
    // Asia/Kolkata is UTC+5:30: 18:30Z is exactly local midnight.
    expect(localCivilDate(new Date('2026-09-02T18:29:59Z'), 'Asia/Kolkata')).toBe('2026-09-02');
    expect(localCivilDate(new Date('2026-09-02T18:30:00Z'), 'Asia/Kolkata')).toBe('2026-09-03');
  });

  it('follows DST: the same UTC clock time maps to different local dates across a transition', () => {
    // US DST ends 2026-11-01: LA is UTC-7 before, UTC-8 after.
    expect(localCivilDate(new Date('2026-11-01T07:30:00Z'), 'America/Los_Angeles')).toBe('2026-11-01');
    expect(localCivilDate(new Date('2026-11-02T07:30:00Z'), 'America/Los_Angeles')).toBe('2026-11-01');
    expect(localCivilDate(new Date('2026-11-02T08:00:00Z'), 'America/Los_Angeles')).toBe('2026-11-02');
  });

  it('throws on an invalid zone rather than silently falling back to UTC', () => {
    expect(() => localCivilDate(new Date('2026-09-02T00:00:00Z'), 'Nope/Zone')).toThrow();
  });
});

describe('civilDateToUtcMidnight', () => {
  it('returns UTC midnight of the civil date, the recordedAt convention of every other metric', () => {
    expect(civilDateToUtcMidnight('2026-09-02')).toEqual(new Date('2026-09-02T00:00:00Z'));
  });
});

describe('parseUtcOffsetSeconds', () => {
  it.each([
    ['-14400s', -14400],
    ['19800s', 19800],
    ['0s', 0],
    ['+32400s', 32400],
    ['-0s', 0],
    ['-45900s', -45900],
  ])('parses %p as %p seconds', (raw, expected) => {
    expect(parseUtcOffsetSeconds(raw)).toBe(expected);
  });

  it('returns +0, never -0, for a negative zero', () => {
    expect(Object.is(parseUtcOffsetSeconds('-0s'), 0)).toBe(true);
  });

  it.each(['', 's', '-s', '14400', '1.5s', '-1.5s', '1e3s', ' 3600s', '3600s ', '+-5s', 'abc', '3600 s', 'PT1H', '999999s', '-999999s'])(
    'returns null for malformed %p',
    (raw) => {
      expect(parseUtcOffsetSeconds(raw)).toBeNull();
    },
  );

  it.each([null, undefined, 3600, {}, [], true, Number.NaN])('returns null for non-string %p', (raw) => {
    expect(parseUtcOffsetSeconds(raw)).toBeNull();
  });
});

describe('sessionEndCivilDate', () => {
  const end = new Date('2026-09-02T18:00:00Z'); // 14:00 in New York, 03:00 next day in Tokyo

  it("uses the record's own offset and ignores the user timezone when present", () => {
    // User zone New York (would say 09-02); the session says +09:00 -> the Tokyo date.
    expect(sessionEndCivilDate({ endTime: end, endUtcOffsetSeconds: 32400 }, 'America/New_York')).toBe('2026-09-03');
  });

  it('falls back to the user timezone when the offset is null or absent', () => {
    expect(sessionEndCivilDate({ endTime: end, endUtcOffsetSeconds: null }, 'Asia/Tokyo')).toBe('2026-09-03');
    expect(sessionEndCivilDate({ endTime: end }, 'America/New_York')).toBe('2026-09-02');
  });

  it('handles a negative offset that pulls the end back across midnight', () => {
    // 02:00Z at -04:00 is 22:00 the PREVIOUS local day.
    expect(sessionEndCivilDate({ endTime: new Date('2026-09-02T02:00:00Z'), endUtcOffsetSeconds: -14400 }, 'UTC')).toBe(
      '2026-09-01',
    );
  });

  it('handles a zero offset as UTC (not as "missing")', () => {
    expect(sessionEndCivilDate({ endTime: new Date('2026-09-02T23:30:00Z'), endUtcOffsetSeconds: 0 }, 'Asia/Tokyo')).toBe(
      '2026-09-02',
    );
  });

  it('handles a half-hour offset around local midnight', () => {
    // +05:30: 18:29:59Z is 23:59:59 local, 18:30:00Z is local midnight.
    expect(sessionEndCivilDate({ endTime: new Date('2026-09-02T18:29:59Z'), endUtcOffsetSeconds: 19800 }, 'UTC')).toBe(
      '2026-09-02',
    );
    expect(sessionEndCivilDate({ endTime: new Date('2026-09-02T18:30:00Z'), endUtcOffsetSeconds: 19800 }, 'UTC')).toBe(
      '2026-09-03',
    );
  });
});

describe('sessionStartMinutesSinceLocalNoon', () => {
  const start = new Date('2026-09-02T14:30:00Z');

  it("uses the record's own start offset when present", () => {
    // +09:00 -> 23:30 local -> 690 minutes after noon, whatever the user zone says.
    expect(sessionStartMinutesSinceLocalNoon({ startTime: start, startUtcOffsetSeconds: 32400 }, 'America/New_York')).toBe(690);
  });

  it('falls back to the user timezone when the offset is null or absent', () => {
    // New York is UTC-4 in September: 10:30 local -> 22.5h after the previous noon = 1350.
    expect(sessionStartMinutesSinceLocalNoon({ startTime: start, startUtcOffsetSeconds: null }, 'America/New_York')).toBe(1350);
    expect(sessionStartMinutesSinceLocalNoon({ startTime: start }, 'America/New_York')).toBe(1350);
  });

  it('handles negative, zero and half-hour offsets and matches Intl for the equivalent zone', () => {
    expect(sessionStartMinutesSinceLocalNoon({ startTime: start, startUtcOffsetSeconds: -14400 }, 'UTC')).toBe(
      minutesSinceLocalNoon(start, 'America/New_York'),
    );
    expect(sessionStartMinutesSinceLocalNoon({ startTime: start, startUtcOffsetSeconds: 0 }, 'Asia/Tokyo')).toBe(
      minutesSinceLocalNoon(start, 'UTC'),
    );
    expect(sessionStartMinutesSinceLocalNoon({ startTime: start, startUtcOffsetSeconds: 19800 }, 'UTC')).toBe(
      minutesSinceLocalNoon(start, 'Asia/Kolkata'),
    );
  });

  it('keeps a night that crosses local midnight contiguous (23:30 and 00:30 are 60 apart)', () => {
    // +08:00: 15:30Z is 23:30 local; the next night's 16:30Z is 00:30 local.
    const before = sessionStartMinutesSinceLocalNoon({ startTime: new Date('2026-09-02T15:30:00Z'), startUtcOffsetSeconds: 28800 }, 'UTC');
    const after = sessionStartMinutesSinceLocalNoon({ startTime: new Date('2026-09-03T16:30:00Z'), startUtcOffsetSeconds: 28800 }, 'UTC');
    expect(after - before).toBe(60);
  });
});
