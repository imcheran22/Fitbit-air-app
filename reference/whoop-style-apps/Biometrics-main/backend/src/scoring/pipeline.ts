// The five stages composed for one user-day. Still pure (series in, values out,
// no DB): the orchestrator loads the series and persists the result, and the
// backtest tool replays the same function under a different config, so the
// live job and the backtest can never drift apart.

import { computeBaseline, sleepDurationZRawVsGoal, sleepDurationZVsGoal, zScore } from './baseline';
import { imputeFromBaseline, rejectOutliers } from './clean';
import { computeComposite } from './composite';
import { shiftDate } from './dates';
import { explainFactors } from './explain';
import {
  acuteChronicLoadRatio,
  baselineDeviationPct,
  buildCircadianSeries,
  buildSleepDebtSeries,
  buildSleepEfficiencySeries,
  mainSessionOnsets,
  sleepDebtRolling,
} from './features';
import type { ScoreConfig } from './configs/v1';
import type {
  Baseline,
  BaselineMetric,
  ConfidenceLevel,
  DailyPoint,
  ExplainedFactor,
  FactorInput,
  OutlierFlag,
  SleepSessionInput,
} from './types';

export interface PipelineInput {
  /** Day D: the civil date being scored. */
  date: string;
  hrv: DailyPoint[];
  rhr: DailyPoint[];
  /** Nightly minutesAsleep (the SLEEP rollup keyed by local end date). */
  sleep: DailyPoint[];
  steps: DailyPoint[];
  sleepGoalMinutes: number;
  /**
   * Stored SleepSession rows, for the Sleep Score's structural features
   * (efficiency, bedtime consistency). Omitted/empty means those two factors
   * are simply cold-starting; nothing in the Recovery Score reads them.
   */
  sessions?: SleepSessionInput[];
  /** IANA zone (User.timezone) sessions without their own UTC offset are read in. Defaults to UTC. */
  timezone?: string;
}

export interface FeatureValues {
  sleepDebtRolling14d: number | null;
  hrvBaselineDeviationPct: number | null;
  rhrBaselineDeviationPct: number | null;
  acuteChronicLoadRatio: number | null;
  hrvZ: number | null;
  hrvZImputed: boolean;
  rhrZ: number | null;
  rhrZImputed: boolean;
  sleepDurationZ: number | null;
  sleepDurationZImputed: boolean;
  // Slice 1.5
  sleepEfficiency: number | null;
  sleepEfficiencyZ: number | null;
  sleepEfficiencyZImputed: boolean;
  circadianConsistencyScore: number | null;
  circadianConsistencyZ: number | null;
  circadianConsistencyZImputed: boolean;
}

/** One composite's outcome: score, confidence and the explained factor vector. */
export interface ScoreOutcome {
  /** null when every factor is excluded (cold start). */
  score: number | null;
  confidenceLevel: ConfidenceLevel;
  factors: ExplainedFactor[];
}

export interface PipelineResult {
  date: string;
  algorithmVersion: string;
  /** False when none of HRV(D), RHR(D), SLEEP(D) was actually observed: there is nothing to score. */
  hasObservedInput: boolean;
  outlierFlags: { metric: 'HRV' | 'RESTING_HR'; flag: OutlierFlag }[];
  baselines: { metric: BaselineMetric; baseline: Baseline }[];
  features: FeatureValues;
  /** The Recovery Score. */
  score: number | null;
  confidenceLevel: ConfidenceLevel;
  factors: ExplainedFactor[];
  /**
   * The Sleep Score. null when SLEEP(D) was not observed: a Sleep Score for a
   * day with no recorded sleep would be all imputed values, i.e. an invented
   * number, so none is produced (and a stale one is removed by the caller).
   */
  sleepScore: ScoreOutcome | null;
}

function upTo(points: DailyPoint[], date: string): DailyPoint[] {
  return points.filter((p) => p.date <= date).sort((a, b) => (a.date < b.date ? -1 : 1));
}

function trailing(points: DailyPoint[], date: string, days: number): DailyPoint[] {
  const from = shiftDate(date, -days);
  return points.filter((p) => p.date >= from && p.date < date);
}

