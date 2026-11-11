import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { skyAt, type SceneState } from '../../lib/home/scene';
import { HOME_COPY } from '../../lib/homeCopy';
import type { KipColour } from '../../lib/kip/kipArt';
import { Kip } from '../kip/Kip';
import { StoryRing, type StoryRingState } from '../recap/StoryRing';
import { SyncStatusLine } from '../sync-status-line';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';
import { ThemeToggle } from '../ui/theme-toggle';

// Home F's header (spec 2026-10-13 Home F §5), drawn over the sky: light text and icons on every sky, in both
// themes. The Profile button is the round story ring with your KIP inside.

const INK = '#F5F5F4';
const RING_SIZE = 44;
const RING_PAD = 3.5;

/** The round Profile button: today's recap ring, your KIP on a dark glass circle. `surface` matches the ring's gap. */
export function ProfileButton({ ring, surface, colour, onPress }: {
  ring: StoryRingState | null; surface: string; colour: KipColour; onPress: () => void;
}) {
  return (
    <Pressable
      testID="settings-button"
      accessibilityRole="button"
      accessibilityLabel={ring ? HOME_COPY.header.profileWithRing(ring.hint) : HOME_COPY.header.profile}
      onPress={onPress}
      hitSlop={4}
      className="active:opacity-70"
    >
      <StoryRing testID="profile-story-ring" color={ring?.color ?? null} size={RING_SIZE} ringWidth={2.5} gap={2.5} dotSize={12} surface={surface}>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(10,11,14,0.45)' }}>
          <Kip testID="profile-kip" colour={colour} pose="rest" mood="idle" scale={2} />
        </View>
      </StoryRing>
    </Pressable>
  );
}

export function HomeHeader({ top, extra, now, greeting, scene, myColour, ring, onProfile, onBottom }: {
  top: number;
  /** The scene's extra sky (sceneExtra), to find the band behind the Profile ring. */
  extra: number;
  now: Date; greeting: string; scene: SceneState; myColour: KipColour; ring: StoryRingState | null;
  onProfile: () => void; onBottom: (bottom: number) => void;
}) {
  const [bottom, setBottom] = useState(0);
  return (
    <View
      testID="home-header"
      onLayout={(e) => {
        const next = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
        setBottom(next);
        onBottom(next);
      }}
      className="absolute left-0 right-0 flex-row items-end justify-between gap-3 px-[20px]"
      style={{ top }}
    >
      <View className="flex-1 gap-1">
        <SectionLabel className="text-[#E5E7EB]">{HOME_COPY.header.date(now)}</SectionLabel>
        <Text className="text-display" style={{ color: INK }}>{greeting}</Text>
        <SyncStatusLine light />
      </View>
      <View className="flex-row items-center gap-3" style={{ paddingBottom: RING_PAD }}>
        <ThemeToggle color={INK} />
        <ProfileButton ring={ring} surface={skyAt(scene.key, bottom - RING_PAD - RING_SIZE / 2, extra)} colour={myColour} onPress={onProfile} />
      </View>
    </View>
  );
}
