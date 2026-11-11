// Profile's category cards (board S2, spec 2026-10-13 §2.3): two columns, each a pixel icon, a title and a
// one-line status. A card whose status could not be read shows its title alone. Each opens its section.

import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { CATEGORY_ICONS, CATEGORY_ICON_SIZE } from '../../lib/profileArt';
import { PROFILE_COPY, type ProfileCategory } from '../../lib/profileCopy';
import { PressableScale } from '../ui/pressable-scale';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

const ICON_SCALE = 3;

export interface CategoryCard {
  category: ProfileCategory;
  status: string | null;
}

function PixelIcon({ category }: { category: ProfileCategory }) {
  const size = CATEGORY_ICON_SIZE * ICON_SCALE;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox={`0 0 ${CATEGORY_ICON_SIZE} ${CATEGORY_ICON_SIZE}`}>
        {CATEGORY_ICONS[category].map((p, i) => (
          <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
        ))}
      </Svg>
    </View>
  );
}

export function CategoryGrid({ cards, onOpen }: { cards: CategoryCard[]; onOpen: (category: ProfileCategory) => void }) {
  return (
    <View testID="profile-categories" className="gap-2">
      <SectionLabel>{PROFILE_COPY.categoriesLabel}</SectionLabel>
      <View className="flex-row flex-wrap justify-between gap-y-3">
        {cards.map(({ category, status }) => {
          const title = PROFILE_COPY.categories[category];
          return (
            <PressableScale
              key={category}
              testID={`profile-category-${category}`}
              accessibilityRole="button"
              accessibilityLabel={PROFILE_COPY.cardLabel(title, status)}
              onPress={() => onOpen(category)}
              className="w-[48.5%] gap-2 rounded-lg border border-border bg-card p-3"
            >
              <PixelIcon category={category} />
              <View className="gap-0.5">
                <Text className="text-body font-semibold" numberOfLines={1}>
                  {title}
                </Text>
                {status ? (
                  <Text testID={`profile-category-${category}-status`} className="text-fine text-muted-foreground" numberOfLines={2}>
                    {status}
                  </Text>
                ) : null}
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
