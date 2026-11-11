import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';

// The theme is a manual toggle, not the OS setting, so "auto" would pick the
// wrong content colour: follow NativeWind's resolved scheme instead.
export function ThemedStatusBar() {
  const { colorScheme } = useColorScheme();
  return <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />;
}
