import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getPushState, enablePush, disablePush, syncPushRegistration } from '../../src/lib/pushRegistration';
import { apiFetch } from '../../src/api/client';
import { fetchCoachStatus } from '../../src/api/coach';

jest.mock('expo-secure-store');
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-123' } } }, easConfig: undefined },
}));
jest.mock('../../src/api/client');
jest.mock('../../src/api/coach');

const perms = Notifications.getPermissionsAsync as jest.Mock;
const requestPerms = Notifications.requestPermissionsAsync as jest.Mock;
const getToken = Notifications.getExpoPushTokenAsync as jest.Mock;
const api = apiFetch as jest.Mock;
const constants = Constants as any;

const TOKEN_A = 'ExponentPushToken[aaaa]';
const TOKEN_B = 'ExponentPushToken[bbbb]';

let store: Record<string, string>;

function permission(status: 'granted' | 'denied' | 'undetermined') {
  return { status, granted: status === 'granted', canAskAgain: status !== 'denied', expires: 'never' };
}

function postCalls() {
  return api.mock.calls.filter(([path, init]) => path === '/me/push-token' && init?.method === 'POST');
}
function deleteCalls() {
  return api.mock.calls.filter(([path, init]) => path === '/me/push-token' && init?.method === 'DELETE');
}

beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) => Promise.resolve(store[k] ?? null));
  (SecureStore.setItemAsync as jest.Mock).mockImplementation((k: string, v: string) => {
    store[k] = v;
    return Promise.resolve();
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation((k: string) => {
    delete store[k];
    return Promise.resolve();
  });
  constants.expoConfig = { extra: { eas: { projectId: 'proj-123' } } };
  constants.easConfig = undefined;
  perms.mockResolvedValue(permission('granted'));
  requestPerms.mockResolvedValue(permission('granted'));
  getToken.mockResolvedValue({ type: 'expo', data: TOKEN_A });
  api.mockResolvedValue(undefined);
  (fetchCoachStatus as jest.Mock).mockResolvedValue({ enabled: true, consented: true });
  Platform.OS = 'ios';
});

