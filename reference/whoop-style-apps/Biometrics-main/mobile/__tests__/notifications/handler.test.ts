import * as Notifications from 'expo-notifications';
import {
  RECAP_PUSH_KIND,
  WIND_DOWN_KIND,
  installNotificationHandler,
  listenForNotificationTaps,
  routeInitialNotification,
} from '../../src/notifications/handler';
import { navigationRef } from '../../src/navigation/navigationRef';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));
jest.mock('../../src/navigation/navigationRef', () => ({
  navigationRef: { isReady: jest.fn(), navigate: jest.fn() },
}));

const N = Notifications as jest.Mocked<typeof Notifications>;
const ref = navigationRef as unknown as { isReady: jest.Mock; navigate: jest.Mock };
const notification = (data: Record<string, unknown>) => ({ request: { content: { data } } }) as never;
const response = (data: Record<string, unknown>) => ({ notification: notification(data), actionIdentifier: 'default' }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  ref.isReady.mockReturnValue(true);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('installNotificationHandler', () => {
  const handle = () => {
    installNotificationHandler();
    return N.setNotificationHandler.mock.calls[0][0]!.handleNotification;
  };

  it('shows wind-down reminders while the app is open', async () => {
    expect(await handle()(notification({ kind: WIND_DOWN_KIND }))).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it('keeps every other notification as before (not shown in the foreground)', async () => {
    const off = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    expect(await handle()(notification({ kind: 'weekly-recap' }))).toEqual(off);
    expect(await handle()(notification({}))).toEqual(off);
    expect(await handle()({ request: { content: { data: null } } } as never)).toEqual(off);
  });

  it('never throws when the native module is missing', () => {
    N.setNotificationHandler.mockImplementationOnce(() => {
      throw new Error('unavailable');
    });
    expect(() => installNotificationHandler()).not.toThrow();
  });
});

describe('routeInitialNotification (cold start)', () => {
  it('opens Sleep when the app was launched from a wind-down reminder', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: WIND_DOWN_KIND }));
    await routeInitialNotification();
    expect(ref.navigate).toHaveBeenCalledWith('Sleep', undefined, { pop: true });
  });

  it('does nothing for any other launch', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: 'weekly-recap' }));
    await routeInitialNotification();
    N.getLastNotificationResponseAsync.mockResolvedValue(null);
    await routeInitialNotification();
    N.getLastNotificationResponseAsync.mockRejectedValue(new Error('unavailable'));
    await routeInitialNotification();
    expect(ref.navigate).not.toHaveBeenCalled();
  });

  it('waits for the signed-in navigator to be ready', async () => {
    jest.useFakeTimers();
    ref.isReady.mockReturnValue(false);
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: WIND_DOWN_KIND }));
    const done = routeInitialNotification();
    await jest.advanceTimersByTimeAsync(300);
    expect(ref.navigate).not.toHaveBeenCalled();
    ref.isReady.mockReturnValue(true);
    await jest.advanceTimersByTimeAsync(100);
    await done;
    expect(ref.navigate).toHaveBeenCalledWith('Sleep', undefined, { pop: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('gives up after 5 s (signed out: the signed-in navigator never mounts)', async () => {
    jest.useFakeTimers();
    ref.isReady.mockReturnValue(false);
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: WIND_DOWN_KIND }));
    const done = routeInitialNotification();
    await jest.advanceTimersByTimeAsync(5000);
    await done;
    expect(jest.getTimerCount()).toBe(0);
    ref.isReady.mockReturnValue(true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(ref.navigate).not.toHaveBeenCalled();
  });

  it('stops waiting when aborted (unmount)', async () => {
    jest.useFakeTimers();
    ref.isReady.mockReturnValue(false);
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: WIND_DOWN_KIND }));
    const controller = new AbortController();
    const done = routeInitialNotification(controller.signal);
    await jest.advanceTimersByTimeAsync(200);
    controller.abort();
    await done;
    expect(jest.getTimerCount()).toBe(0);
    ref.isReady.mockReturnValue(true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(ref.navigate).not.toHaveBeenCalled();
  });
});

