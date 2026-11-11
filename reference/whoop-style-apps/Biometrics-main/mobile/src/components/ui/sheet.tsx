import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Modal, PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useColorScheme } from 'nativewind';
import { COLORS, MOTION } from '../../theme';
import { GlassSurface } from './glass-surface';

const SHEET_RADIUS = 38;

export const DISMISS_DISTANCE = 80;
export const DISMISS_VELOCITY = 0.8;

export function shouldDismiss(dy: number, vy: number): boolean {
  return dy > DISMISS_DISTANCE || vy > DISMISS_VELOCITY;
}

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** False while the sheet must stay up (a request in flight): a backdrop tap, the Android back button or a drag does nothing. */
  dismissible?: boolean;
  children: React.ReactNode;
  testID?: string;
}

// Bottom detail sheet. Slides in on show; a backdrop tap, the Android back
// button, or a downward drag on the handle slides it out and then calls
// `onClose` exactly once. `onClose` MUST hide the sheet by setting `visible`
// to false; a parent that leaves it visible gets a stuck overlay. (A parent
// that flips `visible` off directly just makes it disappear, without the exit
// animation. If that happens mid-exit, the pending `onClose` still fires once
// when the exit timer ends; the timer is cleared only when the sheet is shown
// again or unmounts.) While `dismissible` is false, none of the three closes it.
export function Sheet({ visible, onClose, dismissible = true, children, testID = 'sheet' }: SheetProps) {
  const { height } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'light' ? 'light' : 'dark';
  const colors = COLORS[scheme];
  const reduced = useReducedMotion();
  const translateY = useSharedValue(height);
  const closing = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest values for the show effect, which must only re-run when `visible`
  // changes (a resize or reduce-motion toggle mid-exit must not reset it).
  const latest = useRef({ height, reduced });
  latest.current = { height, reduced };

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    clearCloseTimer();
    closing.current = false;
    translateY.value = latest.current.height;
    translateY.value = latest.current.reduced ? 0 : withSpring(0, MOTION.spring.settle);
  }, [visible, clearCloseTimer, translateY]);

  // Never call onClose after the sheet has unmounted.
  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const dismiss = useCallback(() => {
    if (closing.current || !dismissible) return;
    closing.current = true;
    if (reduced) {
      onClose();
      return;
    }
    translateY.value = withTiming(height, { duration: MOTION.duration.normal });
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      onClose();
    }, MOTION.duration.normal);
  }, [dismissible, height, onClose, reduced, translateY]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderMove: (_e, g) => {
          translateY.value = Math.max(0, g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          if (dismissible && shouldDismiss(g.dy, g.vy)) dismiss();
          else translateY.value = withSpring(0, MOTION.spring.settle);
        },
      }),
    [dismiss, dismissible, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent onRequestClose={dismiss}>
      <View testID={testID} className="flex-1 justify-end">
        <Pressable
          testID={`${testID}-backdrop`}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={dismiss}
          className="absolute inset-0 bg-black/50"
        />
        {/* Inset and fully rounded, as iOS 26 draws a partial sheet, on the
            same material as the tab bar (glass where available). */}
        <Animated.View style={[sheetStyle, { marginHorizontal: 8, marginBottom: 8 }]}>
          <GlassSurface
            scheme={scheme}
            fallbackColor={colors.surfaceRaised}
            borderRadius={SHEET_RADIUS}
            style={{ paddingHorizontal: 16, paddingBottom: 28, paddingTop: 8, borderWidth: 1, borderColor: colors.hairline }}
          >
            <View testID={`${testID}-handle`} className="items-center py-2" {...pan.panHandlers}>
              <View className="h-1 w-10 rounded-full bg-muted-foreground/40" />
            </View>
            {children}
          </GlassSurface>
        </Animated.View>
      </View>
    </Modal>
  );
}
