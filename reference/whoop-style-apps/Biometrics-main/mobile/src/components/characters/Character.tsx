import React from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useCharacterOptional } from '../../characters/CharacterContext';
import { Glow } from '../ui/glow';
import { drawsAttachment, STAGE_W } from './attachments/frames';
import { CharacterCanvas } from './CharacterCanvas';
import { characterInfo } from './registry';
import { SPRITE_SIZE } from './sprites/compose';
import { DEFAULT_THINKING_ATTACHMENT, type ThinkingAttachmentId } from './thinking';
import { DEFAULT_CHARACTER_ID, type CharacterId, type CharacterMood } from './types';

export const DIMMED_OPACITY = 0.45;

export interface CharacterProps {
  /** Omitted → the user's current character (CharacterProvider), or Mochi outside it. */
  characterId?: CharacterId;
  mood: CharacterMood;
  size: number;
  paused?: boolean;
  dimmed?: boolean;
  glow?: boolean;
  /**
   * Shown while thinking (and its "answer's here" frame while answering).
   * Omitted → the user's thinking attachment setting; null hides it.
   */
  attachment?: ThinkingAttachmentId | null;
  /** Set → announced as an image. Unset → decorative and hidden from screen readers. */
  accessibilityLabel?: string;
  testID?: string;
}

// The coach's face everywhere the orb used to be (spec §1).
export function Character({
  characterId,
  mood,
  size,
  paused = false,
  dimmed = false,
  glow = false,
  attachment,
  accessibilityLabel,
  testID,
}: CharacterProps) {
  const current = useCharacterOptional();
  const id = characterId ?? current?.characterId ?? DEFAULT_CHARACTER_ID;
  const reduceMotion = useReducedMotion();
  const labelled = accessibilityLabel !== undefined;
  const attachmentId = attachment === undefined ? current?.thinkingAttachment ?? DEFAULT_THINKING_ATTACHMENT : attachment;
  // Room is kept while thinking and answering, and only at sizes where it reads
  // (spec §4). The canvas draws it all through thinking, and while answering
  // only its "answer's here" frame for the first 0.8 s (showsAttachment).
  const showsAttachment = (mood === 'thinking' || mood === 'answering') && drawsAttachment(attachmentId, size);
  const canvasAttachment = showsAttachment ? attachmentId : null;
  // Reserve the attachment's room to the right of the coach (spec §4). The stage
  // is also taller (36×32); the canvas sits on the slot's bottom edge so the
  // coach stays put and the attachment rises above it.
  const width = showsAttachment ? (size * STAGE_W) / SPRITE_SIZE : size;
  return (
    <View
      testID={testID}
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
      style={{
        width,
        height: size,
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        opacity: dimmed ? DIMMED_OPACITY : 1,
      }}
    >
      {glow ? <Glow color={characterInfo(id).accent} size={size * 2.4} around={size} intensity={0.3} /> : null}
      <CharacterCanvas
        characterId={id}
        mood={mood}
        size={size}
        paused={paused || reduceMotion}
        attachment={canvasAttachment}
      />
    </View>
  );
}
