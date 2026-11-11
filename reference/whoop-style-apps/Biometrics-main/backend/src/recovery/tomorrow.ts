// Tomorrow's card from the existing forecast (spec §3.8): the 6/7/8/9 h cells at the default
// habit exposure (the same rule as mobile lib/forecastGrid.ts exposedFor) and a last-12 track record.
import type { ForecastResponse } from '../forecast/dto';
import type { ForecastChipDTO, RecoveryTomorrowDTO } from './dto';

const CHIP_HOURS = [6, 7, 8, 9] as const;
const TRACK_POINTS = 12;

export function tomorrowFrom(f: ForecastResponse): RecoveryTomorrowDTO {
  if (f.status !== 'READY') return f;
  const exposed = f.levers
    .filter((l) => l.key !== 'SLEEP' && l.effect === 'CONFIRMED' && l.threshold !== undefined && (f.defaults.habits[l.key] ?? 0) >= l.threshold)
    .map((l) => l.key)
    .sort()
    .join(',');
  const chips: ForecastChipDTO[] = CHIP_HOURS.map((h) => {
    const cell =
      f.grid.find((c) => c.sleepHours === h && [...c.exposed].sort().join(',') === exposed) ??
      f.grid.find((c) => c.sleepHours === h && c.exposed.length === 0)!;
    return { sleepHours: h, score: cell.score, band: cell.band, confidence: cell.confidence };
  });
  const last = f.trackRecord.series.slice(-TRACK_POINTS);
  const within = f.trackRecord.withinPoints;
  return {
    status: 'READY',
    date: f.date,
    chips,
    trackRecord: { hits: last.filter((p) => Math.abs(p.actual - p.forecast) <= within).length, days: last.length, withinPoints: within },
  };
}
