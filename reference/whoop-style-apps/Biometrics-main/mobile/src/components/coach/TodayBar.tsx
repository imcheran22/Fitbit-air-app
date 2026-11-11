import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { TodayBarDTO } from '../../api/coach';
import { barColorKey, barFill, tickPosition } from '../../lib/coachToday';
import { spokenUnits } from '../../lib/spokenUnits';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';

const pct = (fraction: number): `${number}%` => `${Math.round(fraction * 1000) / 10}%`;

// The usual tick is the main non-colour status cue, so it stands proud of the
// track (R36): visible above and below the fill wherever the fill ends.
const TRACK_HEIGHT = 8;
const TICK_HEIGHT = 14;
// A 36pt row plus the 8pt gap between rows gives a 44pt pitch; the vertical
// hitSlop (3 + 3) stays inside that gap so neighbouring tap areas never overlap.
const ROW_HEIGHT = 36;
const HIT_SLOP = { top: 3, bottom: 3, left: 4, right: 4 };
// The label and value columns. The value column fits the longest text,
// measured with the bundled Geist fonts (13px bold value, 13px usual, both
// tabular): "10h 48m / 7h 13m" 114.0pt, "103.4 ms / 98.7" 96.8pt,
// "103 bpm / 98" 84.0pt, "100 / 100" 60.9pt; so every track stays the same
// length. 120 leaves room for an 11h night or a 10h usual (about 7pt more)
// and for CoreText drawing up to ~1pt wider than that measure. The loading
// skeleton (CoachToday) uses the same widths.
export const BAR_LABEL_WIDTH = 58;
export const BAR_VALUE_WIDTH = 120;

// Words follow the number, not the status (resting HR above usual is "below").
function direction(bar: TodayBarDTO): string | null {
  if (bar.status === null || bar.usual === null) return null;
  if (bar.status === 'near' || bar.value === bar.usual) return 'About usual.';
  return bar.value > bar.usual ? 'Higher than usual.' : 'Lower than usual.';
}

// The usual as a bare number after the value's unit ("41.2 ms / 52.3",
// "61 bpm / 55"), so the value column -- and so the track -- stays narrow.
// Durations keep their h/m form ("6h 48m / 7h 13m").
export function bareUsual(bar: Pick<TodayBarDTO, 'unit' | 'usualDisplay'>): string | null {
  if (!bar.usualDisplay) return null;
  if (bar.unit === 'minutes') return bar.usualDisplay;
  return bar.usualDisplay.replace(/\s*(?:ms|bpm|%)$/, '');
}

// Large text may grow the value only this far before the column clips it.
const MAX_FONT_SCALE = 1.3;

interface TodayBarProps {
  bar: TodayBarDTO;
  // Keep this stable (useCallback): the row is memoised.
  onPress: (bar: TodayBarDTO) => void;
}

// One "today vs usual" row (spec 1.2, sentence-style option 1): label, a track
// filled to today's value on the metric's scale, a tick at the 30-day usual,
// and "value / N" (the usual). The whole row is a button that asks the coach about it.
export const TodayBar = memo(function TodayBar({ bar, onPress }: TodayBarProps) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const fill = colors[barColorKey(bar)];
  const tick = tickPosition(bar);
  // Small text, so the text-safe status colours (R35/R40), never the fills.
  const valueColor = bar.status === 'below' ? colors.statusBelowText : bar.status === 'above' ? colors.statusAboveText : colors.foreground;
  const words = direction(bar);
  const usual = bareUsual(bar);
  // The full words for a screen reader: "HRV 41.2 milliseconds, usual 52.3 milliseconds."
  const spoken = `${bar.label} ${spokenUnits(bar.display)}${bar.usualDisplay ? `, usual ${spokenUnits(bar.usualDisplay)}.` : '.'}${words ? ` ${words}` : ''}`;

  return (
    <Pressable
      testID={`today-bar-${bar.metric}`}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Asks your coach about it"
      onPress={() => onPress(bar)}
      hitSlop={HIT_SLOP}
      className="flex-row items-center gap-2 active:opacity-70"
      style={{ minHeight: ROW_HEIGHT }}
    >
      <Text className="text-fine text-muted-foreground" style={{ width: BAR_LABEL_WIDTH }} numberOfLines={1}>
        {bar.label}
      </Text>
      <View className="flex-1 justify-center" style={{ height: TICK_HEIGHT }}>
        <View
          testID={`today-bar-track-${bar.metric}`}
          className="overflow-hidden rounded-full"
          style={{ height: TRACK_HEIGHT, backgroundColor: colors.todayTrack }}
        >
          <View
            testID={`today-bar-fill-${bar.metric}`}
            className="rounded-full"
            style={{ height: TRACK_HEIGHT, width: pct(barFill(bar)), backgroundColor: fill }}
          />
        </View>
        {tick !== null ? (
          <View
            testID={`today-bar-tick-${bar.metric}`}
            className="absolute rounded-full"
            style={{ top: 0, left: pct(tick), width: 2, height: TICK_HEIGHT, marginLeft: -1, backgroundColor: colors.todayTick }}
          />
        ) : null}
      </View>
      <Text testID={`today-bar-text-${bar.metric}`} className="text-right" style={{ width: BAR_VALUE_WIDTH }} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        <Text testID={`today-bar-value-${bar.metric}`} maxFontSizeMultiplier={MAX_FONT_SCALE} className="text-caption font-bold tabular-nums" style={{ color: valueColor }}>
          {bar.display}
        </Text>
        {usual ? (
          <Text testID={`today-bar-usual-${bar.metric}`} maxFontSizeMultiplier={MAX_FONT_SCALE} className="text-caption tabular-nums" style={{ color: colors.todayUsual }}>
            {` / ${usual}`}
          </Text>
        ) : null}
      </Text>
    </Pressable>
  );
});
