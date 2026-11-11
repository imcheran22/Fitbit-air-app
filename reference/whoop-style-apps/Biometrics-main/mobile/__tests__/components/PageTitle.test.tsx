import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { PageTitle } from '../../src/components/ui/page-title';
import { FONTS } from '../../src/theme';

const family = (testID: string) => (StyleSheet.flatten(screen.getByTestId(testID).props.style) as { fontFamily?: string }).fontFamily;

it('draws the title uppercase in the pixel face, as a header', () => {
  render(<PageTitle testID="t">Activity</PageTitle>);
  const title = screen.getByTestId('t');
  expect(title).toHaveTextContent('ACTIVITY');
  expect(title.props.accessibilityRole).toBe('header');
  expect(String(title.props.className).split(' ')).toContain('text-page-title');
  expect(family('t')).toBe(FONTS.pixel);
});

it('reads the original case to a screen reader', () => {
  render(<PageTitle>Your week with Biscuit</PageTitle>);
  expect(screen.getByRole('header', { name: 'Your week with Biscuit' })).toHaveTextContent('YOUR WEEK WITH BISCUIT');
});

it('wraps a long title rather than clipping it, unless the caller asks for one line', () => {
  const long = 'Pair up with a friend who lives a long way away';
  render(<PageTitle testID="long">{long}</PageTitle>);
  expect(screen.getByTestId('long').props.numberOfLines).toBeUndefined();
  expect(screen.getByTestId('long')).toHaveTextContent(long.toUpperCase());

  render(
    <PageTitle testID="one" numberOfLines={1}>
      @a_very_long_handle_for_a_header
    </PageTitle>,
  );
  expect(screen.getByTestId('one').props.numberOfLines).toBe(1);
});

it('keeps scaling with the system text size', () => {
  render(<PageTitle testID="t">Social</PageTitle>);
  expect(screen.getByTestId('t').props.allowFontScaling).not.toBe(false);
  expect(screen.getByTestId('t').props.maxFontSizeMultiplier).toBeUndefined();
});

it('stays pixel when a caller size replaces text-page-title', () => {
  render(
    <PageTitle testID="t" className="text-[28px]">
      Biometrics
    </PageTitle>,
  );
  expect(String(screen.getByTestId('t').props.className).split(' ')).not.toContain('text-page-title');
  expect(family('t')).toBe(FONTS.pixel);
});

it('keeps the pixel face under a one-off size (the sign-in app name)', () => {
  render(
    <PageTitle testID="t" className="font-pixel text-[28px] leading-[34px] tracking-[1px]">
      Biometrics
    </PageTitle>,
  );
  expect(family('t')).toBe(FONTS.pixel);
  expect(screen.getByTestId('t')).toHaveTextContent('BIOMETRICS');
});
