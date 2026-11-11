import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { StickerKind } from '../../api/buddies';
import type { Card, Message } from '../../api/chats';
import { STICKERS } from '../../lib/buddyCopy';
import { cardCaption, cardKicker, cardLine, moodColor, replyLine, stickerLine } from '../../lib/chatCopy';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';

// One message (spec 2026-10-07 social §8.2; V5 thread board): mine on the right in teal, theirs on the left in grey; a
// sticker as a small tile, a card as a framed quote under its caption, a reply's one-line quote above, reactions below.
// Not a button (no button role, so no allowlist entry): a long press, or the screen reader's "Message options" action,
// opens the message's actions. Its text is a buddy's free text: shown, never logged.

const stickerIcon = (kind: StickerKind | null) => STICKERS.find((s) => s.kind === kind)?.icon ?? 'happy-outline';
// The corner nearest the sender is tighter (V5 board).
const MINE_CORNERS = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 6, borderBottomLeftRadius: 18 };
const THEIR_CORNERS = { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 6 };

function CardView({ card, mine, buddyName, testID }: { card: Card; mine: boolean; buddyName: string; testID: string }) {
  return (
    <View testID={testID} className={mine ? 'max-w-[250px] items-end gap-1' : 'max-w-[250px] items-start gap-1'}>
      <Text className="px-1 text-caption text-muted-foreground">{cardCaption(card, mine, buddyName)}</Text>
      <View className="w-[230px] gap-1.5 rounded-[14px] border border-border bg-card p-3">
        <Text className="text-label uppercase text-muted-foreground">{cardKicker(card)}</Text>
        <View className="flex-row items-center gap-2">
          {card.type === 'checkin' && card.mood ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: moodColor(card.mood) }} /> : null}
          <Text className={card.available ? 'flex-1 text-body font-semibold' : 'flex-1 text-body text-muted-foreground'}>{cardLine(card)}</Text>
        </View>
      </View>
    </View>
  );
}

export function MessageBubble({ message: m, buddyName, onLongPress }: { message: Message; buddyName: string; onLongPress: (m: Message) => void }) {
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  return (
    <Pressable
      testID={`message-${m.id}`}
      onLongPress={() => onLongPress(m)}
      delayLongPress={300}
      accessibilityHint="Double tap and hold for options"
      accessibilityActions={[{ name: 'longpress', label: 'Message options' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'longpress') onLongPress(m);
      }}
      className={m.mine ? 'max-w-[80%] items-end gap-1 self-end' : 'max-w-[80%] items-start gap-1 self-start'}
    >
      {m.replyTo ? (
        <Text testID={`message-${m.id}-reply`} numberOfLines={1} className="px-1 text-caption text-muted-foreground">
          {replyLine(m.replyTo, buddyName)}
        </Text>
      ) : null}
      {m.kind === 'CARD' && m.card ? <CardView card={m.card} mine={m.mine} buddyName={buddyName} testID={`message-${m.id}-card`} /> : null}
      {m.kind === 'STICKER' && m.sticker ? (
        <View className="items-center gap-0.5 rounded-2xl border border-border bg-card px-3.5 py-2.5">
          <Ionicons name={stickerIcon(m.sticker)} size={28} color={colors.foreground} />
          <Text testID={`message-${m.id}-sticker`} className="text-caption font-semibold text-muted-foreground">{stickerLine(m.sticker)}</Text>
        </View>
      ) : null}
      {m.text ? (
        <View className={m.mine ? 'bg-accent px-3.5 py-2.5' : 'bg-secondary px-3.5 py-2.5'} style={m.mine ? MINE_CORNERS : THEIR_CORNERS}>
          <Text testID={`message-${m.id}-text`} className={m.mine ? 'text-body text-accent-foreground' : 'text-body text-foreground'}>
            {m.text}
          </Text>
        </View>
      ) : null}
      {m.reactions.length > 0 ? (
        <View testID={`message-${m.id}-reactions`} className="flex-row gap-1">
          {m.reactions.map((r, i) => (
            <Text
              key={`${r.kind}-${i}`}
              className={r.mine ? 'overflow-hidden rounded-full border border-accent bg-secondary px-2 py-0.5 text-caption' : 'overflow-hidden rounded-full border border-border bg-secondary px-2 py-0.5 text-caption'}
            >
              {stickerLine(r.kind)}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}
