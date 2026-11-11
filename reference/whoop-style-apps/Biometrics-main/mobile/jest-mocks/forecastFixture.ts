import type { ReadyForecastDTO } from '../src/api/forecast';

const sleeps = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const READY: ReadyForecastDTO = {
  status: 'READY',
  date: '2026-07-01',
  algorithmVersion: 'v3',
  defaults: { sleepHours: 7.5, habits: { ALCOHOL: 0, CAFFEINE: 1, WORKOUT: 0 } },
  levers: [
    { key: 'SLEEP', label: 'Sleep', unit: 'hours', min: 4, max: 10, step: 0.5, effect: 'CONFIRMED' },
    { key: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', min: 0, max: 6, step: 1, threshold: 2, effect: 'CONFIRMED' },
    { key: 'CAFFEINE', label: 'Caffeine', unit: 'cups', min: 0, max: 6, step: 1, threshold: 3, effect: 'NONE_YET' },
    { key: 'WORKOUT', label: 'Workout', unit: 'minutes', min: 0, max: 120, step: 10, threshold: 20, effect: 'NONE_YET' },
  ],
  grid: sleeps.flatMap((sleepHours) =>
    [[], ['ALCOHOL']].map((exposed) => ({
      sleepHours,
      exposed,
      score: 50 + sleepHours * 3 - (exposed.length ? 9 : 0),
      band: [40, 80] as [number, number],
      confidence: 'HIGH' as const,
      contributions: [
        { key: 'CARRY_OVER', points: 2 },
        { key: 'SLEEP', points: sleepHours * 3 - 2 },
        ...(exposed.length ? [{ key: 'ALCOHOL', points: -9 }] : []),
      ],
    })),
  ),
  trackRecord: { withinPoints: 6, hits: 24, days: 30, series: [] },
};
