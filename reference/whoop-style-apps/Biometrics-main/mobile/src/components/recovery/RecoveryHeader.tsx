import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { COLORS } from '../../theme';
import { Button } from '../ui/button';
import { PageTitle } from '../ui/page-title';
import { Text } from '../ui/text';
import { RECOVERY_COPY } from '../../lib/recoveryCopy';

// Back, the page title over its date subtitle, and info (spec §3.1). The stack header is hidden for this route.
export function RecoveryHeader({ subtitle, onBack, onInfo }: { subtitle: string | null; onBack: () => void; onInfo: (() => void) | null }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  return (
    <View className="flex-row items-center gap-2" style={{ marginHorizontal: -4 }}>
      <Button testID="recovery-back" variant="outline" size="icon-lg" accessibilityLabel={RECOVERY_COPY.back} onPress={onBack}>
        <Ionicons name="chevron-back" size={18} color={colors.foreground} />
      </Button>
      <View className="flex-1 items-center">
        <PageTitle>{RECOVERY_COPY.title}</PageTitle>
        {subtitle ? <Text testID="recovery-subtitle" className="text-caption text-muted-foreground">{subtitle}</Text> : null}
      </View>
      {onInfo ? (
        <Button testID="recovery-info" variant="outline" size="icon-lg" accessibilityLabel={RECOVERY_COPY.info} onPress={onInfo}>
          <Ionicons name="information-circle-outline" size={18} color={colors.foreground} />
        </Button>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );
}
