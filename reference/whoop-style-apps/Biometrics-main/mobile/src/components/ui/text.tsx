import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { cn } from '../../lib/utils';
import { FONTS } from '../../theme';

// React Native picks a custom face by family name, so a `font-bold` class alone
// would keep drawing Geist Regular (or a synthesized bold). The class list is
// resolved to a family here instead, in this order:
//   1. the pixel tokens (text-page-title, text-label) and font-pixel: Silkscreen,
//      which has one weight, so a weight class beside them is ignored;
//   2. a weight class, strongest first, so "font-bold" beats a stray "font-medium",
//      and an explicit font-normal or font-sans last, so "text-display
//      font-normal" draws Geist Regular rather than the token's weight;
//   3. the token's own weight (spec §2: display 700; score, number, heading,
//      headline 600; fine 500);
//   4. Geist Regular.
const PIXEL = /(^|\s)(font-pixel|text-page-title|text-label)(\s|$)/;
const WEIGHT_FAMILIES: Array<[RegExp, string]> = [
  [/(^|\s)font-(extrabold|black)(\s|$)/, FONTS.sansExtrabold],
  [/(^|\s)font-bold(\s|$)/, FONTS.sansBold],
  [/(^|\s)font-semibold(\s|$)/, FONTS.sansSemibold],
  [/(^|\s)font-medium(\s|$)/, FONTS.sansMedium],
  [/(^|\s)font-(normal|sans)(\s|$)/, FONTS.sans],
];
const TOKEN_FAMILIES: Array<[RegExp, string]> = [
  [/(^|\s)text-display(\s|$)/, FONTS.sansBold],
  [/(^|\s)text-(score|number|heading|headline)(\s|$)/, FONTS.sansSemibold],
  [/(^|\s)text-fine(\s|$)/, FONTS.sansMedium],
];
// The number tokens always draw tabular figures; any other text opts in with
// the `tabular-nums` class (NativeWind compiles that class to nothing on native).
const TABULAR = /(^|\s)(text-score|text-number|tabular-nums)(\s|$)/;

export function fontFamilyFor(className?: string): string {
  if (!className) return FONTS.sans;
  if (PIXEL.test(className)) return FONTS.pixel;
  for (const [pattern, family] of WEIGHT_FAMILIES) {
    if (pattern.test(className)) return family;
  }
  for (const [pattern, family] of TOKEN_FAMILIES) {
    if (pattern.test(className)) return family;
  }
  return FONTS.sans;
}

/** What a class list means that NativeWind cannot draw on native: the face, and tabular figures. */
export function textStyleFor(className?: string): TextStyle {
  const style: TextStyle = { fontFamily: fontFamilyFor(className) };
  if (className && TABULAR.test(className)) style.fontVariant = ['tabular-nums'];
  return style;
}

// React 19 passes `ref` as a prop, so it reaches the native text through the spread.
export function Text({ className, style, ...props }: TextProps & { className?: string; ref?: React.Ref<RNText> }) {
  return <RNText className={cn('text-foreground', className)} style={[textStyleFor(className), style]} {...props} />;
}
