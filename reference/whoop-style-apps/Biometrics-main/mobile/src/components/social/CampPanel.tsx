// The Campfire's pull-up glass panel (redesign 2026-10-07). Three resting heights: Peek (the fire's strength), Half
// (adds the camp note and goodnight) and Full (adds "Who's here" and Message camp). The content is one scroll view;
// a lower stop shows its top part. It snaps to the nearest stop by position and velocity, never in between; the
// handle steps up a stop (Full goes back to Peek), and screen readers get increment / decrement on it. The keyboard
// lifts the panel so the composer stays in view. Same material, radius and spring as the app's Sheet,
// always in its dark scheme.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { vars } from 'nativewind';
import { COLORS, MOTION } from '../../theme';
import { GlassSurface } from '../ui/glass-surface';
import { PEEK_RESERVE } from './campSceneGeometry';

export type CampStop = 'peek' | 'half' | 'full';
export type CampStops = Record<CampStop, number>;
export const STOP_ORDER: readonly CampStop[] = ['peek', 'half', 'full'];
export const STOP_LABEL: Record<CampStop, string> = { peek: 'peek', half: 'half open', full: 'fully open' };
const PANEL_RADIUS = 38;
/** The handle row and the fire's strength: what Peek shows above the home indicator. */
export const PEEK_CONTENT = 106;

/**
 * Each stop's panel top, in px from the screen's top. Peek: the handle and the fire above the home indicator (never
 * taller than PEEK_RESERVE, the room the scene keeps clear). Half: 40% down. Full: 11% down, below the status bar.
 */
export function panelStops(height: number, insets: { top: number; bottom: number }): CampStops {
  return {
    peek: height - Math.min(PEEK_RESERVE, PEEK_CONTENT + insets.bottom),
    half: Math.round(height * 0.4),
    full: Math.max(insets.top + 8, Math.round(height * 0.11)),
  };
}

/** A release faster than this (px/s) is a flick: it moves one stop that way, however short the drag. */
export const FLICK_VELOCITY = 500;

/**
 * The stop a drag released at `y` with velocity `vy` (px/s, down is positive) settles on. A flick goes to the next
 * stop past `y` in its direction (or stays at the end); a slower release goes to the nearest stop.
 */
export function snapStop(stops: CampStops, y: number, vy: number): CampStop {
  'worklet';
  const all = ['peek', 'half', 'full'] as const;
  if (vy < -FLICK_VELOCITY || vy > FLICK_VELOCITY) {
    const up = vy < 0;
    let next: CampStop | null = null;
    for (const s of all) {
      const past = up ? stops[s] < y - 1 : stops[s] > y + 1;
      if (past && (next === null || Math.abs(stops[s] - y) < Math.abs(stops[next] - y))) next = s;
    }
    return next ?? (up ? 'full' : 'peek');
  }
  let best: CampStop = 'peek';
  for (const s of all) {
    if (Math.abs(stops[s] - y) < Math.abs(stops[best] - y)) best = s;
  }
  return best;
}

/** The handle's tap: up a stop, and from Full back to Peek. */
export const nextStop = (stop: CampStop): CampStop => STOP_ORDER[(STOP_ORDER.indexOf(stop) + 1) % STOP_ORDER.length]!;

/** Increment (up) and decrement (down), stopping at either end. */
export function stepStop(stop: CampStop, by: 1 | -1): CampStop {
  const i = Math.min(STOP_ORDER.length - 1, Math.max(0, STOP_ORDER.indexOf(stop) + by));
  return STOP_ORDER[i]!;
}

