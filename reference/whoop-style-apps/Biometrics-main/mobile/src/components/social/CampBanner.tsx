// The camp banner (spec 2026-10-07 social §4, item 1): "THE CAMP" over "{awake} awake · {asleep} asleep" at night
// (19:00–05:59 in my zone) or "{n} checked in" by day, a small fire, and up to two KIPs of buddies who checked
// in today. Tapping it opens the Campfire page (S2) — given `onOpen`, which the Social screen passes only when the
// server has a Campfire (it sends `camp.night`); an S1 server keeps the static strip.

import React from 'react';
import { View } from 'react-native';
import type { SocialHome } from '../../api/social';
import { campBannerLine } from '../../lib/socialCopy';
import { pixelFont } from '../coach/thinking/shared';
import { PersonKip } from '../kip/PersonKip';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';

const STRIP = 'h-[74px] flex-row items-center gap-3 overflow-hidden rounded-tile bg-[#0F1230] px-4';

export function CampBanner({ camp, onOpen }: { camp: SocialHome['camp']; onOpen?: () => void }) {
  const line = campBannerLine(camp);
  const body = (
    <>
      <View className="h-8 w-8 items-center justify-center">
        <View style={{ width: 8, height: 8, backgroundColor: '#FDE68A' }} />
        <View style={{ width: 16, height: 8, backgroundColor: '#FB923C' }} />
        <View style={{ width: 24, height: 6, backgroundColor: '#78350F' }} />
      </View>
      <View className="flex-1">
        <Text className="text-[10px] text-[#A5B4FC]" style={{ fontFamily: pixelFont() }}>THE CAMP</Text>
        <Text testID="camp-banner-line" className="text-sm font-semibold text-white">{line}</Text>
      </View>
      <View className="flex-row">
        {camp.faces.slice(0, 2).map((_, index) => (
          // The second face tucks under the first.
          <View key={index} testID={`camp-face-${index}`} style={index > 0 ? { marginLeft: -6 } : undefined}
            className="h-9 w-9 items-center justify-center rounded-full bg-[#1B2048]">
            <PersonKip colour={camp.faceColours?.[index]} size={26} />
          </View>
        ))}
      </View>
    </>
  );
  if (!onOpen) {
    return <View testID="camp-banner" accessibilityRole="summary" accessibilityLabel={`The camp, ${line}`} className={STRIP}>{body}</View>;
  }
  return (
    <PressableScale testID="camp-banner" accessibilityRole="button" accessibilityLabel={`Open the camp, ${line}`} onPress={onOpen} className={STRIP}>
      {body}
    </PressableScale>
  );
}
