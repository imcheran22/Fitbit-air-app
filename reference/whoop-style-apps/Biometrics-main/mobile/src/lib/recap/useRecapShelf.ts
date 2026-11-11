import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchRecaps, type RecapSummary } from '../../api/recaps';
import { todayCivil } from '../heatmap';
import { shelfItems, type ShelfItem } from '../recapShelf';
import { useWatchedRecaps } from '../unwatchedRecap';

/** How many recaps the shelf shows (newest first); "See all" has the rest. */
export const SHELF_LIMIT = 30;

export interface RecapShelfState {
  /** null until the first load lands. */
  recaps: RecapSummary[] | null;
  items: ShelfItem[];
  /** The RECAPS tag's number. */
  unwatchedCount: number;
}

interface FocusSource {
  addListener?: (event: 'focus', callback: () => void) => () => void;
}

// The recap shelf's one fetch (spec 2026-10-13 Home F §4). Home calls this once and hands it to the shelf and the
// RECAPS tag. Loads on mount, on focus and on return to the foreground; only the latest load, while mounted,
// lands, and a failed reload keeps what is shown.
export function useRecapShelf(navigation: FocusSource): RecapShelfState {
  const watched = useWatchedRecaps();
  const [recaps, setRecaps] = useState<RecapSummary[] | null>(null);
  const navRef = useRef(navigation);
  navRef.current = navigation;
  const latest = useRef(0);

  const load = useCallback(async () => {
    const run = ++latest.current;
    try {
      const next = await fetchRecaps({ limit: SHELF_LIMIT });
      if (run === latest.current) setRecaps(next);
    } catch {
      // Nothing new to show.
    }
  }, []);

  useEffect(() => {
    void load();
    const off = navRef.current.addListener?.('focus', () => void load());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      latest.current++;
      off?.();
      appState.remove();
    };
  }, [load]);

  const items = useMemo(() => shelfItems(recaps ?? [], todayCivil(), watched), [recaps, watched]);
  return { recaps, items, unwatchedCount: items.filter((i) => i.unwatched).length };
}
