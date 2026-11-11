import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { messageFor } from '../auth/authErrors';
import { MIN_PASSWORD_LENGTH } from '../auth/passwordPolicy';
import type { AuthStackParamList } from '../navigation/AuthNavigator';
import { Text } from '../components/ui/text';
import { PageTitle } from '../components/ui/page-title';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/text-field';
import { Character } from '../components/characters/Character';
import { useScreenFocused } from '../characters/useScreenFocused';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

const EXPIRED = 'This link has expired. Ask for a new one.';

export function ResetPasswordScreen({ navigation, route }: Props) {
  const { resetPassword } = useAuth();
  const token = route.params?.token;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : EXPIRED);
  const focused = useScreenFocused();

  // When the app is already open on this screen, a fresh reset link updates
  // the params of this same route instead of mounting a new screen. A new
  // token means the "expired" message (from a missing or rejected token) no
  // longer applies.
  useEffect(() => {
    if (token) setError((current) => (current === EXPIRED ? null : current));
  }, [token]);

  async function submit() {
    if (!token) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      // Back to the sign-in screen already in the stack, not a second copy.
      navigation.popTo('SignIn');
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-grow justify-center gap-8 px-6 py-8" keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(450)} className="items-center gap-3">
          <Character testID="auth-character" characterId="mochi" mood="idle" size={56} glow paused={!focused} />
          <PageTitle className="text-center">Choose a new password</PageTitle>
          {token ? <Text className="text-center text-body text-muted-foreground">{`Use at least ${MIN_PASSWORD_LENGTH} characters.`}</Text> : null}
        </Animated.View>
        <View className="gap-3">
          {token ? (
            <TextField label="New password" testID="password-input" value={password} onChangeText={setPassword} secure autoComplete="new-password" />
          ) : null}
          {error ? <Text className={error === EXPIRED ? 'text-center text-body text-muted-foreground' : 'text-caption text-destructive'}>{error}</Text> : null}
          {token ? (
            <Button testID="reset-password-button" size="lg" className="mt-2 w-full" onPress={submit} disabled={busy || !password}>
              Save password
            </Button>
          ) : null}
          {error === EXPIRED ? (
            <Button variant={token ? 'ghost' : 'default'} size={token ? 'default' : 'lg'} className={token ? undefined : 'mt-2 w-full'} onPress={() => navigation.navigate('ForgotPassword')}>
              Send a new link
            </Button>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
