import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import { StreamingText } from '../../src/components/ui/streaming-text';
import { MOTION } from '../../src/theme';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, withTiming: jest.fn(actual.withTiming) };
});

const REPLY = 'Your recovery looks steady today. Try winding down by 10pm.';

beforeEach(() => jest.clearAllMocks());

describe('StreamingText', () => {
  it('renders the complete text on the very first render, as one node', () => {
    const { getByTestId, toJSON } = render(<StreamingText testID="reply" text={REPLY} />);

    expect(getByTestId('reply')).toHaveTextContent(REPLY);
    // One text node holding the whole string -- nothing is split per word.
    const serialized = JSON.stringify(toJSON());
    expect(serialized).toContain(JSON.stringify(REPLY));
  });

  it('fades in with a single fixed-duration opacity animation taken from MOTION', () => {
    render(<StreamingText testID="reply" text={REPLY} />);

    expect(Reanimated.withTiming).toHaveBeenCalledTimes(1);
    expect(Reanimated.withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: MOTION.duration.normal }));
  });

  it('uses the same single fade however long the text is (no per-word timing)', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    render(<StreamingText text={long} />);

    expect(Reanimated.withTiming).toHaveBeenCalledTimes(1);
    expect(Reanimated.withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: MOTION.duration.normal }));
  });

  it('schedules the same fixed amount of work regardless of text length (no typewriter loop)', () => {
    jest.useFakeTimers();
    try {
      const short = render(<StreamingText text="Hi" />);
      const shortTimers = jest.getTimerCount();
      short.unmount();
      jest.clearAllTimers();

      render(<StreamingText text={Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ')} />);
      expect(jest.getTimerCount()).toBe(shortTimers);
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts transparent and fades to opaque, never re-running on re-render', () => {
    const { getByTestId, rerender } = render(<StreamingText testID="reply" text={REPLY} />);
    const style = StyleSheet.flatten(getByTestId('reply').props.style);
    expect(style.opacity).toBeDefined();

    rerender(<StreamingText testID="reply" text={REPLY} />);
    expect(Reanimated.withTiming).toHaveBeenCalledTimes(1);
  });

  it('shows already-loaded history instantly, without any animation', () => {
    const { getByTestId } = render(<StreamingText testID="reply" text={REPLY} animate={false} />);

    expect(Reanimated.withTiming).not.toHaveBeenCalled();
    expect(StyleSheet.flatten(getByTestId('reply').props.style).opacity).toBe(1);
  });
});
