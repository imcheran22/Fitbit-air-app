import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { formatDuration } from '../../lib/sleepStats';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';

// How much of the time in bed was asleep: a bar and a caption.
export function InBedShare({ minutesAsleep, minutesInBed, testID }: { minutesAsleep: number; minutesInBed: number; testID: string }) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const share = minutesInBed > 0 ? Math.min(1, minutesAsleep / minutesInBed) : 0;
  return (
    <>
      <View className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: palette.sleepHeat1 }}>
        <View className="h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: palette.metricSleep }} />
      </View>
      <Text testID={testID} className="text-caption text-muted-foreground">
        {`${formatDuration(minutesInBed)} in bed · ${Math.round(share * 100)}% of it asleep`}
      </Text>
    </>
  );
}
