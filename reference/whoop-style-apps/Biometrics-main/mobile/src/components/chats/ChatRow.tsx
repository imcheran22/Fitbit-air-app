import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { ChatRow as ChatRowData } from '../../api/chats';
import { activeLine, chatRowLine } from '../../lib/chatCopy';
import { personName } from '../../lib/socialCopy';
import { COLORS } from '../../theme';
import { Button, buttonIconSize } from '../ui/button';
import { Text } from '../ui/text';
import { ChatAvatar } from './ChatAvatar';

// One conversation in the inbox (spec §8.1; the owner-approved Inbox board): their coach (teal ring while their story
// is unseen, the green dot while active now), name, the last message and how long ago — bold with a teal dot while
// unread — and a quick Cheer. The row is not a button (it opens the thread; allowlisted); Cheer is a ghost icon Button.
export function ChatRow({ row, ring, now, busy, onOpen, onCheer }: {
  row: ChatRowData;
  ring: boolean;
  now: number;
  busy: boolean;
  onOpen: () => void;
  onCheer: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const name = personName(row.buddy, false);
  const line = chatRowLine(row, now);
  const unread = row.unread > 0;
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <Pressable
        testID={`chat-row-${row.buddy.id}`}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Chat with ${name}, ${line}${unread ? ', unread' : ''}`}
        className="flex-1 flex-row items-center gap-3 active:opacity-70"
      >
        <ChatAvatar person={row.buddy} size={52} ring={ring} active={activeLine(row.activeAt, now) === 'Active now'} testID={`chat-row-${row.buddy.id}-avatar`} />
        <View className="flex-1 gap-0.5">
          <Text numberOfLines={1} className={unread ? 'text-body font-bold' : 'text-body font-medium'}>{name}</Text>
          <Text testID={`chat-row-${row.buddy.id}-line`} numberOfLines={1} className={unread ? 'text-caption font-semibold text-foreground' : 'text-caption text-muted-foreground'}>{line}</Text>
        </View>
        {unread ? <View testID={`chat-row-${row.buddy.id}-unread`} className="h-[9px] w-[9px] rounded-full bg-accent" /> : null}
      </Pressable>
      <Button testID={`chat-row-${row.buddy.id}-cheer`} variant="ghost" size="icon-sm" accessibilityLabel={`Send ${name} a Cheer`} disabled={busy} onPress={onCheer}>
        <Ionicons name="star-outline" size={buttonIconSize('icon-sm')} color={colors.muted} />
      </Button>
    </View>
  );
}
