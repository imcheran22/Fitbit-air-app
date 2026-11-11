// Every new Activity string (spec 2026-10-13 §1). Components never inline copy.

import { formatDayTitle, formatLongDay, MONTH_LONG, MONTH_SHORT } from './heatmap';
import { VERDICT, type WeatherKey } from './recoveryCopy';
import { formatDuration } from './sleepStats';
import { METRIC_CONFIG } from '../theme';

const steps = (n: number) => METRIC_CONFIG.STEPS.format(n);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cellDay = (date: string) => `${MONTH_SHORT[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
const verdict = (weather: WeatherKey) => VERDICT[weather].toLowerCase();

export type CalendarTab = 'steps' | 'sleep' | 'recovery';

const PER_DAY: Record<CalendarTab, string> = { steps: 'Steps per day', sleep: 'Sleep per night', recovery: 'Recovery per day' };

export const ACTIVITY_COPY = {
  title: 'Activity',
  kipLabel: 'Your KIP, waving',
  error: 'Your activity could not be loaded.',
  retry: 'Try again',
  summary: (s: { steps: number; nights: number }) => `Last 7 days · ${steps(s.steps)} steps · ${plural(s.nights, 'night')}`,

  week: {
    label: 'This week',
    hint: 'Tap a day · moon opens Sleep',
    columns: { day: 'Day', recovery: 'Recovery', sleepSteps: 'Sleep · steps' },
    empty: '—',
    error: 'This week could not be loaded.',
    rowLabel: (r: { date: string; recovery: number | null; weather: WeatherKey | null; sleepMinutes: number | null; steps: number | null }) =>
      [
        formatLongDay(r.date),
        r.recovery === null || r.weather === null ? 'no recovery score' : `recovery ${r.recovery}, ${verdict(r.weather)}`,
        r.sleepMinutes === null ? 'no sleep recorded' : `slept ${formatDuration(r.sleepMinutes)}`,
        r.steps === null ? 'no steps recorded' : `${steps(r.steps)} steps`,
      ].join(', '),
    rowHint: 'Opens Recovery for this day',
    moonLabel: (date: string) => `Open ${formatLongDay(date).split(' ')[0]}'s night in Sleep`,
  },

  tabs: { steps: 'Steps', sleep: 'Sleep', recovery: 'Recovery' } as Record<CalendarTab, string>,
  tabsLabel: 'Metric',
  legend: { less: 'Less', more: 'More', noData: 'No data', recovery: 'Recovery' },
  cellLabel: (tab: CalendarTab, date: string, value: number | null, recovery: { score: number; weather: WeatherKey } | null) => {
    const day = cellDay(date);
    if (tab === 'recovery') return value === null || !recovery ? `${day}: no recovery score` : `${day}: recovery ${recovery.score}, ${verdict(recovery.weather)}`;
    const what = value === null ? 'no data' : tab === 'steps' ? `${steps(value)} steps` : `${formatDuration(value)} asleep`;
    return recovery ? `${day}: ${what}, recovery ${recovery.score} ${verdict(recovery.weather)}` : `${day}: ${what}`;
  },
  gridLabel: (tab: CalendarTab, range: string) => `${ACTIVITY_COPY.tabs[tab]} for ${range}`,
  sleepError: 'Your sleep could not be loaded.',
  recoveryError: 'Your recovery could not be loaded.',
  recoveryWindow: (days: number) => `Recovery shows your last ${days} days.`,
  views: { month: 'Month', year: 'Year', ytd: 'YTD' },
  rangeTitle: { year: 'Last 12 months', ytd: (year: string) => `${year} year to date` },
  rangeLabel: { year: 'the last 12 months', ytd: (year: string) => `${year} so far` },
  prevMonth: 'Previous month',
  nextMonth: 'Next month',

  stats: {
    label: 'This month',
    total: 'Total',
    average: 'Daily avg',
    nightlyAverage: 'Nightly avg',
    activeDays: 'Active days',
    nights: 'Nights',
    goalStreak: 'Goal streak',
    bestDay: 'Best day',
    longest: 'Longest night',
    bestDate: 'Best date',
    recAverage: 'Average',
    scored: 'Days scored',
    clear: 'Clear days',
    stormy: 'Stormy days',
    none: '--',
    days: (n: number) => plural(n, 'day'),
    nightsCount: (n: number) => plural(n, 'night'),
    hours: (minutes: number) => `${Math.round(minutes / 60).toLocaleString('en-US')}h`,
    /** "Sat, Oct 4". */
    date: (date: string) => formatDayTitle(date).replace(/, \d{4}$/, ''),
  },

  year: {
    total: 'Total',
    average: 'Daily avg',
    goalDays: 'Goal days',
    goalNights: 'Goal nights',
    error: 'Your year could not be loaded.',
    gridTitle: (year: string, metric: CalendarTab) => `${year} so far · ${PER_DAY[metric].toLowerCase()}`,
    gridLabel: (metric: CalendarTab, today: string) => `${PER_DAY[metric]}, January to ${MONTH_LONG[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`,
  },

  usual: { label: 'Against your usual · 30d', patterns: 'Patterns', allTrends: 'All trends', none: '—' },
};

/** "2.49M", "93,413": the year's step total, kept short. */
export function compactSteps(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return steps(n);
}
