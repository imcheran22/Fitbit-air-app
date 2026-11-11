// The Chats inbox (spec 2026-10-07 social §8.1; the owner-approved Inbox board), pushed from Social's Chats button:
// back, my @handle, New message; search (filters conversations by name or handle on the phone — never message text);
// the notes row; then "Messages" with "Requests (N)" and one row per conversation, newest first, paging at the end.
// Re-read on focus and whenever the Social home changes (a buddy push in the foreground refreshes it). An older server
// (bare 404) shows "Chats aren't available yet" and Buddies instead. Message and note text is a buddy's free text:
// never logged.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColorScheme } from 'nativewind';
import { blockBuddy, buddyErrorCode } from '../api/buddies';
import { fetchChats, fetchNotes, sendStickerMessage, type BuddyNote, type ChatRow as ChatRowData, type ChatsPage, type Notes } from '../api/chats';
import { ChatRow } from '../components/chats/ChatRow';
import { NewChatSheet } from '../components/chats/NewChatSheet';
import { NoteComposerSheet } from '../components/chats/NoteComposerSheet';
import { NotesRow } from '../components/chats/NotesRow';
import { ReportSheet } from '../components/chats/ReportSheet';
import { Button, buttonIconSize } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Text } from '../components/ui/text';
import { inputTextStyle } from '../components/ui/input-style';
import { PageTitle } from '../components/ui/page-title';
import { buddyErrorMessage } from '../lib/buddyCopy';
import { refreshBuddies } from '../lib/buddiesStore';
import { noteQuoteLabel } from '../lib/chatCopy';
import { personName } from '../lib/socialCopy';
import { refreshSocial, useSocial } from '../lib/socialStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { COLORS } from '../theme';

type Phase = 'loading' | 'ready' | 'unavailable' | 'error';

/** Rows in order, each buddy once (a page boundary can repeat a row). */
function uniqueRows(rows: ChatRowData[]): ChatRowData[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.buddy.id) ? false : (seen.add(r.buddy.id), true)));
}

