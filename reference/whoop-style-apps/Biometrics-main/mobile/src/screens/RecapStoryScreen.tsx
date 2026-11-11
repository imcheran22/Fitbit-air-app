import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Linking, PixelRatio, Pressable, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { ApiError } from '../api/client';
import { fetchRecap, type Recap } from '../api/recaps';
import { useCharacter } from '../characters/CharacterContext';
import { Character } from '../components/characters/Character';
import { hexAlpha } from '../components/characters/palette';
import { characterInfo } from '../components/characters/registry';
import { ViewerProgress } from '../components/recap/ViewerProgress';
import { STORY_FRAME_COUNT, WeeklyStoryFrame, type StoryFrameIndex } from '../components/recap/WeeklyStoryView';
import { Button, buttonIconSize, buttonTextVariants, type ButtonVariant } from '../components/ui/button';
import { Text } from '../components/ui/text';
import { navigateToCoachEntry } from '../navigation/coachNavigation';
import { weekRange } from '../lib/recapCopy';
import { readIncludePrefs } from '../lib/recapPrefs';
import { DESIGN_HEIGHT, DESIGN_WIDTH, exportLayout, recapCoachId, resolveIncludes, type Includes } from '../lib/recapShare';
import { askAboutWeekPrompt } from '../lib/recapShelf';
import { recapTint, type RecapTint } from '../lib/recapTheme';
import type { CharacterId } from '../components/characters/types';
import { showsEndActions, tapSide } from '../lib/storyViewer';
import { openRecap } from '../lib/unwatchedRecap';
import { coachEntryRoute, useCoachStatus } from '../lib/useCoachStatus';
import { EXPORT_NOTICES, useRecapExport } from '../lib/useRecapExport';
import { useEarnedBadges } from '../lib/useEarnedBadges';
import { useStoryViewer } from '../lib/useStoryViewer';
import { cn } from '../lib/utils';

/** A drag down past this (points), or flung faster than CLOSE_VELOCITY, closes the viewer. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 1000;
/** Above the frame: the progress bar and the coach header (design E). */
const TOP_CHROME_HEIGHT = 8 + 3 + 6 + 44 + 6;
/** Under the frame: room for the end actions (the tallest bottom content: two lg rows) or the reply bar. */
const BOTTOM_HEIGHT = 12 + 40 + 10 + 40 + 8;
const SIDE = 16;

type Params = { recap: Recap } | { id: string };
type Loaded = { phase: 'loading' } | { phase: 'ready'; recap: Recap } | { phase: 'missing' } | { phase: 'error' };

