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

beforeEach(() => jest.clearAllMocks());

it('unregisters push before signing out, then clears the time zone state', async () => {
  const order: string[] = [];
  (disablePush as jest.Mock).mockImplementation(async () => { order.push('push'); });
  (authClient.signOut as jest.Mock).mockImplementation(async () => { order.push('signOut'); return { data: {}, error: null }; });
  (clearTimezoneState as jest.Mock).mockImplementation(async () => { order.push('tz'); });
  render(<AuthProvider><Capture /></AuthProvider>);
  await act(() => ctx.signOut());
  expect(order).toEqual(['push', 'signOut', 'tz']);
});

it('still signs out when push unregistration hangs', async () => {
  jest.useFakeTimers();
  (disablePush as jest.Mock).mockReturnValue(new Promise(() => undefined));
  render(<AuthProvider><Capture /></AuthProvider>);
  const done = ctx.signOut();
  await act(async () => { jest.advanceTimersByTime(2000); });
  await act(() => done);
  expect(authClient.signOut).toHaveBeenCalled();
  jest.useRealTimers();
});

it('still clears local state when the server sign-out fails', async () => {
  (disablePush as jest.Mock).mockResolvedValue(undefined);
  (authClient.signOut as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  render(<AuthProvider><Capture /></AuthProvider>);
  await act(() => ctx.signOut());
  expect(clearTimezoneState).toHaveBeenCalled();
});
