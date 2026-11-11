import * as SecureStore from 'expo-secure-store';
import {
  syncTimezone,
  setTimezoneOverride,
  clearTimezoneOverride,
  getTimezoneState,
  listTimeZones,
  clearTimezoneState,
  timezoneSynced,
} from '../../src/lib/timezone';
import { updateTimezone } from '../../src/api/client';

jest.mock('expo-secure-store');
jest.mock('../../src/api/client');

// In-memory stand-in for the keychain so persistence across calls is real.
let store: Record<string, string>;
let deviceZone: string;
let dateTimeFormatSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  deviceZone = 'America/Los_Angeles';
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) => Promise.resolve(store[k] ?? null));
  (SecureStore.setItemAsync as jest.Mock).mockImplementation((k: string, v: string) => {
    store[k] = v;
    return Promise.resolve();
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation((k: string) => {
    delete store[k];
    return Promise.resolve();
  });
  (updateTimezone as jest.Mock).mockResolvedValue({ timezone: 'ok' });

  const RealDateTimeFormat = Intl.DateTimeFormat;
  dateTimeFormatSpy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(((...args: any[]) => {
    // Only the argument-less call reads the device zone; validation calls pass a zone.
    if (args.length === 0) return { resolvedOptions: () => ({ timeZone: deviceZone }) } as any;
    return new RealDateTimeFormat(...(args as [any, any]));
  }) as any);
});

afterEach(() => {
  dateTimeFormatSpy.mockRestore();
});

describe('syncTimezone', () => {
  it('sends the device zone on first run and remembers it', async () => {
    await syncTimezone();

    expect(updateTimezone).toHaveBeenCalledTimes(1);
    expect(updateTimezone).toHaveBeenCalledWith('America/Los_Angeles');
    expect(store.lastSyncedTimezone).toBe('America/Los_Angeles');
  });

  it('does not call the API when the zone is unchanged since the last successful send', async () => {
    await syncTimezone();
    await syncTimezone();

    expect(updateTimezone).toHaveBeenCalledTimes(1);
  });

  it('sends again when the device zone changes', async () => {
    await syncTimezone();
    deviceZone = 'Europe/London';
    await syncTimezone();

    expect(updateTimezone).toHaveBeenCalledTimes(2);
    expect(updateTimezone).toHaveBeenLastCalledWith('Europe/London');
    expect(store.lastSyncedTimezone).toBe('Europe/London');
  });

  it('swallows API failures without recording success, so the next launch retries', async () => {
    (updateTimezone as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(syncTimezone()).resolves.toBeUndefined();
    expect(store.lastSyncedTimezone).toBeUndefined();

    await syncTimezone();
    expect(updateTimezone).toHaveBeenCalledTimes(2);
    expect(store.lastSyncedTimezone).toBe('America/Los_Angeles');
    warn.mockRestore();
  });

  it('swallows storage failures', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('keychain locked'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(syncTimezone()).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('timezone override', () => {
  it('sends the override instead of the device zone and keeps it across launches', async () => {
    await setTimezoneOverride('Asia/Tokyo');
    expect(updateTimezone).toHaveBeenCalledWith('Asia/Tokyo');

    (updateTimezone as jest.Mock).mockClear();
    // A later launch on a device that reports a different zone must not revert the override.
    await syncTimezone();

    expect(updateTimezone).not.toHaveBeenCalled();
    expect(await getTimezoneState()).toEqual({ timezone: 'Asia/Tokyo', overridden: true });
  });

  it('retries an override that failed to send, still not reverting to the device zone', async () => {
    (updateTimezone as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await setTimezoneOverride('Asia/Tokyo');
    await syncTimezone();

    expect(updateTimezone).toHaveBeenCalledTimes(2);
    expect(updateTimezone).toHaveBeenLastCalledWith('Asia/Tokyo');
    warn.mockRestore();
  });

  it('rejects an unknown zone without persisting or calling the API', async () => {
    await expect(setTimezoneOverride('Not/AZone')).rejects.toThrow(/Invalid time zone/);

    expect(updateTimezone).not.toHaveBeenCalled();
    expect(await getTimezoneState()).toEqual({ timezone: 'America/Los_Angeles', overridden: false });
  });

  it('"Use device time zone" clears the override and sends the device zone', async () => {
    await setTimezoneOverride('Asia/Tokyo');
    (updateTimezone as jest.Mock).mockClear();

    await clearTimezoneOverride();

    expect(updateTimezone).toHaveBeenCalledWith('America/Los_Angeles');
    expect(await getTimezoneState()).toEqual({ timezone: 'America/Los_Angeles', overridden: false });

    // And from here the launch-time auto-sync follows the device again.
    (updateTimezone as jest.Mock).mockClear();
    deviceZone = 'Europe/Paris';
    await syncTimezone();
    expect(updateTimezone).toHaveBeenCalledWith('Europe/Paris');
  });
});

describe('listTimeZones', () => {
  it('returns a non-empty, sorted list that includes common IANA names', () => {
    const zones = listTimeZones();

    expect(zones.length).toBeGreaterThan(0);
    expect(zones).toContain('America/New_York');
    expect([...zones].sort()).toEqual(zones);
  });

  it('falls back to a built-in list when Intl.supportedValuesOf is unavailable', () => {
    const original = (Intl as any).supportedValuesOf;
    (Intl as any).supportedValuesOf = undefined;
    try {
      const zones = listTimeZones();
      expect(zones).toContain('America/New_York');
      expect(zones).toContain('UTC');
    } finally {
      (Intl as any).supportedValuesOf = original;
    }
  });
});

describe('timezoneSynced', () => {
  const flush = () => new Promise((r) => setImmediate(r));

  it('stays pending until a sync settles (sign-in), then resolves', async () => {
    // A sign-out re-arms it for the next account.
    await clearTimezoneState();
    let settled = false;
    void timezoneSynced().then(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);
    await syncTimezone();
    await flush();
    expect(settled).toBe(true);
  });

  it('resolves when the sync fails too', async () => {
    await clearTimezoneState();
    (updateTimezone as jest.Mock).mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await syncTimezone();
    await expect(timezoneSynced()).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
