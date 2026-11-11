import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { RecoveryPageDTO } from '../../api/recovery';
import { COLORS } from '../../theme';
import { scoreBand } from '../../lib/scoreInsights';
import { BAND_WORD, RECOVERY_COPY, weatherFor, weekdayShort } from '../../lib/recoveryCopy';
import { PressableScale } from '../ui/pressable-scale';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';
import { WeatherIcon } from './WeatherIcon';

// The trailing week ending at D (spec §3.5); a column opens that day's Recovery.
export function LastSevenDays({ page, onOpenDay }: { page: RecoveryPageDTO; onOpenDay: (date: string) => void }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const lastIndex = page.outlook.length - 1;
  return (
    <View testID="recovery-last-seven" className="gap-2">
      <SectionLabel>{RECOVERY_COPY.lastSevenDays}</SectionLabel>
      <View className="flex-row">
        {page.outlook.map((day, i) => {
          const band = day.score === null ? null : scoreBand(day.score, page.bands);
          const last = i === lastIndex;
          const today = last && page.isToday;
          return (
            <PressableScale
              key={day.date}
              testID={`recovery-day-${day.date}`}
              accessibilityRole="button"
              accessibilityLabel={RECOVERY_COPY.cellLabel(day.date, day.score, band === null ? null : BAND_WORD[band])}
              className={`flex-1 items-center gap-1 py-2 ${last ? 'rounded-lg bg-muted' : ''}`}
              onPress={() => onOpenDay(day.date)}
            >
              <Text className={`text-fine text-muted-foreground ${today ? 'font-semibold' : ''}`}>
                {today ? RECOVERY_COPY.today : weekdayShort(day.date)}
              </Text>
              <WeatherIcon variant="small" size={22} kind={day.score === null ? 'none' : weatherFor(day.score, 'READY', page.bands)} dim={day.score === null} />
              <Text className="text-caption font-semibold tabular-nums" style={band === 'scorePoor' ? { color: colors.scorePoor } : undefined}>
                {day.score === null ? '—' : String(Math.round(day.score))}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
