import React from 'react';
import { View } from 'react-native';
import { Text } from '../../ui/text';
import { dotCount, hexAlpha, useCoachVoice, useElapsed } from './shared';
import type { ThinkingStyleProps } from './types';

// E: the coach with a small pill under it, "Axo · thinking...".
export function Nameplate({ characterId, paused, coach }: ThinkingStyleProps & { coach?: React.ReactNode }) {
  const { name, text, accent } = useCoachVoice(characterId);
  const dots = dotCount(useElapsed(paused));
  return (
    <View className="items-center gap-0.5">
      {coach}
      <View className="rounded-full px-[7px] py-0.5" style={{ backgroundColor: hexAlpha(accent, 0.16) }}>
        <Text className="text-caption font-semibold" style={{ color: text }}>
          {`${name} · thinking`}
          {'.'.repeat(dots)}
          <Text className="text-caption font-semibold" style={{ color: 'transparent' }}>
            {'.'.repeat(3 - dots)}
          </Text>
        </Text>
      </View>
    </View>
  );
}
