import React, { useContext, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { Character } from '../components/characters/Character';
import { StoryRing, useStoryRing } from '../components/recap/StoryRing';
import { readyCardTitle } from '../lib/recapCopy';
import { useSocialUnreadCount } from '../lib/socialStore';
import { Text } from '../components/ui/text';
import { useCoachStatus } from '../lib/useCoachStatus';
import { useKeyboardVisible } from '../lib/useKeyboardVisible';
import { COLORS, MOTION } from '../theme';
import {
  FLOATING_BAR_HEIGHT,
  FLOATING_BAR_MARGIN,
  FLOATING_BAR_RADIUS,
  HUB_TAB,
  TAB_LABELS,
  activeIndicatorTarget,
  indicatorAnimates,
  slotCenterX,
} from './tabBarLayout';

// The short line on the bar's top edge that marks the active tab.
const INDICATOR_WIDTH = 20;
const INDICATOR_HEIGHT = 3;
// The bar has a 1 dp border, so its content area is 2 dp shorter.
const SLOT_HEIGHT = FLOATING_BAR_HEIGHT - 2;
// Small enough to sit inside the lower bar without crowding its icons.
const HUB_CHARACTER_SIZE = 52;

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Activity: 'calendar-outline',
  Social: 'people-outline',
  Profile: 'person-outline',
};

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useContext(SafeAreaInsetsContext);
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'light' ? 'light' : 'dark';
  const colors = COLORS[scheme];
  const reduced = useReducedMotion();
  const keyboardVisible = useKeyboardVisible();
  const { status, refresh } = useCoachStatus();
  const [innerWidth, setInnerWidth] = useState(0);
  // An unwatched recap rings the Profile icon too (the same store as the Home avatar). A tap
  // still opens Profile.
  const ring = useStoryRing(scheme);
  // Incoming requests + unseen stickers; 0 until the Social home has loaded (and on an older backend).
  const socialUnread = useSocialUnreadCount();

  const activeName = state.routes[state.index]?.name ?? 'Home';
  // The hub character always idles, on every tab (spec §1, Performance). It is
  // only dimmed while the coach is off or its status unknown, which every coach
  // entry treats the same way.
  const hubDimmed = !status || !status.enabled;
  const target = activeIndicatorTarget(activeName);

  // Consent can change while another tab is open (accept, revoke), so re-read
  // the coach status whenever the user moves between tabs -- but not on first
  // render, where useCoachStatus has already fetched.
  const previousIndex = useRef(state.index);
  useEffect(() => {
    if (previousIndex.current === state.index) return;
    previousIndex.current = state.index;
    void refresh();
  }, [state.index, refresh]);

  const indicatorX = useSharedValue(0);
  const indicatorScale = useSharedValue(target.visible ? 1 : 0);
  const measuredWidth = useRef(0);
  useEffect(() => {
    const x = slotCenterX(target.index, innerWidth, state.routes.length) - INDICATOR_WIDTH / 2;
    const scale = target.visible ? 1 : 0;
    const animate = indicatorAnimates(measuredWidth.current, reduced);
    measuredWidth.current = innerWidth;
    indicatorX.value = animate ? withSpring(x, MOTION.spring.settle) : x;
    indicatorScale.value = animate ? withSpring(scale, MOTION.spring.settle) : scale;
  }, [target.index, target.visible, innerWidth, state.routes.length, reduced, indicatorX, indicatorScale]);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: indicatorX.value }, { scaleX: indicatorScale.value }] }));

  const hidden = useSharedValue(0);
  useEffect(() => {
    hidden.value = withTiming(keyboardVisible ? 1 : 0, { duration: MOTION.duration.fast });
  }, [keyboardVisible, hidden]);
  const barStyle = useAnimatedStyle(() => ({
    opacity: 1 - hidden.value,
    transform: [{ translateY: hidden.value * (FLOATING_BAR_HEIGHT + 40) }],
  }));

  function press(route: (typeof state.routes)[number], focused: boolean) {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      (navigation.navigate as unknown as (name: string, params?: object) => void)(route.name, route.params);
    }
  }

  return (
    <Animated.View
      testID="floating-tab-bar"
      pointerEvents={keyboardVisible ? 'none' : 'box-none'}
      accessibilityElementsHidden={keyboardVisible}
      importantForAccessibility={keyboardVisible ? 'no-hide-descendants' : 'auto'}
      style={[{ position: 'absolute', left: 20, right: 20, bottom: Math.max(insets?.bottom ?? 0, FLOATING_BAR_MARGIN) }, barStyle]}
    >
      {/* A quiet, solid rounded rectangle: icons only, with the active tab
          marked by a short line on the top edge and its label. */}
      <View
        testID="floating-tab-bar-surface"
        style={{
          height: FLOATING_BAR_HEIGHT,
          borderRadius: FLOATING_BAR_RADIUS,
          paddingHorizontal: 4,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: scheme === 'dark' ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
          shadowColor: '#000',
          shadowOpacity: scheme === 'dark' ? 0.25 : 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <View className="flex-1 flex-row items-center" onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}>
          <Animated.View
            testID="tab-indicator"
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: INDICATOR_WIDTH,
                height: INDICATOR_HEIGHT,
                borderBottomLeftRadius: INDICATOR_HEIGHT,
                borderBottomRightRadius: INDICATOR_HEIGHT,
                backgroundColor: colors.foreground,
              },
              indicatorStyle,
            ]}
          />
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const isHub = route.name === HUB_TAB;
            const label = TAB_LABELS[route.name] ?? route.name;
            const ringed = route.name === 'Profile' && ring !== null;
            const dotted = route.name === 'Social' && socialUnread > 0;
            const icon = <Ionicons name={ICONS[route.name] ?? 'ellipse-outline'} size={ringed ? 16 : 22} color={focused ? colors.foreground : colors.muted} />;
            return (
              <Pressable
                key={route.key}
                testID={`tab-${route.name}`}
                accessibilityRole="button"
                // The tab still opens Profile, so it says what is ready, not what a tap plays.
                accessibilityLabel={ringed ? `${label}. ${readyCardTitle(ring.recap)}` : dotted ? `${label}, ${socialUnread} new` : label}
                accessibilityState={{ selected: focused }}
                onPress={() => press(route, focused)}
                hitSlop={4}
                className="flex-1 items-center justify-center"
                style={{ height: SLOT_HEIGHT }}
              >
                {isHub ? (
                  <Character testID="hub-character" mood="idle" size={HUB_CHARACTER_SIZE} dimmed={hubDimmed} />
                ) : (
                  <View className="items-center" style={{ gap: 3 }}>
                    {ringed ? (
                      <StoryRing testID="tab-Profile-story-ring" color={ring.color} size={26} ringWidth={2} gap={2} dotSize={9} surface={colors.card}>
                        <View className="flex-1 items-center justify-center">{icon}</View>
                      </StoryRing>
                    ) : dotted ? (
                      // The border is the bar's colour, so the dot is cut out of the icon.
                      <View>
                        {icon}
                        <View
                          testID="tab-Social-dot"
                          pointerEvents="none"
                          style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.card }}
                        />
                      </View>
                    ) : (
                      icon
                    )}
                    {focused ? (
                      <Text testID={`tab-label-${route.name}`} className="text-fine font-semibold" style={{ color: colors.foreground }}>
                        {label}
                      </Text>
                    ) : null}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}
