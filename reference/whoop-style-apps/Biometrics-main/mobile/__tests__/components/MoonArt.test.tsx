import React from 'react';
import { render } from '@testing-library/react-native';
import Svg, { Rect } from 'react-native-svg';
import { MoonArt } from '../../src/components/sleep/MoonArt';
import { MOON_ART, MOON_GRID } from '../../src/lib/moonArt';

describe('MoonArt', () => {
  it("draws the board's 15 rects at 5 pt per cell, hidden from screen readers", () => {
    const { getByTestId, UNSAFE_getAllByType, UNSAFE_getByType } = render(<MoonArt testID="moon" />);
    expect(UNSAFE_getAllByType(Rect)).toHaveLength(15);
    expect(UNSAFE_getByType(Svg).props).toMatchObject({ width: 125, height: 100, viewBox: '0 0 25 20' });
    const root = getByTestId('moon', { includeHiddenElements: true });
    expect(root.props.accessible).toBe(false);
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props.style).toMatchObject({ opacity: 1 });
  });
  it('dims to 40% for the building and no-night states', () => {
    const { getByTestId } = render(<MoonArt testID="moon" dim />);
    expect(getByTestId('moon', { includeHiddenElements: true }).props.style).toMatchObject({ opacity: 0.4 });
  });
  it('every rect fits the grid and uses a fixed colour (same in both themes)', () => {
    for (const r of MOON_ART) {
      expect(r.x + r.w <= MOON_GRID.w && r.y + r.h <= MOON_GRID.h).toBe(true);
      expect(r.fill).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
