import React from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '../../lib/utils';

// A surface one step above the background. Depth comes from that step and a
// hairline border, not a drop shadow (shadows vanish on the dark background).
export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('rounded-card border border-border bg-card p-4', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('mb-2', className)} {...props} />;
}

export function CardContent({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn('', className)} {...props} />;
}
