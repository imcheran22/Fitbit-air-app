import React, { createContext, useContext, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type GestureResponderEvent,
  type Insets,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { MOTION, TYPE_TOKENS } from '../../theme';
import { Text } from './text';

// The app's standard button: shadcn/ui's Base Button (base-vega) ported to
// React Native + NativeWind. Same variants, sizes and classes as far as RN
// allows; the web-only parts (focus rings, svg sizing, hover) are dropped, and
// hover becomes the pressed (`active:`) state.
//
// Every size is an exact px class (h-[36px], not h-9): NativeWind's native rem
// is 14, so rem-based classes would draw 12.5% under shadcn's sizes.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ButtonTextSize = 'default' | 'xs' | 'sm' | 'lg';
export type ButtonIconSize = 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';
export type ButtonSize = ButtonTextSize | ButtonIconSize;

export const buttonVariants = cva(
  'shrink-0 flex-row items-center justify-center gap-[6px] rounded-[8px] border border-transparent active:opacity-90',
  {
    variants: {
      variant: {
        default: 'bg-foreground',
        // No shadow-xs: NativeWind's native shadows draw far darker than the web's.
        outline: 'border-border bg-card active:bg-muted dark:border-input dark:bg-input/30 dark:active:bg-input/50',
        secondary: 'bg-secondary active:bg-secondary/80',
        ghost: 'active:bg-muted dark:active:bg-muted/50',
        destructive: 'bg-destructive/10 active:bg-destructive/20 dark:bg-destructive/20 dark:active:bg-destructive/30',
        link: '',
      },
      size: {
        default: 'h-[36px] px-[10px]',
        xs: 'h-[24px] gap-[4px] px-[8px]',
        sm: 'h-[32px] gap-[4px] px-[10px]',
        lg: 'h-[40px] px-[12px]',
        icon: 'size-[36px]',
        'icon-xs': 'size-[24px]',
        'icon-sm': 'size-[32px]',
        'icon-lg': 'size-[40px]',
      },
    },
    // A link is just underlined text: no fixed height or side padding.
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

// shadcn's has-data-[icon=inline-start|end] padding: the icon side sits a
// little tighter than the text side.
const ICON_START_PADDING: Record<ButtonTextSize, string> = { default: 'pl-[8px]', xs: 'pl-[6px]', sm: 'pl-[6px]', lg: 'pl-[10px]' };
const ICON_END_PADDING: Record<ButtonTextSize, string> = { default: 'pr-[8px]', xs: 'pr-[6px]', sm: 'pr-[6px]', lg: 'pr-[10px]' };

// Kept separate from buttonTextVariants so the loading spinner can take the
// label colour (NativeWind maps `text-*` onto ActivityIndicator's `color`).
const TEXT_COLOR: Record<ButtonVariant, string> = {
  default: 'text-background',
  outline: 'text-foreground',
  secondary: 'text-secondary-foreground',
  ghost: 'text-foreground',
  destructive: 'text-destructive',
  link: 'text-foreground underline',
};

// The label sizes are type tokens (spec §3): text-body on default, lg and the
// icon sizes, text-caption on sm, text-fine on xs; all Geist 500.
const TEXT_BODY = 'text-body';
const TEXT_FINE = 'text-fine';

export const buttonTextVariants = cva('font-medium', {
  variants: {
    variant: TEXT_COLOR,
    size: {
      default: TEXT_BODY,
      xs: TEXT_FINE,
      sm: 'text-caption',
      lg: TEXT_BODY,
      icon: TEXT_BODY,
      'icon-xs': TEXT_FINE,
      'icon-sm': TEXT_BODY,
      'icon-lg': TEXT_BODY,
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

/** shadcn's default svg size per button size (size-3 on the xs sizes, size-4 elsewhere), for icon children. */
export function buttonIconSize(size: ButtonSize = 'default'): number {
  return size === 'xs' || size === 'icon-xs' ? 12 : 16;
}

// The drawn height of each size in px (and width, for the square icon sizes),
// matching the px classes above. A link has no fixed height: one line of its
// text-body label (15/21).
const SIZE_PX: Record<ButtonSize, { height: number; width?: number }> = {
  xs: { height: 24 },
  sm: { height: 32 },
  default: { height: 36 },
  lg: { height: 40 },
  'icon-xs': { height: 24, width: 24 },
  'icon-sm': { height: 32, width: 32 },
  icon: { height: 36, width: 36 },
  'icon-lg': { height: 40, width: 40 },
};
const LINK_HEIGHT = 21;

export const MIN_TOUCH_TARGET = 44;

/**
 * Invisible hitSlop that grows the tappable area to at least 44x44 while the
 * button keeps its exact shadcn size. Each side gets half the shortfall. A
 * measured layout (from onLayout) wins over the nominal size; text sizes have
 * no nominal width, so they get side slop only once measured.
 */
export function hitSlopFor(
  size: ButtonSize = 'default',
  variant: ButtonVariant = 'default',
  layout?: { width: number; height: number },
): Insets {
  const nominal = SIZE_PX[size];
  const height = layout?.height ?? (variant === 'link' ? LINK_HEIGHT : nominal.height);
  const width = layout?.width ?? nominal.width ?? MIN_TOUCH_TARGET;
  const vertical = Math.max(0, (MIN_TOUCH_TARGET - height) / 2);
  const horizontal = Math.max(0, (MIN_TOUCH_TARGET - width) / 2);
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}

/** How far down a pressed button sits: shadcn's 1-px nudge, none with reduced motion (it only dims). */
export function pressNudge(reduced: boolean, pressed: boolean): number {
  return pressed && !reduced ? MOTION.buttonPress.translateY : 0;
}

type GroupPosition = 'first' | 'middle' | 'last';
const ButtonGroupContext = createContext<{ position: GroupPosition; separator: boolean } | null>(null);

// Inside a ButtonGroup, inner corners go square and each button after the
// first overlaps its neighbour's border by 1 px.
const GROUP_CLASSES: Record<GroupPosition, string> = {
  first: 'rounded-r-none',
  middle: '-ml-px rounded-none',
  last: '-ml-px rounded-l-none',
};

type ButtonBaseProps = Omit<PressableProps, 'style' | 'children'> & {
  variant?: ButtonVariant | null;
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** A string is wrapped in a Text with the variant's label classes; anything else renders as-is. */
  children?: React.ReactNode;
  /** Shown before the label (shadcn's data-icon="inline-start"). Replaced by the spinner while loading. */
  iconStart?: React.ReactNode;
  /** Shown after the label (shadcn's data-icon="inline-end"). */
  iconEnd?: React.ReactNode;
  /** Shows a spinner in the icon-start slot, disables the button and marks it busy. */
  loading?: boolean;
  /** Merged onto the label Text when children is a string. */
  textClassName?: string;
  /** testID for the label Text when children is a string. */
  labelTestID?: string;
  /** The loading spinner's colour, when a style override changes the label colour. A textClassName colour is followed already. */
  spinnerColor?: string;
  /**
   * Line limit for a string label. Defaults to 1 (truncate with an ellipsis);
   * pass 0 or undefined to let the label wrap, with `h-auto` and vertical
   * padding on className so the button grows with it.
   */
  numberOfLines?: number;
};

// An icon-only button has no text for a screen reader, so it must be labelled.
export type ButtonProps = ButtonBaseProps &
  ({ size: ButtonIconSize; accessibilityLabel: string } | { size?: ButtonTextSize | null; accessibilityLabel?: string });

export function Button(buttonProps: ButtonProps) {
  const {
    variant: variantProp,
    size: sizeProp,
    className,
    style,
    children,
    iconStart,
    iconEnd,
    loading = false,
    textClassName,
    labelTestID,
    spinnerColor,
    numberOfLines: linesProp,
    disabled,
    accessibilityRole: roleProp,
    accessibilityState,
    hitSlop,
    testID,
    onPressIn,
    onPressOut,
    onLayout,
    ...props
  } = buttonProps;
  const variant: ButtonVariant = variantProp ?? 'default';
  // A link reads as a link to a screen reader unless the caller says otherwise
  // (an inline text *action* such as Undo passes accessibilityRole="button").
  const accessibilityRole = roleProp ?? (variant === 'link' ? 'link' : 'button');
  // An explicit numberOfLines (even undefined) is the caller's choice; only an absent one means one line.
  const labelLines = 'numberOfLines' in buttonProps ? linesProp || undefined : 1;
  const size: ButtonSize = sizeProp ?? 'default';
  const isIconSize = size.startsWith('icon');
  const isDisabled = !!disabled || !!accessibilityState?.disabled || loading;
  const group = useContext(ButtonGroupContext);

  const reduced = useReducedMotion();
  const nudge = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: nudge.value }] }));
  function animateTo(pressed: boolean) {
    nudge.value = withTiming(pressNudge(reduced, pressed), { duration: MOTION.buttonPress.duration });
  }

  const [layout, setLayout] = useState<{ width: number; height: number }>();

  const startSlot = loading ? (
    <ActivityIndicator
      testID={`${testID ?? 'button'}-spinner`}
      size="small"
      color={spinnerColor}
      className={spinnerColor ? undefined : spinnerClass(variant, textClassName)}
    />
  ) : (
    iconStart
  );
  const hasStart = startSlot != null && startSlot !== false;
  const hasEnd = iconEnd != null && iconEnd !== false;

  return (
    <AnimatedPressable
      testID={testID}
      disabled={isDisabled}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled, ...(loading ? { busy: true } : null) }}
      hitSlop={hitSlop ?? hitSlopFor(size, variant, layout)}
      className={cn(
        buttonVariants({ variant, size }),
        !isIconSize && hasStart && variant !== 'link' && ICON_START_PADDING[size as ButtonTextSize],
        !isIconSize && hasEnd && variant !== 'link' && ICON_END_PADDING[size as ButtonTextSize],
        group && GROUP_CLASSES[group.position],
        group?.separator && group.position !== 'first' && 'border-l border-l-border',
        isDisabled && 'opacity-50',
        className,
      )}
      style={[style, animatedStyle]}
      onPressIn={(e: GestureResponderEvent) => {
        animateTo(true);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        animateTo(false);
        onPressOut?.(e);
      }}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        // A caller's hitSlop wins, so the measurement would go unused.
        if (hitSlop == null) setLayout((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
        onLayout?.(e);
      }}
      {...props}
    >
      {startSlot}
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text testID={labelTestID} numberOfLines={labelLines} className={cn(buttonTextVariants({ variant, size }), textClassName)}>
          {children}
        </Text>
      ) : (
        children
      )}
      {iconEnd}
    </AnimatedPressable>
  );
}

