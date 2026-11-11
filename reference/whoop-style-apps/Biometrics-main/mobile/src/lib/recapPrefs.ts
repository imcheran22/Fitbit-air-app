import * as SecureStore from 'expo-secure-store';
import type { IncludeKey, Includes, ShareFormat } from './recapShare';

// The builder's include switches, per format, in SecureStore like the app's other device settings.
// Only the user's own choices are stored; resolveIncludes fills in the defaults.
const KEYS: IncludeKey[] = ['avgSleep', 'streak', 'bestRecovery', 'steps', 'bestNight', 'quote', 'coach', 'count', 'badges'];
const keyFor = (format: ShareFormat) => `recapInclude.${format}`;

export async function readIncludePrefs(format: ShareFormat): Promise<Partial<Includes>> {
  try {
    const raw = await SecureStore.getItemAsync(keyFor(format));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<Includes> = {};
    for (const k of KEYS) if (typeof parsed[k] === 'boolean') out[k] = parsed[k] as boolean;
    return out;
  } catch {
    return {};
  }
}

export async function writeIncludePrefs(format: ShareFormat, prefs: Partial<Includes>): Promise<void> {
  try {
    await SecureStore.setItemAsync(keyFor(format), JSON.stringify(prefs));
  } catch {
    // The defaults come back next time; nothing else depends on it.
  }
}
