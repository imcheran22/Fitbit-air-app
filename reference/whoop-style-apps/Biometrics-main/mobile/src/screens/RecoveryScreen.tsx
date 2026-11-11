import React, { useContext, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useCharacter } from '../characters/CharacterContext';
import { useScreenFocused } from '../characters/useScreenFocused';
import { characterInfo } from '../components/characters/registry';
import { AskCoachBar } from '../components/coach/AskCoachBar';
import { RecoveryCalendar } from '../components/recovery/RecoveryCalendar';
import { RecoveryHeader } from '../components/recovery/RecoveryHeader';
import { RecoveryHero } from '../components/recovery/RecoveryHero';
import { RecoveryInfoSheet } from '../components/recovery/RecoveryInfoSheet';
import { LastNightTile } from '../components/recovery/LastNightTile';
import { LastSevenDays } from '../components/recovery/LastSevenDays';
import { SleepDebtTile } from '../components/recovery/SleepDebtTile';
import { StreakTile } from '../components/recovery/StreakTile';
import { TomorrowForecastCard } from '../components/recovery/TomorrowForecastCard';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { SectionLabel } from '../components/ui/section-label';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { recoveryQuestion } from '../lib/coachPrompts';
import { buildingCopy, buildRecoverySummary, headerSubtitle, RECOVERY_COPY } from '../lib/recoveryCopy';
import { pickColdStartProgress } from '../lib/scoreInsights';
import { coachEntryRoute, useCoachStatus } from '../lib/useCoachStatus';
import { useRecoveryPage } from '../lib/useRecoveryPage';
import { navigateToCoachEntry } from '../navigation/coachNavigation';
import type { RootStackParamList } from '../navigation/RootNavigator';

// The Recovery page (spec §3): header, weather hero, summary, then the sections in spec order.
// `date` is a civil YYYY-MM-DD; without it the page shows today.
export function RecoveryScreen() {
  const navigation = useNavigation<any>();
  const date = useRoute<RouteProp<RootStackParamList, 'Recovery'>>().params?.date;
  // Context, not the hook: tests render screens without a provider.
  const insets = useContext(SafeAreaInsetsContext);
  const { state, page, errorKind, reload, month, loadMonth } = useRecoveryPage(date);
  const [info, setInfo] = useState(false);
  // The calendar's month; null shows D's month.
  const [viewMonth, setViewMonth] = useState<string | null>(null);
  const { status: coachStatus } = useCoachStatus(navigation);
  const coachRoute = coachEntryRoute(coachStatus);
  const focused = useScreenFocused();
  const { characterId } = useCharacter();
  const coachName = characterInfo(characterId).name;

  const header = (
    <RecoveryHeader
      subtitle={page ? headerSubtitle(page.date, page.updatedAt, page.isToday) : null}
      onBack={() => navigation.goBack()}
      onInfo={page ? () => setInfo(true) : null}
    />
  );
  const pad = { paddingTop: (insets?.top ?? 0) + 8, paddingHorizontal: 16 };

  if (state === 'loading') {
    return (
      <View className="flex-1 bg-background" style={pad}>
        {header}
        {/* The hero block is as wide as the hero art (140, see WeatherIcon). */}
        <View testID="recovery-loading" className="items-center gap-3.5 pt-4">
          <Skeleton className="h-[220px] w-[140px] rounded-card" />
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </View>
      </View>
    );
  }
  if (state === 'error' || !page) {
    return (
      <View className="flex-1 bg-background" style={pad}>
        {header}
        <View testID="recovery-error" className="flex-1 items-center justify-center gap-3">
          <Text className="text-center text-body text-muted-foreground">{errorKind === 'future' ? RECOVERY_COPY.futureError : RECOVERY_COPY.loadError}</Text>
          {errorKind === 'future' ? null : <Button variant="outline" onPress={reload}>{RECOVERY_COPY.tryAgain}</Button>}
        </View>
      </View>
    );
  }

  const past = !page.isToday;
  // The viewed day is already on screen: pressing it (the strip's last column, the ringed cell) does nothing.
  const openDay = (d: string) => { if (d !== page.date) navigation.push('Recovery', { date: d }); };
  const cold = page.score ? pickColdStartProgress(page.score.coldStart) : null;
  const summary =
    page.state === 'READY' && page.score ? buildRecoverySummary(page.score, past)
    : page.state === 'BUILDING' && cold ? buildingCopy(cold).summary
    : null;
  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ ...pad, gap: 14, paddingBottom: coachRoute ? 120 : 32 }}>
        {header}
        <RecoveryHero page={page} />
        {summary ? (
          <Card testID="recovery-summary" className="rounded-tile">
            <Text className="text-body">{summary}</Text>
          </Card>
        ) : null}
        <LastSevenDays page={page} onOpenDay={openDay} />
        <View className="gap-[10px]">
          <SectionLabel>{RECOVERY_COPY.sleepAndStreak}</SectionLabel>
          <SleepDebtTile page={page} />
          <View className="flex-row gap-[10px]">
            <LastNightTile page={page} navigation={navigation} className="flex-1" />
            <StreakTile page={page} className="flex-1" />
          </View>
        </View>
        <RecoveryCalendar
          page={page}
          viewMonth={viewMonth ?? page.month.month}
          load={month(viewMonth ?? page.month.month)}
          onPage={(m) => { setViewMonth(m); loadMonth(m); }}
          onRetry={(m) => loadMonth(m)}
          onOpenDay={openDay}
          today={page.today}
        />
        {page.isToday && page.tomorrow ? (
          <TomorrowForecastCard
            tomorrow={page.tomorrow}
            bands={page.bands}
            goalMinutes={page.sleepDebt?.goalMinutes}
            onMoreLevers={() => navigation.navigate('Forecast')}
          />
        ) : null}
      </ScrollView>
      {coachRoute ? (
        <AskCoachBar
          label={past ? RECOVERY_COPY.askPast(coachName) : RECOVERY_COPY.askToday(coachName)}
          focused={focused}
          onPress={() => navigateToCoachEntry(navigation, coachRoute, recoveryQuestion({ state: page.state, isToday: page.isToday, date: page.date }))}
        />
      ) : null}
      <RecoveryInfoSheet visible={info} onClose={() => setInfo(false)} page={page} />
    </View>
  );
}
