import React, { useState } from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import {
  CoachConsentRequiredError,
  HostedUnavailableError,
  fetchCoachStatus,
  revokeHostedConsent,
  setCoachEngine,
  type CoachEngineDTO,
  type CoachStatusDTO,
} from '../api/coach';
import { COLORS } from '../theme';
import { SettingsGroup, SettingsRow } from './ui/settings-list';
import { Text } from './ui/text';

interface AiEngineRowProps {
  status: CoachStatusDTO;
  // The status after a switch or withdrawal saved, for the caller to keep.
  onChange: (next: CoachStatusDTO) => void;
  // Claude was picked but needs (fresh) hosted consent first.
  onChooseHosted: () => void;
}

// Profile -> AI Coach -> "AI engine" (spec 3): On-device (default) or Claude.
// The choice is only drawn when this server offers Claude. Choosing Claude
// without a current hosted consent opens the consent screen instead of
// switching. While the hosted consent is held it can always be withdrawn, even
// after the server stops offering Claude. The selected engine is the server's
// effective one (status.engine), not just the last choice.
export function AiEngineRow({ status, onChange, onChooseHosted }: AiEngineRowProps) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [withdrawFailed, setWithdrawFailed] = useState(false);
  // PUT /engine answered hosted_unavailable: Claude was switched off server-side.
  const [hostedGone, setHostedGone] = useState(false);
  const hosted = status.engines?.hosted;
  if (!hosted || (!hosted.available && !hosted.consented)) return null;
  const current: CoachEngineDTO = status.engine ?? 'local';

  async function choose(engine: CoachEngineDTO) {
    if (busy || engine === current) return;
    if (engine === 'hosted' && !hosted!.consented) {
      onChooseHosted();
      return;
    }
    setFailed(false);
    setWithdrawFailed(false);
    setBusy(true);
    try {
      await setCoachEngine(engine);
      onChange({ ...status, engine });
    } catch (e) {
      if (engine === 'hosted' && e instanceof CoachConsentRequiredError) onChooseHosted();
      else if (engine === 'hosted' && e instanceof HostedUnavailableError) setHostedGone(true);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (busy) return;
    setFailed(false);
    setWithdrawFailed(false);
    setBusy(true);
    try {
      await revokeHostedConsent();
    } catch {
      setWithdrawFailed(true);
      setBusy(false);
      return;
    }
    let next: CoachStatusDTO;
    try {
      next = await fetchCoachStatus();
    } catch {
      // The server has already reset the engine to on-device with the revoke.
      next = { ...status, engine: 'local', engines: { hosted: { ...hosted!, consented: false } } };
    }
    setBusy(false);
    onChange(next);
  }

  const check = (selected: boolean) =>
    selected ? <Ionicons name="checkmark" size={20} color={colors.accent} accessibilityElementsHidden importantForAccessibility="no" /> : undefined;

  return (
    <View testID="ai-engine" className="gap-2">
      <SettingsGroup
        label="AI engine"
        footer="On-device is the default: answers are written on your own server. Before Claude answers, its consent screen shows exactly what is sent to Anthropic."
      >
        {hosted.available ? (
          <SettingsRow
            testID="ai-engine-local"
            icon="hardware-chip-outline"
            tint={colors.accent}
            title="On-device"
            subtitle="Private, and a little slower"
            accessibilityRole="radio"
            selected={current === 'local'}
            disabled={busy}
            trailing={check(current === 'local')}
            onPress={() => void choose('local')}
          />
        ) : null}
        {hosted.available ? (
          <SettingsRow
            testID="ai-engine-hosted"
            icon="sparkles-outline"
            tint={colors.coach}
            title="Claude"
            subtitle={hostedGone ? 'Not available right now' : 'Faster, fuller answers from Anthropic'}
            accessibilityRole="radio"
            selected={current === 'hosted'}
            disabled={busy || hostedGone}
            trailing={check(current === 'hosted')}
            onPress={() => void choose('hosted')}
          />
        ) : null}
        {hosted.consented ? (
          <SettingsRow
            testID="ai-engine-withdraw"
            icon="close-circle-outline"
            destructive
            title="Withdraw Claude consent"
            subtitle="Stops sending anything to Anthropic and answers on-device"
            disabled={busy}
            onPress={() => void withdraw()}
          />
        ) : null}
      </SettingsGroup>
      {hostedGone ? (
        <Text testID="ai-engine-unavailable" className="px-4 text-caption text-muted-foreground">
          {"Claude isn't available on this server right now. Your coach answers on-device."}
        </Text>
      ) : null}
      {failed ? (
        <Text testID="ai-engine-error" className="px-4 text-caption text-destructive">
          {"Couldn't switch the AI engine. Please try again."}
        </Text>
      ) : null}
      {withdrawFailed ? (
        <Text testID="ai-engine-withdraw-error" className="px-4 text-caption text-destructive">
          {"Couldn't withdraw your Claude consent. Please try again."}
        </Text>
      ) : null}
    </View>
  );
}
