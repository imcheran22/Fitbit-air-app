import { useContext, useEffect } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { refreshAchievements } from './achievementsStore';

interface FocusSource {
  addListener?: (event: 'focus', callback: () => void) => () => void;
}

/**
 * Reloads the shared badges on mount and each time the surrounding screen comes back into focus
 * (a tab that stays mounted, back from a detail, levels earned since, a failed first load). Works
 * outside a navigator too (mount only). In-flight refreshes coalesce in the store, so the focus
 * right after mount costs nothing.
 */
export function useRefreshAchievementsOnFocus(): void {
  const navigation = useContext(NavigationContext) as FocusSource | undefined;
  useEffect(() => {
    void refreshAchievements();
    return navigation?.addListener?.('focus', () => void refreshAchievements());
  }, [navigation]);
}
