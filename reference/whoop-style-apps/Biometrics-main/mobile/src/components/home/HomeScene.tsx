import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { BuddyScene } from '../../api/buddies';
import {
  at, clampTagLeft, kipBox, layGround, layObjects, layRain, laySky, layWeather, pxPaths, sceneBackdrop, sceneOffsetX,
  SCENE_H, SCENE_SPOTS, SCENE_W, STATES, U, type SceneState,
} from '../../lib/home/scene';
import { HOME_COPY, sceneName } from '../../lib/homeCopy';
import type { KipColour } from '../../lib/kip/kipArt';
import { kipColourOf } from '../../lib/kip/kipColour';
import type { WeatherKey } from '../../lib/recoveryCopy';
import type { ScoreBand } from '../../lib/scoreInsights';
import { COLORS } from '../../theme';
import { Kip } from '../kip/Kip';
import { PERSON_POSE, personStateOf } from '../kip/PersonKip';
import { Text } from '../ui/text';

// Home F's scene (spec 2026-10-13 Home F §2–§4): the board drawn at 3 points a cell, cropped on narrow phones and
// widened with flat bands on wide ones. Back to front: the backdrop, the grid's four layers, the KIPs, the rain,
// the header, then the tags. The art is hidden from screen readers; the tags carry the meaning. It keeps its colours in both
// themes, so the band colours come from the dark palette.

export type SceneTarget = 'sleep' | 'tomorrow' | 'recovery' | 'recaps' | 'buddies';

export interface SceneReadings {
  sleep: { score: number | null; duration: string | null };
  tomorrow: { low: number; high: number } | null;
  recovery: { score: number; weather: WeatherKey; band: ScoreBand } | null;
  recapsNew: number;
}

export interface HomeSceneProps {
  scene: SceneState;
  /** The screen width in points. */
  width: number;
  /** Extra sky above the grid (sceneExtra). */
  extra: number;
  myColour: KipColour;
  /** null while loading, after a failed read and on an older server: only you. */
  buddies: BuddyScene | null;
  readings: SceneReadings;
  onOpen: (target: SceneTarget) => void;
  onOpenBuddy: (buddyId: string) => void;
  /** Drawn over the art and ahead of the tags, so a screen reader reads it first. */
  header?: React.ReactNode;
}

const C = HOME_COPY;
const PALETTE = COLORS.dark;
const INK = '#F5F5F4';
const NAME_INK = 'rgba(245,245,244,0.9)';
const KEY = { sleep: '#C4B5FD', tomorrow: '#C7D2FE', recaps: '#FB7185', all: '#C7D2FE' } as const;
const EDGE = 4;
// The name tags and "ALL n →" are rows apart by less than two full slops: 4 each between them keeps the areas apart.
const NAME_SLOP = { top: 8, bottom: 4, left: 8, right: 8 } as const;
const ALL_SLOP = { top: 4, bottom: 8, left: 8, right: 8 } as const;
const HIDE = { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

function Paths({ paths }: { paths: { fill: string; d: string }[] }) {
  return (
    <>
      {paths.map((p, i) => (
        <Path key={i} d={p.d} fill={p.fill} />
      ))}
    </>
  );
}

function HotTag({ testID, left, top, screenWidth, keyText, keyColour, value, label, onPress }: {
  testID: string; left: number; top: number; screenWidth: number; keyText: string; keyColour: string;
  value: string | null; label: string; onPress: () => void;
}) {
  const [width, setWidth] = useState(0);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      className="flex-row items-center rounded-lg border active:opacity-80"
      style={{
        position: 'absolute', left: clampTagLeft(left, width, screenWidth), top, height: 26, gap: 5, paddingHorizontal: 7,
        backgroundColor: 'rgba(10,11,14,0.82)', borderColor: 'rgba(255,255,255,0.18)',
      }}
    >
      <View style={{ width: 4, height: 4, backgroundColor: keyColour }} />
      <Text className="font-pixel text-label" style={{ color: keyColour }}>{keyText}</Text>
      {value !== null ? <Text className="text-caption font-semibold tabular-nums" style={{ color: INK }}>{value}</Text> : null}
    </Pressable>
  );
}

