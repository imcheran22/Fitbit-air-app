import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchBuddyScene, type BuddyScene } from '../../api/buddies';

interface FocusSource {
  addListener?: (event: 'focus', callback: () => void) => () => void;
}

// The scene's buddies (spec 2026-10-13 Home F §4). Loads on mount, on focus and on return to the foreground; only the
// latest load lands. null until loaded, on a failed first load and on an older server: the scene then shows only you.
export function useBuddyScene(navigation: FocusSource): BuddyScene | null {
  const [scene, setScene] = useState<BuddyScene | null>(null);
  const navRef = useRef(navigation);
  navRef.current = navigation;

  useEffect(() => {
    let live = true;
    let latest = 0;
    const load = () => {
      const run = ++latest;
      fetchBuddyScene()
        .then((next) => {
          if (live && run === latest) setScene(next);
        })
        .catch(() => {
          // Keep what is shown.
        });
    };
    load();
    const off = navRef.current.addListener?.('focus', load);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => {
      live = false;
      off?.();
      appState.remove();
    };
  }, []);

  return scene;
}
