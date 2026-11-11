import type { AnswerCardDTO } from '../api/coach';

// What surrounds an answer card: the follow-up chips under it and where its
// source line leads. Both key off the fact ids the server put on the card
// ('sleep.total', 'habit.caffeine_late', ...): the part before the dot names
// the area. Fact ids are stable; the card's `source` text is display copy
// and is not keyed on. The stream carries no follow-ups of its own, so they
// are chosen here from that area.

// Fact areas that belong with another: the sleep score is about sleep.
const AREA_ALIASES: Record<string, string> = { sleep_score: 'sleep' };

// Score drivers are 'factor.<key>' for both scores (backend todayFacts); the
// key names the score it drives (backend scoring/pipeline.ts factor inputs).
const FACTOR_AREA: Record<string, string> = {
  hrv: 'recovery',
  rhr: 'recovery',
  sleep_debt: 'recovery',
  sleep_duration: 'sleep',
  sleep_efficiency: 'sleep',
  circadian_consistency: 'sleep',
};

function firstArea(card: AnswerCardDTO | undefined): string | null {
  const first = card?.tiles?.[0] ?? card?.ranked?.[0];
  if (!first) return null;
  const [area, key] = first.factId.split('.');
  if (area === 'factor') return (key && FACTOR_AREA[key]) || null;
  return AREA_ALIASES[area!] ?? area!;
}

// Each is sent as a chat message, so each must route as intended on the
// server (backend/src/coach/answer/route.ts; pinned in
// backend/tests/coach/answerRoute.test.ts). The "lately"/"this week" chips
// reach the trends sheet, where the habit evidence lives. "How sure is that?"
// has no topic of its own and inherits the habit question it follows.
const FOLLOW_UPS: Record<string, string[]> = {
  sleep: ["What's been affecting my sleep lately?", "How's my sleep this week?"],
  recovery: ['Should I train today?', 'What moved my recovery?'],
  hrv: ["What's been affecting my HRV lately?", "How's my HRV this week?"],
  rhr: ["What's been moving my resting heart rate lately?", "How's my resting heart rate this week?"],
  steps: ['How have my steps been this week?'],
  habit: ['How sure is that?', 'Which habit should I change first?'],
};

// A general (card-less) answer gets one chip that brings it back to the user.
const GENERAL_FOLLOW_UP = ['How does that apply to me?'];

const sameQuestion = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// `previousQuestion` is the user's last message: a chip repeating it is dropped.
export function followUpsFor(card: AnswerCardDTO | undefined, previousQuestion?: string): string[] {
  const area = firstArea(card);
  const chips = (area && FOLLOW_UPS[area]) || GENERAL_FOLLOW_UP;
  return previousQuestion === undefined ? chips : chips.filter((chip) => !sameQuestion(chip, previousQuestion));
}

export type CardDestination =
  | { name: 'Recovery'; params: { date?: string } | undefined }
  | { name: 'Sleep'; params: { date: string } | undefined }
  | { name: 'Patterns'; params: undefined }
  | { name: 'Trends'; params: undefined };

const TRENDS_SCREEN: CardDestination = { name: 'Trends', params: undefined };

// The source line opens the screen that holds the underlying data. HRV and
// resting HR have no stack screen that loads itself (MetricDetail needs the
// series passed in), so they open the Trends screen. A sleep card opens the
// Sleep page on that day, else its default night; the Recovery page opens on
// today without a day (the today summary failed to load).
export function cardDestination(card: AnswerCardDTO, date: string): CardDestination {
  switch (firstArea(card)) {
    case 'recovery':
      return { name: 'Recovery', params: date ? { date } : undefined };
    case 'sleep':
      return { name: 'Sleep', params: date ? { date } : undefined };
    case 'habit':
      return { name: 'Patterns', params: undefined };
    default:
      return TRENDS_SCREEN;
  }
}
