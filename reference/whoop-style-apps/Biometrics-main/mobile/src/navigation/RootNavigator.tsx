import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { useColorScheme } from 'nativewind';
import { NavigationContainer, DefaultTheme, DarkTheme, type NavigatorScreenParams, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuth } from '../auth/AuthContext';
import type { AchievementFamily } from '../api/achievements';
import type { Recap } from '../api/recaps';
import type { ScoreType } from '../api/scores';
import type { ChatQuote } from '../api/chats';
import { AuthNavigator } from './AuthNavigator';
import { ConnectHealthScreen } from '../screens/ConnectHealthScreen';
import { MetricDetailScreen } from '../screens/MetricDetailScreen';
import { MetricsScreen } from '../screens/MetricsScreen';
import { ScoreDetailScreen } from '../screens/ScoreDetailScreen';
import { RecoveryScreen } from '../screens/RecoveryScreen';
import { ForecastScreen } from '../screens/ForecastScreen';
import { FORECAST_COPY } from '../lib/forecastCopy';
import { PatternsScreen } from '../screens/PatternsScreen';
import { CoachConsentScreen } from '../screens/CoachConsentScreen';
import { CoachMemoryScreen } from '../screens/CoachMemoryScreen';
import { HostedConsentScreen } from '../screens/HostedConsentScreen';
import { SignInMethodsScreen } from '../screens/SignInMethodsScreen';
import { DevicesScreen } from '../screens/DevicesScreen';
import { MeetYourCoachScreen } from '../screens/MeetYourCoachScreen';
import { ThinkingStyleScreen } from '../screens/ThinkingStyleScreen';
import { ThinkingTextScreen } from '../screens/ThinkingTextScreen';
import { SleepScreen } from '../screens/SleepScreen';
import { BedtimeGoalScreen } from '../screens/BedtimeGoalScreen';
import { RecapBuilderScreen } from '../screens/RecapBuilderScreen';
import { RecapScreen } from '../screens/RecapScreen';
import { RecapStoryScreen } from '../screens/RecapStoryScreen';
import { RecapsScreen } from '../screens/RecapsScreen';
import { SocialStoryScreen } from '../screens/SocialStoryScreen';
import { YearInPixelsScreen } from '../screens/YearInPixelsScreen';
import { BadgesScreen } from '../screens/BadgesScreen';
import { BadgeDetailScreen } from '../screens/BadgeDetailScreen';
import { BuddyIdentityScreen } from '../screens/BuddyIdentityScreen';
import { ProfileSectionScreen } from '../screens/ProfileSectionScreen';
import { PROFILE_COPY, type ProfileCategory } from '../lib/profileCopy';
import { PairUpScreen } from '../screens/PairUpScreen';
import { BuddiesScreen } from '../screens/BuddiesScreen';
import { BuddyWeekScreen } from '../screens/BuddyWeekScreen';
import { HighlightsScreen } from '../screens/HighlightsScreen';
import { CampfireScreen } from '../screens/CampfireScreen';
import { ChatThreadScreen } from '../screens/ChatThreadScreen';
import { ChatsScreen } from '../screens/ChatsScreen';
import { ChatRequestsScreen } from '../screens/ChatRequestsScreen';
import { BlockedPeopleScreen } from '../screens/BlockedPeopleScreen';
import { CelebrationHost } from '../components/achievements/CelebrationHost';
import { BuddiesStoreScope } from '../components/buddies/BuddiesStoreScope';
import { MyKipColourScope } from '../components/kip/MyKipColourScope';
import { SocialStoreScope } from '../components/social/SocialStoreScope';
import type { ShareFormat } from '../lib/recapShare';
import { TabsNavigator, type TabParamList } from './TabsNavigator';
import { syncTimezone } from '../lib/timezone';
import { syncPushRegistration } from '../lib/pushRegistration';
import { rescheduleWindDown } from '../lib/windDown';
import { listenForNotificationTaps, routeInitialNotification } from '../notifications/handler';
import { navigationRef } from './navigationRef';
import { HeaderTitle, headerTitleStyle } from './headerStyle';
import { COLORS } from '../theme';
import { ToastProvider } from '../components/ui/toast';
import { SyncProvider } from '../sync/SyncProvider';
import type { MetricRecord } from '../lib/metricInsights';
import type { TrendRange } from '../lib/metricTrends';

