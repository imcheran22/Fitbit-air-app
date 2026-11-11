// Social story viewer (spec 2026-10-07 social §4.2): the recap story engine (useStoryViewer + ViewerProgress) over
// a buddy's frames for their day. Reaching the last frame marks it seen (once) and refreshes Social; running past
// the end closes. Replies are stickers, and (S3, on a server with chats) "Message" opens the thread with the frame
// staged; my own story has neither.
// A story with no frames left says so ("Nothing in this story yet."); "isn't available anymore" is for one that is gone.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useReducedMotion } from 'react-native-reanimated';
import { buddyErrorCode, sendSticker, type StickerKind } from '../api/buddies';
import { fetchStory, markStorySeen, type Story, type StoryFrame } from '../api/social';
import { ViewerProgress } from '../components/recap/ViewerProgress';
import { CheckInSheet } from '../components/social/CheckInSheet';
import { SocialStoryFrame } from '../components/social/SocialStoryFrame';
import { Button, buttonIconSize } from '../components/ui/button';
import { Text } from '../components/ui/text';
import { buddyErrorMessage, STICKERS } from '../lib/buddyCopy';
import { frameQuoteLabel } from '../lib/chatCopy';
import { knownStoryFrames, personName } from '../lib/socialCopy';
import { refreshSocial, useSocial } from '../lib/socialStore';
import { useStoryViewer } from '../lib/useStoryViewer';
import type { RootStackParamList } from '../navigation/RootNavigator';

const GROUND = '#0F1230';
// The story is dark in either app scheme, but the Button's tokens and `dark:` classes follow it: these pin the look
// on the story's ground (white Retry / Check in, white-on-dark Close and replies).
const ON_STORY_DEFAULT = 'bg-white';
const ON_STORY_GHOST = 'active:bg-white/10 dark:active:bg-white/10';
const ON_STORY_OUTLINE = 'border-white/30 bg-transparent active:bg-white/10 dark:border-white/30 dark:bg-transparent dark:active:bg-white/10';

type Loaded = { phase: 'loading' } | { phase: 'ready'; story: Story } | { phase: 'empty' } | { phase: 'gone' } | { phase: 'error' };

export function SocialStoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { authorId, mine: mineParam } = (useRoute().params ?? {}) as { authorId: string; mine?: boolean };
  const [loaded, setLoaded] = useState<Loaded>({ phase: 'loading' });
  const leave = useCallback(() => navigation.goBack(), [navigation]);
  // Close the viewer, then open their thread with this frame staged as the quote (spec §4.2, §8.3).
  const openThread = useCallback((story: Story, frame: StoryFrame) => {
    navigation.goBack();
    navigation.navigate('ChatThread', {
      buddyId: story.author.id,
      quote: { request: { type: 'story_frame', at: frame.at }, label: frameQuoteLabel(frame.kind, personName(story.author, false)) },
    });
  }, [navigation]);
  // Retry is not tied to an effect: it checks this, so a load that lands after leaving sets nothing.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (live: () => boolean) => {
    setLoaded({ phase: 'loading' });
    try {
      const story = await fetchStory(authorId);
      // Frames this app can't draw (a newer server's kind or value) are skipped, not drawn blank or mislabelled.
      const frames = knownStoryFrames(story.frames);
      // Nothing left to play (it emptied since the ring was drawn): say so, never an endless loader.
      if (live()) setLoaded(frames.length > 0 ? { phase: 'ready', story: { ...story, frames } } : { phase: 'empty' });
    } catch (e) {
      // No longer buddies (or no such person): gone. Anything else (offline, 5xx): retryable.
      const code = buddyErrorCode(e);
      const status = (e as { status?: number } | null)?.status;
      if (live()) setLoaded(code === 'not_buddies' || status === 404 ? { phase: 'gone' } : { phase: 'error' });
    }
  }, [authorId]);
  useEffect(() => {
    let live = true;
    void load(() => live);
    return () => {
      live = false;
    };
  }, [load]);

  if (loaded.phase === 'ready') return <Viewer story={loaded.story} mineHint={mineParam === true} onClose={leave} onMessage={openThread} />;
  return (
    <SafeAreaView testID={`social-story-${loaded.phase}`} style={{ flex: 1, backgroundColor: GROUND }}>
      <StatusBar style="light" />
      <View className="flex-1 items-center justify-center gap-4 px-8">
        {loaded.phase === 'loading' ? <ActivityIndicator color="#FFFFFF" /> : null}
        {loaded.phase === 'gone' ? <Text className="text-center text-white">This story isn't available anymore.</Text> : null}
        {loaded.phase === 'empty' ? <Text className="text-center text-white">Nothing in this story yet.</Text> : null}
        {loaded.phase === 'error' ? (
          <>
            <Text className="text-center text-white">Couldn't load this story</Text>
            <Button testID="social-story-retry" size="sm" onPress={() => void load(() => mounted.current)} className={ON_STORY_DEFAULT} textClassName="text-black">Retry</Button>
          </>
        ) : null}
        <Button testID="social-story-close" variant="ghost" size="sm" onPress={leave} className={ON_STORY_GHOST} textClassName="text-white">Close</Button>
      </View>
    </SafeAreaView>
  );
}

