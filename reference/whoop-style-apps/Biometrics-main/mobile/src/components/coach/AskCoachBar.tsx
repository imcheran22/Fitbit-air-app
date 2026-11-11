import React, { useContext } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../theme';
import { GlassSurface } from '../ui/glass-surface';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';
import { Character } from '../characters/Character';

// The one documented custom CTA (components/ui/README.md): a GlassSurface bar with the coach
// character, 8 px corners, pinned above the safe area. Used by Sleep and Recovery.
export function AskCoachBar({ label, onPress, focused }: { label: string; onPress: () => void; focused: boolean }) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  // Context, not the hook: tests render screens without a provider.
  const insets = useContext(SafeAreaInsetsContext);
  return (
    <View className="absolute bottom-0 left-0 right-0 px-5" style={{ paddingBottom: Math.max(insets?.bottom ?? 0, 16) }} pointerEvents="box-none">
      <PressableScale testID="ask-coach-button" accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
        <GlassSurface
          scheme={scheme === 'light' ? 'light' : 'dark'}
          fallbackColor={colors.surfaceRaised}
          borderRadius={8}
          style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.hairline }}
        >
          <Character testID="ask-coach-character" mood="idle" size={40} paused={!focused} />
          <Text className="flex-1 text-body font-semibold">{label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginRight: 8 }} />
        </GlassSurface>
      </PressableScale>
    </View>
  );
}
