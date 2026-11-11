import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import Svg, { Rect } from 'react-native-svg';
import { PersonKip, PERSON_POSE, personStateOf } from '../../src/components/kip/PersonKip';
import { KIP_COLOURS, kipArt } from '../../src/lib/kip/kipArt';

describe('PersonKip', () => {
  it('maps every state to its pose and mood', () => {
    expect(PERSON_POSE).toEqual({
      good: { pose: 'cheer', mood: 'proud' },
      ok: { pose: 'wave', mood: 'idle' },
      low: { pose: 'rest', mood: 'determined' },
      none: { pose: 'rest', mood: 'idle' },
      asleep: { pose: 'rest', mood: 'sleepy' },
    });
    expect(personStateOf('good')).toBe('good');
    expect(personStateOf('low', true)).toBe('asleep');
    expect(personStateOf(undefined)).toBe('none');
  });

  it("draws the person's colour, and coral for an unknown name", () => {
    const mint = render(<PersonKip colour="mint" size={48} />);
    expect(mint.UNSAFE_getAllByType(Rect).some((r) => r.props.fill === KIP_COLOURS.mint)).toBe(true);
    mint.unmount();
    const odd = render(<PersonKip colour="teal" size={48} />);
    expect(odd.UNSAFE_getAllByType(Rect).some((r) => r.props.fill === KIP_COLOURS.coral)).toBe(true);
  });

  it('draws the state: asleep is the sleepy rest art, not the idle one', () => {
    const sleepy = kipArt({ colour: 'coral', pose: 'rest', mood: 'sleepy' });
    const { UNSAFE_getAllByType } = render(<PersonKip state="asleep" size={48} />);
    const rects = UNSAFE_getAllByType(Rect);
    expect(rects).toHaveLength(sleepy.length);
    expect(rects.map((r) => ({ x: r.props.x, y: r.props.y, w: r.props.width, h: r.props.height, fill: r.props.fill }))).toEqual(sleepy);
    expect(sleepy).not.toEqual(kipArt({ colour: 'coral', pose: 'rest', mood: 'idle' }));
  });

  it.each([
    [26, 2, 20, 3],
    [28, 2, 20, 4],
    [32, 3, 30, 1],
    [35, 3, 30, 2],
    [96, 9, 90, 3],
  ])('crops to the body so a %ipt slot draws at %i pt per cell (%i pt), centred on whole points (%i)', (size, scale, drawn, offset) => {
    const { getByTestId, UNSAFE_getByType } = render(<PersonKip size={size} testID="p" />);
    const box = getByTestId('p', { includeHiddenElements: true });
    expect(box.props.style).toEqual({ width: size, height: size });
    const svg = UNSAFE_getByType(Svg);
    expect(svg.props).toMatchObject({ width: drawn, height: drawn, viewBox: '3 6 10 10' });
    expect(StyleSheet.flatten(svg.props.style)).toEqual({ position: 'absolute', left: offset, top: offset });
    expect(Number.isInteger(offset)).toBe(true);
    expect(drawn / 10).toBe(scale);
  });

  it('is decorative: hidden from screen readers', () => {
    const { getByTestId } = render(<PersonKip size={32} testID="p" />);
    const box = getByTestId('p', { includeHiddenElements: true });
    expect(box.props.accessible).toBe(false);
    expect(box.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(box.props.accessibilityElementsHidden).toBe(true);
  });
});