describe('listenForNotificationTaps (warm start)', () => {
  const remove = jest.fn();
  const tap = () => N.addNotificationResponseReceivedListener.mock.calls[0][0];
  beforeEach(() => {
    N.addNotificationResponseReceivedListener.mockReturnValue({ remove } as never);
  });

  it('opens Sleep when a wind-down reminder is tapped', async () => {
    listenForNotificationTaps();
    tap()(response({ kind: WIND_DOWN_KIND }));
    await Promise.resolve();
    expect(ref.navigate).toHaveBeenCalledWith('Sleep', undefined, { pop: true });
  });

  it('ignores taps on other notifications', async () => {
    listenForNotificationTaps();
    tap()(response({ kind: 'weekly-recap' }));
    await Promise.resolve();
    expect(ref.navigate).not.toHaveBeenCalled();
  });

  it('unsubscribes and cancels a pending wait', async () => {
    jest.useFakeTimers();
    ref.isReady.mockReturnValue(false);
    const stop = listenForNotificationTaps();
    tap()(response({ kind: WIND_DOWN_KIND }));
    stop();
    expect(remove).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    ref.isReady.mockReturnValue(true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(ref.navigate).not.toHaveBeenCalled();
  });

  it('never throws when the native module is missing', () => {
    N.addNotificationResponseReceivedListener.mockImplementationOnce(() => {
      throw new Error('unavailable');
    });
    expect(() => listenForNotificationTaps()()).not.toThrow();
  });
});

const RECAP_ID = '3f2c7a8e-1b2d-4c5e-9f00-0123456789ab';

describe('recap pushes', () => {
  // The push carries only the id: the story viewer opens at once and loads the recap itself. It
  // hands a month to its recap screen, and shows "isn't available" (404) or a retry.
  it('cold start: opens the story viewer for the recap that launched the app, straight away', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: RECAP_PUSH_KIND, recapId: RECAP_ID }));
    await routeInitialNotification();
    expect(ref.navigate).toHaveBeenCalledTimes(1);
    expect(ref.navigate).toHaveBeenCalledWith('RecapStory', { id: RECAP_ID }, { pop: true });
  });

  it('cold start: waits for the signed-in navigator first', async () => {
    jest.useFakeTimers();
    ref.isReady.mockReturnValue(false);
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: RECAP_PUSH_KIND, recapId: RECAP_ID }));
    const done = routeInitialNotification();
    await Promise.resolve();
    await Promise.resolve();
    expect(ref.navigate).not.toHaveBeenCalled();
    ref.isReady.mockReturnValue(true);
    jest.advanceTimersByTime(100);
    await done;
    expect(ref.navigate).toHaveBeenCalledWith('RecapStory', { id: RECAP_ID }, { pop: true });
  });

  it('warm start: a push tapped while the app runs opens the story viewer', async () => {
    const unsubscribe = listenForNotificationTaps();
    const listener = N.addNotificationResponseReceivedListener.mock.calls[0]![0];
    listener(response({ kind: RECAP_PUSH_KIND, recapId: RECAP_ID }));
    await Promise.resolve();
    expect(ref.navigate).toHaveBeenCalledWith('RecapStory', { id: RECAP_ID }, { pop: true });
    unsubscribe();
  });

  it('a stale id still opens the viewer, which says the recap is not available', async () => {
    const STALE = '00000000-0000-4000-8000-000000000000';
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: RECAP_PUSH_KIND, recapId: STALE }));
    await routeInitialNotification();
    expect(ref.navigate).toHaveBeenCalledWith('RecapStory', { id: STALE }, { pop: true });
  });

  it('ignores malformed recap data and other kinds, as before', async () => {
    for (const data of [{ kind: 'recap' }, { kind: 'recap', recapId: 'not-a-uuid' }, { kind: 'recap', recapId: 42 }, { kind: 'weekly_digest' }]) {
      N.getLastNotificationResponseAsync.mockResolvedValue(response(data));
      await routeInitialNotification();
    }
    const unsubscribe = listenForNotificationTaps();
    N.addNotificationResponseReceivedListener.mock.calls[0]![0](response({ kind: 'recap', recapId: 'x' }));
    unsubscribe();
    expect(ref.navigate).not.toHaveBeenCalled();
  });

  it('keeps a recap push hidden while the app is open, like every other push', async () => {
    installNotificationHandler();
    const handle = N.setNotificationHandler.mock.calls[0]![0]!.handleNotification;
    expect(await handle(notification({ kind: RECAP_PUSH_KIND, recapId: RECAP_ID }))).toEqual({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false });
  });
});

