// Profile hub data (spec 2026-10-13 §2): the reads behind the passport and the category cards'
// status lines, and the pure step that turns them into cards. Every read settles on its own: one
// that fails leaves its card with a title only, and never hides another card.

import { useCallback, useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { fetchIdentity, fetchSharing, SHARE_KEYS, type BuddyIdentity, type SharingSettings } from '../api/buddies';
import { fetchChatSettings, type ChatSettings } from '../api/chats';
import { fetchNotificationSettings, type NotificationKey, type NotificationSettings } from '../api/notifications';
import { authClient } from '../auth/authClient';
import { unwrap } from '../auth/authErrors';
import type { CategoryCard } from '../components/profile/CategoryGrid';
import type { KipColour } from './kip/kipArt';
import { kipColourName } from './kip/kipColour';
import { getPushState } from './pushRegistration';
import { PROFILE_COPY } from './profileCopy';
import { getTimezoneState, type TimezoneState } from './timezone';

const S = PROFILE_COPY.status;
const BUDDY_KEYS: NotificationKey[] = ['notifyBuddyStickers', 'notifyBuddyRequests', 'notifyBuddyBadges'];
const CHAT_KEYS: NotificationKey[] = ['notifyDirectMessages', 'showMessagePreviews'];

export interface ProfileReads {
  identity: BuddyIdentity | null;
  timezone: TimezoneState | null;
  /** null until known; false where this build or device can't show notifications. */
  pushAvailable: boolean | null;
  notifications: NotificationSettings | null;
  sharing: SharingSettings | null;
  chats: ChatSettings | null;
  providers: string[] | null;
  devices: number | null;
}

export const NO_READS: ProfileReads = {
  identity: null,
  timezone: null,
  pushAvailable: null,
  notifications: null,
  sharing: null,
  chats: null,
  providers: null,
  devices: null,
};

export interface HubInput {
  reads: ProfileReads;
  health: { connected: boolean; lastSyncedAt: string | null };
  buddiesAvailable: boolean;
  chatsAvailable: boolean;
  coach: { name: string; style: string; text: string };
  /** The AI Coach card shows only while the coach is enabled. */
  aiCoach: { enabled: boolean; consented: boolean } | null;
  now: Date;
  kipColour: KipColour;
}

/** The cards in board order, leaving out the features this server or device doesn't have. */
export function categoryCards(i: HubInput): CategoryCard[] {
  const r = i.reads;
  const cards: CategoryCard[] = [
    { category: 'kipColour', status: S.kipColour(kipColourName(i.kipColour)) },
    { category: 'health', status: S.health(i.health.connected, i.health.lastSyncedAt, i.now) },
    { category: 'timezone', status: r.timezone ? S.timezone(r.timezone) : null },
  ];
  if (r.pushAvailable) {
    const keys: NotificationKey[] = ['recapPushEnabled', ...(i.buddiesAvailable ? BUDDY_KEYS : []), ...(i.chatsAvailable ? CHAT_KEYS : [])];
    const n = r.notifications;
    cards.push({ category: 'notifications', status: n ? S.notifications(keys.filter((k) => n[k]).length, keys.length) : null });
  }
  if (i.buddiesAvailable) {
    const s = r.sharing;
    const sharing = s ? SHARE_KEYS.filter((k) => s[k]).length : null;
    cards.push({ category: 'buddies', status: r.identity && sharing !== null ? S.buddies(r.identity.handle, sharing, SHARE_KEYS.length) : null });
  }
  if (i.chatsAvailable) cards.push({ category: 'chats', status: r.chats ? S.chats(r.chats) : null });
  cards.push({ category: 'coach', status: S.coach(i.coach.name, i.coach.style, i.coach.text) });
  if (i.aiCoach?.enabled) cards.push({ category: 'aiCoach', status: S.aiCoach(i.aiCoach.consented) });
  cards.push({ category: 'signIn', status: r.providers && r.devices !== null ? S.signIn(r.providers, r.devices) : null });
  return cards;
}

const settled = <T,>(p: PromiseSettledResult<T>): T | null => (p.status === 'fulfilled' ? (p.value ?? null) : null);

/** Reads everything the hub shows, again each time Profile comes back into focus. */
export function useProfileReads({ buddiesAvailable, chatsAvailable }: { buddiesAvailable: boolean; chatsAvailable: boolean }): ProfileReads {
  const navigation = useContext(NavigationContext);
  const [reads, setReads] = useState<ProfileReads>(NO_READS);

  const load = useCallback(async () => {
    const none = Promise.resolve(null);
    const [identity, timezone, push, notifications, sharing, chats, accounts, sessions] = await Promise.allSettled([
      fetchIdentity(),
      getTimezoneState(),
      getPushState(),
      fetchNotificationSettings(),
      buddiesAvailable ? fetchSharing() : none,
      chatsAvailable ? fetchChatSettings() : none,
      unwrap<{ providerId: string }[]>(authClient.listAccounts()),
      unwrap<unknown[]>(authClient.listSessions()),
    ]);
    const pushState = settled(push);
    const linked = settled(accounts);
    const devices = settled(sessions);
    return {
      identity: settled(identity),
      timezone: settled(timezone),
      pushAvailable: pushState ? pushState.status !== 'unavailable' : false,
      notifications: settled(notifications),
      sharing: settled(sharing),
      chats: settled(chats),
      providers: Array.isArray(linked) ? [...new Set(linked.map((a) => a.providerId))] : null,
      devices: Array.isArray(devices) ? devices.length : null,
    };
  }, [buddiesAvailable, chatsAvailable]);

  useEffect(() => {
    let live = true;
    const run = () => void load().then((next) => live && setReads(next));
    run();
    const unsubscribe = navigation?.addListener?.('focus', run);
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, [load, navigation]);

  return reads;
}
