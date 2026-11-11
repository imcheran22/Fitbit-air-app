import { recoveryLevel, recoveryStats, skyStrip, weekRows, weekSummary, yearSoFar } from '../../src/lib/activityWeek';

const BANDS = { excellent: 75, good: 55, fair: 40 };
const TODAY = '2026-10-10'; // a Saturday

describe('weekRows', () => {
  const steps = new Map([['2026-10-10', 8412], ['2026-10-09', 16000], ['2026-10-05', 0]]);
  const sleep = new Map([['2026-10-10', 432], ['2026-10-08', 600]]);
  const recovery = new Map([['2026-10-10', 81], ['2026-10-09', 38]]);

  it('lists today and the six days before it, newest first', () => {
    const rows = weekRows(TODAY, steps, sleep, recovery, BANDS);
    expect(rows.map((r) => r.date)).toEqual(['2026-10-10', '2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05', '2026-10-04']);
    expect(rows[0]).toMatchObject({ weekday: 'SAT', day: 10, isToday: true });
    expect(rows[1]!.isToday).toBe(false);
  });

  it('carries each value, a weather band, and bar fills against 9h and 15,000 steps', () => {
    const [today, yesterday, twoAgo, , , fiveAgo, sixAgo] = weekRows(TODAY, steps, sleep, recovery, BANDS);
    expect(today).toMatchObject({ recovery: 81, weather: 'clear', low: false, sleepMinutes: 432, steps: 8412 });
    expect(today!.sleepFill).toBeCloseTo(0.8);
    expect(today!.stepsFill).toBeCloseTo(0.5608);
    // Under 40 is low; fills never pass the end of the bar.
    expect(yesterday).toMatchObject({ recovery: 38, weather: 'stormy', low: true, stepsFill: 1 });
    expect(twoAgo).toMatchObject({ sleepMinutes: 600, sleepFill: 1, recovery: null, weather: null });
    // A recorded 0 is a value; a missing day is null.
    expect(fiveAgo).toMatchObject({ steps: 0, stepsFill: 0 });
    expect(sixAgo).toMatchObject({ steps: null, sleepMinutes: null, recovery: null, stepsFill: 0, sleepFill: 0 });
  });

  it('works without sleep or recovery', () => {
    const rows = weekRows(TODAY, steps, null, null, BANDS);
    expect(rows[0]).toMatchObject({ sleepMinutes: null, recovery: null, weather: null });
  });
});

it('sums the week: steps on record and nights slept', () => {
  const rows = weekRows(TODAY, new Map([['2026-10-10', 1000], ['2026-10-04', 500], ['2026-10-03', 9999]]), new Map([['2026-10-10', 400], ['2026-10-09', 0]]), null, BANDS);
  expect(weekSummary(rows)).toEqual({ steps: 1500, nights: 1 });
});

it('levels recovery by band: low 1, fair 2, good 3, excellent 4', () => {
  const level = recoveryLevel(BANDS);
  expect([null, 10, 40, 55, 75].map((v) => level(v, 0))).toEqual([null, 1, 2, 3, 4]);
  expect(level(undefined, 0)).toBeNull();
});

it('sums a range of recovery: average, best day, days scored, clear and stormy', () => {
  const values = new Map([['2026-09-30', 99], ['2026-10-01', 80], ['2026-10-02', 30], ['2026-10-03', 60], ['2026-10-04', 76]]);
  expect(recoveryStats(values, '2026-10-01', '2026-10-31', TODAY, BANDS)).toEqual({
    average: 61.5,
    best: { date: '2026-10-01', score: 80 },
    scored: 4,
    clear: 2,
    stormy: 1,
  });
  expect(recoveryStats(new Map(), '2026-10-01', '2026-10-31', TODAY, BANDS)).toEqual({ average: null, best: null, scored: 0, clear: 0, stormy: 0 });
});

it('sums the year so far from 1 January through today', () => {
  const values = new Map([['2025-12-31', 50000], ['2026-01-01', 12000], ['2026-06-01', 4000], ['2026-10-10', 10000]]);
  expect(yearSoFar(values, TODAY, 10000)).toEqual({ total: 26000, average: 26000 / 3, goalDays: 2 });
  expect(yearSoFar(new Map(), TODAY, 10000)).toEqual({ total: 0, average: null, goalDays: 0 });
});

it('draws the sky strip on whole cells, as wide as asked', () => {
  const rects = skyStrip(100);
  expect(rects.every((r) => Number.isInteger(r.x) && Number.isInteger(r.y) && Number.isInteger(r.w) && Number.isInteger(r.h))).toBe(true);
  expect(Math.max(...rects.map((r) => r.x + r.w))).toBe(100);
  expect(Math.max(...rects.map((r) => r.y + r.h))).toBe(42);
});
