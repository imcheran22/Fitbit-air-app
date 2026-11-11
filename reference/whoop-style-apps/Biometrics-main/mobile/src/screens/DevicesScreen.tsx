import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useColorScheme } from 'nativewind';
import { authClient } from '../auth/authClient';
import { unwrap, messageFor } from '../auth/authErrors';
import { COLORS } from '../theme';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { SettingsGroup, SettingsRow } from '../components/ui/settings-list';

interface DeviceSession {
  id: string;
  token: string;
  userAgent?: string | null;
  updatedAt: string | Date;
}

export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/iPhone|Darwin|iOS/i.test(userAgent)) return 'iPhone';
  if (/Android|okhttp/i.test(userAgent)) return 'Android device';
  return 'Unknown device';
}

export function DevicesScreen() {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const { data } = authClient.useSession();
  const currentToken = data?.session?.token;
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSessions(await unwrap<DeviceSession[]>(authClient.listSessions()));
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

  const others = sessions?.filter((s) => s.token !== currentToken) ?? [];

  return (
    <ScrollView className="bg-background" contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
      {sessions && sessions.length > 0 ? (
        <SettingsGroup label="Signed in">
          {sessions.map((s) => {
            const name = describeDevice(s.userAgent);
            const current = !!currentToken && s.token === currentToken;
            return (
              <SettingsRow
                key={s.id}
                testID={`device-${s.id}`}
                icon={name === 'iPad' ? 'tablet-portrait-outline' : 'phone-portrait-outline'}
                tint={current ? colors.accent : colors.muted}
                title={name}
                subtitle={`Last active ${new Date(s.updatedAt).toLocaleDateString()}`}
                trailing={
                  !currentToken ? null : current ? (
                    <Badge testID={`this-device-badge-${s.id}`} variant="accent" className="self-center">
                      This device
                    </Badge>
                  ) : (
                    <Button
                      testID={`revoke-${s.id}`}
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      // Better Auth revokes another device's session by its token.
                      onPress={() => act(() => unwrap(authClient.revokeSession({ token: s.token })))}
                    >
                      Sign out
                    </Button>
                  )
                }
              />
            );
          })}
        </SettingsGroup>
      ) : null}
      {currentToken && others.length > 0 ? (
        <SettingsGroup>
          <SettingsRow
            testID="revoke-others-button"
            icon="log-out-outline"
            destructive
            title="Sign out all other devices"
            disabled={busy}
            onPress={() => act(() => unwrap(authClient.revokeOtherSessions()))}
          />
        </SettingsGroup>
      ) : null}
      {error ? <Text className="px-4 text-caption text-destructive">{error}</Text> : null}
    </ScrollView>
  );
}
