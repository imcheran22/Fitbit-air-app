import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { AnswerCardDTO, AnswerCardItemDTO } from '../../api/coach';
import { spokenUnits } from '../../lib/spokenUnits';
import { COLORS } from '../../theme';
import { Button, buttonIconSize } from '../ui/button';
import { Text } from '../ui/text';

const RANK_BAR_MAX = 70;

// Tiles sit in three equal columns like the mockup's grid: a cell is a third of
// the row and its padding makes the 6pt gutter (the row's negative margin
// cancels the outer half), so a 4th tile wraps to a new row at a third, and
// one or two tiles keep that width rather than stretching.
const TILE_GUTTER = 6;
const TILE_CELL = { width: '33.3333%', padding: TILE_GUTTER / 2 } as const;
const TILE_ROW = { margin: -TILE_GUTTER / 2 } as const;

type Palette = (typeof COLORS)['light'];

function statusColor(item: AnswerCardItemDTO, colors: Palette): string {
  if (item.status === 'below') return colors.statusBelow;
  if (item.status === 'above') return colors.statusAbove;
  return colors.foreground;
}

function statusTextColor(item: AnswerCardItemDTO, colors: Palette): string {
  if (item.status === 'below') return colors.statusBelowText;
  if (item.status === 'above') return colors.statusAboveText;
  return colors.foreground;
}

// The words follow the number, not the (goodness) status: a resting HR above
// its usual is "above usual" even though the server marks it below.
function comparison(item: AnswerCardItemDTO): string | null {
  if (!item.status) return null;
  // R41: the server's signed difference ("−25m vs usual"); cards stored before it fall back to words.
  if (item.deltaDisplay) return `${item.deltaDisplay} vs usual`;
  if (item.status === 'near') return 'on par';
  // Nothing to compare against: no words rather than a guess.
  if (item.usual === undefined) return null;
  if (item.value === item.usual) return 'on par';
  return item.value < item.usual ? 'below usual' : 'above usual';
}

// "−25m" -> "25 minutes below usual", "+1h 5m" -> "1 hour 5 minutes above usual",
// "+4 bpm" -> "4 beats per minute above usual": abbreviations a screen reader would misread.
function spokenDelta(delta: string): string {
  const below = /^[−-]/.test(delta);
  const size = spokenUnits(delta.replace(/^[−+-]\s*/, ''));
  return `${size} ${below ? 'below' : 'above'} usual`;
}

function spokenComparison(item: AnswerCardItemDTO): string | null {
  if (item.status && item.deltaDisplay) return spokenDelta(item.deltaDisplay);
  return comparison(item);
}

function Tile({ item, colors }: { item: AnswerCardItemDTO; colors: Palette }) {
  const words = comparison(item);
  const spoken = spokenComparison(item);
  // Small text, so the text-safe status colours (R40: rose/teal-700 in light
  // mode); the words still carry the status for anyone who can't see colour.
  const valueColor = statusTextColor(item, colors);
  return (
    <View
      testID={`answer-tile-${item.factId}`}
      accessible
      accessibilityLabel={`${item.label} ${item.display}${spoken ? `, ${spoken}` : ''}`}
      className="flex-1 rounded-tile bg-muted px-2.5 py-2"
    >
      <Text testID={`answer-tile-value-${item.factId}`} className="text-body font-bold tabular-nums" style={{ color: valueColor }}>
        {item.display}
      </Text>
      <Text testID={`answer-tile-caption-${item.factId}`} className="text-caption text-muted-foreground">{words ? `${item.label} · ${words}` : item.label}</Text>
    </View>
  );
}

function RankedRow({ item, rank, largest, colors }: { item: AnswerCardItemDTO; rank: number; largest: number; colors: Palette }) {
  const width = largest > 0 ? (Math.abs(item.value) / largest) * RANK_BAR_MAX : 0;
  const color = item.status ? statusColor(item, colors) : item.value < 0 ? colors.statusBelow : colors.statusAbove;
  return (
    <View
      testID={`answer-rank-${rank}`}
      accessible
      accessibilityLabel={`${rank}. ${item.label}, ${item.display}`}
      className={`flex-row items-center gap-2 py-1.5 ${rank > 1 ? 'border-t border-border' : ''}`}
    >
      <Text className="w-4 text-caption text-muted-foreground tabular-nums">{rank}</Text>
      <Text className="shrink text-body">{item.label}</Text>
      <View testID={`answer-rank-bar-${rank}`} className="h-1.5 rounded-full" style={{ width, backgroundColor: color }} />
      <Text testID={`answer-rank-effect-${rank}`} className="ml-auto text-caption text-foreground/80" numberOfLines={1}>
        {item.display}
      </Text>
    </View>
  );
}

// The card under a data answer (spec 1.3): a headline, then 1-4 number tiles
// or a ranked list, an optional "Try:" tip and the source line, which opens
// the screen holding the underlying data (the caller resolves it with
// cardDestination).
export function AnswerCard({ card, onOpenSource }: { card: AnswerCardDTO; onOpenSource?: () => void }) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const colors = dark ? COLORS.dark : COLORS.light;
  const largest = Math.max(0, ...(card.ranked ?? []).map((i) => Math.abs(i.value)));
  const tip = card.tip ? (/^try:/i.test(card.tip.trim()) ? card.tip.trim() : `Try: ${card.tip.trim()}`) : null;

  return (
    <View testID="answer-card" className="gap-2 rounded-card border border-border bg-card p-3.5">
      <Text className="text-body font-semibold">{card.headline}</Text>
      {card.tiles ? (
        <View testID="answer-tiles" className="flex-row flex-wrap" style={TILE_ROW}>
          {card.tiles.map((item, index) => (
            <View key={`${item.factId}-${index}`} testID={`answer-tile-cell-${item.factId}`} style={TILE_CELL}>
              <Tile item={item} colors={colors} />
            </View>
          ))}
        </View>
      ) : null}
      {card.ranked ? (
        <View>
          {card.ranked.map((item, index) => (
            <RankedRow key={`${item.factId}-${index}`} item={item} rank={index + 1} largest={largest} colors={colors} />
          ))}
        </View>
      ) : null}
      {tip ? (
        <View testID="answer-tip" className="rounded-tile px-3 py-2" style={{ backgroundColor: colors.tip }}>
          <Text className="text-body" style={{ color: colors.tipForeground }}>
            {tip}
          </Text>
        </View>
      ) : null}
      {card.source ? (
        onOpenSource ? (
          <Button
            testID="answer-source"
            labelTestID="answer-source-label"
            variant="link"
            size="sm"
            accessibilityLabel={card.source}
            accessibilityHint="Opens the data behind this answer"
            className="self-start"
            iconEnd={<Ionicons name="chevron-forward" size={buttonIconSize('sm')} color={colors.foreground} />}
            onPress={onOpenSource}
          >
            {card.source}
          </Button>
        ) : (
          <Text testID="answer-source" className="text-caption text-muted-foreground">
            {card.source}
          </Text>
        )
      ) : null}
    </View>
  );
}
