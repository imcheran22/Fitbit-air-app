import { createContext, useContext, useEffect, useState, type Context } from 'react';
import * as Navigation from '@react-navigation/native';
import { refreshBuddies } from './buddiesStore';

interface FocusSource {
  addListener?: (event: 'focus', callback: () => void) => () => void;
}

// Some suites mock @react-navigation/native without NavigationContext; fall back to a context that
// is always empty so this hook still runs (mount only), outside a navigator too.
const NO_NAVIGATION = createContext<FocusSource | undefined>(undefined);
const NavigationContext = ((Navigation as { NavigationContext?: unknown }).NavigationContext ?? NO_NAVIGATION) as Context<FocusSource | undefined>;

/**
 * Reloads the shared buddies on mount and each time the surrounding screen comes back into focus.
 * Returns a count bumped on every focus after mount, for callers that re-read their own data then.
 */
export function useRefreshBuddiesOnFocus(): number {
  const navigation = useContext(NavigationContext);
  const [focuses, setFocuses] = useState(0);
  useEffect(() => {
    void refreshBuddies();
    return navigation?.addListener?.('focus', () => {
      void refreshBuddies();
      setFocuses((n) => n + 1);
    });
  }, [navigation]);
  return focuses;
}
