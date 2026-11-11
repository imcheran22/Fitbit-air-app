import React from 'react';
import { View, type ViewProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Text } from './text';

const badgeVariants = cva('self-start rounded-full px-2.5 py-1', {
  variants: {
    variant: {
      accent: 'bg-accent/10',
      muted: 'bg-muted',
      destructive: 'bg-destructive/10',
    },
  },
  defaultVariants: { variant: 'muted' },
});

const textVariants = cva('text-caption font-medium', {
  variants: {
    variant: {
      accent: 'text-accent',
      muted: 'text-muted-foreground',
      destructive: 'text-destructive',
    },
  },
  defaultVariants: { variant: 'muted' },
});

interface BadgeProps extends ViewProps, VariantProps<typeof badgeVariants> {
  className?: string;
  children: React.ReactNode;
}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      <Text className={textVariants({ variant })}>{children}</Text>
    </View>
  );
}
