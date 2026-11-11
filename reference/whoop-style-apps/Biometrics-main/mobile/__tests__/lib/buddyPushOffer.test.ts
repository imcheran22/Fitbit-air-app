import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { offerPushAfterPairing } from '../../src/lib/buddyPushOffer';
import { enablePush, getPushState } from '../../src/lib/pushRegistration';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
  };
});
jest.mock('../../src/lib/pushRegistration', () => ({ getPushState: jest.fn(), enablePush: jest.fn() }));

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  (getPushState as jest.Mock).mockResolvedValue({ status: 'off' });
  (enablePush as jest.Mock).mockResolvedValue({ status: 'on' });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => alert.mockRestore());

const pressTurnOn = () => (alert.mock.calls[0]![2] as Array<{ text: string; onPress?: () => void }>).find((b) => b.text === 'Turn on')!.onPress!();

it('offers once when push is off; "Turn on" runs enablePush; never again after that', async () => {
  await offerPushAfterPairing();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(enablePush).not.toHaveBeenCalled();
  pressTurnOn();
  expect(enablePush).toHaveBeenCalledTimes(1);
  await offerPushAfterPairing();
  expect(alert).toHaveBeenCalledTimes(1);
});

it('"Not now" also counts as offered', async () => {
  await offerPushAfterPairing();
  await offerPushAfterPairing();
  expect(alert).toHaveBeenCalledTimes(1);
  expect(enablePush).not.toHaveBeenCalled();
});

it('overlapping calls show one offer', async () => {
  await Promise.all([offerPushAfterPairing(), offerPushAfterPairing()]);
  expect(alert).toHaveBeenCalledTimes(1);
});

it.each(['on', 'denied', 'unavailable', 'error'])('never offers when push is %s, and does not ask on a later pairing either', async (status) => {
  (getPushState as jest.Mock).mockResolvedValue({ status });
  await offerPushAfterPairing();
  (getPushState as jest.Mock).mockResolvedValue({ status: 'off' });
  await offerPushAfterPairing();
  expect(alert).not.toHaveBeenCalled();
  expect(enablePush).not.toHaveBeenCalled();
});

it('shows nothing when the device storage fails (never risks asking twice)', async () => {
  (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
  await expect(offerPushAfterPairing()).resolves.toBeUndefined();
  (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
  await expect(offerPushAfterPairing()).resolves.toBeUndefined();
  expect(alert).not.toHaveBeenCalled();
});