// The weekly story viewer (recap restyle 2026-10-05; story placement 2026-10-05). It is the weekly
// recap: a recap push, the ringed avatar and the Sleep shelf open it straight away, by id, or
// a recap screen hands over the recap it already has. On the coach's ground: the animated bar,
// a header with the coach, the week and Share / Close, the frame, and under it "Ask <Coach> about
// your week…" with Save. Each frame runs about five seconds and moves on by itself; tap right
// for next, left for back, hold to pause, swipe down or Close to close. The last frame holds,
// with its end actions (See full recap, Share this week, Watch again) under it. Reduce motion or
// a screen reader: nothing runs by itself, taps step through.
export function RecapStoryScreen() {
  const { params } = useRoute<any>() as { params: Params };
  const navigation = useNavigation<any>();
  const { characterId } = useCharacter();
  const given = 'recap' in params ? params.recap : null;
  const id = given?.id ?? (params as { id: string }).id;
  const [loaded, setLoaded] = useState<Loaded>(given ? { phase: 'ready', recap: given } : { phase: 'loading' });

  const load = useCallback(async () => {
    if (given) return;
    setLoaded({ phase: 'loading' });
    try {
      setLoaded({ phase: 'ready', recap: await fetchRecap(id) });
    } catch (e) {
      // 404: gone (coach data deleted) or not this account's (stale push, account switch).
      setLoaded(e instanceof ApiError && e.status === 404 ? { phase: 'missing' } : { phase: 'error' });
    }
  }, [given, id]);
  useEffect(() => {
    void load();
  }, [load]);

  // New params while a story is up (a push re-uses this screen): it shows the new recap.
  const recap = given ?? (loaded.phase === 'ready' ? loaded.recap : null);
  // Only a week has a story: a month reached by id opens its recap screen instead.
  useEffect(() => {
    if (recap?.kind === 'MONTH') navigation.replace('Recap', { id: recap.id });
  }, [recap, navigation]);

  // On screen: the recap is opened (once), which clears the avatar's ring everywhere.
  useEffect(() => {
    if (recap?.kind === 'WEEK') void openRecap(recap.id, recap.openedAt);
  }, [recap]);

  // The builder's stored choices: a part switched off there stays off here and in a shared frame.
  // Nothing is drawn (and no timer runs) until they load, so a switched-off part never flashes.
  const [prefs, setPrefs] = useState<Partial<Includes> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readIncludePrefs('story').then((stored) => {
      if (!cancelled) setPrefs(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const coachId = recap ? recapCoachId(recap, characterId) : characterId;
  const tint = recapTint(coachId);
  const leave = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'));

  return (
    <View testID="story-viewer" style={{ flex: 1, backgroundColor: tint.ground }}>
      {/* The coach's ground is dark in both themes: light status bar content while the viewer is up. */}
      <StatusBar style="light" />
      {recap?.kind === 'WEEK' && prefs ? (
        <StoryViewer key={recap.id} recap={recap} coachId={coachId} tint={tint} includes={resolveIncludes('story', prefs, recap.stats)} />
      ) : (
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ alignItems: 'flex-end', paddingHorizontal: SIDE - 4 }}>
            <Button testID="story-viewer-close" variant="ghost" size="icon-lg" accessibilityLabel="Close story" className={ON_GROUND_GHOST} onPress={leave}>
              <Ionicons name="close" size={buttonIconSize('icon-lg')} color={tint.text} />
            </Button>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 }}>
            {loaded.phase === 'loading' || (recap && !prefs) ? <ActivityIndicator testID="story-viewer-loading" color={tint.text} /> : null}
            {loaded.phase === 'missing' ? (
              <>
                <Text testID="story-viewer-missing" className="text-center text-body" style={{ color: tint.text }}>This recap isn't available.</Text>
                <Button testID="story-viewer-missing-back" variant="outline" size="lg" style={outlineOn(tint)} onPress={leave}>
                  <TintLabel testID="story-viewer-missing-back-label" color={tint.text}>Go back</TintLabel>
                </Button>
              </>
            ) : null}
            {loaded.phase === 'error' ? (
              <>
                <Text testID="story-viewer-error" className="text-center text-body" style={{ color: tint.text }}>Your recap could not be loaded.</Text>
                <Button testID="story-viewer-retry" variant="outline" size="lg" style={outlineOn(tint)} onPress={() => void load()}>
                  <TintLabel testID="story-viewer-retry-label" color={tint.text}>Try again</TintLabel>
                </Button>
              </>
            ) : null}
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

function StoryViewer({ recap, coachId, tint, includes }: { recap: Recap; coachId: CharacterId; tint: RecapTint; includes: Includes }) {
  const navigation = useNavigation<any>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { characterId } = useCharacter();
  const { status } = useCoachStatus();
  // The reply bar only when the chat would open (coach on and consented).
  const canAsk = coachEntryRoute(status) === 'Coach';

  const leave = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs'));
  const viewer = useStoryViewer({ count: STORY_FRAME_COUNT, autoAdvance: !reduceMotion, onClose: leave });
  const index = viewer.index as StoryFrameIndex;
  const atEnd = showsEndActions({ index, count: STORY_FRAME_COUNT });
  const { exportRef, busy, notice, save, share } = useRecapExport();
  const layout = exportLayout('story', PixelRatio.get());
  // Levels earned in this week, read now: a level dated into the week after the recap was built still shows.
  const badges = useEarnedBadges(recap.periodStart, recap.periodEnd);

  // The share sheet or the Photos prompt is up: the story waits under it.
  const { pause, resume } = viewer;
  useEffect(() => {
    if (busy) pause('share');
    else resume('share');
  }, [busy, pause, resume]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? resume('background') : pause('background')));
    return () => sub.remove();
  }, [pause, resume]);

  // Nothing moves on by itself under VoiceOver / TalkBack: the reader sets the pace by tap.
  useEffect(() => {
    let live = true;
    const apply = (on: boolean) => (on ? pause('screenReader') : resume('screenReader'));
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (live) apply(on);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', apply);
    return () => {
      live = false;
      sub.remove();
    };
  }, [pause, resume]);

  // The frame as large as fits between the chrome above and the bar or end actions below.
  const scale = Math.min(width / DESIGN_WIDTH, (height - insets.top - insets.bottom - TOP_CHROME_HEIGHT - BOTTOM_HEIGHT) / DESIGN_HEIGHT.story);
  const frameW = DESIGN_WIDTH * scale;
  const frameH = DESIGN_HEIGHT.story * scale;

  const dragY = useSharedValue(0);
  const swipe = Gesture.Pan()
    .withTestId('story-viewer-swipe')
    .activeOffsetY(12)
    .failOffsetX([-24, 24])
    .onStart(() => {
      runOnJS(pause)('drag');
    })
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > CLOSE_DISTANCE || e.velocityY > CLOSE_VELOCITY) {
        runOnJS(viewer.close)();
      } else {
        dragY.value = reduceMotion ? 0 : withSpring(0);
      }
    })
    .onFinalize(() => {
      runOnJS(resume)('drag');
    });
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }], opacity: 1 - Math.min(dragY.value / 600, 0.5) }));

  const onTap = (e: GestureResponderEvent) => (tapSide(e.nativeEvent.locationX, frameW) === 'next' ? viewer.next() : viewer.prev());
  const canExport = !busy;
  // Pressing on the chrome (the bar, Save, the end actions) holds the story still.
  const holdChrome = { onPressIn: () => pause('chrome'), onPressOut: () => resume('chrome') };

  // "See full recap": back to the recap screen this story was opened from, or that recap's
  // screen in place of the viewer.
  const fullRecap = () => {
    const state = navigation.getState?.();
    const previous = state ? state.routes[state.index - 1] : undefined;
    if (previous?.name === 'Recap' && previous.params?.id === recap.id) navigation.goBack();
    else navigation.replace('Recap', { id: recap.id });
  };
  const shareWeek = () => navigation.replace('RecapBuilder', { id: recap.id, format: 'story' });
  // Closes the viewer (the Coach tab is under it) with the question in the composer, never sent.
  const ask = () => navigateToCoachEntry(navigation, 'Coach', askAboutWeekPrompt(recap));

  const coachName = characterInfo(coachId).name;
  const askName = characterInfo(characterId).name;

  return (
    <>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <GestureDetector gesture={swipe}>
          <Animated.View style={[{ flex: 1 }, dragStyle]}>
            <View style={{ height: TOP_CHROME_HEIGHT, paddingHorizontal: SIDE, paddingTop: 8, gap: 6 }}>
              <ViewerProgress count={STORY_FRAME_COUNT} index={index} progress={viewer.progress} track={tint.track} fill={tint.text} />
              <View testID="story-viewer-header" className="flex-row items-center" style={{ gap: 10, height: 44 }}>
                <View testID="story-viewer-coach" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                  <Character characterId={coachId} mood="idle" size={28} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text testID="story-viewer-title" numberOfLines={1} className="text-body font-semibold" style={{ color: tint.text }}>{`${coachName} · Your week`}</Text>
                  <Text testID="story-viewer-range" numberOfLines={1} className="text-caption" style={{ color: tint.soft }}>{weekRange(recap.periodStart, recap.periodEnd)}</Text>
                </View>
                <Button testID="story-viewer-share" variant="ghost" size="icon-lg" accessibilityLabel="Share this frame" className={ON_GROUND_GHOST}
                  disabled={!canExport} onPress={() => void share()} {...holdChrome}>
                  <Ionicons name="share-outline" size={buttonIconSize('icon-lg')} color={tint.text} />
                </Button>
                <Button testID="story-viewer-close" variant="ghost" size="icon-lg" accessibilityLabel="Close story" className={ON_GROUND_GHOST} onPress={viewer.close}>
                  <Ionicons name="close" size={buttonIconSize('icon-lg')} color={tint.text} />
                </Button>
              </View>
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: frameW, height: frameH }}>
                <WeeklyStoryFrame testID="story" recap={recap} coachId={coachId} includes={includes} scale={scale} index={index} showProgress={false} badges={badges} />
                <Pressable
                  testID="story-viewer-tap"
                  style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
                  onPressIn={() => pause('hold')}
                  onPressOut={() => resume('hold')}
                  onPress={onTap}
                  // A long hold only pauses: letting go does not also step.
                  delayLongPress={250}
                  onLongPress={() => undefined}
                  accessibilityRole="adjustable"
                  accessibilityLabel={`Your week, frame ${index + 1} of ${STORY_FRAME_COUNT}`}
                  accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                  onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? viewer.next() : viewer.prev())}
                />
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
        <View style={{ height: BOTTOM_HEIGHT, paddingHorizontal: SIDE, paddingTop: 12, paddingBottom: 8, justifyContent: 'flex-end', gap: 10 }}>
          {notice ? (
            <View className="flex-row items-center justify-center gap-3">
              <Text testID="story-viewer-notice" className="text-center text-caption" style={{ color: notice === 'saved' ? tint.soft : '#FCA5A5' }}>
                {EXPORT_NOTICES[notice]}
              </Text>
              {notice === 'denied' ? (
                <Button testID="story-viewer-open-settings" variant="link" size="sm" accessibilityRole="link" onPress={() => void Linking.openSettings()}>
                  <TintLabel testID="story-viewer-open-settings-label" color={tint.text} variant="link" size="sm">Open Settings</TintLabel>
                </Button>
              ) : null}
            </View>
          ) : null}
          {atEnd ? (
            <View testID="story-end-actions" style={{ gap: 10 }}>
              <Button testID="story-end-full-recap" size="lg" style={{ backgroundColor: tint.accent }} onPress={fullRecap} {...holdChrome}>
                <TintLabel testID="story-end-full-recap-label" color={tint.ground} variant="default">See full recap</TintLabel>
              </Button>
              <View className="flex-row" style={{ gap: 10 }}>
                <Button testID="story-end-share" variant="outline" size="lg" className="flex-1" style={outlineOn(tint, tint.accent, 0.4)} onPress={shareWeek} {...holdChrome}>
                  <TintLabel testID="story-end-share-label" color={tint.text}>Share this week</TintLabel>
                </Button>
                <Button testID="story-end-again" variant="outline" size="lg" className="flex-1" style={outlineOn(tint, tint.accent, 0.4)} onPress={viewer.restart} {...holdChrome}>
                  <TintLabel testID="story-end-again-label" color={tint.text}>Watch again</TintLabel>
                </Button>
              </View>
            </View>
          ) : (
            <View testID="story-viewer-reply" className="flex-row items-center" style={{ gap: 10 }}>
              {canAsk ? (
                // Looks like a reply field, so the label sits at the start.
                <Button
                  testID="story-viewer-ask"
                  variant="outline"
                  size="lg"
                  accessibilityHint="Opens the chat with a question about this week, for you to edit and send"
                  onPress={ask}
                  {...holdChrome}
                  className="flex-1 justify-start"
                  style={outlineOn(tint)}
                >
                  <TintLabel color={tint.soft} className="shrink font-normal">{`Ask ${askName} about your week…`}</TintLabel>
                </Button>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <Button testID="story-viewer-save" variant="outline" size="icon-lg" accessibilityLabel="Save image" style={outlineOn(tint)}
                disabled={!canExport} onPress={() => void save()} {...holdChrome}>
                <Ionicons name="download-outline" size={buttonIconSize('icon-lg')} color={tint.text} />
              </Button>
            </View>
          )}
        </View>
      </SafeAreaView>
      {/* The export view: the frame on screen at a fixed size, off screen, the only thing captured
          (none of the viewer's chrome or end actions). */}
      <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0 }}>
        <View ref={exportRef} collapsable={false} testID="story-export-view" style={{ width: layout.width, height: layout.height }}>
          <WeeklyStoryFrame testID="story-export" recap={recap} coachId={coachId} includes={includes} scale={layout.scale} index={index} badges={badges} />
        </View>
      </View>
    </>
  );
}

// The viewer sits on the coach's ground, dark in both app themes, so its Buttons take their colours from the tint
// (style, since the values are runtime) rather than the app's tokens.

/** A ghost Button's pressed fill on the ground; the variant's own follows the app's scheme. */
const ON_GROUND_GHOST = 'active:bg-white/10 dark:active:bg-white/10';

/** An outline Button on the ground: a hairline of `color` (the tint's text by default) over no fill. */
function outlineOn(tint: RecapTint, color: string = tint.text, alpha = 0.45) {
  return { backgroundColor: 'transparent', borderColor: hexAlpha(color, alpha) };
}

/** A Button label in a tint colour. */
function TintLabel({ testID, color, variant = 'outline', size = 'lg', className, children }: {
  testID?: string; color: string; variant?: ButtonVariant; size?: 'sm' | 'lg'; className?: string; children: string;
}) {
  return (
    <Text testID={testID} numberOfLines={1} className={cn(buttonTextVariants({ variant, size }), className)} style={{ color }}>
      {children}
    </Text>
  );
}
