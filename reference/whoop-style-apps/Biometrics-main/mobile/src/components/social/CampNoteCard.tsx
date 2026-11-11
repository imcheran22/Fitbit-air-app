// "Your camp note" on the Campfire panel (redesign 2026-10-07). A preview of my KIP with the bubble as the camp will
// see it; then, while drafting, the input with a ring counter of characters left, quick-pick chips and Share; or, once
// my note is live, Edit note (the text back in the draft, with Cancel to leave it as it was) and Clear. Clear is offered whenever a note of mine is live.
// The note's text is free text: shown, never logged.

import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { PersonKip } from '../kip/PersonKip';
import { Button, buttonIconSize } from '../ui/button';
import { Text } from '../ui/text';
import { inputTextStyle } from '../ui/input-style';
import { CAMP_NOTE_CHIPS, CAMP_NOTE_HELPER, CAMP_NOTE_MAX, noteAudienceLine, noteLiveLine } from '../../lib/socialCopy';
import { COLORS } from '../../theme';
import { PANEL_DESTRUCTIVE, PANEL_OUTLINE } from './CampPanel';
import { AddNoteBubble, PixelBubble } from './CampScene';

const TEAL = '#2DD4BF';
const RING_R = 11;
const RING_C = 2 * Math.PI * RING_R;

