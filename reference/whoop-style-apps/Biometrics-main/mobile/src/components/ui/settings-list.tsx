import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { COLORS } from '../../theme';
import { cn, withAlpha } from '../../lib/utils';
import { SectionLabel } from './section-label';
import { Text } from './text';

// The iOS grouped-list pattern for Profile: a small caps label over one
// rounded group, rows separated by hairlines that start after the icon.
export function SettingsGroup({ label, footer, children, testID }: { label?: string; footer?: string; children: React.ReactNode; testID?: string }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View testID={testID} className="gap-2">
      {label ? <SectionLabel className="px-4">{label}</SectionLabel> : null}
      <View className="overflow-hidden rounded-card border border-border bg-card">
        {rows.map((row, i) => (
          <View key={i} className={i > 0 ? 'border-t border-border' : ''}>
            {row}
          </View>
        ))}
      </View>
      {footer ? <Text className="px-4 text-caption text-muted-foreground">{footer}</Text> : null}
    </View>
  );
}

interface SettingsRowProps {
  title: string;
  subtitle?: string;
  subtitleTestID?: string;
  value?: string;
  valueTestID?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  // Drawn in place of the icon tile (the Your coach row's character).
  leading?: React.ReactNode;
  // A token colour for the icon tile (the tile is that colour at low alpha).
  tint?: string;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  // Anything drawn at the trailing edge in place of value + chevron (a Switch).
  trailing?: React.ReactNode;
  accessibilityRole?: 'button' | 'radio';
  // Replaces the default reading (the row's text) when that reads badly.
  accessibilityLabel?: string;
  accessibilityHint?: string;
  selected?: boolean;
  testID?: string;
}

export function SettingsRow({
  title,
  subtitle,
  subtitleTestID,
  value,
  valueTestID,
  icon,
  leading,
  tint,
  onPress,
  disabled,
  destructive,
  trailing,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  selected,
  testID,
}: SettingsRowProps) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const iconColor = destructive ? colors.scorePoor : tint ?? colors.accent;

  const body = (
    <View className="min-h-[56px] flex-row items-center gap-3 px-4 py-3">
      {leading ?? (icon ? (
        <View className="h-8 w-8 items-center justify-center rounded-[10px]" style={{ backgroundColor: withAlpha(iconColor, 0.16) }}>
          <Ionicons name={icon} size={17} color={iconColor} />
        </View>
      ) : null)}
      <View className="flex-1 gap-0.5">
        <Text className={cn('text-body', destructive ? 'text-destructive' : '', selected ? 'font-semibold' : '')}>{title}</Text>
        {subtitle ? (
          <Text testID={subtitleTestID} className="text-caption text-muted-foreground">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (
        <>
          {value ? (
            <Text testID={valueTestID} className="max-w-[55%] text-right text-caption text-muted-foreground" numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {onPress && !destructive && accessibilityRole === 'button' ? (
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          ) : null}
        </>
      )}
    </View>
  );

  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={
        accessibilityRole === 'radio'
          ? { selected: !!selected }
          : { disabled: !!disabled, ...(selected !== undefined ? { selected } : {}) }
      }
      disabled={disabled}
      onPress={onPress}
      className={cn('active:bg-muted', disabled ? 'opacity-50' : '')}
    >
      {body}
    </Pressable>
  );
}