describe('buddy pushes', () => {
  const ID = '6a1f9f1e-0000-4000-8000-000000000001';
  const SHOWN = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false };
  const HIDDEN = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
  const handle = () => {
    installNotificationHandler();
    return N.setNotificationHandler.mock.calls.at(-1)![0]!.handleNotification;
  };

  it('show as a banner while the app is open; recap pushes still do not', async () => {
    for (const kind of ['buddy_sticker', 'buddy_request', 'buddy_paired', 'buddy_badge', 'dm_message']) {
      expect(await handle()(notification({ kind, refId: ID }))).toEqual(SHOWN);
    }
    expect(await handle()(notification({ kind: RECAP_PUSH_KIND, recapId: ID }))).toEqual(HIDDEN);
    expect(await handle()(notification({ kind: 'buddy_sticker', refId: 'nope' }))).toEqual(HIDDEN);
  });

  it("a tap opens the requests for a request, and the actor's thread for anything else", async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: 'buddy_request', refId: ID }));
    await routeInitialNotification();
    expect(ref.navigate).toHaveBeenLastCalledWith('ChatRequests', undefined, { pop: true });
    for (const kind of ['buddy_sticker', 'buddy_paired', 'buddy_badge', 'dm_message']) {
      N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind, refId: ID }));
      await routeInitialNotification();
      expect(ref.navigate).toHaveBeenLastCalledWith('ChatThread', { buddyId: ID }, { pop: true });
    }
  });

  it('ignores a buddy push with a malformed or missing refId', async () => {
    for (const data of [{ kind: 'buddy_badge', refId: 'x' }, { kind: 'buddy_badge' }]) {
      N.getLastNotificationResponseAsync.mockResolvedValue(response(data));
      await routeInitialNotification();
    }
    expect(ref.navigate).not.toHaveBeenCalled();
  });

  it('ignores other kinds and non-uuid ids, and never routes by any other field', async () => {
    const OTHER = '6a1f9f1e-0000-4000-8000-000000000002';
    for (const data of [
      { kind: 'buddy_mute', refId: ID },
      { kind: 'BUDDY_STICKER', refId: ID },
      { kind: 'buddy_sticker', refId: 42 },
      { kind: 'buddy_sticker', refId: `${ID} ` },
      { kind: 'buddy_sticker', buddyId: OTHER },
    ]) {
      N.getLastNotificationResponseAsync.mockResolvedValue(response(data));
      await routeInitialNotification();
    }
    expect(ref.navigate).not.toHaveBeenCalled();
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: 'buddy_sticker', refId: ID, buddyId: OTHER, tab: 'activity' }));
    await routeInitialNotification();
    expect(ref.navigate).toHaveBeenCalledTimes(1);
    expect(ref.navigate).toHaveBeenCalledWith('ChatThread', { buddyId: ID }, { pop: true });
  });

  it('a repeat request tap lands on Chats › Requests again', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: 'buddy_request', refId: ID }));
    await routeInitialNotification();
    await routeInitialNotification();
    expect(ref.navigate.mock.calls).toEqual([['ChatRequests', undefined, { pop: true }], ['ChatRequests', undefined, { pop: true }]]);
  });

  it('cold start: waits for the signed-in navigator first', async () => {
    jest.useFakeTimers();
    ref.isReady.mockReturnValue(false);
    N.getLastNotificationResponseAsync.mockResolvedValue(response({ kind: 'buddy_sticker', refId: ID }));
    const done = routeInitialNotification();
    await jest.advanceTimersByTimeAsync(300);
    expect(ref.navigate).not.toHaveBeenCalled();
    ref.isReady.mockReturnValue(true);
    await jest.advanceTimersByTimeAsync(100);
    await done;
    expect(ref.navigate).toHaveBeenCalledWith('ChatThread', { buddyId: ID }, { pop: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('warm start: a tap while the app runs opens the same places', async () => {
    N.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() } as never);
    const unsubscribe = listenForNotificationTaps();
    const listener = N.addNotificationResponseReceivedListener.mock.calls[0]![0];
    listener(response({ kind: 'buddy_paired', refId: ID }));
    await Promise.resolve();
    expect(ref.navigate).toHaveBeenLastCalledWith('ChatThread', { buddyId: ID }, { pop: true });
    listener(response({ kind: 'buddy_request', refId: ID }));
    await Promise.resolve();
    expect(ref.navigate).toHaveBeenLastCalledWith('ChatRequests', undefined, { pop: true });
    listener(response({ kind: 'buddy_badge', refId: 'x' }));
    await Promise.resolve();
    expect(ref.navigate).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
