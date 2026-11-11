import './global.css';
import React from 'react';
import { useFonts } from 'expo-font';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { Geist_800ExtraBold } from '@expo-google-fonts/geist/800ExtraBold';
import { AuthProvider } from './src/auth/AuthContext';
import { CharacterProvider } from './src/characters/CharacterProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { applyDefaultThemeSync } from './src/theme/preference';
import { ThemedStatusBar } from './src/components/themed-status-bar';
import { CharacterGalleryScreen } from './src/screens/dev/CharacterGalleryScreen';
import { setBaseUrl } from './src/api/client';
import { API_BASE_URL } from './src/auth/authClient';
import { installNotificationHandler } from './src/notifications/handler';

applyDefaultThemeSync();
// Before any notification can arrive: shows the wind-down reminder in the
// foreground (and nothing else, as before).
installNotificationHandler();
setBaseUrl(API_BASE_URL);

export default function App() {
  // Keys are the family names in FONTS (src/theme.ts). The splash screen stays
  // up until they all load, Silkscreen with them, so no pixel title or label
  // ever draws in a stand-in face; a load error still renders the app on
  // system fonts rather than a blank screen.
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    Geist_800ExtraBold,
    Silkscreen: require('./assets/fonts/Silkscreen-Regular.ttf'),
  });
  if (!fontsLoaded && !fontError) return null;

  // Dev-only: every character in every mood. EXPO_PUBLIC_CHARACTER_GALLERY=1
  if (__DEV__ && process.env.EXPO_PUBLIC_CHARACTER_GALLERY === '1') {
    return <CharacterGalleryScreen />;
  }

  return (
    <ThemeProvider>
      <ThemedStatusBar />
      <AuthProvider>
        {/* Inside AuthProvider: it follows the session (Mochi when signed out). */}
        <CharacterProvider>
          <RootNavigator />
        </CharacterProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
