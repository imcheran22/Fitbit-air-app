// Profile's passport (board ID-2, spec 2026-10-13 §2): a coral band with the member number, KIP on a pixel
// sky, the name / handle / home / joined fields, the check-in streak and buddy count, badge stamps with Edit,
// and two decorative machine-readable lines. An unwatched recap rings the photo, and the photo then plays it.

import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import type { AchievementFamily } from '../../api/achievements';
import { KIP_COLOURS } from '../../lib/kip/kipArt';
import { useMyKipColour } from '../../lib/kip/myKipColour';
import { badgeLabel } from '../../lib/badges';
import { formatJoined, mrzLines, type Stamp } from '../../lib/passport';
import { BACKDROP_H, BACKDROP_W, passportBackdrop } from '../../lib/profileArt';
import { PROFILE_COPY } from '../../lib/profileCopy';
import { COLORS } from '../../theme';
import { BadgeIcon } from '../achievements/BadgeIcon';
import { Kip } from '../kip/Kip';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { PressableScale } from '../ui/pressable-scale';
import { Text } from '../ui/text';

const COPY = PROFILE_COPY.passport;
const COLOUR = KIP_COLOURS.coral;
const INK = '#0A0B0E';
// The photo: 2 pt per backdrop cell inside a 2 pt frame; KIP at 5 pt per cell, standing on the grass.
const CELL = 2;
const FRAME = 2;
const PHOTO_W = BACKDROP_W * CELL + FRAME * 2;
const PHOTO_H = BACKDROP_H * CELL + FRAME * 2;
const KIP_SCALE = 5;
const BACKDROP = passportBackdrop();

export interface PassportProps {
  code: string;
  name: string | null;
  handle: string | null;
  home: string | null;
  joinedOn: string | null;
  checkInStreak: number | null;
  buddyCount: number | null;
  stamps: Stamp[];
  /** An unwatched recap: the photo wears its ring colour and plays it. */
  recap: { color: string; hint: string; onPlay: () => void } | null;
  onEdit: () => void;
  onOpenStamp: (family: AchievementFamily) => void;
}

function Field({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text className="text-label text-muted-foreground">{label}</Text>
      <Text testID={testID} className="text-body font-semibold" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function Photo({ recap, surface }: { recap: PassportProps['recap']; surface: string }) {
  const kipColour = useMyKipColour();
  const frame = recap?.color ?? COLOUR;
  const art = (
    <View testID="passport-photo" style={{ width: PHOTO_W, height: PHOTO_H, borderWidth: FRAME, borderColor: frame, overflow: 'hidden' }}>
      <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
        <Svg width={BACKDROP_W * CELL} height={BACKDROP_H * CELL} viewBox={`0 0 ${BACKDROP_W} ${BACKDROP_H}`}>
          {BACKDROP.map((p, i) => (
            <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
          ))}
        </Svg>
        <View style={{ position: 'absolute', left: 12, top: 35 }}>
          <Kip testID="passport-kip" colour={kipColour} pose="rest" scale={KIP_SCALE} />
        </View>
      </View>
      {recap ? (
        <View
          testID="passport-recap-dot"
          pointerEvents="none"
          style={{ position: 'absolute', top: 4, right: 4, width: 12, height: 12, backgroundColor: recap.color, borderWidth: 2, borderColor: surface }}
        />
      ) : null}
    </View>
  );
  if (!recap) return art;
  return (
    <PressableScale testID="passport-recap" accessibilityRole="button" accessibilityLabel={COPY.recapLabel(recap.hint)} onPress={recap.onPlay}>
      {art}
    </PressableScale>
  );
}

export function Passport(p: PassportProps) {
  const { colorScheme } = useColorScheme();
  const palette = colorScheme === 'light' ? COLORS.light : COLORS.dark;
  const none = COPY.none;
  const [lineOne, lineTwo] = mrzLines({ name: p.name ?? '', code: p.code, joinedOn: p.joinedOn, home: p.home ?? '' });
  return (
    <Card testID="passport" className="gap-0 overflow-hidden p-0">
      <View className="h-7 flex-row items-center justify-between px-3" style={{ backgroundColor: COLOUR }}>
        <Text className="text-label" style={{ color: INK }}>
          {COPY.heading}
        </Text>
        <Text testID="passport-number" className="text-fine tabular-nums" style={{ color: INK }}>
          {COPY.number(p.code)}
        </Text>
      </View>

      <View className="flex-row gap-3.5 p-3.5">
        <Photo recap={p.recap} surface={palette.card} />
        <View className="min-w-0 flex-1 justify-between gap-1.5">
          <Field testID="passport-name" label={COPY.fields.name} value={p.name ?? none} />
          <Field testID="passport-handle" label={COPY.fields.handle} value={p.handle ? COPY.handle(p.handle) : none} />
          <Field testID="passport-home" label={COPY.fields.home} value={p.home ?? none} />
          <Field testID="passport-joined" label={COPY.fields.joined} value={p.joinedOn ? formatJoined(p.joinedOn) : none} />
        </View>
      </View>

      <View className="flex-row gap-3.5 px-3.5 pb-3">
        <Field testID="passport-streak" label={COPY.fields.streak} value={p.checkInStreak === null ? none : COPY.streak(p.checkInStreak)} />
        <Field testID="passport-buddies" label={COPY.fields.buddies} value={p.buddyCount === null ? none : COPY.buddies(p.buddyCount)} />
      </View>

      <View className="gap-2 px-3.5 pb-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-label text-muted-foreground">{COPY.stamps}</Text>
          <Button testID="passport-edit" variant="outline" size="sm" accessibilityLabel={COPY.editLabel} onPress={p.onEdit}>
            {COPY.edit}
          </Button>
        </View>
        {p.stamps.length > 0 ? (
          <View testID="passport-stamps" className="flex-row flex-wrap gap-2">
            {p.stamps.map((s, i) => (
              <PressableScale
                key={s.family}
                testID={`passport-stamp-${s.family}`}
                accessibilityRole="button"
                accessibilityLabel={COPY.stampLabel(badgeLabel(s.family, s.level))}
                onPress={() => p.onOpenStamp(s.family)}
                className="h-[58px] w-[58px] items-center justify-center gap-0.5 border-2 border-dashed border-border"
                style={{ marginTop: [0, 6, 2, 8, 3][i] }}
              >
                <BadgeIcon family={s.family} level={s.level} size={30} pips={false} testID={`passport-stamp-${s.family}-icon`} />
                <Text className="font-pixel text-fine" numberOfLines={1} adjustsFontSizeToFit>
                  {s.short}
                </Text>
              </PressableScale>
            ))}
          </View>
        ) : (
          <Text testID="passport-no-stamps" className="text-caption text-muted-foreground">
            {COPY.noStamps}
          </Text>
        )}
        <View testID="passport-mrz" accessible={false} importantForAccessibility="no-hide-descendants" className="gap-0.5 border-t border-dashed border-border pt-2">
          <Text className="text-fine tracking-widest text-muted-foreground" numberOfLines={1} adjustsFontSizeToFit>
            {lineOne}
          </Text>
          <Text className="text-fine tracking-widest text-muted-foreground" numberOfLines={1} adjustsFontSizeToFit>
            {lineTwo}
          </Text>
        </View>
      </View>
    </Card>
  );
}
