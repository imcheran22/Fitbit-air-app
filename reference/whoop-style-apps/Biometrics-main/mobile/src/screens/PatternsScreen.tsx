import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import { fetchHabitConfig, fetchPatterns, type PatternsDTO } from '../api/habits';
import { Text } from '../components/ui/text';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { CorrelationCard } from '../components/ui/correlation-card';
import { SectionLabel } from '../components/ui/section-label';
import { COLORS } from '../theme';
import { withAlpha } from '../lib/utils';
import { buildNotEnoughDataLine } from '../lib/patternSentence';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: PatternsDTO; labels: Record<string, string> };

function humanize(habitType: string): string {
  return habitType.toLowerCase().replace(/_/g, ' ');
}

// Confirmed patterns only: the server returns nothing that has not held up in
// two consecutive weekly runs, and this screen never invents candidates.
export function PatternsScreen() {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        // Labels are a nicety: the patterns must still show if the config call fails.
        const [data, habitTypes] = await Promise.all([fetchPatterns(), fetchHabitConfig().catch(() => [])]);
        if (cancelled) return;
        const labels: Record<string, string> = {};
        for (const habit of habitTypes) labels[habit.type] = habit.label;
        setState({ status: 'ready', data, labels });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === 'loading') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View testID="patterns-loading" className="gap-5 px-5 pt-4">
          <Skeleton className="h-3 w-32 rounded-full" />
          <Skeleton className="h-64 w-full rounded-card" />
          <Skeleton className="h-64 w-full rounded-card" />
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'error') {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Ionicons name="cloud-offline-outline" size={22} color={colors.muted} />
          </View>
          <Text className="text-center text-muted-foreground">Patterns are unavailable right now.</Text>
          <Button testID="patterns-retry" variant="secondary" onPress={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const { data, labels } = state;
  const labelFor = (habitType: string) => labels[habitType] ?? humanize(habitType);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}>
        {data.patterns.length > 0 ? (
          <View className="gap-3">
            <SectionLabel>Confirmed patterns</SectionLabel>
            {data.patterns.map((pattern) => (
              <CorrelationCard
                key={`${pattern.habitType}-${pattern.factor}-${pattern.lagDays}`}
                pattern={pattern}
                habitLabel={labelFor(pattern.habitType)}
              />
            ))}
          </View>
        ) : null}

        {data.patterns.length === 0 ? (
          <Card testID="patterns-empty" className="gap-3 p-5">
            <View className="h-10 w-10 items-center justify-center rounded-[12px]" style={{ backgroundColor: withAlpha(colors.accent, 0.14) }}>
              <Ionicons name="sparkles-outline" size={19} color={colors.accent} />
            </View>
            <Text className="text-heading">No patterns yet</Text>
            <Text className="text-caption text-muted-foreground">
              A pattern only appears once it holds up in two weekly checks in a row, so the earliest you can see one is about two weeks
              after you start logging. Patterns are comparisons within your own data, not medical claims.
            </Text>
          </Card>
        ) : null}

        {data.notEnoughData.length > 0 ? (
          <View className="gap-3">
            <SectionLabel>Not enough data yet</SectionLabel>
            <Card className="gap-5 p-5">
              {data.notEnoughData.map((item) => {
                const unexposedShort = item.unexposedDays < item.requiredEach;
                const have = Math.min(unexposedShort ? item.unexposedDays : item.exposedDays, item.requiredEach);
                return (
                  <View key={item.habitType} testID={`not-enough-data-${item.habitType}`} className="gap-2.5">
                    <Text className="text-body">{buildNotEnoughDataLine(item, labelFor(item.habitType))}</Text>
                    <View
                      testID={`not-enough-data-progress-${item.habitType}`}
                      accessibilityRole="progressbar"
                      accessibilityValue={{ min: 0, max: item.requiredEach, now: have }}
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                    >
                      <View className="h-full rounded-full bg-accent" style={{ width: `${(have / Math.max(item.requiredEach, 1)) * 100}%` }} />
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
