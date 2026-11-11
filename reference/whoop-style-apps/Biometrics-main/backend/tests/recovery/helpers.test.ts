import { computeStreak } from '../../src/recovery/streak';
import { nightsToClear, usualDebtRange } from '../../src/recovery/sleepDebt';
import { buildMonth, buildOutlook } from '../../src/recovery/month';
import { tomorrowFrom } from '../../src/recovery/tomorrow';
import { getLiveConfig } from '../../src/scoring/configs';
import type { ForecastResponse } from '../../src/forecast/dto';

const BANDS = { excellent: 75, good: 55, fair: 40 };
const d = (date: string, score: number | null) => ({ date, score });

describe('computeStreak', () => {
  it('counts consecutive Good-or-better days ending at D, the band edge included', () => {
    const rows = [d('2026-10-01', 80), d('2026-10-02', 54.9), d('2026-10-03', 55), d('2026-10-04', 70)];
    expect(computeStreak(rows, '2026-10-04', 55, false)).toEqual({ current: 2, best: 2 });
  });
  it('a missing day or a null score breaks the run', () => {
    const rows = [d('2026-10-01', 80), d('2026-10-02', 80), d('2026-10-04', 80), d('2026-10-05', null), d('2026-10-06', 80)];
    expect(computeStreak(rows, '2026-10-06', 55, false)).toEqual({ current: 1, best: 2 });
  });
  it('today with no row yet continues from yesterday', () => {
    const rows = [d('2026-10-03', 60), d('2026-10-04', 60)];
    expect(computeStreak(rows, '2026-10-05', 55, true).current).toBe(2);
  });
  it('a past day with no row is a broken run (0)', () => {
    const rows = [d('2026-10-03', 60), d('2026-10-04', 60)];
    expect(computeStreak(rows, '2026-10-05', 55, false).current).toBe(0);
  });
  it('today with a BUILDING row (null score) does not shift to yesterday', () => {
    const rows = [d('2026-10-04', 60), d('2026-10-05', null)];
    expect(computeStreak(rows, '2026-10-05', 55, true).current).toBe(0);
  });
  it('best is the longest run in all history up to D, ignoring rows after D', () => {
    const rows = [d('2026-09-01', 60), d('2026-09-02', 60), d('2026-09-03', 60), d('2026-09-04', 30), d('2026-09-05', 60), d('2026-09-06', 60), d('2026-09-07', 60), d('2026-09-08', 60)];
    expect(computeStreak(rows, '2026-09-05', 55, false)).toEqual({ current: 1, best: 3 });
  });
  it('no history is 0 / 0', () => {
    expect(computeStreak([], '2026-10-05', 55, true)).toEqual({ current: 0, best: 0 });
  });
});

describe('nightsToClear', () => {
  const fourteen = (fill: (i: number) => number) => Array.from({ length: 14 }, (_, i) => fill(i));
  it('is 0 when debt is already within the usual', () => {
    expect(nightsToClear(fourteen(() => 5), 100)).toBe(0);
  });
  it('rolls the oldest nights off first', () => {
    // 60 + 60 at the oldest end, 10 elsewhere: sums 240, 180, 120, 110, ... as nights roll off.
    const deficits = fourteen((i) => (i < 2 ? 60 : 10));
    expect(nightsToClear(deficits, 180)).toBe(1);
    expect(nightsToClear(deficits, 130)).toBe(2);
    expect(nightsToClear(deficits, 119)).toBe(3);
  });
  it('caps at 14 (every night rolled off)', () => {
    expect(nightsToClear(fourteen(() => 100), 0)).toBe(14);
  });
});

describe('usualDebtRange', () => {
  const cfg = getLiveConfig();
  it('uses the floored spread, so a tiny MAD still gives a usable band', () => {
    const r = usualDebtRange({ ewma: 200, spread: 0, mad: 0, daysOfHistory: 30, algorithmVersion: cfg.version })!;
    const floor = cfg.spreadFloorFraction * 200;
    expect(r.low).toBeCloseTo(200 - floor, 5);
    expect(r.high).toBeCloseTo(200 + floor, 5);
  });
  it('clamps low at 0 and returns null in cold start', () => {
    expect(usualDebtRange({ ewma: 10, spread: 50, mad: 34, daysOfHistory: 30, algorithmVersion: cfg.version })!.low).toBe(0);
    expect(usualDebtRange({ ewma: null, spread: null, mad: null, daysOfHistory: 3, algorithmVersion: cfg.version })).toBeNull();
  });
  it('falls back to the live config for an unknown algorithm version', () => {
    expect(usualDebtRange({ ewma: 200, spread: 40, mad: 27, daysOfHistory: 30, algorithmVersion: 'v999' })).not.toBeNull();
  });
});

