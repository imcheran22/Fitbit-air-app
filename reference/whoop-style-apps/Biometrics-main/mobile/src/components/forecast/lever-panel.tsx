import { View } from 'react-native';
import type { ForecastLeverDTO } from '../../api/forecast';
import { FORECAST_COPY } from '../../lib/forecastCopy';
import type { LeverValues } from '../../lib/forecastGrid';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Slider } from '../ui/slider';
import { Text } from '../ui/text';

export interface LeverPanelProps {
  levers: ForecastLeverDTO[];
  values: LeverValues;
  onChange: (key: string, value: number) => void;
  onReset: () => void;
}

/** One slider per lever; levers without a CONFIRMED effect are muted and captioned. Controlled. */
export function LeverPanel({ levers, values, onChange, onReset }: LeverPanelProps) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-1">
        <SectionLabel>{FORECAST_COPY.planHeading}</SectionLabel>
        <Button variant="link" size="sm" accessibilityRole="button" onPress={onReset}>
          {FORECAST_COPY.reset}
        </Button>
      </View>
      <Card className="gap-5 py-5">
        {levers.map((lever) => {
          const isSleep = lever.key === 'SLEEP';
          const value = isSleep ? values.sleepHours : (values.habits[lever.key] ?? 0);
          const format = (v: number) => FORECAST_COPY.leverValue(v, lever.unit, isSleep);
          const muted = lever.effect !== 'CONFIRMED';
          const tone = muted ? 'text-muted-foreground' : 'text-foreground';
          return (
            <View key={lever.key} className="gap-1.5">
              {/* The label takes the room and wraps, so a long custom habit name never pushes the value off the card. */}
              <View className="flex-row items-center justify-between gap-3">
                <Text className={`flex-1 text-body font-medium ${tone}`}>{lever.label}</Text>
                <Text className={`text-body font-semibold tabular-nums ${tone}`}>
                  {format(value)}
                </Text>
              </View>
              <Slider
                testID={`lever-${lever.key}`}
                value={value}
                min={lever.min}
                max={lever.max}
                step={lever.step}
                threshold={lever.threshold}
                muted={muted}
                onChange={(v) => onChange(lever.key, v)}
                accessibilityLabel={lever.label}
                formatValue={format}
              />
              {lever.effect === 'NONE_YET' ? <Text className="text-caption text-muted-foreground">{FORECAST_COPY.noneYet}</Text> : null}
              {lever.effect === 'NOT_MODELLED' ? <Text className="text-caption text-muted-foreground">{FORECAST_COPY.notModelled}</Text> : null}
            </View>
          );
        })}
      </Card>
    </View>
  );
}
