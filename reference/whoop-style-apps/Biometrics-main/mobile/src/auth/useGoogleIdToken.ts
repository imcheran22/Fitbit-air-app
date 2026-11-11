import { useEffect, useRef } from 'react';
import * as Google from 'expo-auth-session/providers/google';

/**
 * Google sign-in through the system browser sheet, reduced to "give me the ID
 * token". Used by sign-in and by Settings -> Sign-in methods (linking).
 */
export function useGoogleIdToken(onIdToken: (idToken: string) => void): { prompt: () => Promise<void>; ready: boolean } {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });
  // The response object is stable across re-renders; deliver each one once.
  const delivered = useRef<unknown>(null);

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.idToken && delivered.current !== response) {
      delivered.current = response;
      onIdToken(response.authentication.idToken);
    }
  }, [response, onIdToken]);

  return {
    ready: Boolean(request),
    prompt: async () => {
      await promptAsync();
    },
  };
}
