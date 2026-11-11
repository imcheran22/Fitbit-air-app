import React, { useRef, useState } from 'react';
import { View, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { ApiError, deleteAccount } from '../api/client';
import { useOptionalAuth } from '../auth/AuthContext';
import { COLORS } from '../theme';
import { SettingsGroup, SettingsRow } from './ui/settings-list';
import { Text } from './ui/text';
import { inputTextStyle } from './ui/input-style';
import { Card } from './ui/card';
import { Button } from './ui/button';

const CONFIRM_WORD = 'DELETE';

// "Delete account" block at the bottom of Settings (App Store requires an
// in-app way to delete an account). Tapping the entry opens an inline
// confirmation; the destructive button stays disabled until the user types the
// word exactly. On success the server has already killed the tokens, so the
// session is cleared locally instead of calling the sign-out endpoint. `renderClosed` replaces the
// closed entry (Profile draws it beside Sign out); it is handed the function that opens the confirm.
export function DeleteAccountSection({ renderClosed }: { renderClosed?: (open: () => void) => React.ReactElement } = {}) {
  const auth = useOptionalAuth();
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State alone cannot stop a double-tap: two presses can arrive before React
  // re-renders the button as disabled.
  const inFlight = useRef(false);

  const confirmed = typed === CONFIRM_WORD;

  function close() {
    if (inFlight.current) return;
    setOpen(false);
    setTyped('');
    setError(null);
  }

  async function confirmDelete() {
    if (!confirmed || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? `The server could not delete your account (error ${e.status}). Nothing was deleted; please try again.`
          : 'Could not reach the server. Check your connection and try again. Nothing was deleted.',
      );
      inFlight.current = false;
      setBusy(false);
      return;
    }
    // The account is gone. Leave the busy state on: signing out unmounts this
    // screen, and nothing here should be tappable in the meantime.
    await auth?.clearSession();
  }

  if (!open) {
    if (renderClosed) return renderClosed(() => setOpen(true));
    return (
      <SettingsGroup testID="delete-account-section" footer="Permanently delete your account and all the data stored for it.">
        <SettingsRow testID="delete-account-open" icon="trash-outline" destructive title="Delete account…" onPress={() => setOpen(true)} />
      </SettingsGroup>
    );
  }

  return (
    <Card testID="delete-account-section" className="gap-3 border-destructive/40">
      <View className="flex-row items-center gap-2">
        <Ionicons name="warning-outline" size={18} color={colors.scorePoor} />
        <Text className="text-body font-semibold text-destructive">Delete your account?</Text>
      </View>
      <Text testID="delete-account-warning" className="text-caption text-muted-foreground">
        This permanently deletes your synced health data, scores, habit logs, coach data and memory, and your Google
        Health connection. This cannot be undone.
      </Text>
      <Text className="text-body">
        Type <Text className="font-semibold">{CONFIRM_WORD}</Text> to confirm.
      </Text>
      <TextInput
        testID="delete-account-input"
        value={typed}
        onChangeText={setTyped}
        editable={!busy}
        placeholder={CONFIRM_WORD}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[inputTextStyle, { color: colors.foreground }]}
        className="rounded-tile border border-border bg-card px-4 py-3"
      />
      {error ? (
        <Text testID="delete-account-error" className="text-caption text-destructive">
          {error}
        </Text>
      ) : null}
      {busy ? (
        <View testID="delete-account-progress" className="flex-row items-center justify-center gap-2">
          <ActivityIndicator color={colors.muted} />
          <Text className="text-caption text-muted-foreground">Deleting your account…</Text>
        </View>
      ) : null}
      <Button
        testID="delete-account-confirm"
        variant="destructive"
        disabled={!confirmed || busy}
        onPress={() => void confirmDelete()}
      >
        Permanently delete my account
      </Button>
      <Button testID="delete-account-cancel" variant="outline" disabled={busy} onPress={close}>
        Cancel
      </Button>
    </Card>
  );
}
