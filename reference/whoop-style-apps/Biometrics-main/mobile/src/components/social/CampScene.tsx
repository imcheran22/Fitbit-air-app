// The Campfire's full-screen pixel scene (design: PixelScene, owner-approved 2026-10-07), drawn from `campScene()`.
// The static layers (sky, mountains, pines, ground, tent) are SVG paths, one per colour, memoised on the geometry so
// nothing above them (the panel, its drag) re-renders them. What moves is stepped, frame by frame, from one Reanimated
// clock: twinkling stars, the firelight, the two-frame flame, sparks, and asleep coaches bobbing with drifting "z"s.
// With Reduce Motion (or the screen out of focus) the clock stops and the scene is one still frame.

import React, { memo, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { CampMember } from '../../api/social';
import { personName } from '../../lib/socialCopy';
import { useMyKipColour } from '../../lib/kip/myKipColour';
import { pixelFont } from '../coach/thinking/shared';
import { PersonKip } from '../kip/PersonKip';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';
import {
  BUBBLE_GAP, BUBBLE_H, LOG_H, PX, SEAT_W, type Box, type CampSceneGeometry, type PathLayer, type Seat,
} from './campSceneGeometry';

/** The clock runs 0 → CLOCK_S seconds and starts over (a one-frame hitch every ~17 minutes). */
const CLOCK_S = 1000;
/** Ground drawn below the screen, for when the scene shifts up behind the panel. */
export const GROUND_OVERHANG = 400;
const INK = '#14161B';
const CREAM = '#FAFAF9';
const ZZ = '#C7D2FE';

/** One clock for every stepped animation in the scene; stopped (at 0) when `still`. */
export function useSceneClock(still: boolean): SharedValue<number> {
  const t = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(t);
    t.value = 0;
    if (still) return undefined;
    t.value = withRepeat(withTiming(CLOCK_S, { duration: CLOCK_S * 1000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [still, t]);
  return t;
}

/** Which of `steps` equal frames of a `period`-second loop the clock is on, `delay` seconds in. */
export function stepIndex(t: number, period: number, steps: number, delay = 0): number {
  'worklet';
  const p = ((t + delay) % period) / period;
  return Math.min(steps - 1, Math.floor(p * steps));
}

const TWINKLE = [1, 0.55, 0.3];
const Z_OPACITY = [1, 1, 0.75, 0.5, 0.25];

// react-native-svg has no shapeRendering; every edge is on a whole point, so the pixels stay crisp without it.
function Paths({ layers, width, height }: { layers: readonly PathLayer[]; width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {layers.map((l, i) => <Path key={`${i}-${l.c}`} d={l.d} fill={l.c} />)}
    </Svg>
  );
}

const fill = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 } as const;

/** Sky, stars, constellation lines, moon or sun, mountains, pines and ground. Never re-renders for a given size. */
const StaticBack = memo(function StaticBack({ geo }: { geo: CampSceneGeometry }) {
  return (
    <>
      <View style={{ position: 'absolute', left: 0, right: 0, top: geo.horizon, height: geo.height - geo.horizon + GROUND_OVERHANG, backgroundColor: geo.ground }} />
      <Paths layers={geo.back} width={geo.width} height={geo.height} />
      {geo.labels.map((l) => (
        <Text key={l.text} style={{ position: 'absolute', left: l.x, top: l.y, fontFamily: pixelFont(), fontSize: 8, letterSpacing: 1, color: '#6E78C8' }}>
          {l.text}
        </Text>
      ))}
    </>
  );
});

function Twinkles({ layers, phase, geo, t }: { layers: readonly PathLayer[]; phase: number; geo: CampSceneGeometry; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: TWINKLE[stepIndex(t.value, 2.8, 3, phase * 0.7)]! }));
  return (
    <Animated.View style={[fill, style]} pointerEvents="none">
      <Paths layers={layers} width={geo.width} height={geo.height} />
    </Animated.View>
  );
}

function Firelight({ geo, t }: { geo: CampSceneGeometry; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: stepIndex(t.value, 1.6, 2) === 0 ? 1 : 0.75 }));
  return (
    <Animated.View style={[fill, style]} pointerEvents="none">
      <Paths layers={geo.glow} width={geo.width} height={geo.height} />
    </Animated.View>
  );
}

