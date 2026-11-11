import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, View, ScrollView, KeyboardAvoidingView, Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import {
  StaleConversationError,
  fetchCoachStatus,
  fetchConversation,
  fetchLatestConversation,
  fetchTodaySummary,
  type AnswerCardDTO,
  type CoachEngineDTO,
  type TodaySummaryDTO,
} from '../api/coach';
import { Text } from '../components/ui/text';
import { PageTitle } from '../components/ui/page-title';
import { Button, buttonIconSize } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { PromptBar } from '../components/coach/PromptBar';
import { ThinkingRow } from '../components/coach/thinking/ThinkingRow';
import { CoachToday, TODAY_FOOTNOTE, todayShowsFootnote } from '../components/coach/CoachToday';
import { CoachMessageRow } from '../components/coach/CoachMessageRow';
import { ErrorCard } from '../components/coach/ErrorCard';
import { ConversationsSheet } from '../components/coach/ConversationsSheet';
import { Character } from '../components/characters/Character';
import { characterInfo } from '../components/characters/registry';
import { STAGE_W } from '../components/characters/attachments/frames';
import { SPRITE_SIZE } from '../components/characters/sprites/compose';
import { DEFAULT_THINKING_TEXT } from '../components/characters/thinking';
import { useCharacterMood } from '../characters/useCharacterMood';
import { useScreenFocused } from '../characters/useScreenFocused';
import { PressableScale } from '../components/ui/pressable-scale';
import { COLORS } from '../theme';
import type { TabParamList } from '../navigation/TabsNavigator';
import { useTabBarClearance } from '../navigation/tabBarLayout';
import { useKeyboardVisible } from '../lib/useKeyboardVisible';
import { useCharacterOptional } from '../characters/CharacterContext';
import { useCoachConversation, type CoachChatMessage } from '../lib/useCoachConversation';
import { suggestedQuestions } from '../lib/coachToday';
import { cardDestination } from '../lib/coachAnswers';

type CoachRoute = RouteProp<TabParamList, 'Coach'>;

type Phase = 'loading' | 'unavailable' | 'needs-consent' | 'ready';

// How long the steps checklist stays up, all ticked, once the answer starts (spec §5).
const STEPS_LINGER_MS = 300;

// The header coach, and its slot: wide enough for the thinking attachment's stage.
const HEADER_CHARACTER_SIZE = 36;
const HEADER_SLOT_WIDTH = (HEADER_CHARACTER_SIZE * STAGE_W) / SPRITE_SIZE;

// How close to the bottom (pt) still counts as reading the latest message.
const NEAR_BOTTOM = 80;

// Why a past conversation picked from the sheet did not open.
const CHAT_NOTES = {
  gone: { testID: 'coach-conversation-gone', text: 'That conversation is no longer available.' },
  failed: { testID: 'coach-conversation-failed', text: "Couldn't open that conversation just now. Try again in a moment." },
} as const;

function nearBottom({ contentOffset, contentSize, layoutMeasurement }: NativeScrollEvent): boolean {
  return contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_BOTTOM;
}

