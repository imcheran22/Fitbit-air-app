// Every Sleep page string and the pure helpers behind them (spec 2026-10-09 one-sleep-page §3, §7). Components never
// inline copy. Civil dates are read by their components, never as UTC instants.
import type { ColdStartDTO, ConfidenceLevel, FactorDTO, ScoreBandsDTO } from '../api/scores';
import type { SleepGoal } from '../api/sleep';
import { addDays } from './heatmap';
import { formatDayLong, formatDayShort, formatGoal, heroLine, weekdayLong, weekdayShort } from './recoveryCopy';
import { DEFAULT_SCORE_BANDS, scoreBand, type ScoreBand } from './scoreInsights';
import { formatClock, formatDuration, formatShortDuration, formatTextDuration } from './sleepStats';
import { spokenUnits } from './spokenUnits';
import type { WindDownSettings } from './windDown';

export const SHORT_NIGHT_MINUTES = 60;

const BAND_VERDICT: Record<ScoreBand, string> = {
  scoreExcellent: 'Restful night', scoreGood: 'Solid night', scoreFair: 'Restless night', scorePoor: 'Rough night',
};

/** "7 hours 12 minutes" for screen readers. */
const spoken = (minutes: number) => spokenUnits(formatTextDuration(minutes));
/** "8 hour" / "7 hour 30 minute", the goal used as an adjective. */
const spokenGoal = (minutes: number) => spokenUnits(formatGoal(minutes)).replace(/(\d+) hours/, '$1 hour').replace(/(\d+) minutes/, '$1 minute');

/** Decision 6: the band's verdict, unless main sleep is 60+ minutes under the goal (quantity only, any band). */
export function sleepVerdict(p: { score: number; bands?: ScoreBandsDTO | null; mainMinutes: number | null; goalMinutes: number | null }): string {
  if (p.mainMinutes !== null && p.goalMinutes !== null && p.goalMinutes - p.mainMinutes >= SHORT_NIGHT_MINUTES) return 'Short night';
  return BAND_VERDICT[scoreBand(p.score, p.bands)];
}

/**
 * The hero line `band + lead + confidence` (spec §3.2), returned in parts so the hero can colour the band and a Low
 * confidence without inlining copy. Recovery's heroLine, except "vs yesterday" only when D is today (plan ruling 8).
 */
export function sleepHeroLine(p: {
  score: number; bands?: ScoreBandsDTO | null; date: string; today: string;
  previous: { date: string; score: number } | null; confidence: ConfidenceLevel;
}): { band: string; lead: string; confidence: string; text: string; spoken: string } {
  const l = heroLine({ ...p, namesYesterday: p.date === p.today });
  return { band: l.band, lead: l.lead, confidence: l.confidence, text: `${l.band}${l.rest}`, spoken: l.spoken };
}

export const heroA11y = (score: number, band: string, verdict: string, spokenLine: string) =>
  `Sleep score ${Math.round(score)}, ${band}, ${verdict.toLowerCase()}. ${spokenLine}`;

export function buildingHero(cold: ColdStartDTO | null): { numeral: string; verdict: string; line: string | null; spoken: string } {
  if (!cold) return { numeral: '—', verdict: 'Learning your sleep', line: null, spoken: 'Learning your sleep' };
  const left = Math.max(0, cold.daysRequired - cold.daysCollected);
  const numeral = `Night ${cold.daysCollected} of ${cold.daysRequired}`;
  const line = `${left} ${left === 1 ? 'night' : 'nights'} to go`;
  return { numeral, verdict: 'Learning your sleep', line, spoken: `Learning your sleep. ${numeral}. ${line}.` };
}

/** A night with no score row: on its way for today and yesterday (the score lands after the sync). */
export function noScoreHero(date: string, today: string): { verdict: string; line: string | null } {
  return date === today || date === addDays(today, -1)
    ? { verdict: 'Score on its way', line: 'It appears a few minutes after your watch syncs' }
    : { verdict: 'No score for this night', line: null };
}

export function noNightHero(p: { isToday: boolean; napOnly: boolean }): { verdict: string; line: string } {
  const line = p.napOnly ? 'Only a nap was recorded' : p.isToday ? "Waiting for last night's data" : 'Nothing synced for this night';
  return { verdict: 'No sleep recorded', line };
}

export const nightEyebrow = (date: string, today: string) => (date === today ? `Last night · ${formatDayShort(date)}` : formatDayShort(date));

