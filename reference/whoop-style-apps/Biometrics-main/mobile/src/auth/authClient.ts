import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

// The session cookie lives in SecureStore under the "biometrics" prefix; the
// Expo plugin attaches it to every auth call. Our own API calls read it with
// authClient.getCookie() (see api/client.ts).
export const authClient = createAuthClient({
  baseURL: `${API_BASE_URL}/auth`,
  plugins: [expoClient({ scheme: 'biometrics', storagePrefix: 'biometrics', storage: SecureStore })],
});
