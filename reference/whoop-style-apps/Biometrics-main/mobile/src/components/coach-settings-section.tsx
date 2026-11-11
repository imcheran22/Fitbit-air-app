import React, { useContext, useState } from 'react';
import { View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { revokeCoachConsent } from '../api/coach';
import { useCoachStatus } from '../lib/useCoachStatus';
import { COLORS } from '../theme';
import { Text } from './ui/text';
import { SettingsGroup, SettingsRow } from './ui/settings-list';
import { AiEngineRow } from './ai-engine-row';

// The AI Coach block on the Settings screen: set-up, memory and consent
// revocation. Notifications live in the app-level NotificationsSection. It renders nothing at all unless the server says the
// coach is enabled. Choosing the character lives in YourCoachRow, which shows
// either way.
export function CoachSettingsSection() {
  // Read the context directly (not useNavigation) so Settings still renders
  // outside a navigator.
  const navigation = useContext(NavigationContext);
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const { status, setStatus } = useCoachStatus(navigation ?? undefined);
  const [revokeError, setRevokeError] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!status || !status.enabled) return null;

  async function revoke() {
    if (!status || busy) return;
    setRevokeError(false);
    setBusy(true);
    try {
      await revokeCoachConsent();
      setStatus({ ...status, consented: false });
    } catch {
      setRevokeError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!status.consented) {
    return (
      <SettingsGroup testID="coach-settings" label="AI Coach" footer="The AI Coach is off. Nothing is shared with it, and the rest of the app works as normal.">
        <SettingsRow
          testID="coach-setup-button"
          icon="sparkles-outline"
          tint={colors.coach}
          title="Set up AI Coach"
          onPress={() => navigation?.navigate('CoachConsent' as never)}
        />
      </SettingsGroup>
    );
  }

  return (
    <View testID="coach-settings" className="gap-6">
      <SettingsGroup label="AI Coach" footer="Turning it off stops sharing your data with the coach. You can turn it back on any time.">
        <SettingsRow
          testID="coach-memory-row"
          icon="bulb-outline"
          tint={colors.coach}
          title="Coach Memory"
          subtitle="See, edit or delete what the coach remembers"
          onPress={() => navigation?.navigate('CoachMemory' as never)}
        />
        <SettingsRow
          testID="coach-revoke-button"
          icon="power-outline"
          destructive
          title="Turn off AI Coach"
          disabled={busy}
          onPress={() => void revoke()}
        />
      </SettingsGroup>
      {revokeError ? (
        <Text testID="coach-revoke-error" className="-mt-4 px-4 text-caption text-destructive">
          The AI Coach could not be turned off. Please try again.
        </Text>
      ) : null}
      {/* Kept after the revoke error so that error stays tucked under its own group. */}
      <AiEngineRow status={status} onChange={setStatus} onChooseHosted={() => navigation?.navigate('HostedConsent' as never)} />
    </View>
  );
}
