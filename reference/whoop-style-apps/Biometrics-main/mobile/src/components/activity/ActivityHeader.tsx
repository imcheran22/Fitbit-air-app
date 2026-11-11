// Activity's header (A-2): the pixel sky strip with KIP waving, the page title and the week's summary line.

import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { ACTIVITY_COPY } from '../../lib/activityCopy';
import { SKY_STRIP_HEIGHT, skyStrip } from '../../lib/activityWeek';
import { useMyKipColour } from '../../lib/kip/myKipColour';
import { Kip } from '../kip/Kip';
import { PageTitle } from '../ui/page-title';
import { Text } from '../ui/text';

// Two points per cell, so the strip is 84 tall and its edges stay crisp.
const CELL = 2;

export function ActivityHeader({ summary }: { summary: { steps: number; nights: number } | null }) {
  const kipColour = useMyKipColour();
  const [width, setWidth] = useState(0);
  const cols = Math.floor(width / CELL);
  return (
    <View
      testID="activity-header"
      className="overflow-hidden rounded-card border border-border"
      style={{ height: SKY_STRIP_HEIGHT * CELL }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {cols > 0 ? (
        <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 0, top: 0 }}>
          <Svg width={cols * CELL} height={SKY_STRIP_HEIGHT * CELL} viewBox={`0 0 ${cols} ${SKY_STRIP_HEIGHT}`}>
            {skyStrip(cols).map((p, i) => (
              <Rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
            ))}
          </Svg>
        </View>
      ) : null}
      <View className="absolute left-4" style={{ top: 18 }}>
        <Kip testID="activity-kip" colour={kipColour} pose="wave" scale={3} />
      </View>
      <View className="absolute gap-0.5" style={{ left: 76, top: 14, right: 12 }}>
        <PageTitle testID="activity-title" className="text-white">
          {ACTIVITY_COPY.title}
        </PageTitle>
        {summary ? (
          <Text testID="activity-summary" className="text-caption text-white tabular-nums" numberOfLines={1} adjustsFontSizeToFit>
            {ACTIVITY_COPY.summary(summary)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
