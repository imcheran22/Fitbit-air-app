// One frame of a social story (spec 2026-10-07 social §4.2): a check-in (locked until I check in), a badge, a
// shared recap's headline line exactly as its owner previewed and shared it — never the recap's stats JSON — or a
// goodnight (S2: "{name} said goodnight", on time or off to bed, their KIP asleep).

import React from 'react';
import { View } from 'react-native';
import type { Person } from '../../api/buddies';
import type { StoryFrame } from '../../api/social';
import { levelTitle } from '../../lib/badges';
import { recapTitle } from '../../lib/recapCopy';
import { useMyKipColour } from '../../lib/kip/myKipColour';
import { CHECKIN_OPTIONS, personName } from '../../lib/socialCopy';
import { PersonKip } from '../kip/PersonKip';
import { Button } from '../ui/button';
import { Text } from '../ui/text';

export function SocialStoryFrame({ frame, author, mine, onUnlock }: { frame: StoryFrame; author: Person; mine: boolean; onUnlock: () => void }) {
  const myColour = useMyKipColour();
  const who = personName(author, mine);
  // Drawn over the viewer's tap areas: only the Check in button takes touches, the rest pass through to them.
  return (
    <View pointerEvents="box-none" className="flex-1 items-center justify-center gap-5 px-8">
      <View pointerEvents="none">
        <PersonKip colour={mine ? myColour : author.kipColour} state={frame.kind === 'goodnight' ? 'asleep' : 'none'} size={96} />
      </View>
      {frame.kind === 'checkin' && frame.locked ? (
        <View testID="story-locked" pointerEvents="box-none" className="items-center gap-3">
          <View pointerEvents="none">
            <Text className="text-center text-headline text-white">{`Check in to see how ${who} woke up`}</Text>
          </View>
          {/* White on the story's dark ground in either app scheme. */}
          <Button testID="story-unlock" size="sm" onPress={onUnlock} className="bg-white" textClassName="text-black">Check in</Button>
        </View>
      ) : null}
      {frame.kind === 'checkin' && !frame.locked ? (
        <View pointerEvents="none" className="items-center gap-2">
          <Text className="text-label uppercase text-white/70">{`${who} woke up`}</Text>
          <Text className="text-heading text-white">{CHECKIN_OPTIONS.find((o) => o.mood === frame.mood)?.label ?? ''}</Text>
        </View>
      ) : null}
      {frame.kind === 'badge' ? (
        <View pointerEvents="none" className="items-center gap-2">
          <Text className="text-label uppercase text-white/70">New badge</Text>
          <Text className="text-center text-heading text-white">{levelTitle(frame.family, frame.level)}</Text>
        </View>
      ) : null}
      {frame.kind === 'recap' ? (
        <View pointerEvents="none" className="items-center gap-2">
          <Text className="text-label uppercase text-white/70">{`${frame.recapKind === 'WEEK' ? 'Weekly recap' : 'Monthly recap'} · ${recapTitle({ kind: frame.recapKind, periodStart: frame.periodStart })}`}</Text>
          <Text className="text-center text-heading text-white">{frame.line}</Text>
        </View>
      ) : null}
      {frame.kind === 'goodnight' ? (
        <View testID="story-goodnight" pointerEvents="none" className="items-center gap-2">
          <Text className="text-label uppercase text-white/70">{`${who} said goodnight`}</Text>
          <Text className="text-center text-heading text-white">{frame.onTime ? 'On time' : 'Off to bed'}</Text>
        </View>
      ) : null}
    </View>
  );
}