describe('enablePush', () => {
  it('requests permission when undetermined, registers the Expo token and persists it', async () => {
    perms.mockResolvedValue(permission('undetermined'));

    const state = await enablePush();

    expect(requestPerms).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith({ projectId: 'proj-123' });
    expect(postCalls()).toHaveLength(1);
    const [, init] = postCalls()[0];
    expect(JSON.parse(init.body)).toEqual({ token: TOKEN_A, platform: 'ios' });
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(Object.values(store)).toContain(TOKEN_A);
    expect(state).toEqual({ status: 'on' });
  });

  it('does not prompt when permission is already granted', async () => {
    await enablePush();
    expect(requestPerms).not.toHaveBeenCalled();
    expect(postCalls()).toHaveLength(1);
  });

  it('reports the platform the app runs on', async () => {
    Platform.OS = 'android';
    await enablePush();
    expect(JSON.parse(postCalls()[0][1].body).platform).toBe('android');
  });

  it('reports denied without prompting again once permission was denied', async () => {
    perms.mockResolvedValue(permission('denied'));

    const state = await enablePush();

    expect(requestPerms).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
    expect(state.status).toBe('denied');
  });

  it('reports denied when the user refuses the system prompt', async () => {
    perms.mockResolvedValue(permission('undetermined'));
    requestPerms.mockResolvedValue(permission('denied'));

    const state = await enablePush();

    expect(state.status).toBe('denied');
    expect(getToken).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it('is unavailable, with a reason, when there is no EAS projectId', async () => {
    constants.expoConfig = { extra: {} };

    const state = await enablePush();

    expect(state.status).toBe('unavailable');
    expect(state.reason).toMatch(/project/i);
    expect(requestPerms).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it('falls back to easConfig.projectId', async () => {
    constants.expoConfig = { extra: {} };
    constants.easConfig = { projectId: 'from-eas' };

    await enablePush();

    expect(getToken).toHaveBeenCalledWith({ projectId: 'from-eas' });
  });

  it('is unavailable when token acquisition throws (simulator, missing entitlement, network)', async () => {
    getToken.mockRejectedValue(new Error('no aps-environment entitlement'));

    const state = await enablePush();

    expect(state.status).toBe('unavailable');
    expect(state.reason).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('is unavailable when the permission calls throw', async () => {
    perms.mockRejectedValue(new Error('native module missing'));
    const state = await enablePush();
    expect(state.status).toBe('unavailable');
  });

  it('reports an error, and stores nothing, when the server rejects the registration', async () => {
    api.mockRejectedValue(new Error('offline'));

    const state = await enablePush();

    expect(state.status).toBe('error');
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('is unavailable on platforms other than iOS and Android', async () => {
    Platform.OS = 'web';
    const state = await enablePush();
    expect(state.status).toBe('unavailable');
    expect(api).not.toHaveBeenCalled();
  });
});

describe('disablePush', () => {
  it('deletes the stored token on the server and clears it locally', async () => {
    await enablePush();
    api.mockClear();

    const state = await disablePush();

    expect(deleteCalls()).toHaveLength(1);
    expect(JSON.parse(deleteCalls()[0][1].body)).toEqual({ token: TOKEN_A });
    expect(Object.keys(store)).toHaveLength(0);
    expect(state.status).toBe('off');
  });

  it('clears the token locally even when the DELETE fails', async () => {
    await enablePush();
    api.mockRejectedValue(new Error('offline'));

    const state = await disablePush();

    expect(Object.keys(store)).toHaveLength(0);
    expect(state.status).toBe('off');
  });

  it('does nothing over the network when no token is stored', async () => {
    const state = await disablePush();
    expect(api).not.toHaveBeenCalled();
    expect(state.status).toBe('off');
  });
});

describe('getPushState', () => {
  it('is off when nothing is registered', async () => {
    perms.mockResolvedValue(permission('undetermined'));
    expect(await getPushState()).toEqual({ status: 'off' });
    expect(requestPerms).not.toHaveBeenCalled();
  });

  it('is on when a token is stored and permission is still granted', async () => {
    await enablePush();
    expect(await getPushState()).toEqual({ status: 'on' });
  });

  it('is denied when permission is denied, and never prompts', async () => {
    perms.mockResolvedValue(permission('denied'));
    expect((await getPushState()).status).toBe('denied');
    expect(requestPerms).not.toHaveBeenCalled();
  });

  it('is denied (not on) when a token is stored but the user later blocked notifications', async () => {
    await enablePush();
    perms.mockResolvedValue(permission('denied'));
    expect((await getPushState()).status).toBe('denied');
  });

  it('is unavailable when there is no projectId', async () => {
    constants.expoConfig = { extra: {} };
    const state = await getPushState();
    expect(state.status).toBe('unavailable');
  });

  it('is unavailable rather than throwing when the permission query throws', async () => {
    perms.mockRejectedValue(new Error('boom'));
    expect((await getPushState()).status).toBe('unavailable');
  });
});

describe('syncPushRegistration', () => {
  it('does nothing when push was never enabled', async () => {
    await syncPushRegistration();
    expect(getToken).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
    expect(fetchCoachStatus).not.toHaveBeenCalled();
  });

  it('does not POST again when the token is unchanged', async () => {
    await enablePush();
    api.mockClear();

    await syncPushRegistration();

    expect(getToken).toHaveBeenCalled();
    expect(postCalls()).toHaveLength(0);
  });

  it('re-registers and persists a changed token', async () => {
    await enablePush();
    api.mockClear();
    getToken.mockResolvedValue({ type: 'expo', data: TOKEN_B });

    await syncPushRegistration();

    expect(postCalls()).toHaveLength(1);
    expect(JSON.parse(postCalls()[0][1].body)).toEqual({ token: TOKEN_B, platform: 'ios' });
    expect(Object.values(store)).toContain(TOKEN_B);
    expect(Object.values(store)).not.toContain(TOKEN_A);
  });

  it('keeps the old token so the next launch retries when re-registration fails', async () => {
    await enablePush();
    getToken.mockResolvedValue({ type: 'expo', data: TOKEN_B });
    api.mockRejectedValue(new Error('offline'));

    await expect(syncPushRegistration()).resolves.toBeUndefined();

    expect(Object.values(store)).toContain(TOKEN_A);
  });

  it('re-registers a changed token with the coach off: tokens are app-level', async () => {
    await enablePush();
    api.mockClear();
    getToken.mockResolvedValue({ type: 'expo', data: TOKEN_B });
    (fetchCoachStatus as jest.Mock).mockResolvedValue({ enabled: false, consented: false });

    await syncPushRegistration();

    expect(postCalls()).toHaveLength(1);
    expect(JSON.parse(postCalls()[0]![1].body)).toEqual({ token: TOKEN_B, platform: 'ios' });
    expect(fetchCoachStatus).not.toHaveBeenCalled();
  });

  it('never prompts for permission and skips when notifications were blocked', async () => {
    await enablePush();
    api.mockClear();
    getToken.mockClear();
    perms.mockResolvedValue(permission('denied'));

    await syncPushRegistration();

    expect(requestPerms).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it('swallows token acquisition failures', async () => {
    await enablePush();
    getToken.mockRejectedValue(new Error('no entitlement'));
    await expect(syncPushRegistration()).resolves.toBeUndefined();
  });
});
