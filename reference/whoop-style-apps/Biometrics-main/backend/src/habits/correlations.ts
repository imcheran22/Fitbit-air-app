// Reading stored correlations. Only CONFIRMED rows are ever surfaced: a
// CANDIDATE is a single lucky-or-real week and showing it invites exactly the
// false-pattern risk the engine exists to prevent; a RETIRED row has stopped
// holding up.

import { prisma } from '../db/client';
import type { SparklineSeries } from './engine';
import { listHabitTypes } from './habitTypes';

export interface ConfirmedCorrelation {
  habitType: string;
  exposureThreshold: number;
  exposureUnit: string;
  factor: string;
  lagDays: number;
  effectSizePercent: number;
  comparisonPercent: number;
  sampleSize: number;
  direction: 'higher' | 'lower';
}

export interface ConfirmedCorrelationWithSeries extends ConfirmedCorrelation {
  series: SparklineSeries;
}

export async function listConfirmedWithSeries(userId: string): Promise<ConfirmedCorrelationWithSeries[]> {
  const [rows, types] = await Promise.all([
    prisma.habitCorrelation.findMany({
      where: { userId, status: 'CONFIRMED' },
      orderBy: [{ habitType: 'asc' }, { factor: 'asc' }, { lagDays: 'asc' }],
    }),
    listHabitTypes(userId),
  ]);
  const typeOf = new Map(types.map((t) => [t.type, t]));

  const out: ConfirmedCorrelationWithSeries[] = [];
  for (const row of rows) {
    const type = typeOf.get(row.habitType);
    // A CONFIRMED row always carries the stats of the run that confirmed it;
    // the null checks only narrow the nullable columns.
    if (!type || row.effectSizePercent === null || row.comparisonPercent === null || !row.series) continue;
    out.push({
      habitType: row.habitType,
      exposureThreshold: type.exposureThreshold,
      exposureUnit: type.unit,
      factor: row.factor,
      lagDays: row.lagDays,
      effectSizePercent: row.effectSizePercent,
      comparisonPercent: row.comparisonPercent,
      sampleSize: row.sampleSize,
      direction: row.direction === 'lower' ? 'lower' : 'higher',
      series: row.series as unknown as SparklineSeries,
    });
  }
  return out;
}

/**
 * The structured output of the correlation engine (spec section 2): the lag,
 * threshold and unit, effect size and sample size a sentence needs are values
 * here, never free text. The future AI-coach tool wraps exactly this function,
 * so the coach cites these numbers instead of recomputing or paraphrasing them.
 * CONFIRMED rows only.
 */
export async function getConfirmedCorrelations(userId: string): Promise<ConfirmedCorrelation[]> {
  const rows = await listConfirmedWithSeries(userId);
  return rows.map(({ series: _series, ...fields }) => fields);
}
