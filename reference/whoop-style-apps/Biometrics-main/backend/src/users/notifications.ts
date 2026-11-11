/** App-level notification settings (spec 2026-10-04 §2; buddy keys: spec 2026-10-06 buddies §6; DM keys: spec 2026-10-07 social §10). */
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

export const NOTIFICATION_KEYS = [
  'recapPushEnabled', 'notifyBuddyStickers', 'notifyBuddyRequests', 'notifyBuddyBadges', 'notifyDirectMessages', 'showMessagePreviews',
] as const;

export const NOTIFICATION_SELECT = {
  recapPushEnabled: true,
  notifyBuddyStickers: true,
  notifyBuddyRequests: true,
  notifyBuddyBadges: true,
  notifyDirectMessages: true,
  showMessagePreviews: true,
} as const;

/** A non-empty patch of known keys with boolean values, else null (→ 400 invalid_settings). */
export function parseNotificationSettingsPatch(body: unknown): Partial<NotificationSettings> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return null;
  const out: Partial<NotificationSettings> = {};
  for (const [key, value] of entries) {
    if (!(NOTIFICATION_KEYS as readonly string[]).includes(key) || typeof value !== 'boolean') return null;
    out[key as keyof NotificationSettings] = value;
  }
  return out;
}
