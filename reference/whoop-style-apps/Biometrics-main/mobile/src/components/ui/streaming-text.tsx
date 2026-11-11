import React, { useEffect } from 'react';
import { type TextProps } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { cn } from '../../lib/utils';
import { MOTION } from '../../theme';
import { textStyleFor } from './text';

interface StreamingTextProps extends TextProps {
  text: string;
  className?: string;
  // Fade-in length. Defaults to the shared MOTION token so the coach uses the
  // same motion system as the score transitions.
  duration?: number;
  // False for text that was already on screen (loaded history): shown at full
  // opacity with no animation.
  animate?: boolean;
}

// Despite the name this does NOT reveal text progressively. The coach reply
// has already arrived whole and been validated server-side (spec 4/8), so a
// typewriter effect would only add latency and imply live generation that is
// not happening. The complete text is rendered immediately behind one
// fixed-duration opacity fade: it says "a message arrived" and nothing about
// how. No per-word timing, no timers, no frame loop.
export function StreamingText({ text, className, duration = MOTION.duration.normal, animate = true, style, ...props }: StreamingTextProps) {
  const opacity = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    opacity.value = withTiming(1, { duration, easing: Easing.bezier(...MOTION.easing.decelerate) });
    // A message's text never changes after it arrives, so the fade runs once,
    // on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text className={cn('text-foreground', className)} style={[textStyleFor(className), style, animatedStyle]} {...props}>
      {text}
    </Animated.Text>
  );
}
