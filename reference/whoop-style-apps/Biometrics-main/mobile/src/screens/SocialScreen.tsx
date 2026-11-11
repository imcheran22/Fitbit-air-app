// Social tab home — V5 one scroll (spec 2026-10-07 social §4): camp banner → stories with my check-in → week
// highlights → today timeline, and a floating Chats button (Chats on a server with chats, S3; else Buddies). Unseen stickers are marked
// seen once the screen has shown them, so the tab dot clears where they are read. S2: the banner opens the Campfire
// (only on a server that has one: it sends camp.night), and while my goodnight window is open (camp.goodnightOpen:
// from min(20:00, my goal − 60 min) to 05:59) "Say goodnight" follows the timeline.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColorScheme } from 'nativewind';
import { markStickersSeen, type SocialHome } from '../api/social';
import { COLORS } from '../theme';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTabBarClearance } from '../navigation/tabBarLayout';
import { chatsBadgeCount, refreshSocial, useSocial } from '../lib/socialStore';
import { CampBanner } from '../components/social/CampBanner';
import { CheckInSheet } from '../components/social/CheckInSheet';
import { GoodnightButton } from '../components/social/GoodnightButton';
import { HighlightsCarousel } from '../components/social/HighlightsCarousel';
import { StoriesRow } from '../components/social/StoriesRow';
import { TimelineList } from '../components/social/TimelineList';
import { Button, buttonIconSize, buttonTextVariants } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { PageTitle } from '../components/ui/page-title';
import { SectionLabel } from '../components/ui/section-label';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';

/** Marks unseen stickers seen once per loaded home that shows some, while the screen is focused. */
function useMarkStickersSeen(home: SocialHome | null, focused: boolean) {
  const marked = useRef<SocialHome | null>(null);
  useEffect(() => {
    if (!home || !focused || (home.unread?.stickers ?? 0) === 0 || marked.current === home) return;
    marked.current = home;
    void markStickersSeen().then(() => refreshSocial(), () => undefined);
  }, [home, focused]);
}

export function SocialScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const clearance = useTabBarClearance();
  const focused = useIsFocused();
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const state = useSocial();
  const [checkingIn, setCheckingIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { void refreshSocial(); }, []));
  useMarkStickersSeen(state.status === 'ready' ? state.home : null, focused);

  const pull = async () => {
    setRefreshing(true);
    await refreshSocial();
    setRefreshing(false);
  };

  if (state.status === 'unavailable') {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background px-5 pt-4" testID="social-screen">
        <Card testID="social-unavailable" className="gap-3">
          <Text className="font-semibold">Social isn't available yet</Text>
          <Text className="text-caption text-muted-foreground">Your buddies are still here.</Text>
          <Button testID="social-open-buddies" onPress={() => navigation.navigate('Buddies')}>Open Buddies</Button>
        </Card>
      </SafeAreaView>
    );
  }
  if (state.status !== 'ready') {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background px-5 pt-4" testID="social-screen">
        {state.status === 'error' ? (
          <Card testID="social-error" className="gap-3">
            <Text className="text-body">Couldn't load your circle.</Text>
            <Button testID="social-retry" variant="secondary" size="sm" className="self-start" onPress={() => void refreshSocial()}>Try again</Button>
          </Card>
        ) : (
          <Skeleton testID="social-loading" className="h-40 w-full rounded-card" />
        )}
      </SafeAreaView>
    );
  }

  const { home } = state;
  // S3: an S3 server sends unread.chats; then the button opens Chats and counts unread chats + requests. An older server
  // keeps the S2 button (requests + stickers): it opens Chats › Requests while requests wait, else All buddies.
  const chatsOn = typeof home.unread?.chats === 'number';
  const chats = chatsOn ? chatsBadgeCount(home.unread) : (home.unread?.requests ?? 0) + (home.unread?.stickers ?? 0);
  const openChats = () => {
    if (chatsOn) navigation.navigate('Chats');
    else if ((home.unread?.requests ?? 0) > 0) navigation.navigate('ChatRequests');
    else navigation.navigate('Buddies');
  };
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background" testID="social-screen">
      <ScrollView contentContainerStyle={{ gap: 18, paddingHorizontal: 20, paddingBottom: clearance + 64 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pull()} />}>
        <View className="pt-2">
          <PageTitle>Social</PageTitle>
        </View>
        <CampBanner camp={home.camp} onOpen={home.camp.night === undefined ? undefined : () => navigation.navigate('Campfire')} />
        <StoriesRow me={home.me} rings={home.stories} onCheckIn={() => setCheckingIn(true)}
          onOpenStory={(authorId) => navigation.navigate('SocialStory', authorId === home.me.person.id ? { authorId, mine: true } : { authorId })} onSeeAll={() => navigation.navigate('Buddies')} />
        {home.highlights ? <HighlightsCarousel highlights={home.highlights} onOpenAll={() => navigation.navigate('Highlights')} /> : null}
        <View className="gap-3">
          <SectionLabel>Today</SectionLabel>
          <TimelineList items={home.timeline} />
          {/* The evening timeline offers goodnight while my window is open (spec §6.1, owner ruling Q1); an S1 server
              sends neither field. */}
          {home.camp.goodnightOpen === true && home.me.goodnight !== undefined ? (
            <GoodnightButton testID="timeline-goodnight" goodnight={home.me.goodnight} onChanged={() => void refreshSocial()} />
          ) : null}
        </View>
      </ScrollView>
      {/* The floating Chats button: custom children so the icon and the count keep their own testIDs. */}
      <Button testID="social-chats" size="lg" accessibilityLabel={chats > 0 ? `Chats, ${chats} new` : 'Chats'}
        onPress={openChats}
        style={{ position: 'absolute', right: 20, bottom: clearance + 8 }}
        iconStart={<View testID="social-chats-icon"><Ionicons name="chatbubble-outline" size={buttonIconSize('lg')} color={colors.background} /></View>}>
        <Text className={buttonTextVariants({ size: 'lg' })}>Chats</Text>
        {chats > 0 ? <Text testID="social-chats-count" className="min-w-5 rounded-full bg-accent px-1.5 text-center text-caption font-bold tabular-nums text-background">{chats}</Text> : null}
      </Button>
      <CheckInSheet visible={checkingIn} current={home.me.checkIn?.mood ?? null} onClose={() => setCheckingIn(false)} />
    </SafeAreaView>
  );
}
