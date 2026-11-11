import { useSyncExternalStore } from 'react';
import { fetchBuddyPage, type BuddyPage } from '../api/buddies';

// One shared copy of GET /me/buddies (first page + request counts) for the Home row, the Buddies
// screen and Profile. A bare 404 is 'unavailable' and hides every buddy UI (an older backend).

export type BuddiesState =
  | { status: 'idle' }
  | { status: 'ready'; page: BuddyPage }
  | { status: 'unavailable' }
  | { status: 'error' };

let state: BuddiesState = { status: 'idle' };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
// A refresh was asked for while a load ran: one more load follows it.
let dirty = false;
// Bumped on reset: a load that started before it never lands after it.
let epoch = 0;

function publish(next: BuddiesState): void {
  state = next;
  listeners.forEach((l) => l());
}

export function getBuddiesState(): BuddiesState {
  return state;
}

/**
 * Re-reads the first page. A call made while one runs marks it dirty: that load may have started
 * before the change the caller wants to see (e.g. an accept), so exactly one more load follows it,
 * and every caller's promise settles after that. A failure keeps a ready page.
 */
export function refreshBuddies(): Promise<void> {
  if (inflight) {
    dirty = true;
    return inflight;
  }
  const at = epoch;
  const run = (async () => {
    do {
      dirty = false;
      let next: BuddiesState;
      try {
        const page = await fetchBuddyPage();
        next = page ? { status: 'ready', page } : { status: 'unavailable' };
      } catch {
        next = state.status === 'ready' ? state : { status: 'error' };
      }
      if (at !== epoch) return;
      publish(next);
    } while (dirty);
  })();
  inflight = run;
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/** Forgets everything (sign out; tests). */
export function resetBuddies(): void {
  epoch++;
  inflight = null;
  dirty = false;
  publish({ status: 'idle' });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBuddies(): BuddiesState {
  return useSyncExternalStore(subscribe, getBuddiesState, getBuddiesState);
}
