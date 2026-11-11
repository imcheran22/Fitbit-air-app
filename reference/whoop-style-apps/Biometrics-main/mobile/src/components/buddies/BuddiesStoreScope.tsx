import { useEffect } from 'react';
import { AppState } from 'react-native';
import { refreshBuddies, resetBuddies } from '../../lib/buddiesStore';

// Mounted once inside the signed-in navigator: loads the buddies on start and on every return to the
// foreground; signing out unmounts it and forgets them.
export function BuddiesStoreScope() {
  useEffect(() => {
    void refreshBuddies();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshBuddies();
    });
    return () => {
      sub.remove();
      resetBuddies();
    };
  }, []);
  return null;
}
