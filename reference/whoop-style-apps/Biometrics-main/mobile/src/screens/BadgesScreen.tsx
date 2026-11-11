import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { BadgeIcon } from '../components/achievements/BadgeIcon';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { refreshAchievements, useAchievements } from '../lib/achievementsStore';
import { FAMILY_NAMES, FAMILY_ORDER, FAMILY_RULES, familyStatus } from '../lib/badges';
import { useRefreshAchievementsOnFocus } from '../lib/useRefreshAchievementsOnFocus';

// Profile → "See all" (spec 2026-10-06 §6; canvas Main.dc.html): every family at its level with
// its rule and progress; a tap opens the badge's detail. Reloads on mount and each time it comes
// back into focus (back from a detail, levels earned since), like the Profile card.
export function BadgesScreen() {
  const navigation = useNavigation<any>();
  const { state } = useAchievements();
  useRefreshAchievementsOnFocus();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 12, padding: 20 }}>
        <Text className="text-caption text-muted-foreground">Seven families, five levels each. Levels are never taken away.</Text>
        {state.status === 'idle' ? <Skeleton testID="badges-loading" className="h-64 w-full rounded-card" /> : null}
        {state.status === 'unavailable' ? (
          <Card testID="badges-unavailable">
            <Text className="text-body">Badges aren't available yet.</Text>
          </Card>
        ) : null}
        {state.status === 'error' ? (
          <Card testID="badges-error" className="gap-3">
            <Text className="text-caption text-muted-foreground">Your badges could not be loaded.</Text>
            <Button testID="badges-retry" variant="secondary" size="sm" className="self-start" onPress={() => void refreshAchievements()}>
              Try again
            </Button>
          </Card>
        ) : null}
        {state.status === 'ready'
          ? FAMILY_ORDER.map((family) => {
              const f = state.data.families.find((x) => x.family === family);
              if (!f) return null;
              return (
                <Pressable
                  key={family}
                  testID={`badges-row-${family}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${FAMILY_NAMES[family]}. ${familyStatus(f)}`}
                  onPress={() => navigation.navigate('BadgeDetail', { family })}
                  className="flex-row items-center gap-4 rounded-card border border-border bg-card p-4 active:opacity-70"
                >
                  <BadgeIcon family={family} level={f.level} size={68} testID={`badges-row-${family}-icon`} />
                  <View className="flex-1 gap-1">
                    <Text className="text-body font-semibold">{FAMILY_NAMES[family]}</Text>
                    <Text className="text-caption text-muted-foreground">{FAMILY_RULES[family]}</Text>
                    <Text testID={`badges-row-${family}-status`} className="text-caption text-muted-foreground">{familyStatus(f)}</Text>
                  </View>
                </Pressable>
              );
            })
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}
