import React from 'react';
import { StyleSheet } from 'react-native';
import { characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SignInScreen } from '../../src/screens/SignInScreen';
import { useAuth } from '../../src/auth/AuthContext';
import { AuthError } from '../../src/auth/authErrors';
import { FONTS } from '../../src/theme';

jest.mock('../../src/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../src/auth/useGoogleIdToken', () => ({ useGoogleIdToken: () => ({ prompt: jest.fn(), ready: true }) }));
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { EMAIL: 0, FULL_NAME: 1 },
}));

const navigation = { navigate: jest.fn() } as any;
const auth = () => ({
  signInWithApple: jest.fn().mockResolvedValue(undefined),
  signInWithGoogle: jest.fn(),
  signInWithEmail: jest.fn().mockResolvedValue(undefined),
  resendVerification: jest.fn().mockResolvedValue(undefined),
});

it('sets the app name in the pixel page-title face at 28, announced in its own case', () => {
  (useAuth as jest.Mock).mockReturnValue(auth());
  const { getByRole } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  const name = getByRole('header', { name: 'Biometrics' });
  expect(name).toHaveTextContent('BIOMETRICS');
  expect(StyleSheet.flatten(name.props.style).fontFamily).toBe(FONTS.pixel);
  expect(String(name.props.className).split(' ')).toEqual(expect.arrayContaining(['font-pixel', 'text-[28px]']));
  // The 28 replaces the token (its 20/26 line height would otherwise win).
  expect(String(name.props.className).split(' ')).not.toContain('text-page-title');
});

it('passes the Apple identity token and full name', async () => {
  const a = auth();
  (useAuth as jest.Mock).mockReturnValue(a);
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'apple-token', fullName: { givenName: 'Ada', familyName: 'L' } });
  const { getByTestId } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  fireEvent.press(getByTestId('apple-sign-in-button'));
  await waitFor(() => expect(a.signInWithApple).toHaveBeenCalledWith('apple-token', { givenName: 'Ada', familyName: 'L' }));
});

it('signs in with email and password', async () => {
  const a = auth();
  (useAuth as jest.Mock).mockReturnValue(a);
  const { getByTestId } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  fireEvent.changeText(getByTestId('email-input'), 'pat@example.com');
  fireEvent.changeText(getByTestId('password-input'), 'pw123456');
  fireEvent.press(getByTestId('email-sign-in-button'));
  await waitFor(() => expect(a.signInWithEmail).toHaveBeenCalledWith('pat@example.com', 'pw123456'));
});

it('offers to resend the verification email when the address is unverified', async () => {
  const a = auth();
  a.signInWithEmail.mockRejectedValue(new AuthError('EMAIL_NOT_VERIFIED', 'x', 403));
  (useAuth as jest.Mock).mockReturnValue(a);
  const { getByTestId, findByText } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  fireEvent.changeText(getByTestId('email-input'), 'pat@example.com');
  fireEvent.changeText(getByTestId('password-input'), 'pw123456');
  fireEvent.press(getByTestId('email-sign-in-button'));
  await findByText('Confirm your email first. We sent you a link.');
  fireEvent.press(getByTestId('resend-verification-button'));
  await waitFor(() => expect(a.resendVerification).toHaveBeenCalledWith('pat@example.com'));
});

it('shows the verified banner after the email link', () => {
  (useAuth as jest.Mock).mockReturnValue(auth());
  const { getByText } = render(<SignInScreen navigation={navigation} route={{ params: { verified: true } } as any} />);
  expect(getByText('Email confirmed. Sign in to continue.')).toBeTruthy();
});

it('ignores a cancelled Apple sheet', async () => {
  const a = auth();
  (useAuth as jest.Mock).mockReturnValue(a);
  (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue(Object.assign(new Error('cancel'), { code: 'ERR_REQUEST_CANCELED' }));
  const { getByTestId, queryByTestId } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  fireEvent.press(getByTestId('apple-sign-in-button'));
  await waitFor(() => expect(queryByTestId('sign-in-error')).toBeNull());
});

// Warm app: the email link updates the params of the sign-in screen that is
// already open, rather than mounting a new one.
it('shows the verified banner when the link opens an already-mounted sign-in screen', () => {
  (useAuth as jest.Mock).mockReturnValue(auth());
  const { queryByText, rerender } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  expect(queryByText('Email confirmed. Sign in to continue.')).toBeNull();
  rerender(<SignInScreen navigation={navigation} route={{ params: { verified: true } } as any} />);
  expect(queryByText('Email confirmed. Sign in to continue.')).toBeTruthy();
});

it('shows Mochi in the sign-in hero, whatever character a provider holds', () => {
  (useAuth as jest.Mock).mockReturnValue(auth());
  const utils = render(withCharacter(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />, { characterId: 'kit' }));

  expect(characterLabel(utils, 'onboarding-character')).toBe('character:mochi:idle:120:playing:none');
});
