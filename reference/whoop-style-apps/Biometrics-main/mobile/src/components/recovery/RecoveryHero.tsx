import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { RecoveryPageDTO } from '../../api/recovery';
import { COLORS } from '../../theme';
import { Text } from '../ui/text';
import { WeatherIcon } from './WeatherIcon';
import { pickColdStartProgress, scoreBand } from '../../lib/scoreInsights';
import { buildingCopy, heroLine, noDataLine, RECOVERY_COPY, VERDICT, weatherFor } from '../../lib/recoveryCopy';

// Weather art, numeral, verdict and the hero line (spec §3.2); a screen reader reads it as one element.
export function RecoveryHero({ page }: { page: RecoveryPageDTO }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const s = page.score?.score ?? null;
  const kind = weatherFor(s, page.state, page.bands);
  const cold = page.score ? pickColdStartProgress(page.score.coldStart) : null;

  let numeral = '—';
  let numeralClass = 'text-score';
  let line: React.ReactNode;
  let label: string;
  if (page.state === 'READY' && s !== null && page.score) {
    numeral = String(Math.round(s));
    const hl = heroLine({ score: s, bands: page.bands, date: page.date, previous: page.previous, confidence: page.score.confidenceLevel });
    // The band word takes the band colour and Low confidence the Fair colour; the rest stays muted.
    const low = page.score.confidenceLevel === 'LOW';
    line = (
      <>
        <Text className="text-caption" style={{ color: colors[scoreBand(s, page.bands)] }}>{hl.band}</Text>
        {hl.lead}<Text className="text-caption text-muted-foreground" style={low ? { color: colors.scoreFair } : undefined}>{hl.confidence}</Text>
      </>
    );
    label = RECOVERY_COPY.heroA11y(s, hl.band, VERDICT[kind], hl.spoken);
  } else if (page.state === 'BUILDING' && cold) {
    const b = buildingCopy(cold);
    numeral = b.numeral;
    numeralClass = 'text-number';
    line = b.line;
    label = `${VERDICT[kind]}. ${b.line}`;
  } else if (page.state === 'BUILDING') {
    // No cold-start progress to count down from: keep the building verdict.
    line = RECOVERY_COPY.buildingLine;
    label = `${VERDICT[kind]}. ${RECOVERY_COPY.buildingLine}`;
  } else {
    line = noDataLine(page.isToday);
    label = `${VERDICT[kind]}. ${noDataLine(page.isToday)}`;
  }

  return (
    <View testID="recovery-hero" accessible accessibilityLabel={label} className="items-center" style={{ paddingTop: 10 }}>
      <WeatherIcon kind={kind} variant="hero" testID="recovery-hero-art" />
      <Text className={`${numeralClass} mt-1.5`}>{numeral}</Text>
      <Text className="text-display font-semibold">{VERDICT[kind]}</Text>
      <Text className="mt-1 text-center text-caption text-muted-foreground">{line}</Text>
    </View>
  );
}
