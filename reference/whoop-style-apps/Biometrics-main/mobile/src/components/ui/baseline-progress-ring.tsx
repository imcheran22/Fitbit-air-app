import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import { CountUp } from './count-up';
import { COLORS } from '../../theme';

interface BaselineProgressRingProps {
  daysCollected: number;
  daysRequired: number;
  size?: number;
  strokeWidth?: number;
  // False when the ring is too small to hold "9/14 days"; the caller then
  // renders baselineLabel(...) beside it.
  showLabel?: boolean;
}

export function baselineLabel(daysCollected: number, daysRequired: number): string {
  const required = Math.max(1, Math.round(daysRequired));
  return `${Math.max(0, Math.min(Math.round(daysCollected), required))}/${required} days`;
}

const TICK_GAP = 3;

// The cold-start state: one tick per required day, filled as days accumulate.
// Deliberately NOT a continuous arc in a score colour, so "building your
// baseline" can never be mistaken for a real (low) score ring.
export function BaselineProgressRing({ daysCollected, daysRequired, size = 84, strokeWidth = 8, showLabel = true }: BaselineProgressRingProps) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const required = Math.max(1, Math.round(daysRequired));
  const collected = Math.max(0, Math.min(Math.round(daysCollected), required));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const slot = circumference / required;
  const tickLength = Math.max(slot - TICK_GAP, 1);

  return (
    <View
      testID="baseline-progress-ring"
      accessible
      accessibilityLabel={`Building your baseline: ${collected} of ${required} days`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {Array.from({ length: required }, (_, i) => {
          const filled = i < collected;
          return (
            <Circle
              key={i}
              testID={filled ? `baseline-tick-filled-${i}` : `baseline-tick-empty-${i}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={filled ? colors.accent : colors.muted}
              strokeOpacity={filled ? 1 : 0.35}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${tickLength} ${circumference - tickLength}`}
              strokeDashoffset={-i * slot}
            />
          );
        })}
      </Svg>
      {showLabel ? (
        <CountUp value={collected} format={(v) => `${Math.round(v)}/${required} days`} className="text-caption font-semibold tabular-nums" />
      ) : null}
    </View>
  );
}
