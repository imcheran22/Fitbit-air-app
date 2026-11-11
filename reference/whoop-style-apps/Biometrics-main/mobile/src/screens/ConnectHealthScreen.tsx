import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import { apiFetch } from '../api/client';
import { Text } from '../components/ui/text';
import { PageTitle } from '../components/ui/page-title';
import { Button } from '../components/ui/button';
import { Character } from '../components/characters/Character';
import { useScreenFocused } from '../characters/useScreenFocused';
import { SettingsGroup, SettingsRow } from '../components/ui/settings-list';
import { COLORS } from '../theme';
import { syncTimezone } from '../lib/timezone';

const REDIRECT_URI = 'biometrics://health/callback';

function connectErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  // The API client has already ended the session and the app is heading back to
  // sign-in; say why instead of showing a generic failure.
  if (/session expired/i.test(message)) return 'Your session expired. Please sign in again.';
  return "We couldn't connect Google Health. Please try again.";
}

export function ConnectHealthScreen() {
  const navigation = useNavigation<any>();
  const [busy, setBusy] = useState(false);
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [error, setError] = useState<string | null>(null);
  const focused = useScreenFocused();

  async function handleConnect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // /health/authorize is authenticated and returns the Google Health URL as JSON
      // (apiFetch attaches the token). We cannot point the system browser at it
      // directly, because a browser navigation carries no Authorization header.
      const { url } = await apiFetch<{ url: string }>('/health/authorize');
      const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URI);
      if (result.type === 'success') {
        if (result.url.includes('status=connected')) {
          // Capture the zone the backend will use for day-bucketing. Not awaited:
          // it swallows its own failures and must not delay landing on the dashboard.
          void syncTimezone();
          navigation.navigate('Tabs');
        } else {
          // The browser came back to the app, but not with a success status.
          setError("Google Health didn't finish connecting. Please try again.");
        }
      }
      // A dismissed or cancelled browser is the user's choice, not an error.
    } catch (err) {
      setError(connectErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerClassName="flex-grow gap-7 px-5 pb-6 pt-12">
        <View className="flex-row items-center justify-center gap-4 pt-2" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Character testID="connect-health-character" mood="idle" size={72} glow paused={!focused} />
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
            <View className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
            <View className="h-2.5 w-2.5 rounded-full bg-accent" />
            <View className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
            <View className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
          </View>
          <View className="h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-foreground">
            <Ionicons name="heart" size={34} color={colors.metricHeart} />
          </View>
        </View>

        <View className="items-center gap-2 px-2">
          <PageTitle className="text-center">Connect your Google Health</PageTitle>
          <Text className="text-center text-body text-muted-foreground">
            We'll sync your steps, sleep, resting heart rate, and HRV automatically.
          </Text>
        </View>

        <SettingsGroup label="What we'll read">
          <SettingsRow icon="footsteps-outline" tint={colors.metricSteps} title="Steps & activity" value="Read only" />
          <SettingsRow icon="moon-outline" tint={colors.metricSleep} title="Sleep" value="Read only" />
          <SettingsRow icon="heart-outline" tint={colors.metricHeart} title="Resting heart rate" value="Read only" />
          <SettingsRow icon="pulse-outline" tint={colors.metricHrv} title="Heart rate variability" value="Read only" />
        </SettingsGroup>

        <View className="flex-row gap-3 rounded-tile border border-border bg-muted/50 px-4 py-3.5">
          <Ionicons name="lock-closed-outline" size={17} color={colors.muted} style={{ marginTop: 1 }} />
          <Text className="flex-1 text-caption text-muted-foreground">
            We only read your data and never write to Google Health. You can revoke access anytime from your Google Account.
          </Text>
        </View>
      </ScrollView>

      <View className="gap-2 px-5 pb-2">
        {error ? (
          <Text testID="connect-health-error" className="text-center text-caption text-destructive">
            {error}
          </Text>
        ) : null}
        <Button testID="connect-health-button" size="lg" className="w-full" onPress={handleConnect} disabled={busy}>
          {busy ? 'Waiting for Google…' : 'Connect Google Health'}
        </Button>
        <Text className="text-center text-caption text-muted-foreground">You'll finish on Google's sign-in page</Text>
      </View>
    </SafeAreaView>
  );
}
