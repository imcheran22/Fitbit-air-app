import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext';
import { authClient } from '../../src/auth/authClient';
import { disablePush } from '../../src/lib/pushRegistration';
import { clearTimezoneState } from '../../src/lib/timezone';

jest.mock('../../src/lib/pushRegistration', () => ({ disablePush: jest.fn() }));
jest.mock('../../src/lib/timezone', () => ({ clearTimezoneState: jest.fn().mockResolvedValue(undefined) }));

let ctx: ReturnType<typeof useAuth>;
function Capture() { ctx = useAuth(); return <Text>x</Text>; }

it('clears the stored session without push unregistration (used after account deletion)', async () => {
  (authClient.signOut as jest.Mock).mockResolvedValueOnce({ data: null, error: { status: 401 } });
  render(<AuthProvider><Capture /></AuthProvider>);
  await act(() => ctx.clearSession());
  // authClient.signOut clears SecureStore before its request is sent, so a
  // server rejection (the session is already deleted) still clears locally.
  expect(authClient.signOut).toHaveBeenCalled();
  expect(disablePush).not.toHaveBeenCalled();
  expect(clearTimezoneState).toHaveBeenCalled();
});
