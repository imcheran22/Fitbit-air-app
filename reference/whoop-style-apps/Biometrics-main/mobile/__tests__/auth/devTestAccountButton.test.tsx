import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SignInScreen } from '../../src/screens/SignInScreen';
import { useAuth } from '../../src/auth/AuthContext';
import { devTestAccount } from '../../src/auth/devTestAccount';

jest.mock('../../src/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../src/auth/useGoogleIdToken', () => ({ useGoogleIdToken: () => ({ prompt: jest.fn(), ready: true }) }));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), AppleAuthenticationScope: { EMAIL: 0, FULL_NAME: 1 } }));
// __DEV__ is false under Jest, so the screen test controls the account
// through the helper rather than process.env.
jest.mock('../../src/auth/devTestAccount', () => ({ devTestAccount: jest.fn() }));

const navigation = { navigate: jest.fn() } as any;

function mockAuth() {
  const signInWithEmail = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({ signInWithApple: jest.fn(), signInWithGoogle: jest.fn(), signInWithEmail, resendVerification: jest.fn() });
  return signInWithEmail;
}

it('signs straight in with the configured dev account', async () => {
  (devTestAccount as jest.Mock).mockReturnValue({ email: 'demo@example.com', password: 'secret' });
  const signInWithEmail = mockAuth();
  const { getByTestId } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);

  fireEvent.press(getByTestId('dev-test-account-button'));

  await waitFor(() => expect(signInWithEmail).toHaveBeenCalledWith('demo@example.com', 'secret'));
});

it('offers nothing when no dev account is configured', () => {
  (devTestAccount as jest.Mock).mockReturnValue(null);
  mockAuth();
  const { queryByTestId } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  expect(queryByTestId('dev-test-account-button')).toBeNull();
});
