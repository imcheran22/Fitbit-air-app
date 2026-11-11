import React from 'react';
import { View } from 'react-native';
import type { RecoveryPageDTO } from '../../api/recovery';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';
import { WeatherIcon } from './WeatherIcon';
import { buildBaselineSentence, SCORE_FRAMING } from '../../lib/scoreInsights';
import { RECOVERY_COPY, type WeatherKey } from '../../lib/recoveryCopy';

// The order of RECOVERY_COPY.infoBands: best band first.
const BAND_ICONS: WeatherKey[] = ['clear', 'mostlyClear', 'cloudy', 'stormy'];

// "How the score works" (spec §3.1): the framing, the weights, the baselines used and the band ranges.
export function RecoveryInfoSheet({ visible, onClose, page }: { visible: boolean; onClose: () => void; page: RecoveryPageDTO }) {
  return (
    <Sheet visible={visible} onClose={onClose} testID="recovery-info-sheet">
      <View className="gap-3 pb-2">
        <Text className="text-heading">{RECOVERY_COPY.infoTitle}</Text>
        <Text className="text-body">{SCORE_FRAMING}</Text>
        <Text className="text-body">{RECOVERY_COPY.infoHow(page.weights)}</Text>
        {page.baselines.map((b) => (
          <Text key={b.metric} className="text-body">{buildBaselineSentence(b)}</Text>
        ))}
        <View className="gap-2">
          {RECOVERY_COPY.infoBands(page.bands).map((line, i) => (
            <View key={BAND_ICONS[i]} className="flex-row items-center gap-2.5">
              <WeatherIcon kind={BAND_ICONS[i]!} variant="small" size={22} />
              <Text className="flex-1 text-body">{line}</Text>
            </View>
          ))}
        </View>
      </View>
    </Sheet>
  );
}
