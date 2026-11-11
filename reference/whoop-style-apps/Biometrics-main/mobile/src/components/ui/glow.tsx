import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

interface GlowProps {
  color: string;
  size: number;
  // Peak opacity at the centre; fades to nothing at the edge.
  intensity?: number;
}

// A soft radial light behind a hero element -- depth on a dark background
// without a drop shadow. Purely decorative, so it is hidden from
// accessibility and never takes touches.
// Centred on a parent of `around` x `around` points.
export function Glow({ color, size, around, intensity = 0.22 }: GlowProps & { around: number }) {
  const id = `glow-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  const offset = (around - size) / 2;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: offset, left: offset, width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={intensity} />
            <Stop offset="0.45" stopColor={color} stopOpacity={intensity * 0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
