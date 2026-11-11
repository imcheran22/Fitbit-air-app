import React from 'react';
import { render } from '@testing-library/react-native';
import Svg, { Rect } from 'react-native-svg';
import { Kip } from '../../src/components/kip/Kip';
import { kipArt } from '../../src/lib/kip/kipArt';

describe('Kip', () => {
  it('draws one Rect per run, hidden from screen readers', () => {
    const { getByTestId, UNSAFE_getAllByType } = render(<Kip pose="wave" mood="proud" colour="mint" testID="kip" />);
    const art = kipArt({ pose: 'wave', mood: 'proud', colour: 'mint' });
    const rects = UNSAFE_getAllByType(Rect);
    expect(rects).toHaveLength(art.length);
    expect(rects[0]!.props).toMatchObject({ x: art[0]!.x, y: art[0]!.y, width: art[0]!.w, height: art[0]!.h, fill: art[0]!.fill });
    const root = getByTestId('kip', { includeHiddenElements: true });
    expect(root.props.accessible).toBe(false);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props.accessibilityElementsHidden).toBe(true);
  });

  it('defaults to coral, rest and idle at 4 pt per cell', () => {
    const { UNSAFE_getByType, UNSAFE_getAllByType } = render(<Kip />);
    expect(UNSAFE_getByType(Svg).props).toMatchObject({ width: 64, height: 64, viewBox: '0 0 16 16' });
    expect(UNSAFE_getAllByType(Rect)).toHaveLength(kipArt({}).length);
    expect(UNSAFE_getAllByType(Rect).some((r) => r.props.fill === '#FB7185')).toBe(true);
  });

  it('draws at a whole-point scale so cells stay crisp', () => {
    const big = render(<Kip scale={6} />);
    expect(big.UNSAFE_getByType(Svg).props).toMatchObject({ width: 96, height: 96 });
    big.unmount();
    const odd = render(<Kip scale={2.6} />);
    expect(odd.UNSAFE_getByType(Svg).props).toMatchObject({ width: 32, height: 32 });
    odd.unmount();
    const tiny = render(<Kip scale={0} />);
    expect(tiny.UNSAFE_getByType(Svg).props).toMatchObject({ width: 16, height: 16 });
  });

  it('sets no shapeRendering prop (react-native-svg has none)', () => {
    const { UNSAFE_getByType, UNSAFE_getAllByType } = render(<Kip />);
    expect(UNSAFE_getByType(Svg).props.shapeRendering).toBeUndefined();
    for (const r of UNSAFE_getAllByType(Rect)) expect(r.props.shapeRendering).toBeUndefined();
  });
});
