import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { apiFetch } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { syncTimezone } from '../../src/lib/timezone';
import { syncPushRegistration } from '../../src/lib/pushRegistration';

jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext');
// Inert in this file: DashboardScreen is mocked below, so the Recaps shelf never mounts here (kept per ruling F20).
jest.mock('../../src/api/recaps', () => ({ fetchRecaps: jest.fn(() => Promise.resolve([])), markRecapOpened: jest.fn() }));
jest.mock('../../src/lib/timezone');
jest.mock('../../src/lib/pushRegistration');

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: any) => children,
  // RootNavigator hands the container a shared ref (navigation/navigationRef.ts).
  createNavigationContainerRef: () => ({ isReady: () => false, navigate: () => undefined, addListener: () => () => undefined }),
  DefaultTheme: { dark: false, colors: {}, fonts: {} },
  DarkTheme: { dark: true, colors: {}, fonts: {} },
}));
// RootNavigator now pulls in TabsNavigator, and the real bottom-tabs calls
// createScreenFactory() in its module body -- an export the stub of
// '@react-navigation/native' above drops, so the suite threw at import time.
// Stubbed the same way TabsNavigator.test.tsx already does.
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: () => null,
    Screen: () => null,
  }),
}));
jest.mock('@react-navigation/native-stack', () => {
  const ReactLib = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ initialRouteName, children }: any) => {
        const screens = ReactLib.Children.toArray(children);
        const match = screens.find((child: any) => child.props.name === initialRouteName);
        return match ? ReactLib.createElement(match.props.component) : null;
      },
      Screen: () => null,
    }),
  };
});
jest.mock('../../src/screens/SignInScreen', () => ({ SignInScreen: () => null }));
jest.mock('../../src/screens/ConnectHealthScreen', () => ({ ConnectHealthScreen: () => null }));
jest.mock('../../src/screens/DashboardScreen', () => ({ DashboardScreen: () => null }));

function signedIn(signed: boolean) {
  (useAuth as jest.Mock).mockReturnValue({
    session: signed ? { userId: 'u1', email: 'u1@example.com' } : null,
    signOut: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED' });
});

describe('RootNavigator: push registration sync', () => {
  it('syncs the push registration once on launch when authenticated', async () => {
    signedIn(true);
    render(<RootNavigator />);

    await waitFor(() => expect(syncPushRegistration).toHaveBeenCalledTimes(1));
    expect(syncTimezone).toHaveBeenCalledTimes(1);
  });

  it('does not sync push when signed out', () => {
    signedIn(false);
    render(<RootNavigator />);
    expect(syncPushRegistration).not.toHaveBeenCalled();
  });
});
