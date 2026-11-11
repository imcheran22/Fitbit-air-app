import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon, Rect } from 'react-native-svg';
import type { AchievementFamily } from '../../api/achievements';
import { useCharacterOptional } from '../../characters/CharacterContext';
import { LOCKED_PIP, glyphCells, octagonPoints, tierColors } from '../../lib/badgeArt';
import { badgeLabel } from '../../lib/badges';
import { characterInfo } from '../characters/registry';

export interface BadgeIconProps {
  family: AchievementFamily;
  /** 0 (locked) .. 5. */
  level: number;
  size: number;
  /** The five level pips under the badge. */
  pips?: boolean;
  /** Level V's colour; the user's current coach accent when omitted. */
  coachAccent?: string;
  testID?: string;
}

// One badge (canvas Badge.dc.html): the tier-coloured octagon ring, its dark face, the family's
// 12×12 glyph in the middle 52%, and optionally five pips. Drawn on a 100-unit viewBox.
const VIEW = 100;
const GLYPH_BOX = 52;
const CELL = GLYPH_BOX / 12;
const ORIGIN = (VIEW - GLYPH_BOX) / 2;

export function BadgeIcon({ family, level, size, pips = true, coachAccent, testID = 'badge' }: BadgeIconProps) {
  const current = useCharacterOptional();
  const accent = coachAccent ?? characterInfo(current?.characterId).accent;
  const lv = Math.max(0, Math.min(5, Math.round(level)));
  const t = tierColors(lv, accent);
  const ring = lv === 5 ? 9 : 6;
  const pip = Math.max(4, Math.round(size * 0.07));
  const label = badgeLabel(family, lv);
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, alignItems: 'center', gap: Math.round(size * 0.08) }}>
      <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        <Polygon points={octagonPoints(0, VIEW)} fill={t.ring} />
        <Polygon points={octagonPoints(ring, VIEW)} fill={t.fill} />
        {glyphCells(family).map(([c, r]) => (
          <Rect key={`${c}-${r}`} x={ORIGIN + c * CELL} y={ORIGIN + r * CELL} width={CELL + 0.05} height={CELL + 0.05} fill={t.glyph} />
        ))}
      </Svg>
      {pips ? (
        <View testID={`${testID}-pips`} style={{ flexDirection: 'row', gap: 4 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} testID={`${testID}-pip-${i}`} style={{ width: pip, height: pip, backgroundColor: i <= lv ? t.ring : LOCKED_PIP }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