interface TrendMetric {
  baseline: Baseline;
  z: number | null;
  imputed: boolean;
  deviationPct: number | null;
  observed: boolean;
  outlier: OutlierFlag | undefined;
}

/** HRV and RHR: a trending metric that is outlier-screened and gap-imputed from its own EWMA. */
function scoreTrendMetric(points: DailyPoint[], date: string, cfg: ScoreConfig, metric: BaselineMetric): TrendMetric {
  const series = upTo(points, date);
  const { kept, outliers } = rejectOutliers(series, cfg);
  const outlier = outliers.find((o) => o.date === date);
  const today = kept.find((p) => p.date === date);

  const baseline = computeBaseline(trailing(kept, date, cfg.historyDays), cfg);
  if (baseline.coldStart) {
    return { baseline, z: null, imputed: false, deviationPct: null, observed: today !== undefined, outlier };
  }
  if (today) {
    return {
      baseline,
      z: zScore(today.value, baseline, cfg, metric),
      imputed: false,
      deviationPct: baselineDeviationPct(today.value, baseline.ewma),
      observed: true,
      outlier,
    };
  }
  const filled = imputeFromBaseline(baseline)!;
  return {
    baseline,
    z: zScore(filled.value, baseline, cfg, metric),
    imputed: filled.imputed,
    deviationPct: 0,
    observed: false,
    outlier,
  };
}

interface OwnBaselineMetric {
  baseline: Baseline;
  z: number | null;
  imputed: boolean;
}

/**
 * Sleep efficiency and bedtime consistency: scored against their own EWMA /
 * sigma-hat. Like SLEEP they are not outlier-screened. A day with no value is
 * imputed from the baseline centre (z = 0, flagged) once the baseline exists.
 */
function scoreOwnBaseline(series: DailyPoint[], date: string, cfg: ScoreConfig, metric: BaselineMetric): OwnBaselineMetric {
  const today = series.find((p) => p.date === date);
  const baseline = computeBaseline(trailing(series, date, cfg.historyDays), cfg);
  if (baseline.coldStart) return { baseline, z: null, imputed: false };
  return { baseline, z: zScore(today ? today.value : baseline.ewma, baseline, cfg, metric), imputed: !today };
}

