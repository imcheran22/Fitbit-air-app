import React from 'react';
import { View } from 'react-native';
import type { Person } from '../../api/buddies';
import { PersonKip } from '../kip/PersonKip';

const STORY_RING = '#2DD4BF';
const ACTIVE_DOT = '#22C55E';

/** A buddy's KIP in a circle (V5 boards): a teal ring while they have an unseen story, a green dot while active now. */
export function ChatAvatar({ person, size, ring = false, active = false, testID }: { person: Person; size: number; ring?: boolean; active?: boolean; testID?: string }) {
  const inner = size - 4;
  const dot = Math.round(size * 0.26);
  return (
    <View testID={testID} style={{ width: size, height: size, borderRadius: size / 2, padding: 2, backgroundColor: ring ? STORY_RING : 'transparent' }}>
      <View className="items-center justify-center border-2 border-background bg-card" style={{ width: inner, height: inner, borderRadius: inner / 2 }}>
        <PersonKip colour={person.kipColour} size={Math.round(inner * 0.62)} />
      </View>
      {active ? (
        <View
          testID={testID ? `${testID}-active` : undefined}
          className="border-2 border-background"
          style={{ position: 'absolute', right: 0, bottom: 0, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: ACTIVE_DOT }}
        />
      ) : null}
    </View>
  );
}
