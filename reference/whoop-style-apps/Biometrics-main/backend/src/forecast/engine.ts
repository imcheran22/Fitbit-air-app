// Orchestrates the forecast response: gates, model fit, backtest and the
// precomputed what-if grid. Lever and default details live in levers.ts. Pure.
import { shiftDate } from '../scoring/dates';
import type { ConfidenceLevel } from '../scoring/types';
import { rollingBacktest } from './backtest';
import { bandFor, errorSummary } from './band';
import { MAX_GRID_HABITS, MIN_BAND_PAIRS, MIN_HISTORY_DAYS, SLEEP_MAX_HOURS, SLEEP_MIN_HOURS, SLEEP_STEP_HOURS } from './config';
import type { ForecastCell, ForecastResponse } from './dto';
import { buildDefaults, buildLevers } from './levers';
import { fitModel, predictDay } from './predict';
import type { ForecastData, Model } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;
const LEVELS: ConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW'];
const downgrade = (level: ConfidenceLevel, drops: number) =>
  LEVELS[Math.min(LEVELS.indexOf(level) + drops, LEVELS.length - 1)]!;

function sleepSteps(): number[] {
  const steps: number[] = [];
  for (let h = SLEEP_MIN_HOURS; h <= SLEEP_MAX_HOURS + 1e-9; h += SLEEP_STEP_HOURS) steps.push(round1(h));
  return steps;
}

/** Every subset of `items`, each keeping `items` order; the empty set first. */
function subsets<T>(items: readonly T[]): T[][] {
  return Array.from({ length: 2 ** items.length }, (_, mask) => items.filter((_, i) => mask & (1 << i)));
}

const maxAbsEffect = (model: Model, habit: string) =>
  Math.max(...Object.values(model.effects.get(habit) ?? {}).map((v) => Math.abs(v!)));

export function buildForecast(data: ForecastData): ForecastResponse {
  const daysOfHistory = [...data.scores.values()].filter((s) => s.score !== null).length;
  if (daysOfHistory < MIN_HISTORY_DAYS) return { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory };
  const today = data.scores.get(data.today);
  if (!today || today.score === null || today.confidence === 'LOW') {
    return { status: 'NOT_ENOUGH_DATA', reason: 'LOW_CONFIDENCE_TODAY', daysOfHistory };
  }

  const target = shiftDate(data.today, 1);
  const confirmedTypes = data.habitTypes.map((t) => t.type).filter((t) => data.confirmed.some((c) => c.habitType === t));
  const fullModel = fitModel(data, data.today, confirmedTypes);
  const withEffect = confirmedTypes.filter((t) => fullModel.effects.has(t));
  const kept = new Set(
    [...withEffect].sort((a, b) => maxAbsEffect(fullModel, b) - maxAbsEffect(fullModel, a)).slice(0, MAX_GRID_HABITS),
  );
  const modelled = withEffect.filter((t) => kept.has(t));

  const track = rollingBacktest(data, modelled);
  const errors = track.map((p) => p.actual - p.forecast);
  const confidence = downgrade(today.confidence, track.length < MIN_BAND_PAIRS ? 1 : 0);

  const grid: ForecastCell[] = [];
  for (const sleepHours of sleepSteps()) {
    for (const exposed of subsets(modelled)) {
      const p = predictDay(data, fullModel, target, { sleepMinutes: sleepHours * 60, exposed: new Set(exposed) });
      if (!p) return { status: 'NOT_ENOUGH_DATA', reason: 'NO_HISTORY', daysOfHistory };
      const [lo, hi] = bandFor(p.score, errors);
      grid.push({
        sleepHours,
        exposed,
        score: round1(p.score),
        band: [round1(lo), round1(hi)],
        confidence,
        contributions: p.contributions.map((c) => ({ key: c.key, points: round1(c.points) })),
      });
    }
  }

  return {
    status: 'READY',
    date: target,
    algorithmVersion: data.cfg.version,
    defaults: buildDefaults(data),
    levers: buildLevers(data, kept, new Set(withEffect)),
    grid,
    trackRecord: {
      ...errorSummary(track),
      series: track.map((p) => ({ date: p.date, forecast: round1(p.forecast), actual: round1(p.actual) })),
    },
  };
}
