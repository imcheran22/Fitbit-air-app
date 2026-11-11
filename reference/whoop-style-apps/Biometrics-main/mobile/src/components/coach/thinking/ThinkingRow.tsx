import React from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Character } from '../../characters/Character';
import { CHARACTERS } from '../../characters/registry';
import type { ThinkingTextId } from '../../characters/thinking';
import { Bouncy } from './Bouncy';
import { Dialog } from './Dialog';
import { Lines } from './Lines';
import { Nameplate } from './Nameplate';
import { Placeholder } from './Placeholder';
import { spoken } from './shared';
import { Shimmer } from './Shimmer';
import { Steps } from './Steps';
import { Strip } from './Strip';
import { Tag } from './Tag';
import type { ThinkingStyleProps } from './types';
import { Typewriter } from './Typewriter';

export type { ThinkingStyleProps } from './types';

const STYLES: Record<ThinkingTextId, React.ComponentType<ThinkingStyleProps>> = {
  lines: Lines,
  placeholder: Placeholder,
  tag: Tag,
  typewriter: Typewriter,
  nameplate: Nameplate,
  steps: Steps,
  shimmer: Shimmer,
  bouncy: Bouncy,
  dialog: Dialog,
  strip: Strip,
};

/**
 * What a screen reader hears. Steps speaks the step it is on (or the last
 * one, once all are ticked); every other style a steady "Luna is thinking",
 * so the polite live region is not re-announced each time a line rotates.
 */
export function thinkingRowLabel(style: ThinkingTextId, props: ThinkingStyleProps): string {
  if (style === 'steps' && props.steps.length) {
    const current = props.steps.find((step) => !step.done) ?? props.steps[props.steps.length - 1]!;
    return spoken(current.label);
  }
  return `${CHARACTERS[props.characterId].name} is thinking`;
}

// The Coach screen's "a reply is on its way" row (spec §5): the coach at 36 pt
// in the thinking mood with the user's attachment, and the user's thinking
// text. Nameplate puts its text under the coach; every other style sits
// beside it. Reduce Motion freezes every style on its first frame.
export function ThinkingRow({ style, characterId, steps, paused, testID }: ThinkingStyleProps & { style: ThinkingTextId; testID?: string }) {
  const reduceMotion = useReducedMotion();
  const still = paused || reduceMotion;
  const props: ThinkingStyleProps = { characterId, steps, paused: still };
  const Body = STYLES[style];
  const coach = <Character characterId={characterId} mood="thinking" size={36} paused={paused} />;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={thinkingRowLabel(style, props)}
      accessibilityLiveRegion="polite"
      className="flex-row items-end gap-1.5"
    >
      {style === 'nameplate' ? (
        <Nameplate {...props} coach={coach} />
      ) : (
        <>
          {coach}
          <View className="flex-1">
            <Body {...props} />
          </View>
        </>
      )}
    </View>
  );
}
