import React, { useEffect, useRef, useState } from 'react';
import { type TextProps as RNTextProps } from 'react-native';
import { Text } from './text';

interface CountUpProps extends RNTextProps {
  value: number;
  format: (value: number) => string;
  duration?: number;
  className?: string;
}

// A lightweight port of React Bits' CountUp idea for native: no DOM/GSAP
// available here, so this drives a plain RN state update via
// requestAnimationFrame rather than a worklet -- overkill for a value that
// changes at most once per screen load, not on every frame of a gesture.
// Under Jest, requestAnimationFrame keeps ticking after a test's assertions
// resolve (there's no real frame clock to bound it), producing "update not
// wrapped in act()" warnings and non-deterministic intermediate values in
// assertions. Skip straight to the target value there; production keeps the
// animation.
const isTestEnv = typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID;

export function CountUp({ value, format, duration = 700, className, ...props }: CountUpProps) {
  const [display, setDisplay] = useState(isTestEnv ? value : 0);
  const startValueRef = useRef(isTestEnv ? value : 0);

  useEffect(() => {
    if (isTestEnv) {
      setDisplay(value);
      startValueRef.current = value;
      return;
    }

    const startValue = startValueRef.current;
    const startTime = Date.now();
    let frame: number;

    function tick() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (value - startValue) * eased;
      setDisplay(current);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        startValueRef.current = value;
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <Text className={className} {...props}>
      {format(display)}
    </Text>
  );
}