export function HomeScene({ scene, width, extra, myColour, buddies, readings, onOpen, onOpenBuddy, header }: HomeSceneProps) {
  const look = STATES[scene.key];
  const offsetX = sceneOffsetX(width);
  const backdrop = useMemo(() => pxPaths(sceneBackdrop(scene.key, width, extra, offsetX), 1), [scene.key, width, extra, offsetX]);
  // One path per colour per layer: grouping across layers would paint a later layer's colour under an earlier one.
  const grid = useMemo(() => [laySky(look), layWeather(look), layGround(look), layObjects(look)].flatMap((layer) => pxPaths(layer, U)), [look]);
  const rain = useMemo(() => pxPaths(layRain(look), U), [look]);

  const night = scene.key === 'night';
  const me = kipBox(SCENE_SPOTS.me.cx, SCENE_SPOTS.me.scale, offsetX, extra);
  const shown = (buddies?.buddies ?? []).slice(0, SCENE_SPOTS.buddies.length);
  const tag = (spot: { left: number; top: number }) => at(spot, offsetX, extra);
  const { sleep, tomorrow, recovery, recapsNew } = readings;
  const requests = buddies?.incomingRequests ?? 0;
  const total = buddies?.total ?? 0;
  const allText = requests > 0 ? C.buddies.requests(requests) : total > 0 ? C.buddies.all(total) : null;

  return (
    <View testID="home-scene" style={{ width, height: SCENE_H + extra }}>
      <View testID="home-scene-art" {...HIDE} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height: SCENE_H + extra }}>
        <Svg width={width} height={SCENE_H + extra} style={{ position: 'absolute', left: 0, top: 0 }}>
          <Paths paths={backdrop} />
        </Svg>
        <Svg width={SCENE_W} height={SCENE_H} style={{ position: 'absolute', left: offsetX, top: extra }}>
          <Paths paths={grid} />
        </Svg>
        <View testID="home-scene-me-spot" style={{ position: 'absolute', left: me.left, top: me.top }}>
          <Kip testID="home-scene-me" colour={myColour} pose={scene.pose} mood={scene.mood} scale={SCENE_SPOTS.me.scale} />
        </View>
        {shown.map((b, i) => {
          const spot = SCENE_SPOTS.buddies[i]!;
          const box = kipBox(spot.cx, spot.scale, offsetX, extra);
          const { pose, mood } = PERSON_POSE[personStateOf(b.mood, night)];
          return (
            <View key={b.id} style={{ position: 'absolute', left: box.left, top: box.top }}>
              <Kip testID={`home-scene-buddy-${b.id}`} colour={kipColourOf(b.kipColour)} pose={pose} mood={mood} scale={spot.scale} />
            </View>
          );
        })}
      </View>
      {rain.length > 0 ? (
        <View testID="home-scene-rain" {...HIDE} pointerEvents="none" style={{ position: 'absolute', left: offsetX, top: extra, width: SCENE_W, height: SCENE_H }}>
          <Svg width={SCENE_W} height={SCENE_H}>
            <Paths paths={rain} />
          </Svg>
        </View>
      ) : null}
      {header}

      <HotTag
        testID="home-tag-sleep"
        {...tag(SCENE_SPOTS.tags.sleep)}
        screenWidth={width}
        keyText={C.tags.sleep}
        keyColour={KEY.sleep}
        value={sleep.score === null ? C.none : String(sleep.score)}
        label={C.tags.sleepLabel(sleep.score, sleep.duration)}
        onPress={() => onOpen('sleep')}
      />
      <HotTag
        testID="home-tag-tomorrow"
        {...tag(SCENE_SPOTS.tags.tomorrow)}
        screenWidth={width}
        keyText={C.tags.tomorrow}
        keyColour={KEY.tomorrow}
        value={tomorrow ? C.tags.range(tomorrow.low, tomorrow.high) : C.none}
        label={C.tags.tomorrowLabel(tomorrow)}
        onPress={() => onOpen('tomorrow')}
      />
      <HotTag
        testID="home-tag-recovery"
        {...tag(SCENE_SPOTS.tags.recovery)}
        screenWidth={width}
        keyText={C.tags.recovery}
        keyColour={recovery ? PALETTE[recovery.band] : PALETTE.muted}
        value={recovery ? String(recovery.score) : C.none}
        label={C.tags.recoveryLabel(recovery)}
        onPress={() => onOpen('recovery')}
      />
      <HotTag
        testID="home-tag-recaps"
        {...tag(SCENE_SPOTS.tags.recaps)}
        screenWidth={width}
        keyText={C.tags.recaps}
        keyColour={KEY.recaps}
        value={recapsNew > 0 ? String(recapsNew) : null}
        label={C.tags.recapsLabel(recapsNew)}
        onPress={() => onOpen('recaps')}
      />

      {shown.map((b, i) => (
        <Pressable
          key={b.id}
          testID={`home-buddy-${b.id}`}
          accessibilityRole="button"
          accessibilityLabel={C.buddies.label(b.displayName, b.moodLine)}
          onPress={() => onOpenBuddy(b.id)}
          hitSlop={NAME_SLOP}
          className="items-center active:opacity-70"
          style={{ position: 'absolute', left: offsetX + SCENE_SPOTS.buddies[i]!.cx - SCENE_SPOTS.nameWidth / 2, top: extra + SCENE_SPOTS.nameTop, width: SCENE_SPOTS.nameWidth }}
        >
          <Text className="font-pixel text-label" numberOfLines={1} style={{ color: NAME_INK }}>{sceneName(b.displayName)}</Text>
        </Pressable>
      ))}
      {allText ? (
        <Pressable
          testID="home-scene-all"
          accessibilityRole="button"
          accessibilityLabel={requests > 0 ? C.buddies.requestsLabel(requests) : C.buddies.allLabel(total)}
          onPress={() => onOpen('buddies')}
          hitSlop={ALL_SLOP}
          className="active:opacity-70"
          style={{ position: 'absolute', right: Math.max(EDGE, width - (offsetX + SCENE_SPOTS.all.right)), top: extra + SCENE_SPOTS.all.top }}
        >
          <Text className="font-pixel text-label" style={{ color: KEY.all }}>{allText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
