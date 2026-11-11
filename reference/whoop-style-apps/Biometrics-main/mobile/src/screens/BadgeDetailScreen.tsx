import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { useCharacterOptional } from '../characters/CharacterContext';
import { BadgeIcon } from '../components/achievements/BadgeIcon';
import { characterInfo } from '../components/characters/registry';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { PageTitle } from '../components/ui/page-title';
import { SectionLabel } from '../components/ui/section-label';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { refreshAchievements, useAchievements } from '../lib/achievementsStore';
import { tierTextColor } from '../lib/badgeArt';
import { FAMILY_NAMES, FAMILY_RULES, countLabel, ladderRow, numeral, tierName } from '../lib/badges';
import { useRefreshAchievementsOnFocus } from '../lib/useRefreshAchievementsOnFocus';
import type { RootStackParamList } from '../navigation/RootNavigator';

type BadgeDetailRoute = RouteProp<RootStackParamList, 'BadgeDetail'>;

// Badge detail (spec 2026-10-06 §6; canvas BadgeDetail.dc.html): the big badge, current and best
// (one month count for a monthly family), and the ladder of five levels — earned with its date,
// the next one with what is left, the rest locked. Opened from the Profile card or the Badges
// screen; reloads on mount and focus like they do (in-flight refreshes coalesce in the store).
export function BadgeDetailScreen() {
  // A malformed deep link or a stale state restore may arrive without params: the missing state.
  const family = (useRoute<BadgeDetailRoute>().params as BadgeDetailRoute['params'] | undefined)?.family;
  const { state } = useAchievements();
  const accent = characterInfo(useCharacterOptional()?.characterId).accent;
  const dark = useColorScheme().colorScheme === 'dark';
  useRefreshAchievementsOnFocus();

  const f = state.status === 'ready' && family ? state.data.families.find((x) => x.family === family) : undefined;
  if (!f) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View style={{ padding: 20 }}>
          {state.status === 'idle' ? (
            <Skeleton testID="badge-detail-loading" className="h-64 w-full rounded-card" />
          ) : state.status === 'error' ? (
            <Card testID="badge-detail-error" className="gap-3">
              <Text className="text-caption text-muted-foreground">This badge could not be loaded.</Text>
              <Button testID="badge-detail-retry" variant="secondary" size="sm" className="self-start" onPress={() => void refreshAchievements()}>
                Try again
              </Button>
            </Card>
          ) : (
            <Text testID="badge-detail-missing" className="text-body">This badge isn't available.</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const cards = f.kind === 'streak'
    ? [
        { key: 'current', label: 'CURRENT STREAK', value: countLabel(f.family, f.current) },
        { key: 'best', label: 'BEST STREAK', value: countLabel(f.family, f.best) },
      ]
    : [{ key: 'current', label: 'MONTHS SO FAR', value: countLabel(f.family, f.current) }];
  const keep = f.kind === 'streak' ? 'Levels stay yours even if a streak breaks.' : 'Levels are never taken away.';

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 18, padding: 20 }}>
        <View className="items-center gap-3">
          <BadgeIcon family={f.family} level={f.level} size={140} pips={false} testID="badge-detail-icon" />
          <PageTitle testID="badge-detail-title" className="text-center">{FAMILY_NAMES[f.family]}</PageTitle>
          <Text className="text-center text-caption text-muted-foreground" style={{ maxWidth: 290 }}>
            {`${FAMILY_RULES[f.family]}. ${keep}`}
          </Text>
        </View>
        <View className="flex-row gap-2.5">
          {cards.map((c) => (
            <Card key={c.key} testID={`badge-detail-${c.key}`} className="flex-1 gap-1">
              <SectionLabel>{c.label}</SectionLabel>
              <Text className="text-display tabular-nums">{c.value}</Text>
            </Card>
          ))}
        </View>
        <View>
          {[1, 2, 3, 4, 5].map((level) => {
            const row = ladderRow(f, level);
            const threshold = f.thresholds[level - 1] ?? 0;
            return (
              <View key={level} testID={`badge-detail-level-${level}`} className="flex-row items-center gap-3.5 border-b border-border py-2">
                <BadgeIcon family={f.family} level={row.earned ? level : 0} size={44} pips={false} testID={`badge-detail-level-${level}-icon`} />
                <View className="flex-1 gap-0.5">
                  <Text className="text-body font-semibold">{`Level ${numeral(level)} · ${tierName(level)} · ${countLabel(f.family, threshold)}`}</Text>
                  <Text testID={`badge-detail-level-${level}-sub`} className="text-caption text-muted-foreground">{row.text}</Text>
                </View>
                {row.tag ? (
                  <Text testID={`badge-detail-level-${level}-tag`} className="text-label" style={{ color: tierTextColor(level, accent, dark) }}>
                    {row.tag}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
