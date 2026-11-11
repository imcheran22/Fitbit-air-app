import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import type { DailyScoreDTO, ScoreBandsDTO } from '../../api/scores';
import type { SleepNight } from '../../api/sleep';
import { FORECAST_COPY } from '../../lib/forecastCopy';
import { forecastRange, ICON, isShortNight, todayWeather, type SceneKey } from '../../lib/home/scene';
import { HOME_COPY } from '../../lib/homeCopy';
import { formatMinutes, VERDICT } from '../../lib/recoveryCopy';
import { scoreBand } from '../../lib/scoreInsights';
import type { CoachEntryRoute } from '../../lib/useCoachStatus';
import type { ForecastState } from '../../lib/useForecast';
import { COLORS } from '../../theme';
import { WeatherIcon } from '../recovery/WeatherIcon';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { SectionLabel } from '../ui/section-label';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';

export type Read<T> = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; value: T };
export type TodayTileKey = 'recovery' | 'sleep' | 'tomorrow';

const C = HOME_COPY;
// The board's lilac is unreadable on the light page; a deeper violet keeps the contrast there.
const LILAC = { dark: '#C4B5FD', light: '#6D28D9' } as const;

function useTones() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  return { colors: COLORS[scheme], lilac: LILAC[scheme] };
}

export function TodayHeader({ scene, bedtime }: { scene: SceneKey; bedtime: string | null }) {
  const { colors, lilac } = useTones();
  const hint = scene === 'night' ? C.today.night(bedtime) : scene === 'short' ? C.today.short : C.today.other;
  const tone = scene === 'night' ? lilac : scene === 'short' ? colors.scoreFair : colors.muted;
  return (
    <View testID="home-today" className="flex-row items-baseline justify-between gap-3">
      <SectionLabel>{C.today.label}</SectionLabel>
      <Text testID="home-today-hint" className="shrink text-caption" numberOfLines={1} style={{ color: tone }}>{hint}</Text>
    </View>
  );
}

function TodayTile({ testID, label, accessibilityLabel, onPress, children }: {
  testID: string;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} className="flex-1 active:opacity-80">
      <Card className="grow gap-[6px] rounded-tile p-[12px]">
        <SectionLabel>{label}</SectionLabel>
        {children}
      </Card>
    </Pressable>
  );
}

function TileSkeleton({ testID }: { testID: string }) {
  return <Skeleton testID={testID} className="h-[96px] flex-1 rounded-tile" />;
}

function Value({ testID, children }: { testID: string; children: string }) {
  return <Text testID={testID} className="text-heading tabular-nums">{children}</Text>;
}

function MoonIcon() {
  return (
    <View testID="home-tile-moon" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={22} height={22} viewBox="0 0 11 11">
        {ICON.moon.map(([x, y, w, h, fill], i) => (
          <Rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
        ))}
      </Svg>
    </View>
  );
}

function RecoveryTile({ read, bands, onPress }: { read: Read<DailyScoreDTO | null>; bands?: ScoreBandsDTO; onPress: () => void }) {
  const { colors } = useTones();
  if (read.status === 'loading') return <TileSkeleton testID="home-tile-recovery-loading" />;
  const score = read.status === 'ready' ? read.value : null;
  const raw = score?.score ?? null;
  const value = raw === null ? null : Math.round(raw);
  const weather = todayWeather(score, bands);
  const verdict = read.status === 'failed' || weather === 'none' ? null : VERDICT[weather];
  return (
    <TodayTile testID="home-tile-recovery" label={C.tiles.recovery} accessibilityLabel={C.tiles.recoveryLabel(value, verdict)} onPress={onPress}>
      <View className="flex-row items-center gap-[6px]">
        <WeatherIcon kind={weather} variant="small" size={22} />
        <Value testID="home-tile-recovery-value">{value === null ? C.none : String(value)}</Value>
      </View>
      <Text
        testID="home-tile-recovery-line"
        className="text-caption font-semibold"
        numberOfLines={2}
        style={{ color: raw === null ? colors.muted : colors[scoreBand(raw, bands)] }}
      >
        {read.status === 'failed' ? C.none : VERDICT[weather]}
      </Text>
    </TodayTile>
  );
}