function FlameFrame({ layers, second, box, t }: { layers: readonly PathLayer[]; second: boolean; box: Box; t: SharedValue<number> }) {
  // Swaps every 0.25 s.
  const style = useAnimatedStyle(() => ({ opacity: (stepIndex(t.value, 0.5, 2) === 1) === second ? 1 : 0 }));
  return (
    <Animated.View style={[fill, style]}>
      <Paths layers={layers} width={box.width} height={box.height} />
    </Animated.View>
  );
}

function Spark({ x, delay, t }: { x: number; delay: number; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const k = stepIndex(t.value, 2.4, 14, delay);
    return { opacity: k === 0 ? 0 : 1 - k / 14, transform: [{ translateY: -8 * k }] };
  });
  return <Animated.View testID={`camp-spark-${x}`} style={[{ position: 'absolute', left: x, top: 8, width: PX, height: PX, backgroundColor: '#FDBA74' }, style]} />;
}

/** The fire: lit at night once anyone is in bed on time (two flame frames and sparks), else the logs (and ash by day). */
const Fire = memo(function Fire({ geo, lit, t, still }: { geo: CampSceneGeometry; lit: boolean; t: SharedValue<number>; still: boolean }) {
  const box = geo.fire;
  return (
    <View testID={lit ? 'camp-fire-lit' : 'camp-fire-unlit'} accessible accessibilityRole="image"
      accessibilityLabel={lit ? 'The fire is lit' : 'The fire is out'}
      style={{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height }}>
      {lit ? (
        <>
          <FlameFrame layers={geo.flameA} second={false} box={box} t={t} />
          <FlameFrame layers={geo.flameB} second box={box} t={t} />
          {still ? null : geo.sparks.map((s) => <Spark key={s.x} x={s.x} delay={s.delay} t={t} />)}
        </>
      ) : null}
      <Paths layers={geo.logs} width={box.width} height={box.height} />
    </View>
  );
});

function Zz({ id, t }: { id: string; t: SharedValue<number> }) {
  const first = useAnimatedStyle(() => {
    const k = stepIndex(t.value, 2.2, 5);
    return { opacity: Z_OPACITY[k]!, transform: [{ translateX: 2 * k }, { translateY: -4 * k }] };
  });
  const second = useAnimatedStyle(() => {
    const k = stepIndex(t.value, 2.2, 5, 1.1);
    return { opacity: Z_OPACITY[k]!, transform: [{ translateX: 2 * k }, { translateY: -4 * k }] };
  });
  const z = { position: 'absolute', fontFamily: pixelFont(), color: ZZ } as const;
  return (
    <View testID={`camp-zz-${id}`} pointerEvents="none" style={{ position: 'absolute', right: 0, top: -14, width: 20, height: 20 }}>
      <Animated.Text style={[z, { left: 0, top: 8, fontSize: 10 }, first]}>z</Animated.Text>
      <Animated.Text style={[z, { left: 8, top: 0, fontSize: 8 }, second]}>z</Animated.Text>
    </View>
  );
}

