import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useColorScheme } from 'nativewind';
import { Ring } from './ring';
import { CountUp } from './count-up';
import { Text } from './text';
import { SectionLabel } from './section-label';
import { COLORS, MOTION } from '../../theme';
import { scoreBand } from '../../lib/scoreInsights';
import { pointsByFactor, staggerDelays } from '../../lib/scoreMotion';
import type { FactorDTO, ScoreBandsDTO } from '../../api/scores';

// See count-up.tsx: Jest has no real frame clock, so skip straight to the
// final geometry there. Production keeps the animation.
const isTestEnv = typeof process !== 'undefined' && !!process.env.JEST_WORKER_ID;

// A factor whose share would be thinner than this is drawn at this share
// instead, so a single dominant factor can't make the others vanish.
const MIN_SEGMENT_SHARE = 0.08;
const SEGMENT_GAP = 2;

export interface ArcSegment {
  factor: FactorDTO['factor'];
  tone: 'helped' | 'hurt';
  // Both in circumference units, measured from the start of the ring.
  start: number;
  length: number;
}

// Pure geometry for the segmented ring (kept separate so it is unit-testable
// without rendering): one segment per contributing factor, sized in
// proportion to |points| within the filled part of the ring. Excluded and
// zero-point factors have nothing to show and are skipped, so a renormalised
// day simply has fewer segments and cold start has none.
export function computeArcSegments(
  factors: FactorDTO[],
  filledLength: number,
  gap: number = SEGMENT_GAP,
): ArcSegment[] {
  const contributing = factors.filter((f) => !f.excluded && f.points !== 0);
  if (contributing.length === 0 || filledLength <= 0) return [];

  const total = contributing.reduce((sum, f) => sum + Math.abs(f.points), 0);
  let shares = contributing.map((f) => Math.abs(f.points) / total);

  if (contributing.length * MIN_SEGMENT_SHARE >= 1) {
    shares = contributing.map(() => 1 / contributing.length);
  } else {
    const smallCount = shares.filter((s) => s < MIN_SEGMENT_SHARE).length;
    if (smallCount > 0) {
      const largeSum = shares.filter((s) => s >= MIN_SEGMENT_SHARE).reduce((a, b) => a + b, 0);
      const remaining = 1 - smallCount * MIN_SEGMENT_SHARE;
      shares = shares.map((s) => (s < MIN_SEGMENT_SHARE ? MIN_SEGMENT_SHARE : (s * remaining) / largeSum));
    }
  }

  const applyGap = contributing.length > 1 ? gap : 0;
  let cursor = 0;
  return contributing.map((f, i) => {
    const allocated = shares[i] * filledLength;
    const segment: ArcSegment = {
      factor: f.factor,
      tone: f.points > 0 ? 'helped' : 'hurt',
      start: cursor,
      length: Math.max(allocated - applyGap, allocated * 0.5),
    };
    cursor += allocated;
    return segment;
  });
}

