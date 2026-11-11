import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { ReadyForecastDTO } from '../api/forecast';
import { ContributionBars } from '../components/forecast/contribution-bars';
import { ForecastHero } from '../components/forecast/forecast-hero';
import { LeverPanel } from '../components/forecast/lever-panel';
import { TrackRecordChart } from '../components/forecast/track-record-chart';
import { Card } from '../components/ui/card';
import { SectionLabel } from '../components/ui/section-label';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { FORECAST_COPY } from '../lib/forecastCopy';
import { contributionLabel, findCell, type LeverValues } from '../lib/forecastGrid';
import { useForecast } from '../lib/useForecast';
import { withAlpha } from '../lib/utils';
import { COLORS } from '../theme';

// "Wed, Jul 1" from the forecast's civil date, without a timezone shift.
function formatForecastDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function ForecastScreen() {
  const state = useForecast();

  if (state.status === 'error') {
    return (
      <View className="flex-1 bg-background px-5 pt-6">
        <Card testID="forecast-error">
          <Text className="text-caption text-muted-foreground">{FORECAST_COPY.loadError}</Text>
        </Card>
      </View>
    );
  }
  if (state.status === 'loading') {
    return (
      <View className="flex-1 items-center gap-5 bg-background px-5 pt-12">
        <Skeleton testID="forecast-loading" className="h-[216px] w-[216px] rounded-full" />
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-48 w-full rounded-card" />
      </View>
    );
  }
  const { forecast } = state;
  if (forecast.status === 'NOT_ENOUGH_DATA') {
    return (
      <View className="flex-1 bg-background px-5 pt-6">
        <Card>
          <Text className="text-body">
            {forecast.reason === 'NO_HISTORY' ? FORECAST_COPY.unlocksAfter(forecast.daysOfHistory) : FORECAST_COPY.lowConfidence}
          </Text>
        </Card>
      </View>
    );
  }
  return <ReadyForecast forecast={forecast} />;
}

function ReadyForecast({ forecast }: { forecast: ReadyForecastDTO }) {
  const [values, setValues] = useState<LeverValues>(forecast.defaults);
  const cell = useMemo(() => findCell(forecast, values), [forecast, values]);
  const { withinPoints, hits, days, series } = forecast.trackRecord;
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;

  const setLever = (key: string, v: number) =>
    setValues((prev) => (key === 'SLEEP' ? { ...prev, sleepHours: v } : { ...prev, habits: { ...prev.habits, [key]: v } }));

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 32 }}
    >
      <ForecastHero cell={cell} label={formatForecastDate(forecast.date)} />
      <LeverPanel levers={forecast.levers} values={values} onChange={setLever} onReset={() => setValues(forecast.defaults)} />

      <View className="gap-2">
        <SectionLabel className="px-1">{FORECAST_COPY.whyHeading}</SectionLabel>
        <Card className="gap-5 py-5">
          <Text className="text-caption text-muted-foreground">{FORECAST_COPY.effectOrder}</Text>
          <ContributionBars
            items={cell.contributions.map((c) => ({ key: c.key, points: c.points, label: contributionLabel(c.key, forecast, values) }))}
          />
        </Card>
      </View>

      <View className="gap-2">
        <SectionLabel className="px-1">{FORECAST_COPY.trackRecordHeading}</SectionLabel>
        <Card className="gap-4">
          <Text className="text-caption font-medium tabular-nums">
            {FORECAST_COPY.trackRecord(withinPoints, hits, days)}
          </Text>
          <TrackRecordChart series={series} actualColor={withAlpha(colors.muted, 0.6)} forecastColor={colors.accent} />
        </Card>
      </View>

      <Text className="px-4 text-center text-caption text-muted-foreground">{FORECAST_COPY.disclaimer}</Text>
    </ScrollView>
  );
}
