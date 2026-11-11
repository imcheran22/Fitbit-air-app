import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { RecoveryPageDTO } from '../../api/recovery';
import { COLORS } from '../../theme';
import { debtBlocks, debtClearCopy, debtFactor, formatMinutes, RECOVERY_COPY } from '../../lib/recoveryCopy';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

// The wide bento tile (spec §3.6): the rolling 14-night debt drawn as 30-minute blocks.
export function SleepDebtTile({ page }: { page: RecoveryPageDTO }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const debt = page.sleepDebt;
  const factor = page.score?.factors.find((f) => f.factor === 'SLEEP_DEBT');
  const shown = factor && !factor.excluded ? debtFactor(factor.points) : null;
  const tone = shown?.tone === 'drag' ? colors.scorePoor : shown?.tone === 'lift' ? colors.scoreGood : colors.muted;

  return (
    <Card testID="recovery-sleep-debt" className="gap-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="moon-outline" size={12} color={colors.muted} accessibilityElementsHidden importantForAccessibility="no" />
          <SectionLabel>{RECOVERY_COPY.debtEyebrow(debt?.windowNights ?? 14)}</SectionLabel>
        </View>
        {shown ? (
          <Text className="text-caption font-semibold tabular-nums" style={{ color: tone }}>
            {shown.text}
          </Text>
        ) : null}
      </View>
      {debt ? (
        <>
          <View className="flex-row items-baseline gap-2">
            <Text className="text-display tabular-nums">{formatMinutes(debt.minutes)}</Text>
            <Text className="text-caption text-muted-foreground">{RECOVERY_COPY.debtOwed(debt.usualHighMinutes)}</Text>
          </View>
          <DebtBlocks minutes={debt.minutes} usualHigh={debt.usualHighMinutes} fill={debt.minutes > (debt.usualHighMinutes ?? Infinity) ? colors.scorePoor : colors.muted} />
          <Text className="text-caption text-muted-foreground">{RECOVERY_COPY.debtCaption(debtClearCopy(debt.nightsToClear, debt.goalMinutes))}</Text>
        </>
      ) : (
        <Text className="text-body text-muted-foreground">{RECOVERY_COPY.debtNone}</Text>
      )}
    </Card>
  );
}

function DebtBlocks({ minutes, usualHigh, fill }: { minutes: number; usualHigh: number | null; fill: string }) {
  return (
    <View className="flex-row gap-1">
      {debtBlocks(minutes, usualHigh).map((b, i) => (
        <View
          key={i}
          testID={`debt-block-${i}`}
          accessibilityElementsHidden
          className={b === 'empty' ? 'bg-muted' : undefined}
          style={{ height: 16, borderRadius: 3, flex: 1, ...(b === 'empty' ? null : { backgroundColor: fill }), ...(b === 'partial' ? { opacity: 0.45 } : null) }}
        />
      ))}
    </View>
  );
}
