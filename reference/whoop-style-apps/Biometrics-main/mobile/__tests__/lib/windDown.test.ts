import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import {
  clearWindDown,
  disableWindDown,
  enableWindDown,
  readWindDown,
  reminderTime,
  rescheduleWindDown,
  setWindDownLead,
} from '../../src/lib/windDown';

// An in-memory keychain, so what one call stores the next one reads.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStore.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockStore.delete(key)),
}));
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));

const N = Notifications as jest.Mocked<typeof Notifications>;
const GRANTED = { status: 'granted', granted: true } as never;
const UNDETERMINED = { status: 'undetermined', granted: false } as never;
const DENIED = { status: 'denied', granted: false } as never;
const ON = { bedtimeGoal: '23:00', leadMinutes: 30 as const, coachName: 'Mochi' };

let nextId = 0;
beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  nextId = 0;
  N.getPermissionsAsync.mockResolvedValue(GRANTED);
  N.scheduleNotificationAsync.mockImplementation(async () => `n${++nextId}`);
});

const stored = () => JSON.parse(mockStore.get('windDown') ?? 'null');

it('wraps the reminder time across midnight (Review Focus 2)', () => {
  expect(reminderTime('23:00', 30)).toEqual({ hour: 22, minute: 30 });
  expect(reminderTime('00:15', 30)).toEqual({ hour: 23, minute: 45 });
  expect(reminderTime('00:00', 60)).toEqual({ hour: 23, minute: 0 });
});

it('reads the defaults when nothing is stored, the entry is bad, or the keychain fails', async () => {
  const defaults = { enabled: false, leadMinutes: 30, bedtimeGoal: null, coachName: 'Mochi', notificationId: null };
  expect(await readWindDown()).toEqual(defaults);
  (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
  expect(await readWindDown()).toEqual(defaults);
  mockStore.set('windDown', 'not json');
  expect(await readWindDown()).toEqual(defaults);
  mockStore.set('windDown', JSON.stringify({ enabled: 'yes', leadMinutes: 20, bedtimeGoal: 7 }));
  expect(await readWindDown()).toEqual(defaults);
});

describe('permission', () => {
  it('already granted: schedules with no prompt', async () => {
    expect(await enableWindDown(ON)).toBe('scheduled');
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('not asked yet: asks, then schedules when granted', async () => {
    N.getPermissionsAsync.mockResolvedValue(UNDETERMINED);
    N.requestPermissionsAsync.mockResolvedValue(GRANTED);
    expect(await enableWindDown(ON)).toBe('scheduled');
    expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('already denied: never re-prompts and schedules nothing', async () => {
    N.getPermissionsAsync.mockResolvedValue(DENIED);
    expect(await enableWindDown(ON)).toBe('denied');
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect((await readWindDown()).enabled).toBe(false);
  });

  it('declined now: denied, nothing scheduled', async () => {
    N.getPermissionsAsync.mockResolvedValue(UNDETERMINED);
    N.requestPermissionsAsync.mockResolvedValue(DENIED);
    expect(await enableWindDown(ON)).toBe('denied');
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect((await readWindDown()).enabled).toBe(false);
  });

  it('denied after being on: cancels the old reminder and turns off', async () => {
    await enableWindDown(ON);
    N.getPermissionsAsync.mockResolvedValue(DENIED);
    expect(await enableWindDown(ON)).toBe('denied');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n1');
    expect(stored()).toMatchObject({ enabled: false, notificationId: null });
  });
});

it('schedules a daily wind-down at bedtime minus the lead and stores its id', async () => {
  await enableWindDown(ON);
  expect(N.scheduleNotificationAsync).toHaveBeenCalledWith({
    content: { title: 'Mochi', body: 'Wind-down time. Bed in 30 min.', data: { kind: 'wind-down' } },
    trigger: { type: 'daily', hour: 22, minute: 30 },
  });
  expect(stored()).toEqual({ enabled: true, leadMinutes: 30, bedtimeGoal: '23:00', coachName: 'Mochi', notificationId: 'n1' });
});

it('keeps one reminder: enabling again cancels the previous one', async () => {
  await enableWindDown(ON);
  await enableWindDown({ ...ON, bedtimeGoal: '22:30' });
  expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n1');
  expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  expect(stored().notificationId).toBe('n2');
});

it('setWindDownLead reschedules at bedtime minus the new lead', async () => {
  await enableWindDown(ON);
  await setWindDownLead(45);
  expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n1');
  expect(N.scheduleNotificationAsync).toHaveBeenLastCalledWith({
    content: { title: 'Mochi', body: 'Wind-down time. Bed in 45 min.', data: { kind: 'wind-down' } },
    trigger: { type: 'daily', hour: 22, minute: 15 },
  });
  expect(stored()).toMatchObject({ enabled: true, leadMinutes: 45, notificationId: 'n2' });
});

it('setWindDownLead only stores the lead while off', async () => {
  await setWindDownLead(15);
  expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect((await readWindDown()).leadMinutes).toBe(15);
});

it('disableWindDown cancels and stores enabled false', async () => {
  await enableWindDown(ON);
  await disableWindDown();
  expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n1');
  expect(stored()).toMatchObject({ enabled: false, notificationId: null, bedtimeGoal: '23:00' });
});

it('rescheduleWindDown does nothing while off', async () => {
  await rescheduleWindDown();
  expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
});

it('rescheduleWindDown cancels and schedules again from the stored settings', async () => {
  await enableWindDown(ON);
  await rescheduleWindDown();
  expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n1');
  expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  expect(stored().notificationId).toBe('n2');
});

it('rescheduleWindDown never throws when the native side fails', async () => {
  await enableWindDown(ON);
  N.scheduleNotificationAsync.mockRejectedValueOnce(new Error('native'));
  await expect(rescheduleWindDown()).resolves.toBeUndefined();
});

it('clearWindDown cancels and deletes the stored settings', async () => {
  await enableWindDown(ON);
  await clearWindDown();
  expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n1');
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('windDown');
  expect(mockStore.has('windDown')).toBe(false);
});

it('clearWindDown never throws when the native side fails', async () => {
  await enableWindDown(ON);
  N.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('native'));
  (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'));
  await expect(clearWindDown()).resolves.toBeUndefined();
});