function SleepTile({ read, night, onPress }: { read: Read<DailyScoreDTO | null>; night: Read<SleepNight | null>; onPress: () => void }) {
  const { colors, lilac } = useTones();
  if (read.status === 'loading') return <TileSkeleton testID="home-tile-sleep-loading" />;
  const value = read.status === 'ready' && read.value && read.value.score !== null ? Math.round(read.value.score) : null;
  const last = night.status === 'ready' ? night.value : null;
  const duration = last ? formatMinutes(last.mainMinutesAsleep ?? last.minutesAsleep) : null;
  const short = isShortNight(last);
  const line = duration ? (short ? C.tiles.short(duration) : duration) : null;
  return (
    <TodayTile testID="home-tile-sleep" label={C.tiles.sleep} accessibilityLabel={C.tiles.sleepLabel(value, line)} onPress={onPress}>
      <View className="flex-row items-center gap-[6px]">
        <MoonIcon />
        <Value testID="home-tile-sleep-value">{value === null ? C.none : String(value)}</Value>
      </View>
      {night.status === 'loading' ? (
        <Skeleton testID="home-tile-sleep-line-loading" className="h-[16px] w-[56px]" />
      ) : (
        <Text
          testID="home-tile-sleep-line"
          className="text-caption font-semibold"
          numberOfLines={2}
          style={{ color: line ? (short ? colors.scoreFair : lilac) : colors.muted }}
        >
          {line ?? C.none}
        </Text>
      )}
    </TodayTile>
  );
}

function TomorrowTile({ state, bedtime, onPress }: { state: ForecastState; bedtime: string | null; onPress: () => void }) {
  if (state.status === 'loading') return <TileSkeleton testID="home-tile-tomorrow-loading" />;
  const range = forecastRange(state);
  const forecast = state.status === 'loaded' ? state.forecast : null;
  let line: string | null = null;
  if (forecast?.status === 'NOT_ENOUGH_DATA') {
    line = forecast.reason === 'NO_HISTORY' ? FORECAST_COPY.unlocksAfter(forecast.daysOfHistory) : FORECAST_COPY.lowConfidence;
  } else if (forecast?.status === 'READY') {
    line = bedtime ? C.tiles.bedBy(bedtime) : C.tiles.withSleep(forecast.defaults.sleepHours);
  }
  return (
    <TodayTile
      testID="home-tile-tomorrow"
      label={C.tiles.tomorrow}
      accessibilityLabel={C.tiles.tomorrowLabel(range, line)}
      onPress={onPress}
    >
      <View className="h-[22px] justify-center">
        <Value testID="home-tile-tomorrow-value">{range ? C.tags.range(range.low, range.high) : C.none}</Value>
      </View>
      {line ? (
        <Text
          testID="home-tile-tomorrow-line"
          className={forecast?.status === 'READY' ? 'text-caption text-muted-foreground' : 'text-fine text-muted-foreground'}
          numberOfLines={forecast?.status === 'READY' ? 2 : 4}
        >
          {line}
        </Text>
      ) : null}
    </TodayTile>
  );
}

export function TodayTiles({ recovery, bands, sleepScore, night, tomorrow, bedtime, onOpen }: {
  recovery: Read<DailyScoreDTO | null>;
  bands?: ScoreBandsDTO;
  sleepScore: Read<DailyScoreDTO | null>;
  night: Read<SleepNight | null>;
  tomorrow: ForecastState;
  bedtime: string | null;
  onOpen: (tile: TodayTileKey) => void;
}) {
  return (
    <View testID="home-tiles" className="flex-row gap-[8px]">
      <RecoveryTile read={recovery} bands={bands} onPress={() => onOpen('recovery')} />
      <SleepTile read={sleepScore} night={night} onPress={() => onOpen('sleep')} />
      <TomorrowTile state={tomorrow} bedtime={bedtime} onPress={() => onOpen('tomorrow')} />
    </View>
  );
}

export function AskCoachButton({ route, onPress }: { route: CoachEntryRoute | null; onPress: () => void }) {
  const { colors } = useTones();
  if (!route) return null;
  return (
    <Button
      testID="coach-entry-button"
      variant="outline"
      className="h-[44px] w-full justify-start px-[14px]"
      iconStart={<Ionicons name="chatbubble-outline" size={18} color={colors.coach} />}
      onPress={onPress}
    >
      {C.askCoach(route === 'CoachConsent')}
    </Button>
  );
}