/** The panel's stop and its animated top. Reduce Motion snaps with no spring. */
export function useCampPanel(stops: CampStops, reduced: boolean) {
  const [stop, setStop] = useState<CampStop>('peek');
  const top = useSharedValue(stops.peek);
  const latest = useRef({ stops, reduced });
  latest.current = { stops, reduced };
  // `velocity`: a drag's release speed (px/s), so the spring carries on from it.
  const moveTo = useCallback((next: CampStop, velocity = 0) => {
    setStop(next);
    const y = latest.current.stops[next];
    top.value = latest.current.reduced ? y : withSpring(y, { ...MOTION.spring.settle, velocity });
  }, [top]);
  // A new screen size (rotation, split view) moves the panel to its stop's new top.
  useEffect(() => {
    top.value = stops[stop];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops.peek, stops.half, stops.full]);
  return { stop, moveTo, top };
}

/**
 * Where to scroll the panel so the composer clears the keyboard: Share's bottom (and 12 px) at the bottom of what's
 * visible, but never so far that the input's top goes under the header. `top` / `bottom` are the composer's input top
 * and Share bottom in the scroll content; `stopTop` is the panel's stop, `header` the handle and fire block above the
 * scroll view.
 */
export function revealScrollY(o: { height: number; keyboard: number; stopTop: number; full: number; header: number; top: number; bottom: number }): number {
  const viewportTop = Math.max(o.full, o.stopTop - o.keyboard) + o.header;
  const visible = o.height - o.keyboard - viewportTop;
  return Math.max(0, Math.min(o.bottom + 12 - visible, o.top - 8));
}

/** The keyboard's height: as state (it is up or not), and as a shared value that follows it in and out. */
function useKeyboard(reduced: boolean): { up: number; lift: SharedValue<number> } {
  const [up, setUp] = useState(0);
  const height = useSharedValue(0);
  useEffect(() => {
    // iOS says where the keyboard is headed before it moves; Android only once it has.
    const ios = Platform.OS === 'ios';
    const to = (h: number, duration: number) => {
      setUp(h);
      height.value = reduced ? h : withTiming(h, { duration: duration || 250 });
    };
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => to(e.endCoordinates.height, e.duration));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => to(0, e.duration));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [height, reduced]);
  return { up, lift: height };
}