/** A square cream bubble with a 2-px ink outline, a hard 4-px shadow and a 4-px tail: one truncated line. */
export function PixelBubble({ text, testID, maxWidth }: { text: string; testID?: string; maxWidth: number }) {
  return (
    <View style={{ maxWidth, paddingRight: PX, paddingBottom: PX }}>
      <View style={{ position: 'absolute', left: PX, top: PX, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
      <View style={{ backgroundColor: CREAM, borderWidth: 2, borderColor: INK, paddingHorizontal: 5, paddingVertical: 2 }}>
        <Text testID={testID} numberOfLines={1} style={{ fontFamily: pixelFont(), fontSize: 8, lineHeight: 10, letterSpacing: 0.5, color: INK }}>{text}</Text>
      </View>
      <View style={{ position: 'absolute', left: 8, bottom: 0, width: 8, height: 6, backgroundColor: CREAM, borderColor: INK, borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2 }} />
    </View>
  );
}

/** Mine, with no note: teal on dark teal, outlined. */
export function AddNoteBubble({ maxWidth, testID }: { maxWidth: number; testID?: string }) {
  return (
    <View style={{ maxWidth, backgroundColor: '#0F2E2A', borderWidth: 2, borderColor: '#2DD4BF', paddingHorizontal: 5, paddingVertical: 2 }}>
      <Text testID={testID} numberOfLines={1} style={{ fontFamily: pixelFont(), fontSize: 8, lineHeight: 10, color: '#5EEAD4' }}>+ ADD A NOTE</Text>
    </View>
  );
}

function Bob({ asleep, t, children }: { asleep: boolean; t: SharedValue<number>; children: React.ReactNode }) {
  // Asleep: down 4 px and back, on two frames.
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: asleep && stepIndex(t.value, 2.6, 2) === 1 ? PX : 0 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * One seat: the bubble (one line, never wider than the seat, so bubbles never cross), the person's KIP on a
 * two-tone log, and their name. PersonKip has no tint, so there is no firelit rim (noted in the redesign report).
 */
const SceneCoach = memo(function SceneCoach({ member, seat, night, t, onPress, myColour }: {
  member: CampMember; seat: Seat; night: boolean; t: SharedValue<number>; onPress: (member: CampMember) => void; myColour: string;
}) {
  const id = member.person.id;
  const name = personName(member.person, member.mine);
  const coachTop = BUBBLE_H + BUBBLE_GAP;
  const logW = seat.size + 2 * PX;
  return (
    <PressableScale testID={`camp-coach-${id}`} accessibilityRole="button"
      accessibilityLabel={member.mine ? 'You. Write your camp note' : `${name}, ${member.asleep ? 'asleep' : 'awake'}`}
      accessibilityHint={member.mine ? undefined : 'Opens their week'} onPress={() => onPress(member)}
      style={{ position: 'absolute', left: seat.left, top: seat.top, width: seat.width, height: seat.height }}>
      <View style={{ position: 'absolute', left: -4, right: -4, top: 0, height: BUBBLE_H, alignItems: 'center', justifyContent: 'flex-end' }}>
        {member.note ? <PixelBubble testID={`camp-bubble-${id}`} text={member.note} maxWidth={SEAT_W} />
          : member.mine ? <AddNoteBubble testID="camp-bubble-add" maxWidth={SEAT_W + 8} /> : null}
      </View>
      <View style={{ position: 'absolute', left: (SEAT_W - seat.size) / 2, top: coachTop, width: seat.size, height: seat.size }}>
        <Bob asleep={member.asleep} t={t}>
          <PersonKip colour={member.mine ? myColour : member.person.kipColour} state={member.asleep ? 'asleep' : 'none'} size={seat.size} />
        </Bob>
        {member.asleep ? <Zz id={id} t={t} /> : null}
      </View>
      <View style={{ position: 'absolute', left: (SEAT_W - logW) / 2, top: coachTop + seat.size, width: logW, height: LOG_H }}>
        <View style={{ height: PX, backgroundColor: '#7C4A26' }} />
        <View style={{ height: PX, backgroundColor: '#5B341A' }} />
      </View>
      <Text numberOfLines={1} style={{ position: 'absolute', left: -4, right: -4, top: coachTop + seat.size + LOG_H + 2, textAlign: 'center',
        fontFamily: pixelFont(), fontSize: 9, letterSpacing: 1, color: night ? '#E0E7FF' : '#FFFFFF' }}>
        {name.toUpperCase()}
      </Text>
    </PressableScale>
  );
});

export interface CampSceneProps {
  geo: CampSceneGeometry;
  /** Seated members, in seat order. */
  members: readonly CampMember[];
  lit: boolean;
  /** Reduce Motion or out of focus: one still frame. */
  still: boolean;
  onCoachPress: (member: CampMember) => void;
}

export const CampScene = memo(function CampScene({ geo, members, lit, still, onCoachPress }: CampSceneProps) {
  const t = useSceneClock(still);
  const myColour = useMyKipColour();
  return (
    <View testID={geo.night ? 'camp-scene-night' : 'camp-scene-day'}
      style={{ position: 'absolute', left: 0, top: 0, width: geo.width, height: geo.height + GROUND_OVERHANG, backgroundColor: geo.sky }}>
      <StaticBack geo={geo} />
      {geo.night ? geo.twinkles.map((layers, i) => <Twinkles key={i} layers={layers} phase={i} geo={geo} t={t} />) : null}
      {geo.moon ? (
        <View testID="camp-moon" accessible accessibilityRole="image" accessibilityLabel="The moon is up"
          style={{ position: 'absolute', left: geo.moon.left, top: geo.moon.top, width: geo.moon.width, height: geo.moon.height }} />
      ) : null}
      {lit ? <Firelight geo={geo} t={t} /> : null}
      <Paths layers={geo.front} width={geo.width} height={geo.height} />
      <Fire geo={geo} lit={lit} t={t} still={still} />
      {members.map((m, i) => (
        <SceneCoach key={m.person.id} member={m} seat={geo.seats[i]!} night={geo.night} t={t} onPress={onCoachPress} myColour={myColour} />
      ))}
    </View>
  );
});
