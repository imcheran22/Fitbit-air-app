import { useEffect } from "react";
import { RefreshCw } from "lucide-react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { haptic } from "../haptics";
import { DURATION, EASE } from "../motion";
import { ring, useShadow } from "../shadow";
import { useTheme } from "../theme";

// The web's pull to sync (pulse src/components/shells/AppLifecycle.tsx): pull distance is half the finger's travel, a
// pull of TRIGGER starts a sync, and the indicator follows the finger up to MAX.
const TRIGGER = 64;
const MAX = 96;
// How long the chip stays after a pull: the owner asked for 1-2 s. The sync itself shows on the band's ring in the
// header, so the chip does not wait for it.
const SHOWN_MS = 1500;
const ease = { duration: DURATION.fast, easing: EASE.standard };

/**
 * Pull down at the top of a scroll view to run `onRefresh`. Returns a pan gesture to run alongside the scroll view's
 * native gesture, and the indicator to draw over the screen. The pull counts only when the finger lands while the
 * view is at the top, as on the web.
 */
export function usePullToSync(offset: SharedValue<number>, onRefresh?: () => void | Promise<unknown>) {
  const pull = useSharedValue(0);
  const armed = useSharedValue(false);
  /** 1 for SHOWN_MS after a pull (the chip stays and spins), 0 otherwise. */
  const syncing = useSharedValue(0);
  const run = () => {
    syncing.value = withTiming(1, ease);
    void Promise.resolve(onRefresh?.()).catch(() => {});
    setTimeout(() => (syncing.value = withTiming(0, ease)), SHOWN_MS);
  };
  const gesture = Gesture.Pan()
    .enabled(!!onRefresh)
    // Only a downward drag: a sideways one (a chart's scrub) or an upward one (a scroll) never becomes a pull.
    .activeOffsetY(10)
    .failOffsetX([-15, 15])
    .onBegin(() => {
      armed.value = offset.value <= 0;
    })
    .onUpdate((e) => {
      if (!armed.value) return;
      const next = Math.max(0, Math.min(e.translationY / 2, MAX));
      // Felt as the pull crosses the point where letting go syncs.
      if (pull.value < TRIGGER && next >= TRIGGER) runOnJS(haptic.success)();
      pull.value = next;
    })
    .onFinalize(() => {
      const fire = armed.value && pull.value >= TRIGGER;
      armed.value = false;
      pull.value = withTiming(0, ease);
      if (fire) runOnJS(run)();
    });
  return { gesture, indicator: onRefresh ? <PullIndicator pull={pull} syncing={syncing} /> : null };
}

/**
 * The web's indicator: a round chip with the refresh arrows, turning with the pull, then held and spinning for
 * SHOWN_MS after the pull; the header's band ring shows the sync from there.
 */
function PullIndicator({ pull, syncing }: { pull: SharedValue<number>; syncing: SharedValue<number> }) {
  const { c } = useTheme();
  const shadow = useShadow();
  const insets = useSafeAreaInsets();
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1);
  }, [spin]);
  const chip = useAnimatedStyle(() => {
    const at = Math.max(pull.value, syncing.value * TRIGGER);
    return { opacity: Math.min(1, at / TRIGGER), transform: [{ translateY: at / 2 }] };
  });
  const icon = useAnimatedStyle(() => ({ transform: [{ rotate: `${syncing.value > 0 ? spin.value : pull.value * 3}deg` }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", top: insets.top + 8, alignSelf: "center", zIndex: 40, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c["background-mid"], boxShadow: shadow("overlay", ring(c.border, { inset: false })) }, chip]}
    >
      <Animated.View style={icon}>
        <RefreshCw size={16} strokeWidth={2} color={c.foreground} />
      </Animated.View>
    </Animated.View>
  );
}
