import React, { useSyncExternalStore } from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { SettingsScreen } from '../../src/screens/SettingsScreen';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext';
import { authClient } from '../../src/auth/authClient';
import { setBaseUrl } from '../../src/api/client';
import { fetchCoachStatus } from '../../src/api/coach';
import { clearTimezoneState, getTimezoneState, listTimeZones } from '../../src/lib/timezone';
import { fetchNotificationSettings } from '../../src/api/notifications';

jest.mock('expo-secure-store');
jest.mock('../../src/lib/timezone');
jest.mock('../../src/api/coach');
// Settings also reads the notification settings; keep that off the fetch mock these tests count.
jest.mock('../../src/api/notifications');
// ...and the newest recap, for the avatar's story ring.
jest.mock('../../src/api/recaps');
// ...and the badges, for the Badges card.
jest.mock('../../src/api/achievements');
// ...and the buddies, for the Buddies section.
jest.mock('../../src/api/buddies');

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

// A reactive stand-in for Better Auth's session atom: signed in until
// authClient.signOut runs, which flips useSession() to null and re-renders.
const signedIn = { data: { user: { id: 'u1', email: 'u1@example.com' }, session: {} }, isPending: false };
const signedOut = { data: null, isPending: false };
let current: typeof signedIn | typeof signedOut = signedIn;
const listeners = new Set<() => void>();
function setSessionState(next: typeof current) {
  current = next;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function SessionProbe() {
  const { session } = useAuth();
  return <Text testID="session">{session ? 'signed-in' : 'signed-out'}</Text>;
}

async function renderSignedIn() {
  const utils = render(
    <AuthProvider>
      <SessionProbe />
      <SettingsScreen />
    </AuthProvider>,
  );
  await waitFor(() => expect(utils.getByTestId('session').props.children).toBe('signed-in'));
  return utils;
}

type Utils = ReturnType<typeof render>;

function open(utils: Utils) {
  fireEvent.press(utils.getByTestId('delete-account-open'));
}

function type(utils: Utils, text: string) {
  fireEvent.changeText(utils.getByTestId('delete-account-input'), text);
}

function isDisabled(utils: Utils, testID: string): boolean {
  return !!utils.getByTestId(testID).props.accessibilityState?.disabled;
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  setBaseUrl('https://api.example.com');
  (getTimezoneState as jest.Mock).mockResolvedValue({ timezone: 'UTC', overridden: false });
  (listTimeZones as jest.Mock).mockReturnValue([]);
  (clearTimezoneState as jest.Mock).mockResolvedValue(undefined);
  (fetchCoachStatus as jest.Mock).mockResolvedValue({ enabled: false });
  (fetchNotificationSettings as jest.Mock).mockResolvedValue({ recapPushEnabled: true });
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
  current = signedIn;
  (authClient.useSession as jest.Mock).mockImplementation(() => useSyncExternalStore(subscribe, () => current));
  (authClient.signOut as jest.Mock).mockImplementation(async () => {
    setSessionState(signedOut);
    return { data: {}, error: null };
  });
});

