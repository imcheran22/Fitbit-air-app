import React, { useContext, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { NavigationContext } from '@react-navigation/native';
import { useOptionalAuth } from '../auth/AuthContext';
import { useCharacterOptional } from '../characters/CharacterContext';
import { BadgesCard } from '../components/achievements/BadgesCard';
import { characterInfo } from '../components/characters/registry';
import { DEFAULT_THINKING_ATTACHMENT, DEFAULT_THINKING_TEXT, THINKING_ATTACHMENT_NAMES, THINKING_TEXT_NAMES } from '../components/characters/thinking';
import { DeleteAccountSection } from '../components/delete-account-section';
import { CategoryGrid } from '../components/profile/CategoryGrid';
import { Passport } from '../components/profile/Passport';
import { useStoryRing } from '../components/recap/StoryRing';
import { Button } from '../components/ui/button';
import { PageTitle } from '../components/ui/page-title';
import { SectionLabel } from '../components/ui/section-label';
import { Text } from '../components/ui/text';
import { useAchievements } from '../lib/achievementsStore';
import { useBuddies } from '../lib/buddiesStore';
import { useMyKipColour } from '../lib/kip/myKipColour';
import { memberCode, passportStamps } from '../lib/passport';
import { categoryCards, useProfileReads } from '../lib/profileHub';
import { PROFILE_COPY } from '../lib/profileCopy';
import { useChatsAvailable } from '../lib/socialStore';
import { useCoachStatus } from '../lib/useCoachStatus';
import { useTabBarClearance } from '../navigation/tabBarLayout';
import { useSync } from '../sync/SyncProvider';

type Navigate = { navigate: (name: string, params?: object) => void };

// The Profile tab (spec 2026-10-13 §2, boards S2 and ID-2): the passport, the Badges card, a card per
// settings category (each opens its section on ProfileSection), and Sign out beside Delete account.
export function SettingsScreen() {
  // Context rather than useNavigation(): this screen is also rendered in isolation, and
  // useNavigation throws when there is no navigator above it.
  const navigation = useContext(NavigationContext);
  const go = (name: string, params?: object) => (navigation as Navigate | undefined)?.navigate(name, params);
  const { lastSyncedAt, connection } = useSync();
  const clearance = useTabBarClearance();
  const auth = useOptionalAuth();
  const { colorScheme: scheme } = useColorScheme();
  const ring = useStoryRing(scheme === 'dark' ? 'dark' : 'light', navigation ?? undefined);
  const { status: coachStatus } = useCoachStatus(navigation ?? undefined);
  const character = useCharacterOptional();
  const { state: badges } = useAchievements();
  const buddiesAvailable = useBuddies().status === 'ready';
  const chatsAvailable = useChatsAvailable() === true;
  const reads = useProfileReads({ buddiesAvailable, chatsAvailable });
  const kipColour = useMyKipColour();

  const info = characterInfo(character?.characterId);
  const cards = categoryCards({
    reads,
    health: { connected: connection === 'CONNECTED', lastSyncedAt },
    buddiesAvailable,
    chatsAvailable,
    coach: {
      name: info.name,
      style: THINKING_ATTACHMENT_NAMES[character?.thinkingAttachment ?? DEFAULT_THINKING_ATTACHMENT].name,
      text: THINKING_TEXT_NAMES[character?.thinkingText ?? DEFAULT_THINKING_TEXT].name,
    },
    aiCoach: coachStatus ? { enabled: coachStatus.enabled, consented: coachStatus.consented } : null,
    now: new Date(),
    kipColour,
  });
  const stamps = useMemo(() => (badges.status === 'ready' ? passportStamps(badges.data.families) : []), [badges]);
  const identity = reads.identity;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: clearance }}
      >
        <View className="pt-2">
          <PageTitle>{PROFILE_COPY.title}</PageTitle>
        </View>

        <Passport
          code={memberCode(auth?.session?.userId ?? '')}
          name={identity?.displayName ?? null}
          handle={identity?.handle ?? null}
          home={reads.timezone?.timezone ?? null}
          joinedOn={identity?.joinedOn ?? null}
          checkInStreak={identity?.checkInStreak ?? null}
          buddyCount={identity?.buddyCount ?? null}
          stamps={stamps}
          recap={ring ? { color: ring.color, hint: ring.hint, onPlay: () => go(ring.destination.name, ring.destination.params) } : null}
          onEdit={() => go('BuddyIdentity')}
          onOpenStamp={(family) => go('BadgeDetail', { family })}
        />

        <BadgesCard onSeeAll={() => go('Badges')} onOpen={(family) => go('BadgeDetail', { family })} />

        <CategoryGrid cards={cards} onOpen={(section) => go('ProfileSection', { section })} />

        <DeleteAccountSection
          renderClosed={(openDelete) => (
            <View testID="delete-account-section" className="gap-2">
              <SectionLabel>{PROFILE_COPY.account.label}</SectionLabel>
              <View className="flex-row gap-3">
                {auth ? (
                  <Button testID="sign-out-button" variant="outline" className="flex-1" onPress={() => auth.signOut()}>
                    {PROFILE_COPY.account.signOut}
                  </Button>
                ) : null}
                <Button testID="delete-account-open" variant="destructive" className="flex-1" onPress={openDelete}>
                  {PROFILE_COPY.account.delete}
                </Button>
              </View>
              <Text className="text-caption text-muted-foreground">{PROFILE_COPY.account.deleteNote}</Text>
            </View>
          )}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
