import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SignInMethodsScreen } from '../../src/screens/SignInMethodsScreen';
import { authClient } from '../../src/auth/authClient';

jest.mock('../../src/auth/useGoogleIdToken', () => ({ useGoogleIdToken: () => ({ prompt: jest.fn(), ready: true }) }));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), AppleAuthenticationScope: { EMAIL: 0 } }));
const m = authClient as unknown as Record<string, jest.Mock>;

const accounts = (...providers: string[]) => ({ data: providers.map((p, i) => ({ id: `a${i}`, providerId: p, accountId: `acc-${p}` })), error: null });

beforeEach(() => jest.clearAllMocks());

it('lists linked methods and offers to link the missing ones', async () => {
  m.listAccounts.mockResolvedValue(accounts('google', 'credential'));
  const { findByTestId, getByTestId, queryByTestId } = render(<SignInMethodsScreen />);
  await findByTestId('method-google');
  expect(getByTestId('method-credential')).toBeTruthy();
  expect(getByTestId('link-apple-button')).toBeTruthy();
  expect(queryByTestId('link-google-button')).toBeNull();
});

it('disables unlinking the only remaining method', async () => {
  m.listAccounts.mockResolvedValue(accounts('apple'));
  const { findByTestId } = render(<SignInMethodsScreen />);
  const unlink = await findByTestId('unlink-apple-button');
  expect(unlink.props.accessibilityState?.disabled).toBe(true);
});

it('unlinks a method when another remains, then reloads', async () => {
  m.listAccounts.mockResolvedValueOnce(accounts('apple', 'google')).mockResolvedValueOnce(accounts('apple'));
  const { findByTestId } = render(<SignInMethodsScreen />);
  fireEvent.press(await findByTestId('unlink-google-button'));
  // Better Auth 1.7.5's /unlink-account takes only `accountId`, matched against
  // the account row's own `id` (not the provider's account id).
  await waitFor(() => expect(m.unlinkAccount).toHaveBeenCalledWith({ accountId: 'a1' }));
  await waitFor(() => expect(m.listAccounts).toHaveBeenCalledTimes(2));
});

it('links Apple with the native identity token', async () => {
  m.listAccounts.mockResolvedValue(accounts('google'));
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'apple-token' });
  const { findByTestId } = render(<SignInMethodsScreen />);
  fireEvent.press(await findByTestId('link-apple-button'));
  await waitFor(() => expect(m.linkSocial).toHaveBeenCalledWith({ provider: 'apple', idToken: { token: 'apple-token' } }));
});

it('explains a link refused for a different email', async () => {
  m.listAccounts.mockResolvedValue(accounts('google'));
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'apple-token' });
  m.linkSocial.mockResolvedValueOnce({ data: null, error: { code: 'LINKING_DIFFERENT_EMAILS_NOT_ALLOWED', status: 401, message: 'raw' } });
  const { findByTestId, findByText } = render(<SignInMethodsScreen />);
  fireEvent.press(await findByTestId('link-apple-button'));
  expect(await findByText("That account uses a different email, so it can't be linked. (Apple's Hide My Email addresses can't be linked either.)")).toBeTruthy();
});