function Viewer({ story, mineHint, onClose, onMessage }: { story: Story; mineHint: boolean; onClose: () => void; onMessage: (story: Story, frame: StoryFrame) => void }) {
  const social = useSocial();
  // Once the store has loaded it decides; until then the route's hint does.
  const mine = social.status === 'ready' ? social.home.me.person.id === story.author.id : mineHint;
  const myMood = social.status === 'ready' ? social.home.me.checkIn?.mood ?? null : null;
  // A server with chats sends unread.chats (S3); without it there is no thread to open.
  const chatsOn = social.status === 'ready' && typeof social.home.unread?.chats === 'number';
  const reduceMotion = useReducedMotion();
  const [checkingIn, setCheckingIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The ref guards a double tap before the re-render.
  const sending = useRef(false);
  const seen = useRef(false);
  // A sticker reply can land after the viewer closed: no message then.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Set once Message has left for the thread: the story stops, and nothing here closes, navigates or marks it seen
  // again while the viewer is dismissed (a double tap, or the last frame running out underneath).
  const leaving = useRef(false);
  const closeOnce = useCallback(() => {
    if (!leaving.current) onClose();
  }, [onClose]);
  const viewer = useStoryViewer({ count: story.frames.length, autoAdvance: !reduceMotion, onClose: closeOnce });
  const { pause, resume, close } = viewer;
  const last = story.frames.length - 1;
  const openChat = (frame: StoryFrame) => {
    if (leaving.current) return;
    leaving.current = true;
    pause('leaving');
    onMessage(story, frame);
  };

  // Seen = the viewer reached the last frame (spec §4.2), once per open, even if they close right there.
  useEffect(() => {
    if (viewer.index === last && !seen.current && !leaving.current) {
      seen.current = true;
      void markStorySeen(story.author.id, story.frames[last]?.at)
        .catch(() => undefined)
        .finally(() => {
          void refreshSocial();
        });
    }
  }, [viewer.index, last, story.author.id, story.frames]);

  // Past the last frame there are no end actions here: it closes.
  useEffect(() => {
    if (viewer.ended) close();
  }, [viewer.ended, close]);

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

  async function reply(kind: StickerKind) {
    if (sending.current) return;
    sending.current = true;
    setMessage(null);
    try {
      await sendSticker(story.author.id, kind);
      if (mounted.current) setMessage('Sent');
    } catch (e) {
      if (mounted.current) setMessage(buddyErrorMessage(buddyErrorCode(e)));
    } finally {
      sending.current = false;
    }
  }

  // The check-in sheet is up: the story waits under it. After a check-in the frame stays locked in this
  // open viewer; the next open shows the mood.
  const unlock = () => {
    pause('sheet');
    setCheckingIn(true);
  };
  const closeSheet = () => {
    setCheckingIn(false);
    resume('sheet');
  };

  const frame = story.frames[viewer.index]!;
  return (
    <SafeAreaView testID="social-story" style={{ flex: 1, backgroundColor: GROUND }}>
      <StatusBar style="light" />
      <View className="px-4 pt-2">
        <ViewerProgress count={story.frames.length} index={viewer.index} progress={viewer.progress} track="rgba(255,255,255,0.3)" fill="#FFFFFF" />
      </View>
      <View className="flex-row items-center justify-between px-4 py-2">
        <Text testID="social-story-name" numberOfLines={1} className="flex-1 font-semibold text-white">{personName(story.author, mine)}</Text>
        <Button testID="social-story-close" variant="ghost" size="sm" onPress={close} className={ON_STORY_GHOST} textClassName="text-white">Close</Button>
      </View>
      <View testID={`story-frame-${viewer.index}`} className="flex-1">
        <Pressable
          testID="social-story-prev"
          accessibilityRole="button"
          accessibilityLabel="Previous"
          onPress={viewer.prev}
          onPressIn={() => pause('hold')}
          onPressOut={() => resume('hold')}
          // A long hold only pauses: letting go does not also step.
          delayLongPress={250}
          onLongPress={() => undefined}
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%' }}
        />
        <Pressable
          testID="social-story-next"
          accessibilityRole="button"
          // On the last frame Next closes: say so.
          accessibilityLabel={viewer.index === last ? 'Close story' : 'Next'}
          onPress={viewer.next}
          onPressIn={() => pause('hold')}
          onPressOut={() => resume('hold')}
          // A long hold only pauses: letting go does not also step.
          delayLongPress={250}
          onLongPress={() => undefined}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '70%' }}
        />
        {/* Over the tap areas, letting taps through: the locked frame's Check in button stays reachable. */}
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          <SocialStoryFrame frame={frame} author={story.author} mine={mine} onUnlock={unlock} />
        </View>
      </View>
      {mine ? null : (
        <View className="gap-2 px-4 pb-4">
          <View className="flex-row gap-2">
            {STICKERS.map((s) => (
              <Button
                key={s.kind}
                testID={`story-reply-${s.kind}`}
                variant="outline"
                size="sm"
                onPress={() => void reply(s.kind)}
                className={`flex-1 ${ON_STORY_OUTLINE}`}
                textClassName="text-white"
              >
                {s.label}
              </Button>
            ))}
          </View>
          {message ? <Text testID="story-message" className="text-center text-caption text-white/80">{message}</Text> : null}
          {chatsOn ? (
            <Button testID="story-message-button" variant="outline" size="sm" onPress={() => openChat(frame)} className={ON_STORY_OUTLINE}
              textClassName="text-white" iconStart={<Ionicons name="chatbubble-outline" size={buttonIconSize('sm')} color="#FFFFFF" />}>
              {`Message ${personName(story.author, false)}`}
            </Button>
          ) : null}
        </View>
      )}
      <CheckInSheet visible={checkingIn} current={myMood} onClose={closeSheet} />
    </SafeAreaView>
  );
}
