import React from 'react';
import { View } from 'react-native';
import type { ScoreBandsDTO, ScoreDetailDTO } from '../../api/scores';
import { buildBaselineSentence, SLEEP_SCORE_FRAMING } from '../../lib/scoreInsights';
import { infoBands, infoWeights, SLEEP_COPY } from '../../lib/sleepCopy';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

// "How the score works" (spec §3.1, decision 7), mirroring Recovery's. Works with the coach off and without a score.
export function SleepInfoSheet({ visible, onClose, detail, bands }: { visible: boolean; onClose: () => void; detail: ScoreDetailDTO | null; bands: ScoreBandsDTO | undefined }) {
  const weights = detail ? infoWeights(detail.score.factors) : null;
  // The duration factor is scored against the goal, so a SLEEP baseline is never listed as used (ScoreDetail's rule).
  const baselines = (detail?.baselines ?? []).filter((b) => b.metric !== 'SLEEP');
  return (
    <Sheet visible={visible} onClose={onClose} testID="sleep-info-sheet">
      <View className="gap-3 pb-2">
        <Text className="text-heading">{SLEEP_COPY.infoTitle}</Text>
        <Text className="text-body">{SLEEP_SCORE_FRAMING}</Text>
        <Text className="text-body">{SLEEP_COPY.infoHow}</Text>
        {weights ? <Text testID="sleep-info-weights" className="text-body">{weights}</Text> : null}
        {baselines.map((b) => (
          <Text key={b.metric} className="text-body">{buildBaselineSentence(b)}</Text>
        ))}
        <View className="gap-1.5">
          {infoBands(detail?.bands ?? bands).map((line) => (
            <Text key={line} className="text-body">{line}</Text>
          ))}
        </View>
      </View>
    </Sheet>
  );
}
