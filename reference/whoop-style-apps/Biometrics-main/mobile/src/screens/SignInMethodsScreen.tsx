import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { authClient } from '../auth/authClient';
import { unwrap, messageFor } from '../auth/authErrors';
import { useGoogleIdToken } from '../auth/useGoogleIdToken';
import { COLORS } from '../theme';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/button';
import { SettingsGroup, SettingsRow } from '../components/ui/settings-list';

interface LinkedAccount {
  id: string;
  providerId: string;
  accountId: string;
}

const LABELS: Record<string, string> = { apple: 'Apple', google: 'Google', credential: 'Email and password' };
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = { apple: 'logo-apple', google: 'logo-google', credential: 'mail-outline' };
const LINKABLE = ['apple', 'google'] as const;

export function SignInMethodsScreen() {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccounts(await unwrap<LinkedAccount[]>(authClient.listAccounts()));
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        await load();
      } catch (err) {
        setError(messageFor(err));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const google = useGoogleIdToken(
    useCallback((idToken: string) => void act(() => unwrap(authClient.linkSocial({ provider: 'google', idToken: { token: idToken } }))), [act]),
  );

  async function linkApple() {
    let token: string | null;
    try {
      token = (await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL] })).identityToken;
    } catch {
      return; // Sheet closed.
    }
    if (token) {
      const identityToken = token;
      await act(() => unwrap(authClient.linkSocial({ provider: 'apple', idToken: { token: identityToken } })));
    }
  }

  const linked = new Set(accounts?.map((a) => a.providerId));
  const onlyOne = (accounts?.length ?? 0) <= 1;
  const unlinked = accounts ? LINKABLE.filter((p) => !linked.has(p)) : [];
  const tintFor = (providerId: string) => (providerId === 'credential' ? colors.metricSleep : providerId === 'apple' ? colors.foreground : colors.accent);

  return (
    <ScrollView className="bg-background" contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
      <Text className="px-4 text-caption text-muted-foreground">
        You can sign in with any of these. Linking only works for an account that uses the same email.
      </Text>
      {accounts && accounts.length > 0 ? (
        <SettingsGroup label="Linked" footer={onlyOne ? 'You need at least one way to sign in.' : undefined}>
          {accounts.map((account) => (
            <SettingsRow
              key={account.id}
              testID={`method-${account.providerId}`}
              icon={ICONS[account.providerId] ?? 'key-outline'}
              tint={tintFor(account.providerId)}
              title={LABELS[account.providerId] ?? account.providerId}
              trailing={
                <Button
                  testID={`unlink-${account.providerId}-button`}
                  variant="destructive"
                  size="sm"
                  disabled={busy || onlyOne}
                  // /unlink-account matches `accountId` against the account row's own id.
                  onPress={() => act(() => unwrap(authClient.unlinkAccount({ accountId: account.id })))}
                >
                  Unlink
                </Button>
              }
            />
          ))}
        </SettingsGroup>
      ) : null}
      {accounts && accounts.length === 0 ? (
        <Text className="px-4 text-caption text-muted-foreground">You need at least one way to sign in.</Text>
      ) : null}
      {unlinked.length > 0 ? (
        <SettingsGroup label="Add a method">
          {unlinked.map((provider) => (
            <SettingsRow
              key={provider}
              testID={`link-${provider}-button`}
              icon={ICONS[provider]}
              tint={tintFor(provider)}
              title={`Link ${LABELS[provider]}`}
              disabled={busy || (provider === 'google' && !google.ready)}
              onPress={() => (provider === 'apple' ? linkApple() : google.prompt())}
            />
          ))}
        </SettingsGroup>
      ) : null}
      {error ? <Text className="px-4 text-caption text-destructive">{error}</Text> : null}
    </ScrollView>
  );
}
