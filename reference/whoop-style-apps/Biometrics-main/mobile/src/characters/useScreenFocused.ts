import { createContext, useContext, useEffect, useState, type Context } from 'react';
import { NavigationContext } from '@react-navigation/native';

// The parts of a screen's navigation object that components here use.
export type ScreenNavigation = {
  isFocused?: () => boolean;
  addListener?: (event: 'focus' | 'blur', callback: () => void) => () => void;
  navigate?: (name: string, params?: object) => void;
};

// Screen tests often replace @react-navigation/native with a stub that has no
// NavigationContext; read an empty context then, so this never throws.
const FallbackContext = createContext<ScreenNavigation | undefined>(undefined);
export const ScreenNavigationContext = (NavigationContext ?? FallbackContext) as Context<
  ScreenNavigation | undefined
>;

// Whether the screen this component sits in is focused. Characters pause off
// screen (spec §1, Performance): tabs and stacked screens stay mounted when
// hidden. Unlike useIsFocused it works outside a navigator, answering true.
export function useScreenFocused(): boolean {
  const navigation = useContext(ScreenNavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused?.() ?? true);

  useEffect(() => {
    if (!navigation?.addListener) return;
    setFocused(navigation.isFocused?.() ?? true);
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus?.();
      offBlur?.();
    };
  }, [navigation]);

  return focused;
}