interface CampPanelProps {
  stops: CampStops;
  stop: CampStop;
  top: SharedValue<number>;
  moveTo: (stop: CampStop, velocity?: number) => void;
  height: number;
  bottomInset: number;
  /** A screen reader is on: the panel scrolls at every stop, so all of it can be reached. */
  screenReader: boolean;
  reduced: boolean;
  /** The composer's input top and Share bottom in the scroll content, kept in view above the keyboard. */
  reveal: { top: number; bottom: number } | null;
  /** Always in view (Peek's content): it and the handle are where the panel is dragged from. */
  header: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The app's dark theme tokens (global.css), set on the panel's subtree: the owner approved dark glass over the pixel
 * scene, so the panel and everything in it is dark even when the app is light.
 */
const DARK_TOKENS = vars({
  '--color-background': '10 11 14',
  '--color-foreground': '245 245 244',
  '--color-muted': '28 31 38',
  '--color-muted-foreground': '155 157 166',
  '--color-card': '20 22 27',
  '--color-card-foreground': '245 245 244',
  '--color-border': '34 37 44',
  '--color-secondary': '28 31 38',
  '--color-secondary-foreground': '245 245 244',
  '--color-accent': '45 212 191',
  '--color-accent-foreground': '10 11 14',
  '--color-destructive': '248 113 113',
  '--color-surface-raised': '28 31 38',
  '--color-hairline': '44 47 55',
});
const colors = COLORS.dark;

/**
 * Button overrides for the panel. Its tokens are always dark, but a Button's `dark:` classes follow the app's scheme,
 * so in a light app an outline or destructive Button would take its light look on dark tokens. These pin the dark
 * look in both schemes (secondary, default and ghost need nothing: they use tokens only).
 */
export const PANEL_OUTLINE = 'border-input bg-input/30 active:bg-input/50';
export const PANEL_DESTRUCTIVE = 'bg-destructive/20 active:bg-destructive/30';

export function CampPanel({ stops, stop, top, moveTo, height, bottomInset, screenReader, reduced, reveal, header, children }: CampPanelProps) {
  const keyboard = useKeyboard(reduced);
  const scroll = useRef<ScrollView>(null);
  const start = useSharedValue(0);
  const [headerH, setHeaderH] = useState(0);

  // A lower stop shows the top of the content (once the keyboard is down).
  useEffect(() => {
    if (stop !== 'full' && !keyboard.up) scroll.current?.scrollTo({ y: 0, animated: !reduced });
  }, [stop, reduced, keyboard.up]);

  // With the keyboard up (it lifts the panel at most to Full), scroll the composer into what's left in view: on a
  // short phone Share would otherwise sit under the keyboard. Again whenever the composer's size changes.
  useEffect(() => {
    if (!keyboard.up || !reveal) return;
    const y = revealScrollY({ height, keyboard: keyboard.up, stopTop: stops[stop], full: stops.full, header: headerH, top: reveal.top, bottom: reveal.bottom });
    scroll.current?.scrollTo({ y, animated: !reduced });
  }, [keyboard.up, reveal?.top, reveal?.bottom, headerH, height, stop, stops, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Built once per size: not on every render (a keystroke in the note re-renders the panel).
  const drag = useMemo(() => Gesture.Pan()
    .withTestId('camp-panel-drag')
    .activeOffsetY([-8, 8])
    .onStart(() => {
      start.value = top.value;
    })
    .onUpdate((e) => {
      top.value = Math.min(stops.peek, Math.max(stops.full, start.value + e.translationY));
    })
    .onEnd((e) => {
      const y = Math.min(stops.peek, Math.max(stops.full, start.value + e.translationY));
      runOnJS(moveTo)(snapStop(stops, y, e.velocityY), e.velocityY);
    }), [stops, moveTo, top, start]);

  // The keyboard lifts the panel by its height, up to Full.
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(stops.full, top.value - keyboard.lift.value) }],
  }));

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') moveTo(stepStop(stop, 1));
    else if (e.nativeEvent.actionName === 'decrement') moveTo(stepStop(stop, -1));
    else if (e.nativeEvent.actionName === 'activate') moveTo(nextStop(stop));
  };

  // Taller than Full by a corner's worth, so its bottom corners stay below the screen.
  const panelHeight = height - stops.full + PANEL_RADIUS * 2;
  return (
    <Animated.View testID="camp-panel" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: panelHeight }, panelStyle]}>
      <GlassSurface scheme="dark" fallbackColor={colors.surfaceRaised} borderRadius={PANEL_RADIUS}
        style={{ flex: 1, borderWidth: 1, borderColor: colors.hairline }}>
        <View style={[DARK_TOKENS, { flex: 1 }]}>
          <GestureDetector gesture={drag}>
            <View testID="camp-panel-header" onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
              <Pressable testID="camp-panel-handle" accessibilityRole="adjustable" accessibilityLabel={`Camp details, ${STOP_LABEL[stop]}`}
                accessibilityHint={stop === 'full' ? 'Shows less' : 'Shows more'}
                accessibilityActions={[{ name: 'activate' }, { name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={onAction}
                onPress={() => moveTo(nextStop(stop))} className="h-[30px] items-center justify-center">
                <View className="h-1 w-10 rounded-full bg-muted-foreground/40" />
              </Pressable>
              <View className="px-5">{header}</View>
            </View>
          </GestureDetector>
          <ScrollView ref={scroll} testID="camp-panel-scroll" scrollEnabled={stop === 'full' || screenReader || keyboard.up > 0} keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={stop === 'full'}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: stops[stop] - stops.full + PANEL_RADIUS * 2 + bottomInset + 24, gap: 14 }}>
            {children}
          </ScrollView>
        </View>
      </GlassSurface>
    </Animated.View>
  );
}
