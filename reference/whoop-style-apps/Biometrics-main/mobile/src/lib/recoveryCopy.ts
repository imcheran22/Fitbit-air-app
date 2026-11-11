// Every Recovery page string and the pure helpers behind them (spec §3). Components never inline copy.
import type { ColdStartDTO, ConfidenceLevel, DailyScoreDTO, FactorDTO, ScoreBandsDTO } from '../api/scores';
import type { RecoveryMonthDTO, RecoveryState } from '../api/recovery';
import { metricName, scoreBand, type ScoreBand } from './scoreInsights';

export type WeatherKey = 'clear' | 'mostlyClear' | 'cloudy' | 'stormy' | 'building' | 'none';

const BAND_WEATHER: Record<ScoreBand, WeatherKey> = { scoreExcellent: 'clear', scoreGood: 'mostlyClear', scoreFair: 'cloudy', scorePoor: 'stormy' };
export const BAND_WORD: Record<ScoreBand, string> = { scoreExcellent: 'Excellent', scoreGood: 'Good', scoreFair: 'Fair', scorePoor: 'Low' };
export const VERDICT: Record<WeatherKey, string> = {
  clear: 'Clear skies', mostlyClear: 'Mostly clear', cloudy: 'Cloudy', stormy: 'Stormy', building: 'Learning your weather', none: 'No reading',
};

/** A score's weather, by the Recovery page's bands (the user's, or the defaults). */
export function weatherForScore(score: number, bands?: ScoreBandsDTO): WeatherKey {
  return BAND_WEATHER[scoreBand(score, bands)];
}

export function weatherFor(score: number | null, state: RecoveryState, bands: ScoreBandsDTO): WeatherKey {
  if (state === 'NO_DATA') return 'none';
  if (score === null) return 'building';
  return weatherForScore(score, bands);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

// Civil dates are read without a timezone shift.
const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const local = (date: string) => { const [y, m, d] = parts(date); return new Date(y, m - 1, d); };
export const weekdayShort = (date: string) => WEEKDAYS[local(date).getDay()]!;
export const formatDayShort = (date: string) => { const dt = local(date); return `${WEEKDAYS[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`; };
/** "Thursday 2 October" for screen-reader labels. */
export const formatDayLong = (date: string) => { const dt = local(date); return `${WEEKDAYS_LONG[dt.getDay()]} ${dt.getDate()} ${MONTHS_LONG[dt.getMonth()]}`; };
const daysBetween = (a: string, b: string) => Math.round((local(b).getTime() - local(a).getTime()) / 86_400_000);

// Durations pad minutes ("2h 05m", a column of values lines up); goals don't ("7h 30m", read in a sentence).
// Intentional (spec §3.6): do not unify formatMinutes and formatGoal.
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${String(r).padStart(2, '0')}m`;
}
export const formatGoal = (min: number) => { const m = Math.round(min); const h = Math.floor(m / 60); const r = m % 60; return r === 0 ? `${h}h` : `${h}h ${r}m`; };

export function headerSubtitle(date: string, updatedAt: string | null, isToday: boolean): string {
  const day = formatDayShort(date);
  if (!isToday || !updatedAt) return day;
  const time = new Date(updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · updated ${time}`;
}

const CONFIDENCE: Record<ConfidenceLevel, string> = { HIGH: 'High confidence', MEDIUM: 'Medium confidence', LOW: 'Low confidence' };
const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
/** "Thursday" for screen-reader labels. */
export const weekdayLong = (date: string) => WEEKDAYS_LONG[local(date).getDay()]!;

// The visible line is `band + lead + confidence` (`rest` is `lead + confidence`); the parts are returned on their
// own so a component can colour the band and confidence words without re-deriving or inlining copy.
// `spoken` is the same line for a screen reader (spec §7): "Up 6 from yesterday. High confidence."
// `namesYesterday` (default true) reads a one-day gap as "yesterday"; false names its weekday instead (the Sleep page
// says "yesterday" only when the day shown is today).
export function heroLine(p: {
  score: number; bands?: ScoreBandsDTO | null; date: string; previous: { date: string; score: number } | null; confidence: ConfidenceLevel;
  namesYesterday?: boolean;
}): { band: string; rest: string; lead: string; delta: string; confidence: string; spoken: string } {
  const band = BAND_WORD[scoreBand(p.score, p.bands)];
  let delta = '';
  let spokenDelta = '';
  if (p.previous) {
    const gap = daysBetween(p.previous.date, p.date);
    if (gap >= 1 && gap <= 7) {
      const d = Math.round(p.score) - Math.round(p.previous.score);
      const said = d === 0 ? 'Same as' : `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} from`;
      const yesterday = gap === 1 && p.namesYesterday !== false;
      const shown = yesterday ? 'yesterday' : weekdayShort(p.previous.date);
      delta = d === 0 ? ` · same as ${shown}` : ` · ${signed(d)} vs ${shown}`;
      spokenDelta = `${said} ${yesterday ? 'yesterday' : weekdayLong(p.previous.date)}. `;
    }
  }
  const confidence = CONFIDENCE[p.confidence];
  const lead = `${delta} · `;
  return { band, rest: `${lead}${confidence}`, lead, delta, confidence, spoken: `${spokenDelta}${confidence}.` };
}

