import type { RecoveryPageDTO } from '../src/api/recovery';

// Synthetic values only. The default is a READY page for Thu 8 Oct 2026, viewed as today.
// Tasks 7–9 reuse it; pass overrides for the state under test.
export function makePage(over: Partial<RecoveryPageDTO> = {}): RecoveryPageDTO {
  return {
    date: '2026-10-08',
    today: '2026-10-08',
    isToday: true,
    state: 'READY',
    bands: { excellent: 75, good: 55, fair: 40 },
    updatedAt: '2026-10-08T07:12:00',
    score: {
      date: '2026-10-08',
      type: 'RECOVERY',
      score: 68,
      confidenceLevel: 'HIGH',
      algorithmVersion: 'v1',
      factors: [
        { factor: 'HRV', label: 'HRV', z: 1.1, weight: 0.45, contribution: 0.5, points: 8, imputed: false, excluded: false },
        { factor: 'SLEEP_DEBT', label: 'Sleep debt', z: -1.3, goalMinutes: 480, weight: 0.2, contribution: -0.26, points: -5, imputed: false, excluded: false },
      ],
      coldStart: [],
    },
    previous: { date: '2026-10-07', score: 62 },
    baselines: [
      { metric: 'HRV', ewma: 52, spread: 3, daysOfHistory: 60, windowDays: 28, unit: 'ms' },
      { metric: 'RESTING_HR', ewma: 56, spread: 2, daysOfHistory: 60, windowDays: 28, unit: 'bpm' },
    ],
    weights: { HRV: 0.45, RHR: 0.35, SLEEP_DEBT: 0.2 },
    outlook: [
      { date: '2026-10-02', score: 58 },
      { date: '2026-10-03', score: 77 },
      { date: '2026-10-04', score: 49 },
      { date: '2026-10-05', score: 36 },
      { date: '2026-10-06', score: null },
      { date: '2026-10-07', score: 62 },
      { date: '2026-10-08', score: 68 },
    ],
    sleepDebt: { minutes: 190, windowNights: 14, goalMinutes: 480, usualLowMinutes: 75, usualHighMinutes: 125, nightsToClear: 2 },
    lastNight: { date: '2026-10-08', minutesAsleep: 408, stages: { deep: 82, rem: 91, light: 235, awake: 31 } },
    streak: { current: 2, best: 5 },
    month: {
      month: '2026-10',
      days: [
        { date: '2026-10-01', score: 71 },
        { date: '2026-10-02', score: 58 },
        { date: '2026-10-03', score: 77 },
        { date: '2026-10-04', score: 49 },
        { date: '2026-10-05', score: 36 },
        { date: '2026-10-06', score: null },
        { date: '2026-10-07', score: 62 },
        { date: '2026-10-08', score: 68 },
      ],
      average: 60,
      counts: { excellent: 1, good: 4, fair: 1, low: 1 },
    },
    firstScoredDate: '2026-08-01',
    tomorrow: {
      status: 'READY',
      date: '2026-10-09',
      chips: [
        { sleepHours: 6, score: 61, band: [56, 66], confidence: 'MEDIUM' },
        { sleepHours: 7, score: 68, band: [64, 72], confidence: 'MEDIUM' },
        { sleepHours: 8, score: 74, band: [70, 78], confidence: 'MEDIUM' },
        { sleepHours: 9, score: 76, band: [72, 80], confidence: 'MEDIUM' },
      ],
      trackRecord: { hits: 9, days: 12, withinPoints: 3 },
    },
    ...over,
  };
}
