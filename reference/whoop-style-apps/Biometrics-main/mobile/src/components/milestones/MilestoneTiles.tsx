import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import Svg, { Path, Rect } from 'react-native-svg';
import type { MilestoneGlyph, MilestoneTile } from '../../lib/milestones';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';

// Milestone tiles (recap restyle 2026-10-05: the month screen's "Milestones"). A standalone grid,
// three to a row, so a later Achievements screen can reuse it: every milestone is shown; one not
// earned has its lock dimmed (not the tile, so the label keeps its contrast), a muted label and no
// count of how close it came. With badges, a tile may add its family's progress toward the next
// level and a "LEVEL UP" mark (achievements spec §6).

export type { MilestoneGlyph, MilestoneTile } from '../../lib/milestones';

export interface MilestoneTilesProps {
  tiles: MilestoneTile[];
  testID?: string;
}

const COLUMNS = 3;
const GAP = 10;
const GLYPH = 32;
export const LOCKED_OPACITY = 0.5;
// The month recap's "LEVEL UP" mark: the accent, darkened to teal-700 in light mode so 10px text
// clears 4.5:1 on the card (teal-600 alone is about 3.7:1).
export const LEVEL_UP_COLOR = { light: COLORS.light.statusAboveText, dark: COLORS.dark.accent } as const;

type Px = [x: number, y: number, w: number, h: number];

// 8×8 pixel glyphs (the design's star and heart; a calendar and a moon in the same hand).
const GLYPHS: Record<MilestoneGlyph, { px: Px[]; color: { light: string; dark: string } }> = {
  star: { px: [[3, 0, 2, 2], [0, 2, 8, 2], [2, 4, 4, 2], [1, 6, 2, 2], [5, 6, 2, 2]], color: { light: '#CA8A04', dark: '#FEF08A' } },
  heart: { px: [[1, 1, 2, 1], [5, 1, 2, 1], [0, 2, 8, 2], [1, 4, 6, 1], [2, 5, 4, 1], [3, 6, 2, 1]], color: { light: '#DB2777', dark: '#F472B6' } },
  calendar: { px: [[2, 0, 1, 2], [5, 0, 1, 2], [0, 1, 8, 2], [0, 3, 1, 5], [7, 3, 1, 5], [0, 7, 8, 1], [2, 4, 1, 1], [4, 4, 1, 1], [2, 5, 1, 1]], color: { light: '#2563EB', dark: '#93C5FD' } },
  moon: { px: [[2, 0, 4, 1], [1, 1, 2, 1], [0, 2, 2, 4], [1, 6, 2, 1], [2, 7, 4, 1], [6, 6, 1, 1]], color: { light: '#7C3AED', dark: '#C4B5FD' } },
};

function Glyph({ glyph, scheme, testID }: { glyph: MilestoneGlyph; scheme: 'light' | 'dark'; testID: string }) {
  const { px, color } = GLYPHS[glyph];
  return (
    <Svg testID={testID} viewBox="0 0 8 8" width={GLYPH} height={GLYPH}>
      {px.map(([x, y, w, h], i) => (
        <Rect key={i} x={x} y={y} width={w} height={h} fill={color[scheme]} />
      ))}
    </Svg>
  );
}

function Lock({ color, testID }: { color: string; testID: string }) {
  return (
    <Svg testID={testID} viewBox="0 0 24 24" width={28} height={GLYPH} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={5} y={11} width={14} height={9} rx={2} />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function MilestoneTiles({ tiles, testID = 'milestone-tiles' }: MilestoneTilesProps) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const rows: MilestoneTile[][] = [];
  for (let i = 0; i < tiles.length; i += COLUMNS) rows.push(tiles.slice(i, i + COLUMNS));
  return (
    <View testID={testID} style={{ gap: GAP }}>
      {rows.map((row, r) => (
        <View key={r} testID={`${testID}-row-${r}`} style={{ flexDirection: 'row', gap: GAP }}>
          {row.map((tile) => (
            <View
              key={tile.key}
              testID={`${testID}-${tile.key}`}
              accessible
              accessibilityLabel={`${tile.label}, ${tile.earned ? 'earned' : 'locked'}${tile.levelUp ? ', level up' : ''}${tile.progress ? `, ${tile.progress}` : ''}`}
              className="flex-1 items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-3"
            >
              <View
                testID={`${testID}-${tile.key}-icon`}
                style={{ height: GLYPH, justifyContent: 'center', opacity: tile.earned ? 1 : LOCKED_OPACITY }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {tile.earned ? <Glyph glyph={tile.glyph} scheme={scheme} testID={`${testID}-${tile.key}-glyph`} /> : <Lock color={COLORS[scheme].muted} testID={`${testID}-${tile.key}-lock`} />}
              </View>
              <Text testID={`${testID}-${tile.key}-label`} className="text-center text-caption" style={{ color: tile.earned ? COLORS[scheme].foreground : COLORS[scheme].muted }}>
                {tile.label}
              </Text>
              {tile.progress ? (
                <Text testID={`${testID}-${tile.key}-progress`} className="text-center text-caption tabular-nums" style={{ color: COLORS[scheme].muted }}>
                  {tile.progress}
                </Text>
              ) : null}
              {tile.levelUp ? (
                <Text testID={`${testID}-${tile.key}-levelup`} className="text-label" style={{ color: LEVEL_UP_COLOR[scheme] }}>
                  LEVEL UP
                </Text>
              ) : null}
            </View>
          ))}
          {/* Empty slots keep a short last row on the same columns. */}
          {Array.from({ length: COLUMNS - row.length }, (_, i) => (
            <View key={`empty-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}
