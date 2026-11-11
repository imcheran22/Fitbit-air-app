// The Clear streak (spec §3.6): consecutive days scoring Good or better. Pure.
import { shiftDate } from '../scoring/dates';
import type { RecoveryDayDTO } from './dto';

export function computeStreak(rows: RecoveryDayDTO[], through: string, good: number, isToday: boolean): { current: number; best: number } {
  const upto = rows.filter((r) => r.date <= through).sort((a, b) => (a.date < b.date ? -1 : 1));
  const byDate = new Map(upto.map((r) => [r.date, r.score]));
  const clear = (date: string) => {
    const s = byDate.get(date);
    return s !== undefined && s !== null && s >= good;
  };

  // Before the morning sync today has no row; the run is not broken yet.
  let cursor = isToday && !byDate.has(through) ? shiftDate(through, -1) : through;
  let current = 0;
  while (clear(cursor)) {
    current++;
    cursor = shiftDate(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const r of upto) {
    const ok = r.score !== null && r.score >= good;
    run = ok ? (prev !== null && shiftDate(prev, 1) === r.date && run > 0 ? run + 1 : 1) : 0;
    best = Math.max(best, run);
    prev = r.date;
  }
  return { current, best: Math.max(best, current) };
}
