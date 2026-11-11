import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useThemePreference } from '../../theme/ThemeProvider';
import { Button, buttonIconSize } from './button';

const ICON_BY_PREFERENCE = {
  system: 'phone-portrait-outline',
  light: 'sunny-outline',
  dark: 'moon-outline',
} as const;

export function ThemeToggle({ color }: { color: string }) {
  const { preference, cyclePreference } = useThemePreference();

  return (
    <Button testID="theme-toggle-button" variant="ghost" size="icon-sm" accessibilityLabel={`Theme: ${preference}. Tap to change`} onPress={cyclePreference}>
      <Ionicons name={ICON_BY_PREFERENCE[preference]} size={buttonIconSize('icon-sm')} color={color} />
    </Button>
  );
}
