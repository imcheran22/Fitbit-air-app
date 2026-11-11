import * as SecureStore from 'expo-secure-store';
import { updateTimezone } from '../api/client';

// Persisted with SecureStore, like the rest of the app's small local state
// (see theme/preference.ts).
const LAST_SYNCED_KEY = 'lastSyncedTimezone';
const OVERRIDDEN_KEY = 'timezoneOverridden';
const OVERRIDE_ZONE_KEY = 'timezoneOverrideZone';

// Settles when this session's first syncTimezone does (sent, skipped or failed), so a first
// badge load can wait for the server to know the zone: a new user's badge start date is claimed
// in it (spec 2026-10-06 §5). Re-armed by clearTimezoneState on sign-out for the next account.
let markSynced: () => void = () => {};
let synced: Promise<void> = Promise.resolve();
function armSynced(): void {
  synced = new Promise<void>((resolve) => {
    markSynced = resolve;
  });
}
armSynced();

export function timezoneSynced(): Promise<void> {
  return synced;
}

export interface TimezoneState {
  timezone: string;
  overridden: boolean;
}

const FALLBACK_ZONES = [
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Chicago',
  'America/Denver', 'America/Halifax', 'America/Los_Angeles', 'America/Mexico_City',
  'America/New_York', 'America/Phoenix', 'America/Sao_Paulo', 'America/St_Johns',
  'America/Toronto', 'America/Vancouver',
  'Asia/Bangkok', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Karachi',
  'Asia/Kolkata', 'Asia/Manila', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo',
  'Atlantic/Reykjavik',
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Sydney',
  'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Dublin', 'Europe/Istanbul', 'Europe/London',
  'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris', 'Europe/Rome', 'Europe/Stockholm', 'Europe/Zurich',
  'Pacific/Auckland', 'Pacific/Honolulu',
  'UTC',
];

export function getDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Intl.supportedValuesOf is not available in every JS engine (older Hermes
// builds lack it), so fall back to a short list of common zones.
export function listTimeZones(): string[] {
  let zones: string[] = FALLBACK_ZONES;
  try {
    const supported = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
    if (supported && supported.length > 0) {
      zones = supported.includes('UTC') ? supported : [...supported, 'UTC'];
    }
  } catch {
    // keep the fallback
  }
  return [...new Set(zones)].sort();
}

export async function getTimezoneState(): Promise<TimezoneState> {
  const overridden = (await SecureStore.getItemAsync(OVERRIDDEN_KEY)) === 'true';
  const overrideZone = overridden ? await SecureStore.getItemAsync(OVERRIDE_ZONE_KEY) : null;
  if (overridden && overrideZone) return { timezone: overrideZone, overridden: true };
  return { timezone: getDeviceTimeZone(), overridden: false };
}

// Sends the effective zone (an explicit override wins over the device zone)
// only when it differs from the last value the server confirmed. Never throws:
// a failed send leaves the stored value untouched, so the next launch retries.
export async function syncTimezone(): Promise<void> {
  try {
    const { timezone } = await getTimezoneState();
    const lastSynced = await SecureStore.getItemAsync(LAST_SYNCED_KEY);
    if (lastSynced === timezone) return;
    await updateTimezone(timezone);
    await SecureStore.setItemAsync(LAST_SYNCED_KEY, timezone);
  } catch (error) {
    console.warn('Time zone sync failed; will retry on next launch', error);
  } finally {
    markSynced();
  }
}

/**
 * Forgets everything this device remembers about the time zone.
 *
 * These keys are device-global, not per-account, so without this the next user
 * to sign in on the same device inherited them: syncTimezone short-circuits on
 * `lastSynced === timezone` and would never send the new account's zone to the
 * server, and an override the previous user set silently became theirs.
 * Called from sign-out, where a failure must not block signing out.
 */
export async function clearTimezoneState(): Promise<void> {
  armSynced();
  await Promise.all([
    SecureStore.deleteItemAsync(LAST_SYNCED_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(OVERRIDDEN_KEY).catch(() => undefined),
    SecureStore.deleteItemAsync(OVERRIDE_ZONE_KEY).catch(() => undefined),
  ]);
}

export async function setTimezoneOverride(timezone: string): Promise<void> {
  if (!isValidTimeZone(timezone)) throw new Error(`Invalid time zone: ${timezone}`);
  await SecureStore.setItemAsync(OVERRIDE_ZONE_KEY, timezone);
  await SecureStore.setItemAsync(OVERRIDDEN_KEY, 'true');
  await syncTimezone();
}

export async function clearTimezoneOverride(): Promise<void> {
  await SecureStore.deleteItemAsync(OVERRIDDEN_KEY);
  await SecureStore.deleteItemAsync(OVERRIDE_ZONE_KEY);
  await syncTimezone();
}