export function ChatsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const social = useSocial();
  const home = social.status === 'ready' ? social.home : null;
  const [phase, setPhase] = useState<Phase>('loading');
  const [page, setPage] = useState<ChatsPage | null>(null);
  const [more, setMore] = useState<ChatRowData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [reportNote, setReportNote] = useState<BuddyNote | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const loadingMore = useRef(false);
  // A slower read never lands over a newer one.
  const seq = useRef(0);

  const load = useCallback(async () => {
    const at = ++seq.current;
    try {
      // A failed notes read keeps the notes already shown (`undefined`); an older server's null clears them.
      const [chats, nextNotes] = await Promise.all([fetchChats(), fetchNotes().catch(() => undefined)]);
      if (at !== seq.current) return;
      if (chats === null) {
        setPhase('unavailable');
        return;
      }
      setPage(chats);
      setMore([]);
      setCursor(chats.nextCursor);
      if (nextNotes !== undefined) setNotes(nextNotes);
      setPhase('ready');
    } catch {
      if (at === seq.current) setPhase((p) => (p === 'ready' ? p : 'error'));
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));
  // The Social home changes when something happened (a buddy push in the foreground, a read): read again.
  const lastHome = useRef(home);
  useEffect(() => {
    if (lastHome.current === home) return;
    lastHome.current = home;
    void load();
  }, [home, load]);

  const loadMore = async () => {
    if (!cursor || loadingMore.current) return;
    loadingMore.current = true;
    const at = seq.current;
    try {
      const next = await fetchChats(cursor);
      if (next && at === seq.current) {
        setMore((prev) => [...prev, ...next.chats]);
        setCursor(next.nextCursor);
      }
    } catch {
      // Keep what is shown; the next scroll to the end tries again.
    } finally {
      loadingMore.current = false;
    }
  };

  const cheer = (buddyId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    void sendStickerMessage(buddyId, 'CHEER')
      .then(
        () => {
          setMessage('Sent a Cheer');
          // The new Social home re-reads the inbox (the effect above): no second read here.
          void refreshSocial();
        },
        (e: unknown) => setMessage(buddyErrorMessage(buddyErrorCode(e))),
      )
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  };

  // A note report with "Also block" ticked: the report is filed, then its author is blocked. No second confirm (the
  // checkbox is explicit; Task 14 ruling), as in the thread. The new Social home re-reads the inbox.
  const blockNoteAuthor = () => {
    const note = reportNote;
    setReportNote(null);
    if (!note) return;
    setMessage(null);
    void blockBuddy(note.person.id).then(
      () => {
        setMessage(`Blocked ${personName(note.person, false)}`);
        void refreshSocial();
        void refreshBuddies();
      },
      (e: unknown) => setMessage(buddyErrorMessage(buddyErrorCode(e))),
    );
  };

  const ready = phase === 'ready' && page !== null;
  // Header icon buttons on a bare header: outline icon-lg, as the Coach header (plan ruling P3).
  const header = (
    <View className="flex-row items-center gap-2 px-3 pt-1">
      <Button testID="chats-back" variant="outline" size="icon-lg" accessibilityLabel="Back to Social" onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={buttonIconSize('icon-lg')} color={colors.foreground} />
      </Button>
      <PageTitle testID="chats-handle" numberOfLines={1} ellipsizeMode="tail" className="flex-1 text-center">{home ? `@${home.me.person.handle}` : 'Chats'}</PageTitle>
      {ready ? (
        <Button testID="chats-new" variant="outline" size="icon-lg" accessibilityLabel="New message" onPress={() => setPicking(true)}>
          <Ionicons name="create-outline" size={buttonIconSize('icon-lg')} color={colors.foreground} />
        </Button>
      ) : (
        <View className="size-[40px]" />
      )}
    </View>
  );

  if (!ready) {
    return (
      <SafeAreaView testID={`chats-${phase}`} edges={['top']} className="flex-1 bg-background">
        {header}
        {phase === 'loading' ? <ActivityIndicator className="mt-8" /> : null}
        {phase === 'unavailable' ? (
          <Card className="m-4 gap-3">
            <Text className="font-semibold">Chats aren't available yet</Text>
            <Text className="text-caption text-muted-foreground">Your buddies are still here.</Text>
            <Button testID="chats-open-buddies" onPress={() => navigation.navigate('Buddies')}>Open Buddies</Button>
          </Card>
        ) : null}
        {phase === 'error' ? (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Text className="text-center text-muted-foreground">Couldn't load your chats.</Text>
            <Button testID="chats-retry" variant="secondary" onPress={() => void load()}>Try again</Button>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  const q = query.trim().toLowerCase();
  const rows = uniqueRows([...page.chats, ...more]).filter((r) => !q || r.buddy.displayName.toLowerCase().includes(q) || r.buddy.handle.toLowerCase().includes(q));
  const now = Date.now();
  const unseenStory = new Set((home?.stories ?? []).filter((s) => s.unseen).map((s) => s.author.id));
  return (
    <SafeAreaView testID="chats" edges={['top']} className="flex-1 bg-background">
      {header}
      <FlatList
        testID="chats-list"
        data={rows}
        keyExtractor={(r) => r.buddy.id}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View className="gap-4 pb-1 pt-3">
            <View className="h-[40px] flex-row items-center gap-2 rounded-[10px] bg-secondary px-3">
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                testID="chats-search"
                accessibilityLabel="Search chats"
                placeholder="Search"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                style={inputTextStyle}
                className="flex-1 text-foreground"
              />
            </View>
            {home ? (
              <NotesRow
                me={home.me.person}
                mine={notes?.mine ?? null}
                buddies={notes?.buddies ?? []}
                ringed={unseenStory}
                now={now}
                onMine={() => setComposing(true)}
                onOpen={(n) => navigation.navigate('ChatThread', { buddyId: n.person.id, quote: { request: { type: 'note' }, label: noteQuoteLabel(personName(n.person, false)) } })}
                onReport={setReportNote}
              />
            ) : null}
            <View className="flex-row items-center justify-between pt-2">
              <Text className="text-headline">Messages</Text>
              <Button testID="chats-requests" variant="link" onPress={() => navigation.navigate('ChatRequests')}>
                {page.requests > 0 ? `Requests (${page.requests})` : 'Requests'}
              </Button>
            </View>
            {message ? <Text testID="chats-message" className="text-caption text-muted-foreground">{message}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <Text testID="chats-empty" className="py-8 text-center text-muted-foreground">{q ? 'No chats match.' : 'No messages yet. Say hi to a buddy.'}</Text>
        }
        renderItem={({ item }) => (
          <ChatRow
            row={item}
            ring={unseenStory.has(item.buddy.id)}
            now={now}
            busy={busy}
            onOpen={() => navigation.navigate('ChatThread', { buddyId: item.buddy.id })}
            onCheer={() => cheer(item.buddy.id)}
          />
        )}
      />
      <NoteComposerSheet
        visible={composing}
        current={notes?.mine ?? null}
        onClose={() => setComposing(false)}
        onSaved={() => {
          setComposing(false);
          void load();
        }}
      />
      <NewChatSheet
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(buddyId) => {
          setPicking(false);
          navigation.navigate('ChatThread', { buddyId });
        }}
        onAdd={() => {
          setPicking(false);
          navigation.navigate('PairUp');
        }}
      />
      <ReportSheet
        target={reportNote ? { type: 'status_note', id: reportNote.person.id } : null}
        name={reportNote ? personName(reportNote.person, false) : ''}
        onClose={() => setReportNote(null)}
        onBlock={blockNoteAuthor}
      />
    </SafeAreaView>
  );
}
