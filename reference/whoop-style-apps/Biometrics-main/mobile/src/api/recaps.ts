import { apiFetch } from './client';

// Recaps (spec 2026-10-04): prepared on the server; the app only reads them and says when one was opened.

export type RecapKind = 'WEEK' | 'MONTH';

export interface WeekStripEntry {
  date: string;
  minutesAsleep: number | null;
  onGoal: boolean | null;
  recovery: number | null;
}

export interface RecapComparison {
  avgSleepDelta?: number;
  bedtimeSpreadDelta?: number;
  avgRecoveryDelta?: number;
}

export interface RecapMilestones {
  streak?: { nights: number };
  bestRecoveryWeek?: { weekStart: string; avgRecovery: number };
  everyDayLogged?: { days: number };
  steadiestMonth?: { spreadMinutes: number };
}

// Each number is absent, never zero-filled, when its own data is missing.
export interface RecapStats {
  nightsWithData: number;
  avgSleepMinutes?: number;
  nightsOnGoal?: number;
  longestOnGoalStreak?: number;
  bestNight?: { date: string; minutesAsleep: number };
  bestRecovery?: { date: string; score: number };
  avgRecovery?: number;
  steps?: { total: number; dailyAverage: number };
  earlierBedtimes?: { nights: number; of: number };
  bedtimeSpreadMinutes?: number;
  weekStrip?: WeekStripEntry[];
  comparison?: RecapComparison;
  milestones?: RecapMilestones;
}

export interface RecapSummary {
  id: string;
  kind: RecapKind;
  periodStart: string;
  periodEnd: string;
  line: string;
  personaId: string | null;
  builtAt: string;
  openedAt: string | null;
}

export interface Recap extends RecapSummary {
  stats: RecapStats;
  // The goal the recap was built with; its on-goal numbers never move.
  sleepGoalMinutes: number;
  lineSource: 'ai' | 'template';
  // The weekly paragraph (WEEK only).
  story: string | null;
  rebuiltAt: string | null;
}

// Newest first (the server orders them). Anything but a list reads as none, and so does a 404
// from a server older than recaps; any other failure throws.
export async function fetchRecaps(options: { kind?: RecapKind; limit?: number } = {}): Promise<RecapSummary[]> {
  const query = [options.kind ? `kind=${options.kind}` : null, options.limit ? `limit=${options.limit}` : null].filter(Boolean).join('&');
  let res: { recaps?: unknown } | undefined;
  try {
    res = await apiFetch<{ recaps?: unknown } | undefined>(`/me/recaps${query ? `?${query}` : ''}`);
  } catch (error) {
    if ((error as { status?: number } | null)?.status === 404) return [];
    throw error;
  }
  return Array.isArray(res?.recaps) ? (res!.recaps as RecapSummary[]) : [];
}

// 404 (ApiError) for a recap that is gone or not this account's.
export function fetchRecap(id: string): Promise<Recap> {
  return apiFetch<Recap>(`/me/recaps/${encodeURIComponent(id)}`);
}

// Called once the recap is really on screen; idempotent on the server.
export function markRecapOpened(id: string): Promise<void> {
  return apiFetch<void>(`/me/recaps/${encodeURIComponent(id)}/opened`, { method: 'POST' });
}
