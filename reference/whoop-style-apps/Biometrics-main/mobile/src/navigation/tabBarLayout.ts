import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

export const TAB_ORDER = ['Home', 'Activity', 'Coach', 'Social', 'Profile'] as const;
export type TabName = (typeof TAB_ORDER)[number];

// The centre slot holds the coach character instead of an icon.
export const HUB_TAB: TabName = 'Coach';

export const TAB_LABELS: Record<string, string> = {
  Home: 'Home',
  Activity: 'Activity',
  Coach: 'AI coach',
  Social: 'Social',
  Profile: 'Profile',
};

// The quiet rounded rectangle: low enough to stay out of the way, tall enough
// for a 22 dp icon over its label and the 52 dp hub character.
export const FLOATING_BAR_HEIGHT = 62;
export const FLOATING_BAR_RADIUS = 18;
export const FLOATING_BAR_MARGIN = 12;

export function slotCenterX(index: number, innerWidth: number, count: number): number {
  return count > 0 ? (index + 0.5) * (innerWidth / count) : 0;
}

// The active-tab line springs between slots only once the bar has been measured
// before: the first measured layout places it directly, so it does not slide in
// from the left edge on mount. Reduced motion always snaps.
export function indicatorAnimates(previousInnerWidth: number, reduced: boolean): boolean {
  return previousInnerWidth > 0 && !reduced;
}

// The line sits over the active icon. The hub has the character instead, so the
// line hides there (and for any route we do not know).
export function activeIndicatorTarget(activeRouteName: string): { index: number; visible: boolean } {
  const index = (TAB_ORDER as readonly string[]).indexOf(activeRouteName);
  return { index: Math.max(0, index), visible: index >= 0 && activeRouteName !== HUB_TAB };
}

// How far screen content must be inset from the bottom so the floating bar does
// not cover it. Uses the context directly (not useSafeAreaInsets) so screens
// still render in tests, and anywhere else, without a SafeAreaProvider.
export function useTabBarClearance(): number {
  const insets = useContext(SafeAreaInsetsContext);
  return FLOATING_BAR_HEIGHT + Math.max(insets?.bottom ?? 0, FLOATING_BAR_MARGIN) + 16;
}
