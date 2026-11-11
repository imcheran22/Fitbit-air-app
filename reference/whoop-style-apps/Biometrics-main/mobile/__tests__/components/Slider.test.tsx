import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Slider, crossedThreshold, snapValue, trackFraction } from '../../src/components/ui/slider';

beforeEach(() => jest.clearAllMocks());

describe('snapValue', () => {
  it('snaps to the step and clamps to the range', () => {
    expect(snapValue(7.3, 4, 10, 0.5)).toBe(7.5);
    expect(snapValue(7.2, 4, 10, 0.5)).toBe(7);
    expect(snapValue(12, 4, 10, 0.5)).toBe(10);
    expect(snapValue(-3, 0, 6, 1)).toBe(0);
  });
});

describe('trackFraction', () => {
  it('places the value along the track, clamped to it', () => {
    expect(trackFraction(60, 0, 120)).toBe(0.5);
    expect(trackFraction(150, 0, 120)).toBe(1);
    expect(trackFraction(-10, 0, 120)).toBe(0);
  });
});

describe('crossedThreshold', () => {
  it('is true only when the value moves across the threshold', () => {
    expect(crossedThreshold(1, 2, 2)).toBe(true);
    expect(crossedThreshold(2, 1, 2)).toBe(true);
    expect(crossedThreshold(2, 3, 2)).toBe(false);
    expect(crossedThreshold(0, 1, undefined)).toBe(false);
  });
});

describe('Slider', () => {
  const props = {
    value: 1,
    min: 0,
    max: 6,
    step: 1,
    threshold: 2,
    accessibilityLabel: 'Alcohol',
    formatValue: (v: number) => `${v} drinks`,
    testID: 'slider',
  };

  it('is adjustable and announces its value', () => {
    render(<Slider {...props} onChange={jest.fn()} />);
    const s = screen.getByTestId('slider');
    expect(s.props.accessibilityRole).toBe('adjustable');
    expect(s.props.accessibilityValue).toMatchObject({ min: 0, max: 6, now: 1, text: '1 drinks' });
  });

  // Holds the value like a real parent, so each action starts from the last committed value.
  function Controlled({ initial, onChange }: { initial: number; onChange: (v: number) => void }) {
    const [value, setValue] = useState(initial);
    return (
      <Slider
        {...props}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    );
  }
  const act = (actionName: 'increment' | 'decrement') =>
    fireEvent(screen.getByTestId('slider'), 'accessibilityAction', { nativeEvent: { actionName } });

  it('increments and decrements through accessibility actions, with a haptic at each threshold crossing', () => {
    const onChange = jest.fn();
    render(<Controlled initial={1} onChange={onChange} />);
    act('increment');
    expect(onChange).toHaveBeenLastCalledWith(2);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    act('decrement');
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
    act('decrement');
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });

  it('fires no haptic for a change that does not cross the threshold', () => {
    const onChange = jest.fn();
    render(<Controlled initial={2} onChange={onChange} />);
    act('increment');
    expect(onChange).toHaveBeenLastCalledWith(3);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('does not go past its bounds', () => {
    const onChange = jest.fn();
    render(<Slider {...props} value={6} onChange={onChange} />);
    fireEvent(screen.getByTestId('slider'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
