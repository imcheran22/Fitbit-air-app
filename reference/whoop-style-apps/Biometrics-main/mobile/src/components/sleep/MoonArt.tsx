import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { MOON_ART, MOON_GRID } from '../../lib/moonArt';

// react-native-svg has no shapeRendering (see WeatherIcon), so cells land on whole points to stay crisp: 5 pt per cell
// (25x20 -> 125x100) rather than the board's 4.8 (plan ruling 13).
export const MOON_CELL = 5;

// Decorative: the verdict text carries the meaning (spec §3.2, §7).
export function MoonArt({ dim = false, testID }: { dim?: boolean; testID?: string }) {
  const width = MOON_GRID.w * MOON_CELL;
  const height = MOON_GRID.h * MOON_CELL;
  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, opacity: dim ? 0.4 : 1 }}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${MOON_GRID.w} ${MOON_GRID.h}`}>
        {MOON_ART.map((p, i) => (
          <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
        ))}
      </Svg>
    </View>
  );
}
