import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { fetchRecaps, markRecapOpened, type RecapKind, type RecapSummary } from '../api/recaps';

// The story ring (weekly story placement, owner-approved 2026-10-05): while the newest weekly
// recap is unopened, the Home avatar, the Profile tab and the Profile screen's avatar wear a ring
// in its coach's colour, and a tap plays its story. Weeks only (owner, 2026-10-05): a month keeps
// its push and its shelf circle but never rings. One small store feeds all three, so opening the
// recap (from any of them, the shelf, the Recaps list or a push) clears them together. There is
// no dismissal: opening is the only way to clear a ring.

interface Snapshot {
  /** The recap behind the ring, or null for no ring. */
  recap: RecapSummary | null;
  /** Recaps opened in this session (the server's openedAt catches up on the next load). */
  watched: ReadonlySet<string>;
}

let snapshot: Snapshot = { recap: null, watched: new Set() };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
// Bumped on reset: a load that started before it never lands after it.
let epoch = 0;
// Screens using the store; when the last one goes (sign out), it forgets everything.
let users = 0;

function publish(next: Partial<Snapshot>): void {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

/** The ring's recap: the newest week, unless it is opened (on the server or in this session). */
export function selectUnwatched(newest: RecapSummary | null | undefined, watched: ReadonlySet<string>): RecapSummary | null {
  return newest && newest.kind === 'WEEK' && !isRecapWatched(newest, watched) ? newest : null;
}

export function isRecapWatched(recap: Pick<RecapSummary, 'id' | 'openedAt'>, watched: ReadonlySet<string>): boolean {
  return recap.openedAt !== null || watched.has(recap.id);
}

/** Where a recap opens: a week plays its story, a month opens its recap screen. */
export function recapDestination(recap: { id: string; kind: RecapKind }): { name: 'RecapStory' | 'Recap'; params: { id: string } } {
  return { name: recap.kind === 'WEEK' ? 'RecapStory' : 'Recap', params: { id: recap.id } };
}

/** Re-reads the newest weekly recap. Calls made while one is running share it. A failure shows no ring. */
export function refreshUnwatchedRecap(): Promise<void> {
  if (inflight) return inflight;
  const at = epoch;
  const run = (async () => {
    let newest: RecapSummary | null = null;
    try {
      newest = (await fetchRecaps({ kind: 'WEEK', limit: 1 }))[0] ?? null;
    } catch {
      // No ring.
    }
    if (at === epoch) publish({ recap: selectUnwatched(newest, snapshot.watched) });
  })();
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/**
 * A recap is on screen (its recap screen or its story): the ring clears at once everywhere and
 * the server is told, once per recap per session, unless it already has it as opened
 * (`serverOpenedAt`). A failed post is forgotten, so the next open tries again (the ring may
 * come back on the next load, since the server still has it unopened).
 */
export async function openRecap(id: string, serverOpenedAt: string | null = null): Promise<void> {
  if (snapshot.watched.has(id)) return;
  publish({ watched: new Set([...snapshot.watched, id]), recap: snapshot.recap?.id === id ? null : snapshot.recap });
  if (serverOpenedAt !== null) return;
  try {
    await markRecapOpened(id);
  } catch {
    const watched = new Set(snapshot.watched);
    watched.delete(id);
    publish({ watched });
  }
}

/** Forgets the ring and what was opened (sign out; tests). */
export function resetUnwatchedRecap(): void {
  epoch++;
  inflight = null;
  publish({ recap: null, watched: new Set() });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;

/** The recaps opened in this session, for lists that mark unwatched ones (the Sleep shelf). */
export function useWatchedRecaps(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).watched;
}

interface FocusSource {
  addListener?: (event: 'focus', callback: () => void) => () => void;
}

/**
 * The ring's recap, shared. Loads when a screen using it mounts, when `navigation` (if given)
 * focuses, and when the app returns to the foreground.
 */
export function useUnwatchedRecap(navigation?: FocusSource): Snapshot & { refresh: () => Promise<void> } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    users++;
    void refreshUnwatchedRecap();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshUnwatchedRecap();
    });
    return () => {
      sub.remove();
      users--;
      if (users === 0) resetUnwatchedRecap();
    };
  }, []);

  useEffect(() => {
    return navigation?.addListener?.('focus', () => {
      void refreshUnwatchedRecap();
    });
  }, [navigation]);

  return { ...current, refresh: refreshUnwatchedRecap };
}
