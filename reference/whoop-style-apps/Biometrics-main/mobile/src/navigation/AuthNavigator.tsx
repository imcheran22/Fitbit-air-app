import React from 'react';
import { NavigationContainer, type LinkingOptions, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SignInScreen } from '../screens/SignInScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';

export type AuthStackParamList = {
  SignIn: { verified?: boolean } | undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string } | undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

// The two links the server sends by email redirect here:
//   biometrics://verified               (after confirming an email)
//   biometrics://reset-password?token=… (after opening a reset link)
export const authLinking: LinkingOptions<AuthStackParamList> = {
  prefixes: ['biometrics://'],
  config: {
    screens: {
      // `parse` only runs for params that are present, and the server sends
      // the bare path `verified`. So the segment itself is the param: the regex
      // pins it to the literal word, and `parse` turns it into `true`.
      SignIn: { path: ':verified(verified)', parse: { verified: () => true } },
      ResetPassword: 'reset-password',
    },
  },
};

export function AuthNavigator({ theme }: { theme: Theme }) {
  return (
    <NavigationContainer theme={theme} linking={authLinking}>
      <Stack.Navigator initialRouteName="SignIn" screenOptions={{ headerShadowVisible: false, headerTitle: '', headerTransparent: true }}>
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