// The size classes a textClassName can carry: stock, arbitrary, and the type
// tokens matched whole, so a colour such as text-score-good stays a colour.
const SIZE_CLASS = new RegExp(`^text-(?:\\[\\d|(?:xs|sm|base|lg|xl|\\dxl|${TYPE_TOKENS.join('|')})$)`);

// Only the colour classes of a textClassName, so the spinner follows a label
// colour override without picking up font sizes.
function spinnerClass(variant: ButtonVariant, textClassName?: string): string {
  const colours = (textClassName ?? '').split(/\s+/).filter((c) => /^text-/.test(c) && !SIZE_CLASS.test(c));
  return cn(TEXT_COLOR[variant], colours);
}

type ButtonGroupProps = ViewProps & {
  className?: string;
  /** A 1-px `border` line between buttons, for groups of filled variants (outline ones share their borders already). */
  separator?: boolean;
};

// The group's buttons, with Fragments opened so each of their children is its own position.
function groupItems(children: React.ReactNode, prefix = ''): Array<{ key: string; element: React.ReactElement }> {
  return React.Children.toArray(children).flatMap((child, i) => {
    if (!React.isValidElement(child)) return [];
    const key = `${prefix}${child.key ?? i}`;
    if (child.type === React.Fragment) return groupItems((child.props as { children?: React.ReactNode }).children, `${key}/`);
    return [{ key, element: child }];
  });
}

/**
 * A row of joined Buttons (shadcn's ButtonGroup): inner corners squared and
 * borders overlapped, so outline buttons share one hairline between them.
 * Children that are not elements (null, false) are skipped.
 */
export function ButtonGroup({ className, separator = false, children, ...props }: ButtonGroupProps) {
  const items = groupItems(children);
  return (
    <View role="group" className={cn('flex-row items-stretch', className)} {...props}>
      {items.map(({ key, element }, i) => {
        const position: GroupPosition | null =
          items.length < 2 ? null : i === 0 ? 'first' : i === items.length - 1 ? 'last' : 'middle';
        return (
          <ButtonGroupContext.Provider key={key} value={position && { position, separator }}>
            {element}
          </ButtonGroupContext.Provider>
        );
      })}
    </View>
  );
}