// The Coach page (spec 1): header, today's summary, suggested questions, the
// conversation (streamed sentence by sentence) and the composer. Loading and
// gating (status, character picker, consent) live here; the conversation
// itself lives in useCoachConversation.
export function CoachScreen() {
  const navigation = useNavigation<any>();
  const clearance = useTabBarClearance();
  const keyboardVisible = useKeyboardVisible();
  const route = useRoute<CoachRoute>();
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const prefill = route?.params?.prefill;
  const characterCtx = useCharacterOptional();
  const { id: characterId, name } = characterInfo(characterCtx?.characterId);
  const thinkingText = characterCtx?.thinkingText ?? DEFAULT_THINKING_TEXT;

  const [phase, setPhase] = useState<Phase>('loading');
  const [input, setInput] = useState(prefill ?? '');
  const [engine, setEngine] = useState<CoachEngineDTO>('local');
  const [today, setToday] = useState<TodaySummaryDTO | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  // A past conversation picked from the sheet did not open: gone (404) or failed.
  const [chatNote, setChatNote] = useState<keyof typeof CHAT_NOTES | null>(null);
  // Follow the end of the chat as it grows: on after a send, off after a
  // history restore (the page opens at the top, today first) and while the
  // user has scrolled up to read.
  const followEnd = useRef(false);
  // Bumped by every send, new chat and conversation open: an older history
  // load that resolves later must not replace what the user has moved on to.
  const chatSeq = useRef(0);
  const focused = useScreenFocused();
  const scrollRef = useRef<ScrollView>(null);
  const mounted = useRef(true);
  const redirectedToConsent = useRef(false);
  // Meet your coach opens by itself at most once per mount of this tab.
  const pickerOpened = useRef(false);
  const loadInFlight = useRef(false);
  // A load requested while another is in flight (e.g. tab focus during the first
  // load). The in-flight result may be stale by then, so it is discarded and
  // one fresh load runs instead.
  const reloadPending = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  // True when the status check itself could not be completed, as opposed to
  // having completed and said the coach is available.
  const [statusUnverified, setStatusUnverified] = useState(false);
  const phaseRef = useRef<Phase>('loading');
  phaseRef.current = phase;
  // True only once the conversation history was actually fetched and applied.
  const historyLoaded = useRef(false);
  // The last non-empty prefill. The route param is consumed once applied (below),
  // but the consent round-trip must still carry it.
  const lastPrefill = useRef<string | undefined>(prefill);

  const conversation = useCoachConversation({
    preferredEngine: engine,
    onConsentRequired: () => navigation.navigate('CoachConsent', { prefill: undefined }),
    onDisabled: () => setPhase('unavailable'),
  });
  const { messages, conversationId, streaming, waiting, steps, answeredAt, error, send, stop, retry, overrideSafety, newChat } = conversation;
  const restoreHook = conversation.restore;
  // History opens at the top of the page, with today in view.
  const restore = useCallback(
    (past: Parameters<typeof restoreHook>[0]) => {
      followEnd.current = false;
      restoreHook(past);
    },
    [restoreHook],
  );
  const mood = useCharacterMood({ sending: streaming, answeredAt });
  const lingering = useStepsLinger(waiting, thinkingText === 'steps' && steps.length > 0 && steps.every((step) => step.done));
  // The linger is for an answer that started. A turn the server stopped, or one
  // that failed, drops the row at once; so does New chat (it clears the steps).
  const lastMessage = messages[messages.length - 1];
  const turnCut = !!error || (lastMessage?.role === 'assistant' && (lastMessage.state === 'stopped' || lastMessage.state === 'interrupted'));
  const showThinking = waiting || (lingering && steps.length > 0 && !turnCut);
  // Read inside load(): a message just sent (before its conversationId
  // arrives) must stop a focus reload from replacing the chat with history.
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const messagesRef = useRef<CoachChatMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A prefill can arrive after this tab is already mounted; the param is
  // consumed once applied, so the same text arriving again is a change again.
  useEffect(() => {
    if (!prefill) return;
    lastPrefill.current = prefill;
    setInput(prefill);
    navigation.setParams?.({ prefill: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const openPicker = useCallback(() => {
    if (pickerOpened.current) return false;
    pickerOpened.current = true;
    navigation.navigate('MeetYourCoach', { mode: 'first' });
    return true;
  }, [navigation]);

  // First Coach-tab visit with the coach enabled and no character chosen yet:
  // the picker comes first, before consent. Only over this tab.
  const providerStatus = characterCtx?.statusLoaded ? characterCtx.status : null;
  const providerSaysNotChosen = !!providerStatus?.enabled && providerStatus.personaChosen === false;
  useEffect(() => {
    if (providerSaysNotChosen && focused && navigation.isFocused?.() !== false) openPicker();
  }, [providerSaysNotChosen, focused, navigation, openPicker]);

  // Today's summary. A failed refresh keeps what is on screen; a failed first
  // load simply leaves the section out.
  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    try {
      const summary = await fetchTodaySummary();
      if (mounted.current) setToday(summary);
    } catch {
      // Keep the last summary, if any.
    } finally {
      if (mounted.current) setTodayLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (loadInFlight.current) {
      reloadPending.current = true;
      return;
    }
    loadInFlight.current = true;
    try {
      let status;
      try {
        status = await fetchCoachStatus();
      } catch {
        // The status request did not complete: stay usable, but say so.
        if (mounted.current) {
          setStatusUnverified(true);
          setPhase('ready');
          void loadToday();
        }
        return;
      }
      if (!mounted.current || reloadPending.current) return;
      setStatusUnverified(false);
      if (!status.enabled) {
        setPhase('unavailable');
        return;
      }
      setEngine(status.engine ?? 'local');
      const pickerJustOpened = status.personaChosen === false && navigation.isFocused?.() !== false && openPicker();
      if (!status.consented) {
        if (redirectedToConsent.current) {
          setPhase('needs-consent');
          return;
        }
        if (pickerJustOpened || navigation.isFocused?.() === false) return;
        redirectedToConsent.current = true;
        navigation.navigate('CoachConsent', { prefill: lastPrefill.current });
        return;
      }
      redirectedToConsent.current = false;
      void loadToday();
      // Once the chat is showing, a focus reload only re-checks status and
      // today: re-reading history would wipe what the live chat shows.
      if (phaseRef.current === 'ready' && (historyLoaded.current || conversationIdRef.current || messagesRef.current.length > 0)) return;
      const seq = chatSeq.current;
      const latest = await fetchLatestConversation();
      if (!mounted.current || reloadPending.current) return;
      // The user sent, or opened another chat, meanwhile: keep that.
      if (seq !== chatSeq.current) return;
      restore(latest);
      historyLoaded.current = true;
      setPhase('ready');
    } catch {
      // Past messages are a convenience: failing to load them must not stop a new question.
      if (mounted.current) setPhase('ready');
    } finally {
      loadInFlight.current = false;
      if (reloadPending.current) {
        reloadPending.current = false;
        if (mounted.current) void loadRef.current();
      }
    }
  }, [navigation, openPicker, loadToday, restore]);
  loadRef.current = load;

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tab stays mounted while the user visits consent and comes back.
  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', () => {
      void load();
    });
    return unsubscribe;
  }, [navigation, load]);

  // A turn that got through settles an unverified status: the coach is there.
  useEffect(() => {
    if (answeredAt !== null || conversationId) setStatusUnverified(false);
  }, [answeredAt, conversationId]);

  // Screen readers hear once that the answer is in (not for a safety reply,
  // a stop or an error: answeredAt is only set for a finished answer).
  useEffect(() => {
    if (answeredAt !== null) AccessibilityInfo.announceForAccessibility('Answer ready');
  }, [answeredAt]);

  // A question from a suggestion, a bar, a chip or the field. Stable, so the
  // memoised today summary and rows do not re-render on every keystroke.
  const ask = useCallback(
    (text: string): boolean => {
      const sent = send(text);
      if (sent) {
        chatSeq.current += 1;
        followEnd.current = true;
        lastPrefill.current = undefined;
        setChatNote(null);
      }
      return sent;
    },
    [send],
  );

  const retryTurn = useCallback(() => {
    followEnd.current = true;
    retry();
  }, [retry]);

  const resendWithOverride = useCallback(
    (originalMessage: string) => {
      followEnd.current = true;
      overrideSafety(originalMessage);
    },
    [overrideSafety],
  );

  // Without a summary there is no day to open; cardDestination then opens each page on its default day.
  const cardDate = today?.date ?? '';
  const openSource = useCallback(
    (card: AnswerCardDTO) => {
      const target = cardDestination(card, cardDate);
      navigation.navigate(target.name, target.params);
    },
    [navigation, cardDate],
  );

  function sendTyped() {
    if (ask(input)) setInput('');
  }

  async function openConversation(id: string) {
    setSheetOpen(false);
    setChatNote(null);
    const seq = ++chatSeq.current;
    try {
      const past = await fetchConversation(id);
      if (!mounted.current || seq !== chatSeq.current) return;
      restore(past);
      historyLoaded.current = true;
    } catch (e) {
      // Stay on the chat that is showing, and say why gently.
      if (mounted.current && seq === chatSeq.current) setChatNote(e instanceof StaleConversationError ? 'gone' : 'failed');
    }
  }

  function startNewChat() {
    setSheetOpen(false);
    setChatNote(null);
    chatSeq.current += 1;
    followEnd.current = false;
    newChat();
    historyLoaded.current = true;
  }

  const onContentSizeChange = useCallback(() => {
    if (followEnd.current) scrollRef.current?.scrollToEnd({ animated: true });
  }, []);
  // Only the user's own scrolling decides whether to keep following; the
  // programmatic scrollToEnd fires no drag events.
  const stopFollowing = useCallback(() => {
    followEnd.current = false;
  }, []);
  const followIfNearBottom = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    followEnd.current = nearBottom(e.nativeEvent);
  }, []);

  const ready = phase === 'ready' && !statusUnverified;
  const header = (
    <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
      <View className="flex-row items-center gap-3">
        {/* A fixed slot as wide as the coach with its attachment (36 × 36/24), so
            the title stays put as the attachment comes and goes. */}
        <View testID="coach-header-slot" style={{ width: HEADER_SLOT_WIDTH, alignItems: 'flex-start' }}>
          <Character testID="coach-header-character" mood={mood} size={HEADER_CHARACTER_SIZE} paused={!focused} />
        </View>
        <PageTitle>Coach</PageTitle>
      </View>
      {ready ? (
        <View className="flex-row gap-2">
          <Button
            testID="coach-conversations-button"
            variant="outline"
            size="icon-lg"
            accessibilityLabel="Conversations and coach memory"
            onPress={() => setSheetOpen(true)}
          >
            <Ionicons name="menu-outline" size={buttonIconSize('icon-lg')} color={colors.foreground} />
          </Button>
          <Button testID="coach-new-chat-button" variant="outline" size="icon-lg" accessibilityLabel="New chat" onPress={startNewChat}>
            <Ionicons name="create-outline" size={buttonIconSize('icon-lg')} color={colors.foreground} />
          </Button>
        </View>
      ) : null}
    </View>
  );

  if (phase === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-background">
        {header}
        <View testID="coach-loading" className="gap-3 p-5">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="ml-auto h-10 w-1/2" />
          <Skeleton className="h-16 w-3/4" />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'needs-consent') {
    return (
      <SafeAreaView className="flex-1 bg-background">
        {header}
        <View testID="coach-needs-consent" className="flex-1 items-center justify-center gap-4 p-8">
          <Character mood="idle" size={56} glow paused={!focused} />
          <Text className="text-center text-body text-muted-foreground">The coach needs your OK before it can look at your scores.</Text>
          <Button testID="coach-review-consent-button" onPress={() => navigation.navigate('CoachConsent', { prefill: lastPrefill.current })}>
            Review what is shared
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'unavailable') {
    return (
      <SafeAreaView className="flex-1 bg-background">
        {header}
        <View testID="coach-unavailable" className="flex-1 items-center justify-center gap-4 p-8">
          <Character mood="idle" size={56} paused={!focused} />
          <Text className="text-center text-body text-muted-foreground">The AI Coach is not available right now.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const last = messages[messages.length - 1];
  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')?.text;

  return (
    <SafeAreaView className="flex-1 bg-background">
      {header}
      {/* KeyboardAvoidingView owns its paddingBottom on iOS, so the bar clearance sits on this wrapper. */}
      <View testID="coach-clearance" style={{ flex: 1, paddingBottom: keyboardVisible ? 0 : clearance }}>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
          <ScrollView
            ref={scrollRef}
            testID="coach-scroll"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 16, paddingHorizontal: 20, paddingVertical: 12, flexGrow: 1 }}
            onContentSizeChange={onContentSizeChange}
            onScrollBeginDrag={stopFollowing}
            onScrollEndDrag={followIfNearBottom}
            onMomentumScrollEnd={followIfNearBottom}
          >
            {chatNote ? (
              <Text testID={CHAT_NOTES[chatNote].testID} className="px-1 text-caption text-muted-foreground">
                {CHAT_NOTES[chatNote].text}
              </Text>
            ) : null}

            {statusUnverified ? (
              <Text testID="coach-status-unverified" className="px-1 text-caption text-muted-foreground">
                We couldn't check the coach just now. You can still send a message.
              </Text>
            ) : null}

            <CoachToday summary={today} loading={todayLoading} onAsk={ask} />
            {/* The page's one disclaimer: CoachToday shows it beside its comparisons, the page otherwise. */}
            {!todayShowsFootnote(today) ? (
              <Text testID="coach-today-footnote" className="text-caption text-muted-foreground">
                {TODAY_FOOTNOTE}
              </Text>
            ) : null}

            {messages.length === 0 && !streaming ? (
              <View testID="coach-empty" className="items-center gap-4 py-4">
                <Character testID="coach-hero-character" mood={mood} size={64} paused={!focused} />
                <View className="items-center gap-1 px-4">
                  <Text accessibilityRole="header" className="text-center text-heading">
                    What would you like to know?
                  </Text>
                  <Text className="text-center text-caption text-muted-foreground">Ask about your data, or anything health and fitness.</Text>
                </View>
                <View className="w-full gap-2">
                  {suggestedQuestions(today).map((question, index) => (
                    <PressableScale
                      key={question}
                      testID={`coach-suggestion-${index}`}
                      accessibilityRole="button"
                      onPress={() => ask(question)}
                      className="flex-row items-center justify-between rounded-tile border border-border bg-card px-4 py-3.5"
                    >
                      <Text className="shrink text-body">{question}</Text>
                      <Ionicons name="arrow-up" size={16} color={colors.muted} />
                    </PressableScale>
                  ))}
                </View>
              </View>
            ) : null}

            {messages.map((message) => {
              const showFollowUps = message === last && message.role === 'assistant' && !streaming && message.state === 'done' && !message.safety;
              const unsettledSafety = !!message.safety && !message.safety.overridden;
              return (
                <CoachMessageRow
                  key={message.clientKey ?? message.id}
                  message={message}
                  showFollowUps={showFollowUps}
                  lastQuestion={showFollowUps ? lastQuestion : undefined}
                  busy={showFollowUps || unsettledSafety ? streaming : false}
                  onAsk={ask}
                  onOverrideSafety={resendWithOverride}
                  onOpenSource={openSource}
                />
              );
            })}

            {showThinking ? (
              <View className="items-start">
                <ThinkingRow style={thinkingText} characterId={characterId} steps={steps} paused={!focused} testID="coach-thinking" />
              </View>
            ) : null}

            {error ? <ErrorCard error={error} onRetry={retryTurn} /> : null}
          </ScrollView>

          <View className="px-4 pb-2 pt-1">
            <PromptBar value={input} onChangeText={setInput} onSend={sendTyped} busy={streaming} onStop={stop} placeholder={`Ask ${name} anything…`} />
          </View>
        </KeyboardAvoidingView>
      </View>

      <ConversationsSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onOpen={(id) => void openConversation(id)}
        onNewChat={startNewChat}
        onOpenMemory={() => {
          setSheetOpen(false);
          navigation.navigate('CoachMemory');
        }}
        currentId={conversationId}
      />
    </SafeAreaView>
  );
}

// True for STEPS_LINGER_MS after `waiting` turns false, when `allTicked`: the
// steps happen quickly, so the finished checklist stays up long enough to
// read. Steps persist after the turn (useCoachConversation), so the lingering
// row shows them all ticked. A turn that ended unticked (an error, a stop)
// drops the row at once.
function useStepsLinger(waiting: boolean, allTicked: boolean): boolean {
  const [lingering, setLingering] = useState(false);
  const wasWaiting = useRef(false);
  const allTickedRef = useRef(allTicked);
  allTickedRef.current = allTicked;
  useEffect(() => {
    if (waiting) {
      wasWaiting.current = true;
      setLingering(false);
      return undefined;
    }
    if (!wasWaiting.current) return undefined;
    wasWaiting.current = false;
    if (!allTickedRef.current) return undefined;
    setLingering(true);
    const timer = setTimeout(() => setLingering(false), STEPS_LINGER_MS);
    return () => clearTimeout(timer);
  }, [waiting]);
  return lingering;
}
