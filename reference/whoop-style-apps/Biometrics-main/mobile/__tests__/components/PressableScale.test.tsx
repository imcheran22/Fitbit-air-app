import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { PressableScale, pressTargets } from '../../src/components/ui/pressable-scale';
import { MOTION } from '../../src/theme';

describe('pressTargets', () => {
  it('rests at full size and opacity', () => {
    expect(pressTargets(false, false)).toEqual({ scale: 1, opacity: 1 });
    expect(pressTargets(true, false)).toEqual({ scale: 1, opacity: 1 });
  });

  it('shrinks when pressed', () => {
    expect(pressTargets(false, true)).toEqual({ scale: MOTION.press.scale, opacity: 1 });
  });

  it('only dims, without changing size, when pressed with reduced motion', () => {
    expect(pressTargets(true, true)).toEqual({ scale: 1, opacity: MOTION.press.reducedOpacity });
  });
});

describe('PressableScale', () => {
  it('calls onPress and forwards testID and accessibility props', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <PressableScale testID="p" accessibilityRole="button" accessibilityLabel="Go" onPress={onPress}>
        <Text>Go</Text>
      </PressableScale>,
    );

    fireEvent.press(getByTestId('p'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(getByTestId('p').props.accessibilityLabel).toBe('Go');
  });

  it('still forwards onPressIn and onPressOut', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const { getByTestId } = render(
      <PressableScale testID="p" onPressIn={onPressIn} onPressOut={onPressOut}>
        <Text>Go</Text>
      </PressableScale>,
    );

    fireEvent(getByTestId('p'), 'pressIn');
    fireEvent(getByTestId('p'), 'pressOut');

    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <PressableScale testID="p" disabled onPress={onPress}>
        <Text>Go</Text>
      </PressableScale>,
    );

    fireEvent.press(getByTestId('p'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not include opacity in animated style when reduced motion is off', () => {
    const { getByTestId } = render(
      <PressableScale testID="p">
        <Text>Go</Text>
      </PressableScale>,
    );

    const styles = getByTestId('p').props.style;
    const flatStyle = Array.isArray(styles) ? Object.assign({}, ...styles) : styles;

    // Animated style should not have opacity key when reduced motion is off
    expect(flatStyle).not.toHaveProperty('opacity');
    // Should still have transform
    expect(flatStyle).toHaveProperty('transform');
  });

  it('preserves caller-supplied opacity style when reduced motion is off', () => {
    const { getByTestId } = render(
      <PressableScale testID="p" style={{ opacity: 0.5 }}>
        <Text>Go</Text>
      </PressableScale>,
    );

    const styles = getByTestId('p').props.style;
    const flatStyle = Array.isArray(styles) ? Object.assign({}, ...styles) : styles;

    // Caller-supplied opacity should be preserved (it's in the first position of the array)
    expect(styles).toContainEqual({ opacity: 0.5 });
  });
});
