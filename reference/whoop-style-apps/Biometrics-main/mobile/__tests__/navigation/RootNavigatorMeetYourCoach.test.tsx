import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { apiFetch } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { syncTimezone } from '../../src/lib/timezone';

jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext');
jest.mock('../../src/lib/timezone');

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: any) => children,
  // RootNavigator hands the container a shared ref (navigation/navigationRef.ts).
  createNavigationContainerRef: () => ({ isReady: () => false, navigate: () => undefined, addListener: () => () => undefined }),
  DefaultTheme: { dark: false, colors: {}, fonts: {} },
  DarkTheme: { dark: true, colors: {}, fonts: {} },
}));
const mockScreens: Record<string, any> = {};
jest.mock('@react-navigation/native-stack', () => {
  const ReactLib = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ initialRouteName, children }: any) => {
        const screens = ReactLib.Children.toArray(children);
        for (const child of screens) mockScreens[child.props.name] = child.props;
        const match = screens.find((child: any) => child.props.name === initialRouteName);
        return match ? ReactLib.createElement(match.props.component) : null;
      },
      Screen: () => null,
    }),
  };
});

jest.mock('../../src/navigation/TabsNavigator', () => {
  const { Text } = require('react-native');
  const ReactLib = require('react');
  return { TabsNavigator: () => ReactLib.createElement(Text, null, 'TABS_SCREEN') };
});

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ session: { userId: 'u1', email: 'u1@example.com' }, signOut: jest.fn() });
  (apiFetch as jest.Mock).mockResolvedValue({ status: 'CONNECTED', lastSyncedAt: null });
  (syncTimezone as jest.Mock).mockResolvedValue(undefined);
});

describe('RootNavigator: Meet your coach route', () => {
  it('registers MeetYourCoach as a headerless modal', async () => {
    const { getByText } = render(<RootNavigator />);
    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());

    const screen = mockScreens.MeetYourCoach;
    expect(screen).toBeDefined();
    expect(screen.options({ route: { params: { mode: 'switch' } } })).toEqual({ headerShown: false, presentation: 'modal', gestureEnabled: true });
  });

  it('cannot be swiped away on the first visit', async () => {
    const { getByText } = render(<RootNavigator />);
    await waitFor(() => expect(getByText('TABS_SCREEN')).toBeTruthy());

    expect(mockScreens.MeetYourCoach.options({ route: { params: { mode: 'first' } } }).gestureEnabled).toBe(false);
  });
});
