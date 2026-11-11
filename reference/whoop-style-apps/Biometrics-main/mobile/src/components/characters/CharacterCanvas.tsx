import React, { useMemo, useRef } from 'react';
import { PixelRatio } from 'react-native';
import { Canvas, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import { answeringStart, attachmentFrame, drawsAttachment, moodEyes, showsAttachment, STAGE_H, STAGE_W, type Cell } from './attachments/frames';
import { composeSprite, SPRITE_SIZE } from './sprites/compose';
import { SPRITES } from './sprites/data';
import { crispLayout } from './sprites/scale';
import { useSpriteClock } from './useSpriteClock';
import type { ThinkingAttachmentId } from './thinking';
import type { CharacterId, CharacterMood } from './types';

export interface CharacterCanvasProps {
  characterId: CharacterId;
  mood: CharacterMood;
  size: number;
  paused: boolean;
  /**
   * Drawn on the 36×32 stage next to the coach (the canvas widens to size × 36/24):
   * animated while thinking, its "answer's here" frame briefly while answering.
   */
  attachment: ThinkingAttachmentId | null;
}

const BOB_MS: Record<CharacterMood, number> = { idle: 1600, thinking: 1600, answering: 500, resting: 3000 };
const HOP: Record<CharacterMood, number> = { idle: 1, thinking: 1, answering: 2, resting: 1 };
const BLINK_EVERY = 4200;
const BLINK_FOR = 140;

// The only file that touches Skia. Jest uses jest-mocks/CharacterCanvas.js.
export function CharacterCanvas({ characterId, mood, size, paused, attachment }: CharacterCanvasProps) {
  const t = useSpriteClock(paused);
  const withAttachment = drawsAttachment(attachment, size);
  const dpr = PixelRatio.get();
  // Slot width in points; the slot height is width × rows / cols.
  const widthPt = withAttachment ? (size * STAGE_W) / SPRITE_SIZE : size;
  const heightPt = withAttachment ? (size * STAGE_H) / SPRITE_SIZE : size;
  // Whole-device-pixel cells and offsets (sprites/scale.ts). The stage layout's
  // cellPx equals crispLayout(size, dpr).cellPx: floor(floor(1.5·S)/36) =
  // floor(S/24) = floor(floor(S)/24) for S = size × dpr, so the coach is the
  // same size with or without an attachment (asserted in scale.test.ts).
  const layout = withAttachment ? crispLayout(widthPt, dpr, STAGE_W, STAGE_H) : crispLayout(size, dpr);
  const cell = layout.cellPt;

  const blinking = !paused && t % BLINK_EVERY < BLINK_FOR;
  const bobUp = paused ? 0 : Math.floor(t / (BOB_MS[mood] / 2)) % 2;
  const hop = bobUp * HOP[mood];
  const grid = composeSprite(SPRITES[characterId], moodEyes(mood, blinking), { dim: mood === 'resting' });
  // The "answer's here" frame shows for ATTACHMENT_DONE_MS from the start of
  // answering, timed on the sprite clock. Paused (Reduce Motion, out of focus)
  // the clock reads 0, so the still done frame stays until the mood changes.
  const answerStart = useRef<number | null>(null);
  answerStart.current = answeringStart(answerStart.current, mood, t);
  const sinceAnswering = answerStart.current === null ? 0 : t - answerStart.current;
  const extra: readonly Cell[] =
    withAttachment && attachment && showsAttachment(mood, sinceAnswering)
      ? attachmentFrame(attachment, t, mood === 'answering')
      : [];
  // The coach sits at y 8–31 on the attachment stage.
  const top = withAttachment ? STAGE_H - SPRITE_SIZE : 0;
  const restingZ: readonly Cell[] = mood === 'resting' && !paused ? restingZFrame(t, top) : [];
  // The overlay as a string, so the Picture is only re-recorded when a drawn
  // cell changes, not on every clock tick.
  const overlay = extra.length || restingZ.length ? JSON.stringify([...extra, ...restingZ]) : '';

  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        const paint = Skia.Paint();
        // Cells land on whole device pixels; no antialiasing, so no seams between them.
        paint.setAntiAlias(false);
        const draw = (x: number, y: number, color: string) => {
          paint.setColor(Skia.Color(color));
          canvas.drawRect(Skia.XYWHRect(x * cell, y * cell, cell, cell), paint);
        };
        grid.forEach((c, i) => {
          if (c) draw(i % SPRITE_SIZE, top + Math.floor(i / SPRITE_SIZE) - hop, c);
        });
        if (overlay) for (const [x, y, c] of JSON.parse(overlay) as Cell[]) draw(x, y, c);
      }),
    [grid, overlay, hop, cell, top],
  );

  return (
    <Canvas style={{ width: widthPt, height: heightPt }}>
      <Picture picture={picture} transform={[{ translateX: layout.offsetPt }, { translateY: layout.offsetYPt }]} />
    </Canvas>
  );
}

// Resting "z": a 3×5 glyph drifting up 3 pixels over 2.4s, top right of the sprite (spec §3).
const Z = ['xxx', '..x', '.x.', 'x..', 'xxx'];
function restingZFrame(t: number, top: number): Cell[] {
  const p = (t % 2400) / 2400;
  const dy = Math.round(-p * 3);
  const alpha = (1 - p).toFixed(2);
  const out: Cell[] = [];
  Z.forEach((r, y) =>
    [...r].forEach((c, x) => {
      if (c === 'x') out.push([19 + x, 3 + y + dy, `rgba(165,180,252,${alpha})`]);
    }),
  );
  return out.filter(([, y]) => y >= 0).map(([x, y, c]) => [x, y + top, c] as Cell);
}
