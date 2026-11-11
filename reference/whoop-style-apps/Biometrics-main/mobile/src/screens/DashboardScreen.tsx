import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { apiFetch } from '../api/client';
import { fetchScoresWithBands, type DailyScoreDTO, type ScoresResult } from '../api/scores';
import { fetchSleep, fetchSleepGoal, type SleepNight } from '../api/sleep';
import { useAuth } from '../auth/AuthContext';
import { Text } from '../components/ui/text';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { SectionLabel } from '../components/ui/section-label';
import { PageTitle } from '../components/ui/page-title';
import { Character } from '../components/characters/Character';
import { useScreenFocused } from '../characters/useScreenFocused';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { Reveal } from '../components/ui/reveal';
import { HabitLogCard } from '../components/habit-log-card';
import { CoachDigestCard } from '../components/coach-digest-card';
import { useStoryRing } from '../components/recap/StoryRing';
import { RecapShelf } from '../components/recap/RecapShelf';
import { HomeHeader, ProfileButton } from '../components/home/HomeHeader';
import { HomeScene, type SceneReadings, type SceneTarget } from '../components/home/HomeScene';
import { AskCoachButton, TodayHeader, TodayTiles, type Read } from '../components/home/TodayTiles';
import { MetricTile } from '../components/home/metric-tile';
import { COLORS, METRIC_ORDER, type MetricType } from '../theme';
import { computeStats, buildHeadline, type MetricRecord } from '../lib/metricInsights';
import { coachEntryRoute, useCoachStatus } from '../lib/useCoachStatus';
import { useForecast } from '../lib/useForecast';
import { todayCivil } from '../lib/heatmap';
import { forecastRange, nextSceneBoundary, SCENE_H, sceneExtra, sceneState, todayScore, todayWeather } from '../lib/home/scene';
import { useBuddyScene } from '../lib/home/useBuddyScene';
import { useMyKipColour } from '../lib/kip/myKipColour';
import { useRecapShelf } from '../lib/recap/useRecapShelf';
import { formatMinutes } from '../lib/recoveryCopy';
import { scoreBand } from '../lib/scoreInsights';
import { useSync } from '../sync/SyncProvider';
import { navigateToCoachEntry } from '../navigation/coachNavigation';
import { openSleep } from '../navigation/sleepNavigation';
import { useTabBarClearance } from '../navigation/tabBarLayout';

type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONNECTED';

function seriesFor(records: MetricRecord[], type: MetricType): MetricRecord[] {
  return records
    .filter((r) => r.metricType === type)
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
}

// A real comparison against this person's own recent readings -- never a
// fabricated score. Picks whichever metric deviates most from its own
// trailing average (excluding today's own reading from that average).
function computeHeadlineInsight(records: MetricRecord[]): string | null {
  let best: { deviation: number; message: string } | null = null;

  for (const type of METRIC_ORDER) {
    const stats = computeStats(seriesFor(records, type));
    if (!stats || stats.direction === 'steady') continue;
    if (!best || stats.trendPercent > best.deviation) {
      best = { deviation: stats.trendPercent, message: buildHeadline(type, stats) };
    }
  }

  return best?.message ?? null;
}

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const PAGE = { gap: 14, paddingHorizontal: 20 } as const;

