import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { KIP_COLOURS, type KipColour } from '../../lib/kip/kipArt';
import { KIP_COLOUR_ORDER, kipColourName } from '../../lib/kip/kipColour';
import { loadMyKipColour, myKipColourLoadFailed, saveMyKipColour, useMyKipColour } from '../../lib/kip/myKipColour';
import { PROFILE_COPY } from '../../lib/profileCopy';
import type { PixelRect } from '../../lib/weatherArt';
import { Kip } from '../kip/Kip';
import { Button } from '../ui/button';
import { SectionLabel } from '../ui/section-label';
import { Text } from '../ui/text';

// The KIP colour page (Picker board, spec 2026-10-13 KIP colour §3): a preview on a small scene, 10 swatches,
// Reset and Save. Nothing changes anywhere until Save succeeds.

const C = PROFILE_COPY.kipColour;
const PREVIEW_W = 119;
const PREVIEW_H = 64;
const PREVIEW_GROUND = 52;
const UNIT = 3;
const HERO_SCALE = 6;
const KIP_CELLS = 16;

// The board's preview scene, `cols` cells wide: a dithered dawn sky, a sun kept as far from the right edge as on
// the board, and grass. The cell stays a whole number of points, so the scene widens rather than scales.
function previewScene(cols: number): PixelRect[] {
  const sky = ['#15233D', '#1A2B49', '#203456', '#273E63'];
  const band = Math.floor(PREVIEW_GROUND / 4);
  const sunShift = cols - PREVIEW_W;
  const r: PixelRect[] = [];
  sky.forEach((fill, i) => {
    const y = i * band;
    r.push({ x: 0, y, w: cols, h: i === 3 ? PREVIEW_GROUND - y : band, fill });
    if (i > 0) for (let x = i % 2; x < cols; x += 2) r.push({ x, y, w: 1, h: 1, fill: sky[i - 1]! });
  });
  for (const [x, y, w, h, fill] of [[103, 6, 6, 1, '#FDE68A'], [101, 7, 10, 1, '#FCD34D'], [100, 8, 12, 7, '#FBBF24'], [101, 15, 10, 1, '#F59E0B'], [103, 16, 6, 1, '#F59E0B']] as const) {
    r.push({ x: x + sunShift, y, w, h, fill });
  }
  const g = ['#4A8A5C', '#3A7049', '#2D5A3A'];
  r.push({ x: 0, y: PREVIEW_GROUND, w: cols, h: 1, fill: g[0]! }, { x: 0, y: PREVIEW_GROUND + 1, w: cols, h: 2, fill: g[1]! }, { x: 0, y: PREVIEW_GROUND + 3, w: cols, h: PREVIEW_H - PREVIEW_GROUND - 3, fill: g[2]! });
  for (let x = 4; x < cols; x += 13) r.push({ x, y: PREVIEW_GROUND - 1, w: 1, h: 1, fill: g[0]! }, { x: x + 2, y: PREVIEW_GROUND - 1, w: 1, h: 1, fill: g[0]! });
  return r;
}

export function KipColourSection() {
  const saved = useMyKipColour();
  // null until you pick, so a colour that loads after the page opens still shows.
  const [choice, setChoice] = useState<KipColour | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The board's width until the card is measured.
  const [width, setWidth] = useState(PREVIEW_W * UNIT);
  const cols = Math.ceil(width / UNIT);
  const scene = useMemo(() => previewScene(cols), [cols]);
  const picked = choice ?? saved;
  const name = kipColourName(picked);

  // Coral is only your saved colour if the read worked.
  useEffect(() => {
    if (myKipColourLoadFailed()) void loadMyKipColour();
  }, []);

  async function save() {
    setBusy(true);
    setFailed(false);
    try {
      await saveMyKipColour(picked);
      setChoice(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View testID="kip-colour-section" className="gap-[16px]">
      <View
        testID="kip-colour-preview"
        className="overflow-hidden rounded-card border border-border"
        style={{ height: PREVIEW_H * UNIT }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <View testID="kip-colour-scene" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0 }}>
          <Svg width={cols * UNIT} height={PREVIEW_H * UNIT} viewBox={`0 0 ${cols} ${PREVIEW_H}`}>
            {scene.map((p, i) => (
              <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
            ))}
          </Svg>
        </View>
        <View
          testID="kip-colour-hero"
          accessible
          accessibilityRole="image"
          accessibilityLabel={C.previewLabel(name)}
          style={{ position: 'absolute', left: Math.round(width / 2 - (KIP_CELLS / 2) * HERO_SCALE), top: PREVIEW_GROUND * UNIT - 15 * HERO_SCALE }}
        >
          <Kip colour={picked} pose="wave" scale={HERO_SCALE} />
        </View>
        <View className="absolute left-[14px] top-[12px] gap-[2px]">
          <SectionLabel className="text-[#C7D2FE]">{C.yourKip}</SectionLabel>
          <Text className="text-headline font-semibold text-[#F5F5F4]">{C.picked(name, KIP_COLOURS[picked])}</Text>
        </View>
      </View>

      <View className="gap-[10px]">
        <View className="flex-row items-baseline justify-between">
          <SectionLabel>{C.colour}</SectionLabel>
          <Text className="text-fine text-muted-foreground">{C.buddiesSee}</Text>
        </View>
        <View
          testID="kip-colour-swatches"
          accessibilityRole="radiogroup"
          accessibilityLabel={C.groupLabel}
          className="flex-row flex-wrap justify-between gap-y-[10px]"
        >
          {KIP_COLOUR_ORDER.map((c) => {
            const on = c === picked;
            return (
              <View key={c} className="w-[18%] items-center gap-[4px]">
                <Button
                  testID={`kip-swatch-${c}`}
                  accessibilityRole="radio"
                  accessibilityLabel={kipColourName(c)}
                  accessibilityState={{ checked: on }}
                  variant={on ? 'default' : 'outline'}
                  className="h-[56px] w-full px-0"
                  onPress={() => {
                    setChoice(c);
                    setFailed(false);
                  }}
                >
                  <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: KIP_COLOURS[c], borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' }} />
                </Button>
                <Text className={on ? 'text-fine text-foreground' : 'text-fine text-muted-foreground'}>{kipColourName(c)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View className="flex-row gap-[8px]">
        <Button
          testID="kip-colour-reset"
          variant="outline"
          className="h-[44px] flex-1"
          onPress={() => {
            setChoice('coral');
            setFailed(false);
          }}
        >
          {C.reset}
        </Button>
        <Button testID="kip-colour-save" className="h-[44px] flex-1" disabled={picked === saved || busy} loading={busy} onPress={save}>
          {C.save}
        </Button>
      </View>
      {failed ? (
        <View testID="kip-colour-error" accessibilityLiveRegion="polite" className="flex-row items-center justify-between gap-3">
          <Text className="text-caption text-destructive">{C.failed}</Text>
          <Button testID="kip-colour-retry" variant="ghost" size="sm" onPress={save}>
            {C.retry}
          </Button>
        </View>
      ) : null}
    </View>
  );
}
