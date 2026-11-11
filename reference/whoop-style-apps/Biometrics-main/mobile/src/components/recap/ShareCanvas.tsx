import React, { useId } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import type { RecapTint } from '../../lib/recapTheme';

export interface ShareCanvasProps {
  tint: RecapTint;
  /** Laid-out size in points (design size × scale). */
  width: number;
  height: number;
  /** Dot pitch and radius in points; no dots when dotSpacing is 0. */
  dotSpacing: number;
  dotRadius: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
}

/**
 * The ground of every recap share image (recap restyle): the coach's dark ground with a dot
 * pattern of its accent behind the content. Drawn with react-native-svg so the off-screen Skia
 * capture (makeImageFromView) sees it like any other view.
 */
export function ShareCanvas({ tint, width, height, dotSpacing, dotRadius, style, testID, children }: ShareCanvasProps) {
  // Preview and export are mounted together: each pattern needs its own id.
  const id = `dots${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View testID={testID} collapsable={false} style={[{ width, height, backgroundColor: tint.ground, overflow: 'hidden' }, style]}>
      {dotSpacing > 0 ? (
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0, width, height }}>
          <Svg testID={testID ? `${testID}-dots` : undefined} width={width} height={height}>
            <Defs>
              <Pattern id={id} patternUnits="userSpaceOnUse" x={0} y={0} width={dotSpacing} height={dotSpacing}>
                <Circle cx={dotSpacing / 2} cy={dotSpacing / 2} r={dotRadius} fill={tint.dot} />
              </Pattern>
            </Defs>
            <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
          </Svg>
        </View>
      ) : null}
      {children}
    </View>
  );
}
