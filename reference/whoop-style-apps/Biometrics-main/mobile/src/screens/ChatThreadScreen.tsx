// A chat thread (spec 2026-10-07 social §8.2; V5 thread board): the header (their KIP with a story ring and the
// active dot, name, "Active now" / "Active 3h ago" and @handle, info → their week), day chips, bubbles, cards,
// reactions, "Seen" and the composer (a staged quote or reply, quick stickers, "+" to share my check-in, "Message…").
// No socket: while focused and the app is active it re-reads the newest page every 5 s (lib/chatThread keeps older pages
// and carries what slides out of the window); their newest message changing marks the thread read and refreshes the tab
// dot. "Seen" and the active line come only from those newest-page reads, never from an older page. A long press on a
// message opens its actions. No longer buddies → "You're no longer buddies."; an older server (bare 404) → "Chats
// aren't available yet" with their week instead; either stops the poll for good (plan ruling P2). Message text is a
// buddy's free text: never logged.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColorScheme } from 'nativewind';
import { blockBuddy, buddyErrorCode, type Person, type StickerKind } from '../api/buddies';
import {
  clearReaction, fetchThread, markChatRead, sendCard, sendStickerMessage, sendText, setReaction, unsendMessage,
  type ChatQuote, type Message, type Thread,
} from '../api/chats';
import { ChatAvatar } from '../components/chats/ChatAvatar';
import { ChatComposer } from '../components/chats/ChatComposer';
import { MessageActionsSheet } from '../components/chats/MessageActionsSheet';
import { MessageBubble } from '../components/chats/MessageBubble';
import { ReportSheet } from '../components/chats/ReportSheet';
import { Button, buttonIconSize } from '../components/ui/button';
import { Text } from '../components/ui/text';
import { buddyErrorMessage } from '../lib/buddyCopy';
import { refreshBuddies } from '../lib/buddiesStore';
import { activeLine, knownMessages, POLL_MS } from '../lib/chatCopy';
import {
  firstWindow, olderWindow, pollWindow, threadItems, threadMessages, withReactions, withSent, withoutMessage, type ThreadWindow,
} from '../lib/chatThread';
import { personName } from '../lib/socialCopy';
import { refreshSocial, useSocial } from '../lib/socialStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { COLORS } from '../theme';

type Phase = 'loading' | 'ready' | 'gone' | 'unavailable' | 'error';

