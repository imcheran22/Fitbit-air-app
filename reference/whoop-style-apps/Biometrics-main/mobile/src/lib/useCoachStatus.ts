import { useCallback, useEffect, useState } from 'react';
import { fetchCoachStatus, type CoachStatusDTO } from '../api/coach';
import { useCharacterOptional, useSetCoachStatus } from '../characters/CharacterProvider';

// Anything with a React Navigation-style addListener. Optional so a screen can
// be rendered (or tested) without a navigator.
interface FocusSource {
  addListener?: (event: 'focus', callback: () => void) => () => void;
}

// null means "not known (yet)": the coach UI treats that exactly like
// disabled, so nothing about the coach is ever shown speculatively, and a
// failed status request leaves the rest of the app untouched.
//
// In the app the status lives in CharacterProvider (fetched once, shared by
// every caller). A component rendered on its own, without the provider (as in
// most screen tests), falls back to fetching its own copy, as it always did.
export function useCoachStatus(navigation?: FocusSource) {
  const shared = useCharacterOptional();
  const setShared = useSetCoachStatus();
  const [localStatus, setLocalStatus] = useState<CoachStatusDTO | null>(null);
  const hasProvider = shared !== null;

  const localRefresh = useCallback(async () => {
    try {
      setLocalStatus(await fetchCoachStatus());
    } catch {
      setLocalStatus(null);
    }
  }, []);
  const refresh = shared ? shared.refreshStatus : localRefresh;

  useEffect(() => {
    if (hasProvider) return;
    let cancelled = false;
    fetchCoachStatus()
      .then((next) => {
        if (!cancelled) setLocalStatus(next);
      })
      .catch(() => {
        if (!cancelled) setLocalStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hasProvider]);

  // Consent can change on another screen (accept, revoke); refetch on return so
  // an entry point never routes off stale status.
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      void refresh();
    });
    return unsubscribe;
  }, [navigation, refresh]);

  if (shared) return { status: shared.status, setStatus: setShared ?? setLocalStatus, refresh };
  return { status: localStatus, setStatus: setLocalStatus, refresh };
}

export type CoachEntryRoute = 'Coach' | 'CoachConsent';

// Where an entry point should go, or null when it must not render at all.
// `consented` from the server is authoritative -- including after the consent
// version changes, when the server reports consented:false again.
export function coachEntryRoute(status: CoachStatusDTO | null): CoachEntryRoute | null {
  if (!status || !status.enabled) return null;
  return status.consented ? 'Coach' : 'CoachConsent';
}
