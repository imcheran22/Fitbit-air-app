import React from 'react';
import { View } from 'react-native';
import { useColorScheme } from 'nativewind';
import type { ScoreBandsDTO } from '../../api/scores';
import { COLORS } from '../../theme';
import { pickColdStartProgress, scoreBand } from '../../lib/scoreInsights';
import { buildingHero, heroA11y, noNightHero, noScoreHero, sleepHeroLine, sleepVerdict } from '../../lib/sleepCopy';
import type { NightLoad } from '../../lib/useSleepPage';
import { Skeleton } from '../ui/skeleton';
import { Text } from '../ui/text';
import { MoonArt } from './MoonArt';

// Moon, numeral, verdict and the hero line (spec §3.2); a screen reader reads it as one element.
export function SleepHero({ date, today, load, goalMinutes, bands }: {
  date: string; today: string; load: NightLoad; goalMinutes: number | null; bands: ScoreBandsDTO | undefined;
}) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  if (load.status !== 'ready') {
    return (
      <View testID="sleep-hero-loading" className="items-center pt-1.5">
        <Skeleton className="h-[200px] w-[125px] rounded-card" />
      </View>
    );
  }
  const { score: detail, night } = load.data;
  const napOnly = night?.mainIsNap === true;
  const s = detail?.score.score ?? null;
  const liveBands = detail?.bands ?? bands;

  let numeral = '—';
  let numeralClass = 'text-score';
  let verdict: string;
  let line: React.ReactNode = null;
  let label: string;
  let dim = false;
  if (napOnly || (!detail && !night)) {
    const h = noNightHero({ isToday: date === today, napOnly });
    verdict = h.verdict;
    line = h.line;
    label = `${h.verdict}. ${h.line}`;
    dim = true;
  } else if (detail && s !== null) {
    // Everything bands on the numeral shown, as the picker dash and the info sheet do (spec §4.4, final review I-2).
    const r = Math.round(s);
    numeral = String(r);
    verdict = sleepVerdict({ score: r, bands: liveBands, mainMinutes: night?.minutesAsleep ?? null, goalMinutes });
    const hl = sleepHeroLine({ score: r, bands: liveBands, date, today, previous: detail.previous, confidence: detail.score.confidenceLevel });
    const low = detail.score.confidenceLevel === 'LOW';
    line = (
      <>
        <Text className="text-caption" style={{ color: colors[scoreBand(r, liveBands)] }}>{hl.band}</Text>
        {hl.lead}
        <Text className="text-caption text-muted-foreground" style={low ? { color: colors.scoreFair } : undefined}>{hl.confidence}</Text>
      </>
    );
    label = heroA11y(r, hl.band, verdict, hl.spoken);
  } else if (detail) {
    const b = buildingHero(pickColdStartProgress(detail.score.coldStart));
    numeral = b.numeral;
    numeralClass = 'text-number';
    verdict = b.verdict;
    line = b.line;
    label = b.spoken;
    dim = true;
  } else {
    const h = noScoreHero(date, today);
    verdict = h.verdict;
    line = h.line;
    label = h.line ? `${h.verdict}. ${h.line}` : h.verdict;
  }

  return (
    <View testID="sleep-hero" accessible accessibilityLabel={label} className="items-center" style={{ paddingTop: 6 }}>
      <MoonArt dim={dim} testID="sleep-hero-moon" />
      <Text className={`${numeralClass} mt-2 tabular-nums`}>{numeral}</Text>
      <Text className="mt-1 text-heading">{verdict}</Text>
      {line ? <Text className="mt-1 text-center text-caption text-muted-foreground">{line}</Text> : null}
    </View>
  );
}
