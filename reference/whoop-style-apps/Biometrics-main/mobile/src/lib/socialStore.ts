import { useSyncExternalStore } from 'react';
import { fetchSocialHome, type SocialHome } from '../api/social';

// The Social home, shared by the Social tab and the tab bar's unread dot. Mirrors buddiesStore: one load at a
// time (a refresh during a load reloads once after it), a reset bumps the epoch so a late load can't land, and a
// failed refresh keeps the last good home. A bare 404 is 'unavailable' (an older backend).
// Cost: SocialStoreScope refreshes on every return to the foreground so the tab dot is current, which is one
// GET /me/social (the whole home bundle) per foreground even when the Social tab is never opened. Acceptable for
// S1; a light unread-only endpoint can replace it if that read gets heavy.

export type SocialState =
  | { status: 'idle' }
  | { status: 'ready'; home: SocialHome }
  | { status: 'unavailable' }
  | { status: 'error' };

let state: SocialState = { status: 'idle' };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
// A refresh was asked for while a load ran: one more load follows it.
let dirty = false;
// Bumped on reset: a load that started before it never lands after it.
let epoch = 0;

function publish(next: SocialState): void {
  state = next;
  listeners.forEach((l) => l());
}

export function getSocialState(): SocialState {
  return state;
}

/**
 * Re-reads the home. A call made while one runs marks it dirty, so exactly one more load follows it and every
 * caller's promise settles after that. A failure keeps a ready home (or 'unavailable').
 */
export function refreshSocial(): Promise<void> {
  if (inflight) {
    dirty = true;
    return inflight;
  }
  const at = epoch;
  const run = (async () => {
    do {
      dirty = false;
      let next: SocialState;
      try {
        const home = await fetchSocialHome();
        next = home ? { status: 'ready', home } : { status: 'unavailable' };
      } catch {
        // Unlike buddiesStore, 'unavailable' also survives a failure: an older backend keeps Social hidden offline.
        next = state.status === 'ready' || state.status === 'unavailable' ? state : { status: 'error' };
      }
      if (at !== epoch) return;
      publish(next);
    } while (dirty);
  })();
  inflight = run;
  // Only this run's own slot: after a reset a newer load may already hold it.
  void run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}

/** Forgets everything (sign out; tests). */
export function resetSocial(): void {
  epoch++;
  inflight = null;
  dirty = false;
  publish({ status: 'idle' });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSocial(): SocialState {
  return useSyncExternalStore(subscribe, getSocialState, getSocialState);
}

/**
 * What the tab dot counts: incoming requests + unseen stickers + conversations with an unread message (S3). 0 unless
 * ready. A missing `unread` or field counts as 0: the tab bar is the app shell and must never throw on a server's shape.
 */
export function useSocialUnreadCount(): number {
  const s = useSocial();
  if (s.status !== 'ready') return 0;
  const u = s.home.unread;
  return (u?.requests ?? 0) + (u?.stickers ?? 0) + (u?.chats ?? 0);
}

export function useSocialUnread(): boolean {
  return useSocialUnreadCount() > 0;
}

/** Whether the server has Chats (S3): it sends `unread.chats`. null until the home has loaded; false on an older server. */
export function useChatsAvailable(): boolean | null {
  const s = useSocial();
  if (s.status === 'unavailable') return false;
  if (s.status !== 'ready') return null;
  return typeof s.home.unread?.chats === 'number';
}

/** The Chats button's number: conversations with unread messages plus waiting requests (stickers are in the thread). */
export function chatsBadgeCount(unread: { requests?: number; stickers?: number; chats?: number } | undefined): number {
  return (unread?.chats ?? 0) + (unread?.requests ?? 0);
}
