import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { RecoveryPageDTO } from '../../api/recovery';
import { COLORS } from '../../theme';
import { formatMinutes, RECOVERY_COPY } from '../../lib/recoveryCopy';
import { openNight } from '../../navigation/sleepNavigation';
import { STAGE_TOKEN } from '../sleep/StageStrip';
import { Card } from '../ui/card';
import { PressableScale } from '../ui/pressable-scale';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

// The night that ended on D (spec §3.6); the whole tile opens it. Without a night it is a plain card.
export function LastNightTile({ page, navigation, className }: { page: RecoveryPageDTO; navigation: { navigate: (...args: any[]) => void }; className?: string }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const night = page.lastNight;

  if (!night) {
    return (
      <Card testID="last-night-card" className={`gap-2 ${className ?? ''}`}>
        <SectionLabel>{RECOVERY_COPY.lastNight}</SectionLabel>
        <Text className="text-display">—</Text>
        <Text className="text-caption text-muted-foreground">{RECOVERY_COPY.noSleep}</Text>
      </Card>
    );
  }

  const duration = formatMinutes(night.minutesAsleep);
  const s = night.stages;
  // Board order: Deep, REM, Light, Awake.
  const segments = s ? ([['DEEP', s.deep], ['REM', s.rem], ['LIGHT', s.light], ['AWAKE', s.awake]] as const) : [];
  return (
    <PressableScale
      testID="recovery-last-night"
      accessibilityRole="button"
      accessibilityLabel={RECOVERY_COPY.lastNightA11y(duration)}
      className={className}
      onPress={() => openNight(navigation, night.date)}
    >
      <Card testID="last-night-card" className="flex-1 gap-2">
        <SectionLabel>{RECOVERY_COPY.lastNight}</SectionLabel>
        <Text className="text-display tabular-nums">{duration}</Text>
        <View className="flex-row overflow-hidden" style={{ height: 8, borderRadius: 4 }}>
          {s ? (
            segments.map(([type, minutes]) => (
              <View key={type} testID={`last-night-bar-${type}`} style={{ flex: minutes, backgroundColor: colors[STAGE_TOKEN[type]] }} />
            ))
          ) : (
            <View testID="last-night-bar-solid" style={{ flex: 1, backgroundColor: colors.sleepLight }} />
          )}
        </View>
        <Text className="text-caption text-muted-foreground">{s ? RECOVERY_COPY.lastNightCaption(s.deep, s.rem) : RECOVERY_COPY.noStages}</Text>
      </Card>
    </PressableScale>
  );
}
