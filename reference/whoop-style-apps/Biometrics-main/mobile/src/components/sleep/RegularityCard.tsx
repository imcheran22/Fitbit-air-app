import React from 'react';
import { View } from 'react-native';
import type { SleepRegularity } from '../../api/sleep';
import { nightsToGo } from '../../lib/regularityCopy';
import { regularityA11y, regularityPendingA11y, regularityWord, SLEEP_COPY, spreadLine } from '../../lib/sleepCopy';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ScoreRing } from '../ui/score-ring';
import { SectionLabel } from '../ui/section-label';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';

export type RegularityState = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; data: SleepRegularity };

// The compact board card (spec §3.10). Always "Regularity", never "consistency": the Sleep score's Bedtime
// consistency factor is a different measure. Always the last 7 nights from today, whatever night is selected.
export function RegularityCard({ state, onRetry }: { state: RegularityState; onRetry: () => void }) {
  if (state.phase === 'loading') return <Skeleton testID="sleep-regularity-loading" className="h-24 w-full rounded-card" />;
  if (state.phase === 'error') {
    return (
      <Card testID="sleep-regularity-error" className="items-center gap-3 py-6">
        <Text className="text-center text-caption text-muted-foreground">{SLEEP_COPY.regularityError}</Text>
        <Button testID="sleep-regularity-retry" variant="secondary" size="sm" onPress={onRetry}>{SLEEP_COPY.tryAgain}</Button>
      </Card>
    );
  }
  const { data } = state;
  if (data.score === null) {
    const toGo = nightsToGo(data.days, data.nights);
    return (
      <Card testID="sleep-regularity" accessible accessibilityLabel={regularityPendingA11y(toGo)} className="gap-2">
        <SectionLabel>{SLEEP_COPY.regularityLabel}</SectionLabel>
        <Text testID="sleep-regularity-empty" className="text-body">{SLEEP_COPY.notEnoughNights(toGo)}</Text>
      </Card>
    );
  }
  const word = regularityWord(data.score);
  const spreads = spreadLine(data.bedtimeSpreadMinutes, data.wakeSpreadMinutes);
  return (
    <Card
      testID="sleep-regularity"
      accessible
      accessibilityLabel={regularityA11y(data.score, word, data.bedtimeSpreadMinutes, data.wakeSpreadMinutes)}
      className="flex-row items-center gap-4"
    >
      <ScoreRing score={data.score} size={64} strokeWidth={7} numeralClassName="text-headline" />
      <View className="flex-1 gap-1">
        <SectionLabel>{SLEEP_COPY.regularityLabel}</SectionLabel>
        <Text testID="sleep-regularity-word" className="text-body font-semibold">{word}</Text>
        {spreads ? <Text testID="sleep-regularity-spreads" className="text-caption text-muted-foreground tabular-nums">{spreads}</Text> : null}
      </View>
    </Card>
  );
}
