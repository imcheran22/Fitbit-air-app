import fs from 'fs';
import path from 'path';
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { HEADER_TITLE_SIZE, HeaderTitle, headerTitleStyle } from '../../src/navigation/headerStyle';
import { FONTS } from '../../src/theme';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../../src/navigation', file), 'utf8');

it('sets native header titles in Silkscreen at 15', () => {
  expect(HEADER_TITLE_SIZE).toBe(15);
  expect(headerTitleStyle('rgb(1, 2, 3)')).toEqual({ color: 'rgb(1, 2, 3)', fontFamily: FONTS.pixel, fontSize: 15 });
});

it('draws a header title in caps, but a screen reader hears it as written', () => {
  render(<HeaderTitle tintColor="rgb(1, 2, 3)">Sign-in methods</HeaderTitle>);
  const title = screen.getByText('SIGN-IN METHODS');
  expect(title.props.accessibilityRole).toBe('header');
  expect(title.props.accessibilityLabel).toBe('Sign-in methods');
  expect(StyleSheet.flatten(title.props.style)).toEqual({ color: 'rgb(1, 2, 3)', fontFamily: FONTS.pixel, fontSize: 15 });
  expect(screen.queryByText('Sign-in methods')).toBeNull();
});

it('falls back to the foreground colour without a tint', () => {
  render(<HeaderTitle>Badges</HeaderTitle>);
  expect(StyleSheet.flatten(screen.getByText('BADGES').props.style)).toEqual(expect.objectContaining({ fontFamily: FONTS.pixel, fontSize: 15 }));
});

// The stack's wiring is checked by rendering it in RootNavigator.test.tsx; the
// tab headers are all hidden today, so their options are read from source.
it('gives the tab header the same title, without the stray weight', () => {
  const src = read('TabsNavigator.tsx');
  expect(src).not.toMatch(/fontWeight/);
  expect(src).toContain('headerTitleStyle: headerTitleStyle(colors.foreground)');
  expect(src).toContain('headerTitle: (props) => <HeaderTitle {...props} />');
});