export function ChatThreadScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ChatThread'>>();
  const { buddyId } = route.params;
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const social = useSocial();
  const myCheckIn = social.status === 'ready' ? social.home.me.checkIn : null;
  const ringUnseen = social.status === 'ready' && social.home.stories.some((r) => r.author.id === buddyId && r.unseen);

  const [phase, setPhase] = useState<Phase>('loading');
  const [buddy, setBuddy] = useState<Person | null>(null);
  const [win, setWin] = useState<ThreadWindow | null>(null);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [activeAt, setActiveAt] = useState<string | null>(null);
  const [quote, setQuote] = useState<ChatQuote | null>(route.params.quote ?? null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [reporting, setReporting] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // A double tap before the next render sends once; a late answer after leaving sets nothing; a slower read never lands
  // over a newer one, and a read that left before a send or an unsend landed is dropped (it would hide the message just
  // sent, or bring back the one just unsent, until the next poll).
  const sendingRef = useRef(false);
  const mounted = useRef(true);
  const seq = useRef(0);
  // Bumped by each send, unsend or reaction that lands: an older page fetched before one is dropped (it could bring back
  // a message just unsent).
  const writes = useRef(0);
  // Set while the screen is focused: a read that answers after leaving or going to the background marks nothing read.
  const focused = useRef(false);
  const loaded = useRef(false);
  const lastTheirs = useRef<string | null | undefined>(undefined);
  const loadingOlder = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // No longer buddies, or no chats on this server: nothing more to poll for (plan ruling P2).
  const halted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Opened again from a story, a note or the camp: the new quote replaces the staged one. Opened again without one (a
  // push for this thread, a plain navigate) keeps it.
  useEffect(() => {
    if (route.params.quote) setQuote(route.params.quote);
  }, [route.params.quote]);

  const stopPolling = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }, []);
  const halt = useCallback((to: 'gone' | 'unavailable') => {
    halted.current = true;
    stopPolling();
    setPhase(to);
  }, [stopPolling]);

  // Only the newest page comes through here: it alone carries the current "Seen" and active line.
  const apply = useCallback((page: Thread) => {
    setBuddy(page.buddy);
    setSeenAt(page.seenAt);
    setActiveAt(page.activeAt);
    setWin((w) => (w === null ? firstWindow(page) : pollWindow(w, page)));
    setPhase('ready');
    loaded.current = true;
    // Opening reads the thread; after that, only a new message from them does. Only while I'm looking (focused, app
    // active): otherwise the next read in view marks it. A failed mark is tried again by the next read.
    const theirs = [...page.messages].reverse().find((m) => !m.mine)?.id ?? null;
    if (theirs !== lastTheirs.current && focused.current && AppState.currentState === 'active') {
      lastTheirs.current = theirs;
      void markChatRead(buddyId).then(
        () => refreshSocial(),
        () => {
          if (lastTheirs.current === theirs) lastTheirs.current = undefined;
        },
      );
    }
  }, [buddyId]);

  const load = useCallback(async () => {
    if (halted.current) return;
    const at = ++seq.current;
    try {
      const page = await fetchThread(buddyId);
      if (!mounted.current || at !== seq.current || halted.current) return;
      if (page === null) halt('unavailable');
      else apply(page);
    } catch (e) {
      if (!mounted.current || at !== seq.current || halted.current) return;
      if (buddyErrorCode(e) === 'not_buddies') halt('gone');
      // A failed poll keeps what is shown; only a first load shows the error.
      else if (!loaded.current) setPhase('error');
    }
  }, [buddyId, apply, halt]);

  // Poll while focused and the app is active.
  useFocusEffect(useCallback(() => {
    const start = () => {
      if (timer.current === null && !halted.current) timer.current = setInterval(() => void load(), POLL_MS);
    };
    focused.current = true;
    void load();
    start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        void load();
        start();
      } else {
        stopPolling();
      }
    });
    return () => {
      focused.current = false;
      stopPolling();
      sub.remove();
    };
  }, [load, stopPolling]));

  const loadOlder = async () => {
    const cursor = win?.cursor;
    if (!cursor || loadingOlder.current || halted.current) return;
    loadingOlder.current = true;
    const at = writes.current;
    try {
      // An older page's seenAt and activeAt are ignored: only the newest page's are current. One that left before a
      // send, unsend or reaction landed is dropped; the next scroll to the top reads it again.
      const page = await fetchThread(buddyId, cursor);
      if (page && mounted.current && !halted.current && at === writes.current) setWin((w) => (w ? olderWindow(w, page) : w));
    } catch {
      // The next scroll to the top tries again.
    } finally {
      loadingOlder.current = false;
    }
  };

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    if (sendingRef.current) return null;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await fn();
      // Drop any read already on its way: it was answered before this change.
      seq.current++;
      writes.current++;
      return result;
    } catch (e) {
      const code = buddyErrorCode(e);
      if (mounted.current) {
        if (code === 'not_buddies') halt('gone');
        else setError(buddyErrorMessage(code));
      }
      return null;
    } finally {
      sendingRef.current = false;
      if (mounted.current) setSending(false);
    }
  }

  const landed = (m: Message) => {
    setWin((w) => (w ? withSent(w, m) : w));
    setReplyTo(null);
    void refreshSocial();
  };
  // The composer hands over trimmed text.
  const sendMessageText = async (text: string): Promise<boolean> => {
    const staged = quote;
    const result = await run(() => (staged ? sendCard(buddyId, staged.request, text, replyTo?.id) : sendText(buddyId, text, replyTo?.id)));
    if (!result || !mounted.current) return false;
    if (staged) setQuote(null);
    landed(result.message);
    return true;
  };
  const sendSticker = (kind: StickerKind) => {
    void run(() => sendStickerMessage(buddyId, kind, replyTo?.id)).then((r) => {
      if (r && mounted.current) landed(r.message);
    });
  };
  const shareCheckIn = () => {
    void run(() => sendCard(buddyId, { type: 'my_checkin' }, undefined, replyTo?.id)).then((r) => {
      if (r && mounted.current) landed(r.message);
    });
  };
  const react = (m: Message, kind: StickerKind | null) => {
    setSelected(null);
    void run(async () => {
      if (kind === null) {
        await clearReaction(buddyId, m.id);
        return m.reactions.filter((r) => !r.mine);
      }
      return (await setReaction(buddyId, m.id, kind)).reactions;
    }).then((reactions) => {
      if (reactions && mounted.current) setWin((w) => (w ? withReactions(w, m.id, reactions) : w));
    });
  };
  const unsend = (m: Message) => {
    setSelected(null);
    void run(async () => {
      await unsendMessage(buddyId, m.id);
      return true;
    }).then((ok) => {
      if (!ok || !mounted.current) return;
      setWin((w) => (w ? withoutMessage(w, m.id) : w));
      if (replyTo?.id === m.id) setReplyTo(null);
    });
  };
  const name = buddy ? personName(buddy, false) : '';
  // "Also block {name}" was ticked in the report sheet and the report is filed: the tick is the confirmation (the
  // owner-approved Report board has no second dialog).
  const blockToo = () => {
    setReporting(null);
    void blockBuddy(buddyId).then(
      () => {
        void refreshSocial();
        void refreshBuddies();
        if (mounted.current) navigation.goBack();
      },
      (e: unknown) => {
        if (mounted.current) setError(buddyErrorMessage(buddyErrorCode(e)));
      },
    );
  };

  // Header icon buttons on a bare header: outline icon-lg, as the Coach header (plan ruling P3).
  const back = (
    <Button testID="thread-back" variant="outline" size="icon-lg" accessibilityLabel="Back to chats" onPress={() => navigation.goBack()}>
      <Ionicons name="chevron-back" size={buttonIconSize('icon-lg')} color={colors.foreground} />
    </Button>
  );

  if (phase !== 'ready' || !buddy || !win) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row px-3 pt-1">{back}</View>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          {phase === 'loading' ? <ActivityIndicator testID="thread-loading" /> : null}
          {phase === 'gone' ? <Text testID="thread-gone" className="text-center text-muted-foreground">You're no longer buddies.</Text> : null}
          {phase === 'unavailable' ? (
            <>
              <Text testID="thread-unavailable" className="text-center text-muted-foreground">Chats aren't available yet.</Text>
              <Button testID="thread-open-week" variant="secondary" onPress={() => navigation.replace('BuddyWeek', { buddyId })}>Open their week</Button>
            </>
          ) : null}
          {phase === 'error' ? (
            <>
              <Text testID="thread-load-error" className="text-center text-muted-foreground">Couldn't load this chat.</Text>
              <Button testID="thread-retry" variant="secondary" onPress={() => void load()}>Try again</Button>
            </>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const now = new Date();
  const messages = knownMessages(threadMessages(win));
  // Inverted: the newest at the bottom, older pages load at the top.
  const items = threadItems(messages, seenAt, now).reverse();
  const active = activeLine(activeAt, now.getTime());
  return (
    <SafeAreaView testID="thread" edges={['top', 'bottom']} className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View className="flex-row items-center gap-2.5 border-b border-border px-3 pb-2.5 pt-1">
          {back}
          <ChatAvatar person={buddy} size={40} ring={ringUnseen} active={active === 'Active now'} testID="thread-avatar" />
          <View className="flex-1 gap-px">
            <Text testID="thread-name" numberOfLines={1} className="text-body font-bold">{name}</Text>
            <Text testID="thread-sub" numberOfLines={1} className="text-caption text-muted-foreground">{active ? `${active} · @${buddy.handle}` : `@${buddy.handle}`}</Text>
          </View>
          <Button testID="thread-info" variant="outline" size="icon-lg" accessibilityLabel={`${name}'s week`} onPress={() => navigation.navigate('BuddyWeek', { buddyId })}>
            <Ionicons name="information-circle-outline" size={buttonIconSize('icon-lg')} color={colors.foreground} />
          </Button>
        </View>
        {messages.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text testID="thread-empty" className="text-center text-muted-foreground">{`Say hi to ${name}.`}</Text>
          </View>
        ) : (
          <FlatList
            testID="thread-list"
            inverted
            data={items}
            keyExtractor={(i) => i.key}
            onEndReached={() => void loadOlder()}
            onEndReachedThreshold={0.3}
            contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}
            renderItem={({ item }) =>
              item.type === 'chip' ? (
                <Text testID={item.key} className="my-1 self-center overflow-hidden rounded-[10px] bg-secondary px-2.5 py-0.5 text-caption text-muted-foreground">{item.label}</Text>
              ) : item.type === 'seen' ? (
                <Text testID="thread-seen" className="self-end px-1 text-caption text-muted-foreground">Seen</Text>
              ) : (
                <MessageBubble message={item.message} buddyName={name} onLongPress={setSelected} />
              )
            }
          />
        )}
        {error ? <Text testID="thread-error" className="px-4 pb-1 text-caption text-destructive">{error}</Text> : null}
        <ChatComposer
          disabled={sending}
          quote={quote ? { label: quote.label } : null}
          onClearQuote={() => setQuote(null)}
          replyTo={replyTo ? { label: replyTo.mine ? 'your message' : `${name}'s message` } : null}
          onClearReply={() => setReplyTo(null)}
          canShareCheckIn={myCheckIn !== null}
          onShareCheckIn={shareCheckIn}
          onSticker={sendSticker}
          onSend={sendMessageText}
        />
      </KeyboardAvoidingView>
      <MessageActionsSheet
        message={selected}
        onClose={() => setSelected(null)}
        onReact={react}
        onReply={(m) => {
          setSelected(null);
          setReplyTo(m);
        }}
        onUnsend={unsend}
        onReport={(m) => {
          setSelected(null);
          setReporting(m);
        }}
      />
      <ReportSheet target={reporting ? { type: 'message', id: reporting.id } : null} name={name} onClose={() => setReporting(null)} onBlock={blockToo} />
    </SafeAreaView>
  );
}
