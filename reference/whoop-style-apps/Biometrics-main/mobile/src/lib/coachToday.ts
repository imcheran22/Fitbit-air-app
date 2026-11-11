import type { TodayBarDTO, TodayMetric, TodaySummaryDTO } from '../api/coach';
import type { COLORS } from '../theme';

// The Coach page's today summary (spec 1.2): where each bar fills to, what
// colour it is, and the question a tap on it asks. Pure, so the rules are
// tested without rendering.
//
// Every question here is sent as a chat message, so each is worded to land on
// the right backend route (backend/src/coach/answer/route.ts): metric questions
// are personal ("my", "I") and name the metric, so they route to `today` or
// `sleep`; GENERAL_QUESTIONS name a topic with no personal word, so they route
// to `general`, where general-knowledge figures are allowed.

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Fraction of the track filled by today's value. */
export function barFill(bar: TodayBarDTO): number {
  return bar.scaleMax > 0 ? clamp01(bar.value / bar.scaleMax) : 0;
}

/** Fraction along the track of the 30-day usual tick, or null without a usual. */
export function tickPosition(bar: TodayBarDTO): number | null {
  if (bar.usual === null || bar.scaleMax <= 0) return null;
  return clamp01(bar.usual / bar.scaleMax);
}

export type BarColorKey = keyof Pick<(typeof COLORS)['light'], 'statusBelow' | 'statusNear' | 'statusAbove' | 'metricSleep'>;

// The server's status already accounts for resting HR (lower is better), so
// "below" is always the worse side: rose. Near usual is neutral, except sleep,
// which keeps its own violet.
export function barColorKey(bar: TodayBarDTO): BarColorKey {
  if (bar.status === 'below') return 'statusBelow';
  if (bar.status === 'above') return 'statusAbove';
  return bar.metric === 'sleep' ? 'metricSleep' : 'statusNear';
}

const METRIC_NAMES: Record<TodayMetric, string> = {
  recovery: 'recovery',
  sleep: 'sleep',
  hrv: 'HRV',
  rhr: 'resting heart rate',
};

/** The open question for a metric with nothing unusual to explain. */
function howQuestion(metric: TodayMetric): string {
  return metric === 'sleep' ? 'How did I sleep last night?' : `How's my ${METRIC_NAMES[metric]} looking today?`;
}

// "higher"/"lower" follows the number itself, not the status: resting HR above
// its usual is "below" (worse) but it is still higher. Sleep is last night's,
// and shorter/longer, as in the server's template sentence.
export function barQuestion(bar: TodayBarDTO): string {
  if (bar.status === null || bar.status === 'near' || bar.usual === null || bar.value === bar.usual) {
    return howQuestion(bar.metric);
  }
  const higher = bar.value > bar.usual;
  if (bar.metric === 'sleep') return `Why was my sleep ${higher ? 'longer' : 'shorter'} than usual last night?`;
  return `Why is my ${METRIC_NAMES[bar.metric]} ${higher ? 'higher' : 'lower'} than usual today?`;
}

/** The question an underlined word in the sentence asks. */
export function spanQuestion(metric: TodayMetric, bars: TodayBarDTO[]): string {
  const bar = bars.find((b) => b.metric === metric);
  return bar ? barQuestion(bar) : howQuestion(metric);
}

export const TRAINING_QUESTION = 'Should I train hard today?';

// Asked when there is no data yet, and the last suggestion otherwise. No
// personal words, so they route to `general`.
export const GENERAL_QUESTIONS = [
  'How much sleep do adults really need?',
  'What is HRV, and why does it matter?',
  'What helps the body recover after a hard workout?',
];

function distanceFromUsual(bar: TodayBarDTO): number {
  return bar.usual ? Math.abs(bar.value - bar.usual) / Math.abs(bar.usual) : 0;
}

// "What would you like to know?" (spec 1.3): up to two questions about the
// metrics furthest from usual -- the worse side first -- then training, then
// one general question. Before any data: general questions only.
export function suggestedQuestions(summary: TodaySummaryDTO | null): string[] {
  if (!summary || !summary.hasData || summary.bars.length === 0) return GENERAL_QUESTIONS;
  const off = summary.bars
    .filter((b) => b.status === 'below' || b.status === 'above')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'below' ? -1 : 1;
      return distanceFromUsual(b) - distanceFromUsual(a);
    });
  return [...off.slice(0, 2).map(barQuestion), TRAINING_QUESTION, GENERAL_QUESTIONS[0]!];
}