const NEGLIGIBLE_POINTS = 0.5;
type Tense = { present: string; past: string };
const LIFT: Partial<Record<FactorDTO['factor'], Tense>> = {
  HRV: { present: 'A warm front in your HRV is lifting you today.', past: 'A warm front in your HRV lifted you that day.' },
  RHR: { present: 'A calm resting heart rate is lifting you today.', past: 'A calm resting heart rate lifted you that day.' },
  SLEEP_DEBT: { present: 'Clear air: your sleep debt is lighter than usual.', past: 'Clear air: your sleep debt was lighter than usual.' },
};
const DRAG: Partial<Record<FactorDTO['factor'], Tense>> = {
  HRV: { present: 'A cold front in your HRV is holding you back.', past: 'A cold front in your HRV held you back.' },
  RHR: { present: 'A gusty resting heart rate is holding you back.', past: 'A gusty resting heart rate held you back.' },
};
const fog = (light: boolean, past: boolean) =>
  `${light ? 'Light s' : 'S'}leep-debt fog ${past ? 'lingered; an early night would have cleared it.' : 'lingers; an early night clears it.'}`;

export function buildRecoverySummary(score: DailyScoreDTO, past: boolean): string {
  const active = score.factors.filter((x) => !x.excluded);
  const lift = [...active].sort((a, b) => b.points - a.points)[0];
  const drag = [...active].sort((a, b) => a.points - b.points)[0];
  const out: string[] = [];
  if (lift && lift.points >= NEGLIGIBLE_POINTS && LIFT[lift.factor]) out.push(LIFT[lift.factor]![past ? 'past' : 'present']);
  if (drag && drag.points <= -NEGLIGIBLE_POINTS) {
    if (drag.factor === 'SLEEP_DEBT') out.push(fog(Math.abs(drag.points) < 3, past));
    else if (DRAG[drag.factor]) out.push(DRAG[drag.factor]![past ? 'past' : 'present']);
  }
  if (out.length === 0) out.push(past ? 'Calm conditions: everything was close to your usual.' : 'Calm conditions: everything is close to your usual.');
  if (score.confidenceLevel === 'LOW') out.push(past ? 'Some readings were missing, so treat that day as a rough read.' : 'Some readings are missing, so treat today as a rough read.');
  return out.join(' ');
}

export function buildingCopy(cold: ColdStartDTO): { numeral: string; line: string; summary: string } {
  const left = Math.max(0, cold.daysRequired - cold.daysCollected);
  return {
    numeral: `Day ${cold.daysCollected} of ${cold.daysRequired}`,
    line: `Your forecast is charging up · ${left} ${left === 1 ? 'day' : 'days'} to go`,
    summary: `We need ${left} more ${left === 1 ? 'day' : 'days'} of ${metricName(cold.metric)} to read your weather. Keep wearing your watch to bed.`,
  };
}

export const noDataLine = (isToday: boolean) => (isToday ? "Waiting for last night's data" : 'No data synced for this day');

export function debtBlockCount(debt: number, usualHigh: number | null): number {
  return Math.min(16, Math.max(8, Math.ceil(Math.max(debt, usualHigh ?? 0) / 30) + 1));
}
export function debtBlocks(debt: number, usualHigh: number | null): Array<'full' | 'partial' | 'empty'> {
  const n = debtBlockCount(debt, usualHigh);
  const full = Math.min(n, Math.floor(debt / 30));
  const partial = full < n && debt - full * 30 >= 10 ? 1 : 0;
  return Array.from({ length: n }, (_, i) => (i < full ? 'full' : i < full + partial ? 'partial' : 'empty'));
}