describe('buildMonth / buildOutlook', () => {
  it('averages non-null scores and counts each band', () => {
    const rows = [d('2026-09-30', 99), d('2026-10-01', 80), d('2026-10-02', 60), d('2026-10-03', 45), d('2026-10-04', 20), d('2026-10-05', null)];
    expect(buildMonth(rows, '2026-10', BANDS)).toEqual({
      month: '2026-10',
      days: [d('2026-10-01', 80), d('2026-10-02', 60), d('2026-10-03', 45), d('2026-10-04', 20), d('2026-10-05', null)],
      average: 51.3,
      counts: { excellent: 1, good: 1, fair: 1, low: 1 },
    });
  });
  it('an empty month has a null average and zero counts', () => {
    expect(buildMonth([], '2026-01', BANDS)).toEqual({ month: '2026-01', days: [], average: null, counts: { excellent: 0, good: 0, fair: 0, low: 0 } });
  });
  it('outlook is exactly 7 days ending at D, nulls for missing days', () => {
    const out = buildOutlook([d('2026-10-03', 61), d('2026-10-08', 68)], '2026-10-08');
    expect(out.map((o) => o.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
    expect(out.map((o) => o.score)).toEqual([null, 61, null, null, null, null, 68]);
  });
});

describe('tomorrowFrom', () => {
  const cell = (sleepHours: number, exposed: string[], score: number) => ({ sleepHours, exposed, score, band: [score - 4, score + 4] as [number, number], confidence: 'HIGH' as const, contributions: [] });
  type Lever = Extract<ForecastResponse, { status: 'READY' }>['levers'][number];
  const ready = (
    series: Array<{ forecast: number; actual: number }>,
    habits: Record<string, number> = { ALCOHOL: 0 },
    extra: { levers: Lever[]; exposed: string[] } | null = null,
  ): ForecastResponse => ({
    status: 'READY',
    date: '2026-10-09',
    algorithmVersion: 'v3',
    defaults: { sleepHours: 7.5, habits },
    levers: [
      { key: 'SLEEP', label: 'Sleep', unit: 'h', min: 4, max: 10, step: 0.5, effect: 'CONFIRMED' },
      { key: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', min: 0, max: 5, step: 1, threshold: 1, effect: 'CONFIRMED' },
      ...(extra?.levers ?? []),
    ],
    grid: [6, 6.5, 7, 7.5, 8, 8.5, 9].flatMap((h) => [
      cell(h, [], 50 + h),
      cell(h, ['ALCOHOL'], 40 + h),
      ...(extra ? [cell(h, extra.exposed, 30 + h)] : []),
    ]),
    trackRecord: { withinPoints: 3, hits: 0, days: series.length, series: series.map((s, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, ...s })) },
  });

  it('takes the 6/7/8/9 h cells at the default habit exposure', () => {
    const t = tomorrowFrom(ready([]));
    expect(t).toMatchObject({ status: 'READY', date: '2026-10-09' });
    if (t.status !== 'READY') throw new Error();
    expect(t.chips.map((c) => [c.sleepHours, c.score])).toEqual([[6, 56], [7, 57], [8, 58], [9, 59]]);
  });
  it('a confirmed habit at or above its threshold by default picks the exposed cells', () => {
    const t = tomorrowFrom(ready([], { ALCOHOL: 2 }));
    if (t.status !== 'READY') throw new Error();
    expect(t.chips.map((c) => [c.sleepHours, c.score])).toEqual([[6, 46], [7, 47], [8, 48], [9, 49]]);
  });
  it('a habit without a confirmed effect never counts toward the exposure', () => {
    const caffeine: Lever = { key: 'CAFFEINE', label: 'Caffeine', unit: 'cups', min: 0, max: 5, step: 1, threshold: 1, effect: 'NONE_YET' };
    const t = tomorrowFrom(ready([], { ALCOHOL: 0, CAFFEINE: 3 }, { levers: [caffeine], exposed: ['CAFFEINE'] }));
    if (t.status !== 'READY') throw new Error();
    expect(t.chips.map((c) => [c.sleepHours, c.score])).toEqual([[6, 56], [7, 57], [8, 58], [9, 59]]);
  });
  it('counts hits over the last 12 points with the full series tolerance', () => {
    const series = [...Array.from({ length: 8 }, () => ({ forecast: 50, actual: 70 })), ...Array.from({ length: 12 }, (_, i) => ({ forecast: 50, actual: i < 9 ? 52 : 60 }))];
    const t = tomorrowFrom(ready(series));
    if (t.status !== 'READY') throw new Error();
    expect(t.trackRecord).toEqual({ hits: 9, days: 12, withinPoints: 3 });
  });
  it('passes NOT_ENOUGH_DATA through', () => {
    expect(tomorrowFrom({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 4 })).toEqual({ status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory: 4 });
  });
});
