import type { BaselineSnapshot, DailyScore } from '@prisma/client';
import { LIVE_VERSION, SCORE_CONFIGS } from './configs';
import type { ScoreConfig } from './configs/v1';
import type { ConfidenceLevel, FactorKey } from './types';

// The wire contract the mobile client codes against. Field names are fixed.

export type ScoreType = 'RECOVERY' | 'SLEEP';

export interface FactorDTO {
  factor: FactorKey;
  label: string;
  z: number | null;
  /** SLEEP_DEBT and SLEEP_DURATION only: the sleep goal that score used. Absent on older rows; never guessed. */
  goalMinutes?: number;
  weight: number;
  contribution: number;
  points: number;
  imputed: boolean;
  excluded: boolean;
}

export interface ColdStartDTO {
  metric: string;
  daysCollected: number;
  daysRequired: number;
}

export interface DailyScoreDTO {
  date: string;
  type: ScoreType;
  score: number | null;
  confidenceLevel: ConfidenceLevel;
  algorithmVersion: string;
  factors: FactorDTO[];
  coldStart: ColdStartDTO[];
}

export interface BaselineDTO {
  metric: string;
  ewma: number;
  spread: number;
  daysOfHistory: number;
  windowDays: number;
  unit: string;
}

// RESTING_HR is Google's own daily resting heart rate (the dedicated
// daily-resting-heart-rate type), so it is labelled as what it is. It used to
// be the daily-minimum BPM proxy and read "Daily minimum HR".
export const FACTOR_LABELS: Record<FactorKey, string> = {
  HRV: 'HRV',
  RHR: 'Resting HR',
  SLEEP_DEBT: 'Sleep debt',
  SLEEP_DURATION: 'Sleep duration',
  SLEEP_EFFICIENCY: 'Sleep efficiency',
  CIRCADIAN_CONSISTENCY: 'Bedtime consistency',
};

/** Which baseline series backs each factor; also the `metric` id used in cold-start and baseline DTOs. */
export const FACTOR_METRIC: Record<FactorKey, string> = {
  HRV: 'HRV',
  RHR: 'RESTING_HR',
  SLEEP_DEBT: 'SLEEP_DEBT',
  // Duration is scored against the goal but its sigma-hat comes from the SLEEP series baseline.
  SLEEP_DURATION: 'SLEEP',
  SLEEP_EFFICIENCY: 'SLEEP_EFFICIENCY',
  CIRCADIAN_CONSISTENCY: 'CIRCADIAN_CONSISTENCY',
};

const METRIC_UNITS: Record<string, string> = {
  HRV: 'ms',
  RESTING_HR: 'bpm',
  SLEEP_DEBT: 'min',
  SLEEP: 'min',
  SLEEP_EFFICIENCY: '%',
  CIRCADIAN_CONSISTENCY: 'pts',
};

/**
 * Stored efficiency baselines are 0..1 fractions (the feature's own scale);
 * they are shown as percentages, so the wire value and its '%' unit agree.
 */
const METRIC_DISPLAY_SCALE: Record<string, number> = { SLEEP_EFFICIENCY: 100 };

/** Factors of each score type, in the order cold-start progress and baselines are listed. */
const FACTOR_ORDER: Record<ScoreType, FactorKey[]> = {
  RECOVERY: ['HRV', 'RHR', 'SLEEP_DEBT'],
  SLEEP: ['SLEEP_DURATION', 'SLEEP_EFFICIENCY', 'CIRCADIAN_CONSISTENCY'],
};

const round = (n: number, places: number) => {
  const p = 10 ** places;
  return Math.round(n * p) / p;
};
const roundOrNull = (n: number | null, places: number) => (n === null ? null : round(n, places));

/** The config a stored row was computed with; falls back to the live one for an unknown version. */
function configFor(version: string): ScoreConfig {
  return SCORE_CONFIGS[version] ?? SCORE_CONFIGS[LIVE_VERSION]!;
}

interface StoredFactor {
  factor: FactorKey;
  z: number | null;
  goalMinutes?: number;
  weight: number;
  contribution: number;
  points?: number;
  imputed: boolean;
  excluded: boolean;
}

export function toDailyScoreDTO(row: DailyScore, snapshotsForDate: BaselineSnapshot[]): DailyScoreDTO {
  const cfg = configFor(row.algorithmVersion);
  const stored = row.factors as unknown as StoredFactor[];

  const factors: FactorDTO[] = stored.map((f) => ({
    factor: f.factor,
    label: FACTOR_LABELS[f.factor],
    z: roundOrNull(f.z, 2),
    ...(f.goalMinutes !== undefined ? { goalMinutes: f.goalMinutes } : {}),
    weight: round(f.weight, 3),
    contribution: round(f.contribution, 3),
    points: round(f.points ?? 0, 2),
    imputed: f.imputed,
    excluded: f.excluded,
  }));

  const coldStart: ColdStartDTO[] = FACTOR_ORDER[row.type].filter((k) => stored.find((f) => f.factor === k)?.excluded).map(
    (k) => ({
      metric: FACTOR_METRIC[k],
      daysCollected: snapshotsForDate.find((s) => s.metric === FACTOR_METRIC[k])?.daysOfHistory ?? 0,
      daysRequired: cfg.minHistoryDays,
    }),
  );

  return {
    date: row.date.toISOString().slice(0, 10),
    type: row.type,
    score: roundOrNull(row.score, 1),
    confidenceLevel: row.confidenceLevel,
    algorithmVersion: row.algorithmVersion,
    factors,
    coldStart,
  };
}

/** Baselines a score of `type` was computed against: only factor series that are past cold-start. */
export function toBaselineDTOs(snapshots: BaselineSnapshot[], type: ScoreType = 'RECOVERY'): BaselineDTO[] {
  const out: BaselineDTO[] = [];
  for (const key of FACTOR_ORDER[type]) {
    const snap = snapshots.find((s) => s.metric === FACTOR_METRIC[key]);
    if (!snap || snap.ewma === null || snap.spread === null) continue;
    const scale = METRIC_DISPLAY_SCALE[snap.metric] ?? 1;
    out.push({
      metric: snap.metric,
      ewma: round(snap.ewma * scale, 2),
      spread: round(snap.spread * scale, 2),
      daysOfHistory: snap.daysOfHistory,
      windowDays: configFor(snap.algorithmVersion).ewmaN,
      unit: METRIC_UNITS[snap.metric] ?? '',
    });
  }
  return out;
}

export const BASELINE_METRICS = Object.values(FACTOR_METRIC);
