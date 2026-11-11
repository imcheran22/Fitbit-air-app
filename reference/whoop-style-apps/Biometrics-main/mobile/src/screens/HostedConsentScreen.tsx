import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import {
  HostedUnavailableError,
  StaleConsentVersionError,
  fetchCoachStatus,
  grantHostedConsent,
  setCoachEngine,
  type HostedEngineDTO,
} from '../api/coach';
import { Text } from '../components/ui/text';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { SettingsGroup, SettingsRow } from '../components/ui/settings-list';
import { SectionLabel } from '../components/ui/section-label';
import { Character } from '../components/characters/Character';
import { useScreenFocused } from '../characters/useScreenFocused';
import { COLORS } from '../theme';

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'unavailable' } | { status: 'ready'; hosted: HostedEngineDTO };

// The opt-in for the hosted model (spec 3). Like the coach consent screen it
// states what leaves in the server's own words and needs a deliberate press;
// agreeing records the HOSTED consent, then switches the engine. "Not now"
// changes nothing.
export function HostedConsentScreen() {
  const navigation = useNavigation<any>();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const focused = useScreenFocused();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [textChanged, setTextChanged] = useState(false);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const status = await fetchCoachStatus();
      const hosted = status.engines?.hosted;
      if (!status.enabled || !hosted?.available || !hosted.consent) setState({ status: 'unavailable' });
      else setState({ status: 'ready', hosted });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function agree(hosted: HostedEngineDTO) {
    setSubmitting(true);
    setError(false);
    try {
      if (!hosted.consented) await grantHostedConsent(hosted.consent!.version);
      await setCoachEngine('hosted');
      navigation.goBack();
    } catch (e) {
      if (e instanceof StaleConsentVersionError) {
        setTextChanged(true);
        await load();
      } else if (e instanceof HostedUnavailableError) {
        setState({ status: 'unavailable' });
      } else {
        setError(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View testID="hosted-consent-loading" className="gap-5 px-5 pt-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-32 w-full rounded-card" />
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'error' || state.status === 'unavailable') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View testID={state.status === 'error' ? 'hosted-consent-load-error' : 'hosted-consent-unavailable'} className="flex-1 items-center justify-center gap-4 px-8">
          <Character mood="idle" size={48} paused={!focused} />
          <Text className="text-center text-muted-foreground">
            {state.status === 'error' ? 'Something went wrong loading this screen.' : "Claude isn't available right now. Your coach keeps answering on-device."}
          </Text>
          {state.status === 'error' ? (
            <Button testID="hosted-consent-retry" variant="secondary" onPress={() => void load()}>
              Try again
            </Button>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const { hosted } = state;
  const consent = hosted.consent!;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 }}>
        <View className="items-start gap-4">
          <Character mood="idle" size={56} glow paused={!focused} />
          <Text accessibilityRole="header" className="text-display">
            Answer with Claude
          </Text>
        </View>

        {textChanged ? (
          <View testID="hosted-consent-updated-note" className="flex-row items-start gap-2.5 rounded-tile border border-coach/25 bg-coach/10 px-4 py-3">
            <Ionicons name="refresh-outline" size={16} color={colors.coach} style={{ marginTop: 1 }} />
            <Text className="flex-1 text-body">This has changed since you last looked. Please read it again before you decide.</Text>
          </View>
        ) : null}

        <Card className="gap-3 p-5">
          <Text testID="hosted-consent-summary" className="text-body">
            {consent.summary}
          </Text>
        </Card>

        {consent.dataItems.length > 0 ? (
          <View className="gap-2">
            <SectionLabel accessibilityRole="header" className="px-4">
              What is sent when you ask something
            </SectionLabel>
            <SettingsGroup>
              {consent.dataItems.map((item) => (
                <SettingsRow key={item} title={item} icon="arrow-up-circle-outline" tint={colors.coach} />
              ))}
            </SettingsGroup>
          </View>
        ) : null}

        {error ? (
          <Text testID="hosted-consent-error" className="text-caption text-destructive">
            We could not save your choice. Please try again.
          </Text>
        ) : null}

        <View className="gap-2">
          <Button testID="hosted-consent-agree" size="lg" disabled={submitting} onPress={() => void agree(hosted)}>
            Use Claude
          </Button>
          <Button testID="hosted-consent-decline" variant="outline" size="lg" disabled={submitting} onPress={() => navigation.goBack()}>
            Not now
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
