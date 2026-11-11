// The 10-minute evaluation bound (spec 2026-10-06 §5). GET /me/achievements evaluates at most once
// per user per 10 minutes; the marker holds the standings that evaluation computed, so a load
// inside the window answers from it. Saving a check-in or a goal bumps the user's version (and
// deletes the marker), so the next load evaluates at once.
//
// The version closes a race: an evaluation that started before a save would otherwise write its
// stale marker after the save cleared it, delaying the new badge by up to 10 minutes. So a load
// reads the version BEFORE evaluating (evaluationVersion), stores it in the marker (markEvaluated),
// and a marker whose version is not the current one reads as absent (readEvaluated).
//   load:  readEvaluated → null → version = evaluationVersion → evaluate → markEvaluated(version, …)
//   save:  clearAchievementsMarker
// Redis trouble never fails or stalls a request (each call times out after MARKER_TIMEOUT_MS): a read error means "evaluate" (and no marker is written
// when the version could not be read), a write error is logged (event, user id and error class only).

import { connection } from '../sync/queue';
import type { FamilyStanding } from './families';
import { withTimeout } from '../lib/withTimeout';

export const EVALUATION_TTL_SECONDS = 10 * 60;
/**
 * The version key outlives every marker that could hold its value; refreshed on each bump. When it
 * lapses the version restarts at 0, which only ever makes an old marker read as absent.
 */
export const VERSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * The shared connection queues commands while Redis is down (maxRetriesPerRequest: null), so a call
 * would wait forever; every marker call gives up after this long and takes its fallback instead.
 */
export const MARKER_TIMEOUT_MS = 300;

export const markerKey = (userId: string): string => `achievements:evaluated:${userId}`;
export const versionKey = (userId: string): string => `achievements:version:${userId}`;

interface Marker { version: number; standings: FamilyStanding[] }

function logFailure(event: string, userId: string, err: unknown): void {
  console.error(JSON.stringify({ event, userId, error: err instanceof Error ? err.name : 'unknown' }));
}

const parseVersion = (raw: string | null): number => (raw === null ? 0 : Number(raw));

/** The user's current version (0 before any save); null when Redis could not be read. Read it before evaluating. */
export async function evaluationVersion(userId: string): Promise<number | null> {
  try {
    return parseVersion(await withTimeout(connection.get(versionKey(userId)), MARKER_TIMEOUT_MS, 'redis marker timeout'));
  } catch (err) {
    logFailure('achievements.version_read_failed', userId, err);
    return null;
  }
}

/** The standings of an evaluation made at the current version, within the last 10 minutes; else null. */
export async function readEvaluated(userId: string): Promise<FamilyStanding[] | null> {
  try {
    const [raw, version] = await withTimeout(connection.mget(markerKey(userId), versionKey(userId)), MARKER_TIMEOUT_MS, 'redis marker timeout');
    if (raw === null || raw === undefined) return null;
    const marker = JSON.parse(raw) as Marker;
    return marker.version === parseVersion(version ?? null) ? marker.standings : null;
  } catch (err) {
    logFailure('achievements.marker_read_failed', userId, err);
    return null;
  }
}

/** Stores the standings of an evaluation made at `version` (from evaluationVersion); a null version writes nothing. */
export async function markEvaluated(userId: string, version: number | null, standings: readonly FamilyStanding[]): Promise<void> {
  if (version === null) return;
  try {
    const marker: Marker = { version, standings: [...standings] };
    await withTimeout(connection.set(markerKey(userId), JSON.stringify(marker), 'EX', EVALUATION_TTL_SECONDS), MARKER_TIMEOUT_MS, 'redis marker timeout');
  } catch (err) {
    logFailure('achievements.marker_write_failed', userId, err);
  }
}

/** Called after a check-in or goal is saved: every marker written so far, or still being computed, stops counting. */
export async function clearAchievementsMarker(userId: string): Promise<void> {
  try {
    const results = await withTimeout(
      connection.multi().incr(versionKey(userId)).expire(versionKey(userId), VERSION_TTL_SECONDS).del(markerKey(userId)).exec(),
      MARKER_TIMEOUT_MS,
      'redis marker timeout',
    );
    const failed = results?.find(([err]) => err !== null)?.[0];
    if (failed) throw failed;
  } catch (err) {
    logFailure('achievements.marker_clear_failed', userId, err);
  }
}
