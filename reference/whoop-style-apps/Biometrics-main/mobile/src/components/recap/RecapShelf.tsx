import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useCharacterOptional } from '../../characters/CharacterContext';
import type { RecapShelfState } from '../../lib/recap/useRecapShelf';
import { recapCoachId } from '../../lib/recapShare';
import { recapTint, STORY_RING_NEUTRAL, storyRingColor } from '../../lib/recapTheme';
import { recapDestination } from '../../lib/unwatchedRecap';
import { COLORS, FONTS } from '../../theme';
import { DEFAULT_CHARACTER_ID } from '../characters/types';
import { pixelFont } from '../coach/thinking/shared';
import { Button } from '../ui/button';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

const CIRCLE = 64;

interface Navigator {
  navigate: (name: string, params?: object) => void;
}

// The story shelf on Home, above the coach digest (weekly story placement, design D): "Recaps" with See all,
// then a row of circles, newest first, each on its coach's ground. An unwatched recap wears its
// coach's ring, a watched one a neutral ring. A week plays its story; a month opens its recap.
// The header and See all always show (the way to Your recaps and Year in pixels); the circles
// only once there are recaps, with a one-line hint when there are none yet. Home owns the fetch
// (useRecapShelf), so the RECAPS tag and the shelf share it.
export function RecapShelf({ navigation, shelf }: { navigation: Navigator; shelf: RecapShelfState }) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const colors = COLORS[scheme];
  const characterId = useCharacterOptional()?.characterId ?? DEFAULT_CHARACTER_ID;
  const { recaps, items } = shelf;
  const pixel = pixelFont();

  return (
    <View testID="recap-shelf" className="gap-2.5">
      <View className="flex-row items-baseline justify-between">
        <SectionLabel testID="recap-shelf-title">Recaps</SectionLabel>
        <Button testID="recap-shelf-see-all" variant="link" size="sm" accessibilityLabel="See all recaps" onPress={() => navigation.navigate('Recaps')}>
          See all
        </Button>
      </View>
      {recaps !== null && recaps.length === 0 ? (
        <Text testID="recap-shelf-empty" className="text-caption text-muted-foreground">
          Your first recap arrives after your first full week of sleep.
        </Text>
      ) : null}
      {/* Bleeds to the screen edges so the row scrolls under the page's padding. */}
      {items.length > 0 ? (
        <ScrollView testID="recap-shelf-row" horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }}>
          {items.map((item) => {
            const coach = recapCoachId(item, characterId);
            const tint = recapTint(coach);
            return (
              <Pressable
                key={item.id}
                testID={`recap-shelf-item-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={item.accessibilityLabel}
                onPress={() => {
                  const to = recapDestination(item);
                  navigation.navigate(to.name, to.params);
                }}
                className="items-center active:opacity-80"
                style={{ gap: 6, width: CIRCLE + 8 }}
              >
                <View
                  testID={`recap-shelf-ring-${item.id}`}
                  style={{
                    width: CIRCLE,
                    height: CIRCLE,
                    borderRadius: CIRCLE / 2,
                    borderWidth: item.unwatched ? 3 : 2,
                    borderColor: item.unwatched ? storyRingColor(coach, scheme) : STORY_RING_NEUTRAL[scheme],
                    padding: 3,
                  }}
                >
                  <View
                    testID={`recap-shelf-circle-${item.id}`}
                    style={{ flex: 1, borderRadius: CIRCLE / 2, backgroundColor: tint.ground, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text testID={`recap-shelf-badge-${item.id}`} style={{ fontFamily: pixel, fontSize: 11, lineHeight: 12, color: tint.accentText, textAlign: 'center' }}>
                      {item.badge}
                    </Text>
                  </View>
                </View>
                <Text
                  testID={`recap-shelf-label-${item.id}`}
                  numberOfLines={1}
                  style={{ fontSize: 12, fontFamily: item.unwatched ? FONTS.sansSemibold : FONTS.sans, color: item.unwatched ? colors.foreground : colors.muted }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
