import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { ForecastCellDTO } from '../../api/forecast';
import { FORECAST_COPY } from '../../lib/forecastCopy';
import { scoreBand } from '../../lib/scoreInsights';
import { COLORS } from '../../theme';
import { ConfidenceBadge } from '../ui/confidence-badge';
import { Glow } from '../ui/glow';
import { ScoreRing } from '../ui/score-ring';
import { Text } from '../ui/text';

const RING = 216;
const GLOW = 300;

/**
 * The forecast score ring, its band and confidence for one grid cell. The
 * likely range sits under the ring as the headline, and confidence is always
 * shown next to it -- a forecast never appears without saying how sure it is.
 */
export function ForecastHero({ cell, label }: { cell: ForecastCellDTO; label?: string }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const tone = colors[scoreBand(cell.score)];
  return (
    <View className="items-center gap-4">
      <View style={{ width: RING, height: RING }} className="items-center justify-center">
        <Glow color={tone} size={GLOW} around={RING} />
        <View testID="forecast-score-value" accessibilityLabel={`Forecast ${Math.round(cell.score)}`}>
          <ScoreRing score={cell.score} size={RING} strokeWidth={16} numeralClassName="text-score" label={label} />
        </View>
      </View>
      <View className="items-center gap-3 px-4">
        <Text testID="forecast-band" className="text-heading text-center tabular-nums">
          {FORECAST_COPY.band(cell.band[0], cell.band[1])}
        </Text>
        <ConfidenceBadge level={cell.confidence} />
      </View>
    </View>
  );
}
