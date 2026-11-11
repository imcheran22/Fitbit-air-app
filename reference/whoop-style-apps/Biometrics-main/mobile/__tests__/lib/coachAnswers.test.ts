import type { AnswerCardDTO } from '../../src/api/coach';
import { cardDestination, followUpsFor } from '../../src/lib/coachAnswers';

function card(...factIds: string[]): AnswerCardDTO {
  return {
    headline: 'h',
    tiles: factIds.map((factId) => ({ factId, label: factId, display: '1', value: 1 })),
    source: 's',
  };
}

const SLEEP_CHIPS = ["What's been affecting my sleep lately?", "How's my sleep this week?"];
const RECOVERY_CHIPS = ['Should I train today?', 'What moved my recovery?'];

describe('followUpsFor', () => {
  it('follows the first fact on the card', () => {
    expect(followUpsFor(card('sleep.total', 'recovery.today'))).toEqual(SLEEP_CHIPS);
    expect(followUpsFor(card('recovery.today'))).toEqual(RECOVERY_CHIPS);
    expect(followUpsFor(card('hrv.today'))).toEqual(["What's been affecting my HRV lately?", "How's my HRV this week?"]);
    expect(followUpsFor(card('rhr.today'))).toEqual(["What's been moving my resting heart rate lately?", "How's my resting heart rate this week?"]);
    expect(followUpsFor(card('steps.today'))).toEqual(['How have my steps been this week?']);
  });

  it('asks how sure a habit finding is, from a ranked card', () => {
    const ranked: AnswerCardDTO = { headline: 'h', ranked: [{ factId: 'habit.caffeine_late', label: 'Caffeine', display: '−8', value: -8 }], source: 's' };
    expect(followUpsFor(ranked)).toEqual(['How sure is that?', 'Which habit should I change first?']);
  });

  it('brings a general answer back to the user, and falls back for an unknown fact', () => {
    expect(followUpsFor(undefined)).toEqual(['How does that apply to me?']);
    expect(followUpsFor(card('goal.steps'))).toEqual(['How does that apply to me?']);
  });

  // The server's fact sheet names the sleep score 'sleep_score.today'.
  it('treats the sleep score fact as sleep', () => {
    expect(followUpsFor(card('sleep_score.today'))).toEqual(SLEEP_CHIPS);
  });

  // Score drivers are 'factor.<key>' for both scores; the key says which.
  it('places a score driver with the score it drives', () => {
    for (const key of ['hrv', 'rhr', 'sleep_debt']) expect(followUpsFor(card(`factor.${key}`))).toEqual(RECOVERY_CHIPS);
    for (const key of ['sleep_duration', 'sleep_efficiency', 'circadian_consistency']) expect(followUpsFor(card(`factor.${key}`))).toEqual(SLEEP_CHIPS);
    expect(followUpsFor(card('factor.mystery'))).toEqual(['How does that apply to me?']);
  });

  it('drops a chip that repeats the question just asked', () => {
    expect(followUpsFor(card('recovery.today'), '  should I TRAIN today? ')).toEqual(['What moved my recovery?']);
    expect(followUpsFor(card('recovery.today'), 'How did I sleep?')).toEqual(RECOVERY_CHIPS);
  });
});

describe('cardDestination', () => {
  it('opens the Recovery page for recovery and the Sleep page for sleep, on the given day', () => {
    expect(cardDestination(card('recovery.today'), '2026-09-30')).toEqual({ name: 'Recovery', params: { date: '2026-09-30' } });
    expect(cardDestination(card('sleep.total'), '2026-09-30')).toEqual({ name: 'Sleep', params: { date: '2026-09-30' } });
    expect(cardDestination(card('sleep_score.today'), '2026-09-30')).toEqual({ name: 'Sleep', params: { date: '2026-09-30' } });
  });

  it('opens the score a driver belongs to', () => {
    expect(cardDestination(card('factor.sleep_debt'), '2026-09-30')).toEqual({ name: 'Recovery', params: { date: '2026-09-30' } });
    expect(cardDestination(card('factor.circadian_consistency'), '2026-09-30')).toEqual({ name: 'Sleep', params: { date: '2026-09-30' } });
    expect(cardDestination(card('factor.mystery'), '2026-09-30')).toEqual({ name: 'Trends', params: undefined });
  });

  // The Recovery and Sleep pages open on their default day without a date.
  it('opens Recovery on today, and the Sleep page on its default night, when there is no date', () => {
    expect(cardDestination(card('recovery.today'), '')).toEqual({ name: 'Recovery', params: undefined });
    expect(cardDestination(card('sleep.total'), '')).toEqual({ name: 'Sleep', params: undefined });
    expect(cardDestination(card('habit.walk'), '')).toEqual({ name: 'Patterns', params: undefined });
  });

  it('opens Patterns for habits and Trends for HRV, resting HR and anything else', () => {
    expect(cardDestination(card('habit.walk'), '2026-09-30')).toEqual({ name: 'Patterns', params: undefined });
    expect(cardDestination(card('hrv.today'), '2026-09-30')).toEqual({ name: 'Trends', params: undefined });
    expect(cardDestination(card('rhr.today'), '2026-09-30')).toEqual({ name: 'Trends', params: undefined });
    expect(cardDestination(card('steps.today'), '2026-09-30')).toEqual({ name: 'Trends', params: undefined });
    expect(cardDestination(card('goal.steps'), '2026-09-30')).toEqual({ name: 'Trends', params: undefined });
  });
});
