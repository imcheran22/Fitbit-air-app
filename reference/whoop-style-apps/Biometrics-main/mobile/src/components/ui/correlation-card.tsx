import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './text';
import { Card } from './card';
import { Badge } from './badge';
import { SectionLabel } from './section-label';
import { COLORS } from '../../theme';
import { withAlpha } from '../../lib/utils';
import {
  alignSeries,
  buildComparisonSentence,
  buildPatternSentence,
  buildSampleCaveat,
  factorPhrase,
  formatNumber,
  isSmallSample,
  lagPhrase,
  type AlignedPoint,
} from '../../lib/patternSentence';
import type { PatternDTO } from '../../api/habits';

// Same internal-coordinate-space approach as trend-line.tsx: the viewBox scales
// to whatever width the card ends up with, so no layout measuring is needed.
const VIEWBOX_WIDTH = 300;
const LINE_HEIGHT = 44;
const TICK_TOP = 50;
const HEIGHT = 58;

function humanize(habitType: string): string {
  const words = habitType.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// The factor line, one point per habit day showing the reading `lag` days after
// it (already applied by the server); gaps in the data break the line.
function linePath(points: AlignedPoint[]): string | null {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const stepX = VIEWBOX_WIDTH / Math.max(points.length - 1, 1);

  const commands: string[] = [];
  let segmentLength = 0;
  let lastX = 0;
  let lastY = 0;
  points.forEach((point, i) => {
    if (point.value === null) {
      // An isolated reading has no line to draw; a zero-length segment with
      // round caps renders it as a dot instead.
      if (segmentLength === 1) commands.push(`L ${lastX.toFixed(2)} ${lastY.toFixed(2)}`);
      segmentLength = 0;
      return;
    }
    lastX = i * stepX;
    lastY = LINE_HEIGHT - ((point.value - min) / range) * LINE_HEIGHT;
    commands.push(`${segmentLength === 0 ? 'M' : 'L'} ${lastX.toFixed(2)} ${lastY.toFixed(2)}`);
    segmentLength += 1;
  });
  if (segmentLength === 1) commands.push(`L ${lastX.toFixed(2)} ${lastY.toFixed(2)}`);
  return commands.join(' ');
}

function PatternSparkline({ points, lineColor, exposedColor, restColor }: { points: AlignedPoint[]; lineColor: string; exposedColor: string; restColor: string }) {
  const path = linePath(points);
  if (!path) return null;
  const stepX = VIEWBOX_WIDTH / Math.max(points.length - 1, 1);

  return (
    <View testID="pattern-sparkline">
      <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${VIEWBOX_WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        <Path d={path} stroke={lineColor} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, i) => (
          <Rect
            key={point.day}
            x={Math.min(Math.max(i * stepX - 1.5, 0), VIEWBOX_WIDTH - 3)}
            y={point.exposed ? TICK_TOP : TICK_TOP + 5}
            width={3}
            height={point.exposed ? 8 : 3}
            rx={1.5}
            fill={point.exposed ? exposedColor : restColor}
          />
        ))}
      </Svg>
    </View>
  );
}

interface CorrelationCardProps {
  pattern: PatternDTO;
  // The habit's display name; falls back to a humanised habitType.
  habitLabel?: string;
}

// One confirmed pattern. The sentence is built only from the structured fields
// (see lib/patternSentence.ts); the sample-size caveat is a persistent line, not
// a footnote, and a small sample gets an extra hint.
export function CorrelationCard({ pattern, habitLabel }: CorrelationCardProps) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const points = alignSeries(pattern.series);
  const factor = factorPhrase(pattern.factor, pattern.factorLabel);

  const lower = pattern.direction === 'lower';

  return (
    <Card testID={`correlation-card-${pattern.habitType}-${pattern.factor}-${pattern.lagDays}`} className="gap-4 p-5">
      <View className="flex-row items-center justify-between gap-2">
        <SectionLabel className="flex-1">{habitLabel ?? humanize(pattern.habitType)}</SectionLabel>
        <Badge testID="pattern-direction" variant="muted">
          {lower ? 'Lower than on other days' : 'Higher than on other days'}
        </Badge>
      </View>

      {/* The effect size, straight from the server's structured field -- the
          same number the sentence below states, just set as the headline. */}
      <View className="flex-row items-end gap-2">
        <Ionicons name={lower ? 'arrow-down' : 'arrow-up'} size={22} color={colors.muted} style={{ marginBottom: 5 }} />
        <Text className="text-display tabular-nums">
          {`${formatNumber(Math.abs(pattern.effectSizePercent))}%`}
        </Text>
        <Text className="mb-1 flex-1 text-caption text-muted-foreground" numberOfLines={1}>
          {`${factor} · ${lagPhrase(pattern.lagDays).toLowerCase()}`}
        </Text>
      </View>

      <Text testID="pattern-sentence" className="text-body">
        {buildPatternSentence(pattern)}
      </Text>

      {points.length > 0 ? (
        <View className="gap-2">
          {/* Neutral line, accent only on the days that matter (the habit days). */}
          <PatternSparkline points={points} lineColor={withAlpha(colors.muted, 0.6)} exposedColor={colors.accent} restColor={colors.border} />
          <Text testID="pattern-sparkline-caption" className="text-caption text-muted-foreground">
            {`Line: your ${factor} ${lagPhrase(pattern.lagDays).toLowerCase()} each day. Tall ticks: days you logged ${formatNumber(pattern.exposureThreshold)}+ ${pattern.exposureUnit}.`}
          </Text>
        </View>
      ) : null}

      <View className="gap-2 border-t border-border pt-4">
        <Text className="text-caption text-muted-foreground">{buildComparisonSentence(pattern)}</Text>
        <View className="flex-row items-start gap-2">
          <Ionicons name="information-circle-outline" size={15} color={colors.muted} style={{ marginTop: 1 }} />
          <View className="flex-1 gap-1">
            <Text testID="pattern-caveat" className="text-caption text-muted-foreground">
              {buildSampleCaveat(pattern.sampleSize)}
            </Text>
            {isSmallSample(pattern.sampleSize) ? (
              <Text testID="pattern-small-sample" className="text-caption font-medium text-score-fair">
                Small sample: treat this as tentative until more days are logged.
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}
