import React, { useEffect, useRef, useState } from 'react';
import { Switch } from 'react-native';
import { useColorScheme } from 'nativewind';
import { fetchNotificationSettings, saveNotificationSettings, type NotificationKey, type NotificationSettings } from '../api/notifications';
import { useBuddies } from '../lib/buddiesStore';
import { useChatsAvailable } from '../lib/socialStore';
import { enablePush, getPushState, type PushState } from '../lib/pushRegistration';
import { COLORS } from '../theme';
import { Text } from './ui/text';
import { SettingsGroup, SettingsRow } from './ui/settings-list';

const DENIED = 'Notifications are blocked — enable them in system settings';
const UNAVAILABLE = "Notifications aren't available in this build.";
const REGISTER_FAILED = "Couldn't turn on notifications. Try again.";
const FAILED = 'Your recap setting could not be saved. Please try again.';
const BUDDY_FAILED = 'Your notification setting could not be saved. Please try again.';

const BUDDY_ROWS = [
  ['notifyBuddyStickers', 'buddy-stickers', 'Buddy stickers', 'When a buddy sends you a sticker'],
  ['notifyBuddyRequests', 'buddy-requests', 'Buddy requests', 'When someone asks to be your buddy'],
  ['notifyBuddyBadges', 'buddy-badges', 'Buddy streaks & badges', 'When a buddy who shares them reaches a badge level'],
] as const;

// Chats (spec 2026-10-07 social §10), on a server with chats: message pushes (on) and their previews (off by default).
const CHAT_ROWS = [
  ['notifyDirectMessages', 'chat-messages', 'Messages', 'When a buddy sends you a message'],
  ['showMessagePreviews', 'chat-previews', 'Message previews', 'Show the message text in the notification'],
] as const;

// The app-level "Recap ready" switch (spec 2026-10-04 §2), shown whenever this device can show
// notifications, with the coach on or off. On: register this device (enablePush, the only place
// that may prompt; a denied permission is never re-prompted), then save recapPushEnabled. Off:
// save the setting only; the device stays registered. Hidden only when push is unavailable on
// load; if turning it on finds no push support, the section stays and says so. With buddies on
// the server (spec 2026-10-06 buddies §6), three buddy switches follow, saved the same way; with chats on the server
// too, the two message switches after them.
export function NotificationsSection() {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [push, setPush] = useState<PushState | null>(null);
  // Decided once, from the load: whether this build or device can show notifications at all.
  const [available, setAvailable] = useState(false);
  // The server's last saved settings; a switch shows on only from here.
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  // The in-flight guard; a ref so a second flip before the next render is still ignored.
  const inFlight = useRef(false);
  // The key whose save failed, if any.
  const [failed, setFailed] = useState<NotificationKey | null>(null);
  const buddies = useBuddies();
  const chats = useChatsAvailable();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [state, loaded] = await Promise.all([
        getPushState().catch((): PushState => ({ status: 'unavailable', reason: 'unknown_error' })),
        fetchNotificationSettings().catch(() => null),
      ]);
      if (cancelled) return;
      setPush(state);
      setAvailable(state.status !== 'unavailable');
      setSettings(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!push || !available) return null;

  async function toggle(key: NotificationKey, next: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(null);
    try {
      if (next) {
        const registered = await enablePush();
        setPush(registered);
        if (registered.status !== 'on') return;
      }
      setSettings(await saveNotificationSettings({ [key]: next }));
    } catch {
      // Nothing changes: every switch still shows the last saved settings.
      setFailed(key);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const isOn = (key: NotificationKey) => settings?.[key] === true && push.status === 'on';
  const message = failed
    ? failed === 'recapPushEnabled'
      ? FAILED
      : BUDDY_FAILED
    : push.status === 'error'
      ? REGISTER_FAILED
      : push.status === 'denied'
        ? DENIED
        : push.status === 'unavailable'
          ? UNAVAILABLE
          : null;
  const isError = failed !== null || message === REGISTER_FAILED;

  return (
    <SettingsGroup testID="notifications-settings" label="Notifications">
      <SettingsRow
        testID="recap-ready-row"
        icon="notifications-outline"
        tint={colors.metricSleep}
        title="Recap ready"
        subtitle="A nudge when your weekly or monthly recap is ready"
        trailing={
          <Switch
            testID="recap-ready-toggle"
            accessibilityLabel="Recap ready notifications"
            value={isOn('recapPushEnabled')}
            disabled={busy}
            onValueChange={(next) => void toggle('recapPushEnabled', next)}
            trackColor={{ true: colors.accent }}
          />
        }
      />
      {buddies.status === 'ready'
        ? [...BUDDY_ROWS, ...(chats === true ? CHAT_ROWS : [])].map(([key, id, title, subtitle]) => (
            <SettingsRow
              key={key}
              testID={`${id}-row`}
              icon={CHAT_ROWS.some(([chatKey]) => chatKey === key) ? 'chatbubble-outline' : 'people-outline'}
              tint={colors.accent}
              title={title}
              subtitle={subtitle}
              trailing={
                <Switch
                  testID={`${id}-toggle`}
                  accessibilityLabel={`${title} notifications`}
                  value={isOn(key)}
                  disabled={busy}
                  onValueChange={(next) => void toggle(key, next)}
                  trackColor={{ true: colors.accent }}
                />
              }
            />
          ))
        : null}
      {message ? (
        <Text
          testID={failed !== null && failed !== 'recapPushEnabled' ? 'buddy-notify-message' : 'recap-ready-message'}
          className={isError ? 'px-4 pb-3 text-caption text-destructive' : 'px-4 pb-3 text-caption text-muted-foreground'}
        >
          {message}
        </Text>
      ) : null}
    </SettingsGroup>
  );
}