// Home F (spec 2026-10-13 Home F): the scene with the header over its sky, the Today row, three tiles and Ask
// Coach, then the rest of Home unchanged. Every read fails on its own; the scene never blocks the page.
export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const clearance = useTabBarClearance();
  // Read without a provider in tests (the tab bar does the same).
  const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions();
  const { signOut } = useAuth();
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [records, setRecords] = useState<MetricRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [scores, setScores] = useState<Read<ScoresResult>>({ status: 'loading' });
  const [night, setNight] = useState<Read<SleepNight | null>>({ status: 'loading' });
  const [bedtime, setBedtime] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [homeFocused, setHomeFocused] = useState<boolean>(() => navigation.isFocused?.() ?? true);
  const [headerBottom, setHeaderBottom] = useState(0);
  const [pastScene, setPastScene] = useState(false);
  // Null until known, and null on failure: the coach entry simply isn't drawn.
  const { status: coachStatus } = useCoachStatus(navigation);
  const coachRoute = coachEntryRoute(coachStatus);
  const focused = useScreenFocused();
  // Bumped after each successful sync with Google Health, so the data reloads.
  const { dataVersion } = useSync();
  const forecastState = useForecast(dataVersion);
  const shelf = useRecapShelf(navigation);
  const buddyScene = useBuddyScene(navigation);
  const myColour = useMyKipColour();
  const today = todayCivil(now);
  const navRef = useRef(navigation);
  navRef.current = navigation;

  useEffect(() => {
    apiFetch<MetricRecord[]>('/me/biometrics')
      .then((r) => { setRecords(r); setError(null); })
      .catch(() => setError('Something went wrong loading your data.'));
  }, [dataVersion]);

  useEffect(() => {
    // A disconnected Google Health is why the data stops updating, so say so
    // rather than leaving the user staring at silently stale numbers.
    apiFetch<{ status: ConnectionStatus }>('/me/connection')
      .then((res) => setConnectionStatus(res?.status ?? null))
      .catch(() => setConnectionStatus(null));
  }, [dataVersion]);

  useEffect(() => {
    // Independent of the metric cards: a scores failure must not take the rest
    // of the dashboard down with it.
    let cancelled = false;
    fetchScoresWithBands(7)
      .then((value) => { if (!cancelled) setScores({ status: 'ready', value }); })
      .catch(() => { if (!cancelled) setScores({ status: 'failed' }); });
    return () => { cancelled = true; };
  }, [dataVersion, today]);

  useEffect(() => {
    // Last night is dated by the morning you woke up: today. A failed read means "not short".
    let cancelled = false;
    fetchSleep(today, today)
      .then((res) => { if (!cancelled) setNight({ status: 'ready', value: res.nights.find((n) => n.date === today) ?? null }); })
      .catch(() => { if (!cancelled) setNight({ status: 'failed' }); });
    return () => { cancelled = true; };
  }, [dataVersion, today]);

  useEffect(() => {
    let cancelled = false;
    fetchSleepGoal()
      .then((goal) => { if (!cancelled) setBedtime(goal?.bedtimeGoal ?? null); })
      .catch(() => { if (!cancelled) setBedtime(null); });
    return () => { cancelled = true; };
  }, [dataVersion]);

  // The state and the greeting follow the clock: again on focus, on return to the foreground, and at the next boundary.
  useEffect(() => {
    const nav = navRef.current;
    const offFocus = nav.addListener?.('focus', () => {
      setHomeFocused(true);
      setNow(new Date());
    });
    const offBlur = nav.addListener?.('blur', () => setHomeFocused(false));
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => {
      offFocus?.();
      offBlur?.();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    if (!homeFocused) return;
    const id = setTimeout(() => setNow(new Date()), nextSceneBoundary(now).getTime() - now.getTime());
    return () => clearTimeout(id);
  }, [homeFocused, now]);

  const seriesByMetric = useMemo(() => {
    const all = records ?? [];
    return Object.fromEntries(METRIC_ORDER.map((type) => [type, seriesFor(all, type)])) as Record<MetricType, MetricRecord[]>;
  }, [records]);
  const insight = useMemo(() => computeHeadlineInsight(records ?? []), [records]);

  function openDetail(type: MetricType) {
    // Sleep has its own page; the tile's series is the day total that page shows as "with naps".
    if (type === 'SLEEP') openSleep(navigation);
    else navigation.navigate('MetricDetail', { metricType: type, records: seriesByMetric[type] });
  }

  // An unwatched weekly recap rings the avatar in its coach's colour; a tap plays its story
  // instead of opening Profile.
  const ring = useStoryRing(scheme === 'dark' ? 'dark' : 'light', navigation);
  function openProfile() {
    if (ring) navigation.navigate(ring.destination.name, ring.destination.params);
    else navigation.navigate('Tabs', { screen: 'Profile' });
  }

  function open(target: SceneTarget) {
    if (target === 'recovery') navigation.navigate('Recovery', { date: today });
    else if (target === 'sleep') openSleep(navigation);
    else if (target === 'tomorrow') navigation.navigate('Forecast');
    else if (target === 'recaps') navigation.navigate('Recaps');
    else navigation.navigate('Tabs', { screen: 'Social' });
  }

  // The fallback states can't reach anything else on Home, so they keep
  // sign-out right there; the full Home moves it to Profile.
  function fallback({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-row items-center justify-end gap-3 px-5 pt-2">
          <ThemeToggle color={colors.muted} />
          <ProfileButton ring={ring} surface={colors.background} colour={myColour} onPress={openProfile} />
        </View>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Character testID="dashboard-fallback-character" mood="idle" size={56} glow paused={!focused} />
          <PageTitle className="text-center">{title}</PageTitle>
          <Text className="text-center text-body text-muted-foreground">{body}</Text>
          {action}
          <Button testID="sign-out-button" variant="ghost" size="sm" onPress={() => signOut()}>
            Sign Out
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  if (connectionStatus === 'DISCONNECTED') {
    return fallback({
      title: 'Reconnect your Google Health',
      body: 'Your Google Health is disconnected, so your data has stopped updating.',
      action: (
        <Button testID="reconnect-health-button" onPress={() => navigation.navigate('ConnectHealth')}>
          Reconnect Google Health
        </Button>
      ),
    });
  }

  if (error !== null) {
    return fallback({ title: 'Couldn’t load Today', body: error });
  }

  if (records === null) {
    return (
      <View testID="home-loading" className="flex-1 bg-background">
        <Skeleton testID="home-loading-scene" className="h-[300px] w-full rounded-none" />
        <View style={{ ...PAGE, paddingTop: 14 }}>
          <View className="flex-row items-center justify-between">
            <Skeleton className="h-[14px] w-[56px]" />
            <Skeleton className="h-[14px] w-[140px]" />
          </View>
          <View className="flex-row gap-[8px]">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} testID="home-loading-tile" className="h-[96px] flex-1 rounded-tile" />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (records.length === 0) {
    // Never connected: this is where someone lands on their first sign-in, so
    // it has to offer the connect step rather than describe a sync that cannot
    // happen yet. Connecting is no longer a gate in front of the app, so the
    // dashboard is the thing that asks for it.
    const neverConnected = connectionStatus === 'NOT_CONNECTED';
    return fallback({
      title: neverConnected ? 'Connect Google Health' : 'No data yet',
      body: neverConnected
        ? 'Your scores and trends appear here once Google Health is connected.'
        : 'Check back after your Google Health syncs.',
      action: neverConnected ? (
        <Button testID="connect-health-button" onPress={() => navigation.navigate('ConnectHealth')}>
          Connect Google Health
        </Button>
      ) : null,
    });
  }

  const allScores = scores.status === 'ready' ? scores.value.scores : null;
  // Undefined until loaded (and on an older server): scoreBand uses its defaults.
  const bands = scores.status === 'ready' ? scores.value.bands : undefined;
  const recoveryScore = todayScore(allScores, 'RECOVERY', today);
  const sleepScore = todayScore(allScores, 'SLEEP', today);
  // While a new day's read is in flight, the old day's night must not stand in for it.
  const todaysNight: Read<SleepNight | null> = night.status === 'ready' && night.value && night.value.date !== today ? { status: 'loading' } : night;
  const lastNight = todaysNight.status === 'ready' ? todaysNight.value : null;
  const weather = todayWeather(recoveryScore, bands);
  const scene = sceneState({ now, recovery: weather, night: lastNight });
  const asRead = (value: DailyScoreDTO | null): Read<DailyScoreDTO | null> => (scores.status === 'ready' ? { status: 'ready', value } : scores);
  const readings: SceneReadings = {
    sleep: {
      score: sleepScore && sleepScore.score !== null ? Math.round(sleepScore.score) : null,
      duration: lastNight ? formatMinutes(lastNight.mainMinutesAsleep ?? lastNight.minutesAsleep) : null,
    },
    tomorrow: forecastRange(forecastState),
    recovery: recoveryScore && recoveryScore.score !== null
      ? { score: Math.round(recoveryScore.score), weather, band: scoreBand(recoveryScore.score, bands) }
      : null,
    recapsNew: shelf.unwatchedCount,
  };
  const metricsWithData = METRIC_ORDER.filter((type) => seriesByMetric[type].length > 0);
  const extra = sceneExtra(headerBottom);
  const insetTop = insets?.top ?? 0;
  // Past the scene the page runs under the clock: it gets a page-coloured strip and the theme's own status bar.
  const sceneUnderClock = SCENE_H + extra - insetTop;

  return (
    <View className="flex-1 bg-background">
      {homeFocused ? <StatusBar style={pastScene && scheme !== 'dark' ? 'dark' : 'light'} /> : null}
      <ScrollView
        testID="home-scroll"
        contentContainerStyle={{ paddingBottom: clearance }}
        scrollEventThrottle={16}
        onScroll={(e) => setPastScene(e.nativeEvent.contentOffset.y > sceneUnderClock)}
      >
        <HomeScene
          scene={scene}
          width={width}
          extra={extra}
          myColour={myColour}
          buddies={buddyScene}
          readings={readings}
          onOpen={open}
          onOpenBuddy={(buddyId) => navigation.navigate('BuddyWeek', { buddyId })}
          header={(
            <HomeHeader
              top={insetTop + 8}
              extra={extra}
              now={now}
              greeting={greetingFor(now)}
              scene={scene}
              myColour={myColour}
              ring={ring}
              onProfile={openProfile}
              onBottom={setHeaderBottom}
            />
          )}
        />

        <View style={{ ...PAGE, paddingTop: 14 }}>
          <TodayHeader scene={scene.key} bedtime={bedtime} />
          <TodayTiles
            recovery={asRead(recoveryScore)}
            bands={bands}
            sleepScore={asRead(sleepScore)}
            night={todaysNight}
            tomorrow={forecastState}
            bedtime={bedtime}
            onOpen={open}
          />
          <AskCoachButton route={coachRoute} onPress={() => coachRoute && navigateToCoachEntry(navigation, coachRoute)} />

          <HabitLogCard />

          {/* Recaps (decision 5): with the weekly digest below, for every user, coach on or off. */}
          <RecapShelf navigation={navigation} shelf={shelf} />

          {/* The digest is the newest week's recap: it plays that week's story, whose last frame
              offers the full recap. */}
          {coachRoute === 'Coach' ? <CoachDigestCard onOpenRecap={(id) => navigation.navigate('RecapStory', { id })} /> : null}

          {metricsWithData.length > 0 ? (
            <View className="gap-3">
              <SectionLabel>Your metrics</SectionLabel>
              <View className="flex-row flex-wrap gap-3">
                {metricsWithData.map((type, index) => (
                  <Reveal key={type} index={index} className="w-[47%] grow">
                    <MetricTile type={type} series={seriesByMetric[type]} onPress={() => openDetail(type)} />
                  </Reveal>
                ))}
              </View>
            </View>
          ) : null}

          {insight ? (
            <Card className="gap-1.5">
              <SectionLabel>Worth knowing</SectionLabel>
              <Text className="text-body">{insight}</Text>
            </Card>
          ) : null}
          {/* Per-metric trends and the Patterns entry live on the Trends screen (Activity's "All trends"). */}
        </View>
      </ScrollView>
      {pastScene ? (
        <View
          testID="home-status-strip"
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: insetTop, backgroundColor: colors.background }}
        />
      ) : null}
    </View>
  );
}
