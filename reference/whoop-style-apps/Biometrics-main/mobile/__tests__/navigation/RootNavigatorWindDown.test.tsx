import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { useAuth } from '../../src/auth/AuthContext';
import { navigationRef } from '../../src/navigation/navigationRef';
import { listenForNotificationTaps, routeInitialNotification } from '../../src/notifications/handler';
import { rescheduleWindDown } from '../../src/lib/windDown';

jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext');
jest.mock('../../src/lib/timezone');
jest.mock('../../src/lib/pushRegistration');
jest.mock('../../src/lib/windDown', () => ({ rescheduleWindDown: jest.fn(async () => undefined) }));
jest.mock('../../src/notifications/handler', () => ({
  routeInitialNotification: jest.fn(async () => undefined),
  listenForNotificationTaps: jest.fn(),
}));
jest.mock('../../src/navigation/navigationRef', () => ({ navigationRef: { isReady: () => false } }));

// The container records the ref it was handed.
const mockContainerRefs: unknown[] = [];
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children, ...props }: any) => {
    mockContainerRefs.push(props.ref);
    return children;
  },
  DefaultTheme: { dark: false, colors: {}, fonts: {} },
  DarkTheme: { dark: true, colors: {}, fonts: {} },
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
jest.mock('../../src/navigation/AuthNavigator', () => ({ AuthNavigator: () => null }));
// Pass-throughs: the sync provider fetches and listens to AppState itself.
jest.mock('../../src/sync/SyncProvider', () => ({ SyncProvider: ({ children }: any) => children }));
// The badge celebration listens to AppState too (its own suite covers it); this one records one listener.
jest.mock('../../src/components/achievements/CelebrationHost', () => ({ CelebrationHost: () => null }));
// So does the shared buddies store scope.
jest.mock('../../src/components/buddies/BuddiesStoreScope', () => ({ BuddiesStoreScope: () => null }));
// And the shared Social store scope.
jest.mock('../../src/components/social/SocialStoreScope', () => ({ SocialStoreScope: () => null }));

const stopListening = jest.fn();
let appStateListener: ((state: string) => void) | undefined;
const removeAppState = jest.fn();

function signedIn(signed: boolean) {
  (useAuth as jest.Mock).mockReturnValue({
    session: signed ? { userId: 'u1', email: 'u1@example.com' } : null,
    isPending: false,
    signOut: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockContainerRefs.length = 0;
  (listenForNotificationTaps as jest.Mock).mockReturnValue(stopListening);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: string) => void;
    return { remove: removeAppState } as never;
  });
});

it('hands the shared navigation ref to the signed-in container', () => {
  signedIn(true);
  render(<RootNavigator />);
  expect(mockContainerRefs.at(-1)).toBe(navigationRef);
});

it('routes a cold-start reminder tap and listens for warm taps, cleaning both up on unmount', () => {
  signedIn(true);
  const { unmount } = render(<RootNavigator />);
  expect(routeInitialNotification).toHaveBeenCalledTimes(1);
  const signal = (routeInitialNotification as jest.Mock).mock.calls[0][0] as AbortSignal;
  expect(signal.aborted).toBe(false);
  expect(listenForNotificationTaps).toHaveBeenCalledTimes(1);
  unmount();
  expect(signal.aborted).toBe(true);
  expect(stopListening).toHaveBeenCalled();
});

// A cold launch never sees an AppState change to 'active', so a reminder the
// OS dropped while the app was not running is restored at mount.
it('reschedules the reminder once at mount', () => {
  signedIn(true);
  render(<RootNavigator />);
  expect(rescheduleWindDown).toHaveBeenCalledTimes(1);
});

it('reschedules the reminder each time the app comes back to the foreground', () => {
  signedIn(true);
  const { unmount } = render(<RootNavigator />);
  (rescheduleWindDown as jest.Mock).mockClear();
  act(() => appStateListener?.('background'));
  expect(rescheduleWindDown).not.toHaveBeenCalled();
  act(() => appStateListener?.('active'));
  expect(rescheduleWindDown).toHaveBeenCalledTimes(1);
  unmount();
  expect(removeAppState).toHaveBeenCalled();
});
