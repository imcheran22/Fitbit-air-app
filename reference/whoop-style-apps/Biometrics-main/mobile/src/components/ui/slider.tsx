import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Draws a tick and fires a haptic when a change crosses it. */
  threshold?: number;
  /** Greyed look; still interactive. */
  muted?: boolean;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  formatValue: (value: number) => string;
  testID?: string;
}

export function snapValue(raw: number, min: number, max: number, step: number): number {
  const snapped = Math.round((raw - min) / step) * step + min;
  return Math.round(Math.min(max, Math.max(min, snapped)) * 1e6) / 1e6;
}

export function crossedThreshold(prev: number, next: number, threshold?: number): boolean {
  return threshold !== undefined && prev < threshold !== next < threshold;
}

/** Where `value` sits along the track, clamped so an out-of-range value never draws past it. */
export function trackFraction(value: number, min: number, max: number): number {
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

const THUMB = 24;

export function Slider({ value, min, max, step, threshold, muted, onChange, accessibilityLabel, formatValue, testID }: SliderProps) {
  const [width, setWidth] = useState(0);
  const last = useRef(value);
  last.current = value;

  const commit = (next: number) => {
    if (next === last.current) return;
    if (crossedThreshold(last.current, next, threshold)) void Haptics.selectionAsync();
    last.current = next;
    onChange(next);
  };

  const fromX = (x: number) => (width === 0 ? value : snapValue(min + (x / width) * (max - min), min, max, step));
  // Nothing commits at touch-down: the slider sits in a vertical ScrollView, so a
  // drag only claims the touch once it is clearly horizontal, and a tap sets the
  // value on release. Exclusive gives the pan priority; the tap wins only if the
  // pan fails (stationary touch), and a scroll fails both.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-8, 8])
    .failOffsetY([-8, 8])
    .onStart((e) => commit(fromX(e.x)))
    .onUpdate((e) => commit(fromX(e.x)));
  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(8)
    .onEnd((e, success) => {
      if (success) commit(fromX(e.x));
    });
  const gesture = Gesture.Exclusive(pan, tap);

  const fraction = trackFraction(value, min, max);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(fraction * width - THUMB / 2, { duration: 90 }) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: withTiming(fraction * width, { duration: 90 }) }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value, text: formatValue(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const dir = e.nativeEvent.actionName === 'increment' ? 1 : -1;
          commit(snapValue(value + dir * step, min, max, step));
        }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        className="h-10 justify-center"
      >
        <View className={`h-1.5 rounded-full ${muted ? 'bg-muted/40' : 'bg-muted'}`} />
        <Animated.View style={fillStyle} className={`absolute h-1.5 rounded-full ${muted ? 'bg-muted-foreground/40' : 'bg-accent'}`} />
        {threshold !== undefined && width > 0 ? (
          <View
            testID={testID ? `${testID}-threshold` : undefined}
            style={{ left: ((threshold - min) / (max - min)) * width - 1 }}
            className="absolute h-4 w-0.5 rounded bg-foreground/50"
          />
        ) : null}
        <Animated.View
          style={[thumbStyle, { width: THUMB, height: THUMB }]}
          className={`absolute rounded-full border-2 ${muted ? 'border-muted-foreground/40 bg-card' : 'border-accent bg-card'}`}
        />
      </View>
    </GestureDetector>
  );
}
