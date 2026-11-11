import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiFetch } from '../api/client';

// Push registration for the app's notifications (the 'Recap ready' switch, spec
// 2026-10-04 §2). Tokens are app-level: they do not depend on the coach. Nothing
// here ever prompts for permission except enablePush.
//
// Everything is best-effort: the `expo-notifications` config plugin is only
// added to a build when EXPO_PUSH=1 (see app.config.js), so on most builds --
// and on simulators, without an EAS projectId, or with notifications blocked --
// the native side is unavailable or refuses. Those cases come back as a state,
// never as an exception, and never hold up the UI.

// Persisted with SecureStore, like the rest of the app's small local state
// (see lib/timezone.ts). Holds the Expo push token the server knows about.
const TOKEN_KEY = 'pushToken';

export type PushStatus = 'on' | 'off' | 'denied' | 'unavailable' | 'error';

export interface PushState {
  status: PushStatus;
  // Why push is unavailable / failed. For logs and tests, not shown to users.
  reason?: string;
}

const OFF: PushState = { status: 'off' };
const ON: PushState = { status: 'on' };

function unavailable(reason: string): PushState {
  return { status: 'unavailable', reason };
}

function getProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const fromExtra = extra?.eas?.projectId;
  const fromEas = (Constants as { easConfig?: { projectId?: unknown } }).easConfig?.projectId;
  for (const candidate of [fromExtra, fromEas]) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}

function getPlatform(): 'ios' | 'android' | null {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null;
}

async function readStoredToken(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(TOKEN_KEY)) || null;
  } catch {
    return null;
  }
}

async function fetchExpoToken(projectId: string): Promise<string> {
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (typeof data !== 'string' || data.length === 0) throw new Error('No push token returned');
  return data;
}

function registerToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  return apiFetch<void>('/me/push-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform }),
  });
}

// Reads the current state without ever prompting.
export async function getPushState(): Promise<PushState> {
  try {
    if (!getPlatform()) return unavailable('unsupported_platform');
    if (!getProjectId()) return unavailable('no_project_id');
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status === 'denied') return { status: 'denied' };
    if (permission.granted && (await readStoredToken())) return ON;
    return OFF;
  } catch (error) {
    return unavailable(reasonOf(error));
  }
}

// The only place that may show the system permission prompt.
export async function enablePush(): Promise<PushState> {
  try {
    const platform = getPlatform();
    if (!platform) return unavailable('unsupported_platform');
    const projectId = getProjectId();
    if (!projectId) return unavailable('no_project_id');

    let permission = await Notifications.getPermissionsAsync();
    // Once denied the system will not ask again; do not pretend it might.
    if (permission.status === 'denied') return { status: 'denied' };
    if (!permission.granted) {
      permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) return { status: 'denied' };
    }

    let token: string;
    try {
      token = await fetchExpoToken(projectId);
    } catch (error) {
      // Simulator, missing aps-environment entitlement, no network.
      return unavailable(reasonOf(error));
    }

    try {
      await registerToken(token, platform);
    } catch (error) {
      return { status: 'error', reason: reasonOf(error) };
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return ON;
  } catch (error) {
    return unavailable(reasonOf(error));
  }
}

// Unregisters the stored token, then forgets it. The local token is cleared
// even when the request fails: the user asked for notifications off, and a
// stale server row is harmless (the server drops tokens Expo reports dead).
export async function disablePush(): Promise<PushState> {
  const token = await readStoredToken();
  if (token) {
    try {
      await apiFetch<void>('/me/push-token', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    } catch {
      // Cleared locally below regardless.
    }
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // Nothing more can be done about a keychain failure.
    }
  }
  return OFF;
}

// Run on launch. Only touches users who already opted in (a stored token) and
// re-registers only when the token has changed. Tokens are app-level, so the
// coach's state does not matter here. Never prompts; never throws.
export async function syncPushRegistration(): Promise<void> {
  try {
    const stored = await readStoredToken();
    if (!stored) return;

    const platform = getPlatform();
    const projectId = getProjectId();
    if (!platform || !projectId) return;

    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;

    const current = await fetchExpoToken(projectId);
    if (current === stored) return;

    await registerToken(current, platform);
    await SecureStore.setItemAsync(TOKEN_KEY, current);
  } catch (error) {
    console.warn('Push registration sync failed; will retry on next launch', error);
  }
}

function reasonOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'unknown_error';
}