export function scoreDay(input: PipelineInput, cfg: ScoreConfig): PipelineResult {
  const { date } = input;

  const hrv = scoreTrendMetric(input.hrv, date, cfg, 'HRV');
  const rhr = scoreTrendMetric(input.rhr, date, cfg, 'RESTING_HR');

  // SLEEP is not outlier-screened: a very short night is exactly what sleep
  // debt exists to capture, and rejecting it would hide the signal.
  const sleep = upTo(input.sleep, date);
  const sleepTonight = sleep.find((p) => p.date === date);
  const sleepBaseline = computeBaseline(trailing(sleep, date, cfg.historyDays), cfg);
  let sleepDurationZ: number | null = null;
  let sleepDurationZImputed = false;
  if (!sleepBaseline.coldStart) {
    sleepDurationZ = zScore(sleepTonight ? sleepTonight.value : sleepBaseline.ewma, sleepBaseline, cfg, 'SLEEP');
    sleepDurationZImputed = !sleepTonight;
  }

  // Sleep debt is z-scored against its own 30-day baseline (the debt series).
  const debtToday = sleepDebtRolling(sleep, date, input.sleepGoalMinutes, cfg);
  const debtSeries = buildSleepDebtSeries(sleep, date, input.sleepGoalMinutes, cfg);
  const debtBaseline = computeBaseline(trailing(debtSeries, date, cfg.historyDays), cfg);
  const debtZ = zScore(debtToday, debtBaseline, cfg, 'SLEEP_DEBT');

  const factorInputs: FactorInput[] = [
    { factor: 'HRV', z: hrv.z, imputed: hrv.imputed, excluded: hrv.z === null },
    { factor: 'RHR', z: rhr.z, imputed: rhr.imputed, excluded: rhr.z === null },
    // Imputed when tonight's night is missing: the window is then 13 nights + 0.
    { factor: 'SLEEP_DEBT', z: debtZ, goalMinutes: input.sleepGoalMinutes, imputed: !sleepTonight, excluded: debtZ === null },
  ];
  const composite = computeComposite(factorInputs, cfg);

  // Slice 1.5 features and the Sleep Score. Reads SleepSession structure; the
  // Recovery computation above never sees any of this.
  const timeZone = input.timezone ?? 'UTC';
  const sessions = input.sessions ?? [];
  const efficiencySeries = buildSleepEfficiencySeries(sessions, timeZone, date);
  const circadianSeries = buildCircadianSeries(mainSessionOnsets(sessions, timeZone), date, cfg);
  const efficiency = scoreOwnBaseline(efficiencySeries, date, cfg, 'SLEEP_EFFICIENCY');
  const circadian = scoreOwnBaseline(circadianSeries, date, cfg, 'CIRCADIAN_CONSISTENCY');

  let sleepScore: ScoreOutcome | null = null;
  if (sleepTonight) {
    const durationZ = sleepDurationZVsGoal(sleepTonight.value, input.sleepGoalMinutes, sleepBaseline, cfg);
    // Duration's own [-3, +1] clamp is applied above; zRaw is the value before it.
    const durationZRaw = sleepDurationZRawVsGoal(sleepTonight.value, input.sleepGoalMinutes, sleepBaseline, cfg);
    const sleepInputs: FactorInput[] = [
      {
        factor: 'SLEEP_DURATION',
        z: durationZ,
        zRaw: durationZRaw,
        goalMinutes: input.sleepGoalMinutes,
        imputed: false,
        excluded: durationZ === null,
      },
      { factor: 'SLEEP_EFFICIENCY', z: efficiency.z, imputed: efficiency.imputed, excluded: efficiency.z === null },
      { factor: 'CIRCADIAN_CONSISTENCY', z: circadian.z, imputed: circadian.imputed, excluded: circadian.z === null },
    ];
    const sleepComposite = computeComposite(sleepInputs, cfg, cfg.sleepScore);
    sleepScore = {
      score: sleepComposite.score,
      confidenceLevel: sleepComposite.confidenceLevel,
      factors: explainFactors(sleepComposite),
    };
  }

  const outlierFlags: PipelineResult['outlierFlags'] = [];
  if (hrv.outlier) outlierFlags.push({ metric: 'HRV', flag: hrv.outlier });
  if (rhr.outlier) outlierFlags.push({ metric: 'RESTING_HR', flag: rhr.outlier });

  return {
    date,
    algorithmVersion: cfg.version,
    hasObservedInput: hrv.observed || rhr.observed || sleepTonight !== undefined,
    outlierFlags,
    baselines: [
      { metric: 'HRV', baseline: hrv.baseline },
      { metric: 'RESTING_HR', baseline: rhr.baseline },
      { metric: 'SLEEP', baseline: sleepBaseline },
      { metric: 'SLEEP_DEBT', baseline: debtBaseline },
      { metric: 'SLEEP_EFFICIENCY', baseline: efficiency.baseline },
      { metric: 'CIRCADIAN_CONSISTENCY', baseline: circadian.baseline },
    ],
    features: {
      sleepDebtRolling14d: sleep.length > 0 ? debtToday : null,
      hrvBaselineDeviationPct: hrv.deviationPct,
      rhrBaselineDeviationPct: rhr.deviationPct,
      acuteChronicLoadRatio: acuteChronicLoadRatio(upTo(input.steps, date), date, cfg),
      hrvZ: hrv.z,
      hrvZImputed: hrv.imputed,
      rhrZ: rhr.z,
      rhrZImputed: rhr.imputed,
      sleepDurationZ,
      sleepDurationZImputed,
      sleepEfficiency: efficiencySeries.find((p) => p.date === date)?.value ?? null,
      sleepEfficiencyZ: efficiency.z,
      sleepEfficiencyZImputed: efficiency.imputed,
      circadianConsistencyScore: circadianSeries.find((p) => p.date === date)?.value ?? null,
      circadianConsistencyZ: circadian.z,
      circadianConsistencyZImputed: circadian.imputed,
    },
    score: composite.score,
    confidenceLevel: composite.confidenceLevel,
    factors: explainFactors(composite),
    sleepScore,
  };
}
