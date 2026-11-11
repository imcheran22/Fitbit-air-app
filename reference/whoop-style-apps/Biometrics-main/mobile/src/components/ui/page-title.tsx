import React from 'react';
import { type TextProps } from 'react-native';
import { cn } from '../../lib/utils';
import { Text } from './text';

export type PageTitleProps = Omit<TextProps, 'children'> & { className?: string; children: string };

// Every screen's title (spec §3): Silkscreen at text-page-title, a header for
// screen readers. The string is uppercased here rather than with a class, so
// what is drawn and what a test reads agree; a screen reader gets the original
// case, which it reads as words rather than spelling out capitals. It wraps by
// default (a long buddy name or handle must not clip): pass numberOfLines to
// truncate instead. font-pixel keeps the face when a caller's one-off size
// replaces text-page-title. Font scaling is left as it is everywhere else.
export function PageTitle({ children, className, accessibilityLabel, ...props }: PageTitleProps) {
  return (
    <Text accessibilityRole="header" accessibilityLabel={accessibilityLabel ?? children} className={cn('font-pixel text-page-title', className)} {...props}>
      {children.toUpperCase()}
    </Text>
  );
}