interface AnimatedArcProps {
  testID: string;
  size: number;
  radius: number;
  circumference: number;
  strokeWidth: number;
  stroke: string;
  start: number;
  length: number;
  delay: number;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// One factor's arc. `start` and `length` are animated shared values so a
// score change slides each segment from where it was to where it now is,
// starting after `delay` (the stagger from scoreMotion).
function AnimatedArc({ testID, size, radius, circumference, strokeWidth, stroke, start, length, delay }: AnimatedArcProps) {
  const animatedStart = useSharedValue(start);
  const animatedLength = useSharedValue(isTestEnv ? length : 0);

  useEffect(() => {
    if (isTestEnv) {
      animatedStart.value = start;
      animatedLength.value = length;
      return;
    }
    const timing = { duration: MOTION.duration.slow, easing: Easing.bezier(...MOTION.easing.decelerate) };
    animatedStart.value = withDelay(delay, withTiming(start, timing));
    animatedLength.value = withDelay(delay, withTiming(length, timing));
  }, [start, length, delay, animatedStart, animatedLength]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${animatedLength.value} ${circumference}`,
    strokeDashoffset: -animatedStart.value,
  }));

  return (
    <AnimatedCircle
      testID={testID}
      cx={size / 2}
      cy={size / 2}
      r={radius}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill="none"
      strokeLinecap="butt"
      animatedProps={animatedProps}
    />
  );
}

interface ScoreRingProps {
  score: number | null;
  factors?: FactorDTO[];
  // Design-spike gate (spec 5): the segmented arc is unverified for legibility
  // at 84px on a device, so the plain single-colour fill -- today's Ring -- is
  // the default. Opt in per call site once it has been checked by eye.
  segmented?: boolean;
  size?: number;
  strokeWidth?: number;
  // Server-provided band thresholds; the defaults apply when absent.
  bands?: ScoreBandsDTO;
  // The centre number's type token: text-score on a hero ring, text-headline
  // on a small tile ring. Defaults to text-heading. The ring adds tabular-nums.
  numeralClassName?: string;
  // Optional pixel label (SectionLabel) above the number (hero use).
  label?: string;
}

export function ScoreRing({
  score,
  factors = [],
  segmented = false,
  size = 84,
  strokeWidth = 8,
  bands,
  numeralClassName = 'text-heading',
  label,
}: ScoreRingProps) {
  const { colorScheme: scheme } = useColorScheme();
  const colors = scheme === 'dark' ? COLORS.dark : COLORS.light;
  const fill = score === null ? 0 : Math.max(0, Math.min(score / 100, 1));

  const numeral =
    score === null ? (
      <Text className={`${numeralClassName} text-muted-foreground`}>{'—'}</Text>
    ) : (
      <CountUp value={score} format={(v) => String(Math.round(v))} className={`${numeralClassName} tabular-nums`} />
    );
  const center = label ? (
    <View className="items-center">
      <SectionLabel>{label}</SectionLabel>
      {numeral}
    </View>
  ) : (
    numeral
  );

  const accessibilityLabel = score === null ? 'Score not available yet' : `Score ${Math.round(score)} out of 100`;

  if (!segmented) {
    const color = score === null ? colors.muted : colors[scoreBand(score, bands)];
    return (
      <View testID="score-ring" accessible accessibilityLabel={accessibilityLabel}>
        <View testID="score-ring-plain">
          <Ring size={size} strokeWidth={strokeWidth} color={color} percent={fill}>
            {center}
          </Ring>
        </View>
      </View>
    );
  }

  return (
    <View testID="score-ring" accessible accessibilityLabel={accessibilityLabel}>
      <SegmentedRing size={size} strokeWidth={strokeWidth} fill={fill} factors={factors} colors={colors}>
        {center}
      </SegmentedRing>
    </View>
  );
}

interface SegmentedRingProps {
  size: number;
  strokeWidth: number;
  fill: number;
  factors: FactorDTO[];
  colors: (typeof COLORS)['light'];
  children: React.ReactNode;
}

function SegmentedRing({ size, strokeWidth, fill, factors, colors, children }: SegmentedRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const segments = useMemo(() => computeArcSegments(factors, fill * circumference), [factors, fill, circumference]);

  // Stagger by how far each factor moved since the last render; on first
  // paint there is no previous state, so it orders by |points|.
  const previousPoints = useRef<Record<string, number> | undefined>(undefined);
  const delays = useMemo(() => staggerDelays(previousPoints.current, factors), [factors]);
  useEffect(() => {
    previousPoints.current = pointsByFactor(factors);
  }, [factors]);

  return (
    <View testID="score-ring-segmented" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(128, 128, 128, 0.15)" strokeWidth={strokeWidth} fill="none" />
        {segments.map((segment) => (
          <AnimatedArc
            key={segment.factor}
            testID={`score-ring-segment-${segment.factor}`}
            size={size}
            radius={radius}
            circumference={circumference}
            strokeWidth={strokeWidth}
            stroke={segment.tone === 'helped' ? colors.scoreExcellent : colors.scorePoor}
            start={segment.start}
            length={segment.length}
            delay={delays[segment.factor] ?? 0}
          />
        ))}
      </Svg>
      {children}
    </View>
  );
}