/** Characters left, as a ring that fills as you type (red past the limit). */
function CountRing({ length }: { length: number }) {
  const over = length > CAMP_NOTE_MAX;
  const filled = Math.min(1, length / CAMP_NOTE_MAX) * RING_C;
  return (
    <View testID="camp-note-count" accessible accessibilityLabel={`${length} of ${CAMP_NOTE_MAX} characters`}
      style={{ position: 'absolute', right: 12, bottom: 12, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={28} height={28} style={{ position: 'absolute' }}>
        <Circle cx={14} cy={14} r={RING_R} fill="none" stroke="rgba(155,157,166,0.25)" strokeWidth={3} />
        <Circle cx={14} cy={14} r={RING_R} fill="none" stroke={over ? '#F87171' : TEAL} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={`${filled} ${RING_C}`} transform="rotate(-90 14 14)" />
      </Svg>
      <Text className={`text-[9px] font-semibold ${over ? 'text-destructive' : 'text-muted-foreground'}`}>{`${CAMP_NOTE_MAX - length}`}</Text>
    </View>
  );
}

export interface CampNoteCardProps {
  inputRef: React.RefObject<TextInput | null>;
  draft: string;
  onDraft: (text: string) => void;
  length: number;
  canShare: boolean;
  onShare: () => void;
  /** My live note (the server's answer to my share, or the camp's), or null. */
  live: { text: string; expiresAt: string | null } | null;
  /** Editing a live note: the composer shows instead of Edit / Clear. */
  editing: boolean;
  onEdit: () => void;
  /** Leaves the edit, keeping the live note as it is. */
  onCancel: () => void;
  onClear: () => void;
  busy: boolean;
  message: string | null;
  buddies: number;
  kipColour: string;
  /** The composer's input top and Share bottom, in the card. */
  onComposerLayout?: (box: { top: number; bottom: number }) => void;
}

export function CampNoteCard({
  inputRef, draft, onDraft, length, canShare, onShare, live, editing, onEdit, onCancel, onClear, busy, message, buddies, kipColour, onComposerLayout,
}: CampNoteCardProps) {
  const [focused, setFocused] = useState(false);
  const drafting = !live || editing;
  const preview = drafting ? draft.trim() || live?.text || '' : live!.text;
  const audience = noteAudienceLine(buddies);
  return (
    <View className="gap-3 rounded-[24px] border border-border bg-foreground/5 p-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-[15px] font-semibold">Your camp note</Text>
        {live ? (
          <View testID="camp-note-live" className="h-6 flex-row items-center gap-1.5 rounded-full bg-accent/15 px-2.5">
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: TEAL }} />
            <Text className="text-xs font-semibold text-accent">{noteLiveLine(live.expiresAt)}</Text>
          </View>
        ) : audience ? <Text className="text-xs text-muted-foreground">{audience}</Text> : null}
      </View>

      <View className="flex-row items-end gap-2.5 rounded-[18px] p-3" style={{ backgroundColor: 'rgba(15,18,48,0.9)' }}
        accessible accessibilityLabel={preview ? `Preview: ${preview}` : 'Preview: no note yet'}>
        <PersonKip colour={kipColour} size={28} />
        <View className="flex-1 items-start">
          {preview ? <PixelBubble text={preview} maxWidth={200} /> : <AddNoteBubble maxWidth={200} />}
        </View>
        <Text className="text-[11px] text-[#9B9DA6]">Preview</Text>
      </View>

      {drafting ? (
        <View testID="camp-note-composer" className="gap-2.5"
          onLayout={(e) => onComposerLayout?.({ top: e.nativeEvent.layout.y, bottom: e.nativeEvent.layout.y + e.nativeEvent.layout.height })}>
          <View>
            <TextInput ref={inputRef} testID="camp-note-input" accessibilityLabel="Your camp note" value={draft} onChangeText={onDraft}
              placeholder="Say something to the camp…" placeholderTextColor="#6B6E78" autoCorrect={false} multiline numberOfLines={2}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              style={[inputTextStyle, { height: 76, paddingTop: 12, paddingBottom: 12, paddingLeft: 14, paddingRight: 52, borderRadius: 16, borderWidth: 1.5,
                borderColor: focused ? TEAL : 'rgba(155,157,166,0.3)', textAlignVertical: 'top' }]}
              className="bg-background/70 text-foreground" />
            <CountRing length={length} />
          </View>
          {/* Starting points: once there's a draft they'd only replace it, and the room is Share's above the keyboard. */}
          {draft === '' ? (
            <View className="flex-row flex-wrap gap-2">
              {CAMP_NOTE_CHIPS.map((chip, i) => (
                <Button key={chip} testID={`camp-chip-${i}`} accessibilityLabel={`Use "${chip}"`} onPress={() => onDraft(chip)}
                  variant="outline" size="xs" className={PANEL_OUTLINE}>{chip}</Button>
              ))}
            </View>
          ) : null}
          <View className="flex-row gap-2.5">
            <Button testID="camp-note-share" accessibilityLabel="Share your camp note" disabled={!canShare} onPress={onShare} size="lg" className="flex-1"
              iconStart={<Ionicons name="send" size={buttonIconSize('lg')} color={COLORS.dark.background} />}>
              Share with the camp
            </Button>
            {live ? (
              <Button testID="camp-note-cancel" accessibilityLabel="Cancel editing your camp note" variant="secondary" size="lg"
                disabled={busy} onPress={onCancel}>Cancel</Button>
            ) : null}
          </View>
          {live ? (
            <Button testID="camp-note-clear" accessibilityLabel="Clear your camp note" variant="destructive" size="sm"
              disabled={busy} onPress={onClear} className={`self-center ${PANEL_DESTRUCTIVE}`}>Clear note</Button>
          ) : null}
        </View>
      ) : (
        <View className="flex-row gap-2.5">
          <Button testID="camp-note-edit" accessibilityLabel="Edit your camp note" variant="secondary" size="lg" disabled={busy}
            onPress={onEdit} className="flex-1">Edit note</Button>
          <Button testID="camp-note-clear" accessibilityLabel="Clear your camp note" variant="destructive" size="lg" disabled={busy}
            onPress={onClear} className={`flex-1 ${PANEL_DESTRUCTIVE}`}>Clear</Button>
        </View>
      )}
      {message ? <Text testID="camp-message" accessibilityLiveRegion="polite" className="text-sm text-destructive">{message}</Text> : null}
      <Text className="text-xs text-muted-foreground">{CAMP_NOTE_HELPER}</Text>
    </View>
  );
}
