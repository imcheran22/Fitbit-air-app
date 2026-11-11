import * as SecureStore from 'expo-secure-store';
import { colorScheme } from 'nativewind';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'themePreference';

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

// Synchronously puts NativeWind on the dark default, before the first render,
// so a light-OS launch does not flash light while the stored choice loads.
export function applyDefaultThemeSync(): void {
  colorScheme.set('dark');
}

// Restores the persisted choice into NativeWind's color scheme at app start.
// Call once, before the first render that reads colors.
export async function restoreThemePreference(): Promise<ThemePreference> {
  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    // Keychain unavailable (e.g. an unsigned build): behave as if nothing is stored.
  }
  const preference = isThemePreference(stored) ? stored : 'dark';
  colorScheme.set(preference);
  return preference;
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  colorScheme.set(preference);
  await SecureStore.setItemAsync(STORAGE_KEY, preference);
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  // Cycle: system -> light -> dark -> system, so the icon always has a
  // single, discoverable next state to tap toward.
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}
