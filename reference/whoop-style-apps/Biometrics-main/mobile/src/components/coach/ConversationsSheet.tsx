import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { listConversations, type CoachConversationSummaryDTO } from '../../api/coach';
import { COLORS } from '../../theme';
import { Button, buttonIconSize } from '../ui/button';
import { SettingsGroup, SettingsRow } from '../ui/settings-list';
import { Sheet } from '../ui/sheet';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The server's page size: a shorter page is the last one.
const PAGE_SIZE = 20;

// "today", "yesterday", a weekday within the week, "last week", then "Sep 16".
// Calendar days in the device's zone, not 24-hour spans.
export function relativeDay(iso: string, now: Date): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return WEEKDAYS[then.getDay()]!;
  if (days < 14) return 'last week';
  return `${MONTHS[then.getMonth()]} ${then.getDate()}`;
}

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; conversations: CoachConversationSummaryDTO[]; hasMore: boolean; more: 'idle' | 'loading' | 'error' };

interface ConversationsSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpen: (conversationId: string) => void;
  onNewChat: () => void;
  onOpenMemory: () => void;
  // The conversation on screen, marked in the list.
  currentId: string | null;
  // For tests; defaults to the time the list loaded.
  now?: Date;
}

// The ☰ sheet (spec 1.5): past conversations, titled by their first question,
// newest first; the coach's memory; and a new chat. Re-read on every open.
export function ConversationsSheet({ visible, onClose, onOpen, onNewChat, onOpenMemory, currentId, now }: ConversationsSheetProps) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [loadedAt, setLoadedAt] = useState(() => now ?? new Date());
  // Bumped by every fresh load and on unmount, so a reply to an earlier
  // open (or to a sheet that is gone) is dropped.
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setState({ status: 'loading' });
    try {
      const conversations = await listConversations();
      if (mine !== generation.current) return;
      setLoadedAt(now ?? new Date());
      setState({ status: 'ready', conversations, hasMore: conversations.length >= PAGE_SIZE, more: 'idle' });
    } catch {
      if (mine === generation.current) setState({ status: 'error' });
    }
  }, [now]);

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready' || state.more === 'loading' || !state.hasMore) return;
    const last = state.conversations[state.conversations.length - 1];
    if (!last) return;
    const mine = generation.current;
    setState({ ...state, more: 'loading' });
    try {
      const page = await listConversations(last.lastMessageAt);
      if (mine !== generation.current) return;
      setState((s) => {
        if (s.status !== 'ready') return s;
        const shown = new Set(s.conversations.map((c) => c.id));
        return {
          status: 'ready',
          conversations: [...s.conversations, ...page.filter((c) => !shown.has(c.id))],
          hasMore: page.length >= PAGE_SIZE,
          more: 'idle',
        };
      });
    } catch {
      if (mine !== generation.current) return;
      setState((s) => (s.status === 'ready' ? { ...s, more: 'error' } : s));
    }
  }, [state]);

  useEffect(() => {
    if (visible) void load();
    // Only a fresh open reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose} testID="conversations-sheet">
      <View className="gap-5 pb-2">
        <View className="flex-row items-center justify-between">
          <Text className="px-1 text-heading">Conversations</Text>
          <Button testID="conversations-close" variant="ghost" size="icon-lg" accessibilityLabel="Close" onPress={onClose}>
            <Ionicons name="close" size={buttonIconSize('icon-lg')} color={colors.muted} />
          </Button>
        </View>

        <SettingsGroup>
          <SettingsRow testID="conversations-new" icon="create-outline" tint={colors.accent} title="New chat" onPress={onNewChat} />
          <SettingsRow
            testID="conversations-memory"
            icon="bulb-outline"
            tint={colors.coach}
            title="Coach memory"
            subtitle="What the coach remembers about you"
            onPress={onOpenMemory}
          />
        </SettingsGroup>

        {state.status === 'loading' ? (
          <View testID="conversations-loading" className="gap-2">
            <Skeleton className="h-12 w-full rounded-tile" />
            <Skeleton className="h-12 w-full rounded-tile" />
          </View>
        ) : state.status === 'error' ? (
          <View testID="conversations-error" className="items-start gap-1 px-1">
            <Text className="text-caption text-muted-foreground">{"Couldn't load your past chats."}</Text>
            <Button testID="conversations-retry" variant="secondary" size="sm" className="self-start" onPress={() => void load()}>
              Try again
            </Button>
          </View>
        ) : state.conversations.length === 0 ? (
          <Text testID="conversations-empty" className="px-1 text-caption text-muted-foreground">
            No past chats yet.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 320 }}>
            <SettingsGroup label="Past chats">
              {state.conversations.map((c) => {
                const when = relativeDay(c.lastMessageAt, loadedAt);
                return (
                  <SettingsRow
                    key={c.id}
                    testID={`conversation-${c.id}`}
                    title={c.title}
                    // The date in place of the value + chevron: a past chat
                    // opens here, it doesn't drill into another screen.
                    trailing={
                      when ? (
                        <Text className="text-right text-caption text-muted-foreground" numberOfLines={1}>
                          {when}
                        </Text>
                      ) : null
                    }
                    selected={c.id === currentId}
                    accessibilityLabel={when ? `${c.title}, ${when}` : c.title}
                    onPress={() => onOpen(c.id)}
                  />
                );
              })}
            </SettingsGroup>
            {state.hasMore ? (
              <View className="items-start gap-1 px-1 pt-2">
                {state.more === 'error' ? (
                  <Text testID="conversations-more-error" className="text-caption text-muted-foreground">
                    {"Couldn't load older chats."}
                  </Text>
                ) : null}
                <Button
                  testID="conversations-more"
                  variant="ghost"
                  size="sm"
                  disabled={state.more === 'loading'}
                  onPress={() => void loadMore()}
                >
                  {state.more === 'error' ? 'Try again' : 'Show older chats'}
                </Button>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Sheet>
  );
}
