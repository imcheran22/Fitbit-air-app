import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';

// The wind-down reminder: one daily local notification at bedtime minus the
// lead time, in device local time. No server job; it works with the coach off.
// The settings live on the device in SecureStore, like the character cache,
// and a keychain failure is never worth an error, so every read and write here
// swallows it.

const STORAGE_KEY = 'windDown';

// The reminder's `data.kind`, which the foreground handler and tap routing
// (notifications/handler.ts) key on. Defined here so this module stays free of
// navigation imports (AuthContext pulls it in).
export const WIND_DOWN_KIND = 'wind-down';

export type WindDownLead = 15 | 30 | 45 | 60;

export type WindDownSettings = {
  enabled: boolean;
  leadMinutes: WindDownLead;
  // "HH:MM", local time.
  bedtimeGoal: string | null;
  // The notification's title.
  coachName: string;
  // The scheduled notification, so it can be cancelled before the next one.
  notificationId: string | null;
};

const DEFAULTS: WindDownSettings = {
  enabled: false,
  leadMinutes: 30,
  bedtimeGoal: null,
  coachName: 'Mochi',
  notificationId: null,
};

const LEADS: readonly number[] = [15, 30, 45, 60];
const isLead = (value: unknown): value is WindDownLead => typeof value === 'number' && LEADS.includes(value);
const isHhMm = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function parse(raw: string | null): WindDownSettings {
  if (!raw) return DEFAULTS;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof WindDownSettings, unknown>>;
    if (typeof value.enabled !== 'boolean' || !isLead(value.leadMinutes)) return DEFAULTS;
    return {
      enabled: value.enabled,
      leadMinutes: value.leadMinutes,
      bedtimeGoal: isHhMm(value.bedtimeGoal) ? value.bedtimeGoal : null,
      coachName: typeof value.coachName === 'string' && value.coachName ? value.coachName : DEFAULTS.coachName,
      notificationId: typeof value.notificationId === 'string' ? value.notificationId : null,
    };
  } catch {
    return DEFAULTS;
  }
}

export async function readWindDown(): Promise<WindDownSettings> {
  try {
    return parse(await SecureStore.getItemAsync(STORAGE_KEY));
  } catch {
    return DEFAULTS;
  }
}

async function write(settings: WindDownSettings): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The reminder still fires; the switch reads off on the next launch.
  }
}

// Calls run one after another, so a foreground reschedule never interleaves
// with a switch change and leaves two reminders behind.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

// Bedtime minus the lead, wrapping past midnight ("00:15" - 30 -> 23:45).
export function reminderTime(bedtimeGoal: string, lead: number): { hour: number; minute: number } {
  const [h, m] = bedtimeGoal.split(':').map(Number);
  const total = (((h * 60 + m - lead) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

async function cancel(notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // Already gone, or no native module.
  }
}

// Cancels the stored reminder, then schedules the one these settings describe
// and stores them with its id. Throws when scheduling fails.
async function schedule(previous: string | null, settings: WindDownSettings & { bedtimeGoal: string }): Promise<void> {
  await cancel(previous);
  const { hour, minute } = reminderTime(settings.bedtimeGoal, settings.leadMinutes);
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: settings.coachName,
      body: `Wind-down time. Bed in ${settings.leadMinutes} min.`,
      data: { kind: WIND_DOWN_KIND },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
  await write({ ...settings, enabled: true, notificationId });
}

// Turns the reminder on. Reads the permission first: granted schedules with no
// prompt; not asked yet prompts; denied (now or before) never re-prompts, since
// iOS will not show the dialog again, and leaves the reminder off. Throws only
// when the native side fails to schedule.
export function enableWindDown(o: { bedtimeGoal: string; leadMinutes: WindDownLead; coachName: string }): Promise<'scheduled' | 'denied'> {
  return serial(async () => {
    const current = await readWindDown();
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.status !== 'denied') {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) {
      await cancel(current.notificationId);
      await write({ ...current, ...o, enabled: false, notificationId: null });
      return 'denied';
    }
    await schedule(current.notificationId, { ...current, ...o });
    return 'scheduled';
  });
}

export function disableWindDown(): Promise<void> {
  return serial(async () => {
    const current = await readWindDown();
    await cancel(current.notificationId);
    await write({ ...current, enabled: false, notificationId: null });
  });
}

// Stores the lead; while on, moves the reminder to match.
export function setWindDownLead(lead: WindDownLead): Promise<void> {
  return serial(async () => {
    const current = { ...(await readWindDown()), leadMinutes: lead };
    await write(current);
    if (current.enabled && current.bedtimeGoal) await scheduleBestEffort(current, current.bedtimeGoal);
  });
}

async function scheduleBestEffort(settings: WindDownSettings, bedtimeGoal: string): Promise<void> {
  try {
    await schedule(settings.notificationId, { ...settings, bedtimeGoal });
  } catch {
    // Tried again on the next return to the foreground.
  }
}

// Run on each return to the foreground: covers time-zone changes and the OS
// dropping the reminder. Does nothing while off. Never throws.
export function rescheduleWindDown(): Promise<void> {
  return serial(async () => {
    const current = await readWindDown();
    if (current.enabled && current.bedtimeGoal) await scheduleBestEffort(current, current.bedtimeGoal);
  });
}

// Session teardown (sign-out, account deletion): the reminder and its settings
// belong to the account. Never throws.
export function clearWindDown(): Promise<void> {
  return serial(async () => {
    const current = await readWindDown();
    await cancel(current.notificationId);
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch {
      // A stale entry is replaced by the next account's settings.
    }
  });
}
