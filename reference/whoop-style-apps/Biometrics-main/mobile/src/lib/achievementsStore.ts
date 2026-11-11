import { useSyncExternalStore } from 'react';
import { fetchAchievements, markCelebrated, type Achievements, type UncelebratedLevel } from '../api/achievements';
import { timezoneSynced } from './timezone';

// One shared copy of GET /me/achievements (spec 2026-10-06 §6) for the Profile card, the Badges
// screens, the celebration and the recap cards, like the story ring's store. A 404 (a backend
// older than badges) is 'unavailable' and hides every badge UI. Levels closed in a celebration are
// remembered for the session, so a refresh before the server has them never shows them again.

export type AchievementsState =
  | { status: 'idle' }
  | { status: 'ready'; data: Achievements }
  | { status: 'unavailable' }
  | { status: 'error' };

export interface AchievementsSnapshot {
  state: AchievementsState;
  /** Level ids closed in a celebration this session. */
  celebrated: ReadonlySet<string>;
}

let snapshot: AchievementsSnapshot = { state: { status: 'idle' }, celebrated: new Set() };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
// The one extra request queued by fresh refreshes behind `inflight`.
let rerun: Promise<void> | null = null;
// Bumped on reset: a load that started before it never lands after it.
let epoch = 0;
// Whether this session's first load has started (it waits for the time zone sync).
let started = false;

/** The longest the first load waits for the time zone sync before fetching anyway. */
export const TIMEZONE_WAIT_MS = 3000;

/**
 * A new user's first load claims their badge start date in the server's copy of their zone, which
 * is UTC until the sign-in sync lands; both start together, so wait for it (capped).
 */
async function untilTimezoneSynced(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, TIMEZONE_WAIT_MS);
  });
  await Promise.race([timezoneSynced(), cap]);
  clearTimeout(timer);
}

function publish(next: Partial<AchievementsSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

export function getAchievementsSnapshot(): AchievementsSnapshot {
  return snapshot;
}

export interface RefreshOptions {
  /**
   * The answer must postdate this call (after a check-in or a goal save): a request already in
   * flight may predate it, so one more runs after it. Fresh calls made meanwhile share that re-run.
   */
  fresh?: boolean;
}

/**
 * Re-reads the badges. Calls made while one is running share it, unless `fresh`. A failure keeps
 * what was there. Resolves once the answer has landed in the snapshot.
 */
export function refreshAchievements(options: RefreshOptions = {}): Promise<void> {
  if (!inflight) return load();
  if (!options.fresh) return inflight;
  if (!rerun) {
    const at = epoch;
    // Any load started once the old one has finished postdates this call, so join it or start one.
    const next = inflight.then(() => {
      if (rerun === next) rerun = null;
      return at === epoch ? refreshAchievements() : undefined;
    });
    rerun = next;
  }
  return rerun;
}

function load(): Promise<void> {
  const at = epoch;
  const first = !started;
  started = true;
  const run = (async () => {
    if (first) await untilTimezoneSynced();
    if (at !== epoch) return;
    let next: AchievementsState;
    try {
      const data = await fetchAchievements();
      next = data ? { status: 'ready', data } : { status: 'unavailable' };
    } catch {
      next = snapshot.state.status === 'ready' ? snapshot.state : { status: 'error' };
    }
    if (at === epoch) publish({ state: next });
  })();
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/** New levels still to celebrate: the server's list minus those closed this session. */
export function pendingLevels(s: AchievementsSnapshot): UncelebratedLevel[] {
  return s.state.status === 'ready' ? s.state.data.uncelebrated.filter((u) => !s.celebrated.has(u.id)) : [];
}

/** Closes a celebration: hidden at once, then marked on the server (a failure is retried on a later start). */
export async function celebrate(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  publish({ celebrated: new Set([...snapshot.celebrated, ...ids]) });
  try {
    await markCelebrated([...ids]);
  } catch {
    // Hidden for this session; the server still has it uncelebrated, so a later start offers it again.
  }
}

/** Forgets everything (sign out; tests). */
export function resetAchievements(): void {
  epoch++;
  started = false;
  inflight = null;
  rerun = null;
  publish({ state: { status: 'idle' }, celebrated: new Set() });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAchievements(): AchievementsSnapshot {
  return useSyncExternalStore(subscribe, getAchievementsSnapshot, getAchievementsSnapshot);
}
