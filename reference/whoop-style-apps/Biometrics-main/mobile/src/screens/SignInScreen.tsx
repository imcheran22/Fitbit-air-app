import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { useGoogleIdToken } from '../auth/useGoogleIdToken';
import { AuthError, messageFor } from '../auth/authErrors';
import type { AuthStackParamList } from '../navigation/AuthNavigator';
import { Text } from '../components/ui/text';
import { PageTitle } from '../components/ui/page-title';
import { Button, buttonIconSize } from '../components/ui/button';
import { TextField } from '../components/ui/text-field';
import { GoogleMark, OnboardingHero } from '../components/onboarding-hero';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { COLORS } from '../theme';
import { devTestAccount } from '../auth/devTestAccount';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

const VERIFIED_NOTICE = 'Email confirmed. Sign in to continue.';

export function SignInScreen({ navigation, route }: Props) {
  const { signInWithApple, signInWithGoogle, signInWithEmail, resendVerification } = useAuth();
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const testAccount = devTestAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const verified = route.params?.verified === true;
  const [notice, setNotice] = useState<string | null>(verified ? VERIFIED_NOTICE : null);

  // When the app is already open on this screen, the email link updates the
  // params of this same route instead of mounting a new screen, so the
  // initial state above never sees it.
  useEffect(() => {
    if (!verified) return;
    setNotice(VERIFIED_NOTICE);
    // The "confirm your email first" error no longer applies.
    setError(null);
    setUnverified(false);
  }, [verified]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      await action();
    } catch (err) {
      setError(messageFor(err));
      setUnverified(err instanceof AuthError && err.code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setBusy(false);
    }
  }, []);

  const google = useGoogleIdToken(useCallback((idToken: string) => void run(() => signInWithGoogle(idToken)), [run, signInWithGoogle]));

  async function handleApple() {
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      });
    } catch {
      return; // The user closed the Apple sheet.
    }
    if (credential.identityToken) {
      const token = credential.identityToken;
      await run(() => signInWithApple(token, credential.fullName));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-grow justify-center gap-8 px-6 py-8" keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(450)} className="items-center gap-3">
          <OnboardingHero />
          <PageTitle className="text-[28px] leading-[34px] tracking-[1px]">Biometrics</PageTitle>
          <Text className="text-body text-muted-foreground">Your health data, unified.</Text>
        </Animated.View>
        {notice ? <Text className="text-center text-caption text-foreground">{notice}</Text> : null}
        <Animated.View entering={FadeInDown.delay(120).duration(450)} className="gap-3">
          <Button
            testID="apple-sign-in-button"
            size="lg"
            className="w-full"
            iconStart={<Ionicons name="logo-apple" size={buttonIconSize('lg')} color={colors.background} />}
            onPress={handleApple}
            disabled={busy}
          >
            Sign in with Apple
          </Button>
          <Button
            testID="google-sign-in-button"
            variant="outline"
            size="lg"
            className="w-full"
            iconStart={<GoogleMark size={buttonIconSize('lg')} />}
            onPress={() => google.prompt()}
            disabled={busy || !google.ready}
          >
            Sign in with Google
          </Button>
        </Animated.View>
        <View className="flex-row items-center gap-3">
          <View className="h-px flex-1 bg-border" />
          <Text className="text-caption text-muted-foreground">or with email</Text>
          <View className="h-px flex-1 bg-border" />
        </View>
        <View className="gap-3">
          {testAccount ? (
            <Button
              testID="dev-test-account-button"
              variant="outline"
              className="w-full border-dashed"
              disabled={busy}
              onPress={() => {
                setEmail(testAccount.email);
                setPassword(testAccount.password);
                void run(() => signInWithEmail(testAccount.email, testAccount.password));
              }}
            >
              {`Sign in as ${testAccount.email} (dev)`}
            </Button>
          ) : null}
          <TextField label="Email" testID="email-input" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
          <TextField label="Password" testID="password-input" value={password} onChangeText={setPassword} secure autoComplete="password" />
          {error ? <Text testID="sign-in-error" className="text-caption text-destructive">{error}</Text> : null}
          {unverified ? (
            <Button
              testID="resend-verification-button"
              variant="ghost"
              onPress={() => run(async () => { await resendVerification(email); setNotice('We sent you a new link.'); })}
            >
              Resend confirmation email
            </Button>
          ) : null}
          <Button testID="email-sign-in-button" size="lg" className="w-full" onPress={() => run(() => signInWithEmail(email, password))} disabled={busy || !email || !password}>
            Sign in
          </Button>
          <View className="flex-row justify-center gap-6 pt-1">
            <Button testID="forgot-password-link" variant="link" size="sm" onPress={() => navigation.navigate('ForgotPassword')}>
              Forgot password?
            </Button>
            <Button testID="create-account-link" variant="link" size="sm" onPress={() => navigation.navigate('SignUp')}>
              Create an account
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
