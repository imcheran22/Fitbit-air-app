import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { KIP_GRID, kipArt, type KipColour, type KipMood, type KipPose } from '../../lib/kip/kipArt';

// Draws KIP from its rect list (prep, not wired in). Decorative: the screen around it carries the meaning.
// react-native-svg has no shapeRendering, so the scale is a whole number of points per cell to keep edges crisp.
export function Kip({ colour, pose, mood, scale = 4, testID }: {
  colour?: KipColour; pose?: KipPose; mood?: KipMood; scale?: number; testID?: string;
}) {
  const size = KIP_GRID * Math.max(1, Math.floor(scale));
  const art = kipArt({ colour, pose, mood });
  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${KIP_GRID} ${KIP_GRID}`}>
        {art.map((p, i) => (
          <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
        ))}
      </Svg>
    </View>
  );
}
