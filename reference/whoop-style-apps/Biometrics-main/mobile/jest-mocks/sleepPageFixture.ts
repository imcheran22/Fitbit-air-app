import type { DailyScoreDTO, ScoreDetailDTO } from '../src/api/scores';
import type { SleepActivityDTO, SleepGoal, SleepNight, SleepNightDetail, SleepRegularity } from '../src/api/sleep';
import type { WindDownSettings } from '../src/lib/windDown';
import { MOCKUP_SEGMENTS } from './sleepNightFixture';

// Synthetic values only. "Today" is Thu 8 Oct 2026 (1 Oct 2026 is a Thursday), so the default week is
// Fri 2 Oct .. Thu 8 Oct. Tue 6 Oct has no night; Wed 7 Oct has a nap besides its night.
export const TODAY = '2026-10-08';
export const BANDS = { excellent: 75, good: 55, fair: 40 };
export const GOAL: SleepGoal = { sleepGoalMinutes: 480, bedtimeGoal: '22:45', wakeGoal: '06:45' };
export const REMINDER: WindDownSettings = { enabled: true, leadMinutes: 30, bedtimeGoal: '22:45', coachName: 'Mochi', notificationId: null };
export const REGULARITY: SleepRegularity = {
  days: 7, nights: 6, score: 74, bedtimeSpreadMinutes: 24, wakeSpreadMinutes: 18, averageBedtime: '23:12', averageWake: '06:44', drift: [],
};

export function makeNight(date: string, over: Partial<SleepNight> = {}): SleepNight {
  return {
    date, minutesAsleep: 432, mainMinutesAsleep: 432, mainIsNap: false, minutesInBed: 452, bedtime: '23:08', wakeTime: '06:40',
    sleepScore: 78, minutesAwake: 14, stageMinutes: null, hasStages: true, ...over,
  };
}

export function makeWindow(over: Partial<SleepActivityDTO> = {}): SleepActivityDTO {
  return {
    nights: [
      makeNight('2026-10-02', { minutesAsleep: 401, mainMinutesAsleep: 401, sleepScore: 52 }),
      makeNight('2026-10-03', { minutesAsleep: 440, mainMinutesAsleep: 440, sleepScore: 66 }),
      makeNight('2026-10-04', { minutesAsleep: 514, mainMinutesAsleep: 514, sleepScore: 81, bedtime: '22:40', wakeTime: '07:20' }),
      makeNight('2026-10-05', { minutesAsleep: 302, mainMinutesAsleep: 302, sleepScore: 35, bedtime: '00:50', wakeTime: '06:10' }),
      makeNight('2026-10-07', { minutesAsleep: 438, mainMinutesAsleep: 418, sleepScore: 70 }),
      makeNight(TODAY),
    ],
    earliestDate: '2026-08-01',
    stagesBackfillPending: false,
    bands: BANDS,
    today: TODAY,
    ...over,
  };
}

export function makeDetail(date: string = TODAY, over: Partial<SleepNightDetail> = {}): SleepNightDetail {
  return {
    date, bedtime: '23:10', wakeTime: '06:52', startUtcOffsetSeconds: -14400, endUtcOffsetSeconds: -14400,
    minutesAsleep: 432, minutesInBed: 452, minutesAwake: 14, minutesToFallAsleep: 12, minutesAfterWakeUp: 6,
    hasStages: true, stages: MOCKUP_SEGMENTS,
    stageTotals: { deep: { minutes: 90, count: 3 }, light: { minutes: 219, count: 9 }, rem: { minutes: 123, count: 5 }, awake: { minutes: 18, count: 3 } },
    naps: [], sleepScore: 78, usualMinutesAsleep: 420, mainIsNap: false, ...over,
  };
}

export function makeScore(
  date: string = TODAY,
  over: Partial<DailyScoreDTO> = {},
  previous: ScoreDetailDTO['previous'] = { date: '2026-10-07', score: 72 },
): ScoreDetailDTO {
  return {
    score: {
      date, type: 'SLEEP', score: 78, confidenceLevel: 'HIGH', algorithmVersion: 'v3',
      factors: [
        { factor: 'SLEEP_DURATION', label: 'Sleep duration', z: -0.4, goalMinutes: 480, weight: 0.5, contribution: -0.2, points: -3, imputed: false, excluded: false },
        { factor: 'SLEEP_EFFICIENCY', label: 'Sleep efficiency', z: 0.8, weight: 0.3, contribution: 0.24, points: 4, imputed: false, excluded: false },
        { factor: 'CIRCADIAN_CONSISTENCY', label: 'Bedtime consistency', z: 0.5, weight: 0.2, contribution: 0.1, points: 2, imputed: false, excluded: false },
      ],
      coldStart: [],
      ...over,
    },
    baselines: [
      { metric: 'SLEEP', ewma: 425, spread: 30, daysOfHistory: 60, windowDays: 28, unit: 'min' },
      { metric: 'SLEEP_EFFICIENCY', ewma: 92, spread: 2, daysOfHistory: 60, windowDays: 28, unit: '%' },
    ],
    previous,
    bands: BANDS,
  };
}
