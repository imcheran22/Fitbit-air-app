import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

// An internal coordinate space the viewBox scales to the real container
// width, so the chart stretches to fill its parent without needing to
// measure layout.
const VIEWBOX_WIDTH = 300;

interface TrendLineProps {
  data: number[];
  color: string;
  height?: number;
}

export function TrendLine({ data, color, height = 72 }: TrendLineProps) {
  if (data.length < 2) {
    return <View style={{ height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = VIEWBOX_WIDTH / (data.length - 1);

  const points = data.map((value, i) => ({
    x: i * stepX,
    y: height - ((value - min) / range) * height,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${VIEWBOX_WIDTH} ${height} L 0 ${height} Z`;
  const gradientId = `trend-${color.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.25} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill={`url(#${gradientId})`} />
      <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
