import { DEFAULT_SCORE_BANDS } from '../lib/scoreInsights';
import { apiFetch } from './client';
import type { ScoreBandsDTO } from './scores';

export type StageType = 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM';

export interface SleepNight {
  // The local date the night ENDED on (the morning you woke up).
  date: string;
  minutesAsleep: number;
  // Start to end across that date's sessions; null if the sessions are missing.
  minutesInBed: number | null;
  // Local "HH:MM" (24-hour) of the night's main sleep.
  bedtime: string | null;
  wakeTime: string | null;
  sleepScore: number | null;
  // The main session's minutes awake, when its source reported a summary.
  minutesAwake: number | null;
  // Minutes in each stage, or null with no stage summary at all. A partial
  // summary can arrive with zeros here, so decide stage visuals on hasStages,
  // never on this being non-null.
  stageMinutes: { deep: number; light: number; rem: number; awake: number } | null;
  // Whether the main session has a DEEP, LIGHT or REM stage (AWAKE alone is not stages).
  hasStages: boolean;
  // The main session's minutes asleep: the page's one night duration (minutesAsleep stays the day total, naps
  // included, which scoring reads). fetchSleep always fills it; optional so older fixtures still type-check.
  mainMinutesAsleep?: number | null;
  // The main session is a daytime nap (server rule): the date has no night.
  mainIsNap?: boolean;
}

export interface SleepActivityDTO {
  nights: SleepNight[];
  // The oldest night the server has, or null when none has synced yet.
  earliestDate: string | null;
  // True while older nights still wait for their one-off stage backfill.
  stagesBackfillPending: boolean;
  // The live score bands for colouring sleepScore; fetchSleep defaults an older server's to DEFAULT_SCORE_BANDS.
  bands?: ScoreBandsDTO;
  // The user's local today from the server; null from an older server (the device clock is used then).
  today?: string | null;
}

// GET /me/sleep/night/:date -- one night in full (404 when there is none).
export interface SleepNightDetail {
  date: string;
  // Local "HH:MM" start and end of the main session.
  bedtime: string;
  wakeTime: string;
  // The main session's UTC offsets at its start and end (they differ across a
  // DST change); null when unknown or from an older server.
  startUtcOffsetSeconds: number | null;
  endUtcOffsetSeconds: number | null;
  minutesAsleep: number;
  minutesInBed: number;
  minutesAwake: number | null;
  minutesToFallAsleep: number | null;
  minutesAfterWakeUp: number | null;
  hasStages: boolean;
  // The main session's stage timeline (ISO instants) by start time; [] without stages.
  stages: { type: StageType; start: string; end: string }[];
  // null without stages.
  stageTotals: Record<'deep' | 'light' | 'rem' | 'awake', { minutes: number; count: number }> | null;
  // Every other session ending that date.
  naps: { start: string; end: string; minutesAsleep: number }[];
  sleepScore: number | null;
  // Mean main-session minutes asleep over the 30 nights before; null unless 7 or more have one.
  usualMinutesAsleep: number | null;
  // The main session is a daytime nap (server rule): the date has no night.
  mainIsNap?: boolean;
}

export interface SleepRegularity {
  days: 7 | 30;
  // Nights with a main session in the window.
  nights: number;
  // 0..100; it and the spreads are null below the minimum nights.
  score: number | null;
  bedtimeSpreadMinutes: number | null;
  wakeSpreadMinutes: number | null;
  // Local "HH:MM"; null with no nights.
  averageBedtime: string | null;
  averageWake: string | null;
  // One per night with data: that night's bedtime minus the average.
  drift: { date: string; bedtimeOffsetMinutes: number }[];
}

export interface SleepGoal {
  sleepGoalMinutes: number;
  // Local "HH:MM", or null when unset.
  bedtimeGoal: string | null;
  wakeGoal: string | null;
}

// Nightly sleep for an inclusive civil-date range (the server caps it at 400 days).
// An older server has no stage fields, so they default to "no stages"; nor the one-page fields, which default to the
// day total, no nap, the default bands and no server today.
export async function fetchSleep(from: string, to: string): Promise<SleepActivityDTO> {
  const res = await apiFetch<SleepActivityDTO>(`/me/sleep?from=${from}&to=${to}`);
  return {
    ...res,
    nights: res.nights.map((n) => ({
      ...n,
      minutesAwake: n.minutesAwake ?? null,
      stageMinutes: n.stageMinutes ?? null,
      hasStages: n.hasStages === true,
      // No main session (or an older server): the day total is the only figure there is.
      mainMinutesAsleep: n.mainMinutesAsleep ?? n.minutesAsleep,
      mainIsNap: n.mainIsNap === true,
    })),
    stagesBackfillPending: res.stagesBackfillPending === true,
    bands: res.bands ?? DEFAULT_SCORE_BANDS,
    today: res.today ?? null,
  };
}

// An older server sends no session offsets, so they default to unknown, nor the nap flag, which defaults to false.
export async function fetchSleepNight(date: string): Promise<SleepNightDetail> {
  const res = await apiFetch<SleepNightDetail>(`/me/sleep/night/${encodeURIComponent(date)}`);
  return {
    ...res,
    startUtcOffsetSeconds: res.startUtcOffsetSeconds ?? null,
    endUtcOffsetSeconds: res.endUtcOffsetSeconds ?? null,
    mainIsNap: res.mainIsNap === true,
  };
}

export function fetchSleepRegularity(days: 7 | 30): Promise<SleepRegularity> {
  return apiFetch<SleepRegularity>(`/me/sleep/regularity?days=${days}`);
}

export function fetchSleepGoal(): Promise<SleepGoal> {
  return apiFetch<SleepGoal>('/me/sleep/goal');
}

// Any subset of the goal; returns the whole saved goal (400 invalid_goal on a bad value).
export function saveSleepGoal(patch: Partial<SleepGoal>): Promise<SleepGoal> {
  return apiFetch<SleepGoal>('/me/sleep/goal', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}