// Points rounded half away from zero, so a factor at exactly ±0.5 shows ±1, never "Fog · 0": the word, the tone
// and the number all come from this one rounded value (|n| >= 1 exactly when |points| >= NEGLIGIBLE_POINTS).
export function debtFactor(points: number): { tone: 'drag' | 'lift' | 'calm'; text: string } {
  const n = Math.sign(points) * Math.round(Math.abs(points));
  const tone = n < 0 ? 'drag' : n > 0 ? 'lift' : 'calm';
  const word = tone === 'drag' ? 'Fog' : tone === 'lift' ? 'Clear' : 'Calm';
  return { tone, text: `${word} · ${n === 0 ? '0' : signed(n)}` };
}

export function debtClearCopy(nights: number | null, goalMinutes: number): string {
  if (nights === null) return '';
  if (nights === 0) return "You're within your usual.";
  const goal = formatGoal(goalMinutes);
  if (nights === 1) return `One night at your ${goal} goal clears the fog.`;
  return `${NUMBER_WORDS[nights] ?? nights} nights at your ${goal} goal clear the fog.`;
}

export function monthCaption(c: RecoveryMonthDTO['counts']): string {
  const bits = [c.excellent ? `${c.excellent} Excellent` : '', c.low ? `${c.low} Low` : ''].filter(Boolean);
  return bits.length ? `month average · ${bits.join(', ')}` : 'month average';
}
export function monthTitle(month: string, today: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS_LONG[m! - 1]!;
  return String(y) === today.slice(0, 4) ? name : `${name} ${y}`;
}
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(y!, m! - 1 + by, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function initialChip(goalMinutes: number | undefined): 6 | 7 | 8 | 9 {
  if (goalMinutes === undefined) return 8;
  return Math.min(9, Math.max(6, Math.round(goalMinutes / 60))) as 6 | 7 | 8 | 9;
}

export const RECOVERY_COPY = {
  title: 'Recovery',
  back: 'Back',
  info: 'How the score works',
  infoTitle: 'How the score works',
  infoHow: (w: { HRV: number; RHR: number; SLEEP_DEBT: number }) =>
    `Each day starts at 50. HRV, resting heart rate and sleep debt move it up or down against your own usual, weighted ${Math.round(w.HRV * 100)} / ${Math.round(w.RHR * 100)} / ${Math.round(w.SLEEP_DEBT * 100)}.`,
  infoBands: (b: ScoreBandsDTO) => [
    `Clear skies · Excellent · ${b.excellent} and up`,
    `Mostly clear · Good · ${b.good}–${b.excellent - 1}`,
    `Cloudy · Fair · ${b.fair}–${b.good - 1}`,
    `Stormy · Low · under ${b.fair}`,
  ],
  lastSevenDays: 'Last 7 days',
  today: 'Today',
  sleepAndStreak: 'Sleep and streak',
  debtEyebrow: (n: number) => `Sleep debt · ${n} nights`,
  debtOwed: (usualHigh: number | null) => (usualHigh === null ? 'owed' : `owed · usual under ${formatMinutes(usualHigh)}`),
  debtCaption: (clear: string) => (clear ? `Each block is 30 min. ${clear}` : 'Each block is 30 min.'),
  debtNone: 'No sleep data in the last 14 nights',
  lastNight: 'Last night',
  lastNightA11y: (duration: string) => `Last night, ${duration}. Opens the night.`,
  lastNightCaption: (deep: number, rem: number) => `Deep ${formatMinutes(deep)} · REM ${formatMinutes(rem)}`,
  noStages: 'No stage data',
  noSleep: 'No sleep recorded',
  streak: 'Clear streak',
  streakUnit: (n: number) => (n === 1 ? 'day' : 'days'),
  streakCaption: (best: number, hasHistory: boolean) => (hasHistory ? `Good or better · best run ${best}` : 'Good or better days in a row'),
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  calendarHint: 'Tap a day to see its conditions.',
  monthError: (name: string) => `Couldn't load ${name}.`,
  retry: 'Retry',
  weekdayHeader: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  tomorrow: "Tomorrow's forecast",
  loadError: "Couldn't load your recovery.",
  futureError: "That day hasn't happened yet.",
  tryAgain: 'Try again',
  askToday: (coach: string) => `Ask ${coach} about today`,
  askPast: (coach: string) => `Ask ${coach} about this day`,
  noReading: 'No reading',
  // BUILDING with no cold-start progress to count down from.
  buildingLine: 'Your forecast is charging up',
  cellLabel: (date: string, score: number | null, band: string | null) =>
    score === null ? `${formatDayLong(date)}, No reading` : `${formatDayLong(date)}, ${Math.round(score)}, ${band}`,
  heroA11y: (score: number, band: string, verdict: string, spoken: string) => `Recovery ${Math.round(score)}, ${band}, ${verdict.toLowerCase()}. ${spoken}`,
} as const;
