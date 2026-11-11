import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { StickerKind } from '../../api/buddies';
import { STICKERS } from '../../lib/buddyCopy';
import { MESSAGE_MAX, noteLength } from '../../lib/chatCopy';
import { COLORS } from '../../theme';
import { Button, buttonIconSize } from '../ui/button';
import { Text } from '../ui/text';
import { inputTextStyle } from '../ui/input-style';

// The thread's composer (V5 thread board): a staged quote or reply (each removable), the quick-sticker chips, "+" to
// share my check-in today, the "Message…" input and Send. The draft is trimmed, empties as it is sent and comes back if
// the send fails (unless I've typed again since). The count shows from 900 code points; past 1000 Send is off (the
// server's limit).

const COUNT_FROM = 900;

export interface ComposerProps {
  disabled: boolean;
  quote: { label: string } | null;
  onClearQuote: () => void;
  replyTo: { label: string } | null;
  onClearReply: () => void;
  canShareCheckIn: boolean;
  onShareCheckIn: () => void;
  onSticker: (kind: StickerKind) => void;
  /** Resolves true once sent. */
  onSend: (text: string) => Promise<boolean>;
}

function Staged({ testID, label, clearLabel, onClear, color }: { testID: string; label: string; clearLabel: string; onClear: () => void; color: string }) {
  return (
    <View className="flex-row items-center gap-2 rounded-xl bg-secondary px-3 py-1.5">
      <Text testID={testID} numberOfLines={1} className="flex-1 text-caption text-muted-foreground">{`Replying to ${label}`}</Text>
      <Button testID={`${testID}-clear`} variant="ghost" size="icon-xs" accessibilityLabel={clearLabel} onPress={onClear}>
        <Ionicons name="close" size={buttonIconSize('icon-xs')} color={color} />
      </Button>
    </View>
  );
}

export function ChatComposer(p: ComposerProps) {
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const [draft, setDraft] = useState('');
  // Counted like a note: code points of the NFC, trimmed draft (plan ruling P6).
  const length = noteLength(draft);
  const canSend = !p.disabled && length > 0 && length <= MESSAGE_MAX;
  const send = async () => {
    if (!canSend) return;
    const sent = draft.trim();
    setDraft('');
    if (!(await p.onSend(sent))) setDraft((d) => (d === '' ? sent : d));
  };
  return (
    <View className="gap-2.5 border-t border-border px-3 pb-2 pt-2.5">
      {p.quote ? <Staged testID="composer-quote" label={p.quote.label} clearLabel="Remove the quote" onClear={p.onClearQuote} color={colors.foreground} /> : null}
      {p.replyTo ? <Staged testID="composer-reply" label={p.replyTo.label} clearLabel="Stop replying" onClear={p.onClearReply} color={colors.foreground} /> : null}
      <View className="flex-row flex-wrap gap-2">
        {STICKERS.map((s) => (
          <Button
            key={s.kind}
            testID={`composer-sticker-${s.kind}`}
            variant="outline"
            size="sm"
            accessibilityLabel={`Send a ${s.label} sticker`}
            iconStart={<Ionicons name={s.icon} size={buttonIconSize('sm')} color={colors.foreground} />}
            disabled={p.disabled}
            onPress={() => p.onSticker(s.kind)}
          >
            {s.label}
          </Button>
        ))}
      </View>
      <View className="flex-row items-end gap-2">
        <Button testID="composer-checkin" variant="outline" size="icon" accessibilityLabel="Share your check-in" disabled={p.disabled || !p.canShareCheckIn} onPress={p.onShareCheckIn}>
          <Ionicons name="add" size={buttonIconSize('icon')} color={colors.foreground} />
        </Button>
        <TextInput
          testID="composer-input"
          accessibilityLabel="Message"
          placeholder="Message…"
          placeholderTextColor={colors.muted}
          multiline
          value={draft}
          onChangeText={setDraft}
          style={inputTextStyle}
          className="max-h-28 min-h-[36px] flex-1 rounded-[18px] bg-secondary px-3.5 py-2 text-foreground"
        />
        <Button testID="composer-send" size="icon" accessibilityLabel="Send" disabled={!canSend} onPress={() => void send()}>
          <Ionicons name="arrow-up" size={buttonIconSize('icon')} color={colors.background} />
        </Button>
      </View>
      {length >= COUNT_FROM ? (
        <Text testID="composer-count" className={length > MESSAGE_MAX ? 'self-end text-caption text-destructive tabular-nums' : 'self-end text-caption text-muted-foreground tabular-nums'}>{`${length}/${MESSAGE_MAX}`}</Text>
      ) : null}
    </View>
  );
}
