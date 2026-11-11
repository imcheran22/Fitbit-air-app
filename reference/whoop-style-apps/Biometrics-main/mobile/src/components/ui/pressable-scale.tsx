import React from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { MOTION } from '../../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  className?: string;
};

// Where a control settles while pressed. Pure so the reduced-motion rule is
// unit-testable: with reduced motion it dims instead of scaling.
export function pressTargets(reduced: boolean, pressed: boolean): { scale: number; opacity: number } {
  if (!pressed) return { scale: 1, opacity: 1 };
  return reduced ? { scale: 1, opacity: MOTION.press.reducedOpacity } : { scale: MOTION.press.scale, opacity: 1 };
}

export function PressableScale({ onPressIn, onPressOut, style, ...props }: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => {
    const baseStyle: any = { transform: [{ scale: scale.value }] };
    if (reduced) {
      baseStyle.opacity = opacity.value;
    }
    return baseStyle;
  });

  function animateTo(pressed: boolean) {
    const target = pressTargets(reduced, pressed);
    scale.value = withSpring(target.scale, MOTION.spring.press);
    opacity.value = withSpring(target.opacity, MOTION.spring.press);
  }

  return (
    <AnimatedPressable
      style={[style, animatedStyle]}
      onPressIn={(e: GestureResponderEvent) => {
        animateTo(true);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        animateTo(false);
        onPressOut?.(e);
      }}
      {...props}
    />
  );
}