/** "asleep", or the with-naps total beside main sleep (spec §3.4). */
export function durationCaption(mainMinutesAsleep: number, napMinutes: number[]): string {
  const naps = napMinutes.filter((m) => m > 0);
  if (naps.length === 0) return 'asleep';
  const total = mainMinutesAsleep + naps.reduce((sum, m) => sum + m, 0);
  return `main sleep · ${formatDuration(total)} with ${naps.length === 1 ? 'a nap' : 'naps'}`;
}

export function usualPart(mainMinutesAsleep: number, usual: number | null): string | null {
  if (usual === null) return null;
  const diff = Math.round(mainMinutesAsleep - usual);
  if (diff === 0) return 'same as your usual';
  return `${diff > 0 ? '+' : '−'}${formatShortDuration(Math.abs(diff))} vs your usual`;
}

export function goalPart(mainMinutesAsleep: number, goal: number): string {
  const diff = Math.round(mainMinutesAsleep - goal);
  const g = formatGoal(goal);
  if (Math.abs(diff) < 5) return `right on your ${g} goal`;
  return diff < 0 ? `${formatShortDuration(-diff)} short of your ${g} goal` : `${formatShortDuration(diff)} over your ${g} goal`;
}

export function summaryLine(p: { bedtime: string; wakeTime: string; mainMinutes: number; usual: number | null; goal: number | null }): string {
  return [
    `${formatClock(p.bedtime)} → ${formatClock(p.wakeTime)}`,
    usualPart(p.mainMinutes, p.usual),
    p.goal === null ? null : goalPart(p.mainMinutes, p.goal),
  ].filter(Boolean).join(' · ');
}

export function summaryA11y(p: { date: string; mainMinutes: number; bedtime: string; wakeTime: string; usual: number | null; goal: number | null }): string {
  const bits = [`Night ending ${formatDayLong(p.date)}.`, `${spoken(p.mainMinutes)} asleep.`, `${formatClock(p.bedtime)} to ${formatClock(p.wakeTime)}.`];
  if (p.usual !== null) {
    const d = Math.round(p.mainMinutes - p.usual);
    bits.push(d === 0 ? 'Same as usual.' : `${spoken(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than usual.`);
  }
  if (p.goal !== null) {
    const d = Math.round(p.mainMinutes - p.goal);
    bits.push(Math.abs(d) < 5 ? `Right on your ${spokenGoal(p.goal)} goal.` : `${spoken(Math.abs(d))} ${d < 0 ? 'short of' : 'over'} your ${spokenGoal(p.goal)} goal.`);
  }
  return bits.join(' ');
}

/** The summary when D has no night, or only a nap, read as one element (no "·" and no unit letters). */
export const noNightSummaryA11y = (date: string) => `Night ending ${formatDayLong(date)}. ${SLEEP_COPY.noSleepForNight}`;
export const napOnlySummaryA11y = (date: string, minutes: number, at: string) =>
  `Night ending ${formatDayLong(date)}. Only a nap, ${spoken(minutes)} at ${formatClock(at)}.`;

/** 432 -> "7:12": picker and month cells. */
export function formatHm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// The same 75 / 50 thresholds as the old regularity coach lines (spec §3.10). "Regularity", never "consistency".
export const regularityWord = (score: number) => (score >= 75 ? 'Very regular' : score >= 50 ? 'Fairly regular' : 'Irregular');

