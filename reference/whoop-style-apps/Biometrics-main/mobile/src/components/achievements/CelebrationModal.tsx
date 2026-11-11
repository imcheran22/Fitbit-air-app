import React, { useContext, useRef, useState } from 'react';
import { Modal, PixelRatio, ScrollView, StyleSheet, useWindowDimensions, View, type DimensionValue } from 'react-native';
import { initialWindowMetrics, SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { useCharacterOptional } from '../../characters/CharacterContext';
import { LOCKED_PIP, mixHex, tierColors } from '../../lib/badgeArt';
import { coachLine, levelTitle, valueLine } from '../../lib/badges';
import type { Celebration } from '../../lib/celebrationQueue';
import { EXPORT_NOTICES, useRecapExport } from '../../lib/useRecapExport';
import { FONTS } from '../../theme';
import { Character } from '../characters/Character';
import { hexAlpha } from '../characters/palette';
import { characterInfo } from '../characters/registry';
import { DEFAULT_CHARACTER_ID } from '../characters/types';
import { pixelFont } from '../coach/thinking/shared';
import { Button, buttonTextVariants } from '../ui/button';
import { Text } from '../ui/text';
import { BadgeIcon } from './BadgeIcon';
import { BadgeShareCard, badgeShareLayout } from './BadgeShareCard';

export interface CelebrationModalProps {
  celebration: Celebration;
  thresholds: readonly number[];
  onDone: () => void;
}

// Pixel confetti from the canvas (Unlock.dc.html): fixed spots and colours. None under Reduce Motion.
// Drawn behind everything and only where no text can be: in the side margins (x from the screen's
// edge, y as a share of its height) and beside the badge (x from the hero's edge, y from its top).
type ConfettiSpot = readonly ['left' | 'right', number, DimensionValue];
const MARGIN_CONFETTI: ReadonlyArray<ConfettiSpot> = [['left', 8, '16%'], ['right', 10, '12%'], ['left', 12, '44%'], ['right', 6, '40%'], ['left', 6, '68%'], ['right', 12, '64%']];
const HERO_CONFETTI: ReadonlyArray<ConfettiSpot> = [['left', 22, 10], ['right', 14, 0], ['left', 4, 70], ['right', 30, 60], ['left', 28, 130], ['right', 8, 120]];
/** The page's side padding: the margins the confetti may use, kept clear of all text. */
const SIDE = 24;
const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
/** Below this much height between the insets, the badge and its coach draw smaller. */
const COMPACT_HEIGHT = 700;
const CONFETTI_COLORS = ['#FACC15', '#F9A8D4', '#5EEAD4', '#FDE68A', '#FDBA74'];
const INK = '#FAFAF9';
// The failed-share notice, as on the recap story viewer's dark ground.
const NOTICE_INK = '#FCA5A5';

// The unlock celebration (spec 2026-10-06 §6; canvas Unlock.dc.html): full screen, on a ground
// tinted by the new tier — the badge with the coach beside it, the level pips, the level name and
// value, the coach's fixed line, Share (a 1080 px badge card) and "Nice!", which closes it.
// One Modal stays presented while the queue lasts and the next family swaps in inside it: on iOS a
// Modal presented in the same commit another one starts dismissing is dropped.
export function CelebrationModal({ celebration, thresholds, onDone }: CelebrationModalProps) {
  const reduceMotion = useReducedMotion();
  const key = `${celebration.family}-${celebration.level}`;
  // "Nice!" and the system back gesture (onRequestClose) close each family once between them.
  const closedKey = useRef<string | null>(null);
  const done = () => {
    if (closedKey.current === key) return;
    closedKey.current = key;
    onDone();
  };
  return (
    <Modal visible transparent={false} animationType={reduceMotion ? 'none' : 'fade'} presentationStyle="fullScreen" onRequestClose={done}>
      <CelebrationContent key={key} celebration={celebration} thresholds={thresholds} onDone={done} />
    </Modal>
  );
}

/** One confetti square, as on the canvas: every third one larger. */
function ConfettiSquare({ spot: [side, x, top], i }: { spot: ConfettiSpot; i: number }) {
  const size = i % 3 ? 6 : 9;
  return <View testID="celebration-confetti-square" style={{ position: 'absolute', [side]: x, top, width: size, height: size, backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length], opacity: 0.85 }} />;
}

/**
 * The window's safe-area insets. A Modal is its own native window, where SafeAreaView can measure
 * nothing on its first frames (the eyebrow slid under the Dynamic Island); the provider's insets
 * still reach it through context. Read directly (not useSafeAreaInsets), so it renders without one.
 */
function useInsets(): EdgeInsets {
  return useContext(SafeAreaInsetsContext) ?? initialWindowMetrics?.insets ?? ZERO_INSETS;
}

