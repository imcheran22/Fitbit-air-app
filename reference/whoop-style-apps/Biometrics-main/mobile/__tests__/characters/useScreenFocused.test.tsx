import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { useScreenFocused } from '../../src/characters/useScreenFocused';

function fakeNavigation(initiallyFocused: boolean) {
  const listeners: Record<string, () => void> = {};
  const unsubscribe = jest.fn();
  const navigation = {
    isFocused: jest.fn(() => initiallyFocused),
    addListener: jest.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
      return unsubscribe;
    }),
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <NavigationContext.Provider value={navigation as never}>{children}</NavigationContext.Provider>
  );
  return { navigation, listeners, unsubscribe, wrapper };
}

describe('useScreenFocused', () => {
  it('is true outside a navigator', () => {
    const { result } = renderHook(() => useScreenFocused());

    expect(result.current).toBe(true);
  });

  it('is true for a navigation object with no focus API (a test stub)', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NavigationContext.Provider value={{ navigate: jest.fn() } as never}>{children}</NavigationContext.Provider>
    );
    const { result } = renderHook(() => useScreenFocused(), { wrapper });

    expect(result.current).toBe(true);
  });

  it('starts from isFocused() and follows blur and focus', () => {
    const { listeners, wrapper } = fakeNavigation(false);
    const { result } = renderHook(() => useScreenFocused(), { wrapper });
    expect(result.current).toBe(false);

    act(() => listeners.focus());
    expect(result.current).toBe(true);

    act(() => listeners.blur());
    expect(result.current).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const { unsubscribe, wrapper } = fakeNavigation(true);
    const { unmount } = renderHook(() => useScreenFocused(), { wrapper });

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});
