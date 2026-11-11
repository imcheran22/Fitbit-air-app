import React, { createContext, useContext, useEffect, useState } from 'react';
import { restoreThemePreference, setThemePreference, nextThemePreference, type ThemePreference } from './preference';

interface ThemeContextValue {
  preference: ThemePreference;
  cyclePreference: () => void;
}

// A no-op default (rather than null + throwing) because theme cycling is
// non-critical UI sugar: a screen rendered without the provider -- as most
// screen-level tests do -- should render its toggle inertly, not crash.
const ThemeContext = createContext<ThemeContextValue>({ preference: 'dark', cyclePreference: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>('dark');

  useEffect(() => {
    restoreThemePreference().then(setPreference);
  }, []);

  function cyclePreference() {
    const next = nextThemePreference(preference);
    setPreference(next);
    setThemePreference(next);
  }

  return <ThemeContext.Provider value={{ preference, cyclePreference }}>{children}</ThemeContext.Provider>;
}

export function useThemePreference(): ThemeContextValue {
  return useContext(ThemeContext);
}
