import React from 'react';
import { Pressable, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { AchievementFamily } from '../../api/achievements';
import { useCharacterOptional } from '../../characters/CharacterContext';
import { useAchievements } from '../../lib/achievementsStore';
import { useRefreshAchievementsOnFocus } from '../../lib/useRefreshAchievementsOnFocus';
import { mixHex, tierColors } from '../../lib/badgeArt';
import { FAMILY_ORDER, FAMILY_SHORT, TOTAL_LEVELS, badgeLabel, countLabel, earnedCount, levelTitle, nextUp } from '../../lib/badges';
import { COLORS } from '../../theme';
import { characterInfo } from '../characters/registry';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Text } from '../ui/text';
import { BadgeIcon } from './BadgeIcon';

export interface BadgesCardProps {
  onSeeAll: () => void;
  onOpen: (family: AchievementFamily) => void;
}

// Profile's Badges card (spec 2026-10-06 §6; canvas Profile.dc.html): the seven badges at their
// highest level (locked grey at 0), "BADGES · n OF 35", the family closest to its next level with
// a progress bar in that level's colour, and "See all". Nothing until loaded; hidden on a 404
// (a backend older than badges) and on an error. Profile is a tab that stays mounted, so the badges
// also reload each time it comes back into focus (a failed first load, levels earned since).
export function BadgesCard({ onSeeAll, onOpen }: BadgesCardProps) {
  const { state } = useAchievements();
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const colors = dark ? COLORS.dark : COLORS.light;
  const accent = characterInfo(useCharacterOptional()?.characterId).accent;
  useRefreshAchievementsOnFocus();

  if (state.status !== 'ready') return null;
  const a = state.data;
  const next = nextUp(a);
  const ring = next ? tierColors(next.nextLevel, accent).ring : '';
  const pct = next ? Math.round(Math.min(1, next.current / next.threshold) * 100) : 0;
  return (
    <Card testID="badges-card" className="gap-3.5">
      <View className="flex-row items-center justify-between">
        <Text testID="badges-count" className="text-label text-muted-foreground">
          {`BADGES · ${earnedCount(a)} OF ${TOTAL_LEVELS}`}
        </Text>
        <Button testID="badges-see-all" variant="link" size="sm" accessibilityLabel="See all badges" onPress={onSeeAll}>
          See all
        </Button>
      </View>
      <View className="flex-row flex-wrap" style={{ rowGap: 14 }}>
        {FAMILY_ORDER.map((family) => {
          const level = a.families.find((f) => f.family === family)?.level ?? 0;
          return (
            <Pressable
              key={family}
              testID={`badges-card-${family}`}
              accessibilityRole="button"
              accessibilityLabel={badgeLabel(family, level)}
              onPress={() => onOpen(family)}
              style={{ width: '25%', alignItems: 'center', gap: 6 }}
            >
              <BadgeIcon family={family} level={level} size={58} testID={`badges-card-${family}-icon`} />
              <Text testID={`badges-card-${family}-label`} className="text-center text-caption" numberOfLines={1} style={{ color: level > 0 ? colors.foreground : colors.muted }}>
                {FAMILY_SHORT[family]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {next ? (
        <View className="gap-2 border-t border-border pt-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text testID="badges-next-up" className="flex-1 text-body" numberOfLines={1}>
              <Text className="text-body font-semibold">Next up: </Text>
              {levelTitle(next.family, next.nextLevel)}
            </Text>
            <Text testID="badges-next-up-count" className="text-caption text-muted-foreground tabular-nums">
              {`${Math.min(next.current, next.threshold)} / ${countLabel(next.family, next.threshold)}`}
            </Text>
          </View>
          <View style={{ height: 8, backgroundColor: colors.border }}>
            <View
              testID="badges-next-up-bar"
              style={{
                width: `${pct}%`,
                height: 8,
                backgroundColor: ring,
                // Pale tiers (Silver, Diamond) barely show on the light track; a darker edge keeps the fill
                // readable. None on an empty bar, where the edge alone would draw a 2 px sliver.
                borderWidth: dark || pct === 0 ? 0 : 1,
                borderColor: mixHex(ring, '#000000', 0.35),
              }}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
