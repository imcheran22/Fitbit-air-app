import React from 'react';
import { NavigationContext } from '@react-navigation/native';
import { renderHook } from '@testing-library/react-native';
import { refreshBuddies } from '../../src/lib/buddiesStore';
import { useRefreshBuddiesOnFocus } from '../../src/lib/useRefreshBuddiesOnFocus';

jest.mock('../../src/lib/buddiesStore', () => ({ refreshBuddies: jest.fn(() => Promise.resolve()) }));
const refresh = refreshBuddies as jest.Mock;

beforeEach(() => refresh.mockClear());

function fakeNavigation() {
  const focus = new Set<() => void>();
  const unsubscribe = jest.fn();
  const navigation = {
    addListener: jest.fn((_event: 'focus', cb: () => void) => {
      focus.add(cb);
      return () => {
        unsubscribe();
        focus.delete(cb);
      };
    }),
  };
  return { navigation, unsubscribe, fireFocus: () => focus.forEach((cb) => cb()) };
}

it('reloads on mount and on every focus, and stops listening on unmount', () => {
  const { navigation, unsubscribe, fireFocus } = fakeNavigation();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <NavigationContext.Provider value={navigation as never}>{children}</NavigationContext.Provider>
  );
  const { unmount } = renderHook(() => useRefreshBuddiesOnFocus(), { wrapper });
  expect(refresh).toHaveBeenCalledTimes(1);
  fireFocus();
  fireFocus();
  expect(refresh).toHaveBeenCalledTimes(3);
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  fireFocus();
  expect(refresh).toHaveBeenCalledTimes(3);
});

it('still loads once on mount outside a navigator', () => {
  renderHook(() => useRefreshBuddiesOnFocus());
  expect(refresh).toHaveBeenCalledTimes(1);
});
