import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Reveal, revealDelay, revealEntering } from '../../src/components/ui/reveal';
import { MOTION } from '../../src/theme';

describe('revealDelay', () => {
  it('starts the first item immediately and steps each later one', () => {
    expect(revealDelay(0)).toBe(0);
    expect(revealDelay(3)).toBe(3 * MOTION.stagger);
  });

  it('never returns a negative delay', () => {
    expect(revealDelay(-2)).toBe(0);
  });
});

describe('revealEntering', () => {
  it('returns undefined when reduced motion is enabled', () => {
    expect(revealEntering(2, true)).toBeUndefined();
  });

  it('returns an entering animation when reduced motion is disabled', () => {
    expect(revealEntering(2, false)).toBeDefined();
  });
});

describe('Reveal', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <Reveal index={2}>
        <Text>hello</Text>
      </Reveal>,
    );
    expect(getByText('hello')).toBeTruthy();
  });
});
