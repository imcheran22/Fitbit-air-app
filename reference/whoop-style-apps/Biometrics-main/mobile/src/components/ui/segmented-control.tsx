import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { cn } from '../../lib/utils';
import { MOTION } from '../../theme';
import { Text } from './text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function indicatorOffset(index: number, innerWidth: number, count: number): number {
  if (count <= 0 || innerWidth <= 0) return 0;
  return index * (innerWidth / count);
}

export interface IndicatorPlan {
  target: number;
  animate: boolean;
}

export function indicatorPlan(target: number, reduced: boolean): IndicatorPlan {
  return { target, animate: !reduced };
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, testID = 'segmented' }: SegmentedControlProps<T>) {
  const reduced = useReducedMotion();
  const [innerWidth, setInnerWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segmentWidth = options.length > 0 ? innerWidth / options.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    const target = indicatorOffset(index, innerWidth, options.length);
    const plan = indicatorPlan(target, reduced);
    x.value = plan.animate ? withSpring(plan.target, MOTION.spring.settle) : plan.target;
  }, [index, innerWidth, options.length, reduced, x]);

  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View testID={testID} accessibilityRole="tablist" className="rounded-xl bg-muted p-1">
      <View testID={`${testID}-inner`} className="flex-row" onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}>
        {innerWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            testID={`${testID}-indicator`}
            className="absolute bottom-0 left-0 top-0 rounded-lg bg-card"
            style={[{ width: segmentWidth }, indicatorStyle]}
          />
        ) : null}
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              testID={`${testID}-${option.value}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              className="flex-1 items-center py-2"
            >
              <Text className={cn('text-caption font-medium', selected ? 'text-foreground' : 'text-muted-foreground')}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
