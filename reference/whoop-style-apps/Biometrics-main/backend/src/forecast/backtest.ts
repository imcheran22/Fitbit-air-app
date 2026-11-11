// Rolling-origin backtest: each day D is forecast from a model fitted on data
// up to D - 1, using the night that actually ended on D as the sleep lever and
// the habits actually logged on habit day D - 1. Pure.
//
// Known simplification (spec 1.5): the set of CONFIRMED habits is today's; the
// effect sizes themselves are refitted on the truncated history.
import { dateRange, shiftDate } from '../scoring/dates';
import { TRACK_DAYS } from './config';
import { fitModel, predictDay } from './predict';
import type { ForecastData, TrackPoint } from './types';

export function rollingBacktest(data: ForecastData, habits: readonly string[], days = TRACK_DAYS): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const date of dateRange(shiftDate(data.today, -(days - 1)), data.today)) {
    const actual = data.scores.get(date)?.score;
    if (actual === null || actual === undefined) continue;
    const night = data.sleep.find((p) => p.date === date);
    if (!night) continue;
    const through = shiftDate(date, -1);
    const exposed = new Set(
      habits.filter((h) => data.observations.get(h)?.find((o) => o.day === through)?.exposed ?? false),
    );
    const p = predictDay(data, fitModel(data, through, habits), date, { sleepMinutes: night.value, exposed });
    if (p) points.push({ date, forecast: p.score, actual });
  }
  return points;
}
