import { useEffect } from 'react';
import { AppState } from 'react-native';
import { pingPresence } from '../../api/chats';
import { refreshSocial, resetSocial } from '../../lib/socialStore';

// Mounted once inside the signed-in navigator: loads the Social home on start and on every return to the
// foreground (keeps the tab dot current), and tells the server I'm active then (Chats activity status, at most a write
// a minute server-side); signing out unmounts it and forgets it.
export function SocialStoreScope() {
  useEffect(() => {
    void refreshSocial();
    void pingPresence();
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void refreshSocial();
      void pingPresence();
    });
    return () => {
      sub.remove();
      resetSocial();
    };
  }, []);
  return null;
}
