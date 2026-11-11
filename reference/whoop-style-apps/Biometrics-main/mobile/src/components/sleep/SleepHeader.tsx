import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { COLORS } from '../../theme';
import { SLEEP_COPY } from '../../lib/sleepCopy';
import { Button } from '../ui/button';
import { PageTitle } from '../ui/page-title';

// Back, the page title, info and the bedtime goal (spec §3.1). The stack header is hidden for this route.
export function SleepHeader({ onBack, onInfo, onGoal }: { onBack: () => void; onInfo: () => void; onGoal: () => void }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  return (
    <View className="flex-row items-center gap-2" style={{ marginHorizontal: -4 }}>
      <Button testID="sleep-back" variant="outline" size="icon-lg" accessibilityLabel={SLEEP_COPY.back} onPress={onBack}>
        <Ionicons name="chevron-back" size={18} color={colors.foreground} />
      </Button>
      {/* Balances the two buttons on the right so the title sits in the middle. */}
      <View style={{ width: 40 }} />
      <View className="flex-1 items-center">
        <PageTitle>{SLEEP_COPY.title}</PageTitle>
      </View>
      <Button testID="sleep-info" variant="outline" size="icon-lg" accessibilityLabel={SLEEP_COPY.info} onPress={onInfo}>
        <Ionicons name="information-circle-outline" size={18} color={colors.foreground} />
      </Button>
      <Button testID="sleep-goal-button" variant="outline" size="icon-lg" accessibilityLabel={SLEEP_COPY.bedtimeGoal} onPress={onGoal}>
        <Ionicons name="alarm-outline" size={18} color={colors.foreground} />
      </Button>
    </View>
  );
}
