import React from 'react';
import { View } from 'react-native';
import type { StickerKind } from '../../api/buddies';
import type { Message } from '../../api/chats';
import { STICKERS } from '../../lib/buddyCopy';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';

// A message's actions (spec §8.2): react with one of the four stickers (my current one is filled; tapping it again
// removes it), reply, unsend mine, or report theirs. The reaction row is a one-tap pick like the check-in sheet's
// (lg, flex-1); the actions below are stacked full width at lg (plan ruling P4).
export function MessageActionsSheet({ message, onClose, onReact, onReply, onUnsend, onReport }: {
  message: Message | null;
  onClose: () => void;
  onReact: (m: Message, kind: StickerKind | null) => void;
  onReply: (m: Message) => void;
  onUnsend: (m: Message) => void;
  onReport: (m: Message) => void;
}) {
  const current = message?.reactions.find((r) => r.mine)?.kind ?? null;
  return (
    <Sheet visible={message !== null} onClose={onClose} testID="message-actions">
      {message ? (
        <View className="gap-3 pb-2">
          <View className="flex-row gap-2">
            {STICKERS.map((s) => (
              <Button
                key={s.kind}
                testID={`react-${s.kind}`}
                variant={current === s.kind ? 'default' : 'outline'}
                size="lg"
                className="flex-1"
                accessibilityState={{ selected: current === s.kind }}
                onPress={() => onReact(message, current === s.kind ? null : s.kind)}
              >
                {s.label}
              </Button>
            ))}
          </View>
          <Button testID="message-reply" variant="secondary" size="lg" className="w-full" onPress={() => onReply(message)}>Reply</Button>
          {message.mine ? (
            <Button testID="message-unsend" variant="destructive" size="lg" className="w-full" onPress={() => onUnsend(message)}>Unsend</Button>
          ) : (
            <Button testID="message-report" variant="outline" size="lg" className="w-full" onPress={() => onReport(message)}>Report</Button>
          )}
        </View>
      ) : null}
    </Sheet>
  );
}
