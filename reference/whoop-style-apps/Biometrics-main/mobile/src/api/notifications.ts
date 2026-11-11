import { apiFetch } from './client';

// App-level notification settings (spec 2026-10-04 §2; buddy keys: spec 2026-10-06 buddies §6; message keys: spec
// 2026-10-07 social §10), independent of the coach.
export interface NotificationSettings {
  recapPushEnabled: boolean;
  notifyBuddyStickers: boolean;
  notifyBuddyRequests: boolean;
  notifyBuddyBadges: boolean;
  /** dm_message pushes (default on). */
  notifyDirectMessages: boolean;
  /** The message text in a dm_message push (default off). */
  showMessagePreviews: boolean;
}

export type NotificationKey = keyof NotificationSettings;

// The server's defaults, used for any key without a boolean (an older server knows fewer keys). Previews are off.
const DEFAULTS: NotificationSettings = {
  recapPushEnabled: true,
  notifyBuddyStickers: true,
  notifyBuddyRequests: true,
  notifyBuddyBadges: true,
  notifyDirectMessages: true,
  showMessagePreviews: false,
};
const KEYS = Object.keys(DEFAULTS) as NotificationKey[];

type RawSettings = Partial<Record<NotificationKey, unknown>> | undefined;

function withDefaults(res: RawSettings): NotificationSettings {
  return Object.fromEntries(KEYS.map((key) => [key, typeof res?.[key] === 'boolean' ? res[key] : DEFAULTS[key]])) as unknown as NotificationSettings;
}

// A 404 from a server older than this endpoint reads as every default. Any other failure throws.
export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  let res: RawSettings;
  try {
    res = await apiFetch<RawSettings>('/me/notifications');
  } catch (error) {
    if ((error as { status?: number } | null)?.status !== 404) throw error;
  }
  return withDefaults(res);
}

export async function saveNotificationSettings(patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const res = await apiFetch<RawSettings>('/me/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return withDefaults(res);
}