describe('SettingsScreen: Delete account', () => {
  it('shows only the entry point until tapped, then explains what is deleted', async () => {
    const utils = await renderSignedIn();

    expect(utils.getByTestId('delete-account-section')).toBeTruthy();
    expect(utils.queryByTestId('delete-account-input')).toBeNull();

    open(utils);

    const body = utils.getByTestId('delete-account-warning');
    expect(body).toHaveTextContent(/health data/i);
    expect(body).toHaveTextContent(/scores/i);
    expect(body).toHaveTextContent(/habit logs/i);
    expect(body).toHaveTextContent(/coach data and memory/i);
    expect(body).toHaveTextContent(/Google Health connection/i);
    expect(body).toHaveTextContent(/cannot be undone/i);
  });

  it.each([
    ['empty', ''],
    ['partial', 'DELET'],
    ['lower case', 'delete'],
    ['mixed case', 'Delete'],
    ['trailing space', 'DELETE '],
    ['leading space', ' DELETE'],
  ])('keeps the destructive button disabled for %s input', async (_label, value) => {
    const utils = await renderSignedIn();
    open(utils);
    type(utils, value);

    expect(isDisabled(utils, 'delete-account-confirm')).toBe(true);
    fireEvent.press(utils.getByTestId('delete-account-confirm'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enables the destructive button only for exactly DELETE', async () => {
    const utils = await renderSignedIn();
    open(utils);
    expect(isDisabled(utils, 'delete-account-confirm')).toBe(true);

    type(utils, 'DELETE');
    expect(isDisabled(utils, 'delete-account-confirm')).toBe(false);

    type(utils, 'DELETE!');
    expect(isDisabled(utils, 'delete-account-confirm')).toBe(true);
  });

  it('Cancel closes the panel and clears the typed text and any error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const utils = await renderSignedIn();
    open(utils);
    type(utils, 'DELETE');
    fireEvent.press(utils.getByTestId('delete-account-confirm'));
    await utils.findByTestId('delete-account-error');

    fireEvent.press(utils.getByTestId('delete-account-cancel'));

    expect(utils.queryByTestId('delete-account-input')).toBeNull();
    expect(utils.queryByTestId('delete-account-error')).toBeNull();

    open(utils);
    expect(utils.getByTestId('delete-account-input').props.value).toBe('');
    expect(isDisabled(utils, 'delete-account-confirm')).toBe(true);
    expect(utils.queryByTestId('delete-account-error')).toBeNull();
  });

  it('on success signs out through the auth client, which drops the local session', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: jest.fn() });
    const utils = await renderSignedIn();
    open(utils);
    type(utils, 'DELETE');

    fireEvent.press(utils.getByTestId('delete-account-confirm'));

    await waitFor(() => expect(utils.getByTestId('session').props.children).toBe('signed-out'));
    expect(authClient.signOut).toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/me');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ confirm: 'DELETE' });
  });

  it('shows progress and disables both buttons while the request runs', async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const utils = await renderSignedIn();
    open(utils);
    type(utils, 'DELETE');

    fireEvent.press(utils.getByTestId('delete-account-confirm'));

    await waitFor(() => expect(utils.getByTestId('delete-account-progress')).toBeTruthy());
    expect(isDisabled(utils, 'delete-account-confirm')).toBe(true);
    expect(isDisabled(utils, 'delete-account-cancel')).toBe(true);

    await act(async () => {
      resolve({ ok: true, status: 204, json: jest.fn() });
    });
  });

  it('ignores a second tap while the first request is in flight', async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const utils = await renderSignedIn();
    open(utils);
    type(utils, 'DELETE');

    const confirm = utils.getByTestId('delete-account-confirm');
    // Both presses land before React re-renders the button as disabled.
    fireEvent.press(confirm);
    fireEvent.press(confirm);
    await waitFor(() => expect(utils.getByTestId('delete-account-progress')).toBeTruthy());
    fireEvent.press(utils.getByTestId('delete-account-confirm'));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ ok: true, status: 204, json: jest.fn() });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('on a network failure shows a connection message, stays signed in and keeps the flow open for retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const utils = await renderSignedIn();
    open(utils);
    type(utils, 'DELETE');

    fireEvent.press(utils.getByTestId('delete-account-confirm'));

    const error = await utils.findByTestId('delete-account-error');
    expect(error).toHaveTextContent(/connection|reach/i);
    expect(utils.getByTestId('session').props.children).toBe('signed-in');
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect(utils.getByTestId('delete-account-input').props.value).toBe('DELETE');
    expect(isDisabled(utils, 'delete-account-confirm')).toBe(false);
    expect(utils.queryByTestId('delete-account-progress')).toBeNull();

    // Retry works.
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: jest.fn() });
    fireEvent.press(utils.getByTestId('delete-account-confirm'));
    await waitFor(() => expect(utils.getByTestId('session').props.children).toBe('signed-out'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('on a server error shows a server message (distinct from the network one) and stays signed in', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const utils = await renderSignedIn();
    open(utils);
    type(utils, 'DELETE');

    fireEvent.press(utils.getByTestId('delete-account-confirm'));

    const error = await utils.findByTestId('delete-account-error');
    expect(error).toHaveTextContent(/server/i);
    expect(error).not.toHaveTextContent(/connection/i);
    expect(utils.getByTestId('session').props.children).toBe('signed-in');
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect(utils.getByTestId('delete-account-input')).toBeTruthy();
  });
});
