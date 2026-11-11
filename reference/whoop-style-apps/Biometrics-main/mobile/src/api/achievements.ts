import { FAMILY_ORDER } from '../lib/badges';
import { apiFetch } from './client';

// Badges (spec 2026-10-06 §6): awarded on the server; the app reads them and says which new levels
// it has celebrated. A 404 (a backend older than badges) reads as null and hides every badge UI.

export type AchievementFamily =
  | 'SLEEP_GOAL' | 'STEADY_BEDTIME' | 'STEP_GOAL' | 'CHECK_IN' | 'BEST_RECOVERY_WEEK' | 'EVERY_DAY_LOGGED' | 'STEADIEST_MONTH';
export type FamilyKind = 'streak' | 'monthly';

export interface EarnedLevel {
  level: number;
  /** The threshold reached. */
  value: number;
  /** YYYY-MM-DD: the date the run first reached it (a month's last day for a monthly family). */
  earnedOn: string;
}

export interface FamilyAchievements {
  family: AchievementFamily;
  kind: FamilyKind;
  /** Highest level earned, 0..5. */
  level: number;
  thresholds: number[];
  levels: EarnedLevel[];
  /** The latest run if unbroken (a month count for a monthly family). */
  current: number;
  best: number;
  nextThreshold: number | null;
}

export interface UncelebratedLevel extends EarnedLevel {
  id: string;
  family: AchievementFamily;
}

export interface Achievements {
  /** The badge start date: only days and months from it count. */
  since: string;
  families: FamilyAchievements[];
  uncelebrated: UncelebratedLevel[];
}

export async function fetchAchievements(): Promise<Achievements | null> {
  let body: Partial<Achievements> | undefined;
  try {
    body = await apiFetch<Partial<Achievements> | undefined>('/me/achievements');
  } catch (error) {
    if ((error as { status?: number } | null)?.status === 404) return null;
    throw error;
  }
  const since = body?.since;
  const families = body?.families;
  const uncelebrated = body?.uncelebrated;
  if (typeof since !== 'string' || !Array.isArray(families)) throw new Error('bad_achievements');
  // A newer backend may add families this app has no names or art for: leave them out.
  const known = (f: { family: AchievementFamily }) => FAMILY_ORDER.includes(f.family);
  return {
    since,
    families: families.filter(known),
    uncelebrated: Array.isArray(uncelebrated) ? uncelebrated.filter(known) : [],
  };
}

/** Closing a celebration: these levels (the family's new ones) are never celebrated again. */
export async function markCelebrated(ids: string[]): Promise<void> {
  await apiFetch<unknown>('/me/achievements/celebrated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}
