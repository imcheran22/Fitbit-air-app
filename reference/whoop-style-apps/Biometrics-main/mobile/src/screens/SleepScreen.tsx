import React, { useContext, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useCharacter } from '../characters/CharacterContext';
import { useScreenFocused } from '../characters/useScreenFocused';
import { characterInfo } from '../components/characters/registry';
import { AskCoachBar } from '../components/coach/AskCoachBar';
import { BedtimeGoalRow } from '../components/sleep/BedtimeGoalRow';
import { BedtimeToWakeCard, type SleepRange } from '../components/sleep/BedtimeToWakeCard';
import { NightCards } from '../components/sleep/NightCards';
import { NightPicker } from '../components/sleep/NightPicker';
import { NightSummary } from '../components/sleep/NightSummary';
import { RegularityCard } from '../components/sleep/RegularityCard';
import { SectionError } from '../components/sleep/Section';
import { SleepHeader } from '../components/sleep/SleepHeader';
import { SleepHero } from '../components/sleep/SleepHero';
import { SleepInfoSheet } from '../components/sleep/SleepInfoSheet';
import { SleepMonthCard } from '../components/sleep/SleepMonthCard';
import { Skeleton } from '../components/ui/skeleton';
import { sleepQuestion } from '../lib/coachPrompts';
import { askLabel, SLEEP_COPY } from '../lib/sleepCopy';
import { DEFAULT_SLEEP_GOAL_MINUTES } from '../lib/sleepStats';
import { coachEntryRoute, useCoachStatus } from '../lib/useCoachStatus';
import { useSleepPage } from '../lib/useSleepPage';
import { navigateToCoachEntry } from '../navigation/coachNavigation';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useSync } from '../sync/SyncProvider';

