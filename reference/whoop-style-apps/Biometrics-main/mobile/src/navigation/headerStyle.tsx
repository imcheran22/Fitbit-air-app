import React from 'react';
import { Text } from 'react-native';
import { useColorScheme } from 'nativewind';
import { COLORS, FONTS } from '../theme';

// Native stack and tab headers sit outside NativeWind, so their title takes a
// real style: Silkscreen at 15 (spec §3).
export const HEADER_TITLE_SIZE = 15;

export function headerTitleStyle(color: string): { color: string; fontFamily: string; fontSize: number } {
  return { color, fontFamily: FONTS.pixel, fontSize: HEADER_TITLE_SIZE };
}

// The header title, drawn in caps so a pushed screen's header (BADGES,
// FORECAST) matches the in-page PageTitle. Like PageTitle, a screen reader
// hears the title as written: the caps are drawn here, never stored in the
// screen's title, which also keeps the back-button menu in normal case.
// Wire it as screenOptions.headerTitle: (props) => <HeaderTitle {...props} />.
export function HeaderTitle({ children, tintColor }: { children: string; tintColor?: string }) {
  const { colorScheme } = useColorScheme();
  const foreground = colorScheme === 'light' ? COLORS.light.foreground : COLORS.dark.foreground;
  return (
    <Text accessibilityRole="header" accessibilityLabel={children} numberOfLines={1} style={headerTitleStyle(tintColor ?? foreground)}>
      {children.toUpperCase()}
    </Text>
  );
}
