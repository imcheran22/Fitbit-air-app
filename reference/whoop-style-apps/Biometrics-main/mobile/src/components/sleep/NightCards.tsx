import React from 'react';
import { View } from 'react-native';
import type { SleepNightDetail } from '../../api/sleep';
import { SLEEP_COPY } from '../../lib/sleepCopy';
import { formatClock, nightClock } from '../../lib/sleepStats';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';
import { InBedShare } from './InBedShare';
import { MomentsCard } from './MomentsCard';
import { NightNumbersCard } from './NightNumbersCard';
import { SleepCyclesCard } from './SleepCyclesCard';
import { StageLanes } from './StageLanes';

// The selected night inline (decision 1, spec §3.5-3.8). Stage instants are UTC; everything is told on the night's own
// clock. A nap-only date has no stage cards.
export function NightCards({ night, onStepsThatDay }: { night: SleepNightDetail; onStepsThatDay: () => void }) {
  const napOnly = night.mainIsNap === true;
  const stages = !napOnly && night.hasStages && night.stages.length > 0 ? night.stages : null;
  const clock = nightClock(night, stages ?? []);
  return (
    <>
      {stages ? (
        <>
          <Card testID="sleep-stages-card" className="gap-2.5">
            <SectionLabel>{SLEEP_COPY.stagesLabel}</SectionLabel>
            <StageLanes stages={stages} clock={clock} />
          </Card>
          <SleepCyclesCard stages={stages} clock={clock} />
          <MomentsCard stages={stages} clock={clock} minutesToFallAsleep={night.minutesToFallAsleep} minutesAsleep={night.minutesAsleep} />
        </>
      ) : !napOnly && night.minutesInBed > 0 ? (
        <Card testID="sleep-stages-card" className="gap-2">
          <SectionLabel>{SLEEP_COPY.stagesLabel}</SectionLabel>
          <View className="flex-row justify-between">
            <Text className="text-body font-semibold tabular-nums">{formatClock(night.bedtime)}</Text>
            <Text className="text-body font-semibold tabular-nums">{formatClock(night.wakeTime)}</Text>
          </View>
          <InBedShare minutesAsleep={night.minutesAsleep} minutesInBed={night.minutesInBed} testID="sleep-in-bed-share" />
        </Card>
      ) : null}
      <NightNumbersCard night={night} clock={clock} onStepsThatDay={onStepsThatDay} />
    </>
  );
}
