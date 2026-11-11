import { renderHook } from '@testing-library/react-native';
import * as Google from 'expo-auth-session/providers/google';
import { useGoogleIdToken } from '../../src/auth/useGoogleIdToken';

jest.mock('expo-auth-session/providers/google', () => ({ useAuthRequest: jest.fn() }));

it('calls back once with the ID token from a successful response', () => {
  const onIdToken = jest.fn();
  (Google.useAuthRequest as jest.Mock).mockReturnValue([{}, { type: 'success', authentication: { idToken: 'gid' } }, jest.fn()]);
  const { rerender } = renderHook(() => useGoogleIdToken(onIdToken));
  rerender({});
  expect(onIdToken).toHaveBeenCalledTimes(1);
  expect(onIdToken).toHaveBeenCalledWith('gid');
});

it('ignores cancelled responses', () => {
  const onIdToken = jest.fn();
  (Google.useAuthRequest as jest.Mock).mockReturnValue([{}, { type: 'cancel' }, jest.fn()]);
  renderHook(() => useGoogleIdToken(onIdToken));
  expect(onIdToken).not.toHaveBeenCalled();
});
