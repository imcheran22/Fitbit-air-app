// Activity: "Against your usual · 30d" — four rows (A-2: Resting HR, Sleep, HRV, Recovery), with "Patterns" and
// "All trends" (→ Trends, the old Metrics) as text links in the section header.

import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColorScheme } from 'nativewind';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { ACTIVITY_COPY } from '../../lib/activityCopy';
import type { MetricRecord } from '../../lib/metricInsights';
import { usualTiles, type TileRecord, type UsualTile } from '../../lib/usualTiles';
import { openSleep } from '../../navigation/sleepNavigation';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PressableScale } from '../ui/pressable-scale';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

const COPY = ACTIVITY_COPY.usual;

export function UsualTiles({ records, recovery, today }: { records: MetricRecord[]; recovery: TileRecord[]; today: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'light' ? 'light' : 'dark';
  const tiles = usualTiles(records, recovery, today);

  const open = (tile: UsualTile) => {
    if (tile.type === 'RECOVERY') {
      // Without a score the Recovery page opens on today.
      navigation.navigate('Recovery', tile.latestDate ? { date: tile.latestDate } : undefined);
      return;
    }
    if (tile.type === 'SLEEP') {
      openSleep(navigation, tile.latestDate ?? undefined);
      return;
    }
    navigation.navigate('MetricDetail', { metricType: tile.type, records: tile.series as MetricRecord[], range: '30d' });
  };

  return (
    <View testID="usual-tiles" className="gap-3">
      <View className="flex-row items-center justify-between">
        <SectionLabel>{COPY.label}</SectionLabel>
        <View className="flex-row items-center gap-4">
          <Button testID="usual-patterns" variant="link" size="sm" accessibilityRole="link" onPress={() => navigation.navigate('Patterns')}>
            {COPY.patterns}
          </Button>
          <Button testID="all-trends" variant="link" size="sm" accessibilityRole="link" onPress={() => navigation.navigate('Trends')}>
            {COPY.allTrends}
          </Button>
        </View>
      </View>
      <Card testID="usual-rows" className="p-0">
        {tiles.map((tile, i) => (
          <PressableScale
            key={tile.type}
            testID={`usual-tile-${tile.type}`}
            accessibilityRole="button"
            accessibilityLabel={`${tile.label}, ${tile.latest ?? 'no reading'}${tile.delta ? `, ${tile.delta}` : ''}`}
            className={`min-h-[52px] flex-row items-center gap-3 px-4 py-2 ${i > 0 ? 'border-t border-border' : ''}`}
            onPress={() => open(tile)}
          >
            <View testID={`usual-tile-${tile.type}-dot`} style={{ width: 8, height: 8, backgroundColor: tile.color[scheme] }} />
            <View className="flex-1 gap-0.5">
              <Text className="text-body" numberOfLines={1}>
                {tile.label}
              </Text>
              {tile.delta ? (
                <Text className="text-caption text-muted-foreground" numberOfLines={1}>
                  {tile.delta}
                </Text>
              ) : null}
            </View>
            <Text className="max-w-[40%] text-heading tabular-nums" numberOfLines={1} adjustsFontSizeToFit>
              {tile.latest ?? COPY.none}
            </Text>
          </PressableScale>
        ))}
      </Card>
    </View>
  );
}
