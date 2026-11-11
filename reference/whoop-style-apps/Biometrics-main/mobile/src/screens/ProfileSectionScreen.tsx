import React, { useContext } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContext } from '@react-navigation/native';
import { useOptionalAuth } from '../auth/AuthContext';
import { AccountSection } from '../components/account-section';
import { BuddiesProfileSection } from '../components/buddies/BuddiesProfileSection';
import { ChatSettingsSection } from '../components/chats/ChatSettingsSection';
import { CoachSettingsSection } from '../components/coach-settings-section';
import { NotificationsSection } from '../components/notifications-section';
import { HealthDataSection } from '../components/profile/HealthDataSection';
import { KipColourSection } from '../components/profile/KipColourSection';
import { TimezoneSection } from '../components/profile/TimezoneSection';
import { Text } from '../components/ui/text';
import { YourCoachRow } from '../components/your-coach-row';
import { PROFILE_COPY, type ProfileCategory } from '../lib/profileCopy';
import { useTabBarClearance } from '../navigation/tabBarLayout';

// One Profile category card's screen (spec 2026-10-13 §2.3): the section Settings used to show
// inline, moved here unchanged. The header title is the card's title (set in RootNavigator).
export function ProfileSectionScreen({ route }: { route: { params: { section: ProfileCategory } } }) {
  const navigation = useContext(NavigationContext);
  const auth = useOptionalAuth();
  const clearance = useTabBarClearance();
  const { section } = route.params;

  if (section === 'timezone') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <TimezoneSection />
      </SafeAreaView>
    );
  }

  const email = auth?.session?.email ?? null;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView
        testID={`profile-section-${section}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: clearance }}
      >
        {section === 'kipColour' ? <KipColourSection /> : null}
        {section === 'health' ? <HealthDataSection /> : null}
        {section === 'notifications' ? <NotificationsSection /> : null}
        {section === 'buddies' ? <BuddiesProfileSection onNavigate={(name) => navigation?.navigate(name as never)} /> : null}
        {section === 'chats' ? <ChatSettingsSection /> : null}
        {section === 'coach' ? <YourCoachRow /> : null}
        {section === 'aiCoach' ? <CoachSettingsSection /> : null}
        {section === 'signIn' ? (
          <View className="gap-3">
            {email ? (
              <Text testID="profile-email" className="text-caption text-muted-foreground">
                {PROFILE_COPY.signedInAs(email)}
              </Text>
            ) : null}
            <AccountSection showSignOut={false} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
