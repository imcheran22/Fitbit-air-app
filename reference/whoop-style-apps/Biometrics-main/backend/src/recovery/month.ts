// Calendar month and the 7-day strip from one ascending history (spec §3.5, §3.7). Pure.
import type { ScoreBands } from '../scoring/configs/v1';
import { shiftDate } from '../scoring/dates';
import type { RecoveryDayDTO, RecoveryMonthDTO } from './dto';

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildMonth(rows: RecoveryDayDTO[], month: string, bands: ScoreBands): RecoveryMonthDTO {
  const days = rows.filter((r) => r.date.startsWith(`${month}-`)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const scored = days.map((r) => r.score).filter((s): s is number => s !== null);
  const counts = { excellent: 0, good: 0, fair: 0, low: 0 };
  // Same band ladder as mobile/src/lib/scoreInsights.ts scoreBand; keep the two in step.
  for (const s of scored) {
    if (s >= bands.excellent) counts.excellent++;
    else if (s >= bands.good) counts.good++;
    else if (s >= bands.fair) counts.fair++;
    else counts.low++;
  }
  return { month, days, average: scored.length ? round1(scored.reduce((a, b) => a + b, 0) / scored.length) : null, counts };
}

export function buildOutlook(rows: RecoveryDayDTO[], date: string): RecoveryDayDTO[] {
  const byDate = new Map(rows.map((r) => [r.date, r.score]));
  return Array.from({ length: 7 }, (_, i) => {
    const day = shiftDate(date, i - 6);
    return { date: day, score: byDate.get(day) ?? null };
  });
}
