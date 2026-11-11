import React from 'react';
import { View } from 'react-native';
import { Text } from './text';
import { formatPoints } from '../../lib/scoreInsights';
import { formatGoalDuration } from '../../lib/sleepWindow';
import type { FactorDTO } from '../../api/scores';

// One shared 0-centred scale for every bar in a list: the largest |points|
// among the factors that actually contribute. Excluded factors never widen it.
export function factorBarScale(factors: Pick<FactorDTO, 'points' | 'excluded'>[]): number {
  const max = Math.max(0, ...factors.filter((f) => !f.excluded).map((f) => Math.abs(f.points)));
  return max > 0 ? max : 1;
}

export function factorBarGeometry(points: number, scale: number): { side: 'left' | 'right' | 'none'; fraction: number } {
  if (points === 0) return { side: 'none', fraction: 0 };
  return { side: points > 0 ? 'right' : 'left', fraction: Math.min(Math.abs(points) / scale, 1) };
}

interface FactorBarProps {
  factor: FactorDTO;
  // Shared across every bar in the list -- see factorBarScale.
  scale: number;
}

// Signed contribution bar for the Stage 5 breakdown: extends left of the
// centre line when the factor hurt the score, right when it helped. The label
// is rendered exactly as the server sends it (the RHR factor arrives as
// "Resting HR").
export function FactorBar({ factor, scale }: FactorBarProps) {
  const { side, fraction } = factorBarGeometry(factor.points, scale);
  const width = `${fraction * 100}%` as `${number}%`;
  const showBar = !factor.excluded && side !== 'none';
  const pointsText = factor.excluded ? null : formatPoints(factor.points);

  return (
    <View
      testID={`factor-bar-${factor.factor}`}
      accessible
      accessibilityLabel={factor.excluded ? `${factor.label}: still building baseline` : `${factor.label}: ${pointsText}`}
      className="gap-1.5"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-body font-medium">{factor.label}</Text>
          {factor.imputed && !factor.excluded ? (
            <Text className="text-caption text-muted-foreground">estimated</Text>
          ) : null}
        </View>
        {factor.excluded ? (
          <Text className="text-caption text-muted-foreground">Building baseline</Text>
        ) : (
          <Text className="text-body font-semibold tabular-nums">
            {pointsText}
          </Text>
        )}
      </View>
      {/* The sleep factors carry the goal they were scored against; older scores don't, and never get a guess. */}
      {factor.goalMinutes != null ? (
        <Text testID={`factor-goal-${factor.factor}`} className="-mt-1 text-caption text-muted-foreground">
          {`vs your goal of ${formatGoalDuration(factor.goalMinutes)}`}
        </Text>
      ) : null}

      <View className="h-2 flex-row overflow-hidden rounded-full bg-muted">
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
          {showBar && side === 'left' ? (
            <View testID={`factor-bar-neg-${factor.factor}`} className="h-full bg-score-poor" style={{ width }} />
          ) : null}
        </View>
        <View className="h-full w-px bg-border" />
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-start' }}>
          {showBar && side === 'right' ? (
            <View testID={`factor-bar-pos-${factor.factor}`} className="h-full bg-score-excellent" style={{ width }} />
          ) : null}
        </View>
      </View>
    </View>
  );
}
