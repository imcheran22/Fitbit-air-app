import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface RingProps {
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor?: string;
  // 0-1 fill for a real, labeled goal. Omitted entirely renders a solid
  // decorative ring -- used for metrics with no universal target (resting
  // heart rate, HRV) so the visual never implies a fabricated score.
  percent?: number;
  children?: React.ReactNode;
}

export function Ring({
  size = 84,
  strokeWidth = 8,
  color,
  trackColor = 'rgba(128, 128, 128, 0.15)',
  percent,
  children,
}: RingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = percent === undefined ? 1 : Math.max(0, Math.min(percent, 1));
  const dashOffset = circumference * (1 - fill);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}
