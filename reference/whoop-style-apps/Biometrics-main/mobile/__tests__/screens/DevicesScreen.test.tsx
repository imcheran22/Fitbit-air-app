import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DevicesScreen, describeDevice } from '../../src/screens/DevicesScreen';
import { authClient } from '../../src/auth/authClient';

const m = authClient as unknown as Record<string, jest.Mock>;
const sessions = [
  { id: 's1', token: 'tok-this', userAgent: 'Biometrics/1 CFNetwork Darwin iPhone', updatedAt: '2026-09-23T10:00:00Z' },
  { id: 's2', token: 'tok-other', userAgent: 'Biometrics/1 CFNetwork Darwin iPad', updatedAt: '2026-09-20T10:00:00Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  m.useSession.mockReturnValue({ data: { user: { id: 'u1' }, session: { token: 'tok-this' } }, isPending: false });
  m.listSessions.mockResolvedValue({ data: sessions, error: null });
});

it('marks this device and offers sign-out only on the others', async () => {
  const { findByTestId, queryByTestId } = render(<DevicesScreen />);
  expect(await findByTestId('this-device-badge-s1')).toBeTruthy();
  expect(queryByTestId('revoke-s1')).toBeNull();
  expect(await findByTestId('revoke-s2')).toBeTruthy();
});

it('offers no sign-out controls until it knows which session is this device', async () => {
  m.useSession.mockReturnValue({ data: null, isPending: false });
  const { findByTestId, queryByTestId } = render(<DevicesScreen />);
  expect(await findByTestId('device-s1')).toBeTruthy();
  expect(queryByTestId('revoke-s1')).toBeNull();
  expect(queryByTestId('revoke-s2')).toBeNull();
  expect(queryByTestId('revoke-others-button')).toBeNull();
});

it('revokes one device by token and reloads', async () => {
  const { findByTestId } = render(<DevicesScreen />);
  fireEvent.press(await findByTestId('revoke-s2'));
  await waitFor(() => expect(m.revokeSession).toHaveBeenCalledWith({ token: 'tok-other' }));
  await waitFor(() => expect(m.listSessions).toHaveBeenCalledTimes(2));
});

it('signs out all other devices', async () => {
  const { findByTestId } = render(<DevicesScreen />);
  fireEvent.press(await findByTestId('revoke-others-button'));
  await waitFor(() => expect(m.revokeOtherSessions).toHaveBeenCalled());
});

it.each([
  ['Biometrics/1 CFNetwork Darwin iPhone', 'iPhone'],
  ['Mozilla/5.0 (iPad; CPU OS 18_0)', 'iPad'],
  ['okhttp/4.12 Android', 'Android device'],
  [null, 'Unknown device'],
])('describes %s as %s', (ua, label) => {
  expect(describeDevice(ua)).toBe(label);
});