// The one Sleep page (spec 2026-10-09 §3): one night in full under a 7-night picker, then the trends, the goal and
// Ask. The route param is the single source of truth for the night, so back leaves the page in one step.
export function SleepScreen() {
  const navigation = useNavigation<any>();
  const param = useRoute<RouteProp<RootStackParamList, 'Sleep'>>().params?.date;
  // Context, not the hook: tests render screens without a provider.
  const insets = useContext(SafeAreaInsetsContext);
  const page = useSleepPage(param);
  const { state: syncState } = useSync();
  const scroll = useRef<ScrollView>(null);
  const [info, setInfo] = useState(false);
  const [range, setRange] = useState<SleepRange>('week');
  const { status: coachStatus } = useCoachStatus(navigation);
  const coachRoute = coachEntryRoute(coachStatus);
  const focused = useScreenFocused();
  const { characterId } = useCharacter();
  const coachName = characterInfo(characterId).name;

  // Tapping the night already shown does nothing (no params churn, no scroll).
  const select = (d: string) => {
    if (d !== page.date) navigation.setParams({ date: d });
  };
  const scrollTop = () => scroll.current?.scrollTo?.({ y: 0, animated: true });
  // A tap below the night (chart bars, month cells): select it and scroll up to the content it changed. The night
  // already shown stays a no-op, with no scroll either.
  const selectFromBelow = (d: string) => {
    if (d === page.date) return;
    select(d);
    scrollTop();
  };
  // The month card opens on D's month; a newly selected night brings it back there.
  const [viewMonth, setViewMonth] = useState<string | null>(null);
  useEffect(() => { setViewMonth(null); }, [page.date]);
  const shownMonth = viewMonth ?? (page.date ?? page.today).slice(0, 7);
  const { loadMonth } = page;
  useEffect(() => { loadMonth(shownMonth); }, [shownMonth, page.anchor, loadMonth]);
  const pad = { paddingTop: (insets?.top ?? 0) + 8, paddingHorizontal: 16 };
  const header = <SleepHeader onBack={() => navigation.goBack()} onInfo={() => setInfo(true)} onGoal={() => navigation.navigate('BedtimeGoal')} />;
  const bundle = page.night.status === 'ready' ? page.night.data : null;
  const sheet = <SleepInfoSheet visible={info} onClose={() => setInfo(false)} detail={bundle?.score ?? null} bands={page.bands} />;

  if (page.date === null) {
    return (
      <View className="flex-1 bg-background" style={pad}>
        {header}
        <View testID="sleep-loading" className="items-center gap-3.5 pt-4">
          <Skeleton className="h-[200px] w-[125px] rounded-card" />
          <Skeleton className="h-[60px] w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-64 w-full rounded-card" />
        </View>
        {sheet}
      </View>
    );
  }

  const date = page.date;
  const isLastNight = date === page.today;
  const hasNight = bundle ? bundle.night !== null && !bundle.night.mainIsNap : true;
  const goalMinutes = page.goal.phase === 'ready' ? page.goal.data.sleepGoalMinutes : null;
  // The verdict depends on the goal (Short night), so the hero waits for it rather than flipping once it lands; a
  // failed goal reads as the default goal, as the month card does (Task 5 M1).
  const heroLoad = page.goal.phase === 'loading' ? { status: 'loading' as const } : page.night;
  const heroGoal = goalMinutes ?? DEFAULT_SLEEP_GOAL_MINUTES;

  return (
    <View className="flex-1 bg-background">
      <ScrollView ref={scroll} contentContainerStyle={{ ...pad, gap: 14, paddingBottom: coachRoute ? 120 : 32 }}>
        {header}
        {page.night.status === 'error' ? (
          <SectionError testID="sleep-night-retry" message={SLEEP_COPY.nightError} onRetry={page.reloadNight} />
        ) : (
          <SleepHero date={date} today={page.today} load={heroLoad} goalMinutes={heroGoal} bands={page.bands} />
        )}
        <NightPicker
          anchor={page.anchor}
          today={page.today}
          date={date}
          window={page.window}
          syncing={syncState === 'syncing'}
          onSelect={select}
          onRetry={page.reloadWindow}
        />
        {bundle ? (
          <NightSummary date={date} today={page.today} night={bundle.night} goalMinutes={goalMinutes} />
        ) : page.night.status === 'loading' ? (
          <>
            <Skeleton testID="sleep-summary-loading" className="h-20 w-full rounded-card" />
            {/* The night cards hold their place while a night loads, so the page does not jump (spec §6). */}
            <Skeleton testID="sleep-night-cards-loading" className="h-64 w-full rounded-card" />
          </>
        ) : null}
        {bundle?.night ? (
          // pop: back on the tab navigator rather than a second Tabs pushed over this page (ruling F3).
          <NightCards night={bundle.night} onStepsThatDay={() => navigation.navigate('Tabs', { screen: 'Activity', params: { date } }, { pop: true })} />
        ) : null}
        {page.window.phase === 'ready' ? (
          <BedtimeToWakeCard
            anchor={page.anchor}
            date={date}
            nights={page.window.data.nights}
            hasSleep={page.window.data.earliestDate !== null}
            goal={page.goal.phase === 'ready' ? page.goal.data : null}
            range={range}
            onRange={setRange}
            onSelect={selectFromBelow}
          />
        ) : null}
        <RegularityCard state={page.regularity} onRetry={page.reloadRegularity} />
        <SleepMonthCard
          viewMonth={shownMonth}
          today={page.today}
          date={date}
          load={page.month(shownMonth)}
          goalMinutes={goalMinutes ?? DEFAULT_SLEEP_GOAL_MINUTES}
          earliestDate={page.window.phase === 'ready' ? page.window.data.earliestDate : null}
          onPage={setViewMonth}
          onRetry={page.retryMonth}
          onSelect={selectFromBelow}
        />
        <BedtimeGoalRow goal={page.goal} reminder={page.reminder} onPress={() => navigation.navigate('BedtimeGoal')} onRetry={page.reloadGoal} />
      </ScrollView>
      {coachRoute ? (
        <AskCoachBar
          label={askLabel(coachName, isLastNight)}
          focused={focused}
          onPress={() => navigateToCoachEntry(navigation, coachRoute, sleepQuestion(date, isLastNight, hasNight))}
        />
      ) : null}
      {sheet}
    </View>
  );
}
