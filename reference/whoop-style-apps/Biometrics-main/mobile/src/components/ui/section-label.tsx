import React from 'react';
import { type TextProps } from 'react-native';
import { cn } from '../../lib/utils';
import { Text } from './text';

// The small uppercase pixel label that heads a group ("YOUR METRICS"): the
// text-label token in Silkscreen (font-pixel keeps the face under a size override). Screens use this instead of a bold title per
// card, so hierarchy comes from the numbers.
export function SectionLabel({ className, children, ...props }: TextProps & { className?: string }) {
  return (
    <Text className={cn('font-pixel text-label uppercase text-muted-foreground', className)} {...props}>
      {children}
    </Text>
  );
}
