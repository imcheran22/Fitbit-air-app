// Chats › Requests (spec 2026-10-07 social §2, §8.1; the owner-approved Requests board): incoming buddy requests to
// accept, decline or block, and mine still pending — the list that used to be the Buddies screen's Requests tab.
// Accepting opens the new buddy's thread (their week on a server without chats).

import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColorScheme } from 'nativewind';
import type { BuddyIdentity } from '../api/buddies';
import { IdentityGate } from '../components/buddies/IdentityGate';
import { MoodNoticeSheet } from '../components/buddies/MoodNoticeSheet';
import { useMoodNoticeGate } from '../components/buddies/useMoodNoticeGate';
import { RequestsList } from '../components/chats/RequestsList';
import { Button, buttonIconSize } from '../components/ui/button';
import { PageTitle } from '../components/ui/page-title';
import { Text } from '../components/ui/text';
import { useChatsAvailable } from '../lib/socialStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { COLORS } from '../theme';

function Body({ identity, onAccepted }: { identity: BuddyIdentity; onAccepted: (buddyId: string) => void }) {
  const gate = useMoodNoticeGate(identity.moodNoticeSeen);
  return (
    <View className="flex-1 gap-4">
      <Text className="text-caption text-muted-foreground">Only buddies can message you. Accept to pair up; they won't know if you decline.</Text>
      <RequestsList gate={gate} onAccepted={onAccepted} />
      <MoodNoticeSheet {...gate.sheet} />
    </View>
  );
}

export function ChatRequestsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colorScheme } = useColorScheme();
  const colors = COLORS[colorScheme === 'light' ? 'light' : 'dark'];
  const chats = useChatsAvailable();
  const onAccepted = (buddyId: string) => (chats === false ? navigation.navigate('BuddyWeek', { buddyId }) : navigation.navigate('ChatThread', { buddyId }));
  return (
    <SafeAreaView testID="chat-requests" edges={['top', 'bottom']} className="flex-1 bg-background">
      {/* Header icon buttons on a bare header: outline icon-lg, as the Coach header (plan ruling P3). */}
      <View className="flex-row items-center gap-2 px-3 pt-1">
        <Button testID="chat-requests-back" variant="outline" size="icon-lg" accessibilityLabel="Back to chats" onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={buttonIconSize('icon-lg')} color={colors.foreground} />
        </Button>
        <PageTitle>Requests</PageTitle>
      </View>
      <View className="flex-1 px-4 pt-3">
        <IdentityGate>{(identity) => <Body identity={identity} onAccepted={onAccepted} />}</IdentityGate>
      </View>
    </SafeAreaView>
  );
}
