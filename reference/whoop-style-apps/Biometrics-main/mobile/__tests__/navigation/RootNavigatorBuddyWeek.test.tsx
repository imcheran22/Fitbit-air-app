import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { RootNavigator } from '../../src/navigation/RootNavigator';
import { useAuth } from '../../src/auth/AuthContext';
import { fetchBuddyWeek, sendSticker } from '../../src/api/buddies';

jest.mock('../../src/api/client');
jest.mock('../../src/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../src/lib/timezone');
jest.mock('../../src/lib/pushRegistration', () => ({ syncPushRegistration: jest.fn(async () => undefined) }));
jest.mock('../../src/lib/windDown', () => ({ rescheduleWindDown: jest.fn(async () => undefined) }));
jest.mock('../../src/notifications/handler', () => ({
  routeInitialNotification: jest.fn(async () => undefined),
  listenForNotificationTaps: jest.fn(() => () => undefined),
}));
jest.mock('../../src/navigation/navigationRef', () => ({ navigationRef: { isReady: () => false } }));
jest.mock('../../src/api/buddies', () => ({
  ...jest.requireActual('../../src/api/buddies'),
  fetchBuddyWeek: jest.fn(),
  sendSticker: jest.fn(),
}));
jest.mock('../../src/lib/buddiesStore', () => ({ refreshBuddies: jest.fn() }));
// The real router and hooks (BuddyWeekScreen reads its params through them); RootNavigator's own
// container is a pass-through, since its stack is only recorded below.
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  NavigationContainer: ({ children }: any) => children,
}));
jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({ Navigator: () => null, Screen: () => null }),
}));
// Records each Stack.Screen's props as RootNavigator declares them.
const mockScreens: Record<string, any> = {};
jest.mock('@react-navigation/native-stack', () => {
  const ReactLib = require('react');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }: any) => {
        for (const child of ReactLib.Children.toArray(children) as any[]) mockScreens[child.props.name] = child.props;
        return null;
      },
      Screen: () => null,
    }),
  };
});
jest.mock('../../src/navigation/AuthNavigator', () => ({ AuthNavigator: () => null }));
jest.mock('../../src/navigation/TabsNavigator', () => ({ TabsNavigator: () => null }));
jest.mock('../../src/sync/SyncProvider', () => ({ SyncProvider: ({ children }: any) => children }));
jest.mock('../../src/components/achievements/CelebrationHost', () => ({ CelebrationHost: () => null }));
jest.mock('../../src/components/buddies/BuddiesStoreScope', () => ({ BuddiesStoreScope: () => null }));
jest.mock('../../src/components/social/SocialStoreScope', () => ({ SocialStoreScope: () => null }));

const nav = jest.requireActual('@react-navigation/native');

// A minimal stack on the real StackRouter that renders the focused route: the BuddyWeek screen
// below is RootNavigator's own declaration (component and getId), so the router decides what a
// navigate to another buddy does exactly as the app's stack would.
function TestStack({ id, initialRouteName, children }: any) {
  const { state, descriptors, NavigationContent } = nav.useNavigationBuilder(nav.StackRouter, { id, initialRouteName, children });
  return <NavigationContent>{descriptors[state.routes[state.index].key].render()}</NavigationContent>;
}
const Stack = nav.createNavigatorFactory(TestStack)();
const Home = () => <Text>HOME</Text>;

const week = (id: string, name: string) => ({
  buddy: { id, handle: name.toLowerCase(), displayName: name, coachId: 'pengu' },
  mood: 'good',
  moodLine: `${name} is well rested today`,
  muted: false,
  tiles: [],
  shares: [],
  numbers: {},
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

function buddyWeekDeclaration() {
  (useAuth as jest.Mock).mockReturnValue({ session: { userId: 'u1', email: 'u1@example.com' }, isPending: false, signOut: jest.fn() });
  const { unmount } = render(<RootNavigator />);
  unmount();
  return mockScreens.BuddyWeek;
}

beforeEach(() => jest.clearAllMocks());

it('gives each buddy their own BuddyWeek: a late answer for A never shows on B, and back returns to A', async () => {
  const declared = buddyWeekDeclaration();
  expect(declared).toBeDefined();
  const ref = nav.createNavigationContainerRef();
  const lateA = deferred<ReturnType<typeof week>>();
  (fetchBuddyWeek as jest.Mock).mockImplementation((id: string) =>
    id === 'A' && (fetchBuddyWeek as jest.Mock).mock.calls.length === 1 ? lateA.promise : Promise.resolve(id === 'A' ? week('A', 'Alex') : week('B', 'Bea')),
  );
  render(
    <nav.NavigationContainer ref={ref}>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen {...declared} />
      </Stack.Navigator>
    </nav.NavigationContainer>,
  );

  act(() => ref.navigate('BuddyWeek', { buddyId: 'A' }));
  expect(fetchBuddyWeek).toHaveBeenLastCalledWith('A');
  // A push tap while A's week is still loading opens B.
  act(() => ref.navigate('BuddyWeek', { buddyId: 'B' }));
  expect(await screen.findByTestId('buddy-week-line')).toHaveTextContent('Bea is well rested today');
  expect(fetchBuddyWeek).toHaveBeenLastCalledWith('B');
  await act(async () => lateA.resolve(week('A', 'Alex')));
  expect(screen.getByTestId('buddy-week-line')).toHaveTextContent('Bea is well rested today');

  (sendSticker as jest.Mock).mockResolvedValue({ id: 's1' });
  await act(async () => fireEvent.press(screen.getByTestId('sticker-STAR')));
  expect(sendSticker).toHaveBeenCalledWith('B', 'STAR');

  act(() => ref.goBack());
  expect(await screen.findByTestId('buddy-week-line')).toHaveTextContent('Alex is well rested today');
  expect(fetchBuddyWeek).toHaveBeenLastCalledWith('A');
});

it("BuddyWeek's getId never throws on a route without params", () => {
  const { getId } = buddyWeekDeclaration();
  expect(getId({ params: { buddyId: 'A' } })).toBe('A');
  expect(() => getId({ params: undefined })).not.toThrow();
  expect(getId({ params: undefined })).toBeUndefined();
});
