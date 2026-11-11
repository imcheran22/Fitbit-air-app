import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { fetchRecaps, type RecapSummary } from '../api/recaps';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { SectionLabel } from '../components/ui/section-label';
import { Skeleton } from '../components/ui/skeleton';
import { Text } from '../components/ui/text';
import { recapTitle } from '../lib/recapCopy';
import { COLORS } from '../theme';

type State = { phase: 'loading' } | { phase: 'ready'; recaps: RecapSummary[] } | { phase: 'error' };

function RecapRow({ recap, testID, onPress }: { recap: RecapSummary; testID: string; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} className="active:opacity-80">
      <Card className="gap-1.5">
        <View className="flex-row items-center justify-between">
          <SectionLabel>{recapTitle(recap)}</SectionLabel>
          {recap.openedAt === null ? (
            <Text testID={`recaps-new-${recap.id}`} className="text-label uppercase text-accent">
              New
            </Text>
          ) : null}
        </View>
        <Text className="text-heading" numberOfLines={2}>
          {recap.line}
        </Text>
      </Card>
    </Pressable>
  );
}

// "Your recaps" (spec 2026-10-04 §3): the latest month, the latest week, older ones, and Year in pixels.
export function RecapsScreen() {
  const navigation = useNavigation<any>();
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [state, setState] = useState<State>({ phase: 'loading' });

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    try {
      setState({ phase: 'ready', recaps: await fetchRecaps({ limit: 30 }) });
    } catch {
      setState({ phase: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (id: string) => navigation.navigate('Recap', { id });
  const recaps = state.phase === 'ready' ? state.recaps : [];
  const month = recaps.find((r) => r.kind === 'MONTH');
  const week = recaps.find((r) => r.kind === 'WEEK');
  const older = recaps.filter((r) => r !== month && r !== week);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 16, padding: 20 }}>
        {state.phase === 'loading' ? <Skeleton className="h-40 w-full rounded-card" /> : null}
        {state.phase === 'error' ? (
          <Card testID="recaps-error" className="gap-3">
            <Text className="text-caption text-muted-foreground">Your recaps could not be loaded.</Text>
            <Button testID="recaps-retry" variant="secondary" size="sm" className="self-start" onPress={() => void load()}>
              Try again
            </Button>
          </Card>
        ) : null}
        {state.phase === 'ready' && recaps.length === 0 ? (
          <Text testID="recaps-empty" className="text-body text-muted-foreground">
            Your first recap arrives after your first full week of sleep.
          </Text>
        ) : null}
        {month ? <RecapRow testID="recaps-latest-month" recap={month} onPress={() => open(month.id)} /> : null}
        {week ? <RecapRow testID="recaps-latest-week" recap={week} onPress={() => open(week.id)} /> : null}
        {state.phase === 'ready' ? (
          <Pressable testID="recaps-year" accessibilityRole="button" onPress={() => navigation.navigate('YearInPixels')} className="active:opacity-70">
            <Card className="flex-row items-center gap-3">
              <View className="flex-1 gap-1">
                <SectionLabel>Year in pixels</SectionLabel>
                <Text className="text-body font-semibold">Every night of the year, one square each</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Card>
          </Pressable>
        ) : null}
        {older.length > 0 ? <SectionLabel>Older</SectionLabel> : null}
        {older.map((r) => (
          <RecapRow key={r.id} testID={`recaps-older-${r.id}`} recap={r} onPress={() => open(r.id)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
