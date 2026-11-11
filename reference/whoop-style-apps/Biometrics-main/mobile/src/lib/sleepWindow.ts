// Pure layout maths for the Sleep screen's window chart and the bedtime goal.
// Clock times are anchored at local noon so a night reads as one unbroken
// span: 23:00 sits before 00:30, and wake times land after both.

const DAY = 24 * 60;

/** "HH:MM" → minutes since local noon (12:00 → 0, 23:00 → 660, 00:30 → 750, 07:00 → 1140). */
export function noonMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (((h! * 60 + m!) - 12 * 60) % DAY + DAY) % DAY;
}

/** Minutes from bedtime to wake for a goal window, wrapping midnight: ("23:30","07:00") → 450. */
export function goalWindowMinutes(bedtime: string, wake: string): number {
  const d = noonMinutes(wake) - noonMinutes(bedtime);
  return d > 0 ? d : d + DAY;
}

/** A goal-sized duration: 480 → "8h", 450 → "7h 30m", 45 → "45m" (no padding, no "0m"). */
export function formatGoalDuration(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Positions are fractions 0..1 of the axis, top to bottom.
export interface WindowBar { date: string; top: number; height: number }

export interface WindowLayout {
  // Noon-minutes; 21:00 (540) .. 09:00 (1260) by default, widened to fit and
  // snapped to the hour.
  axisStart: number;
  axisEnd: number;
  // One per night with both a bedtime and a wake time; missing nights are
  // omitted so the chart shows a gap.
  bars: WindowBar[];
  // Null when there are no bars.
  avgBedtime: number | null;
  avgWake: number | null;
  // Only when both a bedtime and a wake goal are set.
  goalBand: { top: number; height: number } | null;
  // Every 3 h on the clock, e.g. "21:00", "00:00", "03:00".
  ticks: { label: string; at: number }[];
}

export function layoutSleepWindow(nights: { date: string; bedtime: string | null; wakeTime: string | null }[], goal: { bedtimeGoal: string | null; wakeGoal: string | null } | null): WindowLayout {
  const spans = nights.filter((n) => n.bedtime && n.wakeTime).map((n) => {
    const start = noonMinutes(n.bedtime!);
    let end = noonMinutes(n.wakeTime!);
    // A wake at or before bedtime belongs to the next day.
    if (end <= start) end += DAY;
    return { date: n.date, start, end };
  });
  const goalSpan = goal?.bedtimeGoal && goal.wakeGoal
    ? { start: noonMinutes(goal.bedtimeGoal), end: noonMinutes(goal.bedtimeGoal) + goalWindowMinutes(goal.bedtimeGoal, goal.wakeGoal) }
    : null;
  const lo = Math.min(540, ...spans.map((s) => s.start), ...(goalSpan ? [goalSpan.start] : []));
  const hi = Math.max(1260, ...spans.map((s) => s.end), ...(goalSpan ? [goalSpan.end] : []));
  const axisStart = Math.floor(lo / 60) * 60;
  const axisEnd = Math.ceil(hi / 60) * 60;
  const len = axisEnd - axisStart;
  const frac = (m: number) => (m - axisStart) / len;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const avgStart = mean(spans.map((s) => s.start));
  const avgEnd = mean(spans.map((s) => s.end));
  // Ticks fall on clock hours divisible by 3; noon-minutes are offset by 12 h,
  // so multiples of 180 line up with them.
  const ticks: { label: string; at: number }[] = [];
  for (let m = Math.ceil(axisStart / 180) * 180; m <= axisEnd; m += 180) {
    const clock = ((m + 12 * 60) % DAY);
    ticks.push({ label: `${String(Math.floor(clock / 60)).padStart(2, '0')}:00`, at: frac(m) });
  }
  return {
    axisStart, axisEnd,
    bars: spans.map((s) => ({ date: s.date, top: frac(s.start), height: (s.end - s.start) / len })),
    avgBedtime: avgStart === null ? null : frac(avgStart),
    avgWake: avgEnd === null ? null : frac(avgEnd),
    goalBand: goalSpan ? { top: frac(goalSpan.start), height: (goalSpan.end - goalSpan.start) / len } : null,
    ticks,
  };
}