export function spreadLine(bedtime: number | null, wake: number | null): string | null {
  const bits = [bedtime === null ? null : `Bedtime ±${Math.round(bedtime)}m`, wake === null ? null : `Wake ±${Math.round(wake)}m`].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

/** The card before there are enough nights for a score (the visible label carries a "·"). */
export const regularityPendingA11y = (nightsToGo: number) => `${SLEEP_COPY.regularityLabel.replace(' · ', ', ')}. ${SLEEP_COPY.notEnoughNights(nightsToGo)}`;

export function regularityA11y(score: number, word: string, bedtime: number | null, wake: number | null): string {
  let out = `Regularity ${Math.round(score)}, ${word.toLowerCase()}.`;
  if (bedtime !== null) out += ` Bedtime varies by ${spoken(Math.round(bedtime))}.`;
  if (wake !== null) out += ` Wake time varies by ${spoken(Math.round(wake))}.`;
  return out;
}

/** The board's goal row (spec §3.12). The reminder needs a bedtime, so it is only mentioned once one is set. */
export function goalRowLine(goal: SleepGoal, reminder: WindDownSettings | null): string {
  const g = formatGoal(goal.sleepGoalMinutes);
  if (!goal.bedtimeGoal && !goal.wakeGoal) return `Set a bedtime goal · ${g}`;
  const bits = [goal.bedtimeGoal ? `Bed ${formatClock(goal.bedtimeGoal)}` : null, goal.wakeGoal ? `Wake ${formatClock(goal.wakeGoal)}` : null, g];
  if (goal.bedtimeGoal && reminder) bits.push(reminder.enabled ? `Reminder ${reminder.leadMinutes} min before` : 'Reminder off');
  return bits.filter(Boolean).join(' · ');
}

export const goalRowA11y = (line: string) => `Bedtime goal. ${spokenUnits(line.split(' · ').join(', '))}.`;

export const askLabel = (coach: string, isLastNight: boolean) => (isLastNight ? `Ask ${coach} about last night` : `Ask ${coach} about this night`);

export const pickerWeekday = (date: string, today: string) => (date === today ? 'Last' : weekdayShort(date));

export function pickerCellLabel(p: { date: string; today: string; minutes: number | null; band: string | null }): string {
  const bits = [weekdayLong(p.date)];
  if (p.date === p.today) bits.push('last night');
  if (p.minutes === null) bits.push('no sleep recorded');
  else {
    bits.push(spoken(p.minutes));
    if (p.band) bits.push(p.band);
  }
  return bits.join(', ');
}

export const monthCellLabel = (date: string, minutes: number | null) =>
  `${formatDayLong(date)}, ${minutes === null ? 'no sleep recorded' : spoken(minutes)}`;

/** The weights this night's score used (plan ruling 9); excluded factors are left out. */
export function infoWeights(factors: FactorDTO[]): string | null {
  const used = factors.filter((f) => !f.excluded && f.weight > 0);
  if (used.length === 0) return null;
  return `This night weighted ${used.map((f) => `${f.label.toLowerCase()} ${Math.round(f.weight * 100)}`).join(', ')}.`;
}

export function infoBands(bands?: ScoreBandsDTO | null): string[] {
  const b = bands ?? DEFAULT_SCORE_BANDS;
  return [
    `Restful night · Excellent · ${b.excellent} and up`,
    `Solid night · Good · ${b.good}–${b.excellent - 1}`,
    `Restless night · Fair · ${b.fair}–${b.good - 1}`,
    `Rough night · Low · under ${b.fair}`,
    'Short night · 1h or more under your goal, on any band',
  ];
}

export const SLEEP_COPY = {
  title: 'Sleep',
  back: 'Back',
  info: 'How the score works',
  infoTitle: 'How the score works',
  infoHow: 'Each night is scored on how long you slept against your goal, and on sleep efficiency and bedtime consistency against your own usual.',
  bedtimeGoal: 'Bedtime goal',
  stillSyncing: (syncing: boolean) => (syncing ? "Last night isn't in yet. Syncing…" : "Last night isn't in yet."),
  backfill: 'Reading older nights…',
  windowError: 'Your nights could not be loaded.',
  nightError: 'This night could not be loaded.',
  goalError: 'Your bedtime goal could not be loaded.',
  regularityError: 'Sleep regularity could not be loaded.',
  tryAgain: 'Try again',
  noSleepForNight: 'No sleep recorded for this night.',
  onlyNap: (minutes: number, at: string) => `Only a nap: ${formatShortDuration(minutes)} at ${formatClock(at)}`,
  stagesLabel: 'Sleep stages',
  theNight: 'The night',
  timeInBed: 'Time in bed',
  timeAwake: 'Time awake',
  timeToFallAsleep: 'Time to fall asleep',
  afterWaking: 'After waking',
  naps: 'Naps',
  napsNone: 'None',
  napRow: (minutes: number, at: string) => `${formatShortDuration(minutes)} at ${formatClock(at)}`,
  stepsThatDay: 'Steps that day',
  bedtimeToWake: 'Bedtime to wake',
  rangeWeek: 'Week',
  rangeTwoWeeks: '2 weeks',
  selectedSuffix: ', selected',
  // The chart with no bars: nothing has ever synced, or this range has no main nights (naps only count as none).
  windowEmptyNoSleep: 'No sleep synced yet.',
  windowEmptyRange: 'No bedtimes recorded in this range.',
  weekdayInitial: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  regularityLabel: 'Regularity · 7 nights',
  notEnoughNights: (n: number) => `Not enough nights yet. ${n} more to go.`,
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  monthError: (name: string) => `Couldn't load ${name}.`,
  retry: 'Retry',
  weekdayHeader: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  statAverage: 'Average asleep',
  statAtGoal: 'Nights at goal',
  statBedtime: 'Average bedtime',
  statLongest: 'Longest night',
  nightsAtGoal: (atGoal: number, nights: number) => `${atGoal} of ${nights}`,
  noValue: '—',
} as const;