const LIGHT_NAV_THEME: Theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: COLORS.light.background, card: COLORS.light.background, text: COLORS.light.foreground, border: COLORS.light.border, primary: COLORS.light.accent },
};

const DARK_NAV_THEME: Theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: COLORS.dark.background, card: COLORS.dark.background, text: COLORS.dark.foreground, border: COLORS.dark.border, primary: COLORS.dark.accent },
};

export type RootStackParamList = {
  // The five-tab shell (Home, Activity, Coach, Social, Profile).
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  ConnectHealth: undefined;
  // `records` is the metric's whole series; `range` is the window to open on
  // (the Trends screen passes its current one; default 30 days).
  MetricDetail: { metricType: MetricRecord['metricType']; records: MetricRecord[]; range?: TrendRange };
  ScoreDetail: { date: string; type?: ScoreType }; // a redirect shim: SLEEP opens Sleep; RECOVERY or an omitted type opens Recovery
  Recovery: { date?: string } | undefined; // date (YYYY-MM-DD) defaults to today
  Forecast: undefined;
  Patterns: undefined;
  // Every metric's trend card (the old Metrics tab), opened from Activity's "All trends".
  Trends: undefined;
  // Pushed over the tabs. `prefill` is carried through the consent screen.
  CoachConsent: { prefill?: string } | undefined;
  // Reached from Settings -> Coach Memory, which only draws when consented.
  CoachMemory: undefined;
  // Reached from Settings -> Your coach: what the coach shows while it thinks.
  ThinkingStyle: undefined;
  ThinkingText: undefined;
  // Profile -> AI engine -> Claude: the hosted-model opt-in.
  HostedConsent: undefined;
  // Reached from Settings: link or unlink Apple, Google, email + password.
  SignInMethods: undefined;
  // Reached from Settings: signed-in devices, with sign-out per device.
  Devices: undefined;
  // The character picker. 'first' opens by itself on the first Coach-tab
  // visit (starts on Mochi, has Skip); 'switch' comes from Profile.
  MeetYourCoach: { mode: 'first' | 'switch' };
  // The one Sleep page (spec 2026-10-09); date is the night-end civil date, else the default night.
  Sleep: { date?: string } | undefined;
  BedtimeGoal: undefined;
  // Home → "Your recaps": the latest month, latest week, older ones and Year in pixels.
  Recaps: undefined;
  // One recap; from the list, a ringed avatar (a month), the shelf, the coach digest card, the
  // story viewer when a push turns out to be a month, or "See full recap" at the end of a story.
  Recap: { id: string };
  // A weekly recap's story, full screen (the viewer): with the recap from its recap screen, or by
  // id from a recap push, a ringed avatar and the Home shelf (it loads the recap itself and
  // hands a month to its recap screen).
  RecapStory: { recap: Recap } | { id: string };
  // Build your recap: a recap's own format plus Year in pixels, or Year in pixels alone.
  RecapBuilder: { id?: string; format: ShareFormat };
  YearInPixels: undefined;
  // Profile → Badges card "See all": every family at its level.
  Badges: undefined;
  // One badge: the big badge, current and best, the ladder of five levels.
  BadgeDetail: { family: AchievementFamily };
  // All buddies (spec 2026-10-07 social §2): the paged list, from the stories row's "See all". Requests live in Chats.
  Buddies: undefined;
  // Your code, enter a code, or ask by @handle; first-time handle setup if missing.
  PairUp: undefined;
  // One buddy's mood week, shared numbers and stickers; opened from the list and by buddy pushes.
  BuddyWeek: { buddyId: string };
  // Profile → Buddies: change your handle or display name.
  BuddyIdentity: undefined;
  // Profile → one category card: the settings section it holds.
  ProfileSection: { section: ProfileCategory };
  // Profile → Buddies → Blocked people (unblock).
  BlockedPeople: undefined;
  // Social → last week's highlights in full (the carousel's "All").
  Highlights: undefined;
  // Social → one buddy's story today (or my own once I've checked in), opened from the stories row. `mine` is set for
  // my own story, so the viewer knows it before the Social home has loaded.
  SocialStory: { authorId: string; mine?: boolean };
  // Social → the camp banner: the Campfire page (S2), pushed with no tab bar.
  Campfire: undefined;
  // Chats (S3): the inbox (Social's Chats button) and Chats › Requests (buddy requests moved from Buddies).
  Chats: undefined;
  ChatRequests: undefined;
  // Chats (S3): one buddy's thread. `quote` stages a story frame, a note or a camp note to send with the next text.
  ChatThread: { buddyId: string; quote?: ChatQuote };
};

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONNECTED';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { session, isPending } = useAuth();
  const { colorScheme: scheme } = useColorScheme();
  const navTheme = scheme === 'dark' ? DARK_NAV_THEME : LIGHT_NAV_THEME;
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  // null while we are still asking the backend which screen to land on.
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    if (!session) return;
    // Fire-and-forget: syncTimezone swallows its own failures and must never
    // hold up the first screen. Runs once per authenticated launch/sign-in.
    void syncTimezone();
    // Same contract: swallows its own failures, only touches users who opted
    // in, and never prompts for permission.
    void syncPushRegistration();
  }, [session]);

  useEffect(() => {
    // A tapped notification opens its screen (a wind-down reminder Sleep, a
    // recap its story, a buddy push the requests or that buddy's week): the one
    // that launched the app (once the signed-in navigator is ready; never while
    // signed out) and any tapped while it runs.
    const launch = new AbortController();
    void routeInitialNotification(launch.signal);
    const stopListening = listenForNotificationTaps();
    // Launch and each return to the foreground put the reminder back, which
    // covers time-zone changes and the OS dropping it (a cold launch never sees
    // a change to 'active'). Does nothing while it is off.
    void rescheduleWindDown();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void rescheduleWindDown();
    });
    return () => {
      launch.abort();
      stopListening();
      appState.remove();
    };
  }, []);

  useEffect(() => {
    // Signing in lands on the tabs -- the dashboard -- whatever the connection
    // status is. Connecting Google Health used to be a gate in front of the
    // app: a user who had not connected yet, or whose status could not be
    // read, saw the connect screen and nothing else, with no way to look
    // around first. It is a task you can do from the dashboard's own prompt or
    // from the Profile tab, not a wall.
    setInitialRoute(session ? 'Tabs' : null);
  }, [session]);

  // While the stored session is still resolving, show the loading view rather
  // than flash the sign-in stack (whose NavigationContainer would also consume
  // a cold-start deep link meant for the signed-in app).
  if (!session && !isPending) {
    return <AuthNavigator theme={navTheme} />;
  }

  if (!session || initialRoute === null) {
    return (
      <View style={styles.loading} testID="root-navigator-loading">
        <ActivityIndicator />
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        {/* Signed in only: nothing syncs before sign-in. */}
        <ToastProvider>
          <SyncProvider>
            <Stack.Navigator
              initialRouteName={initialRoute}
              screenOptions={{
                headerShadowVisible: false,
                headerStyle: { backgroundColor: colors.background },
                headerTitleStyle: headerTitleStyle(colors.foreground),
                headerTitle: (props) => <HeaderTitle {...props} />,
                headerTintColor: colors.foreground,
                // A bare chevron: the parent route's name ("Tabs") is not a place.
                headerBackButtonDisplayMode: 'minimal',
              }}
            >
              <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
              <Stack.Screen name="ConnectHealth" component={ConnectHealthScreen} options={{ title: '' }} />
              <Stack.Screen name="MetricDetail" component={MetricDetailScreen} options={{ title: '' }} />
              <Stack.Screen name="ScoreDetail" component={ScoreDetailScreen} options={{ title: 'Score' }} />
              <Stack.Screen name="Recovery" component={RecoveryScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Forecast" component={ForecastScreen} options={{ title: FORECAST_COPY.title }} />
              <Stack.Screen name="Patterns" component={PatternsScreen} options={{ title: 'Patterns' }} />
              <Stack.Screen name="Trends" component={MetricsScreen} options={{ title: '' }} />
              <Stack.Screen name="CoachConsent" component={CoachConsentScreen} options={{ title: 'AI Coach' }} />
              <Stack.Screen name="CoachMemory" component={CoachMemoryScreen} options={{ title: 'Coach Memory' }} />
              <Stack.Screen name="ThinkingStyle" component={ThinkingStyleScreen} options={{ title: 'Thinking style' }} />
              <Stack.Screen name="ThinkingText" component={ThinkingTextScreen} options={{ title: 'Thinking text' }} />
              <Stack.Screen name="HostedConsent" component={HostedConsentScreen} options={{ title: 'AI engine' }} />
              <Stack.Screen name="SignInMethods" component={SignInMethodsScreen} options={{ title: 'Sign-in methods' }} />
              <Stack.Screen name="Devices" component={DevicesScreen} options={{ title: 'Devices' }} />
              <Stack.Screen name="Sleep" component={SleepScreen} options={{ headerShown: false }} />
              <Stack.Screen name="BedtimeGoal" component={BedtimeGoalScreen} options={{ title: 'Bedtime goal' }} />
              <Stack.Screen name="Recap" component={RecapScreen} options={{ title: '' }} />
              <Stack.Screen
                name="RecapStory"
                component={RecapStoryScreen}
                // Full screen with no system swipe: the viewer's own swipe down closes it.
                options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
              />
              <Stack.Screen name="Recaps" component={RecapsScreen} options={{ title: 'Your recaps' }} />
              <Stack.Screen name="YearInPixels" component={YearInPixelsScreen} options={{ title: 'Year in pixels' }} />
              <Stack.Screen name="Badges" component={BadgesScreen} options={{ title: 'Badges' }} />
              <Stack.Screen name="BadgeDetail" component={BadgeDetailScreen} options={{ title: '' }} />
              <Stack.Screen name="BuddyIdentity" component={BuddyIdentityScreen} options={{ title: 'Buddy name' }} />
              <Stack.Screen
                name="ProfileSection"
                component={ProfileSectionScreen}
                options={({ route }) => ({ title: PROFILE_COPY.categories[route.params.section] })}
              />
              <Stack.Screen name="Buddies" component={BuddiesScreen} options={{ title: 'All buddies' }} />
              <Stack.Screen name="PairUp" component={PairUpScreen} options={{ title: 'Add a buddy' }} />
              <Stack.Screen name="BlockedPeople" component={BlockedPeopleScreen} options={{ title: 'Blocked people' }} />
              <Stack.Screen name="Highlights" component={HighlightsScreen} options={{ title: 'Highlights' }} />
              {/* The Campfire (S2): its own header over the scene, no tab bar. */}
              <Stack.Screen name="Campfire" component={CampfireScreen} options={{ headerShown: false }} />
              {/* Chats (S3): the inbox, from Social's Chats button; its own header (back, my @handle, New message). */}
              <Stack.Screen name="Chats" component={ChatsScreen} options={{ headerShown: false }} />
              {/* The owner-approved Requests board draws its own header (back + "Requests"). */}
              <Stack.Screen name="ChatRequests" component={ChatRequestsScreen} options={{ headerShown: false, title: 'Requests' }} />
              {/* Chats (S3): its own header (coach, active line, info); one screen per buddy, like BuddyWeek. */}
              <Stack.Screen name="ChatThread" component={ChatThreadScreen} getId={({ params }) => params?.buddyId} options={{ headerShown: false }} />
              <Stack.Screen
                name="SocialStory"
                component={SocialStoryScreen}
                // Full screen like the recap story: Close (or running past the end) closes it.
                options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }}
              />
              {/* One instance per buddy: navigating to another buddy's week (a push tap) opens a new
                  screen instead of swapping the params under the current one. */}
              <Stack.Screen name="BuddyWeek" component={BuddyWeekScreen} getId={({ params }) => params?.buddyId} options={{ title: '' }} />
              <Stack.Screen name="RecapBuilder" component={RecapBuilderScreen} options={{ title: 'Build your recap' }} />
              <Stack.Screen
                name="MeetYourCoach"
                component={MeetYourCoachScreen}
                // No swipe-to-dismiss on the first visit. Android back still
                // closes it unsaved, like a failed Skip, so it returns next launch.
                options={({ route }) => ({ headerShown: false, presentation: 'modal', gestureEnabled: route.params?.mode !== 'first' })}
              />
            </Stack.Navigator>
            {/* New badge levels, celebrated once (start, foreground, after a check-in). */}
            <CelebrationHost />
            {/* The shared buddy list (start, foreground); forgotten on sign-out. */}
            <BuddiesStoreScope />
            {/* Your KIP's colour (start); forgotten on sign-out. */}
            <MyKipColourScope />
            {/* The shared Social home and its tab dot (start, foreground); forgotten on sign-out. */}
            <SocialStoreScope />
          </SyncProvider>
        </ToastProvider>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
});
