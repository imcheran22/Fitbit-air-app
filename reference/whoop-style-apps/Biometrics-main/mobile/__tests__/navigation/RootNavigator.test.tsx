import React from 'react';
import { StyleSheet } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { apiFetch } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { syncTimezone } from '../../src/lib/timezone';
import { FONTS } from '../../src/theme';

jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext');
jest.mock('../../src/lib/timezone');

// The real native stack pulls in react-native-safe-area-context, which this
// project does not install. Stub the navigator down to "render whichever screen
// initialRouteName points at" — which is precisely what these tests assert.
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: any) => children,
  // RootNavigator hands the container a shared ref (navigation/navigationRef.ts).
  createNavigationContainerRef: () => ({ isReady: () => false, navigate: () => undefined, addListener: () => () => undefined }),
  DefaultTheme: { dark: false, colors: {}, fonts: {} },
  DarkTheme: { dark: true, colors: {}, fonts: {} },
}));
const mockRegisteredScreens: string[] = [];
// Each registered route's component, by name.
const mockScreenComponents: Record<string, unknown> = {};
// The last navigator's screenOptions, for its header.
const mockStack: { screenOptions?: any } = {};
jest.mock('@react-navigation/native-stack', () => {
  const ReactLib = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ initialRouteName, children, screenOptions }: any) => {
        mockStack.screenOptions = screenOptions;
        const screens = ReactLib.Children.toArray(children);
        mockRegisteredScreens.splice(0, mockRegisteredScreens.length, ...screens.map((child: any) => child.props.name));
        screens.forEach((child: any) => (mockScreenComponents[child.props.name] = child.props.component));
        const match = screens.find((child: any) => child.props.name === initialRouteName);
        return match ? ReactLib.createElement(match.props.component) : null;
      },
      Screen: () => null,
    }),
  };
});

jest.mock('../../src/screens/SignInScreen', () => {
  const { Text } = require('react-native');
  const ReactLib = require('react');
  return { SignInScreen: () => ReactLib.createElement(Text, null, 'SIGN_IN_SCREEN') };
});
jest.mock('../../src/screens/ConnectHealthScreen', () => {
  const { Text } = require('react-native');
  const ReactLib = require('react');
  return { ConnectHealthScreen: () => ReactLib.createElement(Text, null, 'CONNECT_SCREEN') };
});
jest.mock('../../src/navigation/TabsNavigator', () => {
  const { Text } = require('react-native');
  const ReactLib = require('react');
  return { TabsNavigator: () => ReactLib.createElement(Text, null, 'TABS_SCREEN') };
});

function signedIn(signed: boolean) {
  (useAuth as jest.Mock).mockReturnValue({
    session: signed ? { userId: 'u1', email: 'u1@example.com' } : null,
    signInWithApple: jest.fn(),
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RootNavigator', () => {
  it('shows the sign-in screen when there is no session', () => {
    signedIn(false);

    const { getByText } = render(<RootNavigator />);

    expect(getByText('SIGN_IN_SCREEN')).toBeTruthy();
    // Signed out, the app is the auth stack: sign-in plus the email screens.
    expect(mockRegisteredScreens).toEqual(['SignIn', 'SignUp', 'ForgotPassword', 'ResetPassword']);
    expect(syncTimezone).not.toHaveBeenCalled();
  });

  // A stored session is resolved asynchronously on launch. Until then the app
  // must not flash the sign-in stack, whose NavigationContainer would also
  // consume a cold-start deep link meant for the signed-in app.
  it('shows the loading view, not the sign-in screen, while the session is resolving', () => {
    (useAuth as jest.Mock).mockReturnValue({ session: null, isPending: true, signOut: jest.fn() });

    const { getByTestId, queryByText } = render(<RootNavigator />);

    expect(getByTestId('root-navigator-loading')).toBeTruthy();
    expect(queryByText('SIGN_IN_SCREEN')).toBeNull();
  });

  it('draws every stack header title in pixel caps, read out as written', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    // A title set with setOptions (ScoreDetail, MetricDetail) goes through the same renderer.
    const title = render(mockStack.screenOptions.headerTitle({ children: 'Sign-in methods', tintColor: 'rgb(1, 2, 3)' }));
    const text = title.getByText('SIGN-IN METHODS');
    expect(text.props.accessibilityRole).toBe('header');
    expect(text.props.accessibilityLabel).toBe('Sign-in methods');
    expect(StyleSheet.flatten(text.props.style)).toEqual({ color: 'rgb(1, 2, 3)', fontFamily: FONTS.pixel, fontSize: 15 });
  });

  it('syncs the time zone once on launch when authenticated', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    expect(syncTimezone).toHaveBeenCalledTimes(1);
  });

  it('checks for new badges to celebrate once signed in', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/me/achievements'));
  });

  // The old navigator hardcoded the connect screen, so an already-connected
  // user had no route back to their dashboard.
  // Connecting Google Health used to be a gate: a user who had not connected,
  // or whose status could not be read, saw the connect screen and nothing else.
  // Signing in now always lands on the tabs, and connecting is offered by the
  // dashboard's own prompt and from the Profile tab.
  it.each([
    ['connected', { status: 'CONNECTED', lastSyncedAt: null }],
    ['never connected', { status: 'NOT_CONNECTED', lastSyncedAt: null }],
    ['disconnected', { status: 'DISCONNECTED', lastSyncedAt: null }],
  ])('lands a %s user on the tabs', async (_label, status) => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue(status);

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
  });

  it('lands on the tabs even when the connection status cannot be read', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockRejectedValue(new Error('offline'));

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
  });

  it('does not block the first screen on a connection lookup', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockImplementation(() => new Promise(() => undefined));

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
  });

  it('registers the ScoreDetail route', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    expect(mockRegisteredScreens).toContain('ScoreDetail');
  });

  it('registers the Badges and BadgeDetail routes', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    expect(mockRegisteredScreens).toEqual(expect.arrayContaining(['Badges', 'BadgeDetail']));
  });

  it('registers the Patterns route', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    expect(mockRegisteredScreens).toContain('Patterns');
  });

  it('registers the Tabs route', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    expect(mockRegisteredScreens).toContain('Tabs');
  });

  it('registers the Trends route as the Metrics screen', async () => {
    signedIn(true);
    (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });

    const { getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());
    expect(mockScreenComponents.Trends).toBe(require('../../src/screens/MetricsScreen').MetricsScreen);
  });
});
