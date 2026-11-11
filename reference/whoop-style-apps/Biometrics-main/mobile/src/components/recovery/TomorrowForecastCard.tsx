import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { RecoveryTomorrowDTO } from '../../api/recovery';
import type { ScoreBandsDTO } from '../../api/scores';
import { FORECAST_COPY } from '../../lib/forecastCopy';
import { initialChip, RECOVERY_COPY, weatherFor } from '../../lib/recoveryCopy';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';
import { WeatherIcon } from './WeatherIcon';

// The track record needs a few days before "right N of last M" means anything.
const MIN_TRACK_DAYS = 5;

type Props = {
  tomorrow: RecoveryTomorrowDTO;
  bands: ScoreBandsDTO;
  goalMinutes: number | undefined;
  onMoreLevers: () => void;
};

// Tomorrow's forecast (spec §3.8): pick tonight's sleep and see tomorrow's likely range. Chips switch
// locally; every chip arrives in the bundle, so nothing refetches. Other statuses show one message.
export function TomorrowForecastCard({ tomorrow, bands, goalMinutes, onMoreLevers }: Props) {
  const [hours, setHours] = useState<number>(initialChip(goalMinutes));

  if (tomorrow.status !== 'READY') {
    const message =
      tomorrow.status === 'UNAVAILABLE' ? FORECAST_COPY.unavailable
      : tomorrow.reason === 'LOW_CONFIDENCE_TODAY' ? FORECAST_COPY.lowConfidence
      : FORECAST_COPY.unlocksAfter(tomorrow.daysOfHistory);
    return (
      <Card testID="recovery-tomorrow" className="gap-2">
        <SectionLabel>{RECOVERY_COPY.tomorrow}</SectionLabel>
        <Text className="text-caption text-muted-foreground">{message}</Text>
      </Card>
    );
  }

  const { chips, trackRecord } = tomorrow;
  const chip = chips.find((c) => c.sleepHours === hours) ?? chips[0];
  const [lo, hi] = chip.band;
  return (
    <Card testID="recovery-tomorrow" className="gap-3">
      <View className="flex-row items-center justify-between">
        <SectionLabel>{RECOVERY_COPY.tomorrow}</SectionLabel>
        {trackRecord.days >= MIN_TRACK_DAYS ? (
          <Text className="text-fine text-muted-foreground">{FORECAST_COPY.rightOfLast(trackRecord.hits, trackRecord.days)}</Text>
        ) : null}
      </View>

      <View className="flex-row items-center gap-3">
        <WeatherIcon kind={weatherFor(chip.score, 'READY', bands)} variant="small" size={44} />
        <Text className="text-number">{`${Math.round(lo)}–${Math.round(hi)}`}</Text>
        <Text className="flex-1 text-caption text-muted-foreground">{FORECAST_COPY.ifYouSleep(chip.sleepHours)}</Text>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel={FORECAST_COPY.sleepTonight} className="flex-row gap-2">
        {chips.map((c) => {
          const checked = c.sleepHours === chip.sleepHours;
          // Toggle chips: the selected one takes the default button look, the rest the outline look.
          return (
            <Pressable
              key={c.sleepHours}
              testID={`recovery-chip-${c.sleepHours}`}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityLabel={FORECAST_COPY.chipLabel(c.sleepHours, c.score)}
              onPress={() => setHours(c.sleepHours)}
              className={cn(
                'flex-1 items-center rounded-lg border py-2',
                checked ? 'border-transparent bg-foreground' : 'border-border bg-card active:bg-muted dark:border-input dark:bg-input/30',
              )}
            >
              <Text className={cn('text-caption', checked ? 'text-background' : 'text-muted-foreground')}>{FORECAST_COPY.chipHours(c.sleepHours)}</Text>
              <Text className={cn('text-headline tabular-nums', checked ? 'text-background' : 'text-foreground')}>{String(Math.round(c.score))}</Text>
            </Pressable>
          );
        })}
      </View>

      <Button variant="outline" className="w-full" onPress={onMoreLevers}>
        {FORECAST_COPY.moreLevers}
      </Button>
    </Card>
  );
}
