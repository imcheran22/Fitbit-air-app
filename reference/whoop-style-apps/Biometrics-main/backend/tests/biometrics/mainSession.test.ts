import { isDaytimeNap, pickMainSession } from '../../src/biometrics/mainSession';

const s = (start: string, end: string, minutesAsleep: number) => ({ startTime: new Date(start), endTime: new Date(end), minutesAsleep });

it('picks the most minutes asleep, earliest start on a tie, skipping empty intervals', () => {
  const nap = s('2026-10-01T13:00:00Z', '2026-10-01T15:30:00Z', 140);
  const night = s('2026-09-30T23:00:00Z', '2026-10-01T06:00:00Z', 400);
  expect(pickMainSession([nap, night])).toBe(night);
  const a = s('2026-09-30T22:00:00Z', '2026-10-01T02:00:00Z', 200);
  const b = s('2026-10-01T02:30:00Z', '2026-10-01T07:00:00Z', 200);
  expect(pickMainSession([b, a])).toBe(a);
  expect(pickMainSession([s('2026-10-01T07:00:00Z', '2026-10-01T07:00:00Z', 999), night])).toBe(night);
  expect(pickMainSession([])).toBeNull();
});

describe('isDaytimeNap', () => {
  const nap = (startIso: string, minutesAsleep: number, startUtcOffsetSeconds: number | null = 0) =>
    ({ startTime: new Date(startIso), startUtcOffsetSeconds, minutesAsleep });

  it('is a nap from 10:00 up to, not including, 18:00 local', () => {
    expect(isDaytimeNap(nap('2026-10-01T09:59:00Z', 60), 'UTC')).toBe(false);
    expect(isDaytimeNap(nap('2026-10-01T10:00:00Z', 60), 'UTC')).toBe(true);
    expect(isDaytimeNap(nap('2026-10-01T17:59:00Z', 60), 'UTC')).toBe(true);
    expect(isDaytimeNap(nap('2026-10-01T18:00:00Z', 60), 'UTC')).toBe(false);
  });

  it('is a nap only under 180 minutes asleep', () => {
    expect(isDaytimeNap(nap('2026-10-01T13:00:00Z', 179), 'UTC')).toBe(true);
    expect(isDaytimeNap(nap('2026-10-01T13:00:00Z', 180), 'UTC')).toBe(false);
  });

  it("reads the start on the session's own offset first", () => {
    // 07:30Z at +05:30 is 13:00 local.
    expect(isDaytimeNap(nap('2026-10-01T07:30:00Z', 40, 19800), 'UTC')).toBe(true);
  });

  it('falls back to the timezone, across a DST change', () => {
    // New York leaves DST on Sun 1 Nov 2026: 14:30Z is 10:30 EDT on Sat 31 Oct, 09:30 EST on Sun 1 Nov.
    expect(isDaytimeNap(nap('2026-10-31T14:30:00Z', 40, null), 'America/New_York')).toBe(true);
    expect(isDaytimeNap(nap('2026-11-01T14:30:00Z', 40, null), 'America/New_York')).toBe(false);
  });
});
