import React from 'react';
import { View, type TextStyle } from 'react-native';
import { Character } from '../../characters/Character';
import type { ThinkingTextId } from '../../characters/thinking';
import type { CharacterId } from '../../characters/types';
import { useScreenFocused } from '../../../characters/useScreenFocused';
import { DialogBox, DIALOG_TEXT_CLASS, dialogTextStyle } from './Dialog';
import { BubbleName, PLACEHOLDER_BOTTOM, PLACEHOLDER_WIDTH, PlaceholderBubble } from './Placeholder';

/** The styles whose thinking frame the streaming answer then flows into (spec §5 B, I). */
export const REPLY_FRAME_STYLES = ['placeholder', 'dialog'] as const;
export type ReplyFrameStyle = (typeof REPLY_FRAME_STYLES)[number];

export function isReplyFrameStyle(style: ThinkingTextId | null | undefined): style is ReplyFrameStyle {
  return (REPLY_FRAME_STYLES as readonly string[]).includes(style ?? '');
}

/** The answer text's inline style inside the frame: the dialog box's light ink, unchanged in the bubble. */
export function replyFrameTextStyle(style: ReplyFrameStyle): TextStyle | undefined {
  return style === 'dialog' ? dialogTextStyle() : undefined;
}

/** The streaming answer's type class in a reply frame: the dialog box's pixel text; otherwise none (the row's text-body). */
export function replyFrameTextClass(style: ReplyFrameStyle): string | undefined {
  return style === 'dialog' ? DIALOG_TEXT_CLASS : undefined;
}

// The in-progress answer, inside the same bubble (B) or RPG box (I) the
// thinking text drew (spec §5 "the same box"). It keeps ThinkingRow's layout
// (the screen's items-start wrapper, the 36 pt thinking coach, the gap, the
// box in a flex-1 column) so the box does not move when the first sentence
// replaces the pending row. Only the streaming message uses it: once the turn
// is done the answer switches to a normal bubble, flush left without the
// coach, so history looks the same for every style. That end-of-turn switch
// is the one move left, and it is deliberate.
export function ReplyFrame({ style, characterId, children }: { style: ReplyFrameStyle; characterId: CharacterId; children: React.ReactNode }) {
  const focused = useScreenFocused();
  const box =
    style === 'dialog' ? (
      <DialogBox testID="reply-frame-dialog" characterId={characterId}>
        {children}
      </DialogBox>
    ) : (
      <PlaceholderBubble testID="reply-frame-placeholder" style={{ maxWidth: '100%', minWidth: PLACEHOLDER_WIDTH, marginBottom: PLACEHOLDER_BOTTOM }}>
        <BubbleName characterId={characterId} />
        {children}
      </PlaceholderBubble>
    );
  return (
    <View className="items-start">
      <View testID="reply-frame-row" className="flex-row items-end gap-1.5">
        <Character testID="reply-frame-coach" characterId={characterId} mood="thinking" size={36} paused={!focused} />
        <View className="flex-1">{box}</View>
      </View>
    </View>
  );
}
