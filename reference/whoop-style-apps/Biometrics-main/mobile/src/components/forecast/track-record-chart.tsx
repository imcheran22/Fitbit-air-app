import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Text } from '../ui/text';
import { FORECAST_COPY } from '../../lib/forecastCopy';

export interface TrackRecordChartProps {
  series: Array<{ date: string; forecast: number; actual: number }>;
  height?: number;
  actualColor: string;
  forecastColor: string;
}

// "Jul 1" from a civil date, without a timezone shift.
function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Actual scores as a neutral line, past forecasts as accent dots, on a shared 0-100 axis. */
export function TrackRecordChart({ series, height = 112, actualColor, forecastColor }: TrackRecordChartProps) {
  const [width, setWidth] = useState(0);
  const x = (i: number) => (series.length <= 1 ? width / 2 : (i / (series.length - 1)) * (width - 8) + 4);
  const y = (v: number) => height - 4 - (v / 100) * (height - 8);
  const count = series.length;
  return (
    <View className="gap-2">
      <View testID="track-record-chart" style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && count > 0 ? (
          <Svg width={width} height={height}>
            <Polyline
              points={series.map((p, i) => `${x(i)},${y(p.actual)}`).join(' ')}
              fill="none"
              stroke={actualColor}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {series.map((p, i) => (
              <Circle key={p.date} cx={x(i)} cy={y(p.forecast)} r={3} fill={forecastColor} />
            ))}
          </Svg>
        ) : null}
      </View>

      {count > 1 ? (
        <View className="flex-row justify-between px-1">
          <Text className="text-fine text-muted-foreground">{shortDate(series[0].date)}</Text>
          <Text className="text-fine text-muted-foreground">{shortDate(series[Math.floor((count - 1) / 2)].date)}</Text>
          <Text className="text-fine text-muted-foreground">{shortDate(series[count - 1].date)}</Text>
        </View>
      ) : null}

      {count > 0 ? (
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 px-1">
          <View className="flex-row items-center gap-1.5">
            <View className="h-0.5 w-3.5 rounded-full" style={{ backgroundColor: actualColor }} />
            <Text className="text-fine text-muted-foreground">{FORECAST_COPY.legendActual}</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: forecastColor }} />
            <Text className="text-fine text-muted-foreground">{FORECAST_COPY.legendForecast}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