/** One family's celebration: remounted per family, so its share and close state start afresh. */
function CelebrationContent({ celebration, thresholds, onDone }: CelebrationModalProps) {
  const reduceMotion = useReducedMotion();
  const characterId = useCharacterOptional()?.characterId ?? DEFAULT_CHARACTER_ID;
  const accent = characterInfo(characterId).accent;
  const { family, level, value } = celebration;
  const t = tierColors(level, accent);
  const ground = mixHex(t.ring, '#0B0B0F', 0.9);
  const pixel = pixelFont();
  const { exportRef, busy, notice, share } = useRecapExport();
  const layout = badgeShareLayout(PixelRatio.get());
  // Two presses in one frame both see closing === false; the ref lets only the first through.
  const closed = useRef(false);
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    setClosing(true);
    onDone();
  };

  const insets = useInsets();
  const { height } = useWindowDimensions();
  // Small phones (iPhone SE) get a smaller badge; the block also scrolls rather than clip.
  const compact = height - insets.top - insets.bottom < COMPACT_HEIGHT;
  const badgeSize = compact ? 140 : 190;
  const coachSize = compact ? 64 : 86;

  return (
    <View testID="celebration-screen" style={{ flex: 1, backgroundColor: ground, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {reduceMotion ? null : (
        <View testID="celebration-confetti" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
          {MARGIN_CONFETTI.map((spot, i) => (
            <ConfettiSquare key={i} spot={spot} i={i} />
          ))}
        </View>
      )}
      {/* The block centred between the top inset and the buttons; it scrolls if it cannot fit. */}
      <ScrollView testID="celebration-scroll" style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 18, paddingHorizontal: SIDE, paddingVertical: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontFamily: pixel, fontSize: 14, letterSpacing: 2, color: t.ring }}>NEW BADGE LEVEL</Text>
        <View testID="celebration-hero" style={{ alignSelf: 'stretch', alignItems: 'center', marginTop: 12 }}>
          {reduceMotion ? null : (
            <View testID="celebration-hero-confetti" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
              {HERO_CONFETTI.map((spot, i) => (
                <ConfettiSquare key={i} spot={spot} i={i + MARGIN_CONFETTI.length} />
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <BadgeIcon testID="celebration-badge" family={family} level={level} size={badgeSize} pips={false} coachAccent={accent} />
            <View testID="celebration-coach" style={{ marginLeft: -Math.round(coachSize * 0.47), marginBottom: -10 }}>
              <Character characterId={characterId} mood="idle" size={coachSize} />
            </View>
          </View>
        </View>
        <View testID="celebration-pips" style={{ flexDirection: 'row', gap: 6 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ width: 12, height: 12, backgroundColor: i <= level ? t.ring : LOCKED_PIP }} />
          ))}
        </View>
        <Text testID="celebration-title" style={{ fontFamily: pixel, fontSize: 26, lineHeight: 30, textAlign: 'center', color: INK }}>
          {levelTitle(family, level).toUpperCase()}
        </Text>
        <Text testID="celebration-value" style={{ fontFamily: FONTS.sans, fontSize: 17, lineHeight: 24, textAlign: 'center', color: t.glyph }}>
          {valueLine(family, value)}
        </Text>
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: hexAlpha(t.ring, 0.3), backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 }}>
          <Character characterId={characterId} mood="idle" size={36} />
          <Text testID="celebration-coach-line" style={{ flex: 1, fontFamily: FONTS.sans, fontSize: 15, lineHeight: 21, color: INK }}>
            {coachLine(family, level, thresholds)}
          </Text>
        </View>
      </ScrollView>
      {/* Pinned at the bottom, above the bottom inset. */}
      <View testID="celebration-actions" style={{ gap: 12, paddingHorizontal: SIDE, paddingTop: 8, paddingBottom: 24 }}>
        {notice ? (
          <Text testID="celebration-notice" accessibilityLiveRegion="polite" style={{ fontFamily: FONTS.sans, fontSize: 14, lineHeight: 20, textAlign: 'center', color: NOTICE_INK }}>
            {EXPORT_NOTICES[notice]}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {/* Standard Buttons tinted for the badge's dark ground, which holds in
              either app theme: the tint and label colours come through style. */}
          <Button
            testID="celebration-share"
            variant="outline"
            size="lg"
            disabled={busy}
            onPress={() => void share()}
            className="flex-1"
            style={{ borderColor: hexAlpha(t.ring, 0.5), backgroundColor: 'transparent' }}
          >
            <Text className={buttonTextVariants({ variant: 'outline', size: 'lg' })} style={{ color: INK }}>
              Share
            </Text>
          </Button>
          <Button testID="celebration-done" size="lg" disabled={closing} onPress={close} className="flex-1" style={{ backgroundColor: t.ring }}>
            <Text className={buttonTextVariants({ size: 'lg' })} style={{ color: ground }}>
              Nice!
            </Text>
          </Button>
        </View>
      </View>
      {/* The export view: off screen at a fixed size, the only thing captured. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: -10000, top: 0 }}>
        <View ref={exportRef} collapsable={false} testID="celebration-export" style={{ width: layout.width, height: layout.height }}>
          <BadgeShareCard family={family} level={level} value={value} coachAccent={accent} scale={layout.scale} />
        </View>
      </View>
    </View>
  );
}
