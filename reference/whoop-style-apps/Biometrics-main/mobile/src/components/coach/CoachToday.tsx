import React, { memo, useCallback } from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { TodayBarDTO, TodaySummaryDTO } from '../../api/coach';
import { barQuestion, spanQuestion } from '../../lib/coachToday';
import { COLORS } from '../../theme';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';
import { BAR_LABEL_WIDTH, BAR_VALUE_WIDTH, TodayBar } from './TodayBar';

export const TODAY_FOOTNOTE = 'Comparisons against your own readings, not medical advice.';
export const TODAY_EMPTY = "Once your first night syncs, I'll sum up your day here.";

// Whether CoachToday shows the page's footnote itself: only beside a sentence
// or bars to compare. Otherwise the page must show it (it appears exactly once).
export function todayShowsFootnote(summary: TodaySummaryDTO | null): boolean {
  return !!summary && summary.hasData && (!!summary.sentence || summary.bars.length > 0);
}

interface CoachTodayProps {
  // null: not loaded (yet), or the request failed.
  summary: TodaySummaryDTO | null;
  loading: boolean;
  // Sends a question to the coach, as if typed. Keep it stable (useCallback):
  // the bars are memoised on it.
  onAsk: (question: string) => void;
}

// The Coach page's picture of today (spec 1.2): the character's headline
// sentence with tappable metric words, then four "today vs usual" bars, then
// the one footnote on the page. Skeleton bars while the first load runs; a
// short promise before any data exists; nothing if the summary failed.
export const CoachToday = memo(function CoachToday({ summary, loading, onAsk }: CoachTodayProps) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const askAboutBar = useCallback((bar: TodayBarDTO) => onAsk(barQuestion(bar)), [onAsk]);

  if (!summary) {
    if (!loading) return null;
    return (
      <View testID="coach-today-loading" className="gap-3">
        <Skeleton className="h-6 w-11/12" />
        <Skeleton className="h-6 w-2/3" />
        <View className="gap-2">
          {[0, 1, 2, 3].map((i) => (
            // Laid out like a TodayBar row, so the tracks don't change length when the data arrives.
            <View key={i} testID={`today-bar-skeleton-${i}`} className="h-9 flex-row items-center gap-2">
              <View style={{ width: BAR_LABEL_WIDTH }} />
              <Skeleton className="h-2 flex-1 rounded-full" />
              <View testID={`today-bar-skeleton-value-${i}`} style={{ width: BAR_VALUE_WIDTH }} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (!summary.hasData) {
    return (
      <Text testID="coach-today-empty" className="text-heading text-muted-foreground">
        {TODAY_EMPTY}
      </Text>
    );
  }

  // Nothing to compare: the page shows the footnote instead.
  if (!todayShowsFootnote(summary)) return null;
  const { sentence, bars } = summary;

  return (
    <View testID="coach-today" className="gap-3">
      {sentence ? (
        <Text testID="coach-today-sentence" className="text-heading">
          {sentence.spans.map((span, index) => {
            if (!span.metric) return <Text key={index} className="text-heading">{span.text}</Text>;
            const metric = span.metric;
            const bar = bars.find((b) => b.metric === metric);
            // Text, so the text-safe status colours (R40), like the bar values.
            const color = bar?.status === 'below' ? colors.statusBelowText : bar?.status === 'above' ? colors.statusAboveText : colors.foreground;
            return (
              <Text
                key={index}
                testID={`today-span-${metric}`}
                accessibilityRole="link"
                accessibilityHint="Asks your coach about it"
                onPress={() => onAsk(spanQuestion(metric, bars))}
                className="text-heading"
                style={{
                  textDecorationLine: 'underline',
                  textDecorationStyle: 'dotted',
                  color,
                }}
              >
                {span.text}
              </Text>
            );
          })}
        </Text>
      ) : null}
      {bars.length > 0 ? (
        <View testID="coach-today-bars" className="gap-2">
          {bars.map((bar) => (
            <TodayBar key={bar.metric} bar={bar} onPress={askAboutBar} />
          ))}
        </View>
      ) : null}
      <Text testID="coach-today-footnote" className="text-caption text-muted-foreground">
        {TODAY_FOOTNOTE}
      </Text>
    </View>
  );
});
