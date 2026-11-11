import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { StickerKind } from '../../api/buddies';
import { COLORS } from '../../theme';
import { Button, buttonTextVariants } from '../ui/button';
import { Text } from '../ui/text';

// A sticker tile: the standard outline Button in a tall vertical layout, big icon over its label.
export function StickerButton({ kind, label, icon, disabled, onPress }: {
  kind: StickerKind;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  return (
    <Button
      testID={`sticker-${kind}`}
      variant="outline"
      accessibilityLabel={`Send a ${label}`}
      disabled={disabled}
      onPress={onPress}
      className="h-auto flex-1 flex-col gap-[4px] py-[12px]"
    >
      <Ionicons name={icon} size={26} color={colors.accent} />
      <Text numberOfLines={1} className={buttonTextVariants({ variant: 'outline', size: 'xs' })}>{label}</Text>
    </Button>
  );
}
