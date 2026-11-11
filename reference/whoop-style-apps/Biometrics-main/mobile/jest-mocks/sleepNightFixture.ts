import type { StageType } from '../src/api/sleep';
import { nightClock } from '../src/lib/sleepStats';

// The approved mockup's night (Night.dc.html): in bed 23:10 to 06:52 local,
// four hours behind UTC, so bedtime is 03:10Z. Synthetic values only.
export const MOCKUP_BEDTIME = '2026-10-01T03:10:00.000Z';
export const MOCKUP_OFFSET = -240;

/** One stage from `from` to `to` minutes after `base`. */
export function seg(type: StageType, from: number, to: number, base = MOCKUP_BEDTIME) {
  const t0 = Date.parse(base);
  return { type, start: new Date(t0 + from * 60000).toISOString(), end: new Date(t0 + to * 60000).toISOString() };
}

export const MOCKUP_SEGMENTS = (
  [
    ['AWAKE', 0, 8],
    ['LIGHT', 8, 25],
    ['DEEP', 25, 70],
    ['LIGHT', 70, 82],
    ['REM', 82, 100],
    ['LIGHT', 100, 120],
    ['DEEP', 120, 150],
    ['LIGHT', 150, 170],
    ['REM', 170, 195],
    ['LIGHT', 195, 225],
    ['DEEP', 225, 240],
    ['LIGHT', 240, 265],
    ['AWAKE', 265, 268],
    ['LIGHT', 268, 270],
    ['REM', 270, 295],
    ['LIGHT', 295, 360],
    ['REM', 360, 390],
    ['LIGHT', 390, 430],
    ['REM', 430, 455],
    ['AWAKE', 455, 462],
  ] as [StageType, number, number][]
).map(([type, from, to]) => seg(type, from, to));

// The mockup night's clock: New York in summer, four hours behind UTC.
export const MOCKUP_CLOCK = nightClock({ bedtime: '23:10', startUtcOffsetSeconds: -14400, endUtcOffsetSeconds: -14400 }, MOCKUP_SEGMENTS);
