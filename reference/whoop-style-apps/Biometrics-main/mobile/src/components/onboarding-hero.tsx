import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import { COLORS, METRIC_CONFIG, METRIC_ORDER } from '../theme';
import { Character } from './characters/Character';
import { useScreenFocused } from '../characters/useScreenFocused';

const SIZE = 260;
const STROKE = 7;
const GAP = 6;
// Decorative arcs, not data: each ring is drawn to a fixed share so the hero
// never implies a reading before anything has synced.
const SHARES = [0.72, 0.8, 0.46, 0.6];

// The sign-in hero: Mochi (signed-out screens always show Mochi) inside four
// thin rings, one per metric colour -- the app's two visual ideas (the coach,
// and your own four signals) in one mark.
export function OnboardingHero() {
  const focused = useScreenFocused();
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const center = SIZE / 2;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={SIZE} height={SIZE} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {METRIC_ORDER.map((type, i) => {
          const r = center - STROKE / 2 - i * (STROKE + GAP);
          const circumference = 2 * Math.PI * r;
          const color = scheme === 'dark' ? METRIC_CONFIG[type].color.dark : METRIC_CONFIG[type].color.light;
          return (
            <React.Fragment key={type}>
              <Circle cx={center} cy={center} r={r} stroke={colors.border} strokeWidth={STROKE} fill="none" />
              <Circle
                cx={center}
                cy={center}
                r={r}
                stroke={color}
                strokeOpacity={0.9}
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${circumference * SHARES[i]} ${circumference}`}
              />
            </React.Fragment>
          );
        })}
      </Svg>
      <Character testID="onboarding-character" characterId="mochi" mood="idle" size={120} glow paused={!focused} />
    </View>
  );
}

// Google's four-colour "G", as its sign-in branding asks for.
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
      <Path fill="#FBBC05" d="M10.5 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.2z" />
      <Path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
    </Svg>
  );
}
